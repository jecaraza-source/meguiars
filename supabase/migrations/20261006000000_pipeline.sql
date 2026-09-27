-- C5 — Comercial / Pipeline: embudo básico de oportunidades B2B y clientes de
-- alto valor (B2C premium), sin convertirlo en un CRM empresarial.
--
-- * pipeline_stages: etapas por organización (configurables por el admin
--   corporativo). Mínimas: prospecto, contactado, propuesta, negociación
--   (abiertas), ganado y perdido (cierre, una de cada una).
-- * sales_opportunities: oportunidad con contacto/cuenta (cuenta B2B o cliente
--   existente, o datos del prospecto), valor estimado, siguiente acción,
--   responsable, centro, etapa y propuesta de convenio (B2B).
-- * opportunity_events: historial inmutable (alta, etapa, valor, responsable,
--   notas, ganada, perdida, reabierta, convertida). Las métricas se calculan
--   sólo desde aquí (pipeline_metric_facts).
-- * crm_tasks: las tareas de la oportunidad reutilizan la cola del CRM
--   (opportunity_id; un prospecto aún no tiene cliente).
-- * Ganar una oportunidad B2B la convierte en cuenta (y convenio, si hay
--   propuesta) sin recaptura y sin duplicar la empresa: reutiliza la cuenta o
--   el cliente existentes (por cuenta ligada, cliente, RFC, teléfono o email).
--
-- Escrituras sólo por RPC con motivo y auditoría. Compatible hacia atrás.

-- ---------------------------------------------------------------------------
-- 1. Permisos
-- ---------------------------------------------------------------------------

