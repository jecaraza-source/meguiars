-- C2 — Comercial / CRM de recurrencia y próxima visita.
--
-- Convierte el historial operativo en acciones comerciales sin duplicar ventas:
-- * contact_preferences: consentimiento por canal (llamada, whatsapp, sms,
--   email). Para whatsapp/sms/email se sincroniza con clients.marketing_* (una
--   sola verdad): el alta/edición de clientes y set_contact_preference escriben
--   lo mismo. Retirar un consentimiento cancela las tareas pendientes del canal.
-- * crm_tasks: cola de seguimientos (llamar, WhatsApp, email, renovar, ofrecer
--   mantenimiento). La plataforma NO envía mensajes: la tarea es la acción.
--   Un canal sin consentimiento no admite tareas (sólo "presencial").
-- * private.customer_order_facts: vista derivada de service_orders (visitas,
--   última visita, valor entregado, OS B2B) por cliente y centro. Las métricas y
--   el segmento se calculan siempre desde OS y membresías (no se guardan).
-- * Al terminar una OS: si no trae recomendación y tiene un servicio
--   recurrente, se recomienda volver en 30 días; con recomendación se crea la
--   tarea "ofrecer mantenimiento".
-- * crm_customers: lista y ficha comercial por centros
--   autorizados, con segmento (nuevo, recurrente, miembro, inactivo, B2B).
--
-- Escrituras sólo por RPC con motivo y auditoría. Compatible hacia atrás.

-- ---------------------------------------------------------------------------
-- 1. Consentimiento por canal
-- ---------------------------------------------------------------------------

create table public.contact_preferences (
  organization_id uuid not null,
  client_id uuid not null,
  channel text not null check (channel in ('llamada', 'whatsapp', 'sms', 'email')),
  opted_in boolean not null,
  source text not null check (source in ('web', 'mobile', 'migracion')),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_id, channel),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete cascade
);

-- Consentimiento vigente (espejo de los canales de clients.marketing_channels).
insert into public.contact_preferences (organization_id, client_id, channel, opted_in, source, updated_by, created_at, updated_at)
select c.organization_id, c.id, ch, true, 'migracion', null, coalesce(c.marketing_opt_in_at, now()), now()
  from public.clients c
  cross join lateral unnest(c.marketing_channels) ch;

create trigger contact_preferences_updated_at before update on public.contact_preferences
  for each row execute function private.set_updated_at();
create trigger contact_preferences_audit after insert or update or delete on public.contact_preferences
  for each row execute function private.audit_row();

