-- CR2 (fase 1) — Base comercial: prospectos, embudo configurable, cotizaciones,
-- reserva, venta ligada, duplicados con fusión supervisada, segmentación y
-- métricas internas del recorrido
--   consulta → prospecto → cotización → reserva → servicio realizado.
--
-- * lead_stages: embudo de prospectos por organización (configurable por el
--   admin corporativo). Iniciales: nuevo, contactado, cotizado, pendiente de
--   reserva, reservado (abiertas), ganado y perdido. Tres etapas llevan un
--   hito (contactado, cotizado, reservado): el prospecto avanza solo al
--   registrar el primer contacto, cotizar o reservar, nunca hacia atrás.
-- * leads: prospecto con canal de origen (Instagram, Facebook, WhatsApp,
--   Google, recomendación, sitio web, otro), servicios de interés,
--   consentimiento de contacto, responsable, siguiente acción, motivo de
--   pérdida y, al convertirse, cliente y OS que lo ganó.
-- * lead_events: historial inmutable; fuente única de las métricas del embudo.
-- * crm_tasks.lead_id: tareas y recordatorios del prospecto en la cola del CRM.
-- * quotes / quote_items / quote_discounts: cotización con precios, costos y %
--   del operador congelados al cotizar, margen de contribución estimado y
--   descuentos con el mismo nivel de autorización que la OS.
-- * book_quote: la cotización se convierte en cita (reserva) sin recapturar.
--   La OS que se abre desde esa cita respeta el precio cotizado
--   (price_source 'cotizacion'), las cantidades y los descuentos autorizados;
--   el costo y el % del operador son los vigentes al vender (ADR 0026).
-- * Al entregarse esa OS el prospecto queda ganado con su valor (una venta se
--   atribuye a un solo prospecto).
-- * Duplicados: candidatos por teléfono (últimos 10 dígitos) o email; nunca
--   sólo por nombre. La fusión es supervisada y no reescribe documentos
--   (OS, pagos, membresías): el duplicado queda inactivo y apunta al cliente
--   que se conserva (merged_into_id); la ficha y el CRM leen ambos.
-- * commercial_segment: segmentación por servicios contratados, frecuencia,
--   gasto, interés, tiempo desde la última visita y consentimiento.
-- * commercial_funnel_facts / commercial_quote_facts: hechos sin datos
--   personales para los indicadores (el contador también los lee).
--
-- Escrituras sólo por RPC con motivo y auditoría. Compatible hacia atrás.

-- ---------------------------------------------------------------------------
-- 1. Permisos
-- ---------------------------------------------------------------------------

-- leads.use: prospectos y cotizaciones del centro (recepción también atiende
-- consultas por WhatsApp o en mostrador).
create function private.can_use_leads(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(
    p_detail_center_id, array['admin_socio', 'encargado', 'operador_recepcion', 'comercial_b2b']::public.app_role[]);
$$;

-- commercial.metrics: indicadores sin datos personales (el contador también).
create function private.can_read_commercial_metrics(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(
    p_detail_center_id, array['admin_socio', 'encargado', 'comercial_b2b', 'contador']::public.app_role[]);
$$;

-- clients.merge: fusionar duplicados (admin o encargado del centro).
create function private.can_merge_clients(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(p_detail_center_id, array['admin_socio', 'encargado']::public.app_role[]);
$$;

-- leads.manage: etapas del embudo de la organización (admin corporativo).
create function private.can_manage_lead_stages(p_organization_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_org_role(p_organization_id, array['admin_socio']::public.app_role[]);
$$;

-- ---------------------------------------------------------------------------
-- 2. Clientes fusionados
-- ---------------------------------------------------------------------------

alter table public.clients
  add column merged_into_id uuid,
  add column merged_at timestamptz,
  add column merged_by uuid references auth.users (id) on delete set null,
  add constraint clients_merged_into_fk foreign key (organization_id, merged_into_id)
    references public.clients (organization_id, id) on delete restrict,
  add constraint clients_merged_inactive check (merged_into_id is null or (not active and merged_at is not null)),
  add constraint clients_not_merged_into_self check (merged_into_id is distinct from id);
create index clients_merged_into_idx on public.clients (merged_into_id) where merged_into_id is not null;

comment on column public.clients.merged_into_id is
  'Duplicado fusionado: cliente que se conserva. Sus OS, pagos y membresías no se reescriben; la ficha y el CRM los leen.';

-- El cliente y los que se fusionaron en él (un solo nivel: la fusión aplana).
create function private.client_family(p_client_id uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select array[p_client_id] || coalesce(
    (select array_agg(c.id order by c.merged_at) from public.clients c where c.merged_into_id = p_client_id), '{}');
$$;

-- Cliente vigente de un registro (el propio o aquel en el que se fusionó).
create function private.client_root(p_client_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(c.merged_into_id, c.id) from public.clients c where c.id = p_client_id;
$$;

-- Métricas CRM por cliente vigente: las OS de un duplicado fusionado cuentan
-- para el cliente que se conservó (mismas columnas que en C2).
create or replace view private.customer_order_facts as
select o.organization_id, o.detail_center_id, coalesce(c.merged_into_id, o.client_id) as client_id,
       count(*) filter (where o.status <> 'cancelada') as visits,
       max(o.created_at) filter (where o.status <> 'cancelada') as last_visit_at,
       coalesce(sum(o.total) filter (where o.status = 'entregada'), 0)::numeric(14, 2) as services_value,
       count(*) filter (where o.status = 'entregada') as delivered_orders,
       count(*) filter (where o.channel = 'b2b' and o.status <> 'cancelada') as b2b_orders
  from public.service_orders o
  join public.clients c on c.id = o.client_id
 group by o.organization_id, o.detail_center_id, coalesce(c.merged_into_id, o.client_id);
revoke all on private.customer_order_facts from public, anon, authenticated;

-- Historial del cliente: incluye el de los duplicados fusionados en él.
create or replace function public.client_history(p_client_id uuid)
returns table (
  occurred_at timestamptz,
  kind text,
  detail_center_id uuid,
  detail_center_name text,
  title text,
  vehicle_id uuid
)
language sql stable security invoker set search_path = '' as $$
  with fam as (
    select unnest(private.client_family(p_client_id)) as id
     where exists (select 1 from public.clients c where c.id = p_client_id)
  ), entries as (
    select c.created_at as occurred_at, 'client_created' as kind, c.created_in_detail_center_id as center_id,
           'Alta del cliente' as title, null::uuid as vehicle_id
    from public.clients c where c.id = p_client_id
    union all
    select c.merged_at, 'client_merged', c.created_in_detail_center_id,
           'Se fusionó un duplicado: ' || c.full_name, null
    from public.clients c where c.merged_into_id = p_client_id
    union all
    select v.created_at, 'vehicle_added', v.created_in_detail_center_id,
           'Vehículo ' || v.make || ' ' || v.model || ' ' || v.year || ' (' || v.plate || ')', v.id
    from public.vehicles v where v.client_id in (select id from fam)
    union all
    select cc.first_seen_at, 'center_linked', cc.detail_center_id, 'Primera atención en el centro', null
    from public.client_centers cc
    join public.clients c on c.id = cc.client_id
    where cc.client_id = p_client_id and cc.detail_center_id <> c.created_in_detail_center_id
    union all
    select cc.last_visit_at, 'visit', cc.detail_center_id, 'Última visita', null
    from public.client_centers cc
    where cc.client_id = p_client_id and cc.last_visit_at is not null
  )
  select e.occurred_at, e.kind, e.center_id, dc.name, e.title, e.vehicle_id
  from entries e
  join public.detail_centers dc on dc.id = e.center_id
  where private.can_read_clients(e.center_id)
  order by e.occurred_at desc, e.kind;
$$;

-- ---------------------------------------------------------------------------
-- 3. Embudo de prospectos
-- ---------------------------------------------------------------------------

create table public.lead_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (length(btrim(name)) between 2 and 60),
  kind text not null check (kind in ('abierta', 'ganada', 'perdida')),
  -- Hito que mueve al prospecto solo (a lo más una etapa por hito).
  milestone text check (milestone in ('contactado', 'cotizado', 'reservado')),
  position smallint not null check (position between 1 and 99),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, code),
  check (kind = 'abierta' or (active and milestone is null))
);
create unique index lead_stages_one_won on public.lead_stages (organization_id) where kind = 'ganada';
create unique index lead_stages_one_lost on public.lead_stages (organization_id) where kind = 'perdida';
create unique index lead_stages_one_milestone on public.lead_stages (organization_id, milestone) where milestone is not null;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  full_name text not null check (length(btrim(full_name)) between 2 and 120),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (
    email is null
    or (email = lower(email) and length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  -- Usuario en redes (p. ej. @usuario) cuando la consulta llegó por mensaje directo.
  social_handle text check (social_handle is null or length(btrim(social_handle)) between 2 and 80),
  source_channel text not null check (source_channel in (
    'instagram', 'facebook', 'whatsapp', 'google', 'recomendacion', 'sitio_web', 'otro')),
  source_detail text check (source_detail is null or length(btrim(source_detail)) between 2 and 200),
  referred_by_client_id uuid,
  -- Cliente al que corresponde (existente o registrado al convertir).
  client_id uuid,
  vehicle_description text check (vehicle_description is null or length(btrim(vehicle_description)) between 2 and 120),
  notes text check (notes is null or length(notes) <= 2000),
  -- Canales por los que aceptó recibir promociones (lo operativo de su consulta no lo requiere).
  consent_channels text[] not null default '{}'
    check (consent_channels <@ array['llamada', 'whatsapp', 'sms', 'email']::text[]),
  consent_at timestamptz,
  estimated_value numeric(12, 2) check (estimated_value is null or estimated_value >= 0),
  stage_id uuid not null,
  status text not null default 'abierta' check (status in ('abierta', 'ganada', 'perdida')),
  owner_id uuid references auth.users (id) on delete set null,
  next_action text check (next_action is null or length(btrim(next_action)) between 2 and 200),
  next_action_on date,
  first_contact_at timestamptz,
  closed_at timestamptz,
  won_value numeric(12, 2) check (won_value is null or won_value >= 0),
  service_order_id uuid,
  loss_reason text check (loss_reason in (
    'precio', 'sin_respuesta', 'competencia', 'sin_disponibilidad', 'fuera_de_zona', 'no_califica', 'otro')),
  loss_notes text check (loss_notes is null or length(loss_notes) <= 1000),
  phone_key text generated always as (right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10)) stored,
  version integer not null default 1,
  request_id uuid not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, request_id),
  check (phone is not null or email is not null or social_handle is not null),
  check ((cardinality(consent_channels) > 0) = (consent_at is not null)),
  check ((status = 'abierta') = (closed_at is null)),
  check ((status = 'ganada') = (won_value is not null)),
  check ((status = 'perdida') = (loss_reason is not null)),
  check (status = 'ganada' or service_order_id is null),
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete restrict,
  foreign key (organization_id, stage_id) references public.lead_stages (organization_id, id) on delete restrict,
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete restrict,
  foreign key (organization_id, referred_by_client_id) references public.clients (organization_id, id) on delete restrict,
  foreign key (organization_id, service_order_id) references public.service_orders (organization_id, id) on delete restrict
);
create index leads_center_status_idx on public.leads (detail_center_id, status, stage_id);
create index leads_owner_idx on public.leads (owner_id) where status = 'abierta';
create index leads_client_idx on public.leads (client_id) where client_id is not null;
create index leads_org_phone_idx on public.leads (organization_id, phone_key) where phone is not null;
create index leads_org_email_idx on public.leads (organization_id, email) where email is not null;
-- Una venta se atribuye a un solo prospecto.
create unique index leads_service_order_key on public.leads (service_order_id) where service_order_id is not null;

create table public.lead_services (
  lead_id uuid not null,
  service_id uuid not null,
  organization_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (lead_id, service_id),
  foreign key (organization_id, lead_id) references public.leads (organization_id, id) on delete cascade,
  foreign key (organization_id, service_id) references public.services (organization_id, id) on delete restrict
);
create index lead_services_service_idx on public.lead_services (service_id);

-- Historial inmutable del prospecto: fuente de las métricas del embudo.
create table public.lead_events (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  organization_id uuid not null,
  detail_center_id uuid not null,
  lead_id uuid not null,
  kind text not null check (kind in (
    'creado', 'etapa', 'responsable', 'nota', 'contacto', 'cotizacion', 'reserva', 'ganado', 'perdido',
    'reabierto', 'cliente', 'fusion')),
  -- Instantánea para métricas reproducibles.
  source_channel text not null,
  from_stage_id uuid,
  to_stage_id uuid,
  value numeric(12, 2) check (value is null or value >= 0),
  owner_id uuid references auth.users (id) on delete set null,
  channel text check (channel in ('llamada', 'whatsapp', 'sms', 'email', 'presencial', 'redes')),
  quote_id uuid,
  appointment_id uuid,
  service_order_id uuid,
  note text check (note is null or length(note) <= 2000),
  actor_id uuid default auth.uid() references auth.users (id) on delete set null,
  occurred_at timestamptz not null default now(),
  unique (seq),
  check (kind not in ('creado', 'etapa', 'reabierto') or to_stage_id is not null),
  check (kind <> 'nota' or note is not null),
  check (kind <> 'ganado' or value is not null),
  foreign key (organization_id, lead_id) references public.leads (organization_id, id) on delete restrict,
  foreign key (organization_id, from_stage_id) references public.lead_stages (organization_id, id) on delete restrict,
  foreign key (organization_id, to_stage_id) references public.lead_stages (organization_id, id) on delete restrict
);
create index lead_events_lead_idx on public.lead_events (lead_id, seq);
create index lead_events_center_idx on public.lead_events (detail_center_id, occurred_at);

-- Tareas y recordatorios del prospecto en la cola del CRM.
alter table public.crm_tasks
  add column lead_id uuid,
  add constraint crm_tasks_lead_fk foreign key (organization_id, lead_id)
    references public.leads (organization_id, id) on delete restrict;
alter table public.crm_tasks drop constraint crm_tasks_client_or_opportunity;
alter table public.crm_tasks add constraint crm_tasks_client_or_opportunity
  check (client_id is not null or opportunity_id is not null or lead_id is not null);
alter table public.crm_tasks drop constraint crm_tasks_source_check;
alter table public.crm_tasks add constraint crm_tasks_source_check
  check (source in ('manual', 'os_terminada', 'proxima_visita', 'membresia', 'oportunidad', 'prospecto'));
alter table public.crm_tasks add constraint crm_tasks_lead_source
  check ((lead_id is not null) = (source = 'prospecto'));
create index crm_tasks_lead_idx on public.crm_tasks (lead_id) where lead_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Cotizaciones
-- ---------------------------------------------------------------------------

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  folio text not null,
  folio_number integer not null,
  lead_id uuid,
  client_id uuid,
  vehicle_id uuid,
  -- Contacto al cotizar (del prospecto o del cliente), para mostrar y enviar.
  contact_name text not null check (length(btrim(contact_name)) between 2 and 120),
  status text not null default 'borrador'
    check (status in ('borrador', 'enviada', 'aceptada', 'rechazada', 'cancelada', 'convertida')),
  valid_until date not null,
  subtotal numeric(12, 2) not null default 0,
  discount_total numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  -- Costo estimado: otros costos directos + pago al operador (congelados al cotizar).
  standard_cost_total numeric(12, 2) not null default 0,
  operator_pay_total numeric(12, 2) not null default 0,
  cost_total numeric(12, 2) generated always as (standard_cost_total + operator_pay_total) stored,
  contribution_margin numeric(12, 2) generated always as (total - standard_cost_total - operator_pay_total) stored,
  notes text check (notes is null or length(notes) <= 2000),
  appointment_id uuid,
  sent_at timestamptz,
  decided_at timestamptz,
  decision_reason text check (decision_reason is null or length(decision_reason) <= 500),
  converted_at timestamptz,
  version integer not null default 1,
  request_id uuid not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, request_id),
  unique (detail_center_id, folio),
  check (lead_id is not null or client_id is not null),
  check (vehicle_id is null or client_id is not null),
  check (total = subtotal - discount_total and total >= 0),
  check ((status = 'convertida') = (appointment_id is not null and converted_at is not null)),
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete restrict,
  foreign key (organization_id, lead_id) references public.leads (organization_id, id) on delete restrict,
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete restrict,
  foreign key (organization_id, vehicle_id) references public.vehicles (organization_id, id) on delete restrict,
  foreign key (organization_id, appointment_id) references public.appointments (organization_id, id) on delete restrict
);
create index quotes_center_status_idx on public.quotes (detail_center_id, status, created_at desc);
create index quotes_lead_idx on public.quotes (lead_id) where lead_id is not null;
create index quotes_client_idx on public.quotes (client_id) where client_id is not null;
create unique index quotes_appointment_key on public.quotes (appointment_id) where appointment_id is not null;

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  quote_id uuid not null,
  position smallint not null default 0,
  -- Congelados al cotizar.
  service_id uuid not null,
  service_code text not null,
  service_name text not null,
  revenue_engine public.revenue_engine not null,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  price_source text not null check (price_source in ('base', 'center')),
  unit_direct_cost numeric(12, 2) not null check (unit_direct_cost >= 0),
  operator_commission_pct numeric(5, 2) check (operator_commission_pct is null or operator_commission_pct between 0 and 100),
  duration_minutes integer not null check (duration_minutes >= 0),
  quantity integer not null check (quantity between 1 and 99),
  line_subtotal numeric(12, 2) generated always as (round(quantity * unit_price, 2)) stored,
  line_discount numeric(12, 2) not null default 0,
  -- Misma base que la OS (ADR 0026): precio de la línea menos sus descuentos.
  operator_pay numeric(12, 2) generated always as (
    greatest(round((quantity * unit_price - line_discount) * coalesce(operator_commission_pct, 0) / 100, 2), 0)
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_id, service_id),
  unique (quote_id, id),
  foreign key (organization_id, quote_id) references public.quotes (organization_id, id) on delete cascade,
  foreign key (organization_id, service_id) references public.services (organization_id, id) on delete restrict
);

