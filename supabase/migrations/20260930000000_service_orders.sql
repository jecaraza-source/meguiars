-- O4 — Operación / Orden de Servicio digital (núcleo).
--
-- La OS es el eje operacional: conecta recepción (cita o walk-in), ejecución
-- (bahía, técnico, tiempos), cobro, costos, recomendaciones y próxima visita.
--
-- * service_orders: una OS pertenece a un centro; folio legible y único por
--   centro (CDMX-01-000123); snapshot de cliente y vehículo; totales, costo y
--   minutos estimados calculados en la base; versión para edición concurrente.
-- * service_order_items: líneas de servicio/producto con precio, costo,
--   duración y motor congelados al venderse (nunca se vuelven a leer del
--   catálogo; un trigger impide cambiarlos).
-- * service_order_discounts: por línea o por OS, con motivo y nivel de
--   autorización según el % acumulado (operador ≤ 10 %, encargado ≤ 30 %,
--   admin > 30 %). Se anulan con motivo; no se borran.
-- * service_order_status_history: cada cambio de estatus con actor y motivo.
-- * Estatus con transiciones válidas (espejo en packages/domain/src/orders) y
--   reglas de autorización y entrega por canal (b2c, membresía, b2b).
-- * Interfaces mínimas para módulos futuros: paid_amount /
--   record_service_order_payment (pagos), channel_reference y b2b_account_id
--   (membresías y cuentas B2B). Consumo de inventario y redenciones se
--   vincularán con service_order_items.id.
--
-- Escrituras sólo por RPC con motivo y auditoría. Compatible hacia atrás.

create type public.service_order_status as enum
  ('abierta', 'autorizada', 'en_proceso', 'pausada', 'terminada', 'entregada', 'cancelada');

-- Canal de venta: define las reglas para autorizar y entregar.
create type public.sales_channel as enum ('b2c', 'membresia', 'b2b');

-- Nivel de autorización de descuentos (ordenado: operador < encargado < admin).
create type public.discount_level as enum ('operador', 'encargado', 'admin');

-- ---------------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------------

create table public.service_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  -- Folio legible, único por centro: <código del centro>-<consecutivo de 6 dígitos>.
  folio text not null,
  folio_number integer not null check (folio_number > 0),
  appointment_id uuid unique,
  client_id uuid not null,
  vehicle_id uuid not null,
  channel public.sales_channel not null default 'b2c',
  -- Número de membresía (membresía) u orden de compra (B2B). Obligatorio para autorizar esos canales.
  channel_reference text check (channel_reference is null or length(channel_reference) between 1 and 80),
  -- Cuenta B2B (el FK llega con el módulo Comercial).
  b2b_account_id uuid,
  status public.service_order_status not null default 'abierta',
  -- Concurrencia optimista: cada cambio la incrementa; las RPC exigen la versión leída.
  version integer not null default 1,
  -- Snapshot del cliente y del vehículo al abrir la OS.
  client_name text not null,
  client_phone text,
  client_email text,
  vehicle_make text not null,
  vehicle_model text not null,
  vehicle_year smallint not null,
  vehicle_plate text not null,
  odometer_km integer check (odometer_km is null or odometer_km between 0 and 2000000),
  bay_id uuid,
  technician_id uuid,
  diagnosis text check (diagnosis is null or length(diagnosis) <= 4000),
  observations text check (observations is null or length(observations) <= 4000),
  recommendations text check (recommendations is null or length(recommendations) <= 4000),
  next_visit_on date,
  next_visit_service_id uuid,
  next_visit_notes text check (next_visit_notes is null or length(next_visit_notes) <= 1000),
  -- Totales (MXN, IVA incluido): los calcula private.recalc_service_order.
  subtotal numeric(12, 2) not null default 0,
  discount_total numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  cost_total numeric(12, 2) not null default 0,
  estimated_minutes integer not null default 0,
  -- Cobrado (interfaz mínima para el módulo de pagos).
  paid_amount numeric(12, 2) not null default 0 check (paid_amount >= 0),
  -- Autorización del cliente.
  authorized_at timestamptz,
  authorized_by uuid references auth.users (id) on delete set null,
  authorized_total numeric(12, 2),
  promised_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  -- Tiempo real: minutos trabajados (sin pausas) y el inicio del tramo en curso.
  work_started_at timestamptz,
  worked_minutes integer not null default 0,
  request_id uuid not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, request_id),
  unique (detail_center_id, folio_number),
  unique (detail_center_id, folio),
  check (total = subtotal - discount_total and total >= 0),
  foreign key (organization_id, detail_center_id)
    references public.detail_centers (organization_id, id) on delete restrict,
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete restrict,
  foreign key (organization_id, vehicle_id) references public.vehicles (organization_id, id) on delete restrict,
  foreign key (organization_id, appointment_id) references public.appointments (organization_id, id) on delete restrict,
  foreign key (detail_center_id, bay_id) references public.bays (detail_center_id, id) on delete restrict,
  foreign key (detail_center_id, technician_id) references public.technicians (detail_center_id, id) on delete restrict,
  foreign key (organization_id, next_visit_service_id) references public.services (organization_id, id) on delete restrict
);

