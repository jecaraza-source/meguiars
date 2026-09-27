-- C3 — Comercial / B2B: empresas, convenios, tarifas y vehículos.
--
-- * b2b_accounts: empresa (ligada a un cliente "company" que ya tiene la
--   flotilla), datos fiscales básicos opcionales, estatus y centro gestor.
-- * b2b_contacts: contactos de la empresa.
-- * b2b_agreements (+ b2b_agreement_centers): convenios con vigencia, centros
--   habilitados, modelo de cobro (por vehículo, paquete, volumen mensual o
--   iguala), condición de pago (días) y límite de crédito. Un convenio vencido,
--   suspendido o cancelado nunca se aplica automáticamente.
-- * b2b_price_rules: tarifa por servicio (o para todos): precio fijo, % de
--   descuento sobre lista o "incluido" (paquete / iguala); con volumen mensual
--   mínimo para escalones.
-- * b2b_vehicles: vehículos autorizados (si el convenio lo exige).
-- * b2b_invoices / b2b_payments: cortes de facturación (referencia del CFDI
--   emitido fuera) y pagos, para el saldo por facturar y por cobrar. Sin CFDI.
-- * service_orders.b2b_agreement_id / b2b_invoice_id y FK de b2b_account_id.
--   La tarifa convenida se aplica en la base al agregar cada línea
--   (put_service_order_item) y queda congelada: el operador no la altera.
--
-- Escrituras sólo por RPC con motivo y auditoría. Compatible hacia atrás.

-- ---------------------------------------------------------------------------
-- 1. Permisos
-- ---------------------------------------------------------------------------

-- b2b.read: ver cuentas, convenios, estado de cuenta y rentabilidad.
create function private.can_read_b2b(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(
    p_detail_center_id, array['admin_socio', 'encargado', 'comercial_b2b', 'contador']::public.app_role[]);
$$;

-- b2b.manage: cuentas, contactos, convenios, tarifas y vehículos.
create function private.can_manage_b2b(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(p_detail_center_id, array['admin_socio', 'comercial_b2b']::public.app_role[]);
$$;

-- b2b.billing: cortes de facturación y pagos (el contador sólo consulta: es de sólo lectura).
create function private.can_bill_b2b(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(p_detail_center_id, array['admin_socio', 'comercial_b2b']::public.app_role[]);
$$;

-- ---------------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------------

create table public.b2b_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  -- Centro gestor: quien administra la cuenta (los convenios habilitan otros centros).
  home_detail_center_id uuid not null,
  -- Cliente empresa con la flotilla (vehículos del módulo de clientes).
  client_id uuid not null,
  name text not null check (length(btrim(name)) between 2 and 120),
  legal_name text check (legal_name is null or length(btrim(legal_name)) between 2 and 200),
  rfc text check (rfc is null or rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  tax_regime text check (tax_regime is null or tax_regime ~ '^[0-9]{3}$'),
  fiscal_zip text check (fiscal_zip is null or fiscal_zip ~ '^[0-9]{5}$'),
  billing_email text check (
    billing_email is null
    or (billing_email = lower(billing_email) and length(billing_email) <= 254
        and billing_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  status text not null default 'activa' check (status in ('activa', 'suspendida', 'baja')),
  notes text check (notes is null or length(notes) <= 2000),
  request_id uuid not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, client_id),
  unique (organization_id, request_id),
  foreign key (organization_id, home_detail_center_id)
    references public.detail_centers (organization_id, id) on delete restrict,
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete restrict
);

create table public.b2b_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  account_id uuid not null,
  full_name text not null check (length(btrim(full_name)) between 2 and 120),
  title text check (title is null or length(title) <= 80),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (
    email is null
    or (email = lower(email) and length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  is_primary boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (phone is not null or email is not null),
  foreign key (organization_id, account_id) references public.b2b_accounts (organization_id, id) on delete cascade
);
create unique index b2b_contacts_one_primary on public.b2b_contacts (account_id) where is_primary and active;

create table public.b2b_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  account_id uuid not null,
  name text not null check (length(btrim(name)) between 2 and 120),
  -- Modelo de cobro (configuración simple):
  -- por_vehiculo    tarifa por servicio para cada vehículo atendido;
  -- volumen_mensual tarifas escalonadas por número de OS del mes;
  -- paquete         cuota única con N servicios incluidos durante la vigencia;
  -- iguala          cuota mensual con N servicios incluidos por mes.
  billing_model text not null check (billing_model in ('por_vehiculo', 'volumen_mensual', 'paquete', 'iguala')),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'activo' check (status in ('activo', 'suspendido', 'cancelado')),
  -- lista: sólo vehículos autorizados en b2b_vehicles; cualquiera: toda la flotilla del cliente.
  vehicle_rule text not null default 'lista' check (vehicle_rule in ('lista', 'cualquiera')),
  payment_terms_days smallint not null default 30 check (payment_terms_days between 0 and 120),
  credit_limit numeric(12, 2) check (credit_limit is null or credit_limit > 0),
  fee_amount numeric(12, 2) check (fee_amount is null or fee_amount > 0),
  included_units integer check (included_units is null or included_units between 1 and 10000),
  notes text check (notes is null or length(notes) <= 2000),
  request_id uuid not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, request_id),
  check (ends_on >= starts_on),
  check ((billing_model in ('paquete', 'iguala')) = (fee_amount is not null and included_units is not null)),
  foreign key (organization_id, account_id) references public.b2b_accounts (organization_id, id) on delete restrict,
  -- Un convenio activo por cuenta y fecha: la OS no tiene que elegir entre dos.
  constraint b2b_agreements_no_overlap exclude using gist (
    account_id extensions.gist_uuid_ops with =,
    daterange(starts_on, ends_on, '[]') with &&
  ) where (status = 'activo')
);

create table public.b2b_agreement_centers (
  agreement_id uuid not null,
  detail_center_id uuid not null,
  organization_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (agreement_id, detail_center_id),
  foreign key (organization_id, agreement_id) references public.b2b_agreements (organization_id, id) on delete cascade,
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete restrict
);
create index b2b_agreement_centers_center_idx on public.b2b_agreement_centers (detail_center_id);

create table public.b2b_price_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  agreement_id uuid not null,
  -- null = todos los servicios del catálogo.
  service_id uuid,
  kind text not null check (kind in ('precio_fijo', 'descuento_pct', 'incluido')),
  value numeric(12, 2),
  -- Escalón: aplica cuando la cuenta lleva al menos N OS en el mes (volumen_mensual).
  min_monthly_orders integer not null default 0 check (min_monthly_orders between 0 and 10000),
  active boolean not null default true,
  notes text check (notes is null or length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique nulls not distinct (agreement_id, service_id, kind, min_monthly_orders),
  check (case kind
           when 'precio_fijo' then value is not null and value >= 0
           when 'descuento_pct' then value is not null and value > 0 and value <= 100
           else value is null end),
  foreign key (organization_id, agreement_id) references public.b2b_agreements (organization_id, id) on delete cascade,
  foreign key (organization_id, service_id) references public.services (organization_id, id) on delete restrict
);
create index b2b_price_rules_agreement_idx on public.b2b_price_rules (agreement_id) where active;

create table public.b2b_vehicles (
  account_id uuid not null,
  vehicle_id uuid not null,
  organization_id uuid not null,
  active boolean not null default true,
  cost_center text check (cost_center is null or length(cost_center) <= 80),
  driver_name text check (driver_name is null or length(driver_name) <= 120),
  notes text check (notes is null or length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, vehicle_id),
  foreign key (organization_id, account_id) references public.b2b_accounts (organization_id, id) on delete cascade,
  foreign key (organization_id, vehicle_id) references public.vehicles (organization_id, id) on delete restrict
);

-- Corte de facturación: agrupa OS entregadas (y cuotas) bajo la referencia del
-- CFDI emitido fuera de la plataforma. Interfaz para un export/API futuro.
create table public.b2b_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  account_id uuid not null,
  reference text not null check (length(btrim(reference)) between 1 and 80),
  issued_on date not null,
  due_on date not null,
  orders_amount numeric(12, 2) not null check (orders_amount >= 0),
  fee_amount numeric(12, 2) not null default 0 check (fee_amount >= 0),
  amount numeric(12, 2) generated always as (orders_amount + fee_amount) stored,
  status text not null default 'emitida' check (status in ('emitida', 'anulada')),
  void_reason text,
  notes text check (notes is null or length(notes) <= 1000),
  request_id uuid not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, request_id),
  unique (account_id, reference),
  check (orders_amount + fee_amount > 0),
  check (due_on >= issued_on),
  check ((status = 'anulada') = (void_reason is not null)),
  foreign key (organization_id, account_id) references public.b2b_accounts (organization_id, id) on delete restrict
);

create table public.b2b_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  account_id uuid not null,
  invoice_id uuid,
  amount numeric(12, 2) not null check (amount > 0),
  method text not null check (method in ('transferencia', 'cheque', 'tarjeta', 'efectivo', 'otro')),
  reference text check (reference is null or length(reference) <= 120),
  paid_on date not null,
  voided_at timestamptz,
  void_reason text,
  request_id uuid not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, request_id),
  check ((voided_at is null) = (void_reason is null)),
  foreign key (organization_id, account_id) references public.b2b_accounts (organization_id, id) on delete restrict,
  foreign key (organization_id, invoice_id) references public.b2b_invoices (organization_id, id) on delete restrict
);
create index b2b_payments_account_idx on public.b2b_payments (account_id);

