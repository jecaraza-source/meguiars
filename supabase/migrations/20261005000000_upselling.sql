-- C4 — Comercial / Recomendaciones de venta (upselling y cross-selling asistido).
--
-- * upsell_rules: reglas configurables por organización: servicio origen (o
--   cualquiera) -> servicio/producto sugerido o plan de membresía, etapa
--   (diagnóstico o cierre), prioridad, argumento visible, elegibilidad (canales,
--   centros, total mínimo) y vigencia. Sólo el admin corporativo las edita.
-- * upsell_offers: una oferta por regla y OS (mostrada, aceptada o rechazada),
--   con la línea agregada y su valor para medir conversión e ingreso incremental.
-- * upsell_suggestions: ranking explicable por reglas y datos simples
--   (prioridad y tasa de aceptación histórica suavizada); nunca bloquea la OS.
-- * accept_upsell agrega la línea por el mismo camino que la OS
--   (set_service_order_item: precio congelado del centro o del convenio B2B y,
--   si la OS ya estaba autorizada, adicional con motivo y total autorizado).
--
-- Escrituras sólo por RPC con motivo y auditoría. Compatible hacia atrás.

-- ---------------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------------

create table public.upsell_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name text not null check (length(btrim(name)) between 2 and 120),
  -- null = aplica a cualquier OS (p. ej. un producto al cierre).
  source_service_id uuid,
  target_service_id uuid,
  target_plan_id uuid references public.membership_plans (id) on delete restrict,
  -- diagnostico: OS abierta o autorizada; cierre: en proceso, pausada o terminada.
  stage text not null default 'diagnostico' check (stage in ('diagnostico', 'cierre', 'ambos')),
  priority smallint not null default 50 check (priority between 1 and 100),
  -- Argumento visible para el operador y el cliente (explicable).
  pitch text not null check (length(btrim(pitch)) between 3 and 280),
  channels text[] not null default '{b2c,membresia,b2b}'
    check (cardinality(channels) > 0 and channels <@ array['b2c', 'membresia', 'b2b']::text[]),
  -- null = todos los centros de la organización.
  center_ids uuid[],
  min_order_total numeric(12, 2) check (min_order_total is null or min_order_total >= 0),
  starts_on date not null default current_date,
  ends_on date,
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check ((target_service_id is null) <> (target_plan_id is null)),
  check (source_service_id is distinct from target_service_id),
  check (ends_on is null or ends_on >= starts_on),
  foreign key (organization_id, source_service_id) references public.services (organization_id, id) on delete restrict,
  foreign key (organization_id, target_service_id) references public.services (organization_id, id) on delete restrict
);
create index upsell_rules_org_idx on public.upsell_rules (organization_id) where active;

create table public.upsell_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  service_order_id uuid not null,
  rule_id uuid not null,
  stage text not null check (stage in ('diagnostico', 'cierre')),
  target_service_id uuid,
  target_plan_id uuid,
  -- Precio mostrado al ofrecer (centro, convenio B2B o plan).
  suggested_price numeric(12, 2) not null check (suggested_price >= 0),
  status text not null default 'ofrecida' check (status in ('ofrecida', 'aceptada', 'rechazada')),
  rejection_reason text check (rejection_reason in ('precio', 'tiempo', 'no_interesa', 'ya_lo_tiene', 'otro')),
  -- Línea agregada al aceptar (se pierde si la línea se quita: el ingreso realizado es 0).
  accepted_item_id uuid references public.service_order_items (id) on delete set null,
  -- Valor al aceptar: la línea (servicio) o el precio del plan (membresía).
  accepted_value numeric(12, 2) check (accepted_value is null or accepted_value >= 0),
  offered_by uuid default auth.uid() references auth.users (id) on delete set null,
  offered_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_order_id, rule_id),
  check ((status = 'ofrecida') = (decided_at is null)),
  check (status = 'aceptada' or (accepted_item_id is null and accepted_value is null)),
  check (status = 'aceptada' or status = 'rechazada' or rejection_reason is null),
  check (status <> 'rechazada' or accepted_value is null),
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete restrict,
  foreign key (organization_id, service_order_id) references public.service_orders (organization_id, id) on delete cascade,
  foreign key (organization_id, rule_id) references public.upsell_rules (organization_id, id) on delete restrict
);
create index upsell_offers_center_idx on public.upsell_offers (detail_center_id, offered_at);
create index upsell_offers_rule_idx on public.upsell_offers (rule_id, status);

create trigger upsell_rules_updated_at before update on public.upsell_rules
  for each row execute function private.set_updated_at();
