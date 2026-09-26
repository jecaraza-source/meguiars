-- C1 — Comercial / Membresías y fidelización.
--
-- Motor de ingreso recurrente para planes de cuidado continuo del vehículo:
-- * membership_plans + membership_benefits: catálogo de planes CARE / PLUS /
--   PREMIUM de la organización (precio, periodicidad, vigencia de venta,
--   alcance de redención, restricciones) y servicios incluidos por periodo.
-- * memberships: alta por cliente y vehículo en un centro de origen. Las
--   condiciones del plan (precio, periodicidad, beneficios) se CONGELAN al
--   adquirirlo; cambiar el plan después no altera las membresías vendidas.
-- * Estado guardado (activa / suspendida / cancelada) y estado efectivo
--   derivado de las fechas: activa, proxima_a_vencer, vencida, suspendida,
--   cancelada (private.membership_status; espejo en el dominio).
-- * membership_redemptions: consumo de un beneficio desde una línea de OS con
--   validación de elegibilidad, control de usos por periodo e idempotencia
--   (request_id). La OS recibe un descuento de origen "membresia" que no cuenta
--   para los niveles de autorización de descuentos manuales.
-- * membership_events: historial append-only (alta, renovación, suspensión,
--   reactivación, cancelación, redención y anulación), con monto cobrado.
-- * Renovación manual; auto_renew y payment_method_ref quedan como interfaz
--   para el pago recurrente futuro.
-- * membership_metric_facts: hechos sin datos personales para los KPIs
--   (activas, altas, bajas, renovaciones, MRR, uso, ingreso promedio).
--
-- Escrituras sólo por RPC con motivo y auditoría. Compatible hacia atrás.

create type public.membership_state as enum ('activa', 'suspendida', 'cancelada');

-- ---------------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------------

create table public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  code text not null check (code ~ '^[A-Z0-9-]{2,20}$'),
  tier text not null check (tier in ('care', 'plus', 'premium')),
  name text not null check (length(btrim(name)) between 2 and 80),
  description text check (description is null or length(description) <= 1000),
  -- Precio por periodo (MXN, IVA incluido).
  price numeric(12, 2) not null check (price > 0 and price <= 1000000),
  -- Periodicidad: 1 mensual, 3 trimestral, 6 semestral, 12 anual. Los usos se
  -- reinician en cada periodo.
  period_months smallint not null check (period_months in (1, 3, 6, 12)),
  -- Dónde se redimen los beneficios.
  redeem_scope text not null default 'centro_origen' check (redeem_scope in ('centro_origen', 'cualquier_centro')),
  restrictions text check (restrictions is null or length(restrictions) <= 1000),
  -- Días antes del vencimiento en que la membresía está "próxima a vencer" y puede renovarse.
  renewal_notice_days smallint not null default 7 check (renewal_notice_days between 0 and 60),
  -- Vigencia del plan para venta.
  available_from date not null default current_date,
  available_until date,
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (available_until is null or available_until >= available_from),
  unique (organization_id, id),
  unique (organization_id, code)
);

create table public.membership_benefits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  plan_id uuid not null,
  service_id uuid not null,
  -- Unidades del servicio incluidas en cada periodo.
  quantity_per_period smallint not null check (quantity_per_period between 1 and 99),
  notes text check (notes is null or length(notes) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, service_id),
  foreign key (organization_id, plan_id) references public.membership_plans (organization_id, id) on delete cascade,
  foreign key (organization_id, service_id) references public.services (organization_id, id) on delete restrict
);
create index membership_benefits_service_idx on public.membership_benefits (service_id);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  -- Centro de origen (venta, renovación y administración).
  detail_center_id uuid not null,
  -- Número legible por organización: MEM-000123 (es la referencia del canal "membresia" en la OS).
  number text not null,
  number_seq integer not null check (number_seq > 0),
  plan_id uuid not null,
  client_id uuid not null,
  vehicle_id uuid not null,
  state public.membership_state not null default 'activa',
  -- Condiciones del plan adquirido (congeladas; se toman del plan sólo en el alta
  -- y al reiniciar una membresía vencida).
  plan_code text not null,
  plan_name text not null,
  plan_tier text not null check (plan_tier in ('care', 'plus', 'premium')),
  price numeric(12, 2) not null check (price > 0),
  period_months smallint not null check (period_months in (1, 3, 6, 12)),
  redeem_scope text not null check (redeem_scope in ('centro_origen', 'cualquier_centro')),
  renewal_notice_days smallint not null check (renewal_notice_days between 0 and 60),
  -- [{benefit_id, service_id, service_code, service_name, quantity_per_period}]
  benefits jsonb not null check (jsonb_typeof(benefits) = 'array' and jsonb_array_length(benefits) > 0),
  -- Fechas en la zona del centro de origen. Los periodos de uso se cuentan desde
  -- period_anchor en bloques de period_months; ends_on es el último día pagado.
  started_on date not null,
  period_anchor date not null,
  ends_on date not null,
  renewals integer not null default 0 check (renewals >= 0),
  -- Interfaz para pago recurrente futuro (hoy la renovación es manual).
  auto_renew boolean not null default false,
  payment_method_ref text check (payment_method_ref is null or length(payment_method_ref) <= 120),
  suspended_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  request_id uuid not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_anchor >= started_on and ends_on >= period_anchor),
  check ((state = 'suspendida') = (suspended_at is not null)),
  check ((state = 'cancelada') = (cancelled_at is not null and cancel_reason is not null)),
  unique (organization_id, id),
  unique (organization_id, number),
  unique (organization_id, request_id),
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete restrict,
  foreign key (organization_id, plan_id) references public.membership_plans (organization_id, id) on delete restrict,
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete restrict,
  foreign key (organization_id, vehicle_id) references public.vehicles (organization_id, id) on delete restrict
);
-- Un vehículo tiene a lo sumo una membresía no cancelada (una vencida se renueva).
create unique index memberships_vehicle_open_idx on public.memberships (vehicle_id) where state <> 'cancelada';
create index memberships_center_idx on public.memberships (detail_center_id, ends_on);
create index memberships_client_idx on public.memberships (client_id);
create index memberships_plan_idx on public.memberships (plan_id);

-- Consecutivo de membresías por organización (fuera de la API).
create table private.membership_counters (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  last_number integer not null
);
alter table private.membership_counters enable row level security;
revoke all on private.membership_counters from public, anon, authenticated;