-- Vínculo de la OS con la cuenta, el convenio aplicado y el corte de facturación.
alter table public.service_orders
  add column b2b_agreement_id uuid,
  add column b2b_invoice_id uuid,
  add constraint service_orders_b2b_account_fk foreign key (organization_id, b2b_account_id)
    references public.b2b_accounts (organization_id, id) on delete restrict,
  add constraint service_orders_b2b_agreement_fk foreign key (organization_id, b2b_agreement_id)
    references public.b2b_agreements (organization_id, id) on delete restrict,
  add constraint service_orders_b2b_invoice_fk foreign key (organization_id, b2b_invoice_id)
    references public.b2b_invoices (organization_id, id) on delete restrict,
  add constraint service_orders_b2b_consistent check (
    (b2b_agreement_id is null or b2b_account_id is not null)
    and (b2b_account_id is null or channel = 'b2b')
    and (b2b_invoice_id is null or b2b_account_id is not null));
create index service_orders_b2b_account_idx on public.service_orders (b2b_account_id) where b2b_account_id is not null;
create index service_orders_b2b_invoice_idx on public.service_orders (b2b_invoice_id) where b2b_invoice_id is not null;

-- Línea: precio de lista al venderse y regla del convenio aplicada ('convenio').
alter table public.service_order_items
  add column list_unit_price numeric(12, 2) check (list_unit_price is null or list_unit_price >= 0),
  add column b2b_price_rule_id uuid references public.b2b_price_rules (id) on delete restrict;
alter table public.service_order_items drop constraint service_order_items_price_source_check;
alter table public.service_order_items
  add constraint service_order_items_price_source_check check (price_source in ('base', 'center', 'convenio')),
  add constraint service_order_items_convenio_rule check ((price_source = 'convenio') = (b2b_price_rule_id is not null));

-- ---------------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------------

create trigger b2b_accounts_updated_at before update on public.b2b_accounts
  for each row execute function private.set_updated_at();
create trigger b2b_contacts_updated_at before update on public.b2b_contacts
  for each row execute function private.set_updated_at();
create trigger b2b_agreements_updated_at before update on public.b2b_agreements
  for each row execute function private.set_updated_at();
create trigger b2b_price_rules_updated_at before update on public.b2b_price_rules
  for each row execute function private.set_updated_at();
create trigger b2b_vehicles_updated_at before update on public.b2b_vehicles
  for each row execute function private.set_updated_at();
create trigger b2b_invoices_updated_at before update on public.b2b_invoices
  for each row execute function private.set_updated_at();
create trigger b2b_payments_updated_at before update on public.b2b_payments
  for each row execute function private.set_updated_at();

create trigger b2b_accounts_require_reason before insert or update or delete on public.b2b_accounts
  for each row execute function private.require_change_reason();
create trigger b2b_contacts_require_reason before insert or update or delete on public.b2b_contacts
  for each row execute function private.require_change_reason();
create trigger b2b_agreements_require_reason before insert or update or delete on public.b2b_agreements
  for each row execute function private.require_change_reason();
create trigger b2b_agreement_centers_require_reason before insert or update or delete on public.b2b_agreement_centers
  for each row execute function private.require_change_reason();
create trigger b2b_price_rules_require_reason before insert or update or delete on public.b2b_price_rules
  for each row execute function private.require_change_reason();
create trigger b2b_vehicles_require_reason before insert or update or delete on public.b2b_vehicles
  for each row execute function private.require_change_reason();
create trigger b2b_invoices_require_reason before insert or update or delete on public.b2b_invoices
  for each row execute function private.require_change_reason();
create trigger b2b_payments_require_reason before insert or update or delete on public.b2b_payments
  for each row execute function private.require_change_reason();

create trigger b2b_accounts_audit after insert or update or delete on public.b2b_accounts
  for each row execute function private.audit_row();
create trigger b2b_contacts_audit after insert or update or delete on public.b2b_contacts
  for each row execute function private.audit_row();
create trigger b2b_agreements_audit after insert or update or delete on public.b2b_agreements
  for each row execute function private.audit_row();
create trigger b2b_agreement_centers_audit after insert or update or delete on public.b2b_agreement_centers
  for each row execute function private.audit_row();
create trigger b2b_price_rules_audit after insert or update or delete on public.b2b_price_rules
  for each row execute function private.audit_row();
create trigger b2b_vehicles_audit after insert or update or delete on public.b2b_vehicles
  for each row execute function private.audit_row();
create trigger b2b_invoices_audit after insert or update or delete on public.b2b_invoices
  for each row execute function private.audit_row();
create trigger b2b_payments_audit after insert or update or delete on public.b2b_payments
  for each row execute function private.audit_row();

-- La cuenta, el convenio y el corte de una OS sólo cambian por las RPC B2B
-- (que marcan la transacción); una OS a cuenta B2B conserva el canal B2B.
create function private.guard_service_order_b2b() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (new.b2b_account_id, new.b2b_agreement_id, new.b2b_invoice_id) is distinct from (null::uuid, null::uuid, null::uuid)
       and current_setting('app.b2b_link', true) is distinct from 'on' then
      raise exception 'La cuenta B2B de una OS se asigna con las RPC B2B' using errcode = '42501';
    end if;
    return new;
  end if;
  if (new.b2b_account_id, new.b2b_agreement_id) is distinct from (old.b2b_account_id, old.b2b_agreement_id)
     and current_setting('app.b2b_link', true) is distinct from 'on' then
    raise exception 'La cuenta B2B de una OS se asigna con las RPC B2B' using errcode = '42501';
  end if;
  if new.b2b_invoice_id is distinct from old.b2b_invoice_id
     and current_setting('app.b2b_invoice', true) is distinct from 'on' then
    raise exception 'El corte de facturación de una OS sólo cambia desde facturación B2B' using errcode = '42501';
  end if;
  if old.b2b_account_id is not null and new.channel <> 'b2b' then
    raise exception 'Una OS a cuenta B2B conserva el canal B2B' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger service_orders_guard_b2b before insert or update on public.service_orders
  for each row execute function private.guard_service_order_b2b();

-- Precio, costo, duración, motor, precio de lista y regla del convenio de una línea quedan congelados.
create or replace function private.keep_service_order_item_frozen() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.organization_id, new.service_order_id, new.kind, new.service_id, new.service_code, new.service_name,
      new.revenue_engine, new.unit_price, new.unit_direct_cost, new.duration_minutes, new.price_source,
      new.list_unit_price, new.b2b_price_rule_id)
     is distinct from
     (old.organization_id, old.service_order_id, old.kind, old.service_id, old.service_code, old.service_name,
      old.revenue_engine, old.unit_price, old.unit_direct_cost, old.duration_minutes, old.price_source,
      old.list_unit_price, old.b2b_price_rule_id) then
    raise exception 'El precio y los datos congelados de una línea no cambian' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- La tarifa convenida no la ajusta el operador: en una OS con convenio los
