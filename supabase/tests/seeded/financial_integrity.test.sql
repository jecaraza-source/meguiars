-- Integridad financiera (F5.1) sobre el seed y, en test-db, también sobre el
-- historial demo. Invariantes globales (se revisan antes y después de un
-- escenario de punta a punta) y conciliación con el P&L:
--   OS:    subtotal = Σ líneas; descuento = Σ descuentos vigentes (los de línea = Σ descuento
--          de líneas; el general no se reparte); total = subtotal − descuento;
--          cobrado = Σ asignaciones de recibos válidos; 0 ≤ cobrado ≤ total; estado de cobro coherente.
--   Cobro: importe = Σ asignaciones = Σ medios; cambio = efectivo recibido − medio efectivo;
--          recibo revertido ⇔ un reverso por el importe completo.
--   Caja:  corte congelado = fondo + efectivo cobrado − devuelto; diferencia = contado − esperado.
--   Membresía: redención vigente ⇔ descuento vigente del mismo importe, y no excede el beneficio.
--   B2B:   documento = OS + cuota; OS en a lo más un documento vigente; aplicado ≤ documento y ≤ pago.
--   P&L:   cada OS entregada suma exactamente su total, una vez; ventas de membresía una vez;
--          cobros, reversos, documentos y pagos B2B no generan ingreso (sin doble conteo).
\set ON_ERROR_STOP on
begin;

create function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- Devuelve las violaciones de invariantes (vacío = íntegro).
create function pg_temp.violations() returns table (rule text, detail text) language sql as $$
  with items as (select service_order_id, sum(line_subtotal) s, sum(line_discount) d from public.service_order_items group by 1),
       discounts as (select service_order_id, sum(amount) a, sum(amount) filter (where item_id is not null) l
                       from public.service_order_discounts where voided_at is null group by 1),
       alloc as (select a.service_order_id, sum(a.amount) s from public.payment_allocations a
                   join public.payments p on p.id = a.payment_id and p.status = 'valido' group by 1)
  select 'OS subtotal = Σ líneas', o.folio from public.service_orders o left join items i on i.service_order_id = o.id where o.subtotal <> coalesce(i.s, 0)
  union all
  select 'OS descuento = Σ descuentos vigentes; descuento de líneas = Σ los ligados a línea (el general va aparte)', o.folio
    from public.service_orders o left join items i on i.service_order_id = o.id left join discounts d on d.service_order_id = o.id
   where o.discount_total <> coalesce(d.a, 0) or coalesce(i.d, 0) <> coalesce(d.l, 0)
  union all
  select 'OS total = subtotal − descuento ≥ 0', folio from public.service_orders where total <> subtotal - discount_total or total < 0
  union all
  select 'OS cobrado = Σ asignaciones de recibos válidos', o.folio from public.service_orders o left join alloc a on a.service_order_id = o.id
   where o.paid_amount <> coalesce(a.s, 0)
  union all
  select 'OS 0 ≤ cobrado ≤ total', folio from public.service_orders where paid_amount < 0 or paid_amount > total
  union all
  select 'OS estado de cobro coherente', folio || ':' || payment_status from public.service_orders
   where payment_status <> case when paid_amount = 0 and total > 0 then 'pendiente'
                                when paid_amount < total then 'parcial' else 'pagada' end
  union all
  select 'recibo = Σ asignaciones = Σ medios', p.receipt_folio from public.payments p
   where p.amount <> coalesce((select sum(amount) from public.payment_allocations a where a.payment_id = p.id), 0)
      or p.amount <> coalesce((select sum(amount) from public.payment_tenders t where t.payment_id = p.id), 0)
  union all
  select 'cambio = efectivo recibido − medio efectivo', p.receipt_folio from public.payments p
   where p.cash_received is not null
     and p.change_amount <> p.cash_received - coalesce((select sum(amount) from public.payment_tenders t where t.payment_id = p.id and t.method = 'efectivo'), 0)
  union all
  select 'recibo revertido ⇔ un reverso por el importe', p.receipt_folio from public.payments p
   where (p.status = 'revertido') <> exists (select 1 from public.payment_reversals r where r.payment_id = p.id)
      or (select count(*) from public.payment_reversals r where r.payment_id = p.id) > 1
      or exists (select 1 from public.payment_reversals r where r.payment_id = p.id and r.amount <> p.amount)
  union all
  select 'corte = fondo + efectivo − devoluciones; diferencia = contado − esperado', s.folio
    from public.cash_closings c join public.cash_sessions s on s.id = c.session_id
   where c.expected_cash <> c.opening_float + c.cash_collected - c.cash_refunded or c.difference <> c.counted_cash - c.expected_cash
  union all
  select 'redención vigente ⇔ descuento vigente del mismo importe', r.id::text from public.membership_redemptions r
    left join public.service_order_discounts d on d.id = r.discount_id
   where d.id is null or (r.voided_at is null) <> (d.voided_at is null) or (r.voided_at is null and r.amount <> d.amount) or d.source <> 'membresia'
  union all
  select 'redenciones del periodo ≤ beneficio congelado', m.number || ':' || r.service_code from public.membership_redemptions r
    join public.memberships m on m.id = r.membership_id
   where r.voided_at is null
   group by m.id, m.number, m.benefits, r.service_id, r.service_code, r.period_start
  having sum(r.quantity) > coalesce((select sum((b ->> 'quantity_per_period')::int) from jsonb_array_elements(m.benefits) b
                                      where (b ->> 'service_id')::uuid = r.service_id), 0)
  union all
  select 'documento B2B = OS + cuota; OS = Σ OS vinculadas', i.folio from public.b2b_invoices i
   where i.amount <> i.orders_amount + i.fee_amount
      or (i.status = 'emitida' and i.orders_amount <> coalesce((select sum(total) from public.service_orders o where o.b2b_invoice_id = i.id), 0))
      or (i.status = 'anulada' and exists (select 1 from public.service_orders o where o.b2b_invoice_id = i.id))
  union all
  select 'aplicado ≤ documento', i.folio from public.b2b_invoices i
   where (select coalesce(sum(a.amount), 0) from public.b2b_payment_allocations a join public.b2b_payments p on p.id = a.payment_id
           where a.invoice_id = i.id and p.voided_at is null) > i.amount
  union all
  select 'aplicado ≤ pago B2B', p.id::text from public.b2b_payments p
   where (select coalesce(sum(a.amount), 0) from public.b2b_payment_allocations a where a.payment_id = p.id) > p.amount
  union all
  select 'OS B2B facturada sólo si entregada y de la cuenta', o.folio from public.service_orders o join public.b2b_invoices i on i.id = o.b2b_invoice_id
   where o.status <> 'entregada' or o.b2b_account_id is distinct from i.account_id;