create table public.quote_discounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  quote_id uuid not null,
  item_id uuid,
  kind text not null check (kind in ('percent', 'amount')),
  value numeric(12, 2) not null check (value > 0 and (kind <> 'percent' or value <= 100)),
  amount numeric(12, 2) not null default 0,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  authorization_level public.discount_level not null,
  authorized_by uuid default auth.uid() references auth.users (id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((voided_at is null) = (void_reason is null)),
  foreign key (organization_id, quote_id) references public.quotes (organization_id, id) on delete cascade,
  foreign key (quote_id, item_id) references public.quote_items (quote_id, id) on delete cascade
);
create index quote_discounts_quote_idx on public.quote_discounts (quote_id);

create table private.quote_counters (
  detail_center_id uuid primary key references public.detail_centers (id) on delete cascade,
  last_number integer not null default 0
);
revoke all on private.quote_counters from public, anon, authenticated;

-- La reserva (cita) recuerda su cotización.
alter table public.appointments add column quote_id uuid,
  add constraint appointments_quote_fk foreign key (organization_id, quote_id)
    references public.quotes (organization_id, id) on delete restrict;
create unique index appointments_quote_key on public.appointments (quote_id) where quote_id is not null;

-- La OS abierta desde una reserva cotizada respeta el precio cotizado.
alter table public.service_order_items drop constraint service_order_items_price_source_check;
alter table public.service_order_items
  add constraint service_order_items_price_source_check check (price_source in ('base', 'center', 'convenio', 'cotizacion'));

-- ---------------------------------------------------------------------------
-- 5. Triggers
-- ---------------------------------------------------------------------------

create trigger lead_stages_updated_at before update on public.lead_stages
  for each row execute function private.set_updated_at();
create trigger leads_updated_at before update on public.leads
  for each row execute function private.set_updated_at();
create trigger quotes_updated_at before update on public.quotes
  for each row execute function private.set_updated_at();
create trigger quote_items_updated_at before update on public.quote_items
  for each row execute function private.set_updated_at();
create trigger quote_discounts_updated_at before update on public.quote_discounts
  for each row execute function private.set_updated_at();

create trigger lead_stages_require_reason before insert or update or delete on public.lead_stages
  for each row execute function private.require_change_reason();
create trigger leads_require_reason before insert or update or delete on public.leads
  for each row execute function private.require_change_reason();
create trigger lead_services_require_reason before insert or update or delete on public.lead_services
  for each row execute function private.require_change_reason();
create trigger quotes_require_reason before insert or update or delete on public.quotes
  for each row execute function private.require_change_reason();
create trigger quote_items_require_reason before insert or update or delete on public.quote_items
  for each row execute function private.require_change_reason();
create trigger quote_discounts_require_reason before insert or update or delete on public.quote_discounts
  for each row execute function private.require_change_reason();

create trigger lead_stages_audit after insert or update or delete on public.lead_stages
  for each row execute function private.audit_row();
create trigger leads_audit after insert or update or delete on public.leads
  for each row execute function private.audit_row();
create trigger lead_services_audit after insert or update or delete on public.lead_services
  for each row execute function private.audit_row();
create trigger quotes_audit after insert or update or delete on public.quotes
  for each row execute function private.audit_row();
create trigger quote_items_audit after insert or update or delete on public.quote_items
  for each row execute function private.audit_row();
create trigger quote_discounts_audit after insert or update or delete on public.quote_discounts
  for each row execute function private.audit_row();

create function private.bump_row_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;
create trigger leads_version before update on public.leads
  for each row execute function private.bump_row_version();
create trigger quotes_version before update on public.quotes
  for each row execute function private.bump_row_version();

-- La etapa corresponde al estado del prospecto.
create function private.check_lead_stage() returns trigger
language plpgsql set search_path = '' as $$
declare
  k text;
begin
  select s.kind into k from public.lead_stages s where s.id = new.stage_id;
  if k is distinct from new.status then
    raise exception 'La etapa no corresponde al estado del prospecto' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger leads_check_stage before insert or update of stage_id, status on public.leads
  for each row execute function private.check_lead_stage();

create function private.forbid_lead_event_changes() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'El historial del prospecto no se modifica' using errcode = '42501';
end;
$$;
create trigger lead_events_immutable before update or delete on public.lead_events
  for each row execute function private.forbid_lead_event_changes();

-- Los datos congelados de una línea cotizada no cambian (sólo cantidad y descuento).
create function private.keep_quote_item_frozen() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.organization_id, new.quote_id, new.service_id, new.service_code, new.service_name, new.revenue_engine,
      new.unit_price, new.price_source, new.unit_direct_cost, new.operator_commission_pct, new.duration_minutes)
     is distinct from
     (old.organization_id, old.quote_id, old.service_id, old.service_code, old.service_name, old.revenue_engine,
      old.unit_price, old.price_source, old.unit_direct_cost, old.operator_commission_pct, old.duration_minutes) then
    raise exception 'El precio y los datos congelados de una línea cotizada no cambian' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger quote_items_frozen before update on public.quote_items
  for each row execute function private.keep_quote_item_frozen();

-- El folio, el centro y el origen de una cotización no cambian.
create function private.keep_quote_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.organization_id, new.detail_center_id, new.folio, new.folio_number, new.lead_id, new.request_id,
      new.created_by, new.created_at)
     is distinct from
     (old.organization_id, old.detail_center_id, old.folio, old.folio_number, old.lead_id, old.request_id,
      old.created_by, old.created_at) then
    raise exception 'El folio, el centro y el prospecto de una cotización no cambian' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger quotes_identity before update on public.quotes
  for each row execute function private.keep_quote_identity();