-- descuentos manuales exigen encargado o admin.
create function private.guard_b2b_discount() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.source = 'manual'
     and exists (select 1 from public.service_orders o
                  where o.id = new.service_order_id and o.b2b_agreement_id is not null)
     and coalesce(private.discount_level_of(
           (select o.detail_center_id from public.service_orders o where o.id = new.service_order_id)),
           'operador') = 'operador' then
    raise exception 'La tarifa del convenio sólo la ajusta un encargado o un admin' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger service_order_discounts_guard_b2b before insert on public.service_order_discounts
  for each row execute function private.guard_b2b_discount();

-- ---------------------------------------------------------------------------
-- 4. Reglas (espejo en el dominio)
-- ---------------------------------------------------------------------------

-- Estado efectivo de un convenio (espejo de agreementState): cancelado y
-- suspendido mandan; fuera de fechas es programado o vencido.
create function private.b2b_agreement_state(p_status text, p_starts_on date, p_ends_on date, p_today date)
returns text
language sql immutable set search_path = '' as $$
  select case
    when p_status in ('cancelado', 'suspendido') then p_status
    when p_today < p_starts_on then 'programado'
    when p_today > p_ends_on then 'vencido'
    else 'vigente'
  end;
$$;

-- Cuotas devengadas en [p_from, p_to] (espejo de agreementFees): paquete, una
-- vez al iniciar; iguala, una por cada mes iniciado de la vigencia.
create function private.b2b_fee_accrued(
  p_billing_model text,
  p_fee numeric,
  p_starts_on date,
  p_ends_on date,
  p_from date,
  p_to date
) returns numeric
language sql immutable set search_path = '' as $$
  select case
    when p_fee is null then 0
    when p_billing_model = 'paquete' then
      case when p_starts_on between p_from and p_to then p_fee else 0 end
    when p_billing_model = 'iguala' then
      p_fee * (select count(*) from generate_series(0, 1200) k
                where private.add_months(p_starts_on, k) between p_from and least(p_to, p_ends_on))
    else 0
  end::numeric(12, 2);
$$;

