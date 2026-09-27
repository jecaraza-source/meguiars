-- AF1 — Administración y Finanzas / Ingresos y cobranza (POS).
--
-- La venta es la OS (total con descuentos autorizados y redenciones); los
-- pagos sólo representan la cobranza de ese total, así nada se cuenta dos veces.
--
-- * payment_methods: catálogo (efectivo, tarjeta, transferencia, membresía,
--   crédito B2B). Distingue lo que entra a caja o banco de lo que se liquida
--   sin efectivo (membresía ya pagada, crédito de la cuenta B2B).
-- * payments: recibo interno por centro (folio CDMX-01-R-000001; no es CFDI).
-- * payment_tenders: formas de pago del recibo (pagos mixtos).
-- * payment_allocations: a qué OS se aplica (hoy una por recibo; la tabla
--   permite repartir un recibo entre varias OS).
-- * payment_reversals: reverso con motivo; el recibo queda "revertido" y su
--   traza completa se conserva (nada se borra ni se edita).
-- * service_orders.paid_amount = Σ asignaciones de recibos válidos (sólo lo
--   escriben estas RPC) y payment_status (pendiente / parcial / pagada).
--
-- Escrituras sólo por RPC, con conexión (sin cola offline), idempotentes por
-- solicitud y auditadas. Compatible hacia atrás: record_service_order_payment
-- conserva su firma y ahora crea un recibo.

-- ---------------------------------------------------------------------------
-- 1. Permisos
-- ---------------------------------------------------------------------------

-- payments.read: recibos, corte de caja y saldos (el contador también).
create function private.can_read_payments(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(
    p_detail_center_id,
    array['admin_socio', 'encargado', 'operador_recepcion', 'contador']::public.app_role[]);
$$;

-- payments.write = quien opera la OS (can_use_orders); payments.reverse =
-- encargado o admin (can_manage_orders).

-- ---------------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------------

create table public.payment_methods (
  code text primary key check (code ~ '^[a-z0-9_]{2,30}$'),
  name text not null check (length(btrim(name)) between 2 and 60),
  -- efectivo / electronico entran a caja o banco; beneficio y credito liquidan
  -- el saldo sin efectivo (la membresía ya se pagó; el crédito B2B se cobra en
  -- la cobranza de la cuenta).
  kind text not null check (kind in ('efectivo', 'electronico', 'beneficio', 'credito', 'otro')),
  collects_cash boolean not null,
  requires_reference boolean not null default false,
  -- Sólo efectivo admite "recibido" mayor al importe (se entrega cambio).
  allows_change boolean not null default false,
  position smallint not null,
  active boolean not null default true
);

insert into public.payment_methods (code, name, kind, collects_cash, requires_reference, allows_change, position, active)
values
  ('efectivo', 'Efectivo', 'efectivo', true, false, true, 1, true),
  ('tarjeta', 'Tarjeta', 'electronico', true, false, false, 2, true),
  ('transferencia', 'Transferencia', 'electronico', true, true, false, 3, true),
  ('membresia', 'Membresía', 'beneficio', false, false, false, 4, true),
  ('credito_b2b', 'Crédito B2B', 'credito', false, false, false, 5, true),
  -- Sólo para cobros registrados antes de este módulo (inactivo).
  ('otro', 'Otro', 'otro', true, false, false, 9, false);

create table private.payment_counters (
  detail_center_id uuid primary key references public.detail_centers (id) on delete cascade,
  last_number integer not null
);
revoke all on private.payment_counters from public, anon, authenticated;
alter table private.payment_counters enable row level security;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  receipt_number integer not null check (receipt_number > 0),
  receipt_folio text not null,
  client_id uuid,
  amount numeric(12, 2) not null check (amount > 0),
  -- Efectivo recibido y cambio entregado (el cambio no es sobrepago).
  cash_received numeric(12, 2) check (cash_received is null or cash_received > 0),
  change_amount numeric(12, 2) not null default 0 check (change_amount >= 0),
  status text not null default 'valido' check (status in ('valido', 'revertido')),
  notes text check (notes is null or length(notes) <= 500),
  received_by uuid default auth.uid() references auth.users (id) on delete set null,
  received_at timestamptz not null default now(),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, request_id),
  unique (detail_center_id, receipt_number),
  check (change_amount = 0 or cash_received is not null),
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete restrict,
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete restrict
);
create index payments_center_received_idx on public.payments (detail_center_id, received_at);