-- Origen de un descuento de la OS: manual (con nivel de autorización) o membresía.
alter table public.service_order_discounts
  add column source text not null default 'manual' check (source in ('manual', 'membresia'));

create table public.membership_redemptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  membership_id uuid not null,
  -- Centro de origen de la membresía (visibilidad) y centro de la OS.
  membership_center_id uuid not null,
  detail_center_id uuid not null,
  service_order_id uuid not null,
  item_id uuid,
  discount_id uuid references public.service_order_discounts (id) on delete set null,
  service_id uuid not null,
  service_code text not null,
  service_name text not null,
  quantity smallint not null check (quantity between 1 and 99),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  amount numeric(12, 2) not null check (amount > 0),
  -- Periodo de uso al que se carga la redención.
  period_start date not null,
  period_end date not null,
  request_id uuid not null,
  redeemed_by uuid default auth.uid() references auth.users (id) on delete set null,
  redeemed_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text,
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  check ((voided_at is null) = (void_reason is null)),
  unique (organization_id, request_id),
  foreign key (organization_id, membership_id) references public.memberships (organization_id, id) on delete restrict,
  foreign key (organization_id, service_order_id) references public.service_orders (organization_id, id) on delete restrict,
  foreign key (service_order_id, item_id) references public.service_order_items (service_order_id, id) on delete set null (item_id)
);
create unique index membership_redemptions_item_active_idx on public.membership_redemptions (item_id)
  where voided_at is null and item_id is not null;
create index membership_redemptions_usage_idx on public.membership_redemptions (membership_id, service_id, period_start)
  where voided_at is null;
create index membership_redemptions_order_idx on public.membership_redemptions (service_order_id);
create index membership_redemptions_center_idx on public.membership_redemptions (detail_center_id, redeemed_at);

create table public.membership_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  membership_id uuid not null,
  membership_center_id uuid not null,
  -- Centro donde ocurrió (el de la OS en una redención).
  detail_center_id uuid not null,
  kind text not null check (kind in (
    'alta', 'renovacion', 'suspension', 'reactivacion', 'cancelacion', 'redencion', 'redencion_anulada'
  )),
  from_state text,
  to_state text,
  plan_code text,
  -- Monto cobrado (alta y renovación): base del ingreso por membresías.
  amount numeric(12, 2) check (amount is null or amount >= 0),
  period_start date,
  period_end date,
  reason text,
  data jsonb,
  request_id uuid,
  actor_id uuid references auth.users (id) on delete set null,
  occurred_at timestamptz not null default clock_timestamp(),
  foreign key (organization_id, membership_id) references public.memberships (organization_id, id) on delete restrict
);
create unique index membership_events_request_idx on public.membership_events (membership_id, request_id)
  where request_id is not null;
create index membership_events_membership_idx on public.membership_events (membership_id, occurred_at);
create index membership_events_center_kind_idx on public.membership_events (membership_center_id, kind, occurred_at);

-- ---------------------------------------------------------------------------
-- 2. Reglas (funciones puras con espejo en el dominio)
-- ---------------------------------------------------------------------------

-- Hoy en la zona horaria del centro.
create function private.center_today(p_detail_center_id uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone c.timezone)::date from public.detail_centers c where c.id = p_detail_center_id;
$$;

-- Estado efectivo (espejo de membershipStatus). "Próxima a vencer": faltan
-- renewal_notice_days días o menos para ends_on.
create function private.membership_status(
  p_state public.membership_state,
  p_ends_on date,
  p_notice_days smallint,
  p_today date
) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_state = 'cancelada' then 'cancelada'
    when p_state = 'suspendida' then 'suspendida'
    when p_today > p_ends_on then 'vencida'
    when p_ends_on - p_today <= p_notice_days then 'proxima_a_vencer'
    else 'activa'
  end;
$$;

-- Fecha + meses con el recorte de fin de mes de Postgres (31-ene + 1 mes = 28-feb).
create function private.add_months(p_date date, p_months integer) returns date
language sql immutable set search_path = '' as $$
  select (p_date + make_interval(months => p_months))::date;
$$;

-- Periodo de uso que contiene p_day: bloques de p_period_months desde el ancla
-- (espejo de membershipPeriod). null si p_day es anterior al ancla.
create function private.membership_period(p_anchor date, p_period_months smallint, p_day date,
                                          out period_start date, out period_end date)
language sql immutable set search_path = '' as $$
  select private.add_months(p_anchor, k * p_period_months),
         private.add_months(p_anchor, (k + 1) * p_period_months) - 1
  from (
    select max(k) as k from generate_series(0, 1200) k
     where private.add_months(p_anchor, k * p_period_months) <= p_day
  ) x
  where x.k is not null;
$$;

-- ---------------------------------------------------------------------------
-- 3. Permisos
-- ---------------------------------------------------------------------------