$$;

create function pg_temp.integrity(label text) returns void language plpgsql as $$
begin
  perform pg_temp.assert(not exists (select 1 from pg_temp.violations()),
    format('%s: invariantes de OS, cobros, caja, membresías y B2B (%s OS, %s recibos)%s', label,
      (select count(*) from public.service_orders), (select count(*) from public.payments),
      coalesce(' — ' || (select string_agg(rule || ' [' || detail || ']', '; ') from (select * from pg_temp.violations() limit 10) v), '')));
end $$;

-- P&L como admin corporativo: ingreso por fuente en todo el historial.
insert into auth.users (id, email) values ('0f510000-0000-4000-8000-0000000000c0', 'corp@f51.test');
insert into public.role_assignments (organization_id, user_id, role)
values ('00000000-0000-4000-8000-00000000d3e0', '0f510000-0000-4000-8000-0000000000c0', 'admin_socio');
create function pg_temp.pnl_income() returns table (source text, source_id uuid, amount numeric) language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"sub":"0f510000-0000-4000-8000-0000000000c0","role":"authenticated"}', true);
  return query select m.source, m.source_id, sum(m.amount)
                 from private.pnl_movements((select array_agg(id) from public.detail_centers), '2000-01-01', current_date + 1) m
                where m.section = 'ingreso' group by 1, 2;
end $$;

create function pg_temp.pnl_reconciles(label text) returns void language plpgsql as $$
declare
  income_sources text;
  bad text;