-- Escritura única del consentimiento (security definer: la usan el trigger de
-- clientes y set_contact_preference, que ya validaron permisos).
create function private.put_contact_preference(p_client_id uuid, p_channel text, p_opted_in boolean, p_source text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.contact_preferences (organization_id, client_id, channel, opted_in, source, updated_by)
  select c.organization_id, c.id, p_channel, p_opted_in, coalesce(p_source, 'web'), auth.uid()
    from public.clients c
   where c.id = p_client_id
     and (p_opted_in or exists (select 1 from public.contact_preferences cp
                                 where cp.client_id = p_client_id and cp.channel = p_channel))
  on conflict (client_id, channel) do update
    set opted_in = excluded.opted_in, source = excluded.source, updated_by = excluded.updated_by
    where public.contact_preferences.opted_in is distinct from excluded.opted_in;
  if not p_opted_in then
    -- Sin consentimiento no quedan acciones pendientes por ese canal.
    update public.crm_tasks
       set status = 'cancelada', cancel_reason = 'El cliente retiró el consentimiento'
     where client_id = p_client_id and status = 'pendiente'
       and channel = p_channel;
  end if;
end;
$$;

-- Alta/edición de clientes (O1): los canales de marketing_channels son el consentimiento vigente.
create function private.sync_marketing_preferences() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  ch text;
begin
  if tg_op = 'UPDATE' and new.marketing_channels is not distinct from old.marketing_channels then
    return null;
  end if;
  foreach ch in array array['whatsapp', 'sms', 'email'] loop
    perform private.put_contact_preference(new.id, ch, ch = any (new.marketing_channels),
                                           coalesce(new.marketing_opt_in_source, 'web'));
  end loop;
  return null;
end;
$$;
create trigger clients_sync_marketing_preferences after insert or update of marketing_channels on public.clients
  for each row execute function private.sync_marketing_preferences();

-- ---------------------------------------------------------------------------
-- 2. Tareas y seguimientos
-- ---------------------------------------------------------------------------

create table public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  client_id uuid not null,
  vehicle_id uuid,
  kind text not null check (kind in ('llamar', 'whatsapp', 'email', 'renovar', 'ofrecer_mantenimiento')),
  -- Canal de contacto: los tipos de contacto fijan el suyo; renovar y ofrecer
  -- mantenimiento usan el canal con consentimiento o "presencial".
  channel text not null check (channel in ('llamada', 'whatsapp', 'email', 'presencial')),
  status text not null default 'pendiente' check (status in ('pendiente', 'hecha', 'cancelada')),
  due_on date not null,
  notes text check (notes is null or length(notes) <= 1000),
  source text not null default 'manual' check (source in ('manual', 'os_terminada', 'proxima_visita', 'membresia')),
  service_order_id uuid,
  membership_id uuid,
  recommended_service_id uuid,
  assigned_to uuid references auth.users (id) on delete set null,
  outcome text check (outcome in ('contactado', 'sin_respuesta', 'agendo_cita', 'renovo', 'no_interesado')),
  outcome_notes text check (outcome_notes is null or length(outcome_notes) <= 1000),
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  cancel_reason text,
  -- Evita generar dos veces la misma tarea automática (OS o vencimiento).
  dedupe_key text,
  request_id uuid,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind not in ('llamar', 'whatsapp', 'email')
         or channel = case kind when 'llamar' then 'llamada' else kind end),
  check ((status = 'hecha') = (outcome is not null and completed_at is not null)),
  check ((status = 'cancelada') = (cancel_reason is not null)),
  unique (organization_id, dedupe_key),
  unique (organization_id, request_id),
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete restrict,
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete restrict,
  foreign key (organization_id, vehicle_id) references public.vehicles (organization_id, id) on delete restrict,
  foreign key (organization_id, service_order_id) references public.service_orders (organization_id, id) on delete restrict,
  foreign key (organization_id, membership_id) references public.memberships (organization_id, id) on delete restrict,
  foreign key (organization_id, recommended_service_id) references public.services (organization_id, id) on delete restrict
);
create index crm_tasks_center_status_due_idx on public.crm_tasks (detail_center_id, status, due_on);
create index crm_tasks_client_idx on public.crm_tasks (client_id, status);
create index crm_tasks_order_idx on public.crm_tasks (service_order_id) where service_order_id is not null;
create index crm_tasks_membership_idx on public.crm_tasks (membership_id) where membership_id is not null;

create trigger crm_tasks_updated_at before update on public.crm_tasks
  for each row execute function private.set_updated_at();
create trigger crm_tasks_require_reason before insert or update or delete on public.crm_tasks
  for each row execute function private.require_change_reason();
create trigger crm_tasks_audit after insert or update or delete on public.crm_tasks
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- 3. Reglas (espejo en el dominio)
-- ---------------------------------------------------------------------------

-- Días sin visita para "inactivo", ventana de "próxima visita" y regreso por
-- defecto de un servicio recurrente (CRM_RULES en el dominio).
create function private.crm_rule(p_name text) returns integer
language sql immutable set search_path = '' as $$
  select case p_name
    when 'inactive_days' then 180
    when 'due_soon_days' then 14
    when 'recurrent_return_days' then 30
    when 'task_lead_days' then 3
  end;
