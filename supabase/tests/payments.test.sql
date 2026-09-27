-- Pruebas de AF1: cobranza de la OS. Cobro total o parcial, pagos mixtos,
-- descuentos autorizados, sin sobrepago (el cambio del efectivo no lo es),
-- membresía y crédito B2B, recibo interno, reverso con permiso y traza,
-- invariante "Σ pagos válidos = cobrado", permisos por rol y centro, corte de
-- caja y conciliación, e interfaz previa (record_service_order_payment).
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

create function pg_temp.v(p_id uuid) returns integer language sql security definer as $$
  select version from public.service_orders where id = p_id
$$;

create function pg_temp.pay(p_id uuid, p_tenders text, p_cash numeric default null, p_request uuid default null)
returns public.payments language sql as $$
  select public.register_payment(p_id, pg_temp.v(p_id), coalesce(p_request, gen_random_uuid()), p_tenders::jsonb, p_cash)
$$;

-- Σ asignaciones de recibos válidos = cobrado, en todas las OS.
create function pg_temp.consistent() returns boolean language sql security definer as $$
  select not exists (
    select 1 from public.service_orders o
     where o.paid_amount <> coalesce((select sum(a.amount) from public.payment_allocations a
                                        join public.payments p on p.id = a.payment_id and p.status = 'valido'
                                       where a.service_order_id = o.id), 0))
$$;

create function pg_temp.center_paid(p_center uuid) returns numeric language sql security definer as $$
  select coalesce(sum(paid_amount), 0) from public.service_orders where detail_center_id = p_center
$$;

grant execute on all functions in schema pg_temp to authenticated, anon;

-- Catálogo de formas de pago.
select pg_temp.assert(
  (select string_agg(code || ':' || collects_cash, ',' order by position) from public.payment_methods where active)
    = 'efectivo:true,tarjeta:true,transferencia:true,membresia:false,credito_b2b:false',
  'formas de pago: efectivo, tarjeta y transferencia entran a caja; membresía y crédito B2B liquidan sin efectivo');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000b1', 'comercial@a'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@a'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000f2', 'operador@b');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'comercial_b2b'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'contador'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion');

select private.center_today('aaaaaaaa-0000-0000-0000-000000000000') as today \gset
\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set ORG '0e000000-0000-0000-0000-000000000001'

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service(:'ORG', 'LAV', 'Lavado', null, 'recurrente', 40, 250, 80)).id as lav \gset
select (public.create_service(:'ORG', 'POL', 'Pulido', null, 'valor_medio', 120, 2800, 900)).id as pol \gset
select (public.upsert_membership_plan(:'ORG', null, 'CARE', 'care', 'Care', null, 449, 1::smallint, 'centro_origen', null,
  7::smallint, null, null, true, 'Alta del plan')).id as care \gset
select from public.set_membership_benefit(:'care', :'lav', 2::smallint, null, 'Beneficio del plan');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000001', 'Ana Ruiz', '5511112222', null, 'person', null,
  '{}', 'web', '[{"make":"Kia","model":"Rio","year":2022,"plate":"ANA0001"}]'::jsonb)).id as ana \gset
select id as ana_car from public.vehicles where plate = 'ANA0001' \gset
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000002', 'Luis Mora', '5533334444', null, 'person', null,
  '{}', 'web', '[{"make":"VW","model":"Jetta","year":2020,"plate":"LUI0001"}]'::jsonb)).id as luis \gset
select id as luis_car from public.vehicles where plate = 'LUI0001' \gset
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000003', 'Flotillas SA', '5555556666', null, 'company',
  null, '{}', 'web', '[{"make":"Nissan","model":"NP300","year":2021,"plate":"FLT0001"}]'::jsonb)).id as flota \gset
select id as flota_car from public.vehicles where plate = 'FLT0001' \gset
select from public.create_membership(:'A', gen_random_uuid(), :'care', :'ana', :'ana_car', null, 'Efectivo');

-- OS de Ana: pulido + lavado, descuento autorizado por el encargado.
select (public.create_service_order(:'A', '30000000-0000-4000-8000-000000000001', :'ana', :'ana_car',
  jsonb_build_array(jsonb_build_object('service_id', :'pol'), jsonb_build_object('service_id', :'lav')))).id as o1 \gset
select pg_temp.assert_fails($$select pg_temp.pay('$$ || :'o1' || $$', '[{"method":"efectivo","amount":100}]')$$,
  '22023', 'una OS abierta (sin autorizar) no se cobra');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select from public.add_service_order_discount(:'o1', pg_temp.v(:'o1'), null, 'amount', 250, 'Cliente frecuente');