begin
  if to_regclass('pg_temp.pnl') is null then create temp table pnl (source text, source_id uuid, amount numeric); end if;
  truncate pnl;
  insert into pnl select * from pg_temp.pnl_income();
  select string_agg(distinct source, ',' order by source) into income_sources from pnl;
  perform pg_temp.assert(not exists (select 1 from pnl where pnl.source not in ('b2b_agreements', 'memberships', 'service_orders')),
    format('%s: el ingreso del P&L sólo viene de OS entregadas, membresías y cuotas B2B (no de cobros ni documentos): %s', label, income_sources));
  select string_agg(o.folio || ' (' || coalesce(p.amount, 0) || ' vs ' || o.total || ')', ', ') into bad
    from public.service_orders o full join (select * from pnl where source = 'service_orders') p on p.source_id = o.id
   where (o.status = 'entregada') is distinct from (p.source_id is not null and p.amount is not null)
      or (o.status = 'entregada' and p.amount <> o.total);
  perform pg_temp.assert(bad is null, format('%s: cada OS entregada suma su total exactamente una vez en el P&L; las demás no suman%s', label, coalesce(' — ' || bad, '')));
  select string_agg(m.number, ', ') into bad from public.memberships m
   where coalesce((select amount from pnl where source = 'memberships' and source_id = m.id), 0)
      <> coalesce((select sum(e.amount) from public.membership_events e where e.membership_id = m.id and e.amount is not null), 0);
  perform pg_temp.assert(bad is null, format('%s: el ingreso de cada membresía = Σ de sus ventas y renovaciones%s', label, coalesce(' — ' || bad, '')));
end $$;

select pg_temp.integrity('datos cargados');
select pg_temp.pnl_reconciles('datos cargados');

-- ---------------------------------------------------------------------------
-- Escenario de punta a punta (CDMX): descuento, cobro parcial en efectivo con
-- cambio, tarjeta, reverso y recobro; redención de membresía; entrega; corte.
-- B2B (MTY): documento de cobro y pago parcial. Todo por las RPC de las apps.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('0f510000-0000-4000-8000-0000000000e1', 'encargado.cdmx@f51.test'),
  ('0f510000-0000-4000-8000-0000000000e2', 'admin.mty@f51.test');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('11111111-1111-4111-8111-111111111111', '0f510000-0000-4000-8000-0000000000e1', 'encargado'),
  ('22222222-2222-4222-8222-222222222222', '0f510000-0000-4000-8000-0000000000e2', 'admin_socio');

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('app.change_reason', '', true);
end $$;
create function pg_temp.v(p_id uuid) returns integer language sql as $$ select version from public.service_orders where id = p_id $$;
create function pg_temp.item(p_order uuid) returns uuid language sql as $$ select id from public.service_order_items where service_order_id = p_order order by created_at limit 1 $$;

grant execute on all functions in schema pg_temp to authenticated;
select pg_temp.login('0f510000-0000-4000-8000-0000000000e1');
set local role authenticated;

-- OS 1: lavado exprés con 10 % de descuento.
select (public.create_service_order('11111111-1111-4111-8111-111111111111', gen_random_uuid(),
  'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
  '[{"service_id":"5e000000-0000-4000-8000-000000000001"}]')).id as o1 \gset
select from public.set_service_order_status(:'o1', pg_temp.v(:'o1'), 'autorizada');
select from public.add_service_order_discount(:'o1', pg_temp.v(:'o1'), null, 'percent', 10, 'Cliente frecuente');
select total as o1_total from public.service_orders where id = :'o1' \gset
-- Cobro parcial en efectivo con cambio, luego tarjeta; se revierte la tarjeta y se cobra por transferencia.
select from public.register_payment(:'o1', pg_temp.v(:'o1'), gen_random_uuid(), '[{"method":"efectivo","amount":100}]', 200);
select (public.register_payment(:'o1', pg_temp.v(:'o1'), gen_random_uuid(),
  jsonb_build_array(jsonb_build_object('method', 'tarjeta', 'amount', :o1_total - 100, 'reference', 'AUT-1')))).id as card \gset
select from public.reverse_payment(:'card', 'Tarjeta declinada después');
select from public.register_payment(:'o1', pg_temp.v(:'o1'), gen_random_uuid(),
  jsonb_build_array(jsonb_build_object('method', 'transferencia', 'amount', :o1_total - 100, 'reference', 'SPEI-9')));