-- pipeline.read: ver oportunidades, historial y tareas del centro.
create function private.can_read_pipeline(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(
    p_detail_center_id, array['admin_socio', 'encargado', 'comercial_b2b']::public.app_role[]);
$$;

-- pipeline.write: B2B sólo admin y comercial B2B (como b2b.write); B2C premium
-- también el encargado.
create function private.can_write_pipeline(p_detail_center_id uuid, p_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'b2b' then private.has_center_role(p_detail_center_id, array['admin_socio', 'comercial_b2b']::public.app_role[])
    when 'b2c_premium' then private.has_center_role(
      p_detail_center_id, array['admin_socio', 'encargado', 'comercial_b2b']::public.app_role[])
    else false
  end;
$$;

-- pipeline.metrics: indicadores sin datos personales (el contador también).
create function private.can_read_pipeline_metrics(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(
    p_detail_center_id, array['admin_socio', 'encargado', 'comercial_b2b', 'contador']::public.app_role[]);
$$;

-- pipeline.manage: etapas de la organización (admin corporativo).
create function private.can_manage_pipeline(p_organization_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_org_role(p_organization_id, array['admin_socio']::public.app_role[]);
$$;

-- ¿Otro usuario (activo) tiene alguno de los roles en el centro? (responsable).
create function private.user_has_center_role(p_user_id uuid, p_detail_center_id uuid, p_roles public.app_role[])
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.detail_centers c
      join public.profiles p on p.id = p_user_id and p.active
     where c.id = p_detail_center_id and c.active
       and (exists (select 1 from public.user_detail_centers m
                     where m.detail_center_id = c.id and m.user_id = p_user_id and m.active and m.role = any (p_roles))
            or exists (select 1 from public.role_assignments ra
                        where ra.organization_id = c.organization_id and ra.user_id = p_user_id and ra.active
                          and ra.role = any (p_roles))));
$$;

-- Espejo de can_write_pipeline para un responsable distinto al usuario.
create function private.can_own_opportunity(p_user_id uuid, p_detail_center_id uuid, p_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.user_has_center_role(p_user_id, p_detail_center_id,
    case p_kind when 'b2b' then array['admin_socio', 'comercial_b2b']::public.app_role[]
                else array['admin_socio', 'encargado', 'comercial_b2b']::public.app_role[] end);
$$;

-- ---------------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------------

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (length(btrim(name)) between 2 and 60),
  -- abierta: etapa de trabajo; ganada / perdida: cierre (una de cada una).
  kind text not null check (kind in ('abierta', 'ganada', 'perdida')),
  position smallint not null check (position between 1 and 99),
  -- Probabilidad de cierre de referencia (valor ponderado).
  probability smallint not null check (probability between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, code),
  check (kind = 'abierta' or probability = case kind when 'ganada' then 100 else 0 end),
  check (kind = 'abierta' or active)
);
create unique index pipeline_stages_one_won on public.pipeline_stages (organization_id) where kind = 'ganada';
create unique index pipeline_stages_one_lost on public.pipeline_stages (organization_id) where kind = 'perdida';

create table public.sales_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  -- b2b: empresa o flotilla; b2c_premium: cliente de alto valor (ya registrado).
  kind text not null check (kind in ('b2b', 'b2c_premium')),
  title text not null check (length(btrim(title)) between 2 and 120),
  -- Contacto / cuenta: cuenta B2B existente, cliente existente o prospecto.
  b2b_account_id uuid,
  client_id uuid,
  company_name text check (company_name is null or length(btrim(company_name)) between 2 and 120),
  legal_name text check (legal_name is null or length(btrim(legal_name)) between 2 and 200),
  rfc text check (rfc is null or rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  contact_name text check (contact_name is null or length(btrim(contact_name)) between 2 and 120),
  contact_title text check (contact_title is null or length(contact_title) <= 80),
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  contact_email text check (
    contact_email is null
    or (contact_email = lower(contact_email) and length(contact_email) <= 254
        and contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  estimated_value numeric(12, 2) not null check (estimated_value >= 0),
  stage_id uuid not null,
  status text not null default 'abierta' check (status in ('abierta', 'ganada', 'perdida')),
  -- Responsable (null = sin asignar).
  owner_id uuid references auth.users (id) on delete set null,
  next_action text check (next_action is null or length(btrim(next_action)) between 2 and 200),
  next_action_on date,
  expected_close_on date,
  source text check (source in ('referido', 'visita', 'llamada', 'web', 'evento', 'cliente_actual', 'otro')),
  -- Propuesta de convenio (B2B): se convierte al ganar, sin recaptura.
  proposed_billing_model text check (proposed_billing_model in ('por_vehiculo', 'volumen_mensual', 'paquete', 'iguala')),
  proposed_months smallint check (proposed_months is null or proposed_months between 1 and 60),
  proposed_vehicle_rule text check (proposed_vehicle_rule in ('lista', 'cualquiera')),
  proposed_payment_terms_days smallint check (proposed_payment_terms_days is null
                                              or proposed_payment_terms_days between 0 and 120),
  proposed_credit_limit numeric(12, 2) check (proposed_credit_limit is null or proposed_credit_limit > 0),
  proposed_fee_amount numeric(12, 2) check (proposed_fee_amount is null or proposed_fee_amount > 0),
  proposed_included_units integer check (proposed_included_units is null or proposed_included_units between 1 and 10000),
  notes text check (notes is null or length(notes) <= 2000),
  -- Cierre.
  closed_at timestamptz,
  won_value numeric(12, 2) check (won_value is null or won_value >= 0),
  loss_reason text check (loss_reason in ('precio', 'competencia', 'sin_presupuesto', 'sin_respuesta', 'no_califica', 'otro')),
  loss_notes text check (loss_notes is null or length(loss_notes) <= 1000),
  converted_account_id uuid,
  converted_agreement_id uuid,
  version integer not null default 1,
  request_id uuid not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, request_id),
  -- B2C premium: siempre un cliente registrado; la cuenta B2B, sólo en B2B.
  check (kind = 'b2b' or client_id is not null),
  check (kind = 'b2b' or (b2b_account_id is null and proposed_billing_model is null and converted_account_id is null)),
  -- Un prospecto sin cliente ni cuenta necesita empresa y un contacto localizable.
  check (client_id is not null or b2b_account_id is not null
         or (company_name is not null and contact_name is not null
             and (contact_phone is not null or contact_email is not null))),
  check ((status = 'abierta') = (closed_at is null)),
  check ((status = 'ganada') = (won_value is not null)),
  check ((status = 'perdida') = (loss_reason is not null)),
  check (status = 'ganada' or (converted_account_id is null and converted_agreement_id is null)),
  check ((coalesce(proposed_billing_model, '') in ('paquete', 'iguala'))
         = (proposed_fee_amount is not null and proposed_included_units is not null)),
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete restrict,
  foreign key (organization_id, stage_id) references public.pipeline_stages (organization_id, id) on delete restrict,
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete restrict,
  foreign key (organization_id, b2b_account_id) references public.b2b_accounts (organization_id, id) on delete restrict,
  foreign key (organization_id, converted_account_id) references public.b2b_accounts (organization_id, id) on delete restrict,
  foreign key (organization_id, converted_agreement_id)
    references public.b2b_agreements (organization_id, id) on delete restrict
);
create index sales_opportunities_center_status_idx on public.sales_opportunities (detail_center_id, status, stage_id);
create index sales_opportunities_owner_idx on public.sales_opportunities (owner_id) where status = 'abierta';
create index sales_opportunities_client_idx on public.sales_opportunities (client_id) where client_id is not null;
create index sales_opportunities_account_idx on public.sales_opportunities (b2b_account_id) where b2b_account_id is not null;

-- Historial inmutable: fuente de las métricas (no se actualiza ni se borra).
create table public.opportunity_events (
  id uuid primary key default gen_random_uuid(),
  -- Orden total (varios eventos pueden compartir now() en una transacción).
  seq bigint generated always as identity,
  organization_id uuid not null,
  detail_center_id uuid not null,
  opportunity_id uuid not null,
  kind text not null check (kind in (
    'creada', 'etapa', 'valor', 'responsable', 'nota', 'ganada', 'perdida', 'reabierta', 'convertida')),
  -- Instantánea para métricas reproducibles.
  opportunity_kind text not null check (opportunity_kind in ('b2b', 'b2c_premium')),
  from_stage_id uuid,
  to_stage_id uuid,
  -- Valor vigente al registrar el evento (en "ganada", el valor ganado).
  value numeric(12, 2) check (value is null or value >= 0),
  owner_id uuid references auth.users (id) on delete set null,
  note text check (note is null or length(note) <= 2000),
  actor_id uuid default auth.uid() references auth.users (id) on delete set null,
  occurred_at timestamptz not null default now(),
  unique (seq),
  check (kind not in ('creada', 'etapa', 'reabierta') or to_stage_id is not null),
  check (kind not in ('creada', 'valor', 'ganada') or value is not null),
  check (kind <> 'nota' or note is not null),
  foreign key (organization_id, opportunity_id) references public.sales_opportunities (organization_id, id) on delete restrict,
  foreign key (organization_id, from_stage_id) references public.pipeline_stages (organization_id, id) on delete restrict,
  foreign key (organization_id, to_stage_id) references public.pipeline_stages (organization_id, id) on delete restrict
);
create index opportunity_events_opportunity_idx on public.opportunity_events (opportunity_id, seq);
create index opportunity_events_center_idx on public.opportunity_events (detail_center_id, occurred_at);

-- Tareas de la oportunidad en la cola del CRM (un prospecto aún no es cliente).
alter table public.crm_tasks
  add column opportunity_id uuid,
  alter column client_id drop not null,
  add constraint crm_tasks_opportunity_fk foreign key (organization_id, opportunity_id)
    references public.sales_opportunities (organization_id, id) on delete restrict,
  add constraint crm_tasks_client_or_opportunity check (client_id is not null or opportunity_id is not null);
alter table public.crm_tasks drop constraint crm_tasks_kind_check;
alter table public.crm_tasks add constraint crm_tasks_kind_check
  check (kind in ('llamar', 'whatsapp', 'email', 'renovar', 'ofrecer_mantenimiento', 'reunion'));
alter table public.crm_tasks drop constraint crm_tasks_source_check;
alter table public.crm_tasks add constraint crm_tasks_source_check
  check (source in ('manual', 'os_terminada', 'proxima_visita', 'membresia', 'oportunidad'));
alter table public.crm_tasks add constraint crm_tasks_opportunity_source
  check ((opportunity_id is not null) = (source = 'oportunidad'));
create index crm_tasks_opportunity_idx on public.crm_tasks (opportunity_id) where opportunity_id is not null;

-- Una empresa (RFC) tiene una sola cuenta B2B en la organización.
create unique index b2b_accounts_rfc_key on public.b2b_accounts (organization_id, rfc) where rfc is not null;

-- ---------------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------------

create trigger pipeline_stages_updated_at before update on public.pipeline_stages
  for each row execute function private.set_updated_at();
create trigger sales_opportunities_updated_at before update on public.sales_opportunities
  for each row execute function private.set_updated_at();
create trigger pipeline_stages_require_reason before insert or update or delete on public.pipeline_stages
  for each row execute function private.require_change_reason();
create trigger sales_opportunities_require_reason before insert or update or delete on public.sales_opportunities
  for each row execute function private.require_change_reason();
create trigger pipeline_stages_audit after insert or update or delete on public.pipeline_stages
  for each row execute function private.audit_row();
create trigger sales_opportunities_audit after insert or update or delete on public.sales_opportunities
  for each row execute function private.audit_row();

create function private.bump_opportunity_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;
create trigger sales_opportunities_version before update on public.sales_opportunities
  for each row execute function private.bump_opportunity_version();

-- La etapa corresponde al estado (abierta / ganada / perdida) y a la organización.
create function private.check_opportunity_stage() returns trigger
language plpgsql set search_path = '' as $$
declare
  k text;
begin
  select s.kind into k from public.pipeline_stages s where s.id = new.stage_id;
  if k is distinct from new.status then
    raise exception 'La etapa no corresponde al estado de la oportunidad' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger sales_opportunities_check_stage before insert or update of stage_id, status on public.sales_opportunities
  for each row execute function private.check_opportunity_stage();

create function private.forbid_opportunity_event_changes() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'El historial de la oportunidad no se modifica' using errcode = '42501';
end;
$$;
create trigger opportunity_events_immutable before update or delete on public.opportunity_events
  for each row execute function private.forbid_opportunity_event_changes();

-- Etapas mínimas de cada organización (existentes y nuevas).
create function private.seed_pipeline_stages(p_organization_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.change_reason', 'Etapas mínimas del pipeline', true);
  insert into public.pipeline_stages (organization_id, code, name, kind, position, probability) values
    (p_organization_id, 'prospecto', 'Prospecto', 'abierta', 1, 10),
    (p_organization_id, 'contactado', 'Contactado', 'abierta', 2, 25),
    (p_organization_id, 'propuesta', 'Propuesta', 'abierta', 3, 50),
    (p_organization_id, 'negociacion', 'Negociación', 'abierta', 4, 75),
    (p_organization_id, 'ganado', 'Ganado', 'ganada', 90, 100),
    (p_organization_id, 'perdido', 'Perdido', 'perdida', 91, 0)
  on conflict (organization_id, code) do nothing;
end;
$$;

create function private.seed_org_pipeline_stages() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.seed_pipeline_stages(new.id);
  return null;
end;
$$;
create trigger organizations_pipeline_stages after insert on public.organizations
  for each row execute function private.seed_org_pipeline_stages();

do $$
begin
  perform private.seed_pipeline_stages(o.id) from public.organizations o;
end $$;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

alter table public.pipeline_stages enable row level security;
alter table public.sales_opportunities enable row level security;
alter table public.opportunity_events enable row level security;

create policy pipeline_stages_select on public.pipeline_stages
  for select to authenticated using (private.is_org_member(organization_id));
create policy sales_opportunities_select on public.sales_opportunities
  for select to authenticated using (private.can_read_pipeline(detail_center_id));
create policy opportunity_events_select on public.opportunity_events
  for select to authenticated using (private.can_read_pipeline(detail_center_id));

revoke all on public.pipeline_stages, public.sales_opportunities, public.opportunity_events from anon;
revoke insert, update, delete, truncate on public.pipeline_stages, public.sales_opportunities,
  public.opportunity_events from authenticated;

-- Tareas: las de una oportunidad sólo las ve quien ve el pipeline del centro
-- (no el operador); las demás, como antes (CRM).
drop policy crm_tasks_select on public.crm_tasks;
drop policy crm_tasks_insert on public.crm_tasks;
drop policy crm_tasks_update on public.crm_tasks;
create policy crm_tasks_select on public.crm_tasks
  for select to authenticated using (
    case when opportunity_id is null then private.can_use_crm(detail_center_id)
         else private.can_read_pipeline(detail_center_id) end);
create policy crm_tasks_insert on public.crm_tasks
  for insert to authenticated with check (opportunity_id is null and private.can_use_crm(detail_center_id));
create policy crm_tasks_update on public.crm_tasks for update to authenticated
  using (case when opportunity_id is null then private.can_use_crm(detail_center_id)
              else private.can_read_pipeline(detail_center_id) end)
  with check (case when opportunity_id is null then private.can_use_crm(detail_center_id)
                   else private.can_read_pipeline(detail_center_id) end);

-- Completar: el consentimiento aplica al cliente; el contacto de un prospecto
-- B2B lo dio la propia empresa (sin cliente todavía).
create or replace function public.complete_crm_task(p_task_id uuid, p_outcome text, p_notes text default null)
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
  if t.client_id is not null and not private.has_consent(t.client_id, t.channel) then
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

-- Seguimientos abiertos del cliente en el CRM: sin las tareas del pipeline
-- (se atienden en la oportunidad). Mismo cuerpo que en 20261003000000_crm.
create or replace function private.crm_rows(p_centers uuid[], p_today date, p_timezone text, p_client_id uuid default null)
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
     where k.status = 'pendiente' and k.opportunity_id is null and k.detail_center_id = any (p_centers)
       and k.client_id in (select id from cl)
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

-- ---------------------------------------------------------------------------
-- 5. Reglas internas
-- ---------------------------------------------------------------------------

create function private.log_opportunity_event(
  o public.sales_opportunities,
  p_kind text,
  p_from_stage_id uuid default null,
  p_to_stage_id uuid default null,
  p_value numeric default null,
  p_note text default null
) returns void
language sql security definer set search_path = '' as $$
  insert into public.opportunity_events (organization_id, detail_center_id, opportunity_id, kind, opportunity_kind,
    from_stage_id, to_stage_id, value, owner_id, note)
  values (o.organization_id, o.detail_center_id, o.id, p_kind, o.kind, p_from_stage_id, p_to_stage_id, p_value,
    o.owner_id, nullif(btrim(p_note), ''));
$$;

create function private.lock_opportunity(p_id uuid, p_version integer) returns public.sales_opportunities
language plpgsql security definer set search_path = '' as $$
declare
  o public.sales_opportunities;
begin
  select * into o from public.sales_opportunities where id = p_id for update;
  if not found or not private.can_write_pipeline(o.detail_center_id, o.kind) then
    raise exception 'Oportunidad inexistente o sin permiso' using errcode = '42501';
  end if;
  if p_version is distinct from o.version then
    raise exception 'La oportunidad cambió en otro dispositivo; recarga para ver la versión actual' using errcode = '40001';
  end if;
  return o;
end;
$$;

create function private.pipeline_stage_of_kind(p_organization_id uuid, p_kind text) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.pipeline_stages s where s.organization_id = p_organization_id and s.kind = p_kind
   order by s.position limit 1;
$$;

-- Etapa abierta y activa de la organización (o la primera, si p_stage_id es null).
create function private.open_stage(p_organization_id uuid, p_stage_id uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  s uuid;
begin
  select st.id into s from public.pipeline_stages st
   where st.organization_id = p_organization_id and st.kind = 'abierta' and st.active
     and (p_stage_id is null or st.id = p_stage_id)
   order by st.position limit 1;
  if s is null then
    raise exception 'Etapa inválida: elige una etapa abierta y activa' using errcode = '22023';
  end if;
  return s;
end;
$$;

-- Empresa existente que corresponde a los datos (para no duplicar):
-- cuenta por RFC; si no, cliente empresa por teléfono o email.
create function private.match_company(p_organization_id uuid, p_rfc text, p_phone text, p_email text)
returns table (account_id uuid, client_id uuid)
language sql stable security definer set search_path = '' as $$
  select x.account_id, x.client_id from (
    select 1 as prio, a.id as account_id, a.client_id, a.created_at from public.b2b_accounts a
     where p_rfc is not null and a.organization_id = p_organization_id and a.rfc = p_rfc
    union all
    select 2, (select a2.id from public.b2b_accounts a2 where a2.client_id = c.id), c.id, c.created_at
      from public.clients c
     where c.organization_id = p_organization_id and c.active and c.kind = 'company'
       and ((p_phone is not null and c.phone = private.normalize_phone(p_phone))
            or (p_email is not null and c.email = private.normalize_email(p_email)))
  ) x
  order by x.prio, x.created_at
  limit 1;
$$;

-- Liga la oportunidad B2B a la empresa existente (cuenta o cliente) si la hay.
create function private.link_existing_company(o public.sales_opportunities) returns public.sales_opportunities
language plpgsql security definer set search_path = '' as $$
declare
  m record;
begin
  if o.kind <> 'b2b' or o.b2b_account_id is not null then
    return o;
  end if;
  if o.client_id is not null then
    select a.id as account_id, a.client_id into m from public.b2b_accounts a where a.client_id = o.client_id;
  else
    select * into m from private.match_company(o.organization_id, o.rfc, o.contact_phone, o.contact_email);
  end if;
  if m.client_id is not null and (m.client_id is distinct from o.client_id or m.account_id is not null) then
    update public.sales_opportunities
       set client_id = m.client_id, b2b_account_id = m.account_id
     where id = o.id
    returning * into o;
  end if;
  return o;
end;
$$;

-- Convierte una oportunidad B2B ganada en cuenta (y convenio, si hay propuesta).
-- Nunca duplica la empresa: reutiliza la cuenta o el cliente existentes.
create function private.convert_opportunity(o public.sales_opportunities, p_create_agreement boolean, p_starts_on date)
returns public.sales_opportunities
language plpgsql security definer set search_path = '' as $$
declare
  acc public.b2b_accounts;
  cli public.clients;
  g public.b2b_agreements;
  today date := private.center_today(o.detail_center_id);
  v_starts date;
  created_client boolean := false;
  created_account boolean := false;
  summary text;
begin
  -- Serializa conversiones concurrentes de la misma empresa.
  perform pg_advisory_xact_lock(hashtextextended(o.organization_id::text || coalesce(o.rfc, o.contact_phone,
    o.contact_email, o.client_id::text, o.b2b_account_id::text, o.id::text), 0));
  o := private.link_existing_company(o);
  if o.b2b_account_id is not null then
    select * into acc from public.b2b_accounts where id = o.b2b_account_id;
  else
    if o.client_id is not null then
      select * into cli from public.clients where id = o.client_id;
      if cli.kind <> 'company' then
        raise exception 'La cuenta B2B se liga a un cliente de tipo empresa' using errcode = 'MG002';
      end if;
    else
      if o.contact_phone is null then
        raise exception 'Captura el teléfono de la empresa para convertirla en cuenta' using errcode = 'MG002';
      end if;
      perform set_config('app.change_reason', 'Alta desde la oportunidad ganada', true);
      insert into public.clients (organization_id, home_detail_center_id, kind, full_name, phone, email,
        request_id, created_in_detail_center_id)
      values (o.organization_id, o.detail_center_id, 'company', btrim(o.company_name), o.contact_phone, o.contact_email,
        o.id, o.detail_center_id)
      returning * into cli;
      created_client := true;
    end if;
    insert into public.client_centers (client_id, detail_center_id, organization_id)
    values (cli.id, o.detail_center_id, o.organization_id)
    on conflict (client_id, detail_center_id) do nothing;
    perform set_config('app.change_reason', 'Cuenta desde la oportunidad ganada', true);
    insert into public.b2b_accounts (organization_id, home_detail_center_id, client_id, name, legal_name, rfc,
      billing_email, status, notes, request_id)
    values (o.organization_id, o.detail_center_id, cli.id, coalesce(btrim(o.company_name), cli.full_name), o.legal_name,
      o.rfc, o.contact_email, 'activa', 'Convertida desde la oportunidad "' || o.title || '"', o.id)
    returning * into acc;
    created_account := true;
    if o.contact_name is not null and (o.contact_phone is not null or o.contact_email is not null) then
      insert into public.b2b_contacts (organization_id, account_id, full_name, title, phone, email, is_primary)
      values (o.organization_id, acc.id, btrim(o.contact_name), o.contact_title, o.contact_phone, o.contact_email,
        true);
    end if;
  end if;
  if coalesce(p_create_agreement, true) and o.proposed_billing_model is not null then
    if not private.can_manage_b2b(acc.home_detail_center_id) then
      raise exception 'Sin permiso para crear convenios de la cuenta %', acc.name using errcode = '42501';
    end if;
    v_starts := coalesce(p_starts_on, today);
    perform set_config('app.change_reason', 'Convenio desde la oportunidad ganada', true);
    begin
      insert into public.b2b_agreements (organization_id, account_id, name, billing_model, starts_on, ends_on, status,
        vehicle_rule, payment_terms_days, credit_limit, fee_amount, included_units, notes, request_id)
      values (o.organization_id, acc.id, left(btrim(o.title), 120), o.proposed_billing_model, v_starts,
        (private.add_months(v_starts, coalesce(o.proposed_months, 12)) - 1), 'activo',
        coalesce(o.proposed_vehicle_rule, 'cualquiera'), coalesce(o.proposed_payment_terms_days, 30),
        o.proposed_credit_limit,
        case when o.proposed_billing_model in ('paquete', 'iguala') then o.proposed_fee_amount end,
        case when o.proposed_billing_model in ('paquete', 'iguala') then o.proposed_included_units end,
        'Desde la oportunidad "' || o.title || '"', o.id)
      returning * into g;
    exception
      when exclusion_violation then
        raise exception 'La cuenta ya tiene un convenio activo en esas fechas; gana sin crear convenio o ajusta el inicio'
          using errcode = 'MG002';
    end;
    insert into public.b2b_agreement_centers (agreement_id, detail_center_id, organization_id)
    values (g.id, o.detail_center_id, o.organization_id);
    insert into public.client_centers (client_id, detail_center_id, organization_id)
    values (acc.client_id, o.detail_center_id, o.organization_id)
    on conflict (client_id, detail_center_id) do nothing;
  end if;
  perform set_config('app.change_reason', 'Oportunidad convertida en cuenta B2B', true);
  update public.sales_opportunities
     set b2b_account_id = acc.id, client_id = acc.client_id, converted_account_id = acc.id,
         converted_agreement_id = g.id
   where id = o.id
  returning * into o;
  summary := case when created_account then 'Cuenta creada: ' else 'Cuenta existente: ' end || acc.name
    || case when created_client then ' (empresa nueva)' else '' end
    || case when g.id is not null then '; convenio "' || g.name || '" del ' || to_char(g.starts_on, 'DD/MM/YYYY')
                                       || ' al ' || to_char(g.ends_on, 'DD/MM/YYYY') else '' end;
  perform private.log_opportunity_event(o, 'convertida', null, null, null, summary);
  return o;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. RPC de la oportunidad
-- ---------------------------------------------------------------------------

-- p_prospect: { company_name, legal_name, rfc, contact_name, contact_title, contact_phone, contact_email }
-- p_proposal: { billing_model, months, vehicle_rule, payment_terms_days, credit_limit, fee_amount, included_units }
create function public.create_opportunity(
  p_detail_center_id uuid,
  p_request_id uuid,
  p_kind text,
  p_title text,
  p_estimated_value numeric,
  p_client_id uuid default null,
  p_b2b_account_id uuid default null,
  p_prospect jsonb default '{}',
  p_proposal jsonb default '{}',
  p_stage_id uuid default null,
  p_owner_id uuid default null,
  p_next_action text default null,
  p_next_action_on date default null,
  p_expected_close_on date default null,
  p_source text default null,
  p_notes text default null
) returns public.sales_opportunities
language plpgsql security definer set search_path = '' as $$
declare
  center public.detail_centers;
  result public.sales_opportunities;
  pr jsonb := coalesce(p_prospect, '{}');
  pp jsonb := coalesce(p_proposal, '{}');
  v_owner uuid := coalesce(p_owner_id, auth.uid());
  v_stage uuid;
  v_model text := case when p_kind = 'b2b' then nullif(coalesce(p_proposal, '{}') ->> 'billing_model', '') end;
  v_bundle boolean := v_model in ('paquete', 'iguala');
begin
  select * into center from public.detail_centers where id = p_detail_center_id;
  if not found or p_kind is null or not private.can_write_pipeline(p_detail_center_id, p_kind) then
    raise exception 'Sin permiso para registrar oportunidades % en este centro', coalesce(p_kind, '')
      using errcode = '42501';
  end if;
  select * into result from public.sales_opportunities
   where organization_id = center.organization_id and request_id = p_request_id;
  if found then
    return result;
  end if;
  if p_client_id is not null and not exists (select 1 from public.client_centers cc
                                              where cc.client_id = p_client_id and cc.detail_center_id = center.id) then
    raise exception 'El cliente no está ligado a este centro' using errcode = '42501';
  end if;
  if p_b2b_account_id is not null and not private.b2b_account_visible(p_b2b_account_id, false) then
    raise exception 'Cuenta B2B inexistente o sin permiso' using errcode = '42501';
  end if;
  if v_owner is not null and not private.can_own_opportunity(v_owner, center.id, p_kind) then
    raise exception 'El responsable no tiene rol comercial en este centro' using errcode = 'MG002';
  end if;
  v_stage := private.open_stage(center.organization_id, p_stage_id);
  perform private.set_change_reason('Alta de oportunidad');
  begin
    insert into public.sales_opportunities (organization_id, detail_center_id, kind, title, b2b_account_id, client_id,
      company_name, legal_name, rfc, contact_name, contact_title, contact_phone, contact_email, estimated_value,
      stage_id, owner_id, next_action, next_action_on, expected_close_on, source,
      proposed_billing_model, proposed_months, proposed_vehicle_rule, proposed_payment_terms_days,
      proposed_credit_limit, proposed_fee_amount, proposed_included_units, notes, request_id)
    values (center.organization_id, center.id, p_kind, btrim(p_title),
      case when p_kind = 'b2b' then p_b2b_account_id end, coalesce(p_client_id,
        (select a.client_id from public.b2b_accounts a where a.id = p_b2b_account_id)),
      nullif(btrim(pr ->> 'company_name'), ''), nullif(btrim(pr ->> 'legal_name'), ''),
      nullif(upper(btrim(pr ->> 'rfc')), ''), nullif(btrim(pr ->> 'contact_name'), ''),
      nullif(btrim(pr ->> 'contact_title'), ''), private.normalize_phone(nullif(btrim(pr ->> 'contact_phone'), '')),
      private.normalize_email(nullif(btrim(pr ->> 'contact_email'), '')),
      p_estimated_value, v_stage, v_owner, nullif(btrim(p_next_action), ''), p_next_action_on, p_expected_close_on,
      p_source, v_model,
      case when v_model is not null then (pp ->> 'months')::smallint end,
      case when v_model is not null then nullif(pp ->> 'vehicle_rule', '') end,
      case when v_model is not null then (pp ->> 'payment_terms_days')::smallint end,
      case when v_model is not null then (pp ->> 'credit_limit')::numeric end,
      case when v_bundle then (pp ->> 'fee_amount')::numeric end,
      case when v_bundle then (pp ->> 'included_units')::integer end,
      nullif(btrim(p_notes), ''), p_request_id)
    returning * into result;
  exception
    when check_violation then
      raise exception 'Datos incompletos: un prospecto necesita empresa, contacto y teléfono o email; B2C premium, un cliente; la propuesta de paquete o iguala, cuota e incluidos'
        using errcode = '22023';
  end;
  if pr ->> 'contact_phone' is not null and btrim(pr ->> 'contact_phone') <> '' and result.contact_phone is null then
    raise exception 'Teléfono inválido' using errcode = '22023';
  end if;
  result := private.link_existing_company(result);
  perform private.log_opportunity_event(result, 'creada', null, result.stage_id, result.estimated_value, p_notes);
  return result;
end;
$$;

-- Edición de datos (abierta). Valor y responsable quedan en el historial.
create function public.update_opportunity(
  p_id uuid,
  p_version integer,
  p_title text,
  p_estimated_value numeric,
  p_owner_id uuid,
  p_next_action text,
  p_next_action_on date,
  p_expected_close_on date,
  p_source text,
  p_prospect jsonb,
  p_proposal jsonb,
  p_notes text,
  p_reason text
) returns public.sales_opportunities
language plpgsql security definer set search_path = '' as $$
declare
  o public.sales_opportunities;
  prev public.sales_opportunities;
  pr jsonb := coalesce(p_prospect, '{}');
  pp jsonb := coalesce(p_proposal, '{}');
  v_model text;
  v_bundle boolean;
begin
  perform private.set_change_reason(p_reason);
  o := private.lock_opportunity(p_id, p_version);
  if o.status <> 'abierta' then
    raise exception 'Sólo se edita una oportunidad abierta' using errcode = 'MG002';
  end if;
  if p_owner_id is not null and p_owner_id is distinct from o.owner_id
     and not private.can_own_opportunity(p_owner_id, o.detail_center_id, o.kind) then
    raise exception 'El responsable no tiene rol comercial en este centro' using errcode = 'MG002';
  end if;
  prev := o;
  v_model := case when o.kind = 'b2b' then nullif(pp ->> 'billing_model', '') end;
  v_bundle := v_model in ('paquete', 'iguala');
  begin
    update public.sales_opportunities
       set title = btrim(p_title), estimated_value = p_estimated_value, owner_id = p_owner_id,
           next_action = nullif(btrim(p_next_action), ''), next_action_on = p_next_action_on,
           expected_close_on = p_expected_close_on, source = p_source,
           company_name = case when client_id is null then nullif(btrim(pr ->> 'company_name'), '') else company_name end,
           legal_name = nullif(btrim(pr ->> 'legal_name'), ''),
           rfc = nullif(upper(btrim(pr ->> 'rfc')), ''),
           contact_name = nullif(btrim(pr ->> 'contact_name'), ''),
           contact_title = nullif(btrim(pr ->> 'contact_title'), ''),
           contact_phone = private.normalize_phone(nullif(btrim(pr ->> 'contact_phone'), '')),
           contact_email = private.normalize_email(nullif(btrim(pr ->> 'contact_email'), '')),
           proposed_billing_model = v_model,
           proposed_months = case when v_model is not null then (pp ->> 'months')::smallint end,
           proposed_vehicle_rule = case when v_model is not null then nullif(pp ->> 'vehicle_rule', '') end,
           proposed_payment_terms_days = case when v_model is not null then (pp ->> 'payment_terms_days')::smallint end,
           proposed_credit_limit = case when v_model is not null then (pp ->> 'credit_limit')::numeric end,
           proposed_fee_amount = case when v_bundle then (pp ->> 'fee_amount')::numeric end,
           proposed_included_units = case when v_bundle then (pp ->> 'included_units')::integer end,
           notes = nullif(btrim(p_notes), '')
     where id = o.id
    returning * into o;
  exception
    when check_violation then
      raise exception 'Datos incompletos: un prospecto necesita empresa, contacto y teléfono o email; la propuesta de paquete o iguala, cuota e incluidos'
        using errcode = '22023';
  end;
  o := private.link_existing_company(o);
  if o.estimated_value is distinct from prev.estimated_value then
    perform private.log_opportunity_event(o, 'valor', null, null, o.estimated_value, p_reason);
  end if;
  if o.owner_id is distinct from prev.owner_id then
    perform private.log_opportunity_event(o, 'responsable', null, null, null, p_reason);
  end if;
  return o;
end;
$$;

-- Cambio de etapa (entre etapas abiertas; ganar y perder tienen su RPC).
create function public.move_opportunity_stage(p_id uuid, p_version integer, p_stage_id uuid, p_note text default null)
returns public.sales_opportunities
language plpgsql security definer set search_path = '' as $$
declare
  o public.sales_opportunities;
  from_stage uuid;
begin
  o := private.lock_opportunity(p_id, p_version);
  if o.status <> 'abierta' then
    raise exception 'La oportunidad está cerrada; reábrela para moverla' using errcode = 'MG002';
  end if;
  from_stage := o.stage_id;
  if private.open_stage(o.organization_id, p_stage_id) = from_stage then
    return o;
  end if;
  perform private.set_change_reason(coalesce(nullif(btrim(p_note), ''), 'Cambio de etapa'));
  update public.sales_opportunities set stage_id = p_stage_id where id = o.id returning * into o;
  perform private.log_opportunity_event(o, 'etapa', from_stage, o.stage_id, o.estimated_value, p_note);
  return o;
end;
$$;

create function public.add_opportunity_note(p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.sales_opportunities;
begin
  select * into o from public.sales_opportunities where id = p_id;
  if not found or not private.can_write_pipeline(o.detail_center_id, o.kind) then
    raise exception 'Oportunidad inexistente o sin permiso' using errcode = '42501';
  end if;
  if p_note is null or length(btrim(p_note)) not between 2 and 2000 then
    raise exception 'La nota debe tener entre 2 y 2000 caracteres' using errcode = '22023';
  end if;
  perform private.log_opportunity_event(o, 'nota', null, null, null, p_note);
end;
$$;

-- Ganar: B2B se convierte en cuenta (y convenio) sin recaptura; B2C premium ya
-- tiene cliente. El valor ganado es el estimado salvo que se indique otro.
create function public.win_opportunity(
  p_id uuid,
  p_version integer,
  p_won_value numeric default null,
  p_create_agreement boolean default true,
  p_agreement_starts_on date default null,
  p_note text default null
) returns public.sales_opportunities
language plpgsql security definer set search_path = '' as $$
declare
  o public.sales_opportunities;
  from_stage uuid;
begin
  o := private.lock_opportunity(p_id, p_version);
  if o.status <> 'abierta' then
    raise exception 'La oportunidad ya estaba cerrada' using errcode = 'MG002';
  end if;
  if p_won_value is not null and p_won_value < 0 then
    raise exception 'El valor ganado no puede ser negativo' using errcode = '22023';
  end if;
  if o.kind = 'b2b' and not private.can_manage_b2b(o.detail_center_id) then
    raise exception 'Sólo admin o comercial B2B convierten una oportunidad en cuenta' using errcode = '42501';
  end if;
  from_stage := o.stage_id;
  perform private.set_change_reason(coalesce(nullif(btrim(p_note), ''), 'Oportunidad ganada'));
  update public.sales_opportunities
     set status = 'ganada', stage_id = private.pipeline_stage_of_kind(o.organization_id, 'ganada'),
         closed_at = now(), won_value = coalesce(p_won_value, o.estimated_value), next_action = null,
         next_action_on = null
   where id = o.id
  returning * into o;
  perform private.log_opportunity_event(o, 'ganada', from_stage, o.stage_id, o.won_value, p_note);
  if o.kind = 'b2b' then
    o := private.convert_opportunity(o, p_create_agreement, p_agreement_starts_on);
  end if;
  return o;
end;
$$;

create function public.lose_opportunity(p_id uuid, p_version integer, p_loss_reason text, p_notes text default null)
returns public.sales_opportunities
language plpgsql security definer set search_path = '' as $$
declare
  o public.sales_opportunities;
  from_stage uuid;
begin
  o := private.lock_opportunity(p_id, p_version);
  if o.status <> 'abierta' then
    raise exception 'La oportunidad ya estaba cerrada' using errcode = 'MG002';
  end if;
  if p_loss_reason is null
     or p_loss_reason not in ('precio', 'competencia', 'sin_presupuesto', 'sin_respuesta', 'no_califica', 'otro') then
    raise exception 'Indica el motivo de pérdida' using errcode = '22023';
  end if;
  from_stage := o.stage_id;
  perform private.set_change_reason('Oportunidad perdida: ' || p_loss_reason);
  update public.sales_opportunities
     set status = 'perdida', stage_id = private.pipeline_stage_of_kind(o.organization_id, 'perdida'),
         closed_at = now(), loss_reason = p_loss_reason, loss_notes = nullif(btrim(p_notes), ''),
         next_action = null, next_action_on = null
   where id = o.id
  returning * into o;
  perform private.log_opportunity_event(o, 'perdida', from_stage, o.stage_id, o.estimated_value,
    coalesce(nullif(btrim(p_notes), ''), p_loss_reason));
  -- Las tareas pendientes de la oportunidad ya no aplican.
  update public.crm_tasks set status = 'cancelada', cancel_reason = 'Oportunidad perdida'
   where opportunity_id = o.id and status = 'pendiente';
  return o;
end;
$$;

-- Reabrir una oportunidad perdida (una ganada ya es cuenta: no se reabre).
create function public.reopen_opportunity(p_id uuid, p_version integer, p_stage_id uuid, p_reason text)
returns public.sales_opportunities
language plpgsql security definer set search_path = '' as $$
declare
  o public.sales_opportunities;
  from_stage uuid;
begin
  perform private.set_change_reason(p_reason);
  o := private.lock_opportunity(p_id, p_version);
  if o.status <> 'perdida' then
    raise exception 'Sólo se reabre una oportunidad perdida' using errcode = 'MG002';
  end if;
  from_stage := o.stage_id;
  update public.sales_opportunities
     set status = 'abierta', stage_id = private.open_stage(o.organization_id, p_stage_id), closed_at = null,
         loss_reason = null, loss_notes = null
   where id = o.id
  returning * into o;
  perform private.log_opportunity_event(o, 'reabierta', from_stage, o.stage_id, o.estimated_value, p_reason);
  return o;
end;
$$;

-- Tarea de la oportunidad en la cola del CRM (se completa, reprograma o cancela
-- con las RPC del CRM).
create function public.create_opportunity_task(
  p_opportunity_id uuid,
  p_request_id uuid,
  p_kind text,
  p_channel text,
  p_due_on date,
  p_notes text default null,
  p_assigned_to uuid default null
) returns public.crm_tasks
language plpgsql security definer set search_path = '' as $$
declare
  o public.sales_opportunities;
  v_channel text := case p_kind when 'llamar' then 'llamada' when 'whatsapp' then 'whatsapp'
                                when 'email' then 'email' else coalesce(p_channel, 'presencial') end;
  result public.crm_tasks;
begin
  select * into o from public.sales_opportunities where id = p_opportunity_id;
  if not found or not private.can_write_pipeline(o.detail_center_id, o.kind) then
    raise exception 'Oportunidad inexistente o sin permiso' using errcode = '42501';
  end if;
  select * into result from public.crm_tasks where organization_id = o.organization_id and request_id = p_request_id;
  if found then
    return result;
  end if;
  if o.status <> 'abierta' then
    raise exception 'La oportunidad está cerrada' using errcode = 'MG002';
  end if;
  if p_kind is null or p_kind not in ('llamar', 'whatsapp', 'email', 'reunion')
     or v_channel not in ('llamada', 'whatsapp', 'email', 'presencial') then
    raise exception 'Tipo o canal de tarea inválido' using errcode = '22023';
  end if;
  if o.client_id is not null and not private.has_consent(o.client_id, v_channel) then
    raise exception 'El cliente no aceptó contacto por %', v_channel using errcode = 'MG002';
  end if;
  if p_due_on is null or p_due_on < private.center_today(o.detail_center_id) then
    raise exception 'La fecha de la tarea debe ser hoy o posterior' using errcode = '22023';
  end if;
  if p_assigned_to is not null and not private.can_own_opportunity(p_assigned_to, o.detail_center_id, o.kind) then
    raise exception 'La persona asignada no tiene rol comercial en este centro' using errcode = 'MG002';
  end if;
  perform private.set_change_reason('Tarea de la oportunidad');
  insert into public.crm_tasks (organization_id, detail_center_id, client_id, kind, channel, due_on, notes, source,
    opportunity_id, assigned_to, request_id)
  values (o.organization_id, o.detail_center_id, o.client_id, p_kind, v_channel, p_due_on, nullif(btrim(p_notes), ''),
    'oportunidad', o.id, coalesce(p_assigned_to, o.owner_id), p_request_id)
  returning * into result;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Consultas
-- ---------------------------------------------------------------------------

-- Oportunidades de los centros (con nombres de etapa, responsable y empresa).
create function public.list_opportunities(
  p_detail_center_ids uuid[],
  p_status text default 'abierta',
  p_kind text default null,
  p_owner_id uuid default null,
  p_id uuid default null
)
returns table (
  id uuid,
  organization_id uuid,
  detail_center_id uuid,
  center_name text,
  kind text,
  title text,
  display_name text,
  client_id uuid,
  b2b_account_id uuid,
  company_name text,
  legal_name text,
  rfc text,
  contact_name text,
  contact_title text,
  contact_phone text,
  contact_email text,
  estimated_value numeric,
  stage_id uuid,
  stage_name text,
  stage_position smallint,
  stage_probability smallint,
  status text,
  owner_id uuid,
  owner_name text,
  next_action text,
  next_action_on date,
  expected_close_on date,
  source text,
  proposed_billing_model text,
  proposed_months smallint,
  proposed_vehicle_rule text,
  proposed_payment_terms_days smallint,
  proposed_credit_limit numeric,
  proposed_fee_amount numeric,
  proposed_included_units integer,
  notes text,
  closed_at timestamptz,
  won_value numeric,
  loss_reason text,
  loss_notes text,
  converted_account_id uuid,
  converted_agreement_id uuid,
  open_tasks integer,
  version integer,
  created_at timestamptz,
  today date
)
language sql stable security definer set search_path = '' as $$
  select o.id, o.organization_id, o.detail_center_id, c.name, o.kind, o.title,
         coalesce(a.name, o.company_name, cl.full_name), o.client_id, o.b2b_account_id, o.company_name,
         o.legal_name, o.rfc, o.contact_name, o.contact_title, coalesce(o.contact_phone, cl.phone),
         coalesce(o.contact_email, cl.email), o.estimated_value, o.stage_id, s.name, s.position, s.probability,
         o.status, o.owner_id, p.full_name, o.next_action, o.next_action_on, o.expected_close_on, o.source,
         o.proposed_billing_model, o.proposed_months, o.proposed_vehicle_rule, o.proposed_payment_terms_days,
         o.proposed_credit_limit, o.proposed_fee_amount, o.proposed_included_units, o.notes, o.closed_at,
         o.won_value, o.loss_reason, o.loss_notes, o.converted_account_id, o.converted_agreement_id,
         (select count(*)::integer from public.crm_tasks t where t.opportunity_id = o.id and t.status = 'pendiente'),
         o.version, o.created_at, (now() at time zone c.timezone)::date
    from public.sales_opportunities o
    join public.detail_centers c on c.id = o.detail_center_id
    join public.pipeline_stages s on s.id = o.stage_id
    left join public.b2b_accounts a on a.id = o.b2b_account_id
    left join public.clients cl on cl.id = o.client_id
    left join public.profiles p on p.id = o.owner_id
   where o.detail_center_id = any (p_detail_center_ids)
     and private.can_read_pipeline(o.detail_center_id)
     and (p_id is null or o.id = p_id)
     and (p_id is not null or p_status is null or o.status = p_status)
     and (p_kind is null or o.kind = p_kind)
     and (p_owner_id is null or o.owner_id = p_owner_id)
   order by s.position, o.next_action_on nulls last, o.estimated_value desc, o.created_at
   limit 500;
$$;

-- Historial de la oportunidad (con nombres de etapa y de quien actuó).
create function public.opportunity_timeline(p_id uuid)
returns table (
  id uuid,
  seq bigint,
  kind text,
  occurred_at timestamptz,
  actor_name text,
  from_stage_name text,
  to_stage_name text,
  value numeric,
  owner_name text,
  note text
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.seq, e.kind, e.occurred_at, pa.full_name, fs.name, ts.name, e.value, po.full_name, e.note
    from public.opportunity_events e
    left join public.pipeline_stages fs on fs.id = e.from_stage_id
    left join public.pipeline_stages ts on ts.id = e.to_stage_id
    left join public.profiles pa on pa.id = e.actor_id
    left join public.profiles po on po.id = e.owner_id
   where e.opportunity_id = p_id and private.can_read_pipeline(e.detail_center_id)
   order by e.seq desc;
$$;

-- Personas que pueden ser responsables en el centro (por tipo).
create function public.pipeline_owners(p_detail_center_id uuid, p_kind text default 'b2c_premium')
returns table (user_id uuid, full_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(p.full_name, 'Sin nombre')
    from public.profiles p
   where private.can_read_pipeline(p_detail_center_id)
     and private.can_own_opportunity(p.id, p_detail_center_id, coalesce(p_kind, 'b2c_premium'))
   order by p.full_name;
$$;

-- Hechos por oportunidad calculados SÓLO desde opportunity_events (métricas
-- reproducibles): alta, último cierre (ganada / perdida, anulado por
-- "reabierta"), valor y etapa vigentes, etapas alcanzadas y ciclo en días.
-- Incluye las oportunidades creadas hasta p_to que seguían abiertas o se
-- cerraron desde p_from. Sin datos personales.
create function public.pipeline_metric_facts(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  opportunity_id uuid,
  detail_center_id uuid,
  kind text,
  created_on date,
  created_value numeric,
  outcome text,
  closed_on date,
  won_value numeric,
  current_value numeric,
  current_stage_id uuid,
  stages_reached uuid[],
  cycle_days numeric
)
language sql stable security definer set search_path = '' as $$
  with centers as (
    select c from unnest(p_detail_center_ids) c where private.can_read_pipeline_metrics(c)
  ), ev as (
    select e.*, (e.occurred_at at time zone dc.timezone)::date as on_date
      from public.opportunity_events e
      join public.detail_centers dc on dc.id = e.detail_center_id
     where e.detail_center_id in (select c from centers)
  ), created as (
    select distinct on (ev.opportunity_id) ev.opportunity_id, ev.detail_center_id, ev.opportunity_kind, ev.on_date,
           ev.occurred_at, ev.value
      from ev where ev.kind = 'creada' order by ev.opportunity_id, ev.seq
  ), closing as (
    select distinct on (ev.opportunity_id) ev.opportunity_id, ev.kind, ev.on_date, ev.occurred_at, ev.value
      from ev where ev.kind in ('ganada', 'perdida', 'reabierta') order by ev.opportunity_id, ev.seq desc
  ), last_value as (
    select distinct on (ev.opportunity_id) ev.opportunity_id, ev.value
      from ev where ev.value is not null order by ev.opportunity_id, ev.seq desc
  ), last_stage as (
    select distinct on (ev.opportunity_id) ev.opportunity_id, ev.to_stage_id
      from ev where ev.to_stage_id is not null order by ev.opportunity_id, ev.seq desc
  ), reached as (
    select ev.opportunity_id, array_agg(distinct ev.to_stage_id) as stages
      from ev where ev.to_stage_id is not null group by ev.opportunity_id
  )
  select cr.opportunity_id, cr.detail_center_id, cr.opportunity_kind, cr.on_date, cr.value,
         case when cl.kind in ('ganada', 'perdida') then cl.kind end,
         case when cl.kind in ('ganada', 'perdida') then cl.on_date end,
         case when cl.kind = 'ganada' then cl.value end,
         lv.value, ls.to_stage_id, rc.stages,
         case when cl.kind in ('ganada', 'perdida')
              then round((extract(epoch from cl.occurred_at - cr.occurred_at) / 86400)::numeric, 1) end
    from created cr
    left join closing cl on cl.opportunity_id = cr.opportunity_id
    left join last_value lv on lv.opportunity_id = cr.opportunity_id
    left join last_stage ls on ls.opportunity_id = cr.opportunity_id
    left join reached rc on rc.opportunity_id = cr.opportunity_id
   where cr.on_date <= p_to
     and (cl.kind is null or cl.kind = 'reabierta' or cl.on_date >= p_from)
   order by cr.occurred_at;
$$;

-- ---------------------------------------------------------------------------
-- 8. Etapas (admin corporativo)
-- ---------------------------------------------------------------------------

-- Alta o edición de una etapa. Las de cierre (ganado / perdido) sólo cambian de
-- nombre; una etapa con oportunidades abiertas no se desactiva.
create function public.upsert_pipeline_stage(
  p_organization_id uuid,
  p_id uuid,
  p_name text,
  p_position smallint,
  p_probability smallint,
  p_active boolean,
  p_reason text
) returns public.pipeline_stages
language plpgsql security definer set search_path = '' as $$
declare
  s public.pipeline_stages;
begin
  perform private.set_change_reason(p_reason);
  if not private.can_manage_pipeline(p_organization_id) then
    raise exception 'Sólo el admin corporativo configura las etapas' using errcode = '42501';
  end if;
  if p_id is null then
    if p_position is null or p_position not between 1 and 89 then
      raise exception 'Las etapas abiertas van en las posiciones 1 a 89' using errcode = '22023';
    end if;
    insert into public.pipeline_stages (organization_id, code, name, kind, position, probability, active)
    values (p_organization_id, 'etapa_' || left(replace(gen_random_uuid()::text, '-', ''), 10), btrim(p_name),
      'abierta', p_position, coalesce(p_probability, 50), coalesce(p_active, true))
    returning * into s;
    return s;
  end if;
  select * into s from public.pipeline_stages where id = p_id and organization_id = p_organization_id for update;
  if not found then
    raise exception 'Etapa inexistente' using errcode = '22023';
  end if;
  if s.kind <> 'abierta' then
    update public.pipeline_stages set name = btrim(p_name) where id = s.id returning * into s;
    return s;
  end if;
  if not coalesce(p_active, true)
     and exists (select 1 from public.sales_opportunities o where o.stage_id = s.id and o.status = 'abierta') then
    raise exception 'La etapa tiene oportunidades abiertas; muévelas antes de desactivarla' using errcode = 'MG002';
  end if;
  if not coalesce(p_active, true)
     and not exists (select 1 from public.pipeline_stages x
                      where x.organization_id = s.organization_id and x.kind = 'abierta' and x.active and x.id <> s.id) then
    raise exception 'Debe quedar al menos una etapa abierta activa' using errcode = 'MG002';
  end if;
  if p_position is null or p_position not between 1 and 89 then
    raise exception 'Las etapas abiertas van en las posiciones 1 a 89' using errcode = '22023';
  end if;
  update public.pipeline_stages
     set name = btrim(p_name), position = p_position, probability = coalesce(p_probability, probability),
         active = coalesce(p_active, true)
   where id = s.id
  returning * into s;
  return s;
exception
  when check_violation then
    raise exception 'Etapa inválida: nombre de 2 a 60 caracteres y probabilidad entre 0 y 100' using errcode = '22023';
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.can_read_pipeline(uuid)',
    'private.can_write_pipeline(uuid, text)',
    'private.can_read_pipeline_metrics(uuid)',
    'private.can_manage_pipeline(uuid)',
    'private.bump_opportunity_version()',
    'private.check_opportunity_stage()',
    'private.forbid_opportunity_event_changes()'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  -- Sólo las RPC (security definer, tras validar permisos) los invocan.
  foreach fn in array array[
    'private.user_has_center_role(uuid, uuid, public.app_role[])',
    'private.can_own_opportunity(uuid, uuid, text)',
    'private.pipeline_stage_of_kind(uuid, text)',
    'private.open_stage(uuid, uuid)',
    'private.seed_pipeline_stages(uuid)',
    'private.seed_org_pipeline_stages()',
    'private.log_opportunity_event(public.sales_opportunities, text, uuid, uuid, numeric, text)',
    'private.lock_opportunity(uuid, integer)',
    'private.match_company(uuid, text, text, text)',
    'private.link_existing_company(public.sales_opportunities)',
    'private.convert_opportunity(public.sales_opportunities, boolean, date)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.create_opportunity(uuid, uuid, text, text, numeric, uuid, uuid, jsonb, jsonb, uuid, uuid, text, date, date, text, text)',
    'public.update_opportunity(uuid, integer, text, numeric, uuid, text, date, date, text, jsonb, jsonb, text, text)',
    'public.move_opportunity_stage(uuid, integer, uuid, text)',
    'public.add_opportunity_note(uuid, text)',
    'public.win_opportunity(uuid, integer, numeric, boolean, date, text)',
    'public.lose_opportunity(uuid, integer, text, text)',
    'public.reopen_opportunity(uuid, integer, uuid, text)',
    'public.create_opportunity_task(uuid, uuid, text, text, date, text, uuid)',
    'public.list_opportunities(uuid[], text, text, uuid, uuid)',
    'public.opportunity_timeline(uuid)',
    'public.pipeline_owners(uuid, text)',
    'public.pipeline_metric_facts(uuid[], date, date)',
    'public.upsert_pipeline_stage(uuid, uuid, text, smallint, smallint, boolean, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