-- Embudo inicial de cada organización (existentes y nuevas).
create function private.seed_lead_stages(p_organization_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.change_reason', 'Etapas iniciales del embudo de prospectos', true);
  insert into public.lead_stages (organization_id, code, name, kind, milestone, position) values
    (p_organization_id, 'nuevo', 'Nuevo', 'abierta', null, 1),
    (p_organization_id, 'contactado', 'Contactado', 'abierta', 'contactado', 2),
    (p_organization_id, 'cotizado', 'Cotizado', 'abierta', 'cotizado', 3),
    (p_organization_id, 'pendiente_reserva', 'Pendiente de reserva', 'abierta', null, 4),
    (p_organization_id, 'reservado', 'Reservado', 'abierta', 'reservado', 5),
    (p_organization_id, 'ganado', 'Ganado', 'ganada', null, 90),
    (p_organization_id, 'perdido', 'Perdido', 'perdida', null, 91)
  on conflict (organization_id, code) do nothing;
end;
$$;

create function private.seed_org_lead_stages() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.seed_lead_stages(new.id);
  return null;
end;
$$;
create trigger organizations_lead_stages after insert on public.organizations
  for each row execute function private.seed_org_lead_stages();

do $$
begin
  perform private.seed_lead_stages(o.id) from public.organizations o;
end $$;

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------

alter table public.lead_stages enable row level security;
alter table public.leads enable row level security;
alter table public.lead_services enable row level security;
alter table public.lead_events enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.quote_discounts enable row level security;

create policy lead_stages_select on public.lead_stages
  for select to authenticated using (private.is_org_member(organization_id));
create policy leads_select on public.leads
  for select to authenticated using (private.can_use_leads(detail_center_id));
create policy lead_events_select on public.lead_events
  for select to authenticated using (private.can_use_leads(detail_center_id));
create policy lead_services_select on public.lead_services
  for select to authenticated using (
    exists (select 1 from public.leads l where l.id = lead_id and private.can_use_leads(l.detail_center_id)));
create policy quotes_select on public.quotes
  for select to authenticated using (private.can_use_leads(detail_center_id));
create policy quote_items_select on public.quote_items
  for select to authenticated using (
    exists (select 1 from public.quotes q where q.id = quote_id and private.can_use_leads(q.detail_center_id)));
create policy quote_discounts_select on public.quote_discounts
  for select to authenticated using (
    exists (select 1 from public.quotes q where q.id = quote_id and private.can_use_leads(q.detail_center_id)));

revoke all on public.lead_stages, public.leads, public.lead_services, public.lead_events, public.quotes,
  public.quote_items, public.quote_discounts from anon;
revoke insert, update, delete, truncate on public.lead_stages, public.leads, public.lead_services, public.lead_events,
  public.quotes, public.quote_items, public.quote_discounts from authenticated;

-- Tareas: las de un prospecto las ve quien trabaja prospectos en el centro.
drop policy crm_tasks_select on public.crm_tasks;
drop policy crm_tasks_insert on public.crm_tasks;
drop policy crm_tasks_update on public.crm_tasks;
create policy crm_tasks_select on public.crm_tasks
  for select to authenticated using (
    case when opportunity_id is not null then private.can_read_pipeline(detail_center_id)
         when lead_id is not null then private.can_use_leads(detail_center_id)
         else private.can_use_crm(detail_center_id) end);
create policy crm_tasks_insert on public.crm_tasks
  for insert to authenticated with check (
    opportunity_id is null and lead_id is null and private.can_use_crm(detail_center_id));
create policy crm_tasks_update on public.crm_tasks for update to authenticated
  using (case when opportunity_id is not null then private.can_read_pipeline(detail_center_id)
              when lead_id is not null then private.can_use_leads(detail_center_id)
              else private.can_use_crm(detail_center_id) end)
  with check (case when opportunity_id is not null then private.can_read_pipeline(detail_center_id)
                   when lead_id is not null then private.can_use_leads(detail_center_id)
                   else private.can_use_crm(detail_center_id) end);

-- ---------------------------------------------------------------------------
-- 7. Prospectos: RPC
-- ---------------------------------------------------------------------------

create function private.lead_event(
  l public.leads, p_kind text, p_from_stage uuid default null, p_to_stage uuid default null,
  p_value numeric default null, p_note text default null, p_channel text default null,
  p_quote_id uuid default null, p_appointment_id uuid default null, p_service_order_id uuid default null
) returns void
language sql set search_path = '' as $$
  insert into public.lead_events (organization_id, detail_center_id, lead_id, kind, source_channel, from_stage_id,
                                  to_stage_id, value, owner_id, channel, quote_id, appointment_id, service_order_id, note)
  values (l.organization_id, l.detail_center_id, l.id, p_kind, l.source_channel, p_from_stage, p_to_stage, p_value,
          l.owner_id, p_channel, p_quote_id, p_appointment_id, p_service_order_id, nullif(btrim(p_note), ''));
$$;

-- Bloquea el prospecto y verifica versión (40001 si cambió en otro dispositivo).
create function private.lock_lead(p_id uuid, p_version integer) returns public.leads
language plpgsql set search_path = '' as $$
declare
  l public.leads;
begin
  select * into l from public.leads where id = p_id for update;
  if not found then
    raise exception 'Prospecto inexistente o sin permiso' using errcode = '42501';
  end if;
  if not private.can_use_leads(l.detail_center_id) then
    raise exception 'Prospecto inexistente o sin permiso' using errcode = '42501';
  end if;
  if p_version is not null and l.version <> p_version then
    raise exception 'El prospecto cambió en otro dispositivo; recarga para continuar' using errcode = '40001';
  end if;
  return l;
end;
$$;

-- Responsable: una persona activa que trabaja prospectos en el centro (o nadie).
create function private.check_lead_owner(p_owner_id uuid, p_detail_center_id uuid) returns void
language plpgsql stable set search_path = '' as $$
begin
  if p_owner_id is not null and not private.user_has_center_role(
       p_owner_id, p_detail_center_id,
       array['admin_socio', 'encargado', 'operador_recepcion', 'comercial_b2b']::public.app_role[]) then
    raise exception 'El responsable no trabaja prospectos en este centro' using errcode = 'MG002';
  end if;
end;
$$;

-- Cliente de la organización que la persona puede ver.
create function private.check_visible_client(p_client_id uuid, p_organization_id uuid) returns void
language plpgsql stable set search_path = '' as $$
begin
  if p_client_id is not null and not exists (
       select 1 from public.clients c
        where c.id = p_client_id and c.organization_id = p_organization_id and c.active
          and private.can_see_client(c.id)) then
    raise exception 'Cliente inexistente, fusionado o no visible desde tus centros' using errcode = '22023';
  end if;
end;
$$;

-- Avanza al prospecto a la etapa de un hito (nunca hacia atrás; sólo abiertos).
create function private.advance_lead_to_milestone(p_lead_id uuid, p_milestone text, p_note text) returns void
language plpgsql set search_path = '' as $$
declare
  l public.leads;
  cur_pos smallint;
  target public.lead_stages;
begin
  select * into l from public.leads where id = p_lead_id for update;
  if not found or l.status <> 'abierta' then
    return;
  end if;
  select * into target from public.lead_stages
   where organization_id = l.organization_id and milestone = p_milestone and active;
  if not found then
    return;
  end if;
  select position into cur_pos from public.lead_stages where id = l.stage_id;
  if cur_pos >= target.position then
    return;
  end if;
  perform private.set_change_reason(coalesce(p_note, 'Avance automático del embudo'));
  update public.leads set stage_id = target.id where id = l.id;
  perform private.lead_event(l, 'etapa', l.stage_id, target.id, null, p_note);
end;
$$;

-- Prospectos abiertos (o clientes) con el mismo teléfono o email: para avisar
-- antes de registrar uno repetido. Nunca por nombre.
create function public.lead_matches(
  p_detail_center_id uuid,
  p_phone text default null,
  p_email text default null,
  p_exclude_lead_id uuid default null
)
returns table (kind text, id uuid, display_name text, detail text, matched_on text[])
language plpgsql stable security definer set search_path = '' as $$
declare
  org uuid;
  ph text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  em text := private.normalize_email(p_email);
begin
  if not private.can_use_leads(p_detail_center_id) then
    raise exception 'Sin permiso para registrar prospectos en este centro' using errcode = '42501';
  end if;
  select c.organization_id into org from public.detail_centers c where c.id = p_detail_center_id;
  if length(ph) < 10 then
    ph := null;
  end if;
  return query
    select 'prospecto'::text, l.id, l.full_name,
           s.name || ' · ' || dc.name,
           array_remove(array[case when l.phone_key = ph then 'telefono' end,
                              case when l.email = em then 'email' end], null)
      from public.leads l
      join public.lead_stages s on s.id = l.stage_id
      join public.detail_centers dc on dc.id = l.detail_center_id
     where l.organization_id = org and l.status = 'abierta'
       and l.id is distinct from p_exclude_lead_id
       and ((ph is not null and l.phone_key = ph) or (em is not null and l.email = em))
       and private.can_use_leads(l.detail_center_id)
    union all
    select 'cliente'::text, c.id,
           case when private.can_see_client(c.id) then c.full_name
                else split_part(c.full_name, ' ', 1) end,
           '•••• ' || right(c.phone, 4),
           array_remove(array[case when right(c.phone_digits, 10) = ph then 'telefono' end,
                              case when c.email = em then 'email' end], null)
      from public.clients c
     where c.organization_id = org and c.active
       and ((ph is not null and right(c.phone_digits, 10) = ph) or (em is not null and c.email = em))
    limit 20;
end;
$$;

-- Alta idempotente. p_client_id: cliente ya registrado (la persona lo eligió;
-- nunca se liga solo). p_interest_service_ids: servicios de interés.
create function public.create_lead(
  p_detail_center_id uuid,
  p_request_id uuid,
  p_full_name text,
  p_source_channel text,
  p_phone text default null,
  p_email text default null,
  p_social_handle text default null,
  p_source_detail text default null,
  p_referred_by_client_id uuid default null,
  p_client_id uuid default null,
  p_interest_service_ids uuid[] default '{}',
  p_vehicle_description text default null,
  p_notes text default null,
  p_consent_channels text[] default '{}',
  p_estimated_value numeric default null,
  p_owner_id uuid default null,
  p_next_action text default null,
  p_next_action_on date default null
) returns public.leads
language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
  first_stage uuid;
  result public.leads;
  consent text[] := coalesce((select array_agg(distinct x order by x) from unnest(p_consent_channels) x), '{}');
begin
  if not private.can_use_leads(p_detail_center_id) then
    raise exception 'Sin permiso para registrar prospectos en este centro' using errcode = '42501';
  end if;
  select c.organization_id into org from public.detail_centers c where c.id = p_detail_center_id;
  select * into result from public.leads where organization_id = org and request_id = p_request_id;
  if found then
    return result;
  end if;
  perform private.check_lead_owner(p_owner_id, p_detail_center_id);
  perform private.check_visible_client(p_client_id, org);
  perform private.check_visible_client(p_referred_by_client_id, org);
  if p_source_channel = 'recomendacion' and p_referred_by_client_id is null and nullif(btrim(p_source_detail), '') is null then
    raise exception 'Indica quién recomendó (cliente o detalle)' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_interest_service_ids, '{}')) sid
              where not exists (select 1 from public.center_catalog(p_detail_center_id) cat where cat.id = sid)) then
    raise exception 'Algún servicio de interés no está disponible en este centro' using errcode = '22023';
  end if;
  select s.id into first_stage from public.lead_stages s
   where s.organization_id = org and s.kind = 'abierta' and s.active order by s.position limit 1;
  perform private.set_change_reason('Alta de prospecto');
  insert into public.leads (
    organization_id, detail_center_id, full_name, phone, email, social_handle, source_channel, source_detail,
    referred_by_client_id, client_id, vehicle_description, notes, consent_channels, consent_at, estimated_value,
    stage_id, owner_id, next_action, next_action_on, request_id
  ) values (
    org, p_detail_center_id, regexp_replace(btrim(p_full_name), '\s+', ' ', 'g'),
    case when nullif(btrim(p_phone), '') is null then null else private.normalize_phone(p_phone) end,
    private.normalize_email(p_email), nullif(btrim(p_social_handle), ''), p_source_channel,
    nullif(btrim(p_source_detail), ''), p_referred_by_client_id, p_client_id, nullif(btrim(p_vehicle_description), ''),
    nullif(btrim(p_notes), ''), consent, case when cardinality(consent) > 0 then now() end, p_estimated_value,
    first_stage, p_owner_id, nullif(btrim(p_next_action), ''), p_next_action_on, p_request_id
  ) returning * into result;
  insert into public.lead_services (lead_id, service_id, organization_id)
  select result.id, sid, org from unnest(coalesce(p_interest_service_ids, '{}')) sid group by sid;
  perform private.lead_event(result, 'creado', null, first_stage, p_estimated_value);
  return result;
end;
$$;

-- Edición de un prospecto abierto (el cambio de responsable queda en el historial).
create function public.update_lead(
  p_id uuid,
  p_version integer,
  p_full_name text,
  p_phone text,
  p_email text,
  p_social_handle text,
  p_source_channel text,
  p_source_detail text,
  p_interest_service_ids uuid[],
  p_vehicle_description text,
  p_notes text,
  p_consent_channels text[],
  p_estimated_value numeric,
  p_owner_id uuid,
  p_next_action text,
  p_next_action_on date,
  p_reason text
) returns public.leads
language plpgsql security definer set search_path = '' as $$
declare
  l public.leads;
  consent text[] := coalesce((select array_agg(distinct x order by x) from unnest(p_consent_channels) x), '{}');
begin
  l := private.lock_lead(p_id, p_version);
  if not private.can_use_leads(l.detail_center_id) then
    raise exception 'Sin permiso para editar prospectos en este centro' using errcode = '42501';
  end if;
  if l.status <> 'abierta' then
    raise exception 'El prospecto ya está cerrado; reábrelo para editarlo' using errcode = 'MG002';
  end if;
  perform private.check_lead_owner(p_owner_id, l.detail_center_id);
  if exists (select 1 from unnest(coalesce(p_interest_service_ids, '{}')) sid
              where not exists (select 1 from public.center_catalog(l.detail_center_id) cat where cat.id = sid)) then
    raise exception 'Algún servicio de interés no está disponible en este centro' using errcode = '22023';
  end if;
  perform private.set_change_reason(p_reason);
  update public.leads
     set full_name = regexp_replace(btrim(p_full_name), '\s+', ' ', 'g'),
         phone = case when nullif(btrim(p_phone), '') is null then null else private.normalize_phone(p_phone) end,
         email = private.normalize_email(p_email),
         social_handle = nullif(btrim(p_social_handle), ''),
         source_channel = p_source_channel,
         source_detail = nullif(btrim(p_source_detail), ''),
         vehicle_description = nullif(btrim(p_vehicle_description), ''),
         notes = nullif(btrim(p_notes), ''),
         consent_channels = consent,
         consent_at = case when cardinality(consent) = 0 then null
                           when consent = l.consent_channels then l.consent_at else now() end,
         estimated_value = p_estimated_value,
         owner_id = p_owner_id,
         next_action = nullif(btrim(p_next_action), ''),
         next_action_on = p_next_action_on
   where id = l.id
  returning * into l;
  delete from public.lead_services s
   where s.lead_id = l.id and not (s.service_id = any (coalesce(p_interest_service_ids, '{}')));
  insert into public.lead_services (lead_id, service_id, organization_id)
  select l.id, sid, l.organization_id from unnest(coalesce(p_interest_service_ids, '{}')) sid group by sid
  on conflict do nothing;
  if l.owner_id is distinct from (select e.owner_id from public.lead_events e where e.lead_id = l.id
                                    order by e.seq desc limit 1) then
    perform private.lead_event(l, 'responsable', null, null, null, p_reason);
  end if;
  return l;
end;
$$;

-- Registra un contacto con el prospecto (primera respuesta y avance al hito).
create function public.log_lead_contact(p_id uuid, p_version integer, p_channel text, p_note text default null)
returns public.leads
language plpgsql security definer set search_path = '' as $$
declare
  l public.leads;
begin
  l := private.lock_lead(p_id, p_version);
  if not private.can_use_leads(l.detail_center_id) then
    raise exception 'Sin permiso en este centro' using errcode = '42501';
  end if;
  if l.status <> 'abierta' then
    raise exception 'El prospecto ya está cerrado' using errcode = 'MG002';
  end if;
  if p_channel not in ('llamada', 'whatsapp', 'sms', 'email', 'presencial', 'redes') then
    raise exception 'Canal inválido' using errcode = '22023';
  end if;
  perform private.set_change_reason('Contacto con el prospecto');
  if l.first_contact_at is null then
    update public.leads set first_contact_at = now() where id = l.id returning * into l;
  end if;
  perform private.lead_event(l, 'contacto', null, null, null, p_note, p_channel);
  perform private.advance_lead_to_milestone(l.id, 'contactado', 'Primer contacto');
  select * into l from public.leads where id = l.id;
  return l;
end;
$$;

create function public.move_lead_stage(p_id uuid, p_version integer, p_stage_id uuid, p_note text default null)
returns public.leads
language plpgsql security definer set search_path = '' as $$
declare
  l public.leads;
  target public.lead_stages;
  prev uuid;
begin
  l := private.lock_lead(p_id, p_version);
  if not private.can_use_leads(l.detail_center_id) then
    raise exception 'Sin permiso en este centro' using errcode = '42501';
  end if;
  if l.status <> 'abierta' then
    raise exception 'El prospecto ya está cerrado' using errcode = 'MG002';
  end if;
  select * into target from public.lead_stages where id = p_stage_id and organization_id = l.organization_id;
  if not found or target.kind <> 'abierta' or not target.active then
    raise exception 'Elige una etapa abierta y activa (para ganar o perder usa su acción)' using errcode = '22023';
  end if;
  if target.id = l.stage_id then
    return l;
  end if;
  prev := l.stage_id;
  perform private.set_change_reason(coalesce(nullif(btrim(p_note), ''), 'Cambio de etapa'));
  update public.leads set stage_id = target.id where id = l.id returning * into l;
  perform private.lead_event(l, 'etapa', prev, target.id, null, p_note);
  return l;
