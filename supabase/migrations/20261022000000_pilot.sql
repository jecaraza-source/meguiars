-- F5.2 — Piloto Centro 1 y rollout a Centro 2+.
--
-- 1. Alta de centro por RPC (admin corporativo): un centro nuevo nace de datos
--    (código, nombre, zona horaria), sin tocar código ni SQL a mano.
-- 2. center_readiness: checklist de datos maestros de un centro (equipo,
--    catálogo con precios y costos, bahías, técnicos, categorías de egreso,
--    membresías, B2B, línea base) para decidir si puede operar.
-- 3. Línea base por centro (center_baselines) para comparar el piloto.
-- 4. Errores de la app (client_error_reports) que reportan las pantallas de
--    error de web y móvil, sin datos personales y con límite por usuario.
-- 5. pilot_metrics: adopción por centro y día (usuarios activos, OS creadas,
--    entregadas y canceladas, ingreso, tiempo de ciclo, puntualidad, citas,
--    cortes y diferencias de caja, membresías y errores).

-- ---------------------------------------------------------------------------
-- 1. Alta de centro
-- ---------------------------------------------------------------------------

-- Configurar un centro (checklist y línea base): admin_socio del centro o corporativo.
create function private.can_setup_center(p_detail_center_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_center_role(p_detail_center_id, array['admin_socio']::public.app_role[]);
$$;

create function public.create_detail_center(
  p_organization_id uuid,
  p_code text,
  p_name text,
  p_timezone text,
  p_reason text
) returns public.detail_centers
language plpgsql security definer set search_path = '' as $$
declare
  result public.detail_centers;
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  perform private.set_change_reason(p_reason);
  if not private.has_org_role(p_organization_id, array['admin_socio']::public.app_role[]) then
    raise exception 'Sólo el admin corporativo da de alta centros' using errcode = '42501';
  end if;
  if v_code !~ '^[A-Z0-9-]{2,20}$' then
    raise exception 'El código del centro usa de 2 a 20 letras mayúsculas, números o guiones (p. ej. GDL-01)'
      using errcode = '22023';
  end if;
  insert into public.detail_centers (organization_id, code, name, timezone)
  values (p_organization_id, v_code, btrim(coalesce(p_name, '')), coalesce(nullif(btrim(p_timezone), ''), 'America/Mexico_City'))
  returning * into result;
  return result;
exception
  when unique_violation then
    raise exception 'Ya existe un centro con el código %', v_code using errcode = '23505';
  when check_violation then
    raise exception 'Nombre de centro inválido (de 2 a 120 caracteres)' using errcode = '22023';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Checklist de datos maestros
-- ---------------------------------------------------------------------------

create function public.center_readiness(p_detail_center_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.detail_centers;
  items jsonb := '[]'::jsonb;
  n integer;
  m integer;
  detail text;
begin
  select * into c from public.detail_centers where id = p_detail_center_id;
  if not found or not private.can_setup_center(p_detail_center_id) then
    raise exception 'Centro inexistente o sin permiso para configurarlo' using errcode = '42501';
  end if;

  -- Agrega un punto del checklist: ok si n >= mínimo; si no, falta (obligatorio) o aviso.
  items := items || jsonb_build_object('key', 'centro', 'required', true, 'count', 1,
    'status', case when c.active then 'ok' else 'missing' end,
    'detail', c.code || ' · ' || c.name || ' · ' || c.timezone || case when c.active then '' else ' · inactivo' end);

  select count(*) filter (where u.role in ('encargado', 'admin_socio')), count(*) filter (where u.role = 'operador_recepcion')
    into n, m
    from public.user_detail_centers u join public.profiles p on p.id = u.user_id
   where u.detail_center_id = c.id and u.active and p.active;
  items := items || jsonb_build_object('key', 'equipo', 'required', true, 'count', n + m,
    'status', case when n >= 1 and m >= 1 then 'ok' else 'missing' end,
    'detail', format('%s encargado(s) o admin, %s operador(es) de recepción', n, m));

  select count(*) filter (where s.active and coalesce(cfg.available, true)),
         count(*) filter (where s.active and coalesce(cfg.available, true)
                            and (coalesce(cfg.price_override, s.base_price) <= 0 or coalesce(cfg.direct_cost_override, s.standard_direct_cost) <= 0))
    into n, m
    from public.services s
    left join public.service_center_config cfg on cfg.service_id = s.id and cfg.detail_center_id = c.id
   where s.organization_id = c.organization_id;
  items := items || jsonb_build_object('key', 'catalogo', 'required', true, 'count', n,
    'status', case when n = 0 then 'missing' when m > 0 then 'warning' else 'ok' end,
    'detail', case when m > 0 then format('%s servicios; %s sin precio o sin costo directo (el P&L los necesita)', n, m)
                   else format('%s servicios con precio y costo', n) end);

  select count(*) into n from public.bays where detail_center_id = c.id and active;
  items := items || jsonb_build_object('key', 'bahias', 'required', true, 'count', n,
    'status', case when n > 0 then 'ok' else 'missing' end, 'detail', format('%s bahía(s) activas', n));

  select count(*) into n from public.technicians where detail_center_id = c.id and active;
  items := items || jsonb_build_object('key', 'tecnicos', 'required', true, 'count', n,
    'status', case when n > 0 then 'ok' else 'missing' end, 'detail', format('%s técnico(s) activos', n));

  select count(*) into n from public.payment_methods where active;
  items := items || jsonb_build_object('key', 'cobro', 'required', true, 'count', n,
    'status', case when n > 0 then 'ok' else 'missing' end, 'detail', format('%s métodos de cobro', n));

  select count(*) into n from public.expense_categories where organization_id = c.organization_id and active;
  items := items || jsonb_build_object('key', 'categorias', 'required', true, 'count', n,
    'status', case when n > 0 then 'ok' else 'missing' end, 'detail', format('%s categorías de egreso', n));

  select count(*) into n from public.membership_plans p
   where p.organization_id = c.organization_id and p.active and p.available_from <= current_date
     and (p.available_until is null or p.available_until >= current_date)
     and exists (select 1 from public.membership_benefits b where b.plan_id = p.id);
  items := items || jsonb_build_object('key', 'membresias', 'required', false, 'count', n,
    'status', case when n > 0 then 'ok' else 'warning' end, 'detail', format('%s plan(es) vigentes con beneficios', n));

  select count(*) into n from public.b2b_accounts a
   where a.organization_id = c.organization_id and a.status = 'activa'
     and (a.home_detail_center_id = c.id or exists (
           select 1 from public.b2b_agreements g join public.b2b_agreement_centers ac on ac.agreement_id = g.id
            where g.account_id = a.id and g.status = 'activo' and ac.detail_center_id = c.id));
  items := items || jsonb_build_object('key', 'b2b', 'required', false, 'count', n,
    'status', case when n > 0 then 'ok' else 'warning' end, 'detail', format('%s cuenta(s) B2B que operan aquí', n));

  select count(*) into n from public.center_baselines where detail_center_id = c.id;
  items := items || jsonb_build_object('key', 'linea_base', 'required', false, 'count', n,
    'status', case when n >= 3 then 'ok' else 'warning' end, 'detail', format('%s indicador(es) de línea base', n));

  return jsonb_build_object(
    'center', jsonb_build_object('id', c.id, 'organization_id', c.organization_id, 'code', c.code, 'name', c.name,
                                 'timezone', c.timezone, 'active', c.active),
    'items', items,
    'ready', not exists (select 1 from jsonb_array_elements(items) i where (i ->> 'required')::boolean and i ->> 'status' = 'missing'));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Línea base
-- ---------------------------------------------------------------------------

create table public.center_baselines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  metric text not null check (metric in (
    'ordenes_dia', 'ticket_promedio', 'ingreso_mensual', 'margen_bruto_pct', 'membresias_mes',
    'tiempo_ciclo_min', 'entregas_a_tiempo_pct', 'diferencia_caja_promedio')),
  value numeric(14, 2) not null check (value >= 0),
  period_from date,
  period_to date,
  source text not null check (length(btrim(source)) between 3 and 200),
  version integer not null default 1 check (version >= 1),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_from is null or period_to is null or period_from <= period_to),
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete cascade,
  unique (detail_center_id, metric)
);
create index center_baselines_updated_by_idx on public.center_baselines (updated_by);