$$;

-- Segmento (espejo de customerSegment). Prioridad: B2B > miembro > inactivo >
-- recurrente > nuevo.
create function private.customer_segment(
  p_kind text,
  p_b2b_orders bigint,
  p_membership_status text,
  p_visits bigint,
  p_last_visit date,
  p_today date
) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_kind = 'company' or coalesce(p_b2b_orders, 0) > 0 then 'b2b_contacto'
    when p_membership_status in ('activa', 'proxima_a_vencer') then 'miembro'
    when p_last_visit is not null and p_today - p_last_visit > private.crm_rule('inactive_days') then 'inactivo'
    when coalesce(p_visits, 0) >= 2 then 'recurrente'
    else 'nuevo'
  end;
$$;

-- Estado de la próxima visita (espejo de nextVisitState).
create function private.next_visit_state(p_next_visit date, p_today date) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_next_visit is null then null
    when p_next_visit < p_today then 'vencida'
    when p_next_visit <= p_today + private.crm_rule('due_soon_days') then 'proxima'
    else 'programada'
  end;
$$;

-- Canal con consentimiento preferido para contactar (whatsapp > llamada > email), o presencial.
create function private.best_contact_channel(p_client_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select cp.channel from public.contact_preferences cp
     where cp.client_id = p_client_id and cp.opted_in and cp.channel in ('whatsapp', 'llamada', 'email')
     order by array_position(array['whatsapp', 'llamada', 'email'], cp.channel)
     limit 1), 'presencial');
$$;