end;
$$;

create function public.add_lead_note(p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  l public.leads;
begin
  select * into l from public.leads where id = p_id;
  if not found or not private.can_use_leads(l.detail_center_id) then
    raise exception 'Prospecto inexistente o sin permiso' using errcode = '42501';
  end if;
  if nullif(btrim(p_note), '') is null or length(p_note) > 2000 then
    raise exception 'Escribe la nota (hasta 2000 caracteres)' using errcode = '22023';
  end if;
  perform private.lead_event(l, 'nota', null, null, null, p_note);
end;
$$;

-- Perder: exige motivo y cancela sus tareas pendientes.
create function public.lose_lead(p_id uuid, p_version integer, p_reason text, p_notes text default null)
returns public.leads
language plpgsql security definer set search_path = '' as $$
declare
  l public.leads;
  lost uuid;
  prev uuid;
begin
  l := private.lock_lead(p_id, p_version);
  if not private.can_use_leads(l.detail_center_id) then
    raise exception 'Sin permiso en este centro' using errcode = '42501';
  end if;
  if l.status <> 'abierta' then
    raise exception 'El prospecto ya está cerrado' using errcode = 'MG002';
  end if;
  select id into lost from public.lead_stages where organization_id = l.organization_id and kind = 'perdida';
  prev := l.stage_id;
  perform private.set_change_reason('Prospecto perdido: ' || coalesce(p_reason, ''));
  update public.leads
     set status = 'perdida', stage_id = lost, closed_at = now(), loss_reason = p_reason,
         loss_notes = nullif(btrim(p_notes), ''), next_action = null, next_action_on = null
   where id = l.id
  returning * into l;
  update public.crm_tasks set status = 'cancelada', cancel_reason = 'El prospecto se perdió'
   where lead_id = l.id and status = 'pendiente';
  perform private.lead_event(l, 'perdido', prev, lost, null, coalesce(nullif(btrim(p_notes), ''), p_reason));
  return l;
end;
$$;

-- Reabrir un prospecto perdido (uno ganado ya es venta).
create function public.reopen_lead(p_id uuid, p_version integer, p_stage_id uuid, p_reason text)
returns public.leads
language plpgsql security definer set search_path = '' as $$
declare
  l public.leads;
  target public.lead_stages;
  prev uuid;
begin
  l := private.lock_lead(p_id, p_version);
  if not private.can_use_leads(l.detail_center_id) then
    raise exception 'Sin permiso en este centro' using errcode = '42501';
  end if;
  if l.status <> 'perdida' then
    raise exception 'Sólo se reabre un prospecto perdido' using errcode = 'MG002';
  end if;
  select * into target from public.lead_stages where id = p_stage_id and organization_id = l.organization_id;
  if not found or target.kind <> 'abierta' or not target.active then
    raise exception 'Elige una etapa abierta y activa' using errcode = '22023';
  end if;
  prev := l.stage_id;
  perform private.set_change_reason(p_reason);
  update public.leads
     set status = 'abierta', stage_id = target.id, closed_at = null, loss_reason = null, loss_notes = null
   where id = l.id
  returning * into l;
  perform private.lead_event(l, 'reabierto', prev, target.id, null, p_reason);
  return l;
end;
$$;

-- Ganar manualmente con la OS entregada del cliente del prospecto (la venta
-- se atribuye una sola vez).
create function private.mark_lead_won(l public.leads, o public.service_orders, p_note text) returns public.leads
language plpgsql set search_path = '' as $$
declare
  won uuid;
  prev uuid := l.stage_id;
begin
  select id into won from public.lead_stages where organization_id = l.organization_id and kind = 'ganada';
  perform private.set_change_reason(coalesce(p_note, 'Prospecto ganado'));
  update public.leads
     set status = 'ganada', stage_id = won, closed_at = now(), won_value = o.total, service_order_id = o.id,
         client_id = coalesce(client_id, private.client_root(o.client_id)), next_action = null, next_action_on = null
   where id = l.id
  returning * into l;
  update public.crm_tasks set status = 'cancelada', cancel_reason = 'El prospecto ya compró'
   where lead_id = l.id and status = 'pendiente';
  perform private.lead_event(l, 'ganado', prev, won, o.total, p_note, null, null, o.appointment_id, o.id);
  return l;
end;
$$;

create function public.win_lead(p_id uuid, p_version integer, p_service_order_id uuid) returns public.leads
language plpgsql security definer set search_path = '' as $$
declare
  l public.leads;
  o public.service_orders;
begin
  l := private.lock_lead(p_id, p_version);
  if not private.can_use_leads(l.detail_center_id) then
    raise exception 'Sin permiso en este centro' using errcode = '42501';
  end if;
  if l.status <> 'abierta' then
    raise exception 'El prospecto ya está cerrado' using errcode = 'MG002';
  end if;
  if l.client_id is null then
    raise exception 'Primero liga el prospecto con su cliente' using errcode = 'MG002';
  end if;
  select * into o from public.service_orders where id = p_service_order_id;
  if not found or o.status <> 'entregada'
     or private.client_root(o.client_id) <> private.client_root(l.client_id) then
    raise exception 'Elige una OS entregada del cliente del prospecto' using errcode = '22023';
  end if;
  if exists (select 1 from public.leads x where x.service_order_id = o.id) then
    raise exception 'Esa venta ya está atribuida a otro prospecto' using errcode = 'MG002';
  end if;
  return private.mark_lead_won(l, o, 'Venta ' || o.folio);
end;
$$;

-- Liga el prospecto con un cliente registrado (elegido por la persona). Pasa el
-- consentimiento que el prospecto dio sólo a canales sin decisión previa.
create function public.link_lead_client(p_id uuid, p_version integer, p_client_id uuid, p_reason text)
returns public.leads
language plpgsql security definer set search_path = '' as $$
declare
  l public.leads;
  ch text;
begin
  l := private.lock_lead(p_id, p_version);
  if not private.can_use_leads(l.detail_center_id) then
    raise exception 'Sin permiso en este centro' using errcode = '42501';
  end if;
  perform private.check_visible_client(p_client_id, l.organization_id);
  if l.client_id = p_client_id then
    return l;
  end if;
  if l.client_id is not null and exists (select 1 from public.quotes q where q.lead_id = l.id and q.client_id is not null) then
    raise exception 'El prospecto ya tiene cotizaciones con otro cliente' using errcode = 'MG002';
  end if;
  perform private.set_change_reason(p_reason);
  update public.leads set client_id = p_client_id where id = l.id returning * into l;
  update public.quotes set client_id = p_client_id where lead_id = l.id and client_id is null
     and status in ('borrador', 'enviada', 'aceptada');
  insert into public.client_centers (client_id, detail_center_id, organization_id)
  values (p_client_id, l.detail_center_id, l.organization_id)
  on conflict (client_id, detail_center_id) do nothing;
  foreach ch in array l.consent_channels loop
    if not exists (select 1 from public.contact_preferences cp where cp.client_id = p_client_id and cp.channel = ch) then
      perform private.put_contact_preference(p_client_id, ch, true, 'web');
    end if;
  end loop;
  perform private.lead_event(l, 'cliente', null, null, null, p_reason);
  return l;
end;
$$;

-- Tarea o recordatorio del prospecto en la cola del CRM.
create function public.create_lead_task(
  p_id uuid,
  p_request_id uuid,
  p_kind text,
  p_due_on date,
  p_notes text default null,
  p_assigned_to uuid default null
) returns public.crm_tasks
language plpgsql security definer set search_path = '' as $$
declare
  l public.leads;
  result public.crm_tasks;
begin
  select * into l from public.leads where id = p_id;
  if not found or not private.can_use_leads(l.detail_center_id) then
    raise exception 'Prospecto inexistente o sin permiso' using errcode = '42501';
  end if;
  select * into result from public.crm_tasks where organization_id = l.organization_id and request_id = p_request_id;
  if found then
    return result;
  end if;
  if l.status <> 'abierta' then
    raise exception 'El prospecto ya está cerrado' using errcode = 'MG002';
  end if;
  if p_kind not in ('llamar', 'whatsapp', 'email', 'reunion') then
    raise exception 'Tipo de tarea inválido' using errcode = '22023';
  end if;
  if p_due_on is null or p_due_on < private.center_today(l.detail_center_id) then
    raise exception 'La fecha debe ser hoy o posterior' using errcode = '22023';
  end if;
  perform private.check_lead_owner(p_assigned_to, l.detail_center_id);
  perform private.set_change_reason('Tarea del prospecto');
  insert into public.crm_tasks (organization_id, detail_center_id, client_id, lead_id, kind, channel, due_on, notes,
                                source, assigned_to, request_id)
  values (l.organization_id, l.detail_center_id, null, l.id, p_kind,
          case p_kind when 'llamar' then 'llamada' when 'reunion' then 'presencial' else p_kind end,
          p_due_on, nullif(btrim(p_notes), ''), 'prospecto', p_assigned_to, p_request_id)
  returning * into result;
  return result;
end;
$$;

-- Lista y ficha (con etapa, responsable, servicios de interés y tareas abiertas).
create function public.list_leads(
  p_detail_center_ids uuid[],
  p_status text default null,
  p_stage_id uuid default null,
  p_owner_id uuid default null,
  p_source_channel text default null,
  p_query text default null,
  p_id uuid default null,
  p_limit integer default 200
)
returns table (
  id uuid,
  detail_center_id uuid,
  detail_center_name text,
  full_name text,
  phone text,
  email text,
  social_handle text,
  source_channel text,
  source_detail text,
  referred_by_client_id uuid,
  referred_by_name text,
  client_id uuid,
  client_name text,
  vehicle_description text,
  notes text,
  consent_channels text[],
  estimated_value numeric,
  stage_id uuid,
  stage_name text,
  stage_position smallint,
  status text,
  owner_id uuid,
  owner_name text,
  next_action text,
  next_action_on date,
  first_contact_at timestamptz,
  closed_at timestamptz,
  won_value numeric,
  service_order_id uuid,
  service_order_folio text,
  loss_reason text,
  loss_notes text,
  interest_service_ids uuid[],
  interest_service_names text[],
  open_tasks integer,
  quotes integer,
  version integer,
  created_at timestamptz,
  today date
)
language sql stable security definer set search_path = '' as $$
  select l.id, l.detail_center_id, dc.name, l.full_name, l.phone, l.email, l.social_handle, l.source_channel,
         l.source_detail, l.referred_by_client_id, rc.full_name, l.client_id, cl.full_name, l.vehicle_description,
         l.notes, l.consent_channels, l.estimated_value, l.stage_id, s.name, s.position, l.status, l.owner_id,
         p.full_name, l.next_action, l.next_action_on, l.first_contact_at, l.closed_at, l.won_value,
         l.service_order_id, o.folio, l.loss_reason, l.loss_notes,
         coalesce((select array_agg(ls.service_id order by sv.name) from public.lead_services ls
                     join public.services sv on sv.id = ls.service_id where ls.lead_id = l.id), '{}'),
         coalesce((select array_agg(sv.name order by sv.name) from public.lead_services ls
                     join public.services sv on sv.id = ls.service_id where ls.lead_id = l.id), '{}'),
         (select count(*)::integer from public.crm_tasks t where t.lead_id = l.id and t.status = 'pendiente'),
         (select count(*)::integer from public.quotes q where q.lead_id = l.id),
         l.version, l.created_at, (now() at time zone dc.timezone)::date
    from public.leads l
    join public.detail_centers dc on dc.id = l.detail_center_id
    join public.lead_stages s on s.id = l.stage_id
    left join public.clients rc on rc.id = l.referred_by_client_id
    left join public.clients cl on cl.id = l.client_id
    left join public.profiles p on p.id = l.owner_id
    left join public.service_orders o on o.id = l.service_order_id
   where l.detail_center_id = any (p_detail_center_ids)
     and private.can_use_leads(l.detail_center_id)
     and (p_id is null or l.id = p_id)
     and (p_status is null or l.status = p_status)
     and (p_stage_id is null or l.stage_id = p_stage_id)
     and (p_owner_id is null or l.owner_id = p_owner_id)
     and (p_source_channel is null or l.source_channel = p_source_channel)
     and (nullif(btrim(p_query), '') is null
          or private.normalize_text(l.full_name) like '%' || private.like_escape(private.normalize_text(p_query)) || '%'
          or l.phone_key like '%' || nullif(regexp_replace(p_query, '\D', '', 'g'), '') || '%'
          or l.email ilike '%' || private.like_escape(btrim(p_query)) || '%'
          or l.social_handle ilike '%' || private.like_escape(btrim(p_query)) || '%')
   order by l.status = 'abierta' desc, l.next_action_on nulls last, l.created_at desc
   limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;

create function public.lead_timeline(p_id uuid)
returns table (
  seq bigint,
  kind text,
  from_stage_name text,
  to_stage_name text,
  value numeric,
  owner_name text,
  channel text,
  quote_id uuid,
  quote_folio text,
  appointment_id uuid,
  service_order_id uuid,
  service_order_folio text,
  note text,
  actor_name text,
  occurred_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select e.seq, e.kind, fs.name, ts.name, e.value, po.full_name, e.channel, e.quote_id, q.folio, e.appointment_id,
         e.service_order_id, o.folio, e.note, pa.full_name, e.occurred_at
    from public.lead_events e
    left join public.lead_stages fs on fs.id = e.from_stage_id
    left join public.lead_stages ts on ts.id = e.to_stage_id
    left join public.profiles po on po.id = e.owner_id
    left join public.profiles pa on pa.id = e.actor_id
    left join public.quotes q on q.id = e.quote_id
    left join public.service_orders o on o.id = e.service_order_id
   where e.lead_id = p_id and private.can_use_leads(e.detail_center_id)
   order by e.seq desc;
$$;

-- Responsables posibles de un prospecto en el centro.
create function public.lead_owners(p_detail_center_id uuid)
returns table (user_id uuid, full_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name
    from public.profiles p
   where private.can_use_leads(p_detail_center_id)
     and private.user_has_center_role(p.id, p_detail_center_id,
           array['admin_socio', 'encargado', 'operador_recepcion', 'comercial_b2b']::public.app_role[])
   order by p.full_name;
$$;

-- Etapas del embudo (admin corporativo). Las de cierre sólo se renombran.
create function public.upsert_lead_stage(
  p_organization_id uuid,
  p_id uuid,
  p_code text,
  p_name text,
  p_position smallint,
  p_milestone text,
  p_active boolean,
  p_reason text
) returns public.lead_stages
language plpgsql security definer set search_path = '' as $$
declare
  s public.lead_stages;
begin
  if not private.can_manage_lead_stages(p_organization_id) then
    raise exception 'Sólo el admin corporativo configura el embudo' using errcode = '42501';
  end if;
  perform private.set_change_reason(p_reason);
  if p_id is null then
    insert into public.lead_stages (organization_id, code, name, kind, milestone, position, active)
    values (p_organization_id, lower(btrim(p_code)), btrim(p_name), 'abierta', p_milestone, p_position,
            coalesce(p_active, true))
    returning * into s;
    return s;
  end if;
  select * into s from public.lead_stages where id = p_id and organization_id = p_organization_id for update;
  if not found then
    raise exception 'Etapa inexistente' using errcode = '22023';
  end if;
  if s.kind <> 'abierta' then
    update public.lead_stages set name = btrim(p_name) where id = s.id returning * into s;
    return s;
  end if;
  if not coalesce(p_active, true) and exists (select 1 from public.leads l where l.stage_id = s.id and l.status = 'abierta') then
    raise exception 'Hay prospectos abiertos en esta etapa; muévelos antes de desactivarla' using errcode = 'MG002';
  end if;
  update public.lead_stages
     set name = btrim(p_name), position = p_position, milestone = p_milestone, active = coalesce(p_active, true)
   where id = s.id
  returning * into s;
  return s;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Cotizaciones: RPC
-- ---------------------------------------------------------------------------

-- Vigencia por defecto (espejo de QUOTE_RULES.validDays en el dominio).
create function private.quote_rule(p_name text) returns integer
language sql immutable set search_path = '' as $$
  select case p_name when 'valid_days' then 15 when 'max_valid_days' then 90 end;
$$;

create function private.lock_quote(p_id uuid, p_version integer) returns public.quotes
language plpgsql set search_path = '' as $$
declare
  q public.quotes;
begin
  select * into q from public.quotes where id = p_id for update;
  if not found then
    raise exception 'Cotización inexistente o sin permiso' using errcode = '42501';
  end if;
  if not private.can_use_leads(q.detail_center_id) then
    raise exception 'Sin permiso para cotizar en este centro' using errcode = '42501';
  end if;
  if p_version is not null and q.version <> p_version then
    raise exception 'La cotización cambió en otro dispositivo; recarga para continuar' using errcode = '40001';
  end if;
  return q;
end;
$$;

-- Vencida: sin decidir y con la vigencia pasada (fecha del centro).
create function private.quote_expired(q public.quotes) returns boolean
language sql stable set search_path = '' as $$
  select q.status in ('borrador', 'enviada', 'aceptada') and q.valid_until < private.center_today(q.detail_center_id);
$$;

create function private.check_quote_editable(q public.quotes) returns void
language plpgsql stable set search_path = '' as $$
begin
  if q.status not in ('borrador', 'enviada') then
    raise exception 'Sólo se edita una cotización en borrador o enviada' using errcode = 'MG002';
  end if;
  if private.quote_expired(q) then
    raise exception 'La cotización venció; crea una nueva con los precios vigentes' using errcode = 'MG002';
  end if;
end;
$$;

-- Totales, descuentos y costo estimado (mismo orden que recalc_service_order).
create function private.recalc_quote(p_quote_id uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_subtotal numeric(12, 2);
  v_line_discount numeric(12, 2);
  v_order_discount numeric(12, 2);
  v_cost numeric(12, 2);
  v_pay numeric(12, 2);
begin
  update public.quote_discounts d
     set amount = case when d.kind = 'percent' then round(i.line_subtotal * d.value / 100, 2) else d.value end
    from public.quote_items i
   where d.quote_id = p_quote_id and d.item_id = i.id and d.voided_at is null
     and d.amount is distinct from
         case when d.kind = 'percent' then round(i.line_subtotal * d.value / 100, 2) else d.value end;

  update public.quote_items i
     set line_discount = x.discount
    from (
      select it.id, least(it.line_subtotal, coalesce(sum(d.amount) filter (where d.voided_at is null), 0)) as discount
        from public.quote_items it
        left join public.quote_discounts d on d.item_id = it.id
       where it.quote_id = p_quote_id
       group by it.id, it.line_subtotal
    ) x
   where i.id = x.id and i.line_discount is distinct from x.discount;

  select coalesce(sum(line_subtotal), 0), coalesce(sum(line_discount), 0),
         coalesce(sum(round(quantity * unit_direct_cost, 2)), 0), coalesce(sum(operator_pay), 0)
    into v_subtotal, v_line_discount, v_cost, v_pay
    from public.quote_items where quote_id = p_quote_id;

  update public.quote_discounts d
     set amount = case when d.kind = 'percent' then round((v_subtotal - v_line_discount) * d.value / 100, 2)
                       else d.value end
   where d.quote_id = p_quote_id and d.item_id is null and d.voided_at is null
     and d.amount is distinct from
         case when d.kind = 'percent' then round((v_subtotal - v_line_discount) * d.value / 100, 2) else d.value end;

  select least(v_subtotal - v_line_discount, coalesce(sum(amount), 0)) into v_order_discount
    from public.quote_discounts where quote_id = p_quote_id and item_id is null and voided_at is null;

  update public.quotes
     set subtotal = v_subtotal,
         discount_total = v_line_discount + v_order_discount,
         total = v_subtotal - v_line_discount - v_order_discount,
         standard_cost_total = v_cost,
         operator_pay_total = v_pay
   where id = p_quote_id
     and (subtotal, discount_total, total, standard_cost_total, operator_pay_total)
         is distinct from (v_subtotal, v_line_discount + v_order_discount,
                           v_subtotal - v_line_discount - v_order_discount, v_cost, v_pay);
end;
$$;

-- Agrega una línea con el precio, costo y % del operador vigentes, o cambia su
-- cantidad (0 = quitarla).
create function private.put_quote_item(q public.quotes, p_service_id uuid, p_quantity integer) returns void
language plpgsql set search_path = '' as $$
declare
  cat record;
begin
  if p_quantity is null or p_quantity not between 0 and 99 then
    raise exception 'Cantidad inválida (0 a 99)' using errcode = '22023';
  end if;
  if p_quantity = 0 then
    delete from public.quote_items where quote_id = q.id and service_id = p_service_id;
    return;
  end if;
  update public.quote_items set quantity = p_quantity where quote_id = q.id and service_id = p_service_id;
  if found then
    return;
  end if;
  select * into cat from public.center_catalog(q.detail_center_id) c where c.id = p_service_id;
  if not found then
    raise exception 'El servicio no está disponible en este centro' using errcode = '22023';
  end if;
  insert into public.quote_items (
    organization_id, quote_id, position, service_id, service_code, service_name, revenue_engine, unit_price,
    price_source, unit_direct_cost, operator_commission_pct, duration_minutes, quantity
  ) values (
    q.organization_id, q.id,
    (select coalesce(max(position) + 1, 0) from public.quote_items where quote_id = q.id),
    cat.id, cat.code, cat.name, cat.revenue_engine, cat.price, cat.price_source, cat.direct_cost,
    cat.operator_commission_pct, cat.standard_duration_minutes, p_quantity
  );
end;
$$;

-- Alta idempotente: de un prospecto y/o un cliente. p_items: [{"service_id", "quantity"}].
create function public.create_quote(
  p_detail_center_id uuid,
  p_request_id uuid,
  p_items jsonb,
  p_lead_id uuid default null,
  p_client_id uuid default null,
  p_vehicle_id uuid default null,
  p_valid_days integer default null,
  p_notes text default null
) returns public.quotes
language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
  center_code text;
  n integer;
  l public.leads;
  client uuid := p_client_id;
  contact text;
  days integer := coalesce(p_valid_days, private.quote_rule('valid_days'));
  item jsonb;
  result public.quotes;
begin
  if not private.can_use_leads(p_detail_center_id) then
    raise exception 'Sin permiso para cotizar en este centro' using errcode = '42501';
  end if;
  select c.organization_id, c.code into org, center_code from public.detail_centers c where c.id = p_detail_center_id;
  select * into result from public.quotes where organization_id = org and request_id = p_request_id;
  if found then
    return result;
  end if;
  if p_lead_id is not null then
    select * into l from public.leads where id = p_lead_id and detail_center_id = p_detail_center_id;
    if not found then
      raise exception 'El prospecto no es de este centro' using errcode = '22023';
    end if;
    if l.status <> 'abierta' then
      raise exception 'El prospecto ya está cerrado' using errcode = 'MG002';
    end if;
    client := coalesce(client, l.client_id);
    if l.client_id is not null and client <> l.client_id then
      raise exception 'El cliente no corresponde al prospecto' using errcode = '22023';
    end if;
  end if;
  if client is null and p_lead_id is null then
    raise exception 'Cotiza a un prospecto o a un cliente' using errcode = '22023';
  end if;
  perform private.check_visible_client(client, org);
  if p_vehicle_id is not null and not exists (
       select 1 from public.vehicles v where v.id = p_vehicle_id and v.client_id = client and v.active) then
    raise exception 'El vehículo no pertenece al cliente o está dado de baja' using errcode = '22023';
  end if;
  if days not between 1 and private.quote_rule('max_valid_days') then
    raise exception 'Vigencia inválida (1 a % días)', private.quote_rule('max_valid_days') using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Agrega al menos un servicio' using errcode = '22023';
  end if;
  select coalesce((select c.full_name from public.clients c where c.id = client), l.full_name) into contact;

  perform private.set_change_reason('Alta de cotización');
  insert into private.quote_counters (detail_center_id, last_number) values (p_detail_center_id, 1)
  on conflict (detail_center_id) do update set last_number = private.quote_counters.last_number + 1
  returning last_number into n;
  insert into public.quotes (organization_id, detail_center_id, folio, folio_number, lead_id, client_id, vehicle_id,
                             contact_name, valid_until, notes, request_id)
  values (org, p_detail_center_id, center_code || '-COT-' || lpad(n::text, 5, '0'), n, p_lead_id, client,
          p_vehicle_id, contact, private.center_today(p_detail_center_id) + days, nullif(btrim(p_notes), ''),
          p_request_id)
  returning * into result;
  for item in select * from jsonb_array_elements(p_items) loop
    if coalesce((item ->> 'quantity')::integer, 1) not between 1 and 99 then
      raise exception 'Cantidad inválida (1 a 99)' using errcode = '22023';
    end if;
    if exists (select 1 from public.quote_items where quote_id = result.id and service_id = (item ->> 'service_id')::uuid) then
      raise exception 'Servicio repetido: usa la cantidad' using errcode = '22023';
    end if;
    perform private.put_quote_item(result, (item ->> 'service_id')::uuid, coalesce((item ->> 'quantity')::integer, 1));
  end loop;
  perform private.recalc_quote(result.id);
  select * into result from public.quotes where id = result.id;
  if p_lead_id is not null then
    perform private.lead_event(l, 'cotizacion', null, null, result.total, result.folio, null, result.id);
    perform private.advance_lead_to_milestone(l.id, 'cotizado', 'Cotización ' || result.folio);
  end if;
  return result;
end;
$$;

create function public.set_quote_item(p_quote_id uuid, p_version integer, p_service_id uuid, p_quantity integer)
returns public.quotes
language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes;
begin
  q := private.lock_quote(p_quote_id, p_version);
  perform private.check_quote_editable(q);
  perform private.set_change_reason('Línea de cotización');
  perform private.put_quote_item(q, p_service_id, p_quantity);
  if not exists (select 1 from public.quote_items where quote_id = q.id) then
    raise exception 'La cotización necesita al menos un servicio' using errcode = '22023';
  end if;
  perform private.recalc_quote(q.id);
  update public.quotes set updated_at = now() where id = q.id returning * into q;
  return q;
end;
$$;

-- Descuento con el mismo nivel de autorización que la OS (% acumulado).
create function public.add_quote_discount(
  p_quote_id uuid,
  p_version integer,
  p_item_id uuid,
  p_kind text,
  p_value numeric,
  p_reason text
) returns public.quotes
language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes;
  base numeric(12, 2);
  remaining numeric(12, 2);
  applied numeric(12, 2);
  pct numeric;
  required public.discount_level;
  mine public.discount_level;
begin
  q := private.lock_quote(p_quote_id, p_version);
  perform private.check_quote_editable(q);
  perform private.set_change_reason(p_reason);
  if p_kind not in ('percent', 'amount') or p_value is null or p_value <= 0 or (p_kind = 'percent' and p_value > 100) then
    raise exception 'Descuento inválido' using errcode = '22023';
  end if;
  if p_item_id is not null then
    select i.line_subtotal, i.line_subtotal - i.line_discount into base, remaining
      from public.quote_items i where i.id = p_item_id and i.quote_id = q.id;
    if not found then
      raise exception 'La línea no pertenece a la cotización' using errcode = '22023';
    end if;
  else
    select q.subtotal - coalesce(sum(i.line_discount), 0) into base from public.quote_items i where i.quote_id = q.id;
    remaining := q.total;
  end if;
  applied := case when p_kind = 'percent' then round(base * p_value / 100, 2) else p_value end;
  if applied > remaining then
    raise exception 'El descuento excede el importe pendiente' using errcode = '22023';
  end if;
  pct := case when q.subtotal > 0 then (q.discount_total + applied) * 100 / q.subtotal else 0 end;
  required := private.discount_required_level(pct);
  mine := private.discount_level_of(q.detail_center_id);
  if mine is null or mine < required then
    raise exception using errcode = '42501', message = format(
      'Un descuento acumulado de %s %% requiere autorización de nivel %s', round(pct, 1), required);
  end if;
  insert into public.quote_discounts (organization_id, quote_id, item_id, kind, value, amount, reason, authorization_level)
  values (q.organization_id, q.id, p_item_id, p_kind, p_value, applied, btrim(p_reason), required);
  perform private.recalc_quote(q.id);
  update public.quotes set updated_at = now() where id = q.id returning * into q;
  return q;
end;
$$;

create function public.void_quote_discount(p_quote_id uuid, p_version integer, p_discount_id uuid, p_reason text)
returns public.quotes
language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes;
begin
  q := private.lock_quote(p_quote_id, p_version);
  perform private.check_quote_editable(q);
  perform private.set_change_reason(p_reason);
  update public.quote_discounts
     set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
   where id = p_discount_id and quote_id = q.id and voided_at is null;
  if not found then
    raise exception 'El descuento no existe o ya estaba anulado' using errcode = '22023';
  end if;
  perform private.recalc_quote(q.id);
  update public.quotes set updated_at = now() where id = q.id returning * into q;
  return q;
end;
$$;

-- Vehículo, vigencia y notas (borrador o enviada).
create function public.update_quote(
  p_quote_id uuid,
  p_version integer,
  p_vehicle_id uuid,
  p_valid_until date,
  p_notes text,
  p_reason text
) returns public.quotes
language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes;
begin
  q := private.lock_quote(p_quote_id, p_version);
  if q.status not in ('borrador', 'enviada') then
    raise exception 'Sólo se edita una cotización en borrador o enviada' using errcode = 'MG002';
  end if;
  if p_vehicle_id is not null and not exists (
       select 1 from public.vehicles v where v.id = p_vehicle_id and v.client_id = q.client_id and v.active) then
    raise exception 'El vehículo no pertenece al cliente o está dado de baja' using errcode = '22023';
  end if;
  if p_valid_until is null or p_valid_until < private.center_today(q.detail_center_id)
     or p_valid_until > q.created_at::date + private.quote_rule('max_valid_days') then
    raise exception 'Vigencia inválida' using errcode = '22023';
  end if;
  perform private.set_change_reason(p_reason);
  update public.quotes set vehicle_id = p_vehicle_id, valid_until = p_valid_until, notes = nullif(btrim(p_notes), '')
   where id = q.id returning * into q;
  return q;
end;
$$;

-- Enviada (la persona la compartió), aceptada, rechazada o cancelada.
create function public.set_quote_status(p_quote_id uuid, p_version integer, p_status text, p_reason text default null)
returns public.quotes
language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes;
begin
  q := private.lock_quote(p_quote_id, p_version);
  if p_status not in ('enviada', 'aceptada', 'rechazada', 'cancelada') then
    raise exception 'Estado inválido' using errcode = '22023';
  end if;
  if not (
    (p_status = 'enviada' and q.status = 'borrador')
    or (p_status in ('aceptada', 'rechazada') and q.status in ('borrador', 'enviada'))
    or (p_status = 'cancelada' and q.status in ('borrador', 'enviada', 'aceptada'))
  ) then
    raise exception 'Cambio de estado no permitido desde %', q.status using errcode = 'MG002';
  end if;
  if p_status in ('aceptada', 'enviada') and private.quote_expired(q) then
    raise exception 'La cotización venció; crea una nueva con los precios vigentes' using errcode = 'MG002';
  end if;
  if p_status in ('rechazada', 'cancelada') and nullif(btrim(p_reason), '') is null then
    raise exception 'Indica el motivo' using errcode = '22023';
  end if;
  perform private.set_change_reason(coalesce(nullif(btrim(p_reason), ''), 'Cotización ' || p_status));
  update public.quotes
     set status = p_status,
         sent_at = case when p_status = 'enviada' then now() else sent_at end,
         decided_at = case when p_status in ('aceptada', 'rechazada', 'cancelada') then now() else decided_at end,
         decision_reason = case when p_status in ('rechazada', 'cancelada') then btrim(p_reason) else decision_reason end
   where id = q.id
  returning * into q;
  return q;
end;
$$;

-- Reserva: convierte la cotización en cita sin recapturar (cliente, vehículo y
-- servicios de la cotización). El precio cotizado se respeta al abrir la OS.
create function public.book_quote(
  p_quote_id uuid,
  p_version integer,
  p_request_id uuid,
  p_starts_at timestamptz,
  p_vehicle_id uuid default null,
  p_bay_id uuid default null,
  p_technician_id uuid default null,
  p_notes text default null
) returns public.appointments
language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes;
  vehicle uuid;
  appt public.appointments;
  l public.leads;
begin
  q := private.lock_quote(p_quote_id, p_version);
  if q.status = 'convertida' then
    select * into appt from public.appointments where id = q.appointment_id;
    return appt;
  end if;
  if q.status not in ('borrador', 'enviada', 'aceptada') then
    raise exception 'La cotización está %', q.status using errcode = 'MG002';
  end if;
  if private.quote_expired(q) then
    raise exception 'La cotización venció; crea una nueva con los precios vigentes' using errcode = 'MG002';
  end if;
  if q.client_id is null then
    raise exception 'Registra o liga al cliente del prospecto antes de reservar' using errcode = 'MG002';
  end if;
  vehicle := coalesce(p_vehicle_id, q.vehicle_id);
  if vehicle is null then
    raise exception 'Elige el vehículo del cliente' using errcode = '22023';
  end if;
  appt := public.create_appointment(
    q.detail_center_id, p_request_id, q.client_id, vehicle,
    (select array_agg(i.service_id order by i.position) from public.quote_items i where i.quote_id = q.id),
    p_starts_at, null, p_bay_id, p_technician_id,
    coalesce(nullif(btrim(p_notes), ''), 'Reserva de la cotización ' || q.folio));
  perform private.set_change_reason('Reserva de la cotización ' || q.folio);
  update public.appointments set quote_id = q.id where id = appt.id returning * into appt;
  update public.quotes
     set status = 'convertida', appointment_id = appt.id, converted_at = now(), vehicle_id = vehicle,
         decided_at = coalesce(decided_at, now())
   where id = q.id;
  if q.lead_id is not null then
    select * into l from public.leads where id = q.lead_id;
    perform private.lead_event(l, 'reserva', null, null, q.total, 'Cita ' || to_char(appt.starts_at, 'YYYY-MM-DD HH24:MI'),
                               null, q.id, appt.id);
    perform private.advance_lead_to_milestone(l.id, 'reservado', 'Reserva de la cotización ' || q.folio);
  end if;
  return appt;
end;
$$;

create function public.list_quotes(
  p_detail_center_ids uuid[],
  p_status text default null,
  p_lead_id uuid default null,
  p_client_id uuid default null,
  p_id uuid default null,
  p_limit integer default 200
)
returns table (
  id uuid,
  detail_center_id uuid,
  detail_center_name text,
  folio text,
  lead_id uuid,
  lead_name text,
  client_id uuid,
  client_name text,
  vehicle_id uuid,
  vehicle_label text,
  contact_name text,
  status text,
  expired boolean,
  valid_until date,
  subtotal numeric,
  discount_total numeric,
  total numeric,
  standard_cost_total numeric,
  operator_pay_total numeric,
  cost_total numeric,
  contribution_margin numeric,
  notes text,
  appointment_id uuid,
  appointment_starts_at timestamptz,
  service_order_id uuid,
  service_order_folio text,
  sent_at timestamptz,
  decided_at timestamptz,
  decision_reason text,
  items jsonb,
  discounts jsonb,
  version integer,
  created_by_name text,
  created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select q.id, q.detail_center_id, dc.name, q.folio, q.lead_id, l.full_name, q.client_id, c.full_name, q.vehicle_id,
         v.make || ' ' || v.model || ' ' || v.year || ' · ' || v.plate, q.contact_name, q.status,
         private.quote_expired(q), q.valid_until, q.subtotal, q.discount_total, q.total, q.standard_cost_total,
         q.operator_pay_total, q.cost_total, q.contribution_margin, q.notes, q.appointment_id, a.starts_at,
         a.service_order_id, o.folio, q.sent_at, q.decided_at, q.decision_reason,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', i.id, 'service_id', i.service_id, 'service_code', i.service_code,
                     'service_name', i.service_name, 'revenue_engine', i.revenue_engine, 'unit_price', i.unit_price,
                     'price_source', i.price_source, 'unit_direct_cost', i.unit_direct_cost,
                     'operator_commission_pct', i.operator_commission_pct, 'duration_minutes', i.duration_minutes,
                     'quantity', i.quantity, 'line_subtotal', i.line_subtotal, 'line_discount', i.line_discount,
                     'operator_pay', i.operator_pay,
                     'current_price', (select cat.price from public.center_catalog(q.detail_center_id) cat
                                        where cat.id = i.service_id))
                     order by i.position)
                     from public.quote_items i where i.quote_id = q.id), '[]'),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', d.id, 'item_id', d.item_id, 'kind', d.kind, 'value', d.value, 'amount', d.amount,
                     'reason', d.reason, 'authorization_level', d.authorization_level,
                     'authorized_by_name', pd.full_name, 'voided_at', d.voided_at, 'void_reason', d.void_reason,
                     'created_at', d.created_at) order by d.created_at)
                     from public.quote_discounts d left join public.profiles pd on pd.id = d.authorized_by
                    where d.quote_id = q.id), '[]'),
         q.version, pc.full_name, q.created_at
    from public.quotes q
    join public.detail_centers dc on dc.id = q.detail_center_id
    left join public.leads l on l.id = q.lead_id
    left join public.clients c on c.id = q.client_id
    left join public.vehicles v on v.id = q.vehicle_id
    left join public.appointments a on a.id = q.appointment_id
    left join public.service_orders o on o.id = a.service_order_id
    left join public.profiles pc on pc.id = q.created_by
   where q.detail_center_id = any (p_detail_center_ids)
     and private.can_use_leads(q.detail_center_id)
     and (p_id is null or q.id = p_id)
     and (p_lead_id is null or q.lead_id = p_lead_id)
     and (p_client_id is null or q.client_id = any (private.client_family(p_client_id)))
     and (p_status is null
          or (p_status = 'vencida' and private.quote_expired(q))
          or (p_status <> 'vencida' and q.status = p_status and not private.quote_expired(q)))
   order by q.created_at desc
   limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;