create table public.payment_tenders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  payment_id uuid not null,
  method text not null references public.payment_methods (code) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  reference text check (reference is null or length(btrim(reference)) between 1 and 80),
  membership_id uuid,
  b2b_account_id uuid,
  created_at timestamptz not null default now(),
  check ((method = 'membresia') = (membership_id is not null)),
  check ((method = 'credito_b2b') = (b2b_account_id is not null)),
  foreign key (organization_id, payment_id) references public.payments (organization_id, id) on delete restrict,
  foreign key (organization_id, membership_id) references public.memberships (organization_id, id) on delete restrict,
  foreign key (organization_id, b2b_account_id) references public.b2b_accounts (organization_id, id) on delete restrict
);
create index payment_tenders_payment_idx on public.payment_tenders (payment_id);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  payment_id uuid not null,
  service_order_id uuid not null,
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (payment_id, service_order_id),
  foreign key (organization_id, payment_id) references public.payments (organization_id, id) on delete restrict,
  foreign key (organization_id, service_order_id) references public.service_orders (organization_id, id) on delete restrict
);
create index payment_allocations_order_idx on public.payment_allocations (service_order_id);

create table public.payment_reversals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  payment_id uuid not null unique,
  amount numeric(12, 2) not null check (amount > 0),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  reversed_by uuid default auth.uid() references auth.users (id) on delete set null,
  reversed_at timestamptz not null default now(),
  foreign key (organization_id, payment_id) references public.payments (organization_id, id) on delete restrict,
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete restrict
);

-- Estatus de cobro de la OS (espejo de paymentStatus en el dominio).
alter table public.service_orders
  add column payment_status text generated always as (
    case when paid_amount >= total then 'pagada' when paid_amount > 0 then 'parcial' else 'pendiente' end
  ) stored;

-- ---------------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------------

create trigger payments_updated_at before update on public.payments
  for each row execute function private.set_updated_at();
create trigger payments_require_reason before insert or update or delete on public.payments
  for each row execute function private.require_change_reason();
create trigger payments_audit after insert or update or delete on public.payments
  for each row execute function private.audit_row();
create trigger payment_reversals_audit after insert or update or delete on public.payment_reversals
  for each row execute function private.audit_row();

-- Traza inmutable: formas de pago, asignaciones y reversos no se editan ni se
-- borran; de un recibo sólo cambia el estatus de válido a revertido.
create function private.forbid_payment_changes() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Los cobros no se editan ni se borran; usa el reverso' using errcode = '42501';
end;
$$;
create trigger payment_tenders_immutable before update or delete on public.payment_tenders
  for each row execute function private.forbid_payment_changes();
create trigger payment_allocations_immutable before update or delete on public.payment_allocations
  for each row execute function private.forbid_payment_changes();
create trigger payment_reversals_immutable before update or delete on public.payment_reversals
  for each row execute function private.forbid_payment_changes();

create function private.guard_payment_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los cobros no se editan ni se borran; usa el reverso' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at')
     or not (old.status = 'valido' and new.status = 'revertido') then
    raise exception 'Los cobros no se editan ni se borran; usa el reverso' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger payments_guard before update or delete on public.payments
  for each row execute function private.guard_payment_update();

-- El cobrado de la OS sólo lo sincroniza la cobranza (Σ recibos válidos).
create function private.guard_paid_amount() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.paid_amount is distinct from old.paid_amount
     and current_setting('app.payment_sync', true) is distinct from 'on' then
    raise exception 'El cobrado de la OS sólo cambia con la cobranza' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger service_orders_guard_paid before update of paid_amount on public.service_orders
  for each row execute function private.guard_paid_amount();

-- ---------------------------------------------------------------------------
-- 4. Reglas internas
-- ---------------------------------------------------------------------------

