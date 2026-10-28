-- Cobro de la venta y la renovación de membresías con recibo y corte de caja (ADR 0043).
--
-- * El cargo es el evento de alta o renovación (membership_events: importe =
--   precio congelado, periodo): un recibo lo cobra con una asignación
--   (payment_allocations.membership_event_id). Así el recibo usa el mismo folio,
--   formas de pago, cambio del efectivo, idempotencia y candado del corte de caja
--   (el corte se calcula desde los recibos, no desde las OS).
-- * sell_membership y renew_membership_paid crean la membresía (o la renuevan)
--   y su recibo en una sola transacción: sin el cobro completo no hay alta ni
--   renovación. create_membership y renew_membership se conservan durante la
--   transición (expand → contract) para las apps ya instaladas.
-- * Reembolso (reverse_payment): cancela la membresía si no se usó en el periodo
--   cobrado; si se usó, primero se cancela con su motivo (decisión aparte).
-- * P&L: la venta se sigue reconociendo al alta o renovación; una venta
--   reembolsada deja de contar.

-- ---------------------------------------------------------------------------
-- 1. Esquema
-- ---------------------------------------------------------------------------

alter table public.membership_events
  add constraint membership_events_organization_id_id_key unique (organization_id, id);

alter table public.payment_allocations
  alter column service_order_id drop not null,
  add column membership_event_id bigint,
  add constraint payment_allocations_target_check
    check (num_nonnulls(service_order_id, membership_event_id) = 1),
  add constraint payment_allocations_membership_event_fkey
    foreign key (organization_id, membership_event_id)
    references public.membership_events (organization_id, id) on delete restrict,
  add constraint payment_allocations_payment_id_membership_event_id_key unique (payment_id, membership_event_id);
create index payment_allocations_membership_event_idx on public.payment_allocations (membership_event_id)
  where membership_event_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Reglas internas
-- ---------------------------------------------------------------------------

-- Cobrado válido del cargo (evento de alta o renovación).
create function private.membership_event_paid(p_event_id bigint) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(a.amount), 0) from public.payment_allocations a
    join public.payments p on p.id = a.payment_id and p.status = 'valido'
   where a.membership_event_id = p_event_id;
$$;

-- Venta reembolsada: tuvo recibos y todos se revirtieron.
create function private.membership_event_refunded(p_event_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.payment_allocations a where a.membership_event_id = p_event_id)
     and private.membership_event_paid(p_event_id) = 0;
$$;

-- Crea el recibo del cargo con sus formas de pago (validadas). Exige el cobro
-- completo del precio: efectivo, tarjeta o transferencia (nunca crédito B2B);
-- sólo el efectivo admite recibido mayor (cambio). Exige permiso de cobro
-- (payments.write) en el centro del cargo.
create function private.create_membership_payment(
  p_event_id bigint,
  p_request_id uuid,
  p_tenders jsonb,
  p_cash_received numeric,
  p_notes text
) returns public.payments
language plpgsql security definer set search_path = '' as $$
declare
  e public.membership_events;
  mb public.memberships;
  t jsonb;
  m public.payment_methods;
  total numeric := 0;
  cash numeric := 0;
  v_amount numeric;
  result public.payments;
  n integer;
  center_code text;