create trigger center_baselines_updated_at before update on public.center_baselines
  for each row execute function private.set_updated_at();
create trigger center_baselines_require_reason before insert or update or delete on public.center_baselines
  for each row execute function private.require_change_reason();
create trigger center_baselines_audit after insert or update or delete on public.center_baselines
  for each row execute function private.audit_row();

alter table public.center_baselines enable row level security;
create policy center_baselines_select on public.center_baselines
  for select to authenticated using (private.can_read_pnl(detail_center_id));
revoke all on public.center_baselines from anon;
revoke insert, update, delete on public.center_baselines from authenticated;

-- Fija (o, con p_value null, borra) un indicador de línea base del centro.
create function public.set_center_baseline(
  p_detail_center_id uuid,
  p_metric text,
  p_value numeric,
  p_period_from date,
  p_period_to date,
  p_source text,
  p_reason text
) returns public.center_baselines
language plpgsql security definer set search_path = '' as $$
declare
  result public.center_baselines;
  org uuid;
begin
  perform private.set_change_reason(p_reason);
  select organization_id into org from public.detail_centers where id = p_detail_center_id;
  if org is null or not private.can_setup_center(p_detail_center_id) then
    raise exception 'Centro inexistente o sin permiso para configurarlo' using errcode = '42501';
  end if;
  if p_value is null then
    delete from public.center_baselines where detail_center_id = p_detail_center_id and metric = p_metric
    returning * into result;
    return result;
  end if;
  insert into public.center_baselines (organization_id, detail_center_id, metric, value, period_from, period_to, source)
  values (org, p_detail_center_id, p_metric, p_value, p_period_from, p_period_to, btrim(coalesce(p_source, '')))
  on conflict (detail_center_id, metric) do update
     set value = excluded.value, period_from = excluded.period_from, period_to = excluded.period_to,
         source = excluded.source, version = public.center_baselines.version + 1, updated_by = auth.uid()
  returning * into result;
  return result;