create table public.service_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  service_order_id uuid not null,
  position smallint not null default 0,
  kind text not null check (kind in ('servicio', 'producto')),
  -- Congelados al venderse (ADR 0009): nunca se vuelven a leer del catálogo.
  service_id uuid not null,
  service_code text not null,
  service_name text not null,
  revenue_engine public.revenue_engine not null,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  unit_direct_cost numeric(12, 2) not null check (unit_direct_cost >= 0),
  duration_minutes integer not null check (duration_minutes >= 0),
  price_source text not null check (price_source in ('base', 'center')),
  quantity integer not null check (quantity between 1 and 99),
  line_subtotal numeric(12, 2) generated always as (round(quantity * unit_price, 2)) stored,
  line_discount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_order_id, service_id),
  unique (service_order_id, id),
  foreign key (organization_id, service_order_id) references public.service_orders (organization_id, id) on delete cascade,
  foreign key (organization_id, service_id) references public.services (organization_id, id) on delete restrict
);

create table public.service_order_discounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  service_order_id uuid not null,
  -- null = descuento sobre la OS (después de los descuentos por línea).
  item_id uuid,
  kind text not null check (kind in ('percent', 'amount')),
  value numeric(12, 2) not null check (value > 0 and (kind <> 'percent' or value <= 100)),
  -- Importe aplicado (lo calcula private.recalc_service_order).
  amount numeric(12, 2) not null default 0,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  -- Nivel exigido por el % acumulado de la OS al aplicarlo, y quién lo autorizó.
  authorization_level public.discount_level not null,
  authorized_by uuid default auth.uid() references auth.users (id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((voided_at is null) = (void_reason is null)),
  foreign key (organization_id, service_order_id) references public.service_orders (organization_id, id) on delete cascade,
  foreign key (service_order_id, item_id) references public.service_order_items (service_order_id, id) on delete cascade
);

create table public.service_order_status_history (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  detail_center_id uuid not null,
  service_order_id uuid not null,
  from_status public.service_order_status,
  to_status public.service_order_status not null,
  reason text,
  actor_id uuid references auth.users (id) on delete set null,
  occurred_at timestamptz not null default clock_timestamp(),
  foreign key (organization_id, service_order_id) references public.service_orders (organization_id, id) on delete cascade
);

-- Consecutivo de folios por centro (fuera de la API: esquema private).
create table private.service_order_counters (
  detail_center_id uuid primary key references public.detail_centers (id) on delete cascade,
  last_number integer not null
);
revoke all on private.service_order_counters from public, anon, authenticated;

-- La cita apunta a su OS (el vínculo se preparó en O3).
alter table public.appointments
  add constraint appointments_service_order_fk foreign key (organization_id, service_order_id)
  references public.service_orders (organization_id, id) on delete restrict;

create index service_orders_center_created_idx on public.service_orders (detail_center_id, created_at desc);
create index service_orders_center_status_idx on public.service_orders (detail_center_id, status);
create index service_orders_client_idx on public.service_orders (client_id);
create index service_orders_vehicle_idx on public.service_orders (vehicle_id);
create index service_orders_plate_idx on public.service_orders (detail_center_id, vehicle_plate);
create index service_orders_bay_idx on public.service_orders (bay_id) where bay_id is not null;
create index service_orders_technician_idx on public.service_orders (technician_id) where technician_id is not null;
create index service_orders_next_visit_idx on public.service_orders (detail_center_id, next_visit_on)
  where next_visit_on is not null;
create index service_orders_next_visit_service_idx on public.service_orders (next_visit_service_id)
  where next_visit_service_id is not null;
create index service_order_items_order_idx on public.service_order_items (service_order_id, position);
create index service_order_items_service_idx on public.service_order_items (service_id);
create index service_order_discounts_order_idx on public.service_order_discounts (service_order_id);
create index service_order_discounts_item_idx on public.service_order_discounts (item_id) where item_id is not null;
create index service_order_status_history_order_idx on public.service_order_status_history (service_order_id, occurred_at);

-- ---------------------------------------------------------------------------
-- 2. Triggers: versión, identidad, precios congelados, historial y auditoría
-- ---------------------------------------------------------------------------

create function private.bump_service_order_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

-- Centro, cliente, vehículo, folio, cita, snapshot y llave de idempotencia no cambian.
create function private.keep_service_order_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.organization_id, new.detail_center_id, new.folio, new.folio_number, new.appointment_id, new.client_id,
      new.vehicle_id, new.client_name, new.client_phone, new.client_email, new.vehicle_make, new.vehicle_model,
      new.vehicle_year, new.vehicle_plate, new.request_id, new.created_by, new.created_at)
     is distinct from
     (old.organization_id, old.detail_center_id, old.folio, old.folio_number, old.appointment_id, old.client_id,
      old.vehicle_id, old.client_name, old.client_phone, old.client_email, old.vehicle_make, old.vehicle_model,
      old.vehicle_year, old.vehicle_plate, old.request_id, old.created_by, old.created_at) then
    raise exception 'El folio, el centro, el cliente y el vehículo de una OS no cambian' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- Precio, costo, duración y motor de una línea quedan congelados.
create function private.keep_service_order_item_frozen() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.organization_id, new.service_order_id, new.kind, new.service_id, new.service_code, new.service_name,
      new.revenue_engine, new.unit_price, new.unit_direct_cost, new.duration_minutes, new.price_source)
     is distinct from
     (old.organization_id, old.service_order_id, old.kind, old.service_id, old.service_code, old.service_name,
      old.revenue_engine, old.unit_price, old.unit_direct_cost, old.duration_minutes, old.price_source) then
    raise exception 'El precio y los datos congelados de una línea no cambian' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- Historial de estatus (security definer: nadie lo escribe directamente).
create function private.record_service_order_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.service_order_status_history
      (organization_id, detail_center_id, service_order_id, from_status, to_status, reason, actor_id)
    values (
      new.organization_id, new.detail_center_id, new.id,
      case when tg_op = 'UPDATE' then old.status end, new.status,
      nullif(current_setting('app.change_reason', true), ''), auth.uid()
    );
  end if;
  return null;