-- ---------------------------------------------------------------------------
-- 9. OS desde una reserva cotizada y venta del prospecto
-- ---------------------------------------------------------------------------

-- Línea nueva: si la OS se abre desde una reserva cotizada (app.quote_id en la
-- transacción), congela el precio cotizado ('cotizacion'); si no, como antes
-- (precio del centro o tarifa del convenio).
create or replace function private.put_service_order_item(o public.service_orders, p_service_id uuid, p_quantity integer)
returns void
language plpgsql set search_path = '' as $$
declare
  cat record;
  line public.service_order_items;
  priced record;
  quoted public.quote_items;
  v_quote_id uuid := nullif(current_setting('app.quote_id', true), '')::uuid;
begin
  if p_quantity is null or p_quantity not between 0 and 99 then
    raise exception 'Cantidad inválida (0 a 99)' using errcode = '22023';
  end if;
  if p_quantity = 0 then
    delete from public.service_order_items where service_order_id = o.id and service_id = p_service_id;
    return;
  end if;
  select * into line from public.service_order_items where service_order_id = o.id and service_id = p_service_id;
  if found then
    if line.b2b_price_rule_id is not null and p_quantity > line.quantity
       and private.b2b_rule_kind(line.b2b_price_rule_id) = 'incluido' then
      select * into priced from private.b2b_line_price(o.id, p_service_id, line.list_unit_price, p_quantity);
      if priced.rule_id is distinct from line.b2b_price_rule_id then
        raise exception 'El convenio no tiene unidades incluidas suficientes para esa cantidad' using errcode = 'MG002';
      end if;
    end if;
    update public.service_order_items set quantity = p_quantity where id = line.id;
    return;
  end if;
  select * into cat from public.center_catalog(o.detail_center_id) c where c.id = p_service_id;
  if not found then
    raise exception 'El servicio no está disponible en este centro' using errcode = '22023';
  end if;
  if v_quote_id is not null and o.channel <> 'b2b' then
    select * into quoted from public.quote_items i where i.quote_id = v_quote_id and i.service_id = p_service_id;
  end if;
  if quoted.id is not null then
    insert into public.service_order_items (
      organization_id, service_order_id, position, kind, service_id, service_code, service_name, revenue_engine,
      unit_price, unit_direct_cost, duration_minutes, price_source, quantity, list_unit_price, b2b_price_rule_id
    ) values (
      o.organization_id, o.id,
      (select coalesce(max(position) + 1, 0) from public.service_order_items where service_order_id = o.id),
      case when cat.revenue_engine = 'producto_complemento' then 'producto' else 'servicio' end,
      cat.id, cat.code, cat.name, cat.revenue_engine, quoted.unit_price, cat.direct_cost, cat.standard_duration_minutes,
      'cotizacion', p_quantity, cat.price, null
    );
    return;
  end if;
  select * into priced from private.b2b_line_price(o.id, p_service_id, cat.price, p_quantity);
  insert into public.service_order_items (
    organization_id, service_order_id, position, kind, service_id, service_code, service_name, revenue_engine,
    unit_price, unit_direct_cost, duration_minutes, price_source, quantity, list_unit_price, b2b_price_rule_id
  ) values (
    o.organization_id, o.id,
    (select coalesce(max(position) + 1, 0) from public.service_order_items where service_order_id = o.id),
    case when cat.revenue_engine = 'producto_complemento' then 'producto' else 'servicio' end,
    cat.id, cat.code, cat.name, cat.revenue_engine, priced.price, cat.direct_cost, cat.standard_duration_minutes,
    case when priced.rule_id is null then cat.price_source else 'convenio' end, p_quantity, cat.price, priced.rule_id
  );