-- Convenio vigente de la cuenta en el centro (null si no hay).
create function private.b2b_current_agreement(p_account_id uuid, p_detail_center_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select a.id
    from public.b2b_agreements a
    join public.b2b_accounts ac on ac.id = a.account_id and ac.status = 'activa'
    join public.b2b_agreement_centers c on c.agreement_id = a.id and c.detail_center_id = p_detail_center_id
   where a.account_id = p_account_id
     and private.b2b_agreement_state(a.status, a.starts_on, a.ends_on,
                                     private.center_today(p_detail_center_id)) = 'vigente'
   limit 1;
$$;

-- Precio de una línea en una OS con convenio. Sin convenio aplicable, el de
-- lista. Prioridad: regla del servicio sobre la general; "incluido" mientras
-- queden unidades del periodo; el escalón de volumen más alto alcanzado.
create function private.b2b_line_price(
  p_order_id uuid,
  p_service_id uuid,
  p_list_price numeric,
  p_quantity integer
) returns table (price numeric, rule_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare
  o public.service_orders;
  a public.b2b_agreements;
  today date;
  tz text;
  month_start date;
  volume integer;
  used integer;
  r public.b2b_price_rules;
begin
  select * into o from public.service_orders where id = p_order_id;
  if o.b2b_agreement_id is null then
    return query select p_list_price, null::uuid;
    return;
  end if;
  select * into a from public.b2b_agreements where id = o.b2b_agreement_id;
  today := private.center_today(o.detail_center_id);
  if private.b2b_current_agreement(a.account_id, o.detail_center_id) is distinct from a.id then
    -- Convenio vencido, suspendido o deshabilitado en el centro: no se aplica.
    return query select p_list_price, null::uuid;
    return;
  end if;
  select c.timezone into tz from public.detail_centers c where c.id = o.detail_center_id;
  month_start := date_trunc('month', today)::date;
  select count(*) into volume from public.service_orders x
   where x.b2b_agreement_id = a.id and x.status <> 'cancelada'
     and (x.created_at at time zone tz)::date >= month_start;
  select coalesce(sum(i.quantity), 0) into used
    from public.service_order_items i
    join public.service_orders x on x.id = i.service_order_id
    join public.b2b_price_rules pr on pr.id = i.b2b_price_rule_id and pr.kind = 'incluido'
   where x.b2b_agreement_id = a.id and x.status <> 'cancelada'
     and not (i.service_order_id = p_order_id and i.service_id = p_service_id)
     and (a.billing_model = 'paquete' or (x.created_at at time zone tz)::date >= month_start);
  for r in
    select * from public.b2b_price_rules pr
     where pr.agreement_id = a.id and pr.active
       and (pr.service_id = p_service_id or pr.service_id is null)
       and pr.min_monthly_orders <= volume
     order by (pr.service_id is null), (pr.kind = 'incluido') desc, pr.min_monthly_orders desc, pr.created_at
  loop
    if r.kind = 'incluido' then
      if used + p_quantity <= coalesce(a.included_units, 0) then
        return query select 0::numeric, r.id;
        return;
      end if;
    elsif r.kind = 'precio_fijo' then
      return query select r.value, r.id;
      return;
    else
      return query select round(p_list_price * (1 - r.value / 100), 2), r.id;
      return;
    end if;
  end loop;
  return query select p_list_price, null::uuid;
end;
$$;

-- Tipo de una regla (el operador no lee tarifas por RLS).
create function private.b2b_rule_kind(p_rule_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select kind from public.b2b_price_rules where id = p_rule_id;
$$;

-- Agrega o cambia la cantidad de una línea. Una línea nueva congela el precio
-- vigente del centro o, en una OS con convenio aplicable, la tarifa convenida;
-- una existente conserva su precio congelado (y un servicio incluido no supera
-- las unidades del periodo).
create or replace function private.put_service_order_item(o public.service_orders, p_service_id uuid, p_quantity integer)
returns void
language plpgsql set search_path = '' as $$
declare
  cat record;
  line public.service_order_items;
  priced record;
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

-- Saldo de la cuenta (espejo de accountBalance): por facturar = OS entregadas
-- sin corte + cuotas devengadas sin facturar; por cobrar = cortes emitidos −
-- pagos; comprometido = OS abiertas; exposición = todo lo anterior.
create function private.b2b_account_balance(p_account_id uuid)
returns table (
  consumption numeric,
  orders_to_invoice numeric,
  fees_accrued numeric,
  fees_invoiced numeric,
  to_invoice numeric,
  invoiced numeric,
  paid numeric,
  receivable numeric,
  overdue numeric,
  open_orders numeric,
  exposure numeric,
  credit_limit numeric,
  credit_available numeric
)
language sql stable security definer set search_path = '' as $$
  with ac as (
    select a.id, (now() at time zone c.timezone)::date as today
      from public.b2b_accounts a join public.detail_centers c on c.id = a.home_detail_center_id
     where a.id = p_account_id
  ), os as (
    select coalesce(sum(o.total) filter (where o.status = 'entregada'), 0) as consumption,
           coalesce(sum(o.total) filter (where o.status = 'entregada' and o.b2b_invoice_id is null), 0) as to_invoice,
           coalesce(sum(o.total) filter (where o.status not in ('entregada', 'cancelada')), 0) as open_orders
      from public.service_orders o where o.b2b_account_id = p_account_id
  ), fees as (
    select coalesce(sum(private.b2b_fee_accrued(g.billing_model, g.fee_amount, g.starts_on, g.ends_on,
                                                g.starts_on, ac.today)), 0) as accrued
      from public.b2b_agreements g, ac where g.account_id = p_account_id
  ), inv as (
    select coalesce(sum(i.amount), 0) as invoiced, coalesce(sum(i.fee_amount), 0) as fees_invoiced
      from public.b2b_invoices i where i.account_id = p_account_id and i.status = 'emitida'
  ), pay as (
    select coalesce(sum(p.amount), 0) as paid
      from public.b2b_payments p where p.account_id = p_account_id and p.voided_at is null
  ), due as (
    -- Vencido: cortes con fecha de pago pasada menos los pagos aplicados, del más antiguo al más reciente.
    select greatest(0, coalesce(sum(i.amount) filter (where i.due_on < ac.today), 0) - pay.paid) as overdue
      from public.b2b_invoices i, ac, pay where i.account_id = p_account_id and i.status = 'emitida'
     group by pay.paid
  ), lim as (
    select g.credit_limit from public.b2b_agreements g, ac
     where g.account_id = p_account_id and g.status = 'activo' and ac.today between g.starts_on and g.ends_on
     order by g.starts_on desc limit 1
  )
  select os.consumption + fees.accrued,
         os.to_invoice, fees.accrued, inv.fees_invoiced,
         os.to_invoice + greatest(0, fees.accrued - inv.fees_invoiced),
         inv.invoiced, pay.paid, inv.invoiced - pay.paid, coalesce((select overdue from due), 0),
         os.open_orders,
         os.to_invoice + greatest(0, fees.accrued - inv.fees_invoiced) + (inv.invoiced - pay.paid) + os.open_orders,
         (select credit_limit from lim),
         (select credit_limit from lim)
           - (os.to_invoice + greatest(0, fees.accrued - inv.fees_invoiced) + (inv.invoiced - pay.paid) + os.open_orders)
    from os, fees, inv, pay;
$$;

-- Visibilidad: centro gestor o un centro habilitado en alguno de sus convenios.
-- p_operation incluye a quien abre OS en los centros habilitados.
create function private.b2b_account_visible(p_account_id uuid, p_operation boolean default true) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.b2b_accounts a
     where a.id = p_account_id
       and (private.can_read_b2b(a.home_detail_center_id)
            or exists (select 1 from public.b2b_agreements g
                         join public.b2b_agreement_centers c on c.agreement_id = g.id
                        where g.account_id = a.id
                          and (private.can_read_b2b(c.detail_center_id)
                               or (p_operation and private.can_use_orders(c.detail_center_id))))));
$$;

create function private.b2b_account_manageable(p_account_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.b2b_accounts a
                  where a.id = p_account_id and private.can_manage_b2b(a.home_detail_center_id));
$$;

create function private.b2b_account_billable(p_account_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.b2b_accounts a
                  where a.id = p_account_id and private.can_bill_b2b(a.home_detail_center_id));
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------

alter table public.b2b_accounts enable row level security;
alter table public.b2b_contacts enable row level security;
alter table public.b2b_agreements enable row level security;
alter table public.b2b_agreement_centers enable row level security;
alter table public.b2b_price_rules enable row level security;
alter table public.b2b_vehicles enable row level security;
alter table public.b2b_invoices enable row level security;
alter table public.b2b_payments enable row level security;

create policy b2b_accounts_select on public.b2b_accounts
  for select to authenticated using (private.b2b_account_visible(id));
create policy b2b_contacts_select on public.b2b_contacts
  for select to authenticated using (private.b2b_account_visible(account_id));
create policy b2b_agreements_select on public.b2b_agreements
  for select to authenticated using (private.b2b_account_visible(account_id));
create policy b2b_agreement_centers_select on public.b2b_agreement_centers
  for select to authenticated
  using (exists (select 1 from public.b2b_agreements g where g.id = agreement_id));
create policy b2b_vehicles_select on public.b2b_vehicles
  for select to authenticated using (private.b2b_account_visible(account_id));
-- Tarifas, cortes y pagos: sólo roles B2B (no el operador).
create policy b2b_price_rules_select on public.b2b_price_rules
  for select to authenticated
  using (exists (select 1 from public.b2b_agreements g
                  where g.id = agreement_id and private.b2b_account_visible(g.account_id, false)));
create policy b2b_invoices_select on public.b2b_invoices
  for select to authenticated using (private.b2b_account_visible(account_id, false));
create policy b2b_payments_select on public.b2b_payments
  for select to authenticated using (private.b2b_account_visible(account_id, false));

-- Todas las escrituras van por RPC (security definer con chequeo explícito).
revoke all on public.b2b_accounts, public.b2b_contacts, public.b2b_agreements, public.b2b_agreement_centers,
  public.b2b_price_rules, public.b2b_vehicles, public.b2b_invoices, public.b2b_payments from anon;
revoke insert, update, delete, truncate on public.b2b_accounts, public.b2b_contacts, public.b2b_agreements,
  public.b2b_agreement_centers, public.b2b_price_rules, public.b2b_vehicles, public.b2b_invoices,
  public.b2b_payments from authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC de administración (b2b.manage en el centro gestor)
-- ---------------------------------------------------------------------------

create function public.upsert_b2b_account(
  p_id uuid,
  p_request_id uuid,
  p_home_detail_center_id uuid,
  p_client_id uuid,
  p_name text,
  p_legal_name text,
  p_rfc text,
  p_tax_regime text,
  p_fiscal_zip text,
  p_billing_email text,
  p_status text,
  p_notes text,
  p_reason text
) returns public.b2b_accounts
language plpgsql security definer set search_path = '' as $$
declare
  center public.detail_centers;
  cli public.clients;
  result public.b2b_accounts;
begin
  perform private.set_change_reason(p_reason);
  select * into center from public.detail_centers where id = p_home_detail_center_id;
  if not found or not private.can_manage_b2b(p_home_detail_center_id) then
    raise exception 'Sin permiso para administrar cuentas B2B en este centro' using errcode = '42501';
  end if;
  if p_status not in ('activa', 'suspendida', 'baja') then
    raise exception 'Estatus inválido' using errcode = '22023';
  end if;
  if p_id is null then
    select * into result from public.b2b_accounts
     where organization_id = center.organization_id and request_id = p_request_id;
    if found then
      return result;
    end if;
    select * into cli from public.clients where id = p_client_id and organization_id = center.organization_id;
    if not found or not private.can_see_client(p_client_id) then
      raise exception 'Cliente inexistente o no visible desde tus centros' using errcode = '42501';
    end if;
    if cli.kind <> 'company' then
      raise exception 'La cuenta B2B se liga a un cliente de tipo empresa' using errcode = 'MG002';
    end if;
    if exists (select 1 from public.b2b_accounts where client_id = p_client_id) then
      raise exception 'Ese cliente ya tiene una cuenta B2B' using errcode = 'MG002';
    end if;
    insert into public.b2b_accounts (organization_id, home_detail_center_id, client_id, name, legal_name, rfc,
      tax_regime, fiscal_zip, billing_email, status, notes, request_id)
    values (center.organization_id, center.id, p_client_id, btrim(p_name), nullif(btrim(p_legal_name), ''),
      nullif(upper(btrim(p_rfc)), ''), nullif(btrim(p_tax_regime), ''), nullif(btrim(p_fiscal_zip), ''),
      nullif(lower(btrim(p_billing_email)), ''), p_status, nullif(btrim(p_notes), ''), p_request_id)
    returning * into result;
    return result;
  end if;
  select * into result from public.b2b_accounts where id = p_id for update;
  if not found or not private.can_manage_b2b(result.home_detail_center_id) then
    raise exception 'Cuenta inexistente o sin permiso' using errcode = '42501';
  end if;
  update public.b2b_accounts
     set home_detail_center_id = center.id, name = btrim(p_name), legal_name = nullif(btrim(p_legal_name), ''),
         rfc = nullif(upper(btrim(p_rfc)), ''), tax_regime = nullif(btrim(p_tax_regime), ''),
         fiscal_zip = nullif(btrim(p_fiscal_zip), ''), billing_email = nullif(lower(btrim(p_billing_email)), ''),
         status = p_status, notes = nullif(btrim(p_notes), '')
   where id = p_id
  returning * into result;
  return result;
end;
$$;

create function public.upsert_b2b_contact(
  p_account_id uuid,
  p_id uuid,
  p_full_name text,
  p_title text,
  p_phone text,
  p_email text,
  p_is_primary boolean,
  p_active boolean,
  p_reason text
) returns public.b2b_contacts
language plpgsql security definer set search_path = '' as $$
declare
  acc public.b2b_accounts;
  result public.b2b_contacts;
begin
  perform private.set_change_reason(p_reason);
  select * into acc from public.b2b_accounts where id = p_account_id;
  if not found or not private.can_manage_b2b(acc.home_detail_center_id) then
    raise exception 'Cuenta inexistente o sin permiso' using errcode = '42501';
  end if;
  if coalesce(p_is_primary, false) and coalesce(p_active, true) then
    update public.b2b_contacts set is_primary = false
     where account_id = acc.id and is_primary and id is distinct from p_id;
  end if;
  if p_id is null then
    insert into public.b2b_contacts (organization_id, account_id, full_name, title, phone, email, is_primary, active)
    values (acc.organization_id, acc.id, btrim(p_full_name), nullif(btrim(p_title), ''), nullif(btrim(p_phone), ''),
      nullif(lower(btrim(p_email)), ''), coalesce(p_is_primary, false), coalesce(p_active, true))
    returning * into result;
  else
    update public.b2b_contacts
       set full_name = btrim(p_full_name), title = nullif(btrim(p_title), ''), phone = nullif(btrim(p_phone), ''),
           email = nullif(lower(btrim(p_email)), ''), is_primary = coalesce(p_is_primary, false),
           active = coalesce(p_active, true)
     where id = p_id and account_id = acc.id
    returning * into result;
    if not found then
      raise exception 'Contacto inexistente' using errcode = '22023';
    end if;
  end if;
  return result;
end;
$$;

-- Alta o edición de un convenio con sus centros habilitados. Cancelar recorta
-- la vigencia a hoy (las cuotas dejan de devengarse).
create function public.upsert_b2b_agreement(
  p_account_id uuid,
  p_id uuid,
  p_request_id uuid,
  p_name text,
  p_billing_model text,
  p_starts_on date,
  p_ends_on date,
  p_status text,
  p_vehicle_rule text,
  p_payment_terms_days smallint,
  p_credit_limit numeric,
  p_fee_amount numeric,
  p_included_units integer,
  p_detail_center_ids uuid[],
  p_notes text,
  p_reason text
) returns public.b2b_agreements
language plpgsql security definer set search_path = '' as $$
declare
  acc public.b2b_accounts;
  result public.b2b_agreements;
  today date;
  v_ends date := p_ends_on;
begin
  perform private.set_change_reason(p_reason);
  select * into acc from public.b2b_accounts where id = p_account_id;
  if not found or not private.can_manage_b2b(acc.home_detail_center_id) then
    raise exception 'Cuenta inexistente o sin permiso' using errcode = '42501';
  end if;
  if p_billing_model not in ('por_vehiculo', 'volumen_mensual', 'paquete', 'iguala')
     or p_status not in ('activo', 'suspendido', 'cancelado') or p_vehicle_rule not in ('lista', 'cualquiera') then
    raise exception 'Convenio inválido' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_detail_center_ids), 0) = 0 then
    raise exception 'Habilita al menos un centro' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_detail_center_ids) c
              where not exists (select 1 from public.detail_centers d
                                 where d.id = c and d.organization_id = acc.organization_id)) then
    raise exception 'Centro fuera de la organización' using errcode = '22023';
  end if;
  today := private.center_today(acc.home_detail_center_id);
  if p_status = 'cancelado' then
    v_ends := greatest(least(p_ends_on, today), p_starts_on);
  end if;
  if p_billing_model not in ('paquete', 'iguala') then
    p_fee_amount := null;
    p_included_units := null;
  end if;
  if p_id is null then
    select * into result from public.b2b_agreements
     where organization_id = acc.organization_id and request_id = p_request_id;
    if found then
      return result;
    end if;
    insert into public.b2b_agreements (organization_id, account_id, name, billing_model, starts_on, ends_on, status,
      vehicle_rule, payment_terms_days, credit_limit, fee_amount, included_units, notes, request_id)
    values (acc.organization_id, acc.id, btrim(p_name), p_billing_model, p_starts_on, v_ends, p_status,
      p_vehicle_rule, coalesce(p_payment_terms_days, 30), p_credit_limit, p_fee_amount, p_included_units,
      nullif(btrim(p_notes), ''), p_request_id)
    returning * into result;
  else
    select * into result from public.b2b_agreements where id = p_id and account_id = acc.id for update;
    if not found then
      raise exception 'Convenio inexistente' using errcode = '22023';
    end if;
    if result.status = 'cancelado' then
      raise exception 'Un convenio cancelado no se edita; crea uno nuevo' using errcode = 'MG002';
    end if;
    if p_billing_model <> result.billing_model
       and exists (select 1 from public.service_orders o where o.b2b_agreement_id = result.id) then
      raise exception 'El modelo de cobro no cambia con OS registradas; crea un convenio nuevo' using errcode = 'MG002';
    end if;
    update public.b2b_agreements
       set name = btrim(p_name), billing_model = p_billing_model, starts_on = p_starts_on, ends_on = v_ends,
           status = p_status, vehicle_rule = p_vehicle_rule, payment_terms_days = coalesce(p_payment_terms_days, 30),
           credit_limit = p_credit_limit, fee_amount = p_fee_amount, included_units = p_included_units,
           notes = nullif(btrim(p_notes), '')
     where id = result.id
    returning * into result;
  end if;
  delete from public.b2b_agreement_centers
   where agreement_id = result.id and detail_center_id <> all (p_detail_center_ids);
  insert into public.b2b_agreement_centers (agreement_id, detail_center_id, organization_id)
  select result.id, c, acc.organization_id from unnest(p_detail_center_ids) c
  on conflict do nothing;
  -- La empresa (y su flotilla) queda visible en los centros habilitados para abrir sus OS.
  insert into public.client_centers (client_id, detail_center_id, organization_id)
  select acc.client_id, c, acc.organization_id from unnest(p_detail_center_ids) c
  on conflict (client_id, detail_center_id) do nothing;
  return result;