-- memberships.read / memberships.write: venta y consulta (datos personales).
create function private.can_use_memberships(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(
    p_detail_center_id,
    array['admin_socio', 'encargado', 'operador_recepcion', 'comercial_b2b']::public.app_role[]
  );
$$;

-- memberships.manage: suspender, reactivar y cancelar.
create function private.can_manage_memberships(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(p_detail_center_id, array['admin_socio', 'encargado']::public.app_role[]);
$$;

-- Indicadores sin datos personales: comercial, finanzas y dirección.
create function private.can_read_membership_metrics(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(
    p_detail_center_id,
    array['admin_socio', 'encargado', 'contador', 'comercial_b2b']::public.app_role[]
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Triggers
-- ---------------------------------------------------------------------------

create trigger membership_plans_updated_at before update on public.membership_plans
  for each row execute function private.set_updated_at();
create trigger membership_benefits_updated_at before update on public.membership_benefits
  for each row execute function private.set_updated_at();
create trigger memberships_updated_at before update on public.memberships
  for each row execute function private.set_updated_at();
create trigger membership_redemptions_updated_at before update on public.membership_redemptions
  for each row execute function private.set_updated_at();

create trigger membership_plans_require_reason before insert or update or delete on public.membership_plans
  for each row execute function private.require_change_reason();
create trigger membership_benefits_require_reason before insert or update or delete on public.membership_benefits
  for each row execute function private.require_change_reason();
create trigger memberships_require_reason before insert or update or delete on public.memberships
  for each row execute function private.require_change_reason();
create trigger membership_redemptions_require_reason before insert or update or delete on public.membership_redemptions
  for each row execute function private.require_change_reason();

create trigger membership_plans_audit after insert or update or delete on public.membership_plans
  for each row execute function private.audit_row();
create trigger membership_benefits_audit after insert or update or delete on public.membership_benefits
  for each row execute function private.audit_row();
create trigger memberships_audit after insert or update or delete on public.memberships
  for each row execute function private.audit_row();
create trigger membership_redemptions_audit after insert or update or delete on public.membership_redemptions
  for each row execute function private.audit_row();

-- Identidad de la membresía y del plan: nunca cambian.
create function private.keep_membership_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.organization_id, new.detail_center_id, new.number, new.number_seq, new.client_id, new.vehicle_id,
      new.started_on, new.request_id)
     is distinct from
     (old.organization_id, old.detail_center_id, old.number, old.number_seq, old.client_id, old.vehicle_id,
      old.started_on, old.request_id) then
    raise exception 'El centro, número, cliente, vehículo y fecha de alta de una membresía no cambian'
      using errcode = '22023';
  end if;
  if old.state = 'cancelada' then
    raise exception 'Una membresía cancelada no cambia' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger memberships_keep_identity before update on public.memberships
  for each row execute function private.keep_membership_identity();

create function private.keep_membership_plan_code() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.organization_id, new.code) is distinct from (old.organization_id, old.code) then
    raise exception 'La clave de un plan no cambia' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger membership_plans_keep_code before update on public.membership_plans
  for each row execute function private.keep_membership_plan_code();

-- Redenciones inmutables salvo la anulación.
create function private.keep_membership_redemption() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Quitar la línea o su descuento sólo pone item_id/discount_id en null (FK).
  if old.voided_at is not null and (new.voided_at, new.void_reason) is distinct from (old.voided_at, old.void_reason) then
    raise exception 'La redención ya estaba anulada' using errcode = '22023';
  end if;
  if (new.membership_id, new.service_order_id, new.service_id, new.quantity, new.amount, new.period_start,
      new.request_id)
     is distinct from
     (old.membership_id, old.service_order_id, old.service_id, old.quantity, old.amount, old.period_start,
      old.request_id) then
    raise exception 'Una redención no se edita; anúlala y vuelve a redimir' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger membership_redemptions_keep before update on public.membership_redemptions
  for each row execute function private.keep_membership_redemption();

-- Bitácora de membresías (security definer: nadie escribe eventos directamente).
create function private.log_membership_event(
  p_membership_id uuid,
  p_kind text,
  p_detail_center_id uuid default null,
  p_from_state text default null,
  p_to_state text default null,
  p_amount numeric default null,
  p_period_start date default null,
  p_period_end date default null,
  p_data jsonb default null,
  p_request_id uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.membership_events
    (organization_id, membership_id, membership_center_id, detail_center_id, kind, from_state, to_state, plan_code,
     amount, period_start, period_end, reason, data, request_id, actor_id)
  select m.organization_id, m.id, m.detail_center_id, coalesce(p_detail_center_id, m.detail_center_id), p_kind,
         p_from_state, p_to_state, m.plan_code, p_amount, p_period_start, p_period_end,
         nullif(btrim(current_setting('app.change_reason', true)), ''), p_data, p_request_id, auth.uid()
    from public.memberships m where m.id = p_membership_id;
end;
$$;

-- OS: la línea redimida no se quita ni baja de la cantidad redimida; el
-- descuento de membresía sólo se anula desde la redención.
create function private.guard_redeemed_item() returns trigger
language plpgsql set search_path = '' as $$
declare
  redeemed integer;
begin
  select coalesce(sum(r.quantity), 0) into redeemed
    from public.membership_redemptions r where r.item_id = old.id and r.voided_at is null;
  if redeemed > 0 and (tg_op = 'DELETE' or new.quantity < redeemed) then
    raise exception 'La línea tiene % unidad(es) redimidas con membresía; anula la redención antes', redeemed
      using errcode = 'MG002';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger service_order_items_guard_redeemed before delete or update of quantity on public.service_order_items
  for each row execute function private.guard_redeemed_item();

create function private.guard_membership_discount() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.source = 'membresia' and new.voided_at is not null and old.voided_at is null
     and current_setting('app.membership_void', true) is distinct from 'on' then
    raise exception 'El descuento de membresía se anula desde la redención' using errcode = 'MG002';
  end if;
  if new.source is distinct from old.source then
    raise exception 'El origen de un descuento no cambia' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger service_order_discounts_guard_membership before update on public.service_order_discounts
  for each row execute function private.guard_membership_discount();

-- Cancelar la OS libera los usos redimidos en ella.
create function private.release_order_redemptions() returns trigger
language plpgsql set search_path = '' as $$
declare
  r record;
begin
  if new.status = 'cancelada' and old.status is distinct from 'cancelada' then
    for r in select id, membership_id from public.membership_redemptions
              where service_order_id = new.id and voided_at is null loop
      update public.membership_redemptions
         set voided_at = now(), voided_by = auth.uid(), void_reason = 'OS cancelada'
       where id = r.id;
      perform private.log_membership_event(r.membership_id, 'redencion_anulada', new.detail_center_id,
        null, null, null, null, null, jsonb_build_object('redemption_id', r.id, 'service_order_id', new.id));
    end loop;
  end if;
  return null;
end;
$$;
create trigger service_orders_release_redemptions after update of status on public.service_orders
  for each row execute function private.release_order_redemptions();

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------

alter table public.membership_plans enable row level security;
alter table public.membership_benefits enable row level security;
alter table public.memberships enable row level security;
alter table public.membership_redemptions enable row level security;
alter table public.membership_events enable row level security;

-- Planes y beneficios: los lee la organización; los administra el admin_socio corporativo.
create policy membership_plans_select on public.membership_plans
  for select to authenticated using (private.is_org_member(organization_id));
create policy membership_plans_insert on public.membership_plans
  for insert to authenticated with check (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]));
create policy membership_plans_update on public.membership_plans for update to authenticated
  using (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]))
  with check (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]));

create policy membership_benefits_select on public.membership_benefits
  for select to authenticated using (private.is_org_member(organization_id));
create policy membership_benefits_insert on public.membership_benefits
  for insert to authenticated with check (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]));
create policy membership_benefits_update on public.membership_benefits for update to authenticated
  using (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]))
  with check (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]));
create policy membership_benefits_delete on public.membership_benefits
  for delete to authenticated using (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]));

-- Membresías: el centro de origen; si el plan se redime en cualquier centro,
-- también quien puede ver al cliente (para redimir en otro centro).
create policy memberships_select on public.memberships
  for select to authenticated using (
    private.can_use_memberships(detail_center_id)
    or (redeem_scope = 'cualquier_centro' and private.can_see_client(client_id))
  );
