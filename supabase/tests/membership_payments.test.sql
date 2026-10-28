-- Pruebas del cobro de membresías (ADR 0043): alta y renovación con recibo y
-- cobro completo, formas de pago válidas, idempotencia, permisos por rol y
-- centro, corte de caja, reembolso (cancela si no se usó) y P&L.
\set ON_ERROR_STOP on
begin;

create function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

create function pg_temp.assert_fails(stmt text, expected_state text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate = expected_state then
      raise notice 'ok - %', msg;
      return;
    end if;
    raise exception 'FALLÓ: % (SQLSTATE % en lugar de %: %)', msg, sqlstate, expected_state, sqlerrm;
  end;
  raise exception 'FALLÓ: % (no produjo error)', msg;
end $$;

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('app.change_reason', '', true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.n(sql text) returns bigint language plpgsql as $$
declare c bigint;
begin
  execute 'select count(*) from (' || sql || ') s' into c;
  return c;
end $$;

create function pg_temp.v(p_id uuid) returns integer language sql as $$
  select version from public.service_orders where id = p_id
$$;

-- Alta con cobro: devuelve el id del recibo.
create function pg_temp.sell(p_request uuid, p_plan uuid, p_client uuid, p_vehicle uuid, p_tenders text,
                             p_cash numeric default null) returns uuid language sql as $$
  select (public.sell_membership('aaaaaaaa-0000-0000-0000-000000000000', p_request, p_plan, p_client, p_vehicle,
    p_tenders::jsonb, null, p_cash) -> 'payment' ->> 'id')::uuid
$$;

grant execute on all functions in schema pg_temp to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@o1'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000f2', 'operador@b'),
  ('00000000-0000-0000-0000-0000000000b1', 'comercial@a');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Monterrey');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio'),
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'contador');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'comercial_b2b');

select private.center_today('aaaaaaaa-0000-0000-0000-000000000000') as today \gset

-- Plan y clientes.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'LAV', 'Lavado', null, 'recurrente', 40, 250, 80)).id as lavado \gset
select (public.upsert_membership_plan('0e000000-0000-0000-0000-000000000001', null, 'CARE', 'care', 'Care',
  null, 499, 1::smallint, 'centro_origen', null, 7::smallint, null, null, true, 'Alta del plan')).id as care \gset
select from public.set_membership_benefit(:'care', :'lavado', 2::smallint, null, 'Beneficio del plan');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client('aaaaaaaa-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001',
  'José Pérez', '5512345678', null, 'person', null, '{}', 'web',
  '[{"make":"Mazda","model":"3","year":2021,"plate":"ABC1234"}]'::jsonb)).id as c1 \gset
select id as v1 from public.vehicles where plate = 'ABC1234' \gset
select (public.create_client('aaaaaaaa-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000002',
  'Ana Ruiz', '5598765432', null, 'person', null, '{}', 'web',
  '[{"make":"Kia","model":"Rio","year":2022,"plate":"XYZ9876"}]'::jsonb)).id as c2 \gset
select id as v2 from public.vehicles where plate = 'XYZ9876' \gset
select (public.create_client('aaaaaaaa-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000003',
  'Luis Gómez', '5511112222', null, 'person', null, '{}', 'web',
  '[{"make":"VW","model":"Jetta","year":2020,"plate":"LMN4567"}]'::jsonb)).id as c3 \gset
select id as v3 from public.vehicles where plate = 'LMN4567' \gset
reset role;

-- Corte abierto en A (fondo $1,000).
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select (public.open_cash_session('aaaaaaaa-0000-0000-0000-000000000000', gen_random_uuid(), 'unico', 1000)).id as cs \gset
reset role;

-- ---------------------------------------------------------------------------
-- Alta con cobro
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails($$select pg_temp.sell(gen_random_uuid(), '$$ || :'care' || $$', '$$ || :'c1' || $$',
  '$$ || :'v1' || $$', '[{"method":"efectivo","amount":300}]', 300)$$,
  '22023', 'sin el cobro completo del precio no hay alta');
select pg_temp.assert(pg_temp.n('select 1 from public.memberships') = 0,
  'el alta rechazada no deja membresía ni recibo');
select pg_temp.assert_fails($$select pg_temp.sell(gen_random_uuid(), '$$ || :'care' || $$', '$$ || :'c1' || $$',
  '$$ || :'v1' || $$', '[{"method":"tarjeta","amount":600}]')$$,
  '22023', 'sin sobrepago: la tarjeta no excede el precio');
select pg_temp.assert_fails($$select pg_temp.sell(gen_random_uuid(), '$$ || :'care' || $$', '$$ || :'c1' || $$',
  '$$ || :'v1' || $$', '[{"method":"credito_b2b","amount":499}]')$$,
  '22023', 'una membresía no se cobra a crédito B2B');