end;
$$;

create trigger service_orders_version before update on public.service_orders
  for each row execute function private.bump_service_order_version();
create trigger service_orders_identity before update on public.service_orders
  for each row execute function private.keep_service_order_identity();
create trigger service_order_items_frozen before update on public.service_order_items
  for each row execute function private.keep_service_order_item_frozen();
create trigger service_orders_status_history after insert or update of status on public.service_orders
  for each row execute function private.record_service_order_status();

create trigger service_orders_updated_at before update on public.service_orders
  for each row execute function private.set_updated_at();
create trigger service_order_items_updated_at before update on public.service_order_items
  for each row execute function private.set_updated_at();
create trigger service_order_discounts_updated_at before update on public.service_order_discounts
  for each row execute function private.set_updated_at();

create trigger service_orders_require_reason before insert or update or delete on public.service_orders
  for each row execute function private.require_change_reason();
create trigger service_order_items_require_reason before insert or update or delete on public.service_order_items
  for each row execute function private.require_change_reason();
create trigger service_order_discounts_require_reason before insert or update or delete on public.service_order_discounts
  for each row execute function private.require_change_reason();

create trigger service_orders_audit after insert or update or delete on public.service_orders
  for each row execute function private.audit_row();
create trigger service_order_items_audit after insert or update or delete on public.service_order_items
  for each row execute function private.audit_row();
create trigger service_order_discounts_audit after insert or update or delete on public.service_order_discounts
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- 3. Autorización y reglas (espejo de packages/domain/src/orders)
-- ---------------------------------------------------------------------------