exception
  when check_violation or not_null_violation then
    raise exception 'Línea base inválida: indicador conocido, valor ≥ 0, fuente de 3 a 200 caracteres y periodo en orden'
      using errcode = '22023';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Errores de la app
-- ---------------------------------------------------------------------------

create table public.client_error_reports (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete cascade,
  detail_center_id uuid,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  source text not null check (source in ('web', 'mobile')),
  name text not null check (length(name) between 1 and 80),
  message text not null check (length(message) <= 400),
  digest text check (length(digest) <= 80),
  route text check (length(route) <= 200),
  occurred_at timestamptz not null default now(),
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete cascade
);
create index client_error_reports_center_idx on public.client_error_reports (detail_center_id, occurred_at);
create index client_error_reports_user_idx on public.client_error_reports (user_id, occurred_at);

alter table public.client_error_reports enable row level security;
create policy client_error_reports_select on public.client_error_reports
  for select to authenticated using (
    (detail_center_id is not null and private.can_setup_center(detail_center_id))
    or (organization_id is not null and private.has_org_role(organization_id, array['admin_socio']::public.app_role[])));
revoke all on public.client_error_reports from anon;
revoke insert, update, delete on public.client_error_reports from authenticated;

-- Lo llaman las pantallas de error (web y móvil) con el reporte ya sin datos
-- personales (@meguiars/domain/observability); aquí se recorta de nuevo, se
-- ignora el centro si el usuario no pertenece a él y se limita a 30 por hora.
create function public.report_client_error(
  p_source text,
  p_name text,
  p_message text,
  p_digest text,
  p_route text,
  p_detail_center_id uuid
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_center uuid := p_detail_center_id;
  v_org uuid;
begin
  if auth.uid() is null or not private.is_active_user() then
    raise exception 'Sesión requerida' using errcode = '42501';
  end if;
  if (select count(*) from public.client_error_reports
       where user_id = auth.uid() and occurred_at > now() - interval '1 hour') >= 30 then
    return;
  end if;
  if v_center is not null and not private.has_center_role(v_center, null) then
    v_center := null;
  end if;
  select organization_id into v_org from public.detail_centers where id = v_center;
  insert into public.client_error_reports (organization_id, detail_center_id, source, name, message, digest, route)
  values (v_org, v_center,
          case when p_source = 'mobile' then 'mobile' else 'web' end,
          left(coalesce(nullif(btrim(p_name), ''), 'Error'), 80),
          left(coalesce(p_message, ''), 400),
          left(nullif(btrim(p_digest), ''), 80),
          left(split_part(coalesce(p_route, ''), '?', 1), 200));
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Métricas de adopción por centro y día
-- ---------------------------------------------------------------------------

create function public.pilot_metrics(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  detail_center_id uuid,
  day date,
  active_users integer,
  orders_created integer,
  orders_delivered integer,
  orders_cancelled integer,
  revenue numeric,
  cycle_minutes_avg numeric,
  promised_delivered integer,
  on_time_delivered integer,
  appointments integer,
  cash_closings integer,
  cash_difference numeric,
  cash_difference_abs numeric,
  memberships_sold integer,
  membership_revenue numeric,
  errors integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Periodo inválido (máximo un año)' using errcode = '22023';
  end if;
  return query
  with centers as (
    select c.id, c.timezone from public.detail_centers c
     where c.id = any (p_detail_center_ids) and private.can_read_pnl(c.id)
  ),
  days as (
    select c.id as center_id, c.timezone, d::date as day
      from centers c cross join generate_series(p_from, p_to, interval '1 day') d
  )
  select d.center_id, d.day,
    (select count(distinct a.actor_id)::integer from public.audit_log a
      where a.detail_center_id = d.center_id and a.actor_id is not null
        and (a.occurred_at at time zone d.timezone)::date = d.day),
    (select count(*)::integer from public.service_orders o
      where o.detail_center_id = d.center_id and (o.created_at at time zone d.timezone)::date = d.day),
    (select count(*)::integer from public.service_orders o
      where o.detail_center_id = d.center_id and o.status = 'entregada'
        and (o.delivered_at at time zone d.timezone)::date = d.day),
    (select count(*)::integer from public.service_orders o
      where o.detail_center_id = d.center_id and o.status = 'cancelada'
        and (o.cancelled_at at time zone d.timezone)::date = d.day),
    (select coalesce(sum(o.total), 0) from public.service_orders o
      where o.detail_center_id = d.center_id and o.status = 'entregada'
        and (o.delivered_at at time zone d.timezone)::date = d.day),
    (select round(avg(extract(epoch from o.delivered_at - o.created_at) / 60)::numeric, 1) from public.service_orders o
      where o.detail_center_id = d.center_id and o.status = 'entregada'
        and (o.delivered_at at time zone d.timezone)::date = d.day),
    (select count(*)::integer from public.service_orders o
      where o.detail_center_id = d.center_id and o.status = 'entregada' and o.promised_at is not null
        and (o.delivered_at at time zone d.timezone)::date = d.day),
    (select count(*)::integer from public.service_orders o
      where o.detail_center_id = d.center_id and o.status = 'entregada' and o.promised_at is not null
        and o.delivered_at <= o.promised_at and (o.delivered_at at time zone d.timezone)::date = d.day),
    (select count(*)::integer from public.appointments ap
      where ap.detail_center_id = d.center_id and (ap.starts_at at time zone d.timezone)::date = d.day),
    (select count(*)::integer from (
       select distinct on (cc.session_id) cc.closed_at from public.cash_closings cc
        where cc.detail_center_id = d.center_id order by cc.session_id, cc.sequence desc) last
      where (last.closed_at at time zone d.timezone)::date = d.day),
    (select coalesce(sum(last.difference), 0) from (
       select distinct on (cc.session_id) cc.closed_at, cc.difference from public.cash_closings cc
        where cc.detail_center_id = d.center_id order by cc.session_id, cc.sequence desc) last
      where (last.closed_at at time zone d.timezone)::date = d.day),
    (select coalesce(sum(abs(last.difference)), 0) from (
       select distinct on (cc.session_id) cc.closed_at, cc.difference from public.cash_closings cc
        where cc.detail_center_id = d.center_id order by cc.session_id, cc.sequence desc) last
      where (last.closed_at at time zone d.timezone)::date = d.day),
    (select count(*)::integer from public.membership_events e
      where e.detail_center_id = d.center_id and e.kind in ('alta', 'renovacion')
        and (e.occurred_at at time zone d.timezone)::date = d.day),
    (select coalesce(sum(e.amount), 0) from public.membership_events e
      where e.detail_center_id = d.center_id and e.kind in ('alta', 'renovacion')
        and (e.occurred_at at time zone d.timezone)::date = d.day),
    (select count(*)::integer from public.client_error_reports r
      where r.detail_center_id = d.center_id and (r.occurred_at at time zone d.timezone)::date = d.day)
  from days d
  order by d.center_id, d.day;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array['private.can_setup_center(uuid)'] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.create_detail_center(uuid, text, text, text, text)',
    'public.center_readiness(uuid)',
    'public.set_center_baseline(uuid, text, numeric, date, date, text, text)',
    'public.report_client_error(text, text, text, text, text, uuid)',
    'public.pilot_metrics(uuid[], date, date)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
