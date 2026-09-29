-- D4 — Dirección / Alertas y gestión por excepción.
--
-- Alertas internas para que Dirección vea excepciones sin revisar todos los
-- reportes:
--
-- * public.alert_rules: reglas por métrica registrada (D1/D2) y canal fijo,
--   con condición (debajo/encima de un umbral, caída o alza porcentual contra
--   el periodo anterior, ausencia de dato), ventana (día, semana, mes en curso,
--   mes), ámbito (cada centro, un conjunto de centros consolidado o todo el
--   corporativo), severidad y cooldown. Las configura el admin corporativo.
-- * public.alert_instances: la bandeja. Una alerta guarda la regla, la
--   métrica, los centros, el periodo, el valor, el valor anterior y el umbral
--   que la originaron (trazabilidad). Estados nueva → revisada → resuelta;
--   resolver no borra nada (historial en public.alert_events).
-- * Antispam: a lo más UNA alerta abierta por regla y ámbito (índice único
--   parcial); si la condición se repite se actualiza (ocurrencias, último
--   valor y periodo). Tras resolverla, la misma regla y ámbito no genera otra
--   hasta que pase su cooldown.
-- * public.alert_evaluation_runs: bitácora de cada evaluación (cron o manual).
--
-- Evaluación: las fórmulas viven sólo en @meguiars/analytics (una fórmula por
-- KPI), así que la evalúa una ruta server-side de la web programada con Vercel
-- Cron (o un admin corporativo con "Evaluar ahora"). La ruta usa la llave de
-- servicio sólo en el servidor: public.alert_rule_facts lee los hechos con los
-- permisos del autor de la regla (nunca más de lo que esa persona puede ver) y
-- public.record_alert_results aplica deduplicación y cooldown de forma atómica.
-- Sin email/WhatsApp: alert_instances.notified_at queda para un notificador
-- futuro.

-- ---------------------------------------------------------------------------
-- 1. Permisos (espejo de alerts.read / alerts.manage en roles.ts)
-- ---------------------------------------------------------------------------