exception
  when exclusion_violation then
    raise exception 'Ya hay un convenio activo de la cuenta en esas fechas' using errcode = 'MG002';
end;
$$;

-- Alta o edición de una tarifa del convenio (desactivar = active false).
create function public.set_b2b_price_rule(
  p_agreement_id uuid,
  p_id uuid,
  p_service_id uuid,
  p_kind text,
  p_value numeric,
  p_min_monthly_orders integer,
  p_active boolean,
  p_notes text,
  p_reason text
) returns public.b2b_price_rules
language plpgsql security definer set search_path = '' as $$
declare
  g public.b2b_agreements;
  result public.b2b_price_rules;
begin
  perform private.set_change_reason(p_reason);
  select * into g from public.b2b_agreements where id = p_agreement_id;
  if not found or not private.b2b_account_manageable(g.account_id) then
    raise exception 'Convenio inexistente o sin permiso para cambiar tarifas' using errcode = '42501';
  end if;
  if p_kind not in ('precio_fijo', 'descuento_pct', 'incluido') then
    raise exception 'Tipo de tarifa inválido' using errcode = '22023';
  end if;
  if p_kind = 'incluido' and g.billing_model not in ('paquete', 'iguala') then
    raise exception '"Incluido" sólo aplica a convenios de paquete o iguala' using errcode = 'MG002';
  end if;
  if coalesce(p_min_monthly_orders, 0) > 0 and g.billing_model <> 'volumen_mensual' then
    raise exception 'Los escalones por volumen sólo aplican a convenios de volumen mensual' using errcode = 'MG002';
  end if;
  if p_id is null then
    insert into public.b2b_price_rules (organization_id, agreement_id, service_id, kind, value, min_monthly_orders,
      active, notes)
    values (g.organization_id, g.id, p_service_id, p_kind, case when p_kind = 'incluido' then null else p_value end,
      coalesce(p_min_monthly_orders, 0), coalesce(p_active, true), nullif(btrim(p_notes), ''))
    returning * into result;
  else
    update public.b2b_price_rules
       set service_id = p_service_id, kind = p_kind, value = case when p_kind = 'incluido' then null else p_value end,
           min_monthly_orders = coalesce(p_min_monthly_orders, 0), active = coalesce(p_active, true),
           notes = nullif(btrim(p_notes), '')
     where id = p_id and agreement_id = g.id
    returning * into result;
    if not found then
      raise exception 'Tarifa inexistente' using errcode = '22023';
    end if;
  end if;
  return result;