end;
$$;

-- OS desde una cita recibida. Con cotización: cantidades, precio cotizado y
-- descuentos que ya se autorizaron al cotizar (conservan su nivel y quién los
-- autorizó). El costo y el % del operador son los vigentes al vender.
create or replace function public.create_service_order_from_appointment(
  p_appointment_id uuid,
  p_request_id uuid,
  p_channel public.sales_channel default 'b2c',
  p_channel_reference text default null,
  p_odometer_km integer default null,
  p_promised_at timestamptz default null
) returns public.service_orders
language plpgsql security invoker set search_path = '' as $$
declare
  a public.appointments;
  q public.quotes;
  result public.service_orders;
  items jsonb;
begin
  select * into a from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'Cita inexistente o sin permiso' using errcode = '42501';
  end if;
  if a.service_order_id is not null then
    select * into result from public.service_orders where id = a.service_order_id;
    return result;
  end if;
  if a.status not in ('recibida', 'en_servicio') then
    raise exception 'Primero recibe la cita para abrir su OS' using errcode = '22023';
  end if;
  if a.quote_id is not null then
    select * into q from public.quotes where id = a.quote_id;
  end if;
  items := case
    when q.id is not null then
      (select coalesce(jsonb_agg(jsonb_build_object('service_id', s.service_id,
                                                    'quantity', coalesce(i.quantity, 1)) order by s.position), '[]')
         from public.appointment_services s
         left join public.quote_items i on i.quote_id = q.id and i.service_id = s.service_id
        where s.appointment_id = a.id)
    else
      (select coalesce(jsonb_agg(jsonb_build_object('service_id', s.service_id, 'quantity', 1) order by s.position), '[]')
         from public.appointment_services s where s.appointment_id = a.id)
  end;
  perform set_config('app.quote_id', coalesce(q.id::text, ''), true);
  begin
    result := private.insert_service_order(
      a.detail_center_id, p_request_id, a.client_id, a.vehicle_id, p_channel, p_channel_reference, items,
      a.id, a.bay_id, a.technician_id, a.notes, p_odometer_km, p_promised_at);
  exception when others then
    perform set_config('app.quote_id', '', true);
    raise;
  end;
  perform set_config('app.quote_id', '', true);
  perform private.set_change_reason('OS desde cita');
  update public.appointments set service_order_id = result.id where id = a.id;

  if q.id is not null and result.channel <> 'b2b' then
    perform private.set_change_reason('Descuento autorizado en la cotización ' || q.folio);
    insert into public.service_order_discounts
      (organization_id, service_order_id, item_id, kind, value, amount, reason, authorization_level, authorized_by)
    select result.organization_id, result.id, oi.id, d.kind, d.value, 0,
           left('Cotización ' || q.folio || ': ' || d.reason, 500), d.authorization_level, d.authorized_by
      from public.quote_discounts d
      left join public.quote_items qi on qi.id = d.item_id
      left join public.service_order_items oi on oi.service_order_id = result.id and oi.service_id = qi.service_id
     where d.quote_id = q.id and d.voided_at is null
       and (d.item_id is null or oi.id is not null);
    perform private.recalc_service_order(result.id);
    select * into result from public.service_orders where id = result.id;
    perform private.log_event(result.organization_id, result.detail_center_id, 'service_order.quote_applied',
                              'public.service_orders', result.id::text,
                              jsonb_build_object('quote_id', q.id, 'quote_total', q.total, 'order_total', result.total));
  end if;
  return result;