select pg_temp.assert_fails($$select pg_temp.sell(gen_random_uuid(), '$$ || :'care' || $$', '$$ || :'c1' || $$',
  '$$ || :'v1' || $$', '[{"method":"membresia","amount":499}]')$$,
  '22023', 'ni con la forma de pago membresía (inactiva)');
select pg_temp.assert_fails($$select pg_temp.sell(gen_random_uuid(), '$$ || :'care' || $$', '$$ || :'c1' || $$',
  '$$ || :'v1' || $$', '[{"method":"transferencia","amount":499}]')$$,
  '22023', 'la transferencia exige referencia');

select pg_temp.sell('20000000-0000-4000-8000-000000000001', :'care', :'c1', :'v1',
  '[{"method":"efectivo","amount":499}]', 500) as p1 \gset
select id as m1 from public.memberships where vehicle_id = :'v1' \gset
select pg_temp.assert(
  (select state = 'activa' and price = 499 from public.memberships where id = :'m1')
  and (select receipt_folio = 'A-01-R-000001' and amount = 499 and cash_received = 500 and change_amount = 1
          and status = 'valido' and client_id = :'c1' from public.payments where id = :'p1')
  and (select e.kind = 'alta' and a.amount = 499 and a.service_order_id is null
         from public.payment_allocations a join public.membership_events e on e.id = a.membership_event_id
        where a.payment_id = :'p1'),
  'alta con efectivo: membresía activa y recibo A-01-R-000001 por $499 aplicado al alta (cambio $1)');
select pg_temp.assert(
  pg_temp.sell('20000000-0000-4000-8000-000000000001', :'care', :'c1', :'v1',
    '[{"method":"efectivo","amount":499}]', 500) = :'p1'
  and pg_temp.n('select 1 from public.memberships') = 1
  and pg_temp.n('select 1 from public.payments') = 1,
  'idempotente: reintentar el alta (doble toque, web y móvil) no vende ni cobra dos veces');
select pg_temp.assert(
  (select r -> 'memberships' -> 0 ->> 'number' = 'MEM-000001' and r -> 'memberships' -> 0 ->> 'kind' = 'alta'
          and r ->> 'client_name' = 'José Pérez' and r -> 'orders' = 'null'::jsonb
     from public.payment_receipt(:'p1') r)
  and (select order_folios = 'MEM-000001' and methods = 'Efectivo'
         from public.list_payments(array['aaaaaaaa-0000-0000-0000-000000000000'::uuid], :'today'::date, :'today'::date)
        where id = :'p1'),
  'el recibo y el listado muestran la membresía cobrada');
select pg_temp.assert(
  (select count(*) = 1 and min(kind) = 'alta' and min(receipt_folio) = 'A-01-R-000001'
     from public.membership_payments(:'m1')),
  'recibos de la membresía: el alta');
reset role;

-- Permisos.
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert_fails($$select pg_temp.sell(gen_random_uuid(), '$$ || :'care' || $$', '$$ || :'c2' || $$',
  '$$ || :'v2' || $$', '[{"method":"efectivo","amount":499}]')$$,
  '42501', 'el comercial B2B no cobra: no vende membresías con cobro');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert_fails($$select pg_temp.sell(gen_random_uuid(), '$$ || :'care' || $$', '$$ || :'c2' || $$',
  '$$ || :'v2' || $$', '[{"method":"efectivo","amount":499}]')$$,
  '42501', 'el operador de otro centro no cobra en este');