create policy memberships_insert on public.memberships
  for insert to authenticated with check (private.can_use_memberships(detail_center_id));
create policy memberships_update on public.memberships for update to authenticated
  using (private.can_use_memberships(detail_center_id)) with check (private.can_use_memberships(detail_center_id));

-- Redenciones e historial: quien ve la membresía (el saldo debe contar las
-- redenciones de todos los centros) o quien opera la OS donde ocurrió.
create policy membership_redemptions_select on public.membership_redemptions
  for select to authenticated using (
    private.can_use_orders(detail_center_id)
    or exists (select 1 from public.memberships m where m.id = membership_id)
  );
create policy membership_redemptions_insert on public.membership_redemptions
  for insert to authenticated with check (private.can_use_orders(detail_center_id));
create policy membership_redemptions_update on public.membership_redemptions for update to authenticated
  using (private.can_use_orders(detail_center_id)) with check (private.can_use_orders(detail_center_id));

create policy membership_events_select on public.membership_events
  for select to authenticated using (
    private.can_use_orders(detail_center_id)
    or exists (select 1 from public.memberships m where m.id = membership_id)
  );

revoke all on public.membership_plans, public.membership_benefits, public.memberships,
  public.membership_redemptions, public.membership_events from anon;
revoke delete, truncate on public.membership_plans, public.memberships, public.membership_redemptions
  from authenticated;
revoke truncate on public.membership_benefits from authenticated;
revoke insert, update, delete, truncate on public.membership_events from authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC: planes
-- ---------------------------------------------------------------------------

create function public.upsert_membership_plan(
  p_organization_id uuid,
  p_id uuid,
  p_code text,
  p_tier text,
  p_name text,
  p_description text,
  p_price numeric,
  p_period_months smallint,
  p_redeem_scope text,
  p_restrictions text,
  p_renewal_notice_days smallint,
  p_available_from date,
  p_available_until date,
  p_active boolean,
  p_reason text
) returns public.membership_plans
language plpgsql security invoker set search_path = '' as $$
declare
  result public.membership_plans;
begin
  perform private.set_change_reason(p_reason);
  if p_id is null then
    insert into public.membership_plans (organization_id, code, tier, name, description, price, period_months,
      redeem_scope, restrictions, renewal_notice_days, available_from, available_until, active)
    values (p_organization_id, upper(btrim(p_code)), p_tier, regexp_replace(btrim(p_name), '\s+', ' ', 'g'),
      nullif(btrim(p_description), ''), p_price, p_period_months, p_redeem_scope, nullif(btrim(p_restrictions), ''),
      coalesce(p_renewal_notice_days, 7), coalesce(p_available_from, current_date), p_available_until,
      coalesce(p_active, true))
    returning * into result;
  else
    update public.membership_plans
       set tier = p_tier, name = regexp_replace(btrim(p_name), '\s+', ' ', 'g'),
           description = nullif(btrim(p_description), ''), price = p_price, period_months = p_period_months,
           redeem_scope = p_redeem_scope, restrictions = nullif(btrim(p_restrictions), ''),
           renewal_notice_days = coalesce(p_renewal_notice_days, renewal_notice_days),
           available_from = coalesce(p_available_from, available_from), available_until = p_available_until,
           active = coalesce(p_active, active)
     where id = p_id and organization_id = p_organization_id
    returning * into result;
    if not found then
      raise exception 'Plan inexistente o sin permiso' using errcode = '42501';
    end if;
  end if;
  return result;
end;
$$;

-- Servicio incluido en un plan (null = quitarlo). Las membresías ya vendidas
-- conservan sus beneficios congelados.
create function public.set_membership_benefit(
  p_plan_id uuid,
  p_service_id uuid,
  p_quantity_per_period smallint,
  p_notes text,
  p_reason text
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  org uuid;
begin
  perform private.set_change_reason(p_reason);
  select p.organization_id into org from public.membership_plans p where p.id = p_plan_id;
  if org is null then
    raise exception 'Plan inexistente' using errcode = '22023';
  end if;
  if p_quantity_per_period is null then
    delete from public.membership_benefits where plan_id = p_plan_id and service_id = p_service_id;
    return;
  end if;
  insert into public.membership_benefits (organization_id, plan_id, service_id, quantity_per_period, notes)
  values (org, p_plan_id, p_service_id, p_quantity_per_period, nullif(btrim(p_notes), ''))
  on conflict (plan_id, service_id) do update
    set quantity_per_period = excluded.quantity_per_period, notes = excluded.notes;
  if not exists (select 1 from public.membership_benefits where plan_id = p_plan_id and service_id = p_service_id) then
    raise exception 'Sin permiso para configurar planes' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. RPC: membresías
-- ---------------------------------------------------------------------------

-- Beneficios vigentes de un plan, congelados para la membresía.
create function private.membership_plan_snapshot(p_plan_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'benefit_id', b.id, 'service_id', b.service_id, 'service_code', s.code, 'service_name', s.name,
           'quantity_per_period', b.quantity_per_period) order by s.name), '[]'::jsonb)
    from public.membership_benefits b
    join public.services s on s.id = b.service_id
   where b.plan_id = p_plan_id;
$$;

-- Serializa las operaciones sobre una membresía (también desde otro centro, sin
-- exigir permiso de edición sobre la fila).
create function private.lock_membership(p_membership_id uuid) returns public.memberships
language plpgsql set search_path = '' as $$
declare
  m public.memberships;
begin
  perform pg_advisory_xact_lock(hashtextextended('membership:' || p_membership_id::text, 0));
  select * into m from public.memberships where id = p_membership_id;
  if not found then
    raise exception 'Membresía inexistente o sin permiso' using errcode = '42501';
  end if;
  return m;
end;
$$;