end;
$$;

-- Al entregarse la OS de una reserva cotizada, su prospecto queda ganado.
create function private.win_lead_from_order() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  l public.leads;
begin
  if new.status <> 'entregada' or old.status = 'entregada' or new.appointment_id is null then
    return null;
  end if;
  select ld.* into l
    from public.appointments a
    join public.quotes q on q.id = a.quote_id
    join public.leads ld on ld.id = q.lead_id
   where a.id = new.appointment_id and ld.status = 'abierta'
   for update of ld;
  if not found or exists (select 1 from public.leads x where x.service_order_id = new.id) then
    return null;
  end if;
  perform private.mark_lead_won(l, new, 'Venta ' || new.folio);
  return null;
end;
$$;
create trigger service_orders_win_lead after update of status on public.service_orders
  for each row execute function private.win_lead_from_order();

-- ---------------------------------------------------------------------------
-- 10. Duplicados y fusión supervisada
-- ---------------------------------------------------------------------------

-- Pares de clientes activos que parecen la misma persona: mismo teléfono
-- (últimos 10 dígitos: +52 / +521) o mismo email. El nombre parecido sólo se
-- informa; nunca basta para proponer una fusión.
create function public.client_duplicate_candidates(p_detail_center_ids uuid[], p_limit integer default 100)
returns table (
  client_a_id uuid,
  client_a_name text,
  client_a_phone text,
  client_a_email text,
  client_a_created_at timestamptz,
  client_a_orders integer,
  client_a_active_memberships integer,
  client_a_b2b boolean,
  client_b_id uuid,
  client_b_name text,
  client_b_phone text,
  client_b_email text,
  client_b_created_at timestamptz,
  client_b_orders integer,
  client_b_active_memberships integer,
  client_b_b2b boolean,
  matched_on text[],
  name_similarity numeric
)
language sql stable security definer set search_path = '' as $$
  with vis as (
    select distinct c.id, c.organization_id, c.full_name, c.phone, c.email, c.created_at, c.kind,
           right(c.phone_digits, 10) as pk, c.search_name
      from public.client_centers cc
      join public.clients c on c.id = cc.client_id and c.active
     where cc.detail_center_id = any (p_detail_center_ids)
       and private.can_merge_clients(cc.detail_center_id)
  ), pairs as (
    select a.*, b.id as b_id, b.full_name as b_name, b.phone as b_phone, b.email as b_email,
           b.created_at as b_created_at, b.kind as b_kind,
           array_remove(array[case when a.pk = b.pk then 'telefono' end,
                              case when a.email is not null and a.email = b.email then 'email' end], null) as m,
           extensions.similarity(a.search_name, b.search_name) as sim
      from vis a
      join vis b on b.organization_id = a.organization_id and a.id < b.id and a.kind = b.kind
                and (a.pk = b.pk or (a.email is not null and a.email = b.email))
  )
  select p.id, p.full_name, p.phone, p.email, p.created_at,
         (select count(*)::integer from public.service_orders o where o.client_id = p.id),
         (select count(*)::integer from public.memberships m where m.client_id = p.id and m.state = 'activa'),
         exists (select 1 from public.b2b_accounts ac where ac.client_id = p.id),
         p.b_id, p.b_name, p.b_phone, p.b_email, p.b_created_at,
         (select count(*)::integer from public.service_orders o where o.client_id = p.b_id),
         (select count(*)::integer from public.memberships m where m.client_id = p.b_id and m.state = 'activa'),
         exists (select 1 from public.b2b_accounts ac where ac.client_id = p.b_id),
         p.m || case when p.sim >= 0.6 then array['nombre_parecido'] else '{}'::text[] end,
         round(p.sim::numeric, 2)
    from pairs p
   order by cardinality(p.m) desc, p.sim desc, p.created_at
   limit least(greatest(coalesce(p_limit, 100), 1), 300);
$$;

-- Fusión supervisada: conserva p_keep_client_id. No reescribe documentos
-- (OS, pagos, membresías, citas pasadas): el duplicado queda inactivo y apunta
-- al que se conserva. Pasan al que se conserva: vehículos, centros, tareas
-- pendientes, citas programadas sin OS, oportunidades y prospectos abiertos,
-- cotizaciones sin convertir, consentimiento (la decisión más reciente por
-- canal) y la cuenta B2B si sólo el duplicado la tenía.
create function public.merge_clients(p_keep_client_id uuid, p_merge_client_id uuid, p_reason text)
returns public.clients
language plpgsql security definer set search_path = '' as $$
declare
  k public.clients;
  d public.clients;
  allowed boolean;
  moved jsonb;
  n_vehicles integer;
  n_tasks integer;
  n_appts integer;
  n_opps integer;
  n_leads integer;
  n_quotes integer;
begin
  if p_keep_client_id is null or p_merge_client_id is null or p_keep_client_id = p_merge_client_id then
    raise exception 'Elige dos clientes distintos' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Indica el motivo de la fusión' using errcode = '22023';
  end if;
  -- Orden fijo de bloqueo para evitar interbloqueos entre fusiones cruzadas.
  perform 1 from public.clients where id in (p_keep_client_id, p_merge_client_id) order by id for update;
  select * into k from public.clients where id = p_keep_client_id;
  select * into d from public.clients where id = p_merge_client_id;
  if k.id is null or d.id is null or k.organization_id <> d.organization_id then
    raise exception 'Clientes inexistentes o de otra organización' using errcode = '42501';
  end if;
  -- Quien fusiona debe poder hacerlo en algún centro de cada cliente.
  select exists (select 1 from public.client_centers cc where cc.client_id = k.id and private.can_merge_clients(cc.detail_center_id))
     and exists (select 1 from public.client_centers cc where cc.client_id = d.id and private.can_merge_clients(cc.detail_center_id))
    into allowed;
  if not allowed then
    raise exception 'Sólo el encargado o el admin de los centros de ambos clientes fusiona duplicados' using errcode = '42501';
  end if;
  if not k.active or not d.active then
    raise exception 'Ambos clientes deben estar activos (sin fusionar)' using errcode = 'MG002';
  end if;
  if k.kind <> d.kind then
    raise exception 'No se fusiona una persona con una empresa' using errcode = 'MG002';
  end if;
  if right(k.phone_digits, 10) <> right(d.phone_digits, 10) and (k.email is null or k.email is distinct from d.email) then
    raise exception 'Sólo se fusionan clientes con el mismo teléfono o email (el nombre no basta)' using errcode = 'MG002';
  end if;
  if exists (select 1 from public.b2b_accounts a where a.client_id = k.id)
     and exists (select 1 from public.b2b_accounts a where a.client_id = d.id) then
    raise exception 'Ambos tienen cuenta B2B: revísalo con el área comercial antes de fusionar' using errcode = 'MG002';
  end if;
  if exists (select 1 from public.memberships m where m.client_id = d.id and m.state = 'activa') then
    raise exception 'El duplicado tiene una membresía activa: consérvalo a él y fusiona el otro' using errcode = 'MG002';
  end if;

  perform private.set_change_reason('Fusión de clientes: ' || btrim(p_reason));
  -- Vehículos (las OS y membresías guardan su propia referencia y no cambian).
  perform set_config('app.merging_client', d.id::text, true);
  update public.vehicles set client_id = k.id where client_id = d.id;
  get diagnostics n_vehicles = row_count;
  perform set_config('app.merging_client', '', true);
  insert into public.client_centers (client_id, detail_center_id, organization_id, first_seen_at, last_visit_at)
  select k.id, cc.detail_center_id, cc.organization_id, cc.first_seen_at, cc.last_visit_at
    from public.client_centers cc where cc.client_id = d.id
  on conflict (client_id, detail_center_id) do update
    set first_seen_at = least(public.client_centers.first_seen_at, excluded.first_seen_at),
        last_visit_at = greatest(public.client_centers.last_visit_at, excluded.last_visit_at);
  -- Consentimiento: por canal, la decisión más reciente de cualquiera de los dos.
  insert into public.contact_preferences (organization_id, client_id, channel, opted_in, source, updated_by)
  select k.organization_id, k.id, cp.channel, cp.opted_in, cp.source, cp.updated_by
    from public.contact_preferences cp
   where cp.client_id = d.id
     and not exists (select 1 from public.contact_preferences x
                      where x.client_id = k.id and x.channel = cp.channel and x.updated_at >= cp.updated_at)
  on conflict (client_id, channel) do update
    set opted_in = excluded.opted_in, source = excluded.source, updated_by = excluded.updated_by;
  update public.clients c
     set marketing_channels = coalesce((select array_agg(cp.channel order by cp.channel) from public.contact_preferences cp
                                          where cp.client_id = k.id and cp.opted_in and cp.channel in ('whatsapp', 'sms', 'email')), '{}'),
         marketing_opt_in = exists (select 1 from public.contact_preferences cp
                                     where cp.client_id = k.id and cp.opted_in and cp.channel in ('whatsapp', 'sms', 'email')),
         marketing_opt_in_at = case when exists (select 1 from public.contact_preferences cp
                                     where cp.client_id = k.id and cp.opted_in and cp.channel in ('whatsapp', 'sms', 'email'))
                                    then coalesce(c.marketing_opt_in_at, now()) end,
         marketing_opt_in_source = case when exists (select 1 from public.contact_preferences cp
                                     where cp.client_id = k.id and cp.opted_in and cp.channel in ('whatsapp', 'sms', 'email'))
                                    then coalesce(c.marketing_opt_in_source, 'web') end,
         email = coalesce(c.email, d.email),
         last_visit_at = greatest(c.last_visit_at, d.last_visit_at)
   where c.id = k.id;
  update public.crm_tasks set client_id = k.id where client_id = d.id and status = 'pendiente';
  get diagnostics n_tasks = row_count;
  update public.appointments set client_id = k.id
   where client_id = d.id and status = 'programada' and service_order_id is null;
  get diagnostics n_appts = row_count;
  update public.sales_opportunities set client_id = k.id where client_id = d.id and status = 'abierta';
  get diagnostics n_opps = row_count;
  update public.leads set client_id = k.id where client_id = d.id;
  get diagnostics n_leads = row_count;
  update public.leads set referred_by_client_id = k.id where referred_by_client_id = d.id;
  update public.quotes set client_id = k.id
   where client_id = d.id and status in ('borrador', 'enviada', 'aceptada');
  get diagnostics n_quotes = row_count;
  update public.b2b_accounts set client_id = k.id where client_id = d.id;
  -- El duplicado queda inactivo, apuntando al que se conserva (se aplana: lo
  -- que ya se había fusionado en él pasa también).
  update public.clients set merged_into_id = k.id where merged_into_id = d.id;
  update public.clients
     set active = false, merged_into_id = k.id, merged_at = now(), merged_by = auth.uid()
   where id = d.id;
  moved := jsonb_build_object('vehicles', n_vehicles, 'pending_tasks', n_tasks, 'appointments', n_appts,
                              'opportunities', n_opps, 'leads', n_leads, 'quotes', n_quotes,
                              'merged_client_id', d.id, 'reason', btrim(p_reason));
  perform private.log_event(k.organization_id, k.home_detail_center_id, 'client.merged', 'public.clients',
                            k.id::text, moved);
  select * into k from public.clients where id = k.id;
  return k;