select from public.set_service_order_status(:'o1', pg_temp.v(:'o1'), 'autorizada');
reset role;
select pg_temp.assert(
  (select total = 2800 and paid_amount = 0 and payment_status = 'pendiente' from public.service_orders where id = :'o1'),
  'el descuento autorizado se refleja: se cobra el total con descuento (pendiente)');

-- ---------------------------------------------------------------------------
-- Cobro parcial, cambio, sobrepago, mixto e idempotencia
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (pg_temp.pay(:'o1', '[{"method":"efectivo","amount":500}]', 1000)).id as p1 \gset
select pg_temp.assert(
  (select receipt_folio = 'A-01-R-000001' and amount = 500 and cash_received = 1000 and change_amount = 500
          and status = 'valido' and received_by = '00000000-0000-0000-0000-0000000000f1'
     from public.payments where id = :'p1')
  and (select paid_amount = 500 and payment_status = 'parcial' from public.service_orders where id = :'o1'),
  'cobro parcial en efectivo: recibo A-01-R-000001, cambio de $500 (no es sobrepago) y OS parcial');
select pg_temp.assert_fails($$select pg_temp.pay('$$ || :'o1' || $$', '[{"method":"tarjeta","amount":2400}]')$$,
  '22023', 'no permite sobrepago: el cobro no excede el saldo ($2,300)');
select pg_temp.assert_fails($$select pg_temp.pay('$$ || :'o1' || $$', '[{"method":"transferencia","amount":100}]')$$,
  '22023', 'la transferencia exige referencia');
select pg_temp.assert_fails($$select pg_temp.pay('$$ || :'o1' || $$', '[{"method":"efectivo","amount":300}]', 200)$$,
  '22023', 'el efectivo recibido cubre el importe en efectivo');
select pg_temp.assert_fails($$select pg_temp.pay('$$ || :'o1' || $$', '[{"method":"cripto","amount":100}]')$$,
  '22023', 'forma de pago válida');
select pg_temp.assert_fails($$select pg_temp.pay('$$ || :'o1' || $$', '[{"method":"credito_b2b","amount":100}]')$$,
  'MG002', 'el crédito B2B sólo aplica a OS a cuenta de una empresa');
select pg_temp.assert_fails($$select public.register_payment('$$ || :'o1' || $$', 1, gen_random_uuid(),
  '[{"method":"tarjeta","amount":100}]')$$, '40001', 'versión vieja de la OS: no se cobra dos veces');
select (pg_temp.pay(:'o1', '[{"method":"tarjeta","amount":1300,"reference":"AUT-1"},{"method":"membresia","amount":200},
  {"method":"transferencia","amount":800,"reference":"SPEI-9"}]', null, '40000000-0000-4000-8000-000000000002')).id as p2 \gset
select pg_temp.assert(
  (select paid_amount = 2800 and payment_status = 'pagada' from public.service_orders where id = :'o1')
  and (select string_agg(method || '=' || amount, ',' order by method) from public.payment_tenders where payment_id = :'p2')
    = 'membresia=200.00,tarjeta=1300.00,transferencia=800.00'
  and (select membership_id is not null from public.payment_tenders where payment_id = :'p2' and method = 'membresia'),
  'pago mixto (tarjeta + membresía vigente + transferencia) salda la OS: pagada');
select pg_temp.assert(
  (pg_temp.pay(:'o1', '[{"method":"tarjeta","amount":1300,"reference":"AUT-1"}]', null,
     '40000000-0000-4000-8000-000000000002')).id = :'p2'
  and (select paid_amount = 2800 from public.service_orders where id = :'o1'),
  'idempotente: reintentar la misma solicitud (doble toque, web y móvil) no cobra dos veces');
select pg_temp.assert_fails($$select pg_temp.pay('$$ || :'o1' || $$', '[{"method":"efectivo","amount":1}]')$$,
  '22023', 'una OS pagada no admite más cobros');
select pg_temp.assert(pg_temp.consistent(), 'Σ pagos válidos = cobrado');

-- OS de Luis (sin membresía): la membresía no aplica.
select (public.create_service_order(:'A', '30000000-0000-4000-8000-000000000002', :'luis', :'luis_car',
  jsonb_build_array(jsonb_build_object('service_id', :'lav')))).id as o2 \gset
select from public.set_service_order_status(:'o2', pg_temp.v(:'o2'), 'autorizada');
select pg_temp.assert_fails($$select pg_temp.pay('$$ || :'o2' || $$', '[{"method":"membresia","amount":100}]')$$,
  'MG002', 'sin membresía vigente no se paga con membresía');
-- Interfaz previa (O4): misma firma, ahora crea un recibo.
select from public.record_service_order_payment(:'o2', pg_temp.v(:'o2'), 100, 'efectivo', 'Anticipo');
select pg_temp.assert(
  (select paid_amount = 100 and payment_status = 'parcial' from public.service_orders where id = :'o2')
  and pg_temp.n($$select 1 from public.payment_allocations where service_order_id = '$$ || :'o2' || $$'$$) = 1,
  'record_service_order_payment (O4) crea un recibo y conserva su contrato');
select pg_temp.assert_fails($$select public.set_service_order_status('$$ || :'o2' || $$', pg_temp.v('$$ || :'o2' || $$'),
  'cancelada', 'Cambio')$$, '42501', 'el operador no cancela una OS autorizada');
reset role;

-- ---------------------------------------------------------------------------
-- Reverso con permiso y traza
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails($$select public.reverse_payment('$$ || :'p2' || $$', 'Error de captura')$$,
  '42501', 'el operador no revierte cobros');
select pg_temp.assert_fails($$update public.payments set amount = 1 where id = '$$ || :'p2' || $$'$$,
  '42501', 'los cobros no se editan desde la API');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.reverse_payment('$$ || :'p2' || $$', '')$$,
  '22023', 'el reverso exige motivo');