exception
  when unique_violation then
    raise exception 'Ya existe una tarifa igual para ese servicio y escalón' using errcode = 'MG002';
  when check_violation then
    raise exception 'Valor inválido: precio ≥ 0 o descuento entre 0 y 100 %%' using errcode = '22023';
end;
$$;

-- Autoriza (o retira) un vehículo de la flotilla del cliente de la cuenta.
create function public.set_b2b_vehicle(
  p_account_id uuid,
  p_vehicle_id uuid,
  p_active boolean,
  p_cost_center text,
  p_driver_name text,
  p_notes text,
  p_reason text
) returns public.b2b_vehicles
language plpgsql security definer set search_path = '' as $$
declare
  acc public.b2b_accounts;
  result public.b2b_vehicles;
begin
  perform private.set_change_reason(p_reason);
  select * into acc from public.b2b_accounts where id = p_account_id;
  if not found or not private.can_manage_b2b(acc.home_detail_center_id) then
    raise exception 'Cuenta inexistente o sin permiso' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vehicles v where v.id = p_vehicle_id and v.client_id = acc.client_id) then
    raise exception 'El vehículo no pertenece a la flotilla de la empresa' using errcode = 'MG002';
  end if;
  insert into public.b2b_vehicles (account_id, vehicle_id, organization_id, active, cost_center, driver_name, notes)
  values (acc.id, p_vehicle_id, acc.organization_id, coalesce(p_active, true), nullif(btrim(p_cost_center), ''),
    nullif(btrim(p_driver_name), ''), nullif(btrim(p_notes), ''))
  on conflict (account_id, vehicle_id) do update
    set active = excluded.active, cost_center = excluded.cost_center, driver_name = excluded.driver_name,
        notes = excluded.notes
  returning * into result;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. OS a cuenta B2B (operación: orders.write en el centro)
-- ---------------------------------------------------------------------------

-- Convenio aplicable para abrir una OS: cuenta activa, convenio vigente
-- habilitado en el centro y vehículo autorizado. Mensajes visibles (MG002).
create function private.b2b_agreement_for_order(p_account_id uuid, p_detail_center_id uuid, p_vehicle_id uuid)
returns public.b2b_agreements
language plpgsql stable security definer set search_path = '' as $$
declare
  acc public.b2b_accounts;
  g public.b2b_agreements;
  last_one public.b2b_agreements;
begin
  select * into acc from public.b2b_accounts where id = p_account_id;
  if not found or not private.b2b_account_visible(p_account_id) then
    raise exception 'Cuenta B2B inexistente o sin permiso' using errcode = '42501';
  end if;
  if acc.status <> 'activa' then
    raise exception 'La cuenta B2B está %', acc.status using errcode = 'MG002';
  end if;
  select * into g from public.b2b_agreements where id = private.b2b_current_agreement(acc.id, p_detail_center_id);
  if not found then
    select a.* into last_one from public.b2b_agreements a
      join public.b2b_agreement_centers c on c.agreement_id = a.id and c.detail_center_id = p_detail_center_id
     where a.account_id = acc.id order by a.ends_on desc limit 1;
    if last_one.id is not null and last_one.ends_on < private.center_today(p_detail_center_id) then
      raise exception 'El convenio "%" venció el %; renuévalo o atiende sin convenio',
        last_one.name, to_char(last_one.ends_on, 'DD/MM/YYYY') using errcode = 'MG002';
    end if;
    raise exception 'La cuenta no tiene un convenio vigente en este centro' using errcode = 'MG002';
  end if;
  if not exists (select 1 from public.vehicles v where v.id = p_vehicle_id and v.client_id = acc.client_id and v.active)
     or (g.vehicle_rule = 'lista'
         and not exists (select 1 from public.b2b_vehicles bv
                          where bv.account_id = acc.id and bv.vehicle_id = p_vehicle_id and bv.active)) then
    raise exception 'El vehículo no está autorizado en el convenio' using errcode = 'MG002';
  end if;
  return g;
end;
$$;

-- Liga la OS abierta a la cuenta y aplica la tarifa convenida a sus líneas.
create function private.link_order_to_b2b(p_order_id uuid, g public.b2b_agreements, p_purchase_order text)
returns public.service_orders
language plpgsql set search_path = '' as $$
declare
  o public.service_orders;
  lines jsonb;
  item jsonb;
  acc public.b2b_accounts;
  bal record;
begin
  select * into acc from public.b2b_accounts where id = g.account_id;
  perform set_config('app.b2b_link', 'on', true);
  update public.service_orders
     set channel = 'b2b', channel_reference = coalesce(nullif(btrim(p_purchase_order), ''), channel_reference),
         b2b_account_id = g.account_id, b2b_agreement_id = g.id
   where id = p_order_id
  returning * into o;
  perform set_config('app.b2b_link', 'off', true);
  -- Re-precia: las líneas se congelaron con el precio de lista antes de ligar la cuenta.
  select coalesce(jsonb_agg(jsonb_build_object('service_id', i.service_id, 'quantity', i.quantity) order by i.position), '[]')
    into lines from public.service_order_items i where i.service_order_id = o.id;
  delete from public.service_order_items where service_order_id = o.id;
  for item in select * from jsonb_array_elements(lines) loop
    perform private.put_service_order_item(o, (item ->> 'service_id')::uuid, (item ->> 'quantity')::integer);
  end loop;
  perform private.recalc_service_order(o.id);
  -- Límite de crédito: la exposición (incluida esta OS) no lo supera.
  select * into bal from private.b2b_account_balance(g.account_id);
  if bal.credit_limit is not null and bal.exposure > bal.credit_limit then
    raise exception 'La cuenta excede su límite de crédito (disponible %)',
      to_char(greatest(bal.credit_limit - (bal.exposure - (select total from public.service_orders where id = o.id)), 0),
              'FM$999,999,990.00') using errcode = 'MG002';
  end if;
  select * into o from public.service_orders where id = o.id;
  return o;
end;
$$;

create function public.create_b2b_service_order(
  p_detail_center_id uuid,
  p_request_id uuid,
  p_account_id uuid,
  p_vehicle_id uuid,
  p_items jsonb,
  p_purchase_order text default null,
  p_bay_id uuid default null,
  p_technician_id uuid default null,
  p_observations text default null,
  p_odometer_km integer default null,
  p_promised_at timestamptz default null
) returns public.service_orders
language plpgsql security invoker set search_path = '' as $$
declare
  g public.b2b_agreements;
  acc_client uuid;
  result public.service_orders;
begin
  select * into result from public.service_orders where request_id = p_request_id;
  if found then
    return result;
  end if;
  if not private.can_use_orders(p_detail_center_id) then
    raise exception 'Sin permiso para abrir OS en este centro' using errcode = '42501';
  end if;
  g := private.b2b_agreement_for_order(p_account_id, p_detail_center_id, p_vehicle_id);
  select client_id into acc_client from public.b2b_accounts where id = p_account_id;
  result := private.insert_service_order(p_detail_center_id, p_request_id, acc_client, p_vehicle_id, 'b2b',
                                         p_purchase_order, p_items, null, p_bay_id, p_technician_id,
                                         p_observations, p_odometer_km, p_promised_at);
  result := private.link_order_to_b2b(result.id, g, p_purchase_order);
  perform private.register_client_visit(acc_client, p_detail_center_id, now());
  return result;