begin
  select * into e from public.membership_events where id = p_event_id and kind in ('alta', 'renovacion');
  if not found or coalesce(e.amount, 0) <= 0 then
    raise exception 'Cargo de membresía inexistente' using errcode = '22023';
  end if;
  if not private.can_use_orders(e.detail_center_id) then
    raise exception 'Sin permiso para cobrar en el centro de la membresía' using errcode = '42501';
  end if;
  select * into mb from public.memberships where id = e.membership_id;
  if private.membership_event_paid(e.id) > 0 then
    raise exception 'La membresía ya está cobrada' using errcode = '22023';
  end if;
  if p_tenders is null or jsonb_typeof(p_tenders) <> 'array' or jsonb_array_length(p_tenders) = 0 then
    raise exception 'Indica al menos una forma de pago' using errcode = '22023';
  end if;
  for t in select * from jsonb_array_elements(p_tenders) loop
    select * into m from public.payment_methods where code = t ->> 'method';
    if not found or not m.active or m.code = 'credito_b2b' then
      raise exception 'Forma de pago inválida para una membresía' using errcode = '22023';
    end if;
    begin
      v_amount := (t ->> 'amount')::numeric;
    exception when others then
      raise exception 'Importe inválido' using errcode = '22023';
    end;
    if v_amount is null or v_amount <= 0 or v_amount <> round(v_amount, 2) then
      raise exception 'Importe inválido' using errcode = '22023';
    end if;
    if m.requires_reference and nullif(btrim(t ->> 'reference'), '') is null then
      raise exception 'Captura la referencia de %', lower(m.name) using errcode = '22023';
    end if;
    total := total + v_amount;
    if m.allows_change then
      cash := cash + v_amount;
    end if;
  end loop;
  if total <> e.amount then
    raise exception 'El cobro (%) debe cubrir el precio de la membresía (%)', to_char(total, 'FM$999,999,990.00'),
      to_char(e.amount, 'FM$999,999,990.00') using errcode = '22023';
  end if;
  if p_cash_received is not null and (cash = 0 or p_cash_received < cash) then
    raise exception 'El efectivo recibido debe cubrir el importe en efectivo' using errcode = '22023';
  end if;
  select c.code into center_code from public.detail_centers c where c.id = e.detail_center_id;
  n := private.next_receipt_number(e.detail_center_id);
  insert into public.payments (organization_id, detail_center_id, receipt_number, receipt_folio, client_id, amount,
    cash_received, change_amount, notes, request_id)
  values (e.organization_id, e.detail_center_id, n, center_code || '-R-' || lpad(n::text, 6, '0'), mb.client_id, total,
    p_cash_received, coalesce(p_cash_received - cash, 0), nullif(btrim(p_notes), ''), p_request_id)
  returning * into result;
  for t in select * from jsonb_array_elements(p_tenders) loop
    insert into public.payment_tenders (organization_id, payment_id, method, amount, reference)
    values (e.organization_id, result.id, t ->> 'method', (t ->> 'amount')::numeric, nullif(btrim(t ->> 'reference'), ''));
  end loop;
  insert into public.payment_allocations (organization_id, payment_id, membership_event_id, amount)
  values (e.organization_id, result.id, e.id, total);
  perform private.log_event(e.organization_id, e.detail_center_id, 'membership.payment_recorded',
    'public.memberships', mb.id::text,
    jsonb_build_object('amount', total, 'receipt', result.receipt_folio, 'kind', e.kind, 'number', mb.number,
      'method', case when jsonb_array_length(p_tenders) = 1 then p_tenders -> 0 ->> 'method' else 'mixto' end,
      'tenders', p_tenders, 'change', result.change_amount));
  return result;
end;
$$;

-- Recibo válido del cargo (para reintentos idempotentes).
create function private.membership_event_payment(p_event_id bigint) returns public.payments
language sql stable security definer set search_path = '' as $$
  select p.* from public.payment_allocations a join public.payments p on p.id = a.payment_id
   where a.membership_event_id = p_event_id and p.status = 'valido'
   order by p.received_at desc limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 3. RPC: vender y renovar con cobro
-- ---------------------------------------------------------------------------