select from public.reverse_payment(:'p2', 'Tarjeta declinada después');
select pg_temp.assert(
  (select status = 'revertido' from public.payments where id = :'p2')
  and (select amount = 2300 and reason = 'Tarjeta declinada después' and reversed_by = '00000000-0000-0000-0000-0000000000e1'
         from public.payment_reversals where payment_id = :'p2')
  and (select paid_amount = 500 and payment_status = 'parcial' from public.service_orders where id = :'o1')
  and pg_temp.n($$select 1 from public.payment_tenders where payment_id = '$$ || :'p2' || $$'$$) = 3,
  'reverso: el recibo queda revertido con motivo y actor, sus formas de pago se conservan y el saldo vuelve');
select pg_temp.assert(
  (public.reverse_payment(:'p2', 'Otra vez')).status = 'revertido'
  and pg_temp.n($$select 1 from public.payment_reversals where payment_id = '$$ || :'p2' || $$'$$) = 1,
  'reverso idempotente');
select pg_temp.assert(pg_temp.consistent(), 'tras el reverso, Σ pagos válidos = cobrado');
select pg_temp.assert_fails($$select public.set_service_order_status('$$ || :'o2' || $$', pg_temp.v('$$ || :'o2' || $$'),
  'cancelada', 'Cambio de opinión')$$, '22023', 'una OS con cobros válidos no se cancela');
select (select p.id from public.payments p join public.payment_allocations a on a.payment_id = p.id
         where a.service_order_id = :'o2') as p3 \gset
select from public.reverse_payment(:'p3', 'Reembolso del anticipo');
select pg_temp.assert(
  (select status = 'cancelada' from public.set_service_order_status(:'o2', pg_temp.v(:'o2'), 'cancelada', 'Cambio de opinión')),
  'con el anticipo revertido (reembolso), la OS se cancela');
reset role;
select pg_temp.assert_fails($$update public.payment_tenders set amount = 1 where payment_id = '$$ || :'p2' || $$'$$,
  '42501', 'la traza es inmutable incluso para el dueño de la base');
select pg_temp.assert_fails($$update public.service_orders set paid_amount = 0 where id = '$$ || :'o1' || $$'$$,
  '42501', 'el cobrado de la OS sólo lo cambia la cobranza');
select pg_temp.assert(
  exists (select 1 from public.audit_log where table_name = 'public.payments' and action = 'INSERT')
  and exists (select 1 from public.audit_log where table_name = 'public.payment_reversals'
                and reason = 'Tarjeta declinada después')
  and exists (select 1 from public.audit_log where event = 'service_order.payment_recorded'
                and new_data ->> 'receipt' = 'A-01-R-000001'),
  'auditoría de cobros y reversos (actor, fecha, valores y motivo)');

-- Entrega: con saldo no; pagada sí.
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select from public.set_service_order_status(:'o1', pg_temp.v(:'o1'), 'en_proceso');
select from public.set_service_order_status(:'o1', pg_temp.v(:'o1'), 'terminada');
select pg_temp.assert_fails($$select public.set_service_order_status('$$ || :'o1' || $$', pg_temp.v('$$ || :'o1' || $$'),
  'entregada')$$, 'MG002', 'B2C con saldo no se entrega');
select from pg_temp.pay(:'o1', '[{"method":"efectivo","amount":1000},{"method":"tarjeta","amount":1300}]', 1000);
select pg_temp.assert(
  (select status = 'entregada' from public.set_service_order_status(:'o1', pg_temp.v(:'o1'), 'entregada')),
  'pagada, se entrega');