create function private.can_read_alerts(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(p_detail_center_id, array['admin_socio', 'encargado', 'contador']::public.app_role[]);
$$;

create function private.can_manage_alerts(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(p_detail_center_id, array['admin_socio', 'encargado']::public.app_role[]);
$$;

-- Una alerta se ve (o se gestiona) sólo con permiso en TODOS sus centros.
create function private.alert_visible(p_center_ids uuid[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select cardinality(p_center_ids) > 0
     and not exists (select 1 from unnest(p_center_ids) c where not private.can_read_alerts(c));
$$;

create function private.alert_manageable(p_center_ids uuid[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select cardinality(p_center_ids) > 0
     and not exists (select 1 from unnest(p_center_ids) c where not private.can_manage_alerts(c));
$$;

-- La petición viene del servidor con la llave de servicio (cron).
create function private.is_service_request() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role';
$$;

-- ---------------------------------------------------------------------------
-- 2. Reglas
-- ---------------------------------------------------------------------------

create table public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(btrim(name)) between 3 and 120),
  description text check (description is null or length(description) <= 500),
  metric_id text not null references public.metric_registry (id) on delete restrict,
  -- Canal fijo (p. ej. ventas B2B); null = sin canal.
  channel text check (channel in ('b2c', 'membresia', 'b2b')),
  -- below/above: valor contra umbral; drop_pct/rise_pct: variación contra el
  -- periodo anterior (en % o, para porcentajes, en puntos); no_data: sin hechos.
  condition text not null check (condition in ('below', 'above', 'drop_pct', 'rise_pct', 'no_data')),
  threshold numeric(14, 2),
  -- Ventana evaluada: día anterior, semana anterior completa, mes en curso
  -- (hasta ayer) o mes anterior completo.
  period text not null check (period in ('dia', 'semana', 'mes_en_curso', 'mes')),
  -- centro: cada centro por separado; conjunto: consolidado de los centros
  -- elegidos; corporativo: consolidado de todos los centros de la organización.
  scope_kind text not null check (scope_kind in ('centro', 'conjunto', 'corporativo')),
  center_ids uuid[],
  severity text not null check (severity in ('informativa', 'atencion', 'critica')),
  -- Tras resolver, la misma regla y ámbito no genera otra alerta antes de esto.
  cooldown_minutes integer not null default 1440 check (cooldown_minutes between 0 and 43200),
  active boolean not null default true,
  version integer not null default 1 check (version >= 1),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((condition = 'no_data') = (threshold is null)),
  check (condition not in ('drop_pct', 'rise_pct') or threshold > 0),
  check ((scope_kind = 'corporativo') = (center_ids is null)),
  check (center_ids is null or cardinality(center_ids) between 1 and 50),
  check (scope_kind <> 'conjunto' or cardinality(center_ids) >= 2),
  unique (organization_id, id)
);
create index alert_rules_org_active_idx on public.alert_rules (organization_id, active);
create index alert_rules_metric_idx on public.alert_rules (metric_id);
create index alert_rules_created_by_idx on public.alert_rules (created_by);

create trigger alert_rules_updated_at before update on public.alert_rules
  for each row execute function private.set_updated_at();
create trigger alert_rules_require_reason before insert or update or delete on public.alert_rules
  for each row execute function private.require_change_reason();
create trigger alert_rules_audit after insert or update or delete on public.alert_rules
  for each row execute function private.audit_row();

alter table public.alert_rules enable row level security;
create policy alert_rules_select on public.alert_rules
  for select to authenticated using (private.is_org_member(organization_id));
revoke all on public.alert_rules from anon;
revoke insert, update, delete, truncate on public.alert_rules from authenticated;

-- Admin corporativo: crea (p_id null) o cambia una regla con versión y motivo.
create function public.save_alert_rule(
  p_organization_id uuid,
  p_id uuid,
  p_version integer,
  p_name text,
  p_description text,
  p_metric_id text,
  p_channel text,
  p_condition text,
  p_threshold numeric,
  p_period text,
  p_scope_kind text,
  p_center_ids uuid[],
  p_severity text,
  p_cooldown_minutes integer,
  p_active boolean,
  p_reason text
) returns public.alert_rules
language plpgsql security definer set search_path = '' as $$
declare
  m public.metric_registry;
  result public.alert_rules;
  centers uuid[] := case when p_scope_kind = 'corporativo' then null
                         else (select array_agg(distinct c order by c) from unnest(p_center_ids) c) end;
begin
  perform private.set_change_reason(p_reason);
  if not private.has_org_role(p_organization_id, array['admin_socio']::public.app_role[]) then
    raise exception 'Sólo el admin corporativo configura las reglas de alerta' using errcode = '42501';
  end if;
  select * into m from public.metric_registry where id = p_metric_id and active;
  if not found then
    raise exception 'Métrica no registrada' using errcode = '22023';
  end if;
  if p_channel is not null and not ('canal' = any (m.filters)) then
    raise exception 'La métrica % no admite canal fijo', p_metric_id using errcode = '22023';
  end if;
  if centers is not null and exists (
       select 1 from unnest(centers) c
        where not exists (select 1 from public.detail_centers d where d.id = c and d.organization_id = p_organization_id)) then
    raise exception 'Todos los centros deben ser de la organización' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.alert_rules (organization_id, name, description, metric_id, channel, condition, threshold, period,
                                    scope_kind, center_ids, severity, cooldown_minutes, active)
    values (p_organization_id, btrim(p_name), nullif(btrim(p_description), ''), p_metric_id, p_channel, p_condition,
            p_threshold, p_period, p_scope_kind, centers, p_severity, coalesce(p_cooldown_minutes, 1440),
            coalesce(p_active, true))
    returning * into result;
    return result;
  end if;
  select * into result from public.alert_rules where id = p_id and organization_id = p_organization_id for update;
  if not found then
    raise exception 'La regla no existe' using errcode = 'P0002';
  end if;
  if p_version is null or result.version <> p_version then
    raise exception 'Otro usuario cambió la regla; recarga e intenta de nuevo' using errcode = '40001';
  end if;
  update public.alert_rules
     set name = btrim(p_name), description = nullif(btrim(p_description), ''), metric_id = p_metric_id,
         channel = p_channel, condition = p_condition, threshold = p_threshold, period = p_period,
         scope_kind = p_scope_kind, center_ids = centers, severity = p_severity,
         cooldown_minutes = coalesce(p_cooldown_minutes, cooldown_minutes), active = coalesce(p_active, active),
         -- Una regla sin autor (seed) lo adopta al editarse: el cron evalúa con sus permisos.
         created_by = coalesce(created_by, auth.uid()),
         version = version + 1
   where id = p_id
  returning * into result;
  return result;
exception
  when check_violation or not_null_violation then
    raise exception 'Regla inválida: revisa condición, umbral (positivo para variaciones; sin umbral para ausencia de dato), ámbito y centros'
      using errcode = '22023';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Alertas, historial y bitácora de evaluaciones
-- ---------------------------------------------------------------------------

create table public.alert_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  rule_id uuid not null,
  -- Copia de la regla al detectarse (trazabilidad aunque la regla cambie).
  rule_name text not null,
  metric_id text not null references public.metric_registry (id) on delete restrict,
  channel text,
  condition text not null,
  threshold numeric(14, 2),
  severity text not null check (severity in ('informativa', 'atencion', 'critica')),
  -- Ámbito evaluado: id del centro, "conjunto" o "corporativo".
  scope_key text not null check (length(scope_key) between 1 and 60),
  detail_center_ids uuid[] not null check (cardinality(detail_center_ids) between 1 and 50),
  -- Periodo y datos que la originaron.
  period_from date not null,
  period_to date not null check (period_to >= period_from),
  previous_from date,
  previous_to date,
  value numeric(16, 4),
  previous_value numeric(16, 4),
  change_pct numeric(12, 2),
  -- Última vez que la condición se cumplió (la alerta abierta se actualiza, no se duplica).
  occurrences integer not null default 1 check (occurrences >= 1),
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  last_period_from date not null,
  last_period_to date not null,
  last_value numeric(16, 4),
  -- La condición dejó de cumplirse en una evaluación posterior (no la resuelve).
  condition_cleared_at timestamptz,
  status text not null default 'nueva' check (status in ('nueva', 'revisada', 'resuelta')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  resolution_note text check (resolution_note is null or length(resolution_note) <= 500),
  -- Para el notificador futuro (email/WhatsApp); hoy siempre null.
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, rule_id) references public.alert_rules (organization_id, id) on delete restrict,
  check ((status = 'resuelta') = (resolved_at is not null))
);
-- Antispam: a lo más una alerta abierta por regla y ámbito.
create unique index alert_instances_open_idx on public.alert_instances (rule_id, scope_key) where status <> 'resuelta';
create index alert_instances_org_status_idx on public.alert_instances (organization_id, status, last_detected_at desc);
create index alert_instances_rule_scope_idx on public.alert_instances (rule_id, scope_key, resolved_at desc);
create index alert_instances_metric_idx on public.alert_instances (metric_id);
create index alert_instances_reviewed_by_idx on public.alert_instances (reviewed_by);
create index alert_instances_resolved_by_idx on public.alert_instances (resolved_by);

create trigger alert_instances_updated_at before update on public.alert_instances
  for each row execute function private.set_updated_at();

alter table public.alert_instances enable row level security;
create policy alert_instances_select on public.alert_instances
  for select to authenticated using (private.alert_visible(detail_center_ids));
revoke all on public.alert_instances from anon;
revoke insert, update, delete, truncate on public.alert_instances from authenticated;

create table public.alert_events (
  id bigint generated always as identity primary key,
  instance_id uuid not null references public.alert_instances (id) on delete cascade,
  kind text not null check (kind in ('creada', 'repetida', 'condicion_superada', 'revisada', 'resuelta')),
  -- null = el sistema (evaluación programada).
  actor_id uuid references auth.users (id) on delete set null,
  note text check (note is null or length(note) <= 500),
  value numeric(16, 4),
  period_from date,
  period_to date,
  created_at timestamptz not null default now()
);
create index alert_events_instance_idx on public.alert_events (instance_id, created_at);
create index alert_events_actor_idx on public.alert_events (actor_id);

alter table public.alert_events enable row level security;
create policy alert_events_select on public.alert_events
  for select to authenticated using (exists (
    select 1 from public.alert_instances i where i.id = instance_id and private.alert_visible(i.detail_center_ids)));
revoke all on public.alert_events from anon;
revoke insert, update, delete, truncate on public.alert_events from authenticated;

create table public.alert_evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source text not null check (source in ('cron', 'manual')),
  actor_id uuid references auth.users (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rules_evaluated integer not null default 0,
  created integer not null default 0,
  updated integer not null default 0,
  suppressed integer not null default 0,
  cleared integer not null default 0,
  error text check (error is null or length(error) <= 2000)
);
create index alert_evaluation_runs_org_idx on public.alert_evaluation_runs (organization_id, started_at desc);
create index alert_evaluation_runs_actor_idx on public.alert_evaluation_runs (actor_id);

alter table public.alert_evaluation_runs enable row level security;
create policy alert_evaluation_runs_select on public.alert_evaluation_runs
  for select to authenticated using (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]));
revoke all on public.alert_evaluation_runs from anon;
revoke insert, update, delete, truncate on public.alert_evaluation_runs from authenticated;

-- ---------------------------------------------------------------------------
-- 4. Gestión de la bandeja (revisar y resolver; nunca se borra)
-- ---------------------------------------------------------------------------

create function public.review_alert(p_id uuid, p_note text default null) returns public.alert_instances
language plpgsql security definer set search_path = '' as $$
declare
  a public.alert_instances;
begin
  select * into a from public.alert_instances where id = p_id for update;
  if not found or not private.alert_manageable(a.detail_center_ids) then
    raise exception 'Sin permiso para gestionar esta alerta' using errcode = '42501';
  end if;
  if a.status <> 'nueva' then
    raise exception 'Sólo una alerta nueva se marca como revisada' using errcode = '22023';
  end if;
  update public.alert_instances set status = 'revisada', reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_id returning * into a;
  insert into public.alert_events (instance_id, kind, actor_id, note) values (p_id, 'revisada', auth.uid(), nullif(btrim(p_note), ''));
  return a;
end;
$$;

create function public.resolve_alert(p_id uuid, p_note text) returns public.alert_instances
language plpgsql security definer set search_path = '' as $$
declare
  a public.alert_instances;
begin
  select * into a from public.alert_instances where id = p_id for update;
  if not found or not private.alert_manageable(a.detail_center_ids) then
    raise exception 'Sin permiso para gestionar esta alerta' using errcode = '42501';
  end if;
  if a.status = 'resuelta' then
    raise exception 'La alerta ya está resuelta' using errcode = '22023';
  end if;
  if p_note is null or length(btrim(p_note)) not between 3 and 500 then
    raise exception 'Escribe cómo se resolvió (3 a 500 caracteres)' using errcode = '22023';
  end if;
  update public.alert_instances
     set status = 'resuelta', resolved_at = now(), resolved_by = auth.uid(), resolution_note = btrim(p_note),
         reviewed_at = coalesce(reviewed_at, now()), reviewed_by = coalesce(reviewed_by, auth.uid())
   where id = p_id returning * into a;
  insert into public.alert_events (instance_id, kind, actor_id, note) values (p_id, 'resuelta', auth.uid(), btrim(p_note));
  return a;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Evaluación (cron con llave de servicio o admin corporativo)
-- ---------------------------------------------------------------------------

create function private.can_evaluate_alerts(p_organization_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_service_request()
      or private.has_org_role(p_organization_id, array['admin_socio']::public.app_role[]);
$$;

create function public.start_alert_run(p_organization_id uuid, p_source text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  run_id uuid;
begin
  if not private.can_evaluate_alerts(p_organization_id) then
    raise exception 'Sin permiso para evaluar alertas' using errcode = '42501';
  end if;
  if p_source is null or p_source not in ('cron', 'manual') or (p_source = 'cron') <> private.is_service_request() then
    raise exception 'Origen de la evaluación inválido' using errcode = '22023';
  end if;
  insert into public.alert_evaluation_runs (organization_id, source, actor_id)
  values (p_organization_id, p_source, auth.uid()) returning id into run_id;
  return run_id;
end;
$$;

create function public.finish_alert_run(p_run_id uuid, p_rules_evaluated integer, p_error text default null)
returns public.alert_evaluation_runs
language plpgsql security definer set search_path = '' as $$
declare
  r public.alert_evaluation_runs;
begin
  select * into r from public.alert_evaluation_runs where id = p_run_id for update;
  if not found or not private.can_evaluate_alerts(r.organization_id) or r.finished_at is not null then
    raise exception 'Evaluación inexistente, cerrada o sin permiso' using errcode = '42501';
  end if;
  update public.alert_evaluation_runs
     set finished_at = now(), rules_evaluated = greatest(coalesce(p_rules_evaluated, 0), 0), error = left(p_error, 2000)
   where id = p_run_id returning * into r;
  return r;
end;
$$;

-- Resultado de una regla por ámbito. Aplica deduplicación y cooldown:
-- * condición cumplida y alerta abierta → se actualiza (ocurrencias, último
--   valor y periodo), no se duplica;
-- * condición cumplida sin alerta abierta → nueva, salvo que la última del
--   mismo ámbito se haya resuelto dentro del cooldown (se suprime);
-- * condición no cumplida con alerta abierta → se marca "condición superada"
--   (no se resuelve sola).
-- p_results: [{scope_key, center_ids, triggered, value, previous_value,
--   change_pct, period_from, period_to, previous_from, previous_to}]
create function public.record_alert_results(p_run_id uuid, p_rule_id uuid, p_results jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  run public.alert_evaluation_runs;
  rule public.alert_rules;
  item jsonb;
  open_alert public.alert_instances;
  centers uuid[];
  allowed uuid[];
  last_resolved timestamptz;
  new_id uuid;
  v_created uuid[] := '{}';
  n_updated integer := 0;
  n_suppressed integer := 0;
  n_cleared integer := 0;
  v numeric;
begin
  select * into run from public.alert_evaluation_runs where id = p_run_id for update;
  if not found or run.finished_at is not null or not private.can_evaluate_alerts(run.organization_id) then
    raise exception 'Evaluación inexistente, cerrada o sin permiso' using errcode = '42501';
  end if;
  select * into rule from public.alert_rules where id = p_rule_id and organization_id = run.organization_id;
  if not found then
    raise exception 'Regla inexistente' using errcode = 'P0002';
  end if;
  allowed := coalesce(rule.center_ids,
                      (select array_agg(d.id) from public.detail_centers d where d.organization_id = rule.organization_id));
  if jsonb_typeof(p_results) <> 'array' then
    raise exception 'Resultados inválidos' using errcode = '22023';
  end if;
  for item in select * from jsonb_array_elements(p_results) loop
    centers := array(select (jsonb_array_elements_text(item -> 'center_ids'))::uuid);
    if cardinality(centers) = 0 or not (centers <@ allowed) then
      raise exception 'Los centros del resultado no corresponden a la regla' using errcode = '22023';
    end if;
    v := (item ->> 'value')::numeric;
    select * into open_alert from public.alert_instances
     where rule_id = rule.id and scope_key = item ->> 'scope_key' and status <> 'resuelta' for update;
    if coalesce((item ->> 'triggered')::boolean, false) then
      if open_alert.id is not null then
        update public.alert_instances
           set occurrences = occurrences + 1, last_detected_at = now(), last_value = v,
               last_period_from = (item ->> 'period_from')::date, last_period_to = (item ->> 'period_to')::date,
               condition_cleared_at = null
         where id = open_alert.id;
        insert into public.alert_events (instance_id, kind, value, period_from, period_to)
        values (open_alert.id, 'repetida', v, (item ->> 'period_from')::date, (item ->> 'period_to')::date);
        n_updated := n_updated + 1;
        continue;
      end if;
      select max(resolved_at) into last_resolved from public.alert_instances
       where rule_id = rule.id and scope_key = item ->> 'scope_key' and status = 'resuelta';
      if last_resolved is not null and last_resolved > now() - make_interval(mins => rule.cooldown_minutes) then
        n_suppressed := n_suppressed + 1;
        continue;
      end if;
      insert into public.alert_instances (
        organization_id, rule_id, rule_name, metric_id, channel, condition, threshold, severity, scope_key,
        detail_center_ids, period_from, period_to, previous_from, previous_to, value, previous_value, change_pct,
        last_period_from, last_period_to, last_value)
      values (
        rule.organization_id, rule.id, rule.name, rule.metric_id, rule.channel, rule.condition, rule.threshold,
        rule.severity, item ->> 'scope_key', centers, (item ->> 'period_from')::date, (item ->> 'period_to')::date,
        (item ->> 'previous_from')::date, (item ->> 'previous_to')::date, v, (item ->> 'previous_value')::numeric,
        (item ->> 'change_pct')::numeric, (item ->> 'period_from')::date, (item ->> 'period_to')::date, v)
      on conflict (rule_id, scope_key) where status <> 'resuelta' do nothing
      returning id into new_id;
      if new_id is null then
        n_updated := n_updated + 1;
      else
        insert into public.alert_events (instance_id, kind, value, period_from, period_to)
        values (new_id, 'creada', v, (item ->> 'period_from')::date, (item ->> 'period_to')::date);
        v_created := v_created || new_id;
      end if;
      new_id := null;
    elsif open_alert.id is not null and open_alert.condition_cleared_at is null then
      update public.alert_instances set condition_cleared_at = now() where id = open_alert.id;
      insert into public.alert_events (instance_id, kind, value, period_from, period_to)
      values (open_alert.id, 'condicion_superada', v, (item ->> 'period_from')::date, (item ->> 'period_to')::date);
      n_cleared := n_cleared + 1;
    end if;
  end loop;
  update public.alert_evaluation_runs
     set created = created + cardinality(v_created), updated = updated + n_updated,
         suppressed = suppressed + n_suppressed, cleared = cleared + n_cleared
   where id = p_run_id;
  return jsonb_build_object('created', to_jsonb(v_created), 'updated', n_updated,
                            'suppressed', n_suppressed, 'cleared', n_cleared);
end;
$$;

-- Hechos para evaluar una regla desde el cron: la llave de servicio no tiene
-- centros, así que se leen con los permisos del AUTOR de la regla (nunca más de
-- lo que esa persona puede ver). Sólo para service_role.
create function public.alert_rule_facts(
  p_rule_id uuid,
  p_sources text[],
  p_detail_center_ids uuid[],
  p_from date,
  p_to date
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  rule public.alert_rules;
begin
  if not private.is_service_request() then
    raise exception 'Sólo la evaluación programada lee hechos por regla' using errcode = '42501';
  end if;
  select * into rule from public.alert_rules where id = p_rule_id and active;
  if not found or rule.created_by is null then
    raise exception 'Regla inexistente, inactiva o sin autor' using errcode = 'P0002';
  end if;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', rule.created_by, 'role', 'authenticated')::text, true);
  return public.dashboard_facts(p_sources, p_detail_center_ids, p_from, p_to, 'total');
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.can_read_alerts(uuid)',
    'private.can_manage_alerts(uuid)',
    'private.alert_visible(uuid[])',
    'private.alert_manageable(uuid[])',
    'private.is_service_request()',
    'private.can_evaluate_alerts(uuid)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
  foreach fn in array array[
    'public.save_alert_rule(uuid, uuid, integer, text, text, text, text, text, numeric, text, text, uuid[], text, integer, boolean, text)',
    'public.review_alert(uuid, text)',
    'public.resolve_alert(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.start_alert_run(uuid, text)',
    'public.finish_alert_run(uuid, integer, text)',
    'public.record_alert_results(uuid, uuid, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
  execute 'revoke all on function public.alert_rule_facts(uuid, text[], uuid[], date, date) from public, anon, authenticated';
  execute 'grant execute on function public.alert_rule_facts(uuid, text[], uuid[], date, date) to service_role';
end $$;
grant select on public.alert_rules, public.alert_instances, public.alert_events, public.alert_evaluation_runs to service_role;