-- Recalcula el cobrado de la OS desde las asignaciones de recibos válidos.
create function private.sync_order_paid(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.payment_sync', 'on', true);
  update public.service_orders o
     set paid_amount = coalesce((select sum(a.amount) from public.payment_allocations a
                                   join public.payments p on p.id = a.payment_id and p.status = 'valido'
                                  where a.service_order_id = o.id), 0)
   where o.id = p_order_id;
  perform set_config('app.payment_sync', 'off', true);
end;
$$;

create function private.next_receipt_number(p_detail_center_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  insert into private.payment_counters (detail_center_id, last_number)
  values (p_detail_center_id, 1)
  on conflict (detail_center_id) do update set last_number = private.payment_counters.last_number + 1
  returning last_number into n;
  return n;
end;
$$;

-- Crea el recibo de una OS con sus formas de pago (validadas) y lo aplica.
-- Sin chequeo de permisos: lo hacen las RPC públicas.
create function private.create_order_payment(
  o public.service_orders,
  p_request_id uuid,
  p_tenders jsonb,
  p_cash_received numeric,
  p_notes text,
  p_legacy boolean default false,
  p_received_at timestamptz default now()
) returns public.payments
language plpgsql security definer set search_path = '' as $$
declare
  t jsonb;
  m public.payment_methods;
  total numeric := 0;
  cash numeric := 0;
  v_amount numeric;
  v_ref text;
  v_membership uuid;
  result public.payments;
  n integer;
  center_code text;
  balance numeric := o.total - o.paid_amount;
begin
  -- Los cobros previos (p_legacy) se migran tal como quedaron: sin revalidar estado ni saldo.
  if o.status in ('abierta', 'cancelada') and not p_legacy then
    raise exception 'Sólo se cobra una OS autorizada y no cancelada' using errcode = '22023';
  end if;
  if p_tenders is null or jsonb_typeof(p_tenders) <> 'array' or jsonb_array_length(p_tenders) = 0 then
    raise exception 'Indica al menos una forma de pago' using errcode = '22023';
  end if;
  for t in select * from jsonb_array_elements(p_tenders) loop
    select * into m from public.payment_methods where code = t ->> 'method';
    if not found or (not m.active and not p_legacy) then
      raise exception 'Forma de pago inválida' using errcode = '22023';
    end if;
    begin
      v_amount := (t ->> 'amount')::numeric;
    exception when others then
      raise exception 'Importe inválido' using errcode = '22023';
    end;
    if v_amount is null or v_amount <= 0 or v_amount <> round(v_amount, 2) then
      raise exception 'Importe inválido' using errcode = '22023';
    end if;
    v_ref := nullif(btrim(t ->> 'reference'), '');
    if m.requires_reference and v_ref is null then
      raise exception 'Captura la referencia de %', lower(m.name) using errcode = '22023';
    end if;
    -- OS a cuenta B2B: sólo a crédito (la cuenta se cobra en su estado de cuenta);
    -- y el crédito B2B sólo existe para OS a cuenta.
    if not p_legacy and (o.b2b_account_id is not null) <> (m.code = 'credito_b2b') then
      raise exception '%', case when o.b2b_account_id is not null
        then 'Una OS a cuenta B2B se cobra a crédito de la cuenta'
        else 'El crédito B2B sólo aplica a OS a cuenta de una empresa' end using errcode = 'MG002';
    end if;
    if m.code = 'membresia' then
      select mb.id into v_membership from public.memberships mb
       where mb.client_id = o.client_id and mb.state = 'activa'
         and private.membership_status(mb.state, mb.ends_on, mb.renewal_notice_days,
                                       private.center_today(o.detail_center_id)) in ('activa', 'proxima_a_vencer')
         and (t ->> 'membership_id' is null or mb.id = (t ->> 'membership_id')::uuid)
       order by mb.ends_on desc limit 1;
      if v_membership is null then
        raise exception 'El cliente no tiene una membresía vigente' using errcode = 'MG002';
      end if;
    end if;
    total := total + v_amount;
    if m.allows_change then
      cash := cash + v_amount;
    end if;
  end loop;
  if total > balance and not p_legacy then
    raise exception 'El cobro (%) excede el saldo pendiente (%)', to_char(total, 'FM$999,999,990.00'),
      to_char(balance, 'FM$999,999,990.00') using errcode = '22023';
  end if;
  if p_cash_received is not null and (cash = 0 or p_cash_received < cash) then
    raise exception 'El efectivo recibido debe cubrir el importe en efectivo' using errcode = '22023';
  end if;
  select c.code into center_code from public.detail_centers c where c.id = o.detail_center_id;
  n := private.next_receipt_number(o.detail_center_id);
  insert into public.payments (organization_id, detail_center_id, receipt_number, receipt_folio, client_id, amount,
    cash_received, change_amount, notes, received_at, request_id)
  values (o.organization_id, o.detail_center_id, n, center_code || '-R-' || lpad(n::text, 6, '0'), o.client_id, total,
    p_cash_received, coalesce(p_cash_received - cash, 0), nullif(btrim(p_notes), ''), coalesce(p_received_at, now()),
    p_request_id)
  returning * into result;
  for t in select * from jsonb_array_elements(p_tenders) loop
    insert into public.payment_tenders (organization_id, payment_id, method, amount, reference, membership_id,
      b2b_account_id)
    values (o.organization_id, result.id, t ->> 'method', (t ->> 'amount')::numeric, nullif(btrim(t ->> 'reference'), ''),
      case when t ->> 'method' = 'membresia' then v_membership end,
      case when t ->> 'method' = 'credito_b2b' then o.b2b_account_id end);
  end loop;
  insert into public.payment_allocations (organization_id, payment_id, service_order_id, amount)
  values (o.organization_id, result.id, o.id, total);
  if not p_legacy then
    -- Motivo del cambio en la OS y evento de cobro (mismo formato que en O4).
    perform private.set_change_reason('Cobro '
      || (select string_agg(x ->> 'method', ' + ') from jsonb_array_elements(p_tenders) x)
      || coalesce(' · ' || (select string_agg(nullif(btrim(x ->> 'reference'), ''), ', ')
                              from jsonb_array_elements(p_tenders) x), ''));
    perform private.log_event(o.organization_id, o.detail_center_id, 'service_order.payment_recorded',
      'public.service_orders', o.id::text,
      jsonb_build_object('amount', total, 'receipt', result.receipt_folio,
        'method', case when jsonb_array_length(p_tenders) = 1 then p_tenders -> 0 ->> 'method' else 'mixto' end,
        'tenders', p_tenders, 'change', result.change_amount));
  end if;
  perform private.sync_order_paid(o.id);
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------

alter table public.payment_methods enable row level security;
alter table public.payments enable row level security;
alter table public.payment_tenders enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.payment_reversals enable row level security;

create policy payment_methods_select on public.payment_methods for select to authenticated using (true);
create policy payments_select on public.payments
  for select to authenticated using (private.can_read_payments(detail_center_id));
create policy payment_tenders_select on public.payment_tenders
  for select to authenticated using (exists (select 1 from public.payments p where p.id = payment_id));
create policy payment_allocations_select on public.payment_allocations
  for select to authenticated using (exists (select 1 from public.payments p where p.id = payment_id));
create policy payment_reversals_select on public.payment_reversals
  for select to authenticated using (private.can_read_payments(detail_center_id));

revoke all on public.payment_methods, public.payments, public.payment_tenders, public.payment_allocations,
  public.payment_reversals from anon;
revoke insert, update, delete, truncate on public.payment_methods, public.payments, public.payment_tenders,
  public.payment_allocations, public.payment_reversals from authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC
-- ---------------------------------------------------------------------------

-- Cobro de una OS (total o parcial, con pagos mixtos). p_tenders:
-- [{ "method": "efectivo", "amount": 500 }, { "method": "tarjeta", "amount": 1000, "reference": "AUT-1" }]
-- p_cash_received: efectivo entregado por el cliente (cambio = recibido − efectivo).
-- Idempotente por p_request_id: un reintento devuelve el mismo recibo.
create function public.register_payment(
  p_order_id uuid,
  p_version integer,
  p_request_id uuid,
  p_tenders jsonb,
  p_cash_received numeric default null,
  p_notes text default null
) returns public.payments
language plpgsql security definer set search_path = '' as $$
declare
  o public.service_orders;
  result public.payments;
begin
  select * into o from public.service_orders where id = p_order_id;
  if not found or not private.can_use_orders(o.detail_center_id) then
    raise exception 'OS inexistente o sin permiso para cobrar' using errcode = '42501';
  end if;
  select * into result from public.payments where organization_id = o.organization_id and request_id = p_request_id;
  if found then
    return result;
  end if;
  o := private.lock_service_order(p_order_id, p_version);
  perform private.set_change_reason('Cobro de la OS ' || o.folio);
  result := private.create_order_payment(o, p_request_id, p_tenders, p_cash_received, p_notes);
  return result;
end;
$$;

-- Reverso (reembolso o captura errónea): sólo encargado o admin, con motivo.
-- El recibo queda revertido, el reverso guarda quién, cuándo y por qué, y el
-- saldo de la OS se recalcula. Idempotente.
create function public.reverse_payment(p_payment_id uuid, p_reason text) returns public.payments
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  a record;
begin
  perform private.set_change_reason(p_reason);
  select * into p from public.payments where id = p_payment_id for update;
  if not found or not private.can_read_payments(p.detail_center_id) then
    raise exception 'Recibo inexistente o sin permiso' using errcode = '42501';
  end if;
  if not private.can_manage_orders(p.detail_center_id) then
    raise exception 'Sólo el encargado o el admin revierten cobros' using errcode = '42501';
  end if;
  if p.status = 'revertido' then
    return p;
  end if;
  insert into public.payment_reversals (organization_id, detail_center_id, payment_id, amount, reason)
  values (p.organization_id, p.detail_center_id, p.id, p.amount, btrim(p_reason));
  update public.payments set status = 'revertido' where id = p.id returning * into p;
  for a in select service_order_id from public.payment_allocations where payment_id = p.id loop
    perform private.sync_order_paid(a.service_order_id);
  end loop;
  return p;
end;
$$;

-- Interfaz previa (O4), misma firma: ahora crea un recibo con una forma de pago.
create or replace function public.record_service_order_payment(
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
  perform public.register_payment(p_order_id, p_version, gen_random_uuid(),
    jsonb_build_array(jsonb_build_object('method', p_method, 'amount', p_amount, 'reference', p_reference)));
  select * into o from public.service_orders where id = p_order_id;
  return o;
end;
$$;

-- Recibos de una OS (con formas de pago y reverso).
create function public.order_payments(p_order_id uuid)
returns table (
  id uuid,
  receipt_folio text,
  amount numeric,
  applied numeric,
  status text,
  received_at timestamptz,
  received_by_name text,
  cash_received numeric,
  change_amount numeric,
  tenders jsonb,
  reversal_reason text,
  reversed_at timestamptz,
  reversed_by_name text
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.receipt_folio, p.amount, a.amount, p.status, p.received_at, rb.full_name, p.cash_received,
         p.change_amount,
         (select jsonb_agg(jsonb_build_object('method', t.method, 'name', m.name, 'amount', t.amount,
                                              'reference', t.reference) order by m.position, t.created_at)
            from public.payment_tenders t join public.payment_methods m on m.code = t.method
           where t.payment_id = p.id),
         r.reason, r.reversed_at, vb.full_name
    from public.payment_allocations a
    join public.payments p on p.id = a.payment_id
    left join public.payment_reversals r on r.payment_id = p.id
    left join public.profiles rb on rb.id = p.received_by
    left join public.profiles vb on vb.id = r.reversed_by
   where a.service_order_id = p_order_id and private.can_read_payments(p.detail_center_id)
   order by p.received_at desc, p.receipt_number desc;
$$;

-- Recibo interno (no es CFDI): centro, cliente, OS, formas de pago, cambio y reverso.
create function public.payment_receipt(p_payment_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'receipt_folio', p.receipt_folio, 'status', p.status, 'amount', p.amount,
    'cash_received', p.cash_received, 'change_amount', p.change_amount, 'notes', p.notes,
    'received_at', p.received_at, 'received_by', rb.full_name,
    'center_name', c.name, 'center_timezone', c.timezone, 'organization_name', org.name,
    -- El contador no ve datos personales de clientes (sólo importes y folios).
    'client_name', case when private.can_read_clients(p.detail_center_id) then cl.full_name end,
    'tenders', (select jsonb_agg(jsonb_build_object('method', t.method, 'name', m.name, 'amount', t.amount,
                                                    'reference', t.reference) order by m.position, t.created_at)
                  from public.payment_tenders t join public.payment_methods m on m.code = t.method
                 where t.payment_id = p.id),
    'orders', (select jsonb_agg(jsonb_build_object('id', o.id, 'folio', o.folio, 'total', o.total,
                                                   'applied', a.amount, 'paid', o.paid_amount,
                                                   'balance', greatest(o.total - o.paid_amount, 0),
                                                   'payment_status', o.payment_status) order by o.folio)
                 from public.payment_allocations a join public.service_orders o on o.id = a.service_order_id
                where a.payment_id = p.id),
    'reversal', (select jsonb_build_object('reason', r.reason, 'reversed_at', r.reversed_at, 'reversed_by', vb.full_name)
                   from public.payment_reversals r left join public.profiles vb on vb.id = r.reversed_by
                  where r.payment_id = p.id))
    from public.payments p
    join public.detail_centers c on c.id = p.detail_center_id
    join public.organizations org on org.id = p.organization_id
    left join public.clients cl on cl.id = p.client_id
    left join public.profiles rb on rb.id = p.received_by
   where p.id = p_payment_id and private.can_read_payments(p.detail_center_id);
$$;

-- Recibos de los centros en el rango (fechas de la zona de cada centro).
create function public.list_payments(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  id uuid,
  detail_center_id uuid,
  receipt_folio text,
  received_at timestamptz,
  amount numeric,
  status text,
  client_name text,
  order_folios text,
  methods text,
  received_by_name text
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.detail_center_id, p.receipt_folio, p.received_at, p.amount, p.status,
         case when private.can_read_clients(p.detail_center_id) then cl.full_name end,
         (select string_agg(o.folio, ', ' order by o.folio) from public.payment_allocations a
            join public.service_orders o on o.id = a.service_order_id where a.payment_id = p.id),
         (select string_agg(m.name, ' + ' order by m.position) from public.payment_tenders t
            join public.payment_methods m on m.code = t.method where t.payment_id = p.id),
         rb.full_name
    from public.payments p
    join public.detail_centers c on c.id = p.detail_center_id
    left join public.clients cl on cl.id = p.client_id
    left join public.profiles rb on rb.id = p.received_by
   where p.detail_center_id = any (p_detail_center_ids)
     and private.can_read_payments(p.detail_center_id)
     and (p.received_at at time zone c.timezone)::date between p_from and p_to
   order by p.received_at desc
   limit 500;
$$;

-- Hechos del corte de caja por centro, día y forma de pago (sin datos
-- personales): cobrado válido, revertido (del día del recibo) y si entra a caja.
create function public.payment_facts(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  detail_center_id uuid,
  day date,
  method text,
  method_name text,
  collects_cash boolean,
  valid_amount numeric,
  valid_count integer,
  reversed_amount numeric,
  reversed_count integer,
  change_amount numeric
)
language sql stable security definer set search_path = '' as $$
  select p.detail_center_id, (p.received_at at time zone c.timezone)::date, t.method, m.name, m.collects_cash,
         coalesce(sum(t.amount) filter (where p.status = 'valido'), 0),
         (count(distinct p.id) filter (where p.status = 'valido'))::integer,
         coalesce(sum(t.amount) filter (where p.status = 'revertido'), 0),
         (count(distinct p.id) filter (where p.status = 'revertido'))::integer,
         coalesce(sum(p.change_amount) filter (where p.status = 'valido' and m.allows_change), 0)
    from public.payments p
    join public.detail_centers c on c.id = p.detail_center_id
    join public.payment_tenders t on t.payment_id = p.id
    join public.payment_methods m on m.code = t.method
   where p.detail_center_id = any (p_detail_center_ids)
     and private.can_read_payments(p.detail_center_id)
     and (p.received_at at time zone c.timezone)::date between p_from and p_to
   group by p.detail_center_id, (p.received_at at time zone c.timezone)::date, t.method, m.name, m.collects_cash
   order by 2, 1, min(m.position);
$$;

-- OS con saldo (cuentas por cobrar de mostrador y crédito B2B pendiente de cargar).
create function public.receivable_orders(p_detail_center_ids uuid[])
returns table (
  id uuid,
  detail_center_id uuid,
  folio text,
  client_name text,
  channel public.sales_channel,
  status public.service_order_status,
  b2b_account_id uuid,
  total numeric,
  paid_amount numeric,
  balance numeric,
  payment_status text,
  created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select o.id, o.detail_center_id, o.folio,
         case when private.can_read_clients(o.detail_center_id) then o.client_name end, o.channel, o.status, o.b2b_account_id, o.total,
         o.paid_amount, o.total - o.paid_amount, o.payment_status, o.created_at
    from public.service_orders o
   where o.detail_center_id = any (p_detail_center_ids)
     and private.can_read_payments(o.detail_center_id)
     and o.status not in ('abierta', 'cancelada')
     and o.paid_amount < o.total
   order by o.created_at
   limit 500;
$$;

-- Conciliación por centro: ventas del rango (OS entregadas en el rango, fuente
-- de la venta) contra lo cobrado aplicado a esas OS; y cobranza del rango.
create function public.sales_reconciliation(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  detail_center_id uuid,
  delivered_orders integer,
  sales_total numeric,
  collected_for_sales numeric,
  pending_for_sales numeric,
  collected_in_range numeric,
  cash_in_range numeric,
  reversed_in_range numeric
)
language sql stable security definer set search_path = '' as $$
  with centers as (
    select c.id, c.timezone from public.detail_centers c
     where c.id = any (p_detail_center_ids) and private.can_read_payments(c.id)
  ), sales as (
    select o.detail_center_id, count(*)::integer as n, sum(o.total) as total, sum(o.paid_amount) as paid
      from public.service_orders o join centers c on c.id = o.detail_center_id
     where o.status = 'entregada' and (o.delivered_at at time zone c.timezone)::date between p_from and p_to
     group by o.detail_center_id
  ), coll as (
    select p.detail_center_id,
           sum(t.amount) filter (where p.status = 'valido') as valid,
           sum(t.amount) filter (where p.status = 'valido' and m.collects_cash) as cash,
           sum(t.amount) filter (where p.status = 'revertido') as reversed
      from public.payments p join centers c on c.id = p.detail_center_id
      join public.payment_tenders t on t.payment_id = p.id
      join public.payment_methods m on m.code = t.method
     where (p.received_at at time zone c.timezone)::date between p_from and p_to
     group by p.detail_center_id
  )
  select c.id, coalesce(s.n, 0), coalesce(s.total, 0), coalesce(s.paid, 0),
         coalesce(s.total, 0) - coalesce(s.paid, 0),
         coalesce(k.valid, 0), coalesce(k.cash, 0), coalesce(k.reversed, 0)
    from centers c
    left join sales s on s.detail_center_id = c.id
    left join coll k on k.detail_center_id = c.id
   order by c.id;
$$;

-- ---------------------------------------------------------------------------
-- 7. Cobros registrados antes de este módulo: un recibo por cada evento de
-- cobro (con su forma de pago) y, si no cuadra, uno "Otro" por la diferencia.
-- ---------------------------------------------------------------------------

do $$
declare
  o public.service_orders;
  e record;
  target numeric;
  covered numeric;
  amt numeric;
begin
  perform set_config('app.change_reason', 'Cobro previo al módulo de cobranza', true);
  for o in select * from public.service_orders where paid_amount > 0 order by created_at loop
    target := o.paid_amount;
    covered := 0;
    -- Los recibos se crean contra el saldo: se parte de cobrado 0 y cada recibo lo resincroniza.
    perform set_config('app.payment_sync', 'on', true);
    update public.service_orders set paid_amount = 0 where id = o.id returning * into o;
    for e in
      select l.new_data ->> 'method' as method, (l.new_data ->> 'amount')::numeric as amount,
             nullif(btrim(l.new_data ->> 'reference'), '') as reference, l.occurred_at
        from public.audit_log l
       where l.event = 'service_order.payment_recorded' and l.record_id = o.id::text
       order by l.occurred_at, l.id
    loop
      amt := least(e.amount, target - covered);
      exit when amt <= 0;
      perform private.create_order_payment(o, gen_random_uuid(),
        jsonb_build_array(jsonb_build_object(
          'method', case when e.method in ('efectivo', 'tarjeta', 'transferencia') then e.method else 'otro' end,
          'amount', amt, 'reference', coalesce(e.reference, 'Previo'))),
        null, 'Cobro previo al módulo de cobranza', true, e.occurred_at);
      select * into o from public.service_orders where id = o.id;
      covered := covered + amt;
    end loop;
    -- Lo que no explican los eventos queda en un recibo "Otro".
    if covered < target then
      perform private.create_order_payment(o, gen_random_uuid(),
        jsonb_build_array(jsonb_build_object('method', 'otro', 'amount', target - covered, 'reference', 'Previo')),
        null, 'Cobro previo al módulo de cobranza', true, o.updated_at);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.can_read_payments(uuid)',
    'private.forbid_payment_changes()',
    'private.guard_payment_update()',
    'private.guard_paid_amount()'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'private.sync_order_paid(uuid)',
    'private.next_receipt_number(uuid)',
    'private.create_order_payment(public.service_orders, uuid, jsonb, numeric, text, boolean, timestamptz)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.register_payment(uuid, integer, uuid, jsonb, numeric, text)',
    'public.reverse_payment(uuid, text)',
    'public.order_payments(uuid)',
    'public.payment_receipt(uuid)',
    'public.list_payments(uuid[], date, date)',
    'public.payment_facts(uuid[], date, date)',
    'public.receivable_orders(uuid[])',
    'public.sales_reconciliation(uuid[], date, date)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