reset role;

-- ---------------------------------------------------------------------------
-- B2B: OS a cuenta se cobra a crédito de la cuenta
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select (public.upsert_b2b_account(null, gen_random_uuid(), :'A', :'flota', 'Flotillas', null, null, null, null, null,
  'activa', null, 'Alta')).id as acc \gset
select from public.upsert_b2b_agreement(:'acc', null, gen_random_uuid(), 'Convenio', 'por_vehiculo', :'today'::date,
  :'today'::date + 30, 'activo', 'cualquiera', 30::smallint, null, null, null, array[:'A'::uuid], null, 'Alta');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_b2b_service_order(:'A', gen_random_uuid(), :'acc', :'flota_car',
  jsonb_build_array(jsonb_build_object('service_id', :'lav')), 'OC-1')).id as ob \gset
select from public.set_service_order_status(:'ob', pg_temp.v(:'ob'), 'autorizada');
select pg_temp.assert_fails($$select pg_temp.pay('$$ || :'ob' || $$', '[{"method":"efectivo","amount":100}]')$$,
  'MG002', 'una OS a cuenta B2B no se cobra en caja (evita doble conteo con el estado de cuenta)');
select from pg_temp.pay(:'ob', format('[{"method":"credito_b2b","amount":%s}]',
  (select total from public.service_orders where id = :'ob')));
select pg_temp.assert(
  (select payment_status = 'pagada' from public.service_orders where id = :'ob')
  and (select b2b_account_id = :'acc' from public.payment_tenders t join public.payment_allocations a
         on a.payment_id = t.payment_id where a.service_order_id = :'ob'),
  'crédito B2B: la OS queda saldada a cargo de la cuenta');
reset role;

-- ---------------------------------------------------------------------------
-- Permisos por rol y centro
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(
  pg_temp.n('select 1 from public.payments') = 5
  and (select (public.payment_receipt(:'p1')) ->> 'receipt_folio') = 'A-01-R-000001',
  'el contador consulta recibos y el recibo interno');
select pg_temp.assert_fails($$select pg_temp.pay('$$ || :'ob' || $$', '[{"method":"efectivo","amount":1}]')$$,
  '42501', 'el contador no cobra (sólo lectura)');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert(
  pg_temp.n('select 1 from public.payments') = 0
  and public.payment_receipt(:'p1') is null
  and pg_temp.n($$select 1 from public.payment_facts(array['$$ || :'A' || $$'::uuid], current_date - 1, current_date + 1)$$) = 0,
  'el operador de otro centro no ve la cobranza');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert(pg_temp.n('select 1 from public.payments') = 0, 'el comercial no ve la cobranza');
reset role;

-- ---------------------------------------------------------------------------
-- Corte de caja y conciliación
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
create temp table facts as select * from public.payment_facts(array[:'A'::uuid], :'today'::date, :'today'::date);
select pg_temp.assert(
  (select string_agg(method || ':' || valid_amount || '/' || reversed_amount, ',' order by method) from facts)
    = 'credito_b2b:250.00/0,efectivo:1500.00/100.00,membresia:0/200.00,tarjeta:1300.00/1300.00,transferencia:0/800.00'
  and (select sum(valid_amount) filter (where collects_cash) from facts) = 2800
  and (select sum(change_amount) from facts) = 500,
  'corte de caja por forma de pago: válido, revertido, en caja y cambio entregado');
select pg_temp.assert(
  (select delivered_orders = 1 and sales_total = 2800 and collected_for_sales = 2800 and pending_for_sales = 0
          and collected_in_range = 3050 and cash_in_range = 2800 and reversed_in_range = 2400
     from public.sales_reconciliation(array[:'A'::uuid], :'today'::date, :'today'::date)),
  'conciliación: ventas entregadas contra lo cobrado; cobranza, caja y reversos del día');
select pg_temp.assert(
  (select sum(valid_amount) from facts)
    = pg_temp.center_paid(:'A'),
  'suma de pagos válidos = saldo cobrado de las OS');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_service_order(:'A', gen_random_uuid(), :'luis', :'luis_car',
  jsonb_build_array(jsonb_build_object('service_id', :'lav')))).id as o4 \gset
select from public.set_service_order_status(:'o4', pg_temp.v(:'o4'), 'autorizada');
select pg_temp.assert(
  (select string_agg(folio || '=' || balance || ':' || payment_status, ',') from public.receivable_orders(array[:'A'::uuid]))
    = (select folio from public.service_orders where id = :'o4') || '=250.00:pendiente',
  'por cobrar: sólo las OS autorizadas con saldo');
reset role;

rollback;