end;
$$;

-- Aplica la cuenta B2B a una OS abierta (p. ej. desde una cita): mismo
-- cliente de la cuenta, sin descuentos ni redenciones.
create function public.apply_b2b_account(
  p_order_id uuid,
  p_version integer,
  p_account_id uuid,
  p_purchase_order text default null
) returns public.service_orders
language plpgsql security invoker set search_path = '' as $$
declare
  o public.service_orders;
  g public.b2b_agreements;
begin
  o := private.lock_service_order(p_order_id, p_version);
  if o.status <> 'abierta' then
    raise exception 'Sólo una OS abierta se liga a una cuenta B2B' using errcode = 'MG002';
  end if;
  if o.b2b_account_id is not null then
    raise exception 'La OS ya está a cuenta de una empresa' using errcode = 'MG002';
  end if;
  if not exists (select 1 from public.b2b_accounts a where a.id = p_account_id and a.client_id = o.client_id) then
    raise exception 'La OS es de otro cliente: ábrela con la empresa y su vehículo' using errcode = 'MG002';
  end if;
  if exists (select 1 from public.service_order_discounts d where d.service_order_id = o.id and d.voided_at is null) then
    raise exception 'Anula los descuentos antes de aplicar el convenio' using errcode = 'MG002';
  end if;
  g := private.b2b_agreement_for_order(p_account_id, o.detail_center_id, o.vehicle_id);
  perform private.set_change_reason('Convenio B2B aplicado');
  return private.link_order_to_b2b(o.id, g, p_purchase_order);
end;
$$;

-- Cuentas con convenio vigente en el centro y sus vehículos autorizados (para
-- abrir OS; lo usa el operador, que no ve tarifas).
create function public.b2b_accounts_for_center(p_detail_center_id uuid)
returns table (
  account_id uuid,
  account_name text,
  client_id uuid,
  agreement_id uuid,
  agreement_name text,
  billing_model text,
  vehicle_rule text,
  ends_on date,
  vehicles jsonb
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.name, a.client_id, g.id, g.name, g.billing_model, g.vehicle_rule, g.ends_on,
         coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'make', v.make, 'model', v.model, 'year', v.year,
                                                       'plate', v.plate, 'identifier', v.identifier)
                                    order by v.plate)
                     from public.vehicles v
                    where v.client_id = a.client_id and v.active
                      and (g.vehicle_rule = 'cualquiera'
                           or exists (select 1 from public.b2b_vehicles bv
                                       where bv.account_id = a.id and bv.vehicle_id = v.id and bv.active))), '[]')
    from public.b2b_accounts a
    join public.b2b_agreements g on g.id = private.b2b_current_agreement(a.id, p_detail_center_id)
   where (private.can_use_orders(p_detail_center_id) or private.can_read_b2b(p_detail_center_id))
   order by a.name;
$$;

-- ---------------------------------------------------------------------------
-- 8. Estado de cuenta, facturación y pagos
-- ---------------------------------------------------------------------------