select pg_temp.assert(pg_temp.n('select 1 from public.membership_payments(''' || :'m1' || ''')') = 0,
  'el operador de otro centro no ve los recibos de la membresía');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(
  (select r ->> 'client_name' is null and r -> 'memberships' -> 0 ->> 'number' = 'MEM-000001'
     from public.payment_receipt(:'p1') r),
  'el contador ve el recibo de la membresía sin el nombre del cliente');
reset role;

-- Corte de caja: el efectivo de la membresía entra al esperado.
select pg_temp.assert(
  (select (private.cash_window_totals(s.detail_center_id, s.opened_at, s.window_end, s.opening_float)
             ->> 'expected_cash')::numeric = 1499
     from public.cash_sessions s where s.id = :'cs'),
  'corte: el esperado incluye el efectivo de la membresía ($1,000 + $499)');

-- ---------------------------------------------------------------------------
-- Renovación con cobro
-- ---------------------------------------------------------------------------
set session_replication_role = replica;
select (:'today'::date + 4 - interval '1 month')::date as anchor \gset
update public.memberships
   set started_on = :'anchor', period_anchor = :'anchor', ends_on = (:'anchor'::date + interval '1 month')::date - 1
 where id = :'m1';
update public.membership_events set period_start = :'anchor', period_end = (:'anchor'::date + interval '1 month')::date - 1
 where membership_id = :'m1' and kind = 'alta';
set session_replication_role = origin;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails($$select public.renew_membership_paid('$$ || :'m1' || $$', gen_random_uuid(),
  '[{"method":"tarjeta","amount":100}]')$$,
  '22023', 'sin el cobro completo no hay renovación');
select pg_temp.assert(
  (select renewals = 0 from public.memberships where id = :'m1'),
  'la renovación rechazada no cambia la membresía');
select (public.renew_membership_paid(:'m1', '50000000-0000-4000-8000-000000000001',
  '[{"method":"tarjeta","amount":499,"reference":"AUT-7"}]') -> 'payment' ->> 'id') as p2 \gset
select pg_temp.assert(
  (select renewals = 1 and ends_on = (:'anchor'::date + interval '2 months')::date - 1 from public.memberships where id = :'m1')
  and (select amount = 499 and status = 'valido' from public.payments where id = :'p2')
  and (select string_agg(kind, ',' order by receipt_folio) = 'alta,renovacion' from public.membership_payments(:'m1')),
  'renovación con tarjeta: un periodo más y su recibo');
select pg_temp.assert(
  (public.renew_membership_paid(:'m1', '50000000-0000-4000-8000-000000000001',
     '[{"method":"tarjeta","amount":499,"reference":"AUT-7"}]') -> 'payment' ->> 'id') = :'p2'
  and (select renewals = 1 from public.memberships where id = :'m1'),
  'idempotente: reintentar la renovación no renueva ni cobra dos veces');
reset role;

-- ---------------------------------------------------------------------------
-- Reembolso
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.sell('20000000-0000-4000-8000-000000000002', :'care', :'c2', :'v2',
  '[{"method":"efectivo","amount":499}]') as p3 \gset
select id as m2 from public.memberships where vehicle_id = :'v2' \gset
select pg_temp.sell('20000000-0000-4000-8000-000000000003', :'care', :'c3', :'v3',
  '[{"method":"efectivo","amount":499}]') as p4 \gset
select id as m3 from public.memberships where vehicle_id = :'v3' \gset
-- m3 se usa: un lavado redimido en una OS.
select (public.create_service_order('aaaaaaaa-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000001',
  :'c3', :'v3', jsonb_build_array(jsonb_build_object('service_id', :'lavado')), 'b2c', null)).id as os \gset
select id as line from public.service_order_items where service_order_id = :'os' \gset
select from public.redeem_membership_benefit(:'os', pg_temp.v(:'os'), :'line', :'m3', 1::smallint,
  '40000000-0000-4000-8000-000000000001');
select pg_temp.assert_fails($$select public.reverse_payment('$$ || :'p3' || $$', 'Cliente se arrepintió')$$,
  '42501', 'el operador no reembolsa');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select from public.reverse_payment(:'p3', 'Cliente se arrepintió');
select pg_temp.assert(
  (select status = 'revertido' from public.payments where id = :'p3')
  and (select state = 'cancelada' and cancel_reason = 'Cliente se arrepintió' and not auto_renew
         from public.memberships where id = :'m2')
  and (select count(*) = 1 from public.membership_events where membership_id = :'m2' and kind = 'cancelacion'
          and reason = 'Cliente se arrepintió' and data ->> 'refund' = 'true'),
  'reembolso de una membresía sin uso: recibo revertido y membresía cancelada con el motivo');
select pg_temp.assert_fails($$select public.reverse_payment('$$ || :'p4' || $$', 'Cliente se arrepintió')$$,
  'MG002', 'una membresía ya usada no se reembolsa sin cancelarla primero');
select pg_temp.assert(
  (select status = 'valido' from public.payments where id = :'p4')
  and (select state = 'activa' from public.memberships where id = :'m3'),
  'el reembolso rechazado no cambia recibo ni membresía');
select from public.set_membership_state(:'m3', 'cancelada', 'Reclamo del cliente: devolución acordada');
select pg_temp.assert(
  (select status from public.reverse_payment(:'p4', 'Devolución acordada')) = 'revertido'
  and (select state = 'cancelada' from public.memberships where id = :'m3'),
  'cancelada primero, el recibo de la membresía usada sí se reembolsa');
reset role;

-- ---------------------------------------------------------------------------
-- P&L: la venta cuenta al venderse; la reembolsada deja de contar
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select sum(amount) from private.pnl_movements(array['aaaaaaaa-0000-0000-0000-000000000000'::uuid],
     :'today'::date, :'today'::date) where line = 'membresias') = 998,
  'P&L: alta y renovación de MEM-000001 ($998); las dos ventas reembolsadas no cuentan');

-- Auditoría y traza.
select pg_temp.assert(
  (select count(*) = 4 from public.audit_log where event = 'membership.payment_recorded')
  and not exists (select 1 from public.payment_allocations
                   where num_nonnulls(service_order_id, membership_event_id) <> 1),
  'cada cobro de membresía deja su evento; cada asignación cobra una OS o una membresía');

rollback;