create function private.next_membership_number(p_organization_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  insert into private.membership_counters (organization_id, last_number)
  values (p_organization_id, 1)
  on conflict (organization_id) do update set last_number = private.membership_counters.last_number + 1
  returning last_number into n;
  return n;
end;
$$;

-- Plan disponible para vender en una fecha.
create function private.assert_plan_available(pl public.membership_plans, p_day date) returns void
language plpgsql set search_path = '' as $$
begin
  if not pl.active or p_day < pl.available_from or (pl.available_until is not null and p_day > pl.available_until) then
    raise exception 'El plan % no está disponible para venta', pl.code using errcode = 'MG002';
  end if;
  if not exists (select 1 from public.membership_benefits b where b.plan_id = pl.id) then
    raise exception 'El plan % no tiene servicios incluidos', pl.code using errcode = 'MG002';
  end if;
end;
$$;

-- Alta de membresía por cliente y vehículo (idempotente por request_id).
create function public.create_membership(
  p_detail_center_id uuid,
  p_request_id uuid,
  p_plan_id uuid,
  p_client_id uuid,
  p_vehicle_id uuid,
  p_starts_on date default null,
  p_payment_reference text default null
) returns public.memberships
language plpgsql security invoker set search_path = '' as $$
declare
  center public.detail_centers;
  pl public.membership_plans;
  result public.memberships;
  today date;
  v_start date;
  seq integer;
begin
  select * into center from public.detail_centers where id = p_detail_center_id;
  if not found or not private.can_use_memberships(p_detail_center_id) then
    raise exception 'Sin permiso para vender membresías en este centro' using errcode = '42501';
  end if;
  select * into result from public.memberships
   where organization_id = center.organization_id and request_id = p_request_id;
  if found then
    return result;
  end if;
  select * into pl from public.membership_plans where id = p_plan_id and organization_id = center.organization_id;
  if not found then
    raise exception 'Plan inexistente' using errcode = '22023';
  end if;
  today := private.center_today(p_detail_center_id);
  v_start := coalesce(p_starts_on, today);
  if v_start < today or v_start > today + 30 then
    raise exception 'La membresía inicia entre hoy y los próximos 30 días' using errcode = '22023';
  end if;
  perform private.assert_plan_available(pl, v_start);
  if not exists (select 1 from public.vehicles v
                  where v.id = p_vehicle_id and v.client_id = p_client_id and v.active) then
    raise exception 'El vehículo no pertenece al cliente o está dado de baja' using errcode = '22023';
  end if;
  if exists (select 1 from public.memberships m where m.vehicle_id = p_vehicle_id and m.state <> 'cancelada') then
    raise exception 'El vehículo ya tiene una membresía; renuévala o cancélala' using errcode = 'MG002';
  end if;
  perform private.set_change_reason('Alta de membresía ' || pl.code);
  seq := private.next_membership_number(center.organization_id);
  insert into public.memberships (organization_id, detail_center_id, number, number_seq, plan_id, client_id,
    vehicle_id, plan_code, plan_name, plan_tier, price, period_months, redeem_scope, renewal_notice_days, benefits,
    started_on, period_anchor, ends_on, request_id)
  values (center.organization_id, center.id, 'MEM-' || lpad(seq::text, 6, '0'), seq, pl.id, p_client_id,
    p_vehicle_id, pl.code, pl.name, pl.tier, pl.price, pl.period_months, pl.redeem_scope, pl.renewal_notice_days,
    private.membership_plan_snapshot(pl.id), v_start, v_start, private.add_months(v_start, pl.period_months) - 1,
    p_request_id)
  returning * into result;
  perform private.log_membership_event(result.id, 'alta', null, null, 'activa', result.price, result.period_anchor,
    result.ends_on, jsonb_build_object('payment_reference', nullif(btrim(p_payment_reference), '')), p_request_id);
  return result;
end;
$$;

-- Renovación manual (interfaz del pago recurrente futuro). Se renueva
-- próxima a vencer o vencida:
-- * antes de vencer: se agrega un periodo con las MISMAS condiciones adquiridas;
-- * vencida: la membresía se reinicia hoy con las condiciones vigentes del plan
--   (o de otro plan, p_plan_id = cambio de plan).
create function public.renew_membership(
  p_membership_id uuid,
  p_request_id uuid,
  p_plan_id uuid default null,
  p_payment_reference text default null
) returns public.memberships
language plpgsql security invoker set search_path = '' as $$
declare
  m public.memberships;
  pl public.membership_plans;
  today date;
  v_status text;
  paid integer;
begin
  m := private.lock_membership(p_membership_id);
  if exists (select 1 from public.membership_events e
              where e.membership_id = m.id and e.request_id = p_request_id and e.kind = 'renovacion') then
    return m;
  end if;
  if not private.can_use_memberships(m.detail_center_id) then
    raise exception 'Sin permiso para renovar en el centro de origen' using errcode = '42501';
  end if;
  today := private.center_today(m.detail_center_id);
  v_status := private.membership_status(m.state, m.ends_on, m.renewal_notice_days, today);
  if v_status in ('cancelada', 'suspendida') then
    raise exception 'Una membresía % no se renueva', v_status using errcode = 'MG002';
  end if;
  if v_status = 'activa' then
    raise exception 'Se renueva a partir de % días antes del vencimiento (%)', m.renewal_notice_days, m.ends_on
      using errcode = 'MG002';
  end if;
  perform private.set_change_reason('Renovación de membresía ' || m.number);
  if v_status = 'proxima_a_vencer' then
    if p_plan_id is not null and p_plan_id <> m.plan_id then
      raise exception 'El cambio de plan se aplica al renovar una membresía vencida' using errcode = 'MG002';
    end if;
    -- Mismo ancla: el siguiente bloque de period_months.
    paid := 0;
    while private.add_months(m.period_anchor, paid * m.period_months) <= m.ends_on loop
      paid := paid + 1;
    end loop;
    update public.memberships
       set ends_on = private.add_months(period_anchor, (paid + 1) * period_months) - 1,
           renewals = renewals + 1
     where id = m.id
    returning * into m;
  else
    select * into pl from public.membership_plans
     where id = coalesce(p_plan_id, m.plan_id) and organization_id = m.organization_id;
    if not found then
      raise exception 'Plan inexistente' using errcode = '22023';
    end if;
    perform private.assert_plan_available(pl, today);
    update public.memberships
       set plan_id = pl.id, plan_code = pl.code, plan_name = pl.name, plan_tier = pl.tier, price = pl.price,
           period_months = pl.period_months, redeem_scope = pl.redeem_scope,
           renewal_notice_days = pl.renewal_notice_days, benefits = private.membership_plan_snapshot(pl.id),
           period_anchor = today, ends_on = private.add_months(today, pl.period_months) - 1,
           renewals = renewals + 1
     where id = m.id
    returning * into m;
  end if;
  perform private.log_membership_event(m.id, 'renovacion', null, v_status, 'activa', m.price,
    greatest(today, m.period_anchor), m.ends_on,
    jsonb_build_object('payment_reference', nullif(btrim(p_payment_reference), ''), 'plan_code', m.plan_code),
    p_request_id);
  return m;
end;
$$;

-- Suspender, reactivar o cancelar (con motivo; encargado o admin del centro de origen).
create function public.set_membership_state(
  p_membership_id uuid,
  p_state public.membership_state,
  p_reason text
) returns public.memberships
language plpgsql security invoker set search_path = '' as $$
declare
  m public.memberships;
  kind text;
begin
  m := private.lock_membership(p_membership_id);
  perform private.set_change_reason(p_reason);
  if not private.can_manage_memberships(m.detail_center_id) then
    raise exception 'Sólo el encargado o el admin suspenden, reactivan o cancelan membresías' using errcode = '42501';
  end if;
  kind := case
    when m.state = 'activa' and p_state = 'suspendida' then 'suspension'
    when m.state = 'suspendida' and p_state = 'activa' then 'reactivacion'
    when m.state in ('activa', 'suspendida') and p_state = 'cancelada' then 'cancelacion'
  end;
  if kind is null then
    raise exception 'Transición no permitida: % → %', m.state, p_state using errcode = '22023';
  end if;
  update public.memberships
     set state = p_state,
         suspended_at = case when p_state = 'suspendida' then now() end,
         cancelled_at = case when p_state = 'cancelada' then now() end,
         cancel_reason = case when p_state = 'cancelada' then btrim(p_reason) end,
         auto_renew = case when p_state = 'cancelada' then false else auto_renew end
   where id = m.id;
  perform private.log_membership_event(m.id, kind, null, m.state::text, p_state::text);
  select * into m from public.memberships where id = m.id;
  return m;
end;
$$;

-- Saldo del periodo vigente por servicio incluido (una sola definición: web,
-- móvil y la validación de la redención leen lo mismo).
create function public.membership_balance(p_membership_id uuid)
returns table (
  service_id uuid,
  service_code text,
  service_name text,
  quantity_per_period integer,
  used integer,
  remaining integer,
  period_start date,
  period_end date
)
language sql stable security invoker set search_path = '' as $$
  with m as (
    select mm.*, private.center_today(mm.detail_center_id) as today from public.memberships mm where mm.id = p_membership_id
  ), p as (
    select m.*, per.period_start, least(per.period_end, m.ends_on) as period_end
      from m left join lateral private.membership_period(m.period_anchor, m.period_months, least(m.today, m.ends_on)) per on true
  )
  select (b->>'service_id')::uuid, b->>'service_code', b->>'service_name', (b->>'quantity_per_period')::integer,
         coalesce(u.used, 0)::integer,
         greatest(0, (b->>'quantity_per_period')::integer - coalesce(u.used, 0))::integer,
         p.period_start, p.period_end
    from p
    cross join lateral jsonb_array_elements(p.benefits) b
    left join lateral (
      select sum(r.quantity) as used from public.membership_redemptions r
       where r.membership_id = p.id and r.service_id = (b->>'service_id')::uuid
         and r.period_start = p.period_start and r.voided_at is null
    ) u on true
   order by b->>'service_name';
$$;

-- Redime un beneficio en una línea de la OS. Idempotente por request_id: un
-- reintento (doble clic, web y móvil) devuelve la misma redención.
create function public.redeem_membership_benefit(
  p_order_id uuid,
  p_version integer,
  p_item_id uuid,
  p_membership_id uuid,
  p_quantity smallint,
  p_request_id uuid
) returns public.membership_redemptions
language plpgsql security invoker set search_path = '' as $$
declare
  o public.service_orders;
  m public.memberships;
  it public.service_order_items;
  benefit jsonb;
  result public.membership_redemptions;
  today date;
  v_status text;
  per record;
  used integer;
  q integer := coalesce(p_quantity, 1);
  applied numeric(12, 2);
  disc_id uuid := gen_random_uuid();
begin
  select * into result from public.membership_redemptions where request_id = p_request_id and membership_id = p_membership_id;
  if found then
    return result;
  end if;
  o := private.lock_service_order(p_order_id, p_version);
  m := private.lock_membership(p_membership_id);
  if o.status not in ('abierta', 'autorizada', 'en_proceso', 'pausada', 'terminada') then
    raise exception 'No se redimen beneficios en una OS entregada o cancelada' using errcode = 'MG002';
  end if;
  if (m.client_id, m.vehicle_id) is distinct from (o.client_id, o.vehicle_id) then
    raise exception 'La membresía % es de otro cliente o vehículo', m.number using errcode = 'MG002';
  end if;
  if m.redeem_scope = 'centro_origen' and m.detail_center_id <> o.detail_center_id then
    raise exception 'La membresía % sólo se redime en su centro de origen', m.number using errcode = 'MG002';
  end if;
  today := private.center_today(m.detail_center_id);
  v_status := private.membership_status(m.state, m.ends_on, m.renewal_notice_days, today);
  if v_status in ('cancelada', 'suspendida', 'vencida') then
    raise exception 'La membresía % está %', m.number, replace(v_status, '_', ' ') using errcode = 'MG002';
  end if;
  if today < m.period_anchor then
    raise exception 'La membresía % inicia el %', m.number, m.period_anchor using errcode = 'MG002';
  end if;
  select * into it from public.service_order_items where id = p_item_id and service_order_id = o.id;
  if not found then
    raise exception 'La línea no pertenece a la OS' using errcode = '22023';
  end if;
  select b into benefit from jsonb_array_elements(m.benefits) b where (b->>'service_id')::uuid = it.service_id;
  if benefit is null then
    raise exception 'El plan % no incluye %', m.plan_code, it.service_name using errcode = 'MG002';
  end if;
  if q < 1 or q > it.quantity then
    raise exception 'Cantidad a redimir inválida (la línea tiene %)', it.quantity using errcode = '22023';
  end if;
  if exists (select 1 from public.membership_redemptions r where r.item_id = it.id and r.voided_at is null) then
    raise exception 'La línea ya tiene una redención de membresía' using errcode = 'MG002';
  end if;
  select * into per from private.membership_period(m.period_anchor, m.period_months, today);
  select coalesce(sum(r.quantity), 0) into used from public.membership_redemptions r
   where r.membership_id = m.id and r.service_id = it.service_id and r.period_start = per.period_start
     and r.voided_at is null;
  if used + q > (benefit->>'quantity_per_period')::integer then
    raise exception 'Sin saldo: % de % usados en el periodo', used, (benefit->>'quantity_per_period')::integer
      using errcode = 'MG002';
  end if;
  if o.channel = 'b2b' then
    raise exception 'Una OS B2B no redime membresías' using errcode = 'MG002';
  end if;
  if o.channel = 'membresia' and o.channel_reference is not null and o.channel_reference <> m.number then
    raise exception 'La OS está ligada a la membresía %', o.channel_reference using errcode = 'MG002';
  end if;
  applied := round(it.unit_price * q, 2);
  if applied <= 0 then
    raise exception 'El servicio no tiene precio que cubrir' using errcode = '22023';
  end if;
  if applied > it.line_subtotal - it.line_discount or applied > o.total - o.paid_amount then
    raise exception 'La redención excede el importe pendiente de la línea o de la OS' using errcode = 'MG002';
  end if;
  perform private.set_change_reason('Membresía ' || m.number || ' · ' || it.service_name);
  if o.channel <> 'membresia' or o.channel_reference is null then
    update public.service_orders set channel = 'membresia', channel_reference = m.number where id = o.id;
  end if;
  insert into public.service_order_discounts
    (id, organization_id, service_order_id, item_id, kind, value, amount, reason, authorization_level, source)
  values (disc_id, o.organization_id, o.id, it.id, 'amount', applied, applied,
          'Membresía ' || m.number || ' · ' || it.service_name, 'operador', 'membresia');
  insert into public.membership_redemptions (organization_id, membership_id, membership_center_id, detail_center_id,
    service_order_id, item_id, discount_id, service_id, service_code, service_name, quantity, unit_price, amount,
    period_start, period_end, request_id)
  values (o.organization_id, m.id, m.detail_center_id, o.detail_center_id, o.id, it.id, disc_id, it.service_id,
    it.service_code, it.service_name, q, it.unit_price, applied, per.period_start, least(per.period_end, m.ends_on),
    p_request_id)
  returning * into result;
  perform private.recalc_service_order(o.id);
  perform private.log_membership_event(m.id, 'redencion', o.detail_center_id, null, null, null, per.period_start,
    least(per.period_end, m.ends_on),
    jsonb_build_object('redemption_id', result.id, 'service_order_id', o.id, 'folio', o.folio,
                       'service_code', it.service_code, 'quantity', q, 'amount', applied));
  return result;
end;
$$;

-- Anula una redención con motivo: se anula su descuento y se libera el uso.
create function public.void_membership_redemption(
  p_redemption_id uuid,
  p_version integer,
  p_reason text
) returns public.membership_redemptions
language plpgsql security invoker set search_path = '' as $$
declare
  r public.membership_redemptions;
  o public.service_orders;
begin
  select * into r from public.membership_redemptions where id = p_redemption_id;
  if not found then
    raise exception 'Redención inexistente o sin permiso' using errcode = '42501';
  end if;
  o := private.lock_service_order(r.service_order_id, p_version);
  perform private.lock_membership(r.membership_id);
  perform private.set_change_reason(p_reason);
  if o.status not in ('abierta', 'autorizada', 'en_proceso', 'pausada', 'terminada') then
    raise exception 'No se modifican redenciones de una OS entregada o cancelada' using errcode = 'MG002';
  end if;
  if r.voided_at is not null then
    raise exception 'La redención ya estaba anulada' using errcode = '22023';
  end if;
  perform set_config('app.membership_void', 'on', true);
  update public.service_order_discounts
     set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
   where id = r.discount_id and voided_at is null;
  perform set_config('app.membership_void', '', true);
  update public.membership_redemptions
     set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
   where id = r.id
  returning * into r;
  perform private.recalc_service_order(o.id);
  perform private.log_membership_event(r.membership_id, 'redencion_anulada', o.detail_center_id, null, null, null,
    r.period_start, r.period_end, jsonb_build_object('redemption_id', r.id, 'service_order_id', o.id, 'folio', o.folio));
  return r;
end;
$$;

-- Descuentos manuales: el % acumulado para el nivel de autorización excluye
-- los descuentos de membresía (los autoriza el plan, no el operador).
create or replace function public.add_service_order_discount(
  p_order_id uuid,
  p_version integer,
  p_item_id uuid,
  p_kind text,
  p_value numeric,
  p_reason text
) returns public.service_orders
language plpgsql security invoker set search_path = '' as $$
declare
  o public.service_orders;
  new_id uuid := gen_random_uuid();
  base numeric(12, 2);
  remaining numeric(12, 2);
  applied numeric(12, 2);
  membership_total numeric(12, 2);
  pct numeric;
  required public.discount_level;
  mine public.discount_level;
begin
  o := private.lock_service_order(p_order_id, p_version);
  perform private.set_change_reason(p_reason);
  if o.status not in ('abierta', 'autorizada', 'en_proceso', 'pausada', 'terminada') then
    raise exception 'No se aplican descuentos a una OS entregada o cancelada' using errcode = '22023';
  end if;
  if p_kind not in ('percent', 'amount') or p_value is null or p_value <= 0 or (p_kind = 'percent' and p_value > 100) then
    raise exception 'Descuento inválido' using errcode = '22023';
  end if;
  -- Base del % (igual que recalc_service_order) y lo que queda por descontar.
  if p_item_id is not null then
    select i.line_subtotal, i.line_subtotal - i.line_discount into base, remaining
      from public.service_order_items i where i.id = p_item_id and i.service_order_id = o.id;
    if not found then
      raise exception 'La línea no pertenece a la OS' using errcode = '22023';
    end if;
  else
    select o.subtotal - coalesce(sum(i.line_discount), 0) into base
      from public.service_order_items i where i.service_order_id = o.id;
    remaining := o.total;
  end if;
  applied := case when p_kind = 'percent' then round(base * p_value / 100, 2) else p_value end;
  if applied > remaining then
    raise exception 'El descuento excede el importe pendiente' using errcode = '22023';
  end if;
  if applied > o.total - o.paid_amount then
    raise exception 'El descuento deja saldo a favor del cliente; los reembolsos llegan con el módulo de pagos'
      using errcode = '22023';
  end if;
  select coalesce(sum(d.amount), 0) into membership_total
    from public.service_order_discounts d
   where d.service_order_id = o.id and d.source = 'membresia' and d.voided_at is null;
  pct := case when o.subtotal > 0 then (o.discount_total - membership_total + applied) * 100 / o.subtotal else 0 end;
  required := private.discount_required_level(pct);
  mine := private.discount_level_of(o.detail_center_id);
  if mine is null or mine < required then
    raise exception using errcode = '42501', message = format(
      'Un descuento acumulado de %s %% requiere autorización de nivel %s', round(pct, 1), required);
  end if;
  insert into public.service_order_discounts
    (id, organization_id, service_order_id, item_id, kind, value, amount, reason, authorization_level)
  values (new_id, o.organization_id, o.id, p_item_id, p_kind, p_value, applied, btrim(p_reason), required);
  perform private.recalc_service_order(o.id);
  select * into o from public.service_orders where id = o.id;
  if o.total < o.paid_amount then
    raise exception 'El descuento deja saldo a favor del cliente; los reembolsos llegan con el módulo de pagos'
      using errcode = '22023';
  end if;
  perform private.log_event(o.organization_id, o.detail_center_id, 'service_order.discount_authorized',
                            'public.service_order_discounts', new_id::text,
                            jsonb_build_object('service_order_id', o.id, 'amount', applied, 'percent_total', round(pct, 2),
                                               'level', required));
  return o;
end;
$$;

-- Listado del centro de origen con estado efectivo y búsqueda por número, cliente o placa.
create function public.list_memberships(
  p_detail_center_id uuid,
  p_status text default null,
  p_query text default null,
  p_limit integer default 50
)
returns table (
  id uuid,
  number text,
  state public.membership_state,
  status text,
  plan_code text,
  plan_name text,
  plan_tier text,
  price numeric,
  period_months smallint,
  client_id uuid,
  client_name text,
  vehicle_id uuid,
  vehicle_label text,
  started_on date,
  ends_on date,
  renewals integer
)
language sql stable security invoker set search_path = '' as $$
  select x.id, x.number, x.state, x.status, x.plan_code, x.plan_name, x.plan_tier, x.price, x.period_months,
         x.client_id, x.client_name, x.vehicle_id, x.vehicle_label, x.started_on, x.ends_on, x.renewals
  from (
    select m.*, c.full_name as client_name,
           v.make || ' ' || v.model || ' ' || v.year || ' · ' || v.plate as vehicle_label, v.plate,
           private.membership_status(m.state, m.ends_on, m.renewal_notice_days,
                                     private.center_today(m.detail_center_id)) as status
      from public.memberships m
      join public.clients c on c.id = m.client_id
      join public.vehicles v on v.id = m.vehicle_id
     where m.detail_center_id = p_detail_center_id
  ) x
  where (p_status is null or x.status = p_status)
    and (nullif(btrim(p_query), '') is null
         or x.number ilike '%' || private.like_escape(btrim(p_query)) || '%'
         or x.client_name ilike '%' || private.like_escape(btrim(p_query)) || '%'
         or x.plate ilike '%' || private.like_escape(private.normalize_plate(p_query)) || '%')
  order by x.ends_on, x.number
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- Hechos para KPIs (sin datos personales) de los centros que el usuario puede
-- consultar. Las fórmulas (MRR, uso, ingreso promedio) viven en
-- @meguiars/analytics; aquí sólo hay hechos por membresía.
create function public.membership_metric_facts(
  p_detail_center_ids uuid[],
  p_from date,
  p_to date
)
returns table (
  detail_center_id uuid,
  membership_id uuid,
  status text,
  price numeric,
  period_months smallint,
  started_on date,
  ends_on date,
  entitled_units integer,
  used_units integer,
  new_in_range boolean,
  renewals_in_range integer,
  cancelled_in_range boolean,
  expired_in_range boolean,
  revenue_in_range numeric
)
language sql stable security definer set search_path = '' as $$
  select m.detail_center_id, m.id,
         private.membership_status(m.state, m.ends_on, m.renewal_notice_days, p_to),
         m.price, m.period_months, m.started_on, m.ends_on,
         (select coalesce(sum((b->>'quantity_per_period')::integer), 0) from jsonb_array_elements(m.benefits) b)::integer,
         (select coalesce(sum(r.quantity), 0) from public.membership_redemptions r
           where r.membership_id = m.id and r.voided_at is null
             and (r.redeemed_at at time zone c.timezone)::date between p_from and p_to)::integer,
         exists (select 1 from public.membership_events e where e.membership_id = m.id and e.kind = 'alta'
                   and (e.occurred_at at time zone c.timezone)::date between p_from and p_to),
         (select count(*) from public.membership_events e where e.membership_id = m.id and e.kind = 'renovacion'
            and (e.occurred_at at time zone c.timezone)::date between p_from and p_to)::integer,
         exists (select 1 from public.membership_events e where e.membership_id = m.id and e.kind = 'cancelacion'
                   and (e.occurred_at at time zone c.timezone)::date between p_from and p_to),
         m.state <> 'cancelada' and m.ends_on between p_from and p_to and m.ends_on < p_to,
         (select coalesce(sum(e.amount), 0) from public.membership_events e
           where e.membership_id = m.id and e.kind in ('alta', 'renovacion')
             and (e.occurred_at at time zone c.timezone)::date between p_from and p_to)
    from public.memberships m
    join public.detail_centers c on c.id = m.detail_center_id
   where m.detail_center_id = any (p_detail_center_ids)
     and private.can_read_membership_metrics(m.detail_center_id)
     and m.started_on <= p_to;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.center_today(uuid)',
    'private.membership_status(public.membership_state, date, smallint, date)',
    'private.add_months(date, integer)',
    'private.membership_period(date, smallint, date)',
    'private.can_use_memberships(uuid)',
    'private.can_manage_memberships(uuid)',
    'private.can_read_membership_metrics(uuid)',
    'private.log_membership_event(uuid, text, uuid, text, text, numeric, date, date, jsonb, uuid)',
    'private.membership_plan_snapshot(uuid)',
    'private.lock_membership(uuid)',
    'private.next_membership_number(uuid)',
    'private.assert_plan_available(public.membership_plans, date)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.upsert_membership_plan(uuid, uuid, text, text, text, text, numeric, smallint, text, text, smallint, date, date, boolean, text)',
    'public.set_membership_benefit(uuid, uuid, smallint, text, text)',
    'public.create_membership(uuid, uuid, uuid, uuid, uuid, date, text)',
    'public.renew_membership(uuid, uuid, uuid, text)',
    'public.set_membership_state(uuid, public.membership_state, text)',
    'public.membership_balance(uuid)',
    'public.redeem_membership_benefit(uuid, integer, uuid, uuid, smallint, uuid)',
    'public.void_membership_redemption(uuid, integer, text)',
    'public.list_memberships(uuid, text, text, integer)',
    'public.membership_metric_facts(uuid[], date, date)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