create function public.b2b_account_statement(p_account_id uuid)
returns table (
  consumption numeric,
  orders_to_invoice numeric,
  fees_accrued numeric,
  fees_invoiced numeric,
  to_invoice numeric,
  invoiced numeric,
  paid numeric,
  receivable numeric,
  overdue numeric,
  open_orders numeric,
  exposure numeric,
  credit_limit numeric,
  credit_available numeric
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.b2b_account_visible(p_account_id, false) then
    raise exception 'Cuenta inexistente o sin permiso' using errcode = '42501';
  end if;
  return query select * from private.b2b_account_balance(p_account_id);
end;
$$;

-- OS de la cuenta en los centros donde el usuario tiene B2B, con evidencias.
create function public.b2b_account_orders(p_account_id uuid, p_from date, p_to date)
returns table (
  id uuid,
  folio text,
  detail_center_id uuid,
  center_name text,
  status public.service_order_status,
  created_at timestamptz,
  finished_at timestamptz,
  vehicle_label text,
  purchase_order text,
  agreement_name text,
  total numeric,
  cost_total numeric,
  invoice_id uuid,
  invoice_reference text,
  evidence_count integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.b2b_account_visible(p_account_id, false) then
    raise exception 'Cuenta inexistente o sin permiso' using errcode = '42501';
  end if;
  return query
  select o.id, o.folio, o.detail_center_id, c.name, o.status, o.created_at, o.finished_at,
         o.vehicle_make || ' ' || o.vehicle_model || ' · ' || o.vehicle_plate, o.channel_reference, g.name,
         o.total, o.cost_total, o.b2b_invoice_id, i.reference,
         (select count(*)::integer from public.service_order_evidence e
           where e.service_order_id = o.id and e.deleted_at is null)
    from public.service_orders o
    join public.detail_centers c on c.id = o.detail_center_id
    left join public.b2b_agreements g on g.id = o.b2b_agreement_id
    left join public.b2b_invoices i on i.id = o.b2b_invoice_id
   where o.b2b_account_id = p_account_id
     and private.can_read_b2b(o.detail_center_id)
     and (o.created_at at time zone c.timezone)::date between p_from and p_to
   order by o.created_at desc
   limit 500;
end;
$$;

create function public.create_b2b_invoice(
  p_account_id uuid,
  p_request_id uuid,
  p_reference text,
  p_issued_on date,
  p_order_ids uuid[],
  p_fee_amount numeric,
  p_notes text
) returns public.b2b_invoices
language plpgsql security definer set search_path = '' as $$
declare
  acc public.b2b_accounts;
  bal record;
  v_orders numeric;
  terms smallint;
  result public.b2b_invoices;
begin
  select * into acc from public.b2b_accounts where id = p_account_id for update;
  if not found or not private.can_bill_b2b(acc.home_detail_center_id) then
    raise exception 'Cuenta inexistente o sin permiso para facturar' using errcode = '42501';
  end if;
  select * into result from public.b2b_invoices where organization_id = acc.organization_id and request_id = p_request_id;
  if found then
    return result;
  end if;
  if exists (select 1 from unnest(coalesce(p_order_ids, '{}')) x
              where not exists (select 1 from public.service_orders o
                                 where o.id = x and o.b2b_account_id = acc.id and o.status = 'entregada'
                                   and o.b2b_invoice_id is null)) then
    raise exception 'Sólo se facturan OS entregadas de la cuenta y sin corte' using errcode = 'MG002';
  end if;
  select * into bal from private.b2b_account_balance(acc.id);
  if coalesce(p_fee_amount, 0) > greatest(0, bal.fees_accrued - bal.fees_invoiced) then
    raise exception 'La cuota facturada supera la devengada pendiente' using errcode = 'MG002';
  end if;
  select coalesce(sum(o.total), 0) into v_orders from public.service_orders o where o.id = any (p_order_ids);
  select g.payment_terms_days into terms from public.b2b_agreements g
   where g.account_id = acc.id order by (g.status = 'activo') desc, g.starts_on desc limit 1;
  perform private.set_change_reason('Corte de facturación ' || btrim(p_reference));
  insert into public.b2b_invoices (organization_id, account_id, reference, issued_on, due_on, orders_amount, fee_amount,
    notes, request_id)
  values (acc.organization_id, acc.id, btrim(p_reference), p_issued_on, p_issued_on + coalesce(terms, 0), v_orders,
    coalesce(p_fee_amount, 0), nullif(btrim(p_notes), ''), p_request_id)
  returning * into result;
  perform set_config('app.b2b_invoice', 'on', true);
  update public.service_orders set b2b_invoice_id = result.id where id = any (p_order_ids);
  perform set_config('app.b2b_invoice', 'off', true);
  return result;
exception
  when unique_violation then
    raise exception 'Ya existe un corte con esa referencia' using errcode = 'MG002';
  when check_violation then
    raise exception 'El corte debe tener importe' using errcode = '22023';
end;
$$;

create function public.void_b2b_invoice(p_invoice_id uuid, p_reason text) returns public.b2b_invoices
language plpgsql security definer set search_path = '' as $$
declare
  result public.b2b_invoices;
begin
  perform private.set_change_reason(p_reason);
  select * into result from public.b2b_invoices where id = p_invoice_id for update;
  if not found or not private.b2b_account_billable(result.account_id) then
    raise exception 'Corte inexistente o sin permiso' using errcode = '42501';
  end if;
  if result.status = 'anulada' then
    return result;
  end if;
  if exists (select 1 from public.b2b_payments p where p.invoice_id = result.id and p.voided_at is null) then
    raise exception 'El corte tiene pagos aplicados; anúlalos primero' using errcode = 'MG002';
  end if;
  perform set_config('app.b2b_invoice', 'on', true);
  update public.service_orders set b2b_invoice_id = null where b2b_invoice_id = result.id;
  perform set_config('app.b2b_invoice', 'off', true);
  update public.b2b_invoices set status = 'anulada', void_reason = btrim(p_reason) where id = result.id
  returning * into result;
  return result;
end;
$$;

create function public.record_b2b_payment(
  p_account_id uuid,
  p_request_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_paid_on date,
  p_invoice_id uuid default null
) returns public.b2b_payments
language plpgsql security definer set search_path = '' as $$
declare
  acc public.b2b_accounts;
  bal record;
  result public.b2b_payments;
begin
  select * into acc from public.b2b_accounts where id = p_account_id for update;
  if not found or not private.can_bill_b2b(acc.home_detail_center_id) then
    raise exception 'Cuenta inexistente o sin permiso para registrar pagos' using errcode = '42501';
  end if;
  select * into result from public.b2b_payments where organization_id = acc.organization_id and request_id = p_request_id;
  if found then
    return result;
  end if;
  if p_invoice_id is not null
     and not exists (select 1 from public.b2b_invoices i where i.id = p_invoice_id and i.account_id = acc.id
                                                          and i.status = 'emitida') then
    raise exception 'Corte inexistente o anulado' using errcode = 'MG002';
  end if;
  select * into bal from private.b2b_account_balance(acc.id);
  if p_amount is null or p_amount <= 0 or p_amount > bal.receivable then
    raise exception 'El pago debe ser mayor que 0 y no superar el saldo por cobrar (%)',
      to_char(bal.receivable, 'FM$999,999,990.00') using errcode = 'MG002';
  end if;
  perform private.set_change_reason('Pago B2B');
  insert into public.b2b_payments (organization_id, account_id, invoice_id, amount, method, reference, paid_on, request_id)
  values (acc.organization_id, acc.id, p_invoice_id, p_amount, p_method, nullif(btrim(p_reference), ''),
    coalesce(p_paid_on, private.center_today(acc.home_detail_center_id)), p_request_id)
  returning * into result;
  return result;
exception
  when check_violation then
    raise exception 'Forma de pago inválida' using errcode = '22023';
end;
$$;

create function public.void_b2b_payment(p_payment_id uuid, p_reason text) returns public.b2b_payments
language plpgsql security definer set search_path = '' as $$
declare
  result public.b2b_payments;
begin
  perform private.set_change_reason(p_reason);
  select * into result from public.b2b_payments where id = p_payment_id for update;
  if not found or not private.b2b_account_billable(result.account_id) then
    raise exception 'Pago inexistente o sin permiso' using errcode = '42501';
  end if;
  if result.voided_at is null then
    update public.b2b_payments set voided_at = now(), void_reason = btrim(p_reason) where id = result.id
    returning * into result;
  end if;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Rentabilidad (hechos sin datos personales; fórmulas en @meguiars/analytics)
-- ---------------------------------------------------------------------------

-- Por cuenta y centro: OS terminadas o entregadas en el rango (ingreso = total,
-- costo = costo directo congelado) y cuotas devengadas, asignadas al centro gestor.
create function public.b2b_profitability_facts(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  account_id uuid,
  account_name text,
  detail_center_id uuid,
  orders integer,
  revenue numeric,
  cost numeric,
  fee_revenue numeric
)
language sql stable security definer set search_path = '' as $$
  with centers as (
    select c from unnest(p_detail_center_ids) c where private.can_read_b2b(c)
  ), os as (
    select o.b2b_account_id as account_id, o.detail_center_id, count(*)::integer as orders,
           sum(o.total) as revenue, sum(o.cost_total) as cost
      from public.service_orders o
      join public.detail_centers dc on dc.id = o.detail_center_id
     where o.b2b_account_id is not null and o.detail_center_id in (select c from centers)
       and o.status in ('terminada', 'entregada')
       and (o.finished_at at time zone dc.timezone)::date between p_from and p_to
     group by o.b2b_account_id, o.detail_center_id
  ), fees as (
    select a.id as account_id, a.home_detail_center_id as detail_center_id,
           sum(private.b2b_fee_accrued(g.billing_model, g.fee_amount, g.starts_on, g.ends_on, p_from,
                                       least(p_to, private.center_today(a.home_detail_center_id)))) as fee_revenue
      from public.b2b_accounts a join public.b2b_agreements g on g.account_id = a.id
     where a.home_detail_center_id in (select c from centers)
     group by a.id, a.home_detail_center_id
  ), keys as (
    select account_id, detail_center_id from os
    union
    select account_id, detail_center_id from fees where fee_revenue > 0
  )
  select k.account_id, a.name, k.detail_center_id, coalesce(os.orders, 0), coalesce(os.revenue, 0),
         coalesce(os.cost, 0), coalesce(fees.fee_revenue, 0)
    from keys k
    join public.b2b_accounts a on a.id = k.account_id
    left join os on os.account_id = k.account_id and os.detail_center_id = k.detail_center_id
    left join fees on fees.account_id = k.account_id and fees.detail_center_id = k.detail_center_id
   order by a.name, k.detail_center_id;
$$;

-- ---------------------------------------------------------------------------
-- 10. Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.can_read_b2b(uuid)',
    'private.can_manage_b2b(uuid)',
    'private.can_bill_b2b(uuid)',
    'private.b2b_agreement_state(text, date, date, date)',
    'private.b2b_fee_accrued(text, numeric, date, date, date, date)',
    'private.b2b_current_agreement(uuid, uuid)',
    'private.b2b_line_price(uuid, uuid, numeric, integer)',
    'private.b2b_rule_kind(uuid)',
    'private.b2b_account_balance(uuid)',
    'private.b2b_account_visible(uuid, boolean)',
    'private.b2b_account_manageable(uuid)',
    'private.b2b_account_billable(uuid)',
    'private.b2b_agreement_for_order(uuid, uuid, uuid)',
    'private.link_order_to_b2b(uuid, public.b2b_agreements, text)',
    'private.guard_service_order_b2b()',
    'private.guard_b2b_discount()'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.upsert_b2b_account(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text)',
    'public.upsert_b2b_contact(uuid, uuid, text, text, text, text, boolean, boolean, text)',
    'public.upsert_b2b_agreement(uuid, uuid, uuid, text, text, date, date, text, text, smallint, numeric, numeric, integer, uuid[], text, text)',
    'public.set_b2b_price_rule(uuid, uuid, uuid, text, numeric, integer, boolean, text, text)',
    'public.set_b2b_vehicle(uuid, uuid, boolean, text, text, text, text)',
    'public.create_b2b_service_order(uuid, uuid, uuid, uuid, jsonb, text, uuid, uuid, text, integer, timestamptz)',
    'public.apply_b2b_account(uuid, integer, uuid, text)',
    'public.b2b_accounts_for_center(uuid)',
    'public.b2b_account_statement(uuid)',
    'public.b2b_account_orders(uuid, date, date)',
    'public.create_b2b_invoice(uuid, uuid, text, date, uuid[], numeric, text)',
    'public.void_b2b_invoice(uuid, text)',
    'public.record_b2b_payment(uuid, uuid, numeric, text, text, date, uuid)',
    'public.void_b2b_payment(uuid, text)',
    'public.b2b_profitability_facts(uuid[], date, date)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