create function private.has_consent(p_client_id uuid, p_channel text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_channel = 'presencial' or exists (
    select 1 from public.contact_preferences cp
     where cp.client_id = p_client_id and cp.channel = p_channel and cp.opted_in);
$$;

-- crm.read / crm.write: quien puede ver clientes del centro.
create function private.can_use_crm(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_read_clients(p_detail_center_id);
$$;

-- ---------------------------------------------------------------------------
-- 4. Métricas derivadas (fuente: OS y membresías; nada se duplica)
-- ---------------------------------------------------------------------------

create view private.customer_order_facts as
select o.organization_id, o.detail_center_id, o.client_id,
       count(*) filter (where o.status <> 'cancelada') as visits,
       max(o.created_at) filter (where o.status <> 'cancelada') as last_visit_at,
       coalesce(sum(o.total) filter (where o.status = 'entregada'), 0)::numeric(14, 2) as services_value,
       count(*) filter (where o.status = 'entregada') as delivered_orders,
       count(*) filter (where o.channel = 'b2b' and o.status <> 'cancelada') as b2b_orders
  from public.service_orders o
 group by o.organization_id, o.detail_center_id, o.client_id;
revoke all on private.customer_order_facts from public, anon, authenticated;

-- Filas CRM de los clientes ligados a los centros dados (sin chequeo de
-- permisos: lo hacen las funciones públicas).
create function private.crm_rows(p_centers uuid[], p_today date, p_timezone text, p_client_id uuid default null)
returns table (
  client_id uuid,
  full_name text,
  phone text,
  email text,
  kind text,
  segment text,
  visits integer,
  last_visit_at timestamptz,
  services_value numeric,
  membership_value numeric,
  lifetime_value numeric,
  membership_id uuid,
  membership_number text,
  membership_plan text,
  membership_status text,
  membership_ends_on date,
  next_visit_on date,
  next_visit_state text,
  next_visit_service text,
  next_visit_order_id uuid,
  next_visit_folio text,
  open_tasks integer,
  opted_in_channels text[]
)
language sql stable set search_path = '' as $$
  with cl as (
    select distinct c.id, c.full_name, c.phone, c.email, c.kind
      from public.client_centers cc
      join public.clients c on c.id = cc.client_id and c.active
     where cc.detail_center_id = any (p_centers)
       and (p_client_id is null or c.id = p_client_id)
  ), f as (
    select f.client_id, sum(f.visits)::integer as visits, max(f.last_visit_at) as last_visit_at,
           sum(f.services_value) as services_value, sum(f.b2b_orders)::bigint as b2b_orders
      from private.customer_order_facts f
     where f.detail_center_id = any (p_centers) and f.client_id in (select id from cl)
     group by f.client_id
  ), mem as (
    select distinct on (m.client_id) m.client_id, m.id, m.number, m.plan_name,
           private.membership_status(m.state, m.ends_on, m.renewal_notice_days, p_today) as status, m.ends_on
      from public.memberships m
     where m.client_id in (select id from cl) and m.state <> 'cancelada'
     order by m.client_id,
              array_position(array['activa', 'proxima_a_vencer', 'vencida', 'suspendida'],
                             private.membership_status(m.state, m.ends_on, m.renewal_notice_days, p_today)),
              m.ends_on desc
  ), mval as (
    select m.client_id, coalesce(sum(e.amount), 0) as value
      from public.memberships m
      join public.membership_events e on e.membership_id = m.id and e.kind in ('alta', 'renovacion')
     where m.client_id in (select id from cl) and m.detail_center_id = any (p_centers)
     group by m.client_id
  ), nv as (
    select distinct on (o.client_id) o.client_id, o.id, o.folio, o.next_visit_on, s.name as service_name
      from public.service_orders o
      left join public.services s on s.id = o.next_visit_service_id
     where o.client_id in (select id from cl) and o.detail_center_id = any (p_centers)
       and o.status <> 'cancelada' and o.next_visit_on is not null
     order by o.client_id, coalesce(o.finished_at, o.created_at) desc, o.folio_number desc
  ), t as (
    select k.client_id, count(*)::integer as open_tasks
      from public.crm_tasks k
     where k.status = 'pendiente' and k.detail_center_id = any (p_centers) and k.client_id in (select id from cl)
     group by k.client_id
  ), cp as (
    select p.client_id, array_agg(p.channel order by p.channel) as channels
      from public.contact_preferences p
     where p.opted_in and p.client_id in (select id from cl)
     group by p.client_id
  )
  select cl.id, cl.full_name, cl.phone, cl.email, cl.kind,
         private.customer_segment(cl.kind, f.b2b_orders, mem.status, f.visits::bigint,
           (f.last_visit_at at time zone p_timezone)::date, p_today),
         coalesce(f.visits, 0), f.last_visit_at,
         coalesce(f.services_value, 0), coalesce(mval.value, 0),
         coalesce(f.services_value, 0) + coalesce(mval.value, 0),
         mem.id, mem.number, mem.plan_name, mem.status, mem.ends_on,
         nv.next_visit_on, private.next_visit_state(nv.next_visit_on, p_today), nv.service_name, nv.id, nv.folio,
         coalesce(t.open_tasks, 0), coalesce(cp.channels, '{}')
    from cl
    left join f on f.client_id = cl.id
    left join mem on mem.client_id = cl.id
    left join mval on mval.client_id = cl.id
    left join nv on nv.client_id = cl.id
    left join t on t.client_id = cl.id
    left join cp on cp.client_id = cl.id;
$$;

-- Centros de la lista en los que el usuario puede usar el CRM.
create function private.crm_centers(p_detail_center_ids uuid[]) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(c), '{}') from unnest(p_detail_center_ids) c where private.can_use_crm(c);
$$;

-- Lista CRM por centros autorizados, segmento y próxima visita.
-- Con p_client_id devuelve la ficha comercial de ese cliente (vacía si no lo ve).
create function public.crm_customers(
  p_detail_center_ids uuid[],
  p_segment text default null,
  p_due text default null,
  p_query text default null,
  p_limit integer default 100,
  p_client_id uuid default null
)
returns table (
  client_id uuid,
  full_name text,
  phone text,
  email text,
  kind text,
  segment text,
  visits integer,
  last_visit_at timestamptz,
  services_value numeric,
  membership_value numeric,
  lifetime_value numeric,
  membership_id uuid,
  membership_number text,
  membership_plan text,
  membership_status text,
  membership_ends_on date,
  next_visit_on date,
  next_visit_state text,
  next_visit_service text,
  next_visit_order_id uuid,
  next_visit_folio text,
  open_tasks integer,
  opted_in_channels text[]
)
language sql stable security definer set search_path = '' as $$
  with ctx as (
    select x.centers, private.center_today(x.centers[1]) as today,
           coalesce((select c.timezone from public.detail_centers c where c.id = x.centers[1]), 'UTC') as tz
      from (select private.crm_centers(p_detail_center_ids) as centers) x
  )
  select r.*
    from ctx, private.crm_rows(ctx.centers, ctx.today, ctx.tz, p_client_id) r
   where (p_segment is null or r.segment = p_segment)
     and (p_due is null or r.next_visit_state = p_due)
     and (nullif(btrim(p_query), '') is null
          or r.full_name ilike '%' || private.like_escape(btrim(p_query)) || '%'
          or r.phone like '%' || regexp_replace(p_query, '\D', '', 'g') || '%'
          and length(regexp_replace(p_query, '\D', '', 'g')) >= 4)
   order by r.next_visit_on nulls last, r.full_name
   limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

-- ---------------------------------------------------------------------------
-- 5. OS terminada → próxima recomendación y tarea
-- ---------------------------------------------------------------------------

-- Crea una tarea automática una sola vez por llave (security definer: la
-- invocan triggers y RPC que ya validaron permisos).
create function private.enqueue_crm_task(
  p_organization_id uuid,
  p_detail_center_id uuid,
  p_client_id uuid,
  p_vehicle_id uuid,
  p_kind text,
  p_due_on date,
  p_source text,
  p_dedupe_key text,
  p_notes text default null,
  p_service_order_id uuid default null,
  p_membership_id uuid default null,
  p_recommended_service_id uuid default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  inserted integer;
begin
  perform set_config('app.change_reason', 'Seguimiento automático: ' || p_source, true);
  insert into public.crm_tasks (organization_id, detail_center_id, client_id, vehicle_id, kind, channel, due_on,
    notes, source, service_order_id, membership_id, recommended_service_id, dedupe_key)
  values (p_organization_id, p_detail_center_id, p_client_id, p_vehicle_id, p_kind,
    private.best_contact_channel(p_client_id), p_due_on, p_notes, p_source, p_service_order_id, p_membership_id,
    p_recommended_service_id, p_dedupe_key)
  on conflict (organization_id, dedupe_key) do nothing;
  get diagnostics inserted = row_count;
  -- La recomendación de la OS más reciente reemplaza las de mantenimiento
  -- pendientes del mismo cliente en el centro (una sola en la cola).
  if inserted > 0 and p_source = 'os_terminada' then
    perform set_config('app.change_reason', 'Reemplazada por una recomendación más reciente', true);
    update public.crm_tasks t
       set status = 'cancelada', cancel_reason = 'Reemplazada por una recomendación más reciente'
     where t.organization_id = p_organization_id
       and t.detail_center_id = p_detail_center_id
       and t.client_id = p_client_id
       and t.status = 'pendiente'
       and t.kind = 'ofrecer_mantenimiento'
       and t.source in ('os_terminada', 'proxima_visita')
       and t.dedupe_key is distinct from p_dedupe_key;
  end if;
  return inserted > 0;
end;
$$;

-- Antes de guardar "terminada": sin recomendación y con un servicio recurrente
-- se recomienda volver en 30 días (el mismo servicio).
create function private.default_next_visit() returns trigger
language plpgsql set search_path = '' as $$
declare
  svc uuid;
begin
  if new.status = 'terminada' and old.status is distinct from 'terminada' and new.next_visit_on is null then
    select i.service_id into svc from public.service_order_items i
     where i.service_order_id = new.id and i.revenue_engine = 'recurrente'
     order by i.position limit 1;
    if svc is not null then
      new.next_visit_on := private.center_today(new.detail_center_id) + private.crm_rule('recurrent_return_days');
      new.next_visit_service_id := svc;
    end if;
  end if;
  return new;
end;
$$;
create trigger service_orders_default_next_visit before update of status on public.service_orders
  for each row execute function private.default_next_visit();

create function private.task_from_finished_order() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'terminada' and old.status is distinct from 'terminada' and new.next_visit_on is not null then
    perform private.enqueue_crm_task(new.organization_id, new.detail_center_id, new.client_id, new.vehicle_id,
      'ofrecer_mantenimiento',
      greatest(private.center_today(new.detail_center_id), new.next_visit_on - private.crm_rule('task_lead_days')),
      'os_terminada', 'os:' || new.id, new.next_visit_notes, new.id, null, new.next_visit_service_id);
  end if;
  return null;
end;
$$;
create trigger service_orders_task_from_finished after update of status on public.service_orders
  for each row execute function private.task_from_finished_order();

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------

alter table public.contact_preferences enable row level security;
alter table public.crm_tasks enable row level security;

create policy contact_preferences_select on public.contact_preferences
  for select to authenticated using (private.can_see_client(client_id));

create policy crm_tasks_select on public.crm_tasks
  for select to authenticated using (private.can_use_crm(detail_center_id));
create policy crm_tasks_insert on public.crm_tasks
  for insert to authenticated with check (private.can_use_crm(detail_center_id));
create policy crm_tasks_update on public.crm_tasks for update to authenticated
  using (private.can_use_crm(detail_center_id)) with check (private.can_use_crm(detail_center_id));

revoke all on public.contact_preferences, public.crm_tasks from anon;
revoke insert, update, delete, truncate on public.contact_preferences from authenticated;
revoke delete, truncate on public.crm_tasks from authenticated;

-- ---------------------------------------------------------------------------
-- 7. RPC
-- ---------------------------------------------------------------------------

-- Consentimiento por canal. whatsapp/sms/email también actualizan
-- clients.marketing_* (el trigger sincroniza contact_preferences).
create function public.set_contact_preference(
  p_client_id uuid,
  p_channel text,
  p_opted_in boolean,
  p_source text,
  p_reason text
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  c public.clients;
  channels text[];
begin
  perform private.set_change_reason(p_reason);
  select * into c from public.clients where id = p_client_id;
  if not found or not private.can_edit_client(p_client_id) then
    raise exception 'Cliente inexistente o sin permiso para editarlo' using errcode = '42501';
  end if;
  if p_channel not in ('llamada', 'whatsapp', 'sms', 'email') or p_source not in ('web', 'mobile') or p_opted_in is null then
    raise exception 'Preferencia inválida' using errcode = '22023';
  end if;
  if p_channel = 'llamada' then
    perform private.put_contact_preference(p_client_id, p_channel, p_opted_in, p_source);
    return;
  end if;
  channels := array(select x from unnest(c.marketing_channels) x where x <> p_channel order by x);
  if p_opted_in then
    channels := array(select x from unnest(channels || p_channel) x order by x);
  end if;
  update public.clients
     set marketing_opt_in = cardinality(channels) > 0,
         marketing_channels = channels,
         marketing_opt_in_at = now(),
         marketing_opt_in_source = p_source
   where id = p_client_id;
end;
$$;

create function public.create_crm_task(
  p_detail_center_id uuid,
  p_request_id uuid,
  p_client_id uuid,
  p_kind text,
  p_channel text,
  p_due_on date,
  p_notes text default null,
  p_vehicle_id uuid default null,
  p_assigned_to uuid default null
) returns public.crm_tasks
language plpgsql security invoker set search_path = '' as $$
declare
  center public.detail_centers;
  v_channel text := case p_kind when 'llamar' then 'llamada' when 'whatsapp' then 'whatsapp'
                                when 'email' then 'email' else coalesce(p_channel, 'presencial') end;
  result public.crm_tasks;
begin
  select * into center from public.detail_centers where id = p_detail_center_id;
  if not found or not private.can_use_crm(p_detail_center_id) then
    raise exception 'Sin permiso para el CRM de este centro' using errcode = '42501';
  end if;
  select * into result from public.crm_tasks
   where organization_id = center.organization_id and request_id = p_request_id;
  if found then
    return result;
  end if;
  if not exists (select 1 from public.client_centers cc
                  where cc.client_id = p_client_id and cc.detail_center_id = p_detail_center_id) then
    raise exception 'El cliente no está ligado a este centro' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('llamar', 'whatsapp', 'email', 'renovar', 'ofrecer_mantenimiento')
     or v_channel not in ('llamada', 'whatsapp', 'email', 'presencial') then
    raise exception 'Tipo o canal de seguimiento inválido' using errcode = '22023';
  end if;
  if not private.has_consent(p_client_id, v_channel) then
    raise exception 'El cliente no aceptó contacto por %', v_channel using errcode = 'MG002';
  end if;
  if p_due_on is null or p_due_on < private.center_today(p_detail_center_id) then
    raise exception 'La fecha del seguimiento debe ser hoy o posterior' using errcode = '22023';
  end if;
  perform private.set_change_reason('Seguimiento manual');
  insert into public.crm_tasks (organization_id, detail_center_id, client_id, vehicle_id, kind, channel, due_on, notes,
    source, assigned_to, request_id)
  values (center.organization_id, center.id, p_client_id, p_vehicle_id, p_kind, v_channel, p_due_on,
    nullif(btrim(p_notes), ''), 'manual', p_assigned_to, p_request_id)
  returning * into result;
  return result;
end;
$$;

create function public.complete_crm_task(p_task_id uuid, p_outcome text, p_notes text default null)
returns public.crm_tasks
language plpgsql security invoker set search_path = '' as $$
declare
  t public.crm_tasks;
begin
  select * into t from public.crm_tasks where id = p_task_id for update;
  if not found then
    raise exception 'Seguimiento inexistente o sin permiso' using errcode = '42501';
  end if;
  if t.status <> 'pendiente' then
    raise exception 'El seguimiento ya estaba cerrado' using errcode = '22023';
  end if;
  if not private.has_consent(t.client_id, t.channel) then
    raise exception 'El cliente ya no acepta contacto por %', t.channel using errcode = 'MG002';
  end if;
  perform private.set_change_reason('Seguimiento: ' || coalesce(p_outcome, ''));
  update public.crm_tasks
     set status = 'hecha', outcome = p_outcome, outcome_notes = nullif(btrim(p_notes), ''),
         completed_at = now(), completed_by = auth.uid()
   where id = t.id
  returning * into t;
  return t;
end;
$$;

create function public.cancel_crm_task(p_task_id uuid, p_reason text)
returns public.crm_tasks
language plpgsql security invoker set search_path = '' as $$
declare
  t public.crm_tasks;
begin
  perform private.set_change_reason(p_reason);
  select * into t from public.crm_tasks where id = p_task_id for update;
  if not found then
    raise exception 'Seguimiento inexistente o sin permiso' using errcode = '42501';
  end if;
  if t.status <> 'pendiente' then
    raise exception 'El seguimiento ya estaba cerrado' using errcode = '22023';
  end if;
  update public.crm_tasks set status = 'cancelada', cancel_reason = btrim(p_reason) where id = t.id returning * into t;
  return t;
end;
$$;

create function public.reschedule_crm_task(p_task_id uuid, p_due_on date, p_reason text)
returns public.crm_tasks
language plpgsql security invoker set search_path = '' as $$
declare
  t public.crm_tasks;
begin
  perform private.set_change_reason(p_reason);
  select * into t from public.crm_tasks where id = p_task_id for update;
  if not found then
    raise exception 'Seguimiento inexistente o sin permiso' using errcode = '42501';
  end if;
  if t.status <> 'pendiente' then
    raise exception 'El seguimiento ya estaba cerrado' using errcode = '22023';
  end if;
  if p_due_on is null or p_due_on < private.center_today(t.detail_center_id) then
    raise exception 'La fecha del seguimiento debe ser hoy o posterior' using errcode = '22023';
  end if;
  update public.crm_tasks set due_on = p_due_on where id = t.id returning * into t;
  return t;
end;
$$;

-- Genera los seguimientos pendientes del centro (idempotente por llave):
-- * renovar: membresías del centro próximas a vencer o vencidas hace ≤ 30 días;
-- * ofrecer mantenimiento: próxima visita vencida (≤ 30 días) o dentro de la ventana.
-- Security definer tras validar el permiso: comercial B2B no lee OS pero sí
-- puede generar sus seguimientos.
create function public.generate_crm_tasks(p_detail_center_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  today date;
  created integer := 0;
  r record;
begin
  if not private.can_use_crm(p_detail_center_id) then
    raise exception 'Sin permiso para el CRM de este centro' using errcode = '42501';
  end if;
  today := private.center_today(p_detail_center_id);
  for r in
    select m.* from public.memberships m
     where m.detail_center_id = p_detail_center_id and m.state = 'activa'
       and private.membership_status(m.state, m.ends_on, m.renewal_notice_days, today) in ('proxima_a_vencer', 'vencida')
       and m.ends_on >= today - 30
  loop
    if private.enqueue_crm_task(r.organization_id, r.detail_center_id, r.client_id, r.vehicle_id, 'renovar',
         today, 'membresia', 'mem:' || r.id || ':' || r.ends_on,
         'Membresía ' || r.number || ' vence el ' || to_char(r.ends_on, 'DD/MM/YYYY'), null, r.id, null) then
      created := created + 1;
    end if;
  end loop;
  for r in
    select distinct on (o.client_id) o.* from public.service_orders o
     where o.detail_center_id = p_detail_center_id and o.status <> 'cancelada' and o.next_visit_on is not null
     order by o.client_id, coalesce(o.finished_at, o.created_at) desc, o.folio_number desc
  loop
    if r.next_visit_on between today - 30 and today + private.crm_rule('due_soon_days')
       and private.enqueue_crm_task(r.organization_id, r.detail_center_id, r.client_id, r.vehicle_id,
             'ofrecer_mantenimiento', greatest(today, r.next_visit_on - private.crm_rule('task_lead_days')),
             'proxima_visita', 'os:' || r.id, r.next_visit_notes, r.id, null, r.next_visit_service_id) then
      created := created + 1;
    end if;
  end loop;
  return created;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.put_contact_preference(uuid, text, boolean, text)',
    'private.crm_rule(text)',
    'private.customer_segment(text, bigint, text, bigint, date, date)',
    'private.next_visit_state(date, date)',
    'private.best_contact_channel(uuid)',
    'private.has_consent(uuid, text)',
    'private.can_use_crm(uuid)',
    'private.crm_rows(uuid[], date, text, uuid)',
    'private.crm_centers(uuid[])',
    'private.enqueue_crm_task(uuid, uuid, uuid, uuid, text, date, text, text, text, uuid, uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.set_contact_preference(uuid, text, boolean, text, text)',
    'public.create_crm_task(uuid, uuid, uuid, text, text, date, text, uuid, uuid)',
    'public.complete_crm_task(uuid, text, text)',
    'public.cancel_crm_task(uuid, text)',
    'public.reschedule_crm_task(uuid, date, text)',
    'public.generate_crm_tasks(uuid)',
    'public.crm_customers(uuid[], text, text, text, integer, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