select from public.set_service_order_status(:'o1', pg_temp.v(:'o1'), 'en_proceso');
select from public.set_service_order_status(:'o1', pg_temp.v(:'o1'), 'terminada');
select from public.set_service_order_status(:'o1', pg_temp.v(:'o1'), 'entregada');

-- OS 2: el lavado exprés se paga con la membresía PLUS (redimible en cualquier centro).
select (public.create_service_order('11111111-1111-4111-8111-111111111111', gen_random_uuid(),
  'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
  '[{"service_id":"5e000000-0000-4000-8000-000000000001"}]')).id as o2 \gset
select from public.set_service_order_status(:'o2', pg_temp.v(:'o2'), 'autorizada');
select from public.redeem_membership_benefit(:'o2', pg_temp.v(:'o2'), pg_temp.item(:'o2'),
  '3c000000-0000-4000-8000-000000000001', 1::smallint, gen_random_uuid());
select from public.set_service_order_status(:'o2', pg_temp.v(:'o2'), 'en_proceso');
select from public.set_service_order_status(:'o2', pg_temp.v(:'o2'), 'terminada');
select from public.set_service_order_status(:'o2', pg_temp.v(:'o2'), 'entregada');

-- Corte de la sesión abierta con el efectivo exacto (el esperado se calcula como superusuario).
reset role;
select (private.cash_window_totals(s.detail_center_id, s.opened_at, now(), s.opening_float) ->> 'expected_cash')::numeric as expected,
       s.version as sv
  from public.cash_sessions s where s.id = '0e600000-0000-4000-8000-000000000002' \gset
set local role authenticated;
select from public.close_cash_session('0e600000-0000-4000-8000-000000000002', :sv, gen_random_uuid(), :expected, null);
reset role;

-- B2B en MTY: documento de la OS pendiente y pago parcial.
select pg_temp.login('0f510000-0000-4000-8000-0000000000e2');
set local role authenticated;
-- Fechas del centro gestor (no current_date: en UTC puede ser "mañana" para el centro).
select private.center_today('22222222-2222-4222-8222-222222222222') as mty_today \gset
select (public.create_b2b_billing_batch('b2000000-0000-4000-8000-000000000001', gen_random_uuid(),
  :'mty_today'::date - 30, :'mty_today'::date, array['0d000000-0000-4000-8000-000000000007']::uuid[], 0, :'mty_today'::date + 15,
  'F-2026-001', :'mty_today'::date, null)).id as inv \gset
select from public.register_b2b_payment('b2000000-0000-4000-8000-000000000001', gen_random_uuid(), 100, 'transferencia',
  'SPEI 77', :'mty_today'::date, jsonb_build_array(jsonb_build_object('invoice_id', :'inv', 'amount', 100)));
reset role;

select pg_temp.assert(
  (select payment_status = 'pagada' and paid_amount = total and total = round(subtotal * 0.9, 2) from public.service_orders where id = :'o1')
  and (select count(*) filter (where p.status = 'valido') = 2 and count(*) filter (where p.status = 'revertido') = 1
         from public.payments p join public.payment_allocations a on a.payment_id = p.id where a.service_order_id = :'o1')
  and (select change_amount = 100 from public.payments p join public.payment_allocations a on a.payment_id = p.id
        where a.service_order_id = :'o1' and p.cash_received is not null),
  'escenario: OS con descuento cobrada en efectivo con cambio y transferencia tras reverso de la tarjeta');
select pg_temp.assert(
  (select total = 0 and discount_total = subtotal and payment_status = 'pagada' from public.service_orders where id = :'o2'),
  'escenario: OS pagada con membresía queda en total 0 y cobrada, sin recibo');
select pg_temp.assert(
  (select c.difference = 0 and c.cash_collected >= 100 from public.cash_closings c where c.session_id = '0e600000-0000-4000-8000-000000000002'),
  'escenario: corte de caja cuadra con el efectivo cobrado (el cambio no cuenta como ingreso)');

select pg_temp.integrity('después del escenario');
select pg_temp.pnl_reconciles('después del escenario');
select pg_temp.assert(
  (select coalesce(sum(amount), 0) from pnl where source = 'service_orders' and source_id = :'o2') = 0,
  'escenario: la OS pagada con membresía no suma ingreso (la membresía ya se reconoció al venderse)');

rollback;