create trigger upsell_offers_updated_at before update on public.upsell_offers
  for each row execute function private.set_updated_at();
create trigger upsell_rules_require_reason before insert or update or delete on public.upsell_rules
  for each row execute function private.require_change_reason();
create trigger upsell_offers_require_reason before insert or update or delete on public.upsell_offers
  for each row execute function private.require_change_reason();
create trigger upsell_rules_audit after insert or update or delete on public.upsell_rules
  for each row execute function private.audit_row();
create trigger upsell_offers_audit after insert or update or delete on public.upsell_offers
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- 2. Permisos y reglas (espejo en el dominio)
-- ---------------------------------------------------------------------------

-- upsell.manage: reglas de la organización (admin corporativo, como el catálogo).
create function private.can_manage_upsell(p_organization_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_org_role(p_organization_id, array['admin_socio']::public.app_role[]);
$$;

-- upsell.read: indicadores de conversión (sin datos personales).
create function private.can_read_upsell_metrics(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(
    p_detail_center_id, array['admin_socio', 'encargado', 'comercial_b2b', 'contador']::public.app_role[]);
$$;

-- Etapa de la OS (espejo de upsellStage): diagnóstico antes de trabajar, cierre
-- hasta entregar; entregada o cancelada no reciben sugerencias.
create function private.upsell_stage(p_status public.service_order_status) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_status in ('abierta', 'autorizada') then 'diagnostico'
    when p_status in ('en_proceso', 'pausada', 'terminada') then 'cierre'
  end;
$$;

-- Tasa de aceptación suavizada (espejo de acceptanceScore): (aceptadas + 1) ÷ (ofrecidas + 2).
create function private.upsell_score(p_accepted bigint, p_offered bigint) returns numeric
language sql immutable set search_path = '' as $$
  select round((coalesce(p_accepted, 0) + 1)::numeric / (coalesce(p_offered, 0) + 2), 4);
$$;

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

alter table public.upsell_rules enable row level security;
alter table public.upsell_offers enable row level security;

create policy upsell_rules_select on public.upsell_rules
  for select to authenticated using (private.is_org_member(organization_id));
create policy upsell_offers_select on public.upsell_offers
  for select to authenticated
  using (private.can_use_orders(detail_center_id) or private.can_read_upsell_metrics(detail_center_id));

revoke all on public.upsell_rules, public.upsell_offers from anon;
revoke insert, update, delete, truncate on public.upsell_rules, public.upsell_offers from authenticated;

-- ---------------------------------------------------------------------------
-- 4. Sugerencias (ranking explicable) y registro de ofertas
-- ---------------------------------------------------------------------------

-- Candidatas rankeadas para una OS (sin efectos): reglas activas y vigentes,
-- de la etapa, centro, canal y total mínimo; origen presente en la OS; destino
-- disponible y aún no incluido; sin decisión previa en la OS. Orden: prioridad,
-- tasa de aceptación suavizada de los últimos 90 días (sin contar esta OS),
-- precio y nombre.
create function private.upsell_candidates(p_order_id uuid, p_limit integer)
returns table (
  rule_id uuid,
  stage text,
  rule_name text,
  pitch text,
  source_service_name text,
  target_kind text,
  target_service_id uuid,
  target_plan_id uuid,
  target_name text,
  price numeric,
  priority smallint,
  acceptance_rate numeric,
  offered_count integer
)
language sql stable security definer set search_path = '' as $$
  with o as (
    select so.*, private.upsell_stage(so.status) as v_stage, private.center_today(so.detail_center_id) as today
      from public.service_orders so where so.id = p_order_id
  ), stats as (
    select f.rule_id, count(*) as offered, count(*) filter (where f.status = 'aceptada') as accepted
      from public.upsell_offers f, o
     where f.organization_id = o.organization_id and f.service_order_id <> o.id
       and f.offered_at >= now() - interval '90 days'
     group by f.rule_id
  ), candidates as (
    select r.*
      from public.upsell_rules r, o
     where o.v_stage is not null
       and r.organization_id = o.organization_id
       and r.active
       and r.starts_on <= o.today and (r.ends_on is null or r.ends_on >= o.today)
       and (r.stage = o.v_stage or r.stage = 'ambos')
       and (r.center_ids is null or o.detail_center_id = any (r.center_ids))
       and o.channel::text = any (r.channels)
       and (r.min_order_total is null or o.total >= r.min_order_total)
       and (r.source_service_id is null
            or exists (select 1 from public.service_order_items i
                        where i.service_order_id = o.id and i.service_id = r.source_service_id))
       and not exists (select 1 from public.upsell_offers f
                        where f.service_order_id = o.id and f.rule_id = r.id and f.status <> 'ofrecida')
  ), targets as (
    -- Servicio: disponible en el centro, aún no está en la OS y la OS admite
    -- líneas. Precio = el que tendría la línea (centro o convenio B2B).
    select c.id as rule_id, c.name, c.pitch, c.source_service_id, 'servicio'::text as kind,
           cat.id as target_service_id, null::uuid as target_plan_id, cat.name as target_name,
           (select p.price from private.b2b_line_price(o.id, cat.id, cat.price, 1) p) as price, c.priority
      from candidates c
      cross join o
      join public.center_catalog(o.detail_center_id) cat
        on cat.id = c.target_service_id and cat.available and cat.active
     where o.status in ('abierta', 'autorizada', 'en_proceso', 'pausada')
       and not exists (select 1 from public.service_order_items i
                        where i.service_order_id = o.id and i.service_id = c.target_service_id)
    union all
    -- Membresía: plan disponible, OS no B2B y el vehículo sin membresía vigente.
    select c.id, c.name, c.pitch, c.source_service_id, 'membresia'::text,
           null::uuid, p.id, p.name, p.price, c.priority
      from candidates c
      cross join o
      join public.membership_plans p on p.id = c.target_plan_id and p.active
       and p.available_from <= o.today and (p.available_until is null or p.available_until >= o.today)
     where o.channel <> 'b2b'
       and not exists (select 1 from public.memberships m
                        where m.vehicle_id = o.vehicle_id and m.state <> 'cancelada'
                          and private.membership_status(m.state, m.ends_on, m.renewal_notice_days, o.today)
                              in ('activa', 'proxima_a_vencer'))
  )
  select x.rule_id, (select v_stage from o), x.name, x.pitch, s.name, x.kind, x.target_service_id, x.target_plan_id,
         x.target_name, x.price, x.priority, private.upsell_score(st.accepted, st.offered),
         coalesce(st.offered, 0)::integer
    from targets x
    left join public.services s on s.id = x.source_service_id
    left join stats st on st.rule_id = x.rule_id
   order by x.priority desc, private.upsell_score(st.accepted, st.offered) desc, x.price desc, x.target_name
   limit least(greatest(coalesce(p_limit, 3), 1), 10);
$$;

-- Sugerencias para la OS: nunca lanza error por permisos (devuelve vacío) para
-- no bloquear la operación. Registra como "ofrecida" cada sugerencia mostrada
-- (una vez por regla y OS).
create function public.upsell_suggestions(p_order_id uuid, p_limit integer default 3)
returns table (
  offer_id uuid,
  rule_id uuid,
  stage text,
  rule_name text,
  pitch text,
  source_service_name text,
  target_kind text,
  target_service_id uuid,
  target_plan_id uuid,
  target_name text,
  price numeric,
  priority smallint,
  acceptance_rate numeric,
  offered_count integer
)
language plpgsql security definer set search_path = '' as $$
declare
  o public.service_orders;
begin
  select * into o from public.service_orders so where so.id = p_order_id;
  if not found or not private.can_use_orders(o.detail_center_id) then
    return;
  end if;
  perform set_config('app.change_reason', 'Sugerencia mostrada', true);
  insert into public.upsell_offers (organization_id, detail_center_id, service_order_id, rule_id, stage,
    target_service_id, target_plan_id, suggested_price)
  select o.organization_id, o.detail_center_id, o.id, k.rule_id, k.stage, k.target_service_id, k.target_plan_id,
         k.price
    from private.upsell_candidates(o.id, p_limit) k
  on conflict on constraint upsell_offers_service_order_id_rule_id_key do nothing;
  return query
  select f.id, k.rule_id, k.stage, k.rule_name, k.pitch, k.source_service_name, k.target_kind, k.target_service_id,
         k.target_plan_id, k.target_name, k.price, k.priority, k.acceptance_rate, k.offered_count
    from private.upsell_candidates(o.id, p_limit) k
    join public.upsell_offers f on f.service_order_id = o.id and f.rule_id = k.rule_id;
end;
$$;

-- Registra la decisión sobre una oferta (security definer: la llaman las RPC
-- de decisión tras validar el acceso a la OS).
create function private.decide_upsell_offer(
  p_order_id uuid,
  p_rule_id uuid,
  p_status text,
  p_item_id uuid,
  p_value numeric,
  p_rejection_reason text
) returns public.upsell_offers
language plpgsql security definer set search_path = '' as $$
declare
  f public.upsell_offers;
begin
  select * into f from public.upsell_offers
   where service_order_id = p_order_id and rule_id = p_rule_id for update;
  if not found then
    raise exception 'La sugerencia no se ofreció en esta OS' using errcode = 'MG002';
  end if;
  if f.status <> 'ofrecida' then
    return f;
  end if;
  perform set_config('app.change_reason',
    case p_status when 'aceptada' then 'Sugerencia aceptada' else 'Sugerencia rechazada' end, true);
  update public.upsell_offers
     set status = p_status, accepted_item_id = p_item_id, accepted_value = p_value,
         rejection_reason = p_rejection_reason, decided_by = auth.uid(), decided_at = now()
   where id = f.id
  returning * into f;
  return f;
end;
$$;

-- Aceptar: agrega la línea sugerida a la OS por el camino normal (precio
-- congelado del centro o convenio; si la OS está autorizada, adicional con
-- motivo y total autorizado actualizado). Idempotente: aceptar dos veces no
-- agrega dos líneas. Para una membresía registra la intención (la venta se
-- completa en Membresías).
create function public.accept_upsell(p_order_id uuid, p_version integer, p_rule_id uuid)
returns public.service_orders
language plpgsql security invoker set search_path = '' as $$
declare
  o public.service_orders;
  f public.upsell_offers;
  item public.service_order_items;
begin
  select * into f from public.upsell_offers where service_order_id = p_order_id and rule_id = p_rule_id;
  if not found then
    raise exception 'La sugerencia no se ofreció en esta OS' using errcode = 'MG002';
  end if;
  if f.status = 'aceptada' then
    select * into o from public.service_orders where id = p_order_id;
    return o;
  end if;
  if f.status = 'rechazada' then
    raise exception 'La sugerencia ya se rechazó' using errcode = 'MG002';
  end if;
  o := private.lock_service_order(p_order_id, p_version);
  if f.target_plan_id is not null then
    perform private.decide_upsell_offer(o.id, p_rule_id, 'aceptada', null, f.suggested_price, null);
    return o;
  end if;
  if o.status not in ('abierta', 'autorizada', 'en_proceso', 'pausada') then
    raise exception 'La OS ya no admite líneas' using errcode = 'MG002';
  end if;
  if exists (select 1 from public.service_order_items i where i.service_order_id = o.id and i.service_id = f.target_service_id) then
    raise exception 'El servicio ya está en la OS' using errcode = 'MG002';
  end if;
  o := public.set_service_order_item(o.id, o.version, f.target_service_id, 1,
         'Adicional sugerido aceptado por el cliente: '
         || (select r.name from public.upsell_rules r where r.id = p_rule_id));
  select * into item from public.service_order_items
   where service_order_id = o.id and service_id = f.target_service_id;
  perform private.decide_upsell_offer(o.id, p_rule_id, 'aceptada', item.id, item.line_subtotal - item.line_discount, null);
  return o;
end;
$$;

create function public.reject_upsell(p_order_id uuid, p_rule_id uuid, p_reason text default null)
returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.service_orders o where o.id = p_order_id) then
    raise exception 'OS inexistente o sin permiso' using errcode = '42501';
  end if;
  if p_reason is not null and p_reason not in ('precio', 'tiempo', 'no_interesa', 'ya_lo_tiene', 'otro') then
    raise exception 'Motivo de rechazo inválido' using errcode = '22023';
  end if;
  perform private.decide_upsell_offer(p_order_id, p_rule_id, 'rechazada', null, null, p_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Administración de reglas (admin corporativo, con motivo)
-- ---------------------------------------------------------------------------

create function public.upsert_upsell_rule(
  p_organization_id uuid,
  p_id uuid,
  p_name text,
  p_source_service_id uuid,
  p_target_service_id uuid,
  p_target_plan_id uuid,
  p_stage text,
  p_priority smallint,
  p_pitch text,
  p_channels text[],
  p_center_ids uuid[],
  p_min_order_total numeric,
  p_starts_on date,
  p_ends_on date,
  p_active boolean,
  p_reason text
) returns public.upsell_rules
language plpgsql security definer set search_path = '' as $$
declare
  result public.upsell_rules;
begin
  perform private.set_change_reason(p_reason);
  if not private.can_manage_upsell(p_organization_id) then
    raise exception 'Sólo el admin corporativo configura las recomendaciones' using errcode = '42501';
  end if;
  if p_target_plan_id is not null
     and not exists (select 1 from public.membership_plans p
                      where p.id = p_target_plan_id and p.organization_id = p_organization_id) then
    raise exception 'Plan inexistente' using errcode = '22023';
  end if;
  if p_center_ids is not null and exists (
       select 1 from unnest(p_center_ids) c
        where not exists (select 1 from public.detail_centers d where d.id = c and d.organization_id = p_organization_id)) then
    raise exception 'Centro fuera de la organización' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.upsell_rules (organization_id, name, source_service_id, target_service_id, target_plan_id,
      stage, priority, pitch, channels, center_ids, min_order_total, starts_on, ends_on, active)
    values (p_organization_id, btrim(p_name), p_source_service_id, p_target_service_id, p_target_plan_id,
      p_stage, coalesce(p_priority, 50), btrim(p_pitch), coalesce(p_channels, '{b2c,membresia,b2b}'),
      nullif(p_center_ids, '{}'), p_min_order_total, coalesce(p_starts_on, current_date), p_ends_on,
      coalesce(p_active, true))
    returning * into result;
  else
    update public.upsell_rules
       set name = btrim(p_name), source_service_id = p_source_service_id, target_service_id = p_target_service_id,
           target_plan_id = p_target_plan_id, stage = p_stage, priority = coalesce(p_priority, 50),
           pitch = btrim(p_pitch), channels = coalesce(p_channels, '{b2c,membresia,b2b}'),
           center_ids = nullif(p_center_ids, '{}'), min_order_total = p_min_order_total,
           starts_on = coalesce(p_starts_on, starts_on), ends_on = p_ends_on, active = coalesce(p_active, true)
     where id = p_id and organization_id = p_organization_id
    returning * into result;
    if not found then
      raise exception 'Regla inexistente' using errcode = '22023';
    end if;
  end if;
  return result;
exception
  when check_violation then
    raise exception 'Regla inválida: un solo destino (servicio o plan), distinto del origen, y vigencia coherente'
      using errcode = '22023';
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Indicadores (sin datos personales; fórmulas en @meguiars/analytics)
-- ---------------------------------------------------------------------------

-- Por regla y centro: ofertas mostradas en el rango, aceptadas, rechazadas,
-- ingreso incremental realizado (valor vigente de la línea agregada, 0 si se
-- quitó o la OS se canceló) y valor de membresías aceptadas.
create function public.upsell_metric_facts(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  rule_id uuid,
  rule_name text,
  detail_center_id uuid,
  target_kind text,
  offered integer,
  accepted integer,
  rejected integer,
  orders integer,
  incremental_revenue numeric,
  membership_value numeric
)
language sql stable security definer set search_path = '' as $$
  select f.rule_id, r.name, f.detail_center_id,
         case when f.target_plan_id is null then 'servicio' else 'membresia' end,
         count(*)::integer,
         count(*) filter (where f.status = 'aceptada')::integer,
         count(*) filter (where f.status = 'rechazada')::integer,
         count(distinct f.service_order_id)::integer,
         coalesce(sum(i.line_subtotal - i.line_discount)
                    filter (where f.status = 'aceptada' and o.status <> 'cancelada'), 0),
         coalesce(sum(f.accepted_value) filter (where f.status = 'aceptada' and f.target_plan_id is not null), 0)
    from public.upsell_offers f
    join public.upsell_rules r on r.id = f.rule_id
    join public.service_orders o on o.id = f.service_order_id
    join public.detail_centers c on c.id = f.detail_center_id
    left join public.service_order_items i on i.id = f.accepted_item_id
   where f.detail_center_id = any (p_detail_center_ids)
     and private.can_read_upsell_metrics(f.detail_center_id)
     and (f.offered_at at time zone c.timezone)::date between p_from and p_to
   group by f.rule_id, r.name, f.detail_center_id, f.target_plan_id is null
   order by r.name;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.can_manage_upsell(uuid)',
    'private.can_read_upsell_metrics(uuid)',
    'private.upsell_stage(public.service_order_status)',
    'private.upsell_score(bigint, bigint)',
    'private.upsell_candidates(uuid, integer)',
    'private.decide_upsell_offer(uuid, uuid, text, uuid, numeric, text)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.upsell_suggestions(uuid, integer)',
    'public.accept_upsell(uuid, integer, uuid)',
    'public.reject_upsell(uuid, uuid, text)',
    'public.upsert_upsell_rule(uuid, uuid, text, uuid, uuid, uuid, text, smallint, text, text[], uuid[], numeric, date, date, boolean, text)',
    'public.upsell_metric_facts(uuid[], date, date)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