-- Alta con cobro completo. p_tenders como en register_payment. Idempotente por
-- p_request_id: un reintento devuelve la misma membresía y el mismo recibo.
create function public.sell_membership(
  p_detail_center_id uuid,
  p_request_id uuid,
  p_plan_id uuid,
  p_client_id uuid,
  p_vehicle_id uuid,
  p_tenders jsonb,
  p_starts_on date default null,
  p_cash_received numeric default null,
  p_notes text default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  m public.memberships;
  ev bigint;
  pay public.payments;
begin
  if not private.can_use_orders(p_detail_center_id) then
    raise exception 'Sin permiso para cobrar membresías en este centro' using errcode = '42501';
  end if;
  m := public.create_membership(p_detail_center_id, p_request_id, p_plan_id, p_client_id, p_vehicle_id, p_starts_on);
  select e.id into ev from public.membership_events e
   where e.membership_id = m.id and e.kind = 'alta' and e.request_id = p_request_id;
  if ev is null then
    raise exception 'La solicitud ya se usó para otra operación' using errcode = '22023';
  end if;
  pay := private.membership_event_payment(ev);
  if pay.id is null then
    pay := private.create_membership_payment(ev, p_request_id, p_tenders, p_cash_received, p_notes);
  end if;
  return jsonb_build_object('membership', to_jsonb(m), 'payment', to_jsonb(pay));
end;
$$;

-- Renovación con cobro completo (mismas reglas que renew_membership), en el
-- centro de origen. Idempotente por p_request_id.
create function public.renew_membership_paid(
  p_membership_id uuid,
  p_request_id uuid,
  p_tenders jsonb,
  p_plan_id uuid default null,
  p_cash_received numeric default null,
  p_notes text default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  center uuid;
  m public.memberships;
  ev bigint;
  pay public.payments;
begin
  select mm.detail_center_id into center from public.memberships mm where mm.id = p_membership_id;
  if center is null or not private.can_use_orders(center) then
    raise exception 'Membresía inexistente o sin permiso para cobrar en su centro de origen' using errcode = '42501';
  end if;
  m := public.renew_membership(p_membership_id, p_request_id, p_plan_id);
  select e.id into ev from public.membership_events e
   where e.membership_id = m.id and e.kind = 'renovacion' and e.request_id = p_request_id;
  if ev is null then
    raise exception 'La solicitud ya se usó para otra operación' using errcode = '22023';
  end if;
  pay := private.membership_event_payment(ev);
  if pay.id is null then
    pay := private.create_membership_payment(ev, p_request_id, p_tenders, p_cash_received, p_notes);
  end if;
  return jsonb_build_object('membership', to_jsonb(m), 'payment', to_jsonb(pay));
end;
$$;

-- Recibos de una membresía (alta y renovaciones), con su periodo.
create function public.membership_payments(p_membership_id uuid)
returns table (
  id uuid,
  receipt_folio text,
  amount numeric,
  status text,
  received_at timestamptz,
  kind text,
  period_start date,
  period_end date,
  methods text
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.receipt_folio, p.amount, p.status, p.received_at, e.kind, e.period_start, e.period_end,
         (select string_agg(pm.name, ' + ' order by pm.position) from public.payment_tenders t
            join public.payment_methods pm on pm.code = t.method where t.payment_id = p.id)
    from public.membership_events e
    join public.payment_allocations a on a.membership_event_id = e.id
    join public.payments p on p.id = a.payment_id
   where e.membership_id = p_membership_id and private.can_read_payments(p.detail_center_id)
   order by p.received_at desc, p.receipt_number desc;
$$;

-- ---------------------------------------------------------------------------
-- 4. Reverso: también de recibos de membresía
-- ---------------------------------------------------------------------------

-- Reverso (reembolso o captura errónea): sólo encargado o admin, con motivo.
-- El recibo queda revertido, el reverso guarda quién, cuándo y por qué, y el
-- saldo de la OS se recalcula. En un recibo de membresía, la membresía se
-- cancela; si ya se usó en el periodo cobrado, primero se cancela con su motivo.
-- Idempotente.
create or replace function public.reverse_payment(p_payment_id uuid, p_reason text) returns public.payments
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  a record;
  ev record;
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
  for ev in
    select e.id, e.period_start, e.period_end, mb.id as membership_id, mb.state
      from public.payment_allocations x
      join public.membership_events e on e.id = x.membership_event_id
      join public.memberships mb on mb.id = e.membership_id
     where x.payment_id = p.id
  loop
    perform pg_advisory_xact_lock(hashtextextended('membership:' || ev.membership_id::text, 0));
    if ev.state <> 'cancelada' and exists (
         select 1 from public.membership_redemptions r
          where r.membership_id = ev.membership_id and r.voided_at is null
            and r.period_start between ev.period_start and ev.period_end) then
      raise exception 'La membresía ya se usó en el periodo cobrado: cancélala primero con su motivo'
        using errcode = 'MG002';
    end if;
  end loop;
  insert into public.payment_reversals (organization_id, detail_center_id, payment_id, amount, reason)
  values (p.organization_id, p.detail_center_id, p.id, p.amount, btrim(p_reason));
  update public.payments set status = 'revertido' where id = p.id returning * into p;
  for a in select service_order_id from public.payment_allocations where payment_id = p.id and service_order_id is not null loop
    perform private.sync_order_paid(a.service_order_id);
  end loop;
  for ev in
    select mb.id, mb.state from public.payment_allocations x
      join public.membership_events e on e.id = x.membership_event_id
      join public.memberships mb on mb.id = e.membership_id
     where x.payment_id = p.id and mb.state <> 'cancelada'
  loop
    update public.memberships
       set state = 'cancelada', suspended_at = null, cancelled_at = now(), cancel_reason = btrim(p_reason),
           auto_renew = false
     where id = ev.id;
    perform private.log_membership_event(ev.id, 'cancelacion', null, ev.state::text, 'cancelada', null, null, null,
      jsonb_build_object('receipt', p.receipt_folio, 'refund', true));
  end loop;
  return p;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Recibo y listado: también cargos de membresía
-- ---------------------------------------------------------------------------

-- Recibo interno (no es CFDI): centro, cliente, OS o membresía, formas de pago, cambio y reverso.
create or replace function public.payment_receipt(p_payment_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'receipt_folio', p.receipt_folio, 'status', p.status, 'amount', p.amount,
    'cash_received', p.cash_received, 'change_amount', p.change_amount, 'notes', p.notes,
    'received_at', p.received_at, 'received_by', rb.full_name,
    'detail_center_id', p.detail_center_id, 'center_name', c.name, 'center_timezone', c.timezone, 'organization_name', org.name,
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
    'memberships', (select jsonb_agg(jsonb_build_object('id', mb.id, 'number', mb.number, 'plan_name', mb.plan_name,
                                                        'kind', e.kind, 'period_start', e.period_start,
                                                        'period_end', e.period_end, 'applied', a.amount)
                                     order by mb.number)
                      from public.payment_allocations a
                      join public.membership_events e on e.id = a.membership_event_id
                      join public.memberships mb on mb.id = e.membership_id
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

-- Recibos de los centros en el rango (fechas de la zona de cada centro). La
-- columna order_folios también lista los números de membresía cobrados.
create or replace function public.list_payments(p_detail_center_ids uuid[], p_from date, p_to date)
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
         (select string_agg(f, ', ' order by f) from (
            select o.folio as f from public.payment_allocations a
              join public.service_orders o on o.id = a.service_order_id where a.payment_id = p.id
            union all
            select mb.number from public.payment_allocations a
              join public.membership_events e on e.id = a.membership_event_id
              join public.memberships mb on mb.id = e.membership_id where a.payment_id = p.id) s),
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

-- ---------------------------------------------------------------------------
-- 6. P&L: una venta de membresía reembolsada deja de ser ingreso
-- ---------------------------------------------------------------------------

create or replace function private.pnl_movements(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  detail_center_id uuid,
  section text,
  line text,
  dimension text,
  source text,
  source_id uuid,
  reference text,
  occurred_on date,
  description text,
  amount numeric
)
language sql stable security definer set search_path = '' as $$
  with centers as (
    select c.id, c.timezone from public.detail_centers c
     where c.id = any (p_detail_center_ids) and private.can_read_pnl(c.id)
  ), delivered as (
    select o.id, o.detail_center_id, o.folio, o.channel::text as channel, o.total,
           (o.delivered_at at time zone c.timezone)::date as day
      from public.service_orders o join centers c on c.id = o.detail_center_id
     where o.status = 'entregada' and (o.delivered_at at time zone c.timezone)::date between p_from and p_to
  )
  -- Ventas de OS: neto de cada línea (subtotal − descuentos de la línea), por motor.
  select d.detail_center_id, 'ingreso', d.channel, i.revenue_engine::text, 'service_orders', d.id, d.folio, d.day,
         i.service_name || ' × ' || i.quantity, i.line_subtotal - i.line_discount
    from delivered d join public.service_order_items i on i.service_order_id = d.id
  union all
  -- Descuento general de la OS (no ligado a una línea): cuadra el canal con el total.
  select d.detail_center_id, 'ingreso', d.channel, 'descuento_os', 'service_orders', d.id, d.folio, d.day,
         'Descuento general de la OS', d.total - x.net
    from delivered d
    cross join lateral (select coalesce(sum(i.line_subtotal - i.line_discount), 0) as net
                          from public.service_order_items i where i.service_order_id = d.id) x
   where d.total <> x.net
  union all
  -- Venta de membresías: altas y renovaciones cobradas.
  select m.detail_center_id, 'ingreso', 'membresias', 'membresia', 'memberships', m.membership_id, ms.number,
         (m.occurred_at at time zone c.timezone)::date,
         case m.kind when 'alta' then 'Alta' else 'Renovación' end || coalesce(' · ' || m.plan_code, ''), m.amount
    from public.membership_events m
    join centers c on c.id = m.detail_center_id
    join public.memberships ms on ms.id = m.membership_id
   where m.kind in ('alta', 'renovacion') and coalesce(m.amount, 0) > 0
     and (m.occurred_at at time zone c.timezone)::date between p_from and p_to
     -- Una venta reembolsada (todos sus recibos revertidos) ya no es ingreso (ADR 0043).
     and not private.membership_event_refunded(m.id)
  union all
  -- Cuotas B2B devengadas (mismo criterio que private.b2b_fee_accrued), en el centro gestor.
  select a.home_detail_center_id, 'ingreso', 'cuotas_b2b', 'cuota_b2b', 'b2b_agreements', g.id, a.name, f.day,
         g.name || case g.billing_model when 'paquete' then ' · paquete' else ' · iguala mensual' end, g.fee_amount
    from public.b2b_agreements g
    join public.b2b_accounts a on a.id = g.account_id
    join centers c on c.id = a.home_detail_center_id
    cross join lateral (
      select private.add_months(g.starts_on, k) as day
        from generate_series(0, case g.billing_model when 'iguala' then 1200 else 0 end) k
    ) f
   where g.billing_model in ('paquete', 'iguala') and g.fee_amount is not null
     and f.day between p_from and least(p_to, private.center_today(c.id))
     and (g.billing_model = 'paquete' or f.day <= g.ends_on)
  union all
  -- Costo estándar congelado de las líneas de las OS entregadas.
  select d.detail_center_id, 'costo_directo', 'estandar', i.revenue_engine::text, 'service_orders', d.id, d.folio,
         d.day, i.service_name || ' × ' || i.quantity, round(i.quantity * i.unit_direct_cost, 2)
    from delivered d join public.service_order_items i on i.service_order_id = d.id
   where i.unit_direct_cost > 0
  union all
  -- Pago al operador (CR1): % del precio aplicado de la línea, congelado en la OS.
  select d.detail_center_id, 'costo_directo', 'pago_operador', i.revenue_engine::text, 'service_orders', d.id, d.folio,
         d.day, i.service_name || ' × ' || i.quantity || ' · ' || i.operator_commission_pct || ' %', i.operator_commission_amount
    from delivered d join public.service_order_items i on i.service_order_id = d.id
   where i.operator_commission_amount > 0
  union all
  -- Variación real de insumos registrada en la ejecución de esas OS.
  select d.detail_center_id, 'costo_directo', 'variacion_insumos', null, 'service_orders', d.id, d.folio, d.day,
         inv.name || ' ' || k.actual_quantity || ' vs ' || k.standard_quantity || ' ' || k.unit,
         round((k.actual_quantity - k.standard_quantity) * k.unit_cost, 2)
    from delivered d
    join public.service_order_consumptions k on k.service_order_id = d.id
    join public.inventory_items inv on inv.id = k.inventory_item_id
   where k.actual_quantity <> k.standard_quantity
  union all
  -- Egresos aprobados (por grupo del P&L congelado) y pendientes (fuera del P&L).
  select e.detail_center_id,
         case when e.status = 'pendiente' or e.pnl_group = 'insumos' then 'fuera_pnl'
              when e.pnl_group = 'costo_directo' then 'costo_directo' else 'gasto' end,
         case when e.status = 'pendiente' then 'pendiente'
              when e.pnl_group = 'costo_directo' then 'egresos_costo_directo' else e.pnl_group end,
         case when e.status = 'pendiente' then e.pnl_group end,
         'expenses', e.id, e.folio, e.paid_on,
         e.concept || coalesce(' · ' || v.name, ''), e.amount
    from public.expenses e
    join centers c on c.id = e.detail_center_id
    left join public.vendors v on v.id = e.vendor_id
   where e.status in ('aprobado', 'pendiente') and e.paid_on between p_from and p_to;
$$;
-- ---------------------------------------------------------------------------
-- 7. Permisos
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.membership_event_paid(bigint)',
    'private.membership_event_refunded(bigint)',
    'private.create_membership_payment(bigint, uuid, jsonb, numeric, text)',
    'private.membership_event_payment(bigint)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.sell_membership(uuid, uuid, uuid, uuid, uuid, jsonb, date, numeric, text)',
    'public.renew_membership_paid(uuid, uuid, jsonb, uuid, numeric, text)',
    'public.membership_payments(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