-- orders.read / orders.write
create function private.can_use_orders(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(
    p_detail_center_id, array['admin_socio', 'encargado', 'operador_recepcion']::public.app_role[]
  );
$$;

-- orders.manage: cancelar una OS autorizada o pausada.
create function private.can_manage_orders(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(p_detail_center_id, array['admin_socio', 'encargado']::public.app_role[]);
$$;

-- Nivel de descuento que el usuario puede autorizar en el centro (null = ninguno).
create function private.discount_level_of(p_detail_center_id uuid) returns public.discount_level
language sql stable security definer set search_path = '' as $$
  select case
    when private.has_center_role(p_detail_center_id, array['admin_socio']::public.app_role[]) then 'admin'
    when private.has_center_role(p_detail_center_id, array['encargado']::public.app_role[]) then 'encargado'
    when private.has_center_role(p_detail_center_id, array['operador_recepcion']::public.app_role[]) then 'operador'
  end::public.discount_level;
$$;

-- Nivel exigido por el % de descuento acumulado de la OS (espejo de DISCOUNT_LEVEL_LIMITS).
create function private.discount_required_level(p_percent numeric) returns public.discount_level
language sql immutable set search_path = '' as $$
  select case
    when p_percent <= 10 then 'operador'
    when p_percent <= 30 then 'encargado'
    else 'admin'
  end::public.discount_level;
$$;

-- Transiciones válidas (espejo de SERVICE_ORDER_TRANSITIONS en el dominio).
create function private.service_order_transition_allowed(
  p_from public.service_order_status,
  p_to public.service_order_status
) returns boolean
language sql immutable set search_path = '' as $$
  select (p_from, p_to) in (
    ('abierta'::public.service_order_status, 'autorizada'::public.service_order_status),
    ('abierta', 'cancelada'),
    ('autorizada', 'en_proceso'),
    ('autorizada', 'cancelada'),
    ('en_proceso', 'pausada'),
    ('en_proceso', 'terminada'),
    ('pausada', 'en_proceso'),
    ('pausada', 'cancelada'),
    ('terminada', 'entregada')
  );
$$;

-- Qué impide autorizar (null = nada). Espejo de authorizationBlocker().
create function private.service_order_authorization_blocker(o public.service_orders) returns text
language sql stable set search_path = '' as $$
  select case
    when not exists (select 1 from public.service_order_items i where i.service_order_id = o.id)
      then 'Agrega al menos una línea antes de autorizar'
    when o.channel in ('membresia', 'b2b') and o.channel_reference is null
      then case o.channel when 'membresia' then 'Captura el número de membresía'
                          else 'Captura la orden de compra del cliente B2B' end
  end;
$$;

-- Qué impide entregar (null = nada). Espejo de deliveryBlocker(): b2c y
-- membresía exigen el saldo cobrado; B2B se factura a la cuenta con su orden de compra.
create function private.service_order_delivery_blocker(o public.service_orders) returns text
language sql immutable set search_path = '' as $$
  select case
    when o.channel in ('b2c', 'membresia') and o.paid_amount < o.total
      then 'Hay saldo pendiente: registra el cobro antes de entregar'
    when o.channel = 'b2b' and o.channel_reference is null
      then 'Captura la orden de compra del cliente B2B'
  end;
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

alter table public.service_orders enable row level security;
alter table public.service_order_items enable row level security;
alter table public.service_order_discounts enable row level security;
alter table public.service_order_status_history enable row level security;
alter table private.service_order_counters enable row level security;

create policy service_orders_select on public.service_orders
  for select to authenticated using (private.can_use_orders(detail_center_id));
create policy service_orders_insert on public.service_orders
  for insert to authenticated with check (private.can_use_orders(detail_center_id));
create policy service_orders_update on public.service_orders for update to authenticated
  using (private.can_use_orders(detail_center_id)) with check (private.can_use_orders(detail_center_id));

create policy service_order_items_select on public.service_order_items
  for select to authenticated using (exists (select 1 from public.service_orders o where o.id = service_order_id));
create policy service_order_items_insert on public.service_order_items
  for insert to authenticated with check (exists (select 1 from public.service_orders o where o.id = service_order_id));
create policy service_order_items_update on public.service_order_items for update to authenticated
  using (exists (select 1 from public.service_orders o where o.id = service_order_id))
  with check (exists (select 1 from public.service_orders o where o.id = service_order_id));
create policy service_order_items_delete on public.service_order_items
  for delete to authenticated using (exists (select 1 from public.service_orders o where o.id = service_order_id));

create policy service_order_discounts_select on public.service_order_discounts
  for select to authenticated using (exists (select 1 from public.service_orders o where o.id = service_order_id));
create policy service_order_discounts_insert on public.service_order_discounts
  for insert to authenticated with check (exists (select 1 from public.service_orders o where o.id = service_order_id));
create policy service_order_discounts_update on public.service_order_discounts for update to authenticated
  using (exists (select 1 from public.service_orders o where o.id = service_order_id))
  with check (exists (select 1 from public.service_orders o where o.id = service_order_id));

create policy service_order_status_history_select on public.service_order_status_history
  for select to authenticated using (private.can_use_orders(detail_center_id));

-- Sin borrado físico de OS ni descuentos (se cancelan / anulan); el historial es de sólo lectura.
revoke all on public.service_orders, public.service_order_items, public.service_order_discounts,
  public.service_order_status_history from anon;
revoke delete, truncate on public.service_orders, public.service_order_discounts from authenticated;
revoke truncate on public.service_order_items from authenticated;
revoke insert, update, delete, truncate on public.service_order_status_history from authenticated;

-- ---------------------------------------------------------------------------
-- 5. Cálculo de totales (única fuente de verdad; espejo en computeOrderTotals)
-- ---------------------------------------------------------------------------

-- Línea: subtotal = cantidad × precio; descuentos de la línea (topados al subtotal).
-- OS: base = subtotal − descuentos por línea; descuentos de la OS sobre la base
-- (topados); total = subtotal − descuentos. Costo = Σ cantidad × costo congelado.
create function private.recalc_service_order(p_order_id uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_subtotal numeric(12, 2);
  v_line_discount numeric(12, 2);
  v_order_discount numeric(12, 2);
  v_cost numeric(12, 2);
  v_minutes integer;
begin
  update public.service_order_discounts d
     set amount = case when d.kind = 'percent' then round(i.line_subtotal * d.value / 100, 2) else d.value end
    from public.service_order_items i
   where d.service_order_id = p_order_id and d.item_id = i.id and d.voided_at is null
     and d.amount is distinct from
         case when d.kind = 'percent' then round(i.line_subtotal * d.value / 100, 2) else d.value end;

  update public.service_order_items i
     set line_discount = x.discount
    from (
      select it.id, least(it.line_subtotal, coalesce(sum(d.amount) filter (where d.voided_at is null), 0)) as discount
      from public.service_order_items it
      left join public.service_order_discounts d on d.item_id = it.id
      where it.service_order_id = p_order_id
      group by it.id, it.line_subtotal
    ) x
   where i.id = x.id and i.line_discount is distinct from x.discount;

  select coalesce(sum(line_subtotal), 0), coalesce(sum(line_discount), 0),
         coalesce(sum(round(quantity * unit_direct_cost, 2)), 0), coalesce(sum(quantity * duration_minutes), 0)
    into v_subtotal, v_line_discount, v_cost, v_minutes
    from public.service_order_items where service_order_id = p_order_id;

  update public.service_order_discounts d
     set amount = case when d.kind = 'percent' then round((v_subtotal - v_line_discount) * d.value / 100, 2)
                       else d.value end
   where d.service_order_id = p_order_id and d.item_id is null and d.voided_at is null
     and d.amount is distinct from
         case when d.kind = 'percent' then round((v_subtotal - v_line_discount) * d.value / 100, 2) else d.value end;

  select least(v_subtotal - v_line_discount, coalesce(sum(amount), 0)) into v_order_discount
    from public.service_order_discounts
   where service_order_id = p_order_id and item_id is null and voided_at is null;

  update public.service_orders
     set subtotal = v_subtotal,
         discount_total = v_line_discount + v_order_discount,
         total = v_subtotal - v_line_discount - v_order_discount,
         cost_total = v_cost,
         estimated_minutes = v_minutes
   where id = p_order_id
     and (subtotal, discount_total, total, cost_total, estimated_minutes)
         is distinct from (v_subtotal, v_line_discount + v_order_discount,
                           v_subtotal - v_line_discount - v_order_discount, v_cost, v_minutes);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Helpers de las RPC (security invoker: todo bajo RLS del usuario)
-- ---------------------------------------------------------------------------

-- Bloquea la OS y verifica la versión leída por el cliente (web o móvil).
create function private.lock_service_order(p_id uuid, p_version integer) returns public.service_orders
language plpgsql set search_path = '' as $$
declare
  o public.service_orders;
begin
  select * into o from public.service_orders where id = p_id for update;
  if not found then
    raise exception 'OS inexistente o sin permiso' using errcode = '42501';
  end if;
  if p_version is distinct from o.version then
    raise exception 'La OS cambió en otro dispositivo; recarga para ver la versión actual' using errcode = '40001';
  end if;
  return o;
end;
$$;

-- Siguiente folio del centro. El upsert bloquea la fila del contador: dos
-- altas simultáneas nunca obtienen el mismo número.
create function private.next_service_order_number(p_detail_center_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if not private.can_use_orders(p_detail_center_id) then
    raise exception 'Sin permiso para abrir OS en este centro' using errcode = '42501';
  end if;
  insert into private.service_order_counters (detail_center_id, last_number)
  values (p_detail_center_id, 1)
  on conflict (detail_center_id) do update set last_number = private.service_order_counters.last_number + 1
  returning last_number into n;
  return n;
end;
$$;

create function private.check_order_resources(p_detail_center_id uuid, p_bay_id uuid, p_technician_id uuid)
returns void
language plpgsql set search_path = '' as $$
begin
  if p_bay_id is not null and not exists (
    select 1 from public.bays b where b.id = p_bay_id and b.detail_center_id = p_detail_center_id and b.active) then
    raise exception 'Bahía inexistente o inactiva en este centro' using errcode = '22023';
  end if;
  if p_technician_id is not null and not exists (
    select 1 from public.technicians t where t.id = p_technician_id and t.detail_center_id = p_detail_center_id and t.active) then
    raise exception 'Técnico inexistente o inactivo en este centro' using errcode = '22023';
  end if;
end;
$$;

-- Agrega o cambia la cantidad de una línea. Una línea nueva congela el precio
-- vigente del centro; una existente conserva su precio congelado.
create function private.put_service_order_item(o public.service_orders, p_service_id uuid, p_quantity integer)
returns void
language plpgsql set search_path = '' as $$
declare
  cat record;
begin
  if p_quantity is null or p_quantity not between 0 and 99 then
    raise exception 'Cantidad inválida (0 a 99)' using errcode = '22023';
  end if;
  if p_quantity = 0 then
    delete from public.service_order_items where service_order_id = o.id and service_id = p_service_id;
    return;
  end if;
  update public.service_order_items set quantity = p_quantity
   where service_order_id = o.id and service_id = p_service_id;
  if found then
    return;
  end if;
  select * into cat from public.center_catalog(o.detail_center_id) c where c.id = p_service_id;
  if not found then
    raise exception 'El servicio no está disponible en este centro' using errcode = '22023';
  end if;
  insert into public.service_order_items (
    organization_id, service_order_id, position, kind, service_id, service_code, service_name, revenue_engine,
    unit_price, unit_direct_cost, duration_minutes, price_source, quantity
  ) values (
    o.organization_id, o.id,
    (select coalesce(max(position) + 1, 0) from public.service_order_items where service_order_id = o.id),
    case when cat.revenue_engine = 'producto_complemento' then 'producto' else 'servicio' end,
    cat.id, cat.code, cat.name, cat.revenue_engine, cat.price, cat.direct_cost, cat.standard_duration_minutes,
    cat.price_source, p_quantity
  );
end;
$$;

-- Alta común (walk-in o desde cita). Idempotente por request_id.
create function private.insert_service_order(
  p_detail_center_id uuid,
  p_request_id uuid,
  p_client_id uuid,
  p_vehicle_id uuid,
  p_channel public.sales_channel,
  p_channel_reference text,
  p_items jsonb,
  p_appointment_id uuid,
  p_bay_id uuid,
  p_technician_id uuid,
  p_observations text,
  p_odometer_km integer,
  p_promised_at timestamptz
) returns public.service_orders
language plpgsql set search_path = '' as $$
declare
  org uuid;
  center_code text;
  n integer;
  cli record;
  veh record;
  item jsonb;
  result public.service_orders;
begin
  if not private.can_use_orders(p_detail_center_id) then
    raise exception 'Sin permiso para abrir OS en este centro' using errcode = '42501';
  end if;
  select c.organization_id, c.code into org, center_code from public.detail_centers c where c.id = p_detail_center_id;
  select * into result from public.service_orders where organization_id = org and request_id = p_request_id;
  if found then
    return result;
  end if;
  select c.full_name, c.phone, c.email into cli from public.clients c where c.id = p_client_id and c.active;
  if not found then
    raise exception 'Cliente inexistente o no visible desde tus centros' using errcode = '22023';
  end if;
  select v.make, v.model, v.year, v.plate into veh
    from public.vehicles v where v.id = p_vehicle_id and v.client_id = p_client_id and v.active;
  if not found then
    raise exception 'El vehículo no pertenece al cliente o está dado de baja' using errcode = '22023';
  end if;
  perform private.check_order_resources(p_detail_center_id, p_bay_id, p_technician_id);
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Agrega al menos un servicio o producto' using errcode = '22023';
  end if;

  perform private.set_change_reason(case when p_appointment_id is null then 'OS walk-in' else 'OS desde cita' end);
  -- El cliente queda vinculado al centro donde se atiende (visibilidad, O1).
  insert into public.client_centers (client_id, detail_center_id, organization_id)
  values (p_client_id, p_detail_center_id, org)
  on conflict (client_id, detail_center_id) do nothing;

  n := private.next_service_order_number(p_detail_center_id);
  insert into public.service_orders (
    organization_id, detail_center_id, folio, folio_number, appointment_id, client_id, vehicle_id, channel,
    channel_reference, client_name, client_phone, client_email, vehicle_make, vehicle_model, vehicle_year,
    vehicle_plate, odometer_km, bay_id, technician_id, observations, promised_at, request_id
  ) values (
    org, p_detail_center_id, center_code || '-' || lpad(n::text, 6, '0'), n, p_appointment_id, p_client_id,
    p_vehicle_id, coalesce(p_channel, 'b2c'), nullif(btrim(p_channel_reference), ''), cli.full_name, cli.phone,
    cli.email, veh.make, veh.model, veh.year, veh.plate, p_odometer_km, p_bay_id, p_technician_id,
    nullif(btrim(p_observations), ''), p_promised_at, p_request_id
  ) returning * into result;

  for item in select * from jsonb_array_elements(p_items) loop
    if coalesce((item ->> 'quantity')::integer, 1) not between 1 and 99 then
      raise exception 'Cantidad inválida (1 a 99)' using errcode = '22023';
    end if;
    if exists (select 1 from public.service_order_items
                where service_order_id = result.id and service_id = (item ->> 'service_id')::uuid) then
      raise exception 'Servicio repetido: usa la cantidad' using errcode = '22023';
    end if;
    perform private.put_service_order_item(result, (item ->> 'service_id')::uuid,
                                           coalesce((item ->> 'quantity')::integer, 1));
  end loop;
  perform private.recalc_service_order(result.id);
  select * into result from public.service_orders where id = result.id;
  return result;
end;
$$;

-- La cita acompaña a la OS: en proceso → en servicio, terminada → terminada,
-- entregada → entregada (sólo transiciones válidas de la cita).
create function private.sync_appointment_from_order(o public.service_orders) returns void
language plpgsql set search_path = '' as $$
declare
  target public.appointment_status;
  current_status public.appointment_status;
begin
  if o.appointment_id is null then
    return;
  end if;
  target := case o.status when 'en_proceso' then 'en_servicio' when 'terminada' then 'terminada'
                          when 'entregada' then 'entregada' end;
  select status into current_status from public.appointments where id = o.appointment_id;
  if target is null or current_status is null or not private.appointment_transition_allowed(current_status, target) then
    return;
  end if;
  update public.appointments
     set status = target,
         started_at = case when target = 'en_servicio' then now() else started_at end,
         finished_at = case when target = 'terminada' then now() else finished_at end,
         delivered_at = case when target = 'entregada' then now() else delivered_at end
   where id = o.appointment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. RPC
-- ---------------------------------------------------------------------------

-- OS walk-in (sin cita). p_items: [{"service_id": uuid, "quantity": int}].
create function public.create_service_order(
  p_detail_center_id uuid,
  p_request_id uuid,
  p_client_id uuid,
  p_vehicle_id uuid,
  p_items jsonb,
  p_channel public.sales_channel default 'b2c',
  p_channel_reference text default null,
  p_bay_id uuid default null,
  p_technician_id uuid default null,
  p_observations text default null,
  p_odometer_km integer default null,
  p_promised_at timestamptz default null
) returns public.service_orders
language plpgsql security invoker set search_path = '' as $$
declare
  result public.service_orders;
  existed boolean;
begin
  existed := exists (select 1 from public.service_orders where request_id = p_request_id);
  result := private.insert_service_order(p_detail_center_id, p_request_id, p_client_id, p_vehicle_id, p_channel,
                                         p_channel_reference, p_items, null, p_bay_id, p_technician_id,
                                         p_observations, p_odometer_km, p_promised_at);
  if not existed then
    perform private.register_client_visit(p_client_id, p_detail_center_id, now());
  end if;
  return result;
end;
$$;

-- OS desde una cita recibida: cliente, vehículo, bahía, técnico y servicios de
-- la cita sin recapturar. Una cita tiene a lo sumo una OS.
create function public.create_service_order_from_appointment(
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
  result public.service_orders;
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
  result := private.insert_service_order(
    a.detail_center_id, p_request_id, a.client_id, a.vehicle_id, p_channel, p_channel_reference,
    (select coalesce(jsonb_agg(jsonb_build_object('service_id', s.service_id, 'quantity', 1) order by s.position), '[]')
       from public.appointment_services s where s.appointment_id = a.id),
    a.id, a.bay_id, a.technician_id, a.notes, p_odometer_km, p_promised_at
  );
  perform private.set_change_reason('OS desde cita');
  update public.appointments set service_order_id = result.id where id = a.id;
  return result;
end;
$$;

-- Agrega una línea o cambia su cantidad (0 = quitarla). Después de autorizada,
-- exige motivo (adicional autorizado por el cliente) y actualiza el total autorizado.
create function public.set_service_order_item(
  p_order_id uuid,
  p_version integer,
  p_service_id uuid,
  p_quantity integer,
  p_reason text default null
) returns public.service_orders
language plpgsql security invoker set search_path = '' as $$
declare
  o public.service_orders;
begin
  o := private.lock_service_order(p_order_id, p_version);
  if o.status not in ('abierta', 'autorizada', 'en_proceso', 'pausada') then
    raise exception 'Las líneas sólo cambian antes de terminar la OS' using errcode = '22023';
  end if;
  if o.status = 'abierta' then
    perform private.set_change_reason(coalesce(nullif(btrim(p_reason), ''), 'Líneas de la OS'));
  else
    perform private.set_change_reason(p_reason);
  end if;
  perform private.put_service_order_item(o, p_service_id, p_quantity);
  if o.status <> 'abierta' and not exists (select 1 from public.service_order_items where service_order_id = o.id) then
    raise exception 'Una OS autorizada conserva al menos una línea' using errcode = '22023';
  end if;
  perform private.recalc_service_order(o.id);
  select * into o from public.service_orders where id = o.id;
  if o.total < o.paid_amount then
    raise exception 'El cambio deja saldo a favor del cliente; los reembolsos llegan con el módulo de pagos'
      using errcode = '22023';
  end if;
  if o.status <> 'abierta' then
    update public.service_orders set authorized_total = total where id = o.id returning * into o;
  end if;
  return o;
end;
$$;

-- Descuento por línea (p_item_id) o por OS, con motivo. El nivel exigido sale
-- del % acumulado de la OS; el usuario debe tener ese nivel o uno mayor.
create function public.add_service_order_discount(
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
  pct := case when o.subtotal > 0 then (o.discount_total + applied) * 100 / o.subtotal else 0 end;
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

-- Anula un descuento con motivo (nunca se borra).
create function public.void_service_order_discount(
  p_discount_id uuid,
  p_version integer,
  p_reason text
) returns public.service_orders
language plpgsql security invoker set search_path = '' as $$
declare
  d public.service_order_discounts;
  o public.service_orders;
begin
  select * into d from public.service_order_discounts where id = p_discount_id;
  if not found then
    raise exception 'Descuento inexistente o sin permiso' using errcode = '42501';
  end if;
  o := private.lock_service_order(d.service_order_id, p_version);
  perform private.set_change_reason(p_reason);
  if o.status not in ('abierta', 'autorizada', 'en_proceso', 'pausada', 'terminada') then
    raise exception 'No se modifican descuentos de una OS entregada o cancelada' using errcode = '22023';
  end if;
  if d.voided_at is not null then
    raise exception 'El descuento ya estaba anulado' using errcode = '22023';
  end if;
  update public.service_order_discounts
     set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
   where id = d.id;
  perform private.recalc_service_order(o.id);
  select * into o from public.service_orders where id = o.id;
  return o;
end;
$$;

-- Cambio de estatus con transiciones y reglas por canal. Pausar y cancelar
-- exigen motivo; cancelar una OS autorizada o pausada, encargado o admin.
create function public.set_service_order_status(
  p_order_id uuid,
  p_version integer,
  p_status public.service_order_status,
  p_reason text default null
) returns public.service_orders
language plpgsql security invoker set search_path = '' as $$
declare
  o public.service_orders;
  blocker text;
  worked integer;
begin
  o := private.lock_service_order(p_order_id, p_version);
  if not private.service_order_transition_allowed(o.status, p_status) then
    raise exception 'Transición no permitida: % → %', o.status, p_status using errcode = '22023';
  end if;
  if p_status in ('pausada', 'cancelada') then
    perform private.set_change_reason(p_reason);
  else
    perform private.set_change_reason(coalesce(nullif(btrim(p_reason), ''), 'Estatus: ' || p_status::text));
  end if;
  if p_status = 'cancelada' and o.status <> 'abierta' and not private.can_manage_orders(o.detail_center_id) then
    raise exception 'Sólo el encargado o el admin cancelan una OS autorizada' using errcode = '42501';
  end if;
  if p_status = 'cancelada' and o.paid_amount > 0 then
    raise exception 'La OS tiene cobros registrados; los reembolsos llegan con el módulo de pagos'
      using errcode = '22023';
  end if;
  if p_status = 'autorizada' then
    blocker := private.service_order_authorization_blocker(o);
  elsif p_status = 'entregada' then
    blocker := private.service_order_delivery_blocker(o);
  end if;
  if blocker is not null then
    raise exception '%', blocker using errcode = 'MG002';
  end if;
  -- Minutos del tramo en curso (en_proceso → pausada / terminada).
  worked := case when o.work_started_at is not null
                 then floor(extract(epoch from (now() - o.work_started_at)) / 60)::integer else 0 end;
  update public.service_orders
     set status = p_status,
         authorized_at = case when p_status = 'autorizada' then now() else authorized_at end,
         authorized_by = case when p_status = 'autorizada' then auth.uid() else authorized_by end,
         authorized_total = case when p_status = 'autorizada' then total else authorized_total end,
         started_at = case when p_status = 'en_proceso' then coalesce(started_at, now()) else started_at end,
         work_started_at = case when p_status = 'en_proceso' then now() else null end,
         worked_minutes = worked_minutes + case when p_status in ('pausada', 'terminada') then worked else 0 end,
         finished_at = case when p_status = 'terminada' then now() else finished_at end,
         delivered_at = case when p_status = 'entregada' then now() else delivered_at end,
         cancelled_at = case when p_status = 'cancelada' then now() else cancelled_at end
   where id = o.id
  returning * into o;
  perform private.sync_appointment_from_order(o);
  return o;
end;
$$;

-- Datos operativos de la OS: bahía, técnico, diagnóstico, observaciones,
-- recomendaciones, próxima visita, kilometraje y hora prometida. El canal y su
-- referencia sólo cambian mientras la OS está abierta.
create function public.update_service_order_details(
  p_order_id uuid,
  p_version integer,
  p_channel public.sales_channel,
  p_channel_reference text,
  p_bay_id uuid,
  p_technician_id uuid,
  p_diagnosis text,
  p_observations text,
  p_recommendations text,
  p_next_visit_on date,
  p_next_visit_service_id uuid,
  p_next_visit_notes text,
  p_odometer_km integer,
  p_promised_at timestamptz,
  p_reason text default null
) returns public.service_orders
language plpgsql security invoker set search_path = '' as $$
declare
  o public.service_orders;
  v_channel public.sales_channel;
begin
  o := private.lock_service_order(p_order_id, p_version);
  v_channel := coalesce(p_channel, o.channel);
  perform private.set_change_reason(coalesce(nullif(btrim(p_reason), ''), 'Datos de la OS'));
  if o.status in ('entregada', 'cancelada') then
    raise exception 'La OS ya está cerrada' using errcode = '22023';
  end if;
  if o.status <> 'abierta' and (v_channel, nullif(btrim(p_channel_reference), ''))
                               is distinct from (o.channel, o.channel_reference) then
    raise exception 'El canal y su referencia sólo cambian mientras la OS está abierta' using errcode = '22023';
  end if;
  perform private.check_order_resources(o.detail_center_id, p_bay_id, p_technician_id);
  if p_next_visit_service_id is not null and not exists (
    select 1 from public.services s where s.id = p_next_visit_service_id and s.organization_id = o.organization_id) then
    raise exception 'Servicio recomendado inexistente' using errcode = '22023';
  end if;
  update public.service_orders
     set channel = v_channel,
         channel_reference = nullif(btrim(p_channel_reference), ''),
         bay_id = p_bay_id,
         technician_id = p_technician_id,
         diagnosis = nullif(btrim(p_diagnosis), ''),
         observations = nullif(btrim(p_observations), ''),
         recommendations = nullif(btrim(p_recommendations), ''),
         next_visit_on = p_next_visit_on,
         next_visit_service_id = p_next_visit_service_id,
         next_visit_notes = nullif(btrim(p_next_visit_notes), ''),
         odometer_km = p_odometer_km,
         promised_at = p_promised_at
   where id = o.id
  returning * into o;
  return o;
end;
$$;

-- Registra un cobro (interfaz mínima: el módulo de pagos lo reemplazará con
-- su tabla de pagos). Nunca más que el saldo.
create function public.record_service_order_payment(
  p_order_id uuid,
  p_version integer,
  p_amount numeric,
  p_method text,
  p_reference text default null
) returns public.service_orders
language plpgsql security invoker set search_path = '' as $$
declare
  o public.service_orders;
begin
  o := private.lock_service_order(p_order_id, p_version);
  if o.status not in ('autorizada', 'en_proceso', 'pausada', 'terminada') then
    raise exception 'Sólo se cobra una OS autorizada y no entregada' using errcode = '22023';
  end if;
  if p_method is null or p_method not in ('efectivo', 'tarjeta', 'transferencia', 'otro') then
    raise exception 'Forma de pago inválida' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Importe inválido' using errcode = '22023';
  end if;
  if p_amount > o.total - o.paid_amount then
    raise exception 'El cobro excede el saldo pendiente' using errcode = '22023';
  end if;
  perform private.set_change_reason(
    'Cobro ' || p_method || coalesce(' · ' || nullif(btrim(p_reference), ''), ''));
  update public.service_orders set paid_amount = paid_amount + p_amount where id = o.id returning * into o;
  perform private.log_event(o.organization_id, o.detail_center_id, 'service_order.payment_recorded',
                            'public.service_orders', o.id::text,
                            jsonb_build_object('amount', p_amount, 'method', p_method,
                                               'reference', nullif(btrim(p_reference), '')));
  return o;
end;
$$;

-- OS del centro, más recientes primero; búsqueda por folio, cliente o placa.
create function public.list_service_orders(
  p_detail_center_id uuid,
  p_status public.service_order_status default null,
  p_query text default null,
  p_limit integer default 50
)
returns table (
  id uuid,
  folio text,
  status public.service_order_status,
  channel public.sales_channel,
  client_name text,
  vehicle_label text,
  bay_name text,
  technician_name text,
  total numeric,
  paid_amount numeric,
  estimated_minutes integer,
  promised_at timestamptz,
  appointment_id uuid,
  created_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select o.id, o.folio, o.status, o.channel, o.client_name,
         o.vehicle_make || ' ' || o.vehicle_model || ' ' || o.vehicle_year || ' · ' || o.vehicle_plate,
         b.name, t.full_name, o.total, o.paid_amount, o.estimated_minutes, o.promised_at, o.appointment_id,
         o.created_at
  from public.service_orders o
  left join public.bays b on b.id = o.bay_id
  left join public.technicians t on t.id = o.technician_id
  where o.detail_center_id = p_detail_center_id
    and (p_status is null or o.status = p_status)
    and (nullif(btrim(p_query), '') is null
         or o.folio ilike '%' || private.like_escape(btrim(p_query)) || '%'
         or o.client_name ilike '%' || private.like_escape(btrim(p_query)) || '%'
         or o.vehicle_plate ilike '%' || private.like_escape(private.normalize_plate(p_query)) || '%')
  order by o.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.can_use_orders(uuid)',
    'private.can_manage_orders(uuid)',
    'private.discount_level_of(uuid)',
    'private.discount_required_level(numeric)',
    'private.service_order_transition_allowed(public.service_order_status, public.service_order_status)',
    'private.service_order_authorization_blocker(public.service_orders)',
    'private.service_order_delivery_blocker(public.service_orders)',
    'private.recalc_service_order(uuid)',
    'private.lock_service_order(uuid, integer)',
    'private.next_service_order_number(uuid)',
    'private.check_order_resources(uuid, uuid, uuid)',
    'private.put_service_order_item(public.service_orders, uuid, integer)',
    'private.insert_service_order(uuid, uuid, uuid, uuid, public.sales_channel, text, jsonb, uuid, uuid, uuid, text, integer, timestamptz)',
    'private.sync_appointment_from_order(public.service_orders)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.create_service_order(uuid, uuid, uuid, uuid, jsonb, public.sales_channel, text, uuid, uuid, text, integer, timestamptz)',
    'public.create_service_order_from_appointment(uuid, uuid, public.sales_channel, text, integer, timestamptz)',
    'public.set_service_order_item(uuid, integer, uuid, integer, text)',
    'public.add_service_order_discount(uuid, integer, uuid, text, numeric, text)',
    'public.void_service_order_discount(uuid, integer, text)',
    'public.set_service_order_status(uuid, integer, public.service_order_status, text)',
    'public.update_service_order_details(uuid, integer, public.sales_channel, text, uuid, uuid, text, text, text, date, uuid, text, integer, timestamptz, text)',
    'public.record_service_order_payment(uuid, integer, numeric, text, text)',
    'public.list_service_orders(uuid, public.service_order_status, text, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