end;
$$;

-- La fusión es el flujo de transferencia de vehículos: sólo durante ella (marca
-- local de la transacción, puesta por merge_clients) un vehículo cambia de cliente.
create or replace function private.keep_origin_columns() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.request_id is distinct from old.request_id
     or new.created_in_detail_center_id is distinct from old.created_in_detail_center_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Las columnas de origen del registro no se pueden cambiar' using errcode = '23514';
  end if;
  if tg_table_name = 'vehicles' then
    -- Un vehículo no cambia de cliente por edición (sólo al fusionar duplicados).
    if (to_jsonb(new) ->> 'client_id') is distinct from (to_jsonb(old) ->> 'client_id')
       and coalesce(current_setting('app.merging_client', true), '') is distinct from (to_jsonb(old) ->> 'client_id') then
      raise exception 'Las columnas de origen del registro no se pueden cambiar' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Segmentación
-- ---------------------------------------------------------------------------

-- Clientes de los centros con sus métricas comerciales. Filtros (todos
-- opcionales): servicios contratados (alguno), interés en servicios (prospecto
-- o cotización abierta), visitas mínimas, gasto mínimo / máximo, días desde la
-- última visita, canal con consentimiento. El gasto es Σ OS entregadas.
create function public.commercial_segment(
  p_detail_center_ids uuid[],
  p_service_ids uuid[] default null,
  p_interest_service_ids uuid[] default null,
  p_min_visits integer default null,
  p_min_spend numeric default null,
  p_max_spend numeric default null,
  p_min_days_since_visit integer default null,
  p_max_days_since_visit integer default null,
  p_consent_channel text default null,
  p_limit integer default 500
)
returns table (
  client_id uuid,
  full_name text,
  phone text,
  email text,
  home_center_name text,
  visits integer,
  first_visit_at timestamptz,
  last_visit_at timestamptz,
  days_since_last_visit integer,
  avg_days_between_visits numeric,
  total_spend numeric,
  avg_ticket numeric,
  service_names text[],
  interest_names text[],
  consent_channels text[]
)
language sql stable security definer set search_path = '' as $$
  with centers as (
    select c.id from unnest(p_detail_center_ids) c(id) where private.can_use_crm(c.id)
  ), cl as (
    select distinct c.id, c.full_name, c.phone, c.email, c.home_detail_center_id
      from public.client_centers cc
      join public.clients c on c.id = cc.client_id and c.active
     where cc.detail_center_id in (select id from centers)
  ), fam as (
    select cl.id as client_id, unnest(private.client_family(cl.id)) as member_id from cl
  ), ord as (
    select f.client_id, o.id, o.created_at, o.total, o.status
      from fam f
      join public.service_orders o on o.client_id = f.member_id and o.status <> 'cancelada'
     where o.detail_center_id in (select id from centers)
  ), agg as (
    select o.client_id, count(*)::integer as visits, min(o.created_at) as first_at, max(o.created_at) as last_at,
           coalesce(sum(o.total) filter (where o.status = 'entregada'), 0)::numeric(14, 2) as spend,
           count(*) filter (where o.status = 'entregada') as delivered
      from ord o group by o.client_id
  ), svc as (
    select o.client_id, array_agg(distinct i.service_id) as ids, array_agg(distinct i.service_name) as names
      from ord o join public.service_order_items i on i.service_order_id = o.id
     group by o.client_id
  ), interest as (
    select x.client_id, array_agg(distinct x.service_id) as ids, array_agg(distinct s.name) as names
      from (
        select f.client_id, ls.service_id
          from fam f join public.leads l on l.client_id = f.member_id and l.status = 'abierta'
          join public.lead_services ls on ls.lead_id = l.id
        union
        select f.client_id, qi.service_id
          from fam f join public.quotes q on q.client_id = f.member_id and q.status in ('borrador', 'enviada', 'aceptada')
          join public.quote_items qi on qi.quote_id = q.id
      ) x join public.services s on s.id = x.service_id
     group by x.client_id
  )
  select cl.id, cl.full_name, cl.phone, cl.email, dc.name, coalesce(a.visits, 0), a.first_at, a.last_at,
         case when a.last_at is null then null
              else ((now() at time zone dc.timezone)::date - (a.last_at at time zone dc.timezone)::date) end,
         case when coalesce(a.visits, 0) >= 2
              then round(extract(epoch from (a.last_at - a.first_at)) / 86400 / (a.visits - 1), 1) end,
         coalesce(a.spend, 0),
         case when coalesce(a.delivered, 0) > 0 then round(a.spend / a.delivered, 2) end,
         coalesce(s.names, '{}'), coalesce(i.names, '{}'),
         coalesce((select array_agg(cp.channel order by cp.channel) from public.contact_preferences cp
                    where cp.client_id = cl.id and cp.opted_in), '{}')
    from cl
    join public.detail_centers dc on dc.id = cl.home_detail_center_id
    left join agg a on a.client_id = cl.id
    left join svc s on s.client_id = cl.id
    left join interest i on i.client_id = cl.id
   where (p_service_ids is null or cardinality(p_service_ids) = 0 or s.ids && p_service_ids)
     and (p_interest_service_ids is null or cardinality(p_interest_service_ids) = 0 or i.ids && p_interest_service_ids)
     and (p_min_visits is null or coalesce(a.visits, 0) >= p_min_visits)
     and (p_min_spend is null or coalesce(a.spend, 0) >= p_min_spend)
     and (p_max_spend is null or coalesce(a.spend, 0) <= p_max_spend)
     and (p_min_days_since_visit is null
          or (a.last_at is not null
              and (now() at time zone dc.timezone)::date - (a.last_at at time zone dc.timezone)::date >= p_min_days_since_visit))
     and (p_max_days_since_visit is null
          or (a.last_at is not null
              and (now() at time zone dc.timezone)::date - (a.last_at at time zone dc.timezone)::date <= p_max_days_since_visit))
     and (p_consent_channel is null or exists (select 1 from public.contact_preferences cp
                                                where cp.client_id = cl.id and cp.opted_in and cp.channel = p_consent_channel))
   order by coalesce(a.spend, 0) desc, cl.full_name
   limit least(greatest(coalesce(p_limit, 500), 1), 2000);
$$;

-- ---------------------------------------------------------------------------
-- 12. Métricas del recorrido (sin datos personales)
-- ---------------------------------------------------------------------------

-- Un hecho por prospecto creado en el rango (fecha del centro), derivado de
-- lead_events. La venta es la OS que lo ganó (margen = total − costo).
create function public.commercial_funnel_facts(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  lead_id uuid,
  detail_center_id uuid,
  source_channel text,
  owner_id uuid,
  created_at timestamptz,
  first_contact_minutes numeric,
  quoted_at timestamptz,
  booked_at timestamptz,
  won_at timestamptz,
  lost_at timestamptz,
  loss_reason text,
  status text,
  sale_total numeric,
  sale_cost numeric,
  sale_margin numeric,
  interest_service_ids uuid[]
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Periodo inválido (máximo 366 días)' using errcode = '22023';
  end if;
  return query
  select l.id, l.detail_center_id, l.source_channel, l.owner_id, l.created_at,
         case when l.first_contact_at is null then null
              else round(extract(epoch from (l.first_contact_at - l.created_at)) / 60, 1) end,
         (select min(e.occurred_at) from public.lead_events e where e.lead_id = l.id and e.kind = 'cotizacion'),
         (select min(e.occurred_at) from public.lead_events e where e.lead_id = l.id and e.kind = 'reserva'),
         case when l.status = 'ganada' then l.closed_at end,
         case when l.status = 'perdida' then l.closed_at end,
         l.loss_reason, l.status,
         o.total, o.cost_total, o.total - o.cost_total,
         coalesce((select array_agg(ls.service_id) from public.lead_services ls where ls.lead_id = l.id), '{}')
    from public.leads l
    join public.detail_centers dc on dc.id = l.detail_center_id
    left join public.service_orders o on o.id = l.service_order_id
   where l.detail_center_id = any (p_detail_center_ids)
     and private.can_read_commercial_metrics(l.detail_center_id)
     and (l.created_at at time zone dc.timezone)::date between p_from and p_to
   order by l.created_at;
end;
$$;

-- Un hecho por cotización creada en el rango: estado efectivo, importes y
-- margen estimado; si ya hay OS, su total y margen reales.
create function public.commercial_quote_facts(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  quote_id uuid,
  detail_center_id uuid,
  from_lead boolean,
  source_channel text,
  status text,
  expired boolean,
  created_at timestamptz,
  total numeric,
  discount_total numeric,
  cost_total numeric,
  contribution_margin numeric,
  booked boolean,
  order_status text,
  order_total numeric,
  order_margin numeric
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Periodo inválido (máximo 366 días)' using errcode = '22023';
  end if;
  return query
  select q.id, q.detail_center_id, q.lead_id is not null, l.source_channel, q.status, private.quote_expired(q),
         q.created_at, q.total, q.discount_total, q.cost_total, q.contribution_margin, q.appointment_id is not null,
         o.status::text, o.total, o.total - o.cost_total
    from public.quotes q
    join public.detail_centers dc on dc.id = q.detail_center_id
    left join public.leads l on l.id = q.lead_id
    left join public.appointments a on a.id = q.appointment_id
    left join public.service_orders o on o.id = a.service_order_id
   where q.detail_center_id = any (p_detail_center_ids)
     and private.can_read_commercial_metrics(q.detail_center_id)
     and (q.created_at at time zone dc.timezone)::date between p_from and p_to
   order by q.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  -- Triggers: nadie los ejecuta directamente.
  foreach fn in array array[
    'private.bump_row_version()', 'private.check_lead_stage()', 'private.forbid_lead_event_changes()',
    'private.keep_quote_item_frozen()', 'private.keep_quote_identity()', 'private.seed_org_lead_stages()',
    'private.win_lead_from_order()', 'private.seed_lead_stages(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
  -- Ayudantes que usan las RPC (security invoker) de quien llama.
  foreach fn in array array[
    'private.can_use_leads(uuid)', 'private.can_read_commercial_metrics(uuid)', 'private.can_merge_clients(uuid)',
    'private.can_manage_lead_stages(uuid)', 'private.client_family(uuid)', 'private.client_root(uuid)',
    'private.lead_event(public.leads, text, uuid, uuid, numeric, text, text, uuid, uuid, uuid)',
    'private.lock_lead(uuid, integer)', 'private.check_lead_owner(uuid, uuid)',
    'private.check_visible_client(uuid, uuid)', 'private.advance_lead_to_milestone(uuid, text, text)',
    'private.mark_lead_won(public.leads, public.service_orders, text)', 'private.quote_rule(text)',
    'private.lock_quote(uuid, integer)', 'private.quote_expired(public.quotes)',
    'private.check_quote_editable(public.quotes)', 'private.recalc_quote(uuid)',
    'private.put_quote_item(public.quotes, uuid, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.lead_matches(uuid, text, text, uuid)',
    'public.create_lead(uuid, uuid, text, text, text, text, text, text, uuid, uuid, uuid[], text, text, text[], numeric, uuid, text, date)',
    'public.update_lead(uuid, integer, text, text, text, text, text, text, uuid[], text, text, text[], numeric, uuid, text, date, text)',
    'public.log_lead_contact(uuid, integer, text, text)',
    'public.move_lead_stage(uuid, integer, uuid, text)',
    'public.add_lead_note(uuid, text)',
    'public.lose_lead(uuid, integer, text, text)',
    'public.reopen_lead(uuid, integer, uuid, text)',
    'public.win_lead(uuid, integer, uuid)',
    'public.link_lead_client(uuid, integer, uuid, text)',
    'public.create_lead_task(uuid, uuid, text, date, text, uuid)',
    'public.list_leads(uuid[], text, uuid, uuid, text, text, uuid, integer)',
    'public.lead_timeline(uuid)',
    'public.lead_owners(uuid)',
    'public.upsert_lead_stage(uuid, uuid, text, text, smallint, text, boolean, text)',
    'public.create_quote(uuid, uuid, jsonb, uuid, uuid, uuid, integer, text)',
    'public.set_quote_item(uuid, integer, uuid, integer)',
    'public.add_quote_discount(uuid, integer, uuid, text, numeric, text)',
    'public.void_quote_discount(uuid, integer, uuid, text)',
    'public.update_quote(uuid, integer, uuid, date, text, text)',
    'public.set_quote_status(uuid, integer, text, text)',
    'public.book_quote(uuid, integer, uuid, timestamptz, uuid, uuid, uuid, text)',
    'public.list_quotes(uuid[], text, uuid, uuid, uuid, integer)',
    'public.client_duplicate_candidates(uuid[], integer)',
    'public.merge_clients(uuid, uuid, text)',
    'public.commercial_segment(uuid[], uuid[], uuid[], integer, numeric, numeric, integer, integer, text, integer)',
    'public.commercial_funnel_facts(uuid[], date, date)',
    'public.commercial_quote_facts(uuid[], date, date)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
