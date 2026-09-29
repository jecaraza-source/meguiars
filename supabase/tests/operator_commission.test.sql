-- Pruebas de CR1: pago al operador como % del precio ("Lavado manual
-- detallado"). Ejemplo del prompt: precio 200, 30 % del operador y 20 de otros
-- costos directos → pago 60, costo 80, margen de contribución 120 (60 %).
-- Mismos números en packages/domain/src/catalog/operator-pay.test.ts.
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

create function pg_temp.deliver(p_id uuid, p_at timestamptz, p_technician uuid default null) returns void language plpgsql as $$
begin
  perform set_config('session_replication_role', 'replica', true);
  update public.service_orders set status = 'entregada', delivered_at = p_at where id = p_id;
  update public.service_order_items set technician_id = p_technician where service_order_id = p_id and p_technician is not null;
  perform set_config('session_replication_role', 'origin', true);
end $$;

grant execute on all functions in schema pg_temp to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion');
insert into public.technicians (id, organization_id, detail_center_id, full_name, active) values
  ('7e000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'Toño Lavador', true);

\set O1 '0e000000-0000-0000-0000-000000000001'
\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set B 'bbbbbbbb-0000-0000-0000-000000000000'
select private.center_today(:'A') as today \gset

-- Configuración: precio editable, % del operador editable (sin valor fijo).
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service(:'O1', 'LAV-MAN', 'Lavado manual detallado', 'Lavado a mano', 'valor_medio', 90,
  200, 20, 'Alta de servicio', 30)).id as lmd \gset
select (public.create_service(:'O1', 'LAV-EXP', 'Lavado exprés', null, 'recurrente', 20, 150, 30)).id as exp \gset
select (public.create_service(:'O1', 'CORTESIA', 'Lavado de cortesía', null, 'recurrente', 20, 0, 5, 'Alta', 30)).id as gratis \gset
select pg_temp.assert(
  (select operator_commission_pct from public.services where id = :'lmd') = 30
  and (select operator_commission_pct from public.services where id = :'exp') is null,
  'el % del operador se configura por servicio; sin valor, el servicio no paga porcentaje');
select pg_temp.assert_fails($$select public.create_service('0e000000-0000-0000-0000-000000000001', 'X-1', 'Servicio X', null,
  'recurrente', 20, 100, 10, 'Alta', 120)$$, '23514', 'el % del operador va de 0 a 100');
select pg_temp.assert_fails($$select public.create_service('0e000000-0000-0000-0000-000000000001', 'X-2', 'Servicio X', null,
  'recurrente', 20, 100, 10, 'Alta', -1)$$, '23514', 'el % del operador no es negativo');
select pg_temp.assert_fails($$select public.create_service('0e000000-0000-0000-0000-000000000001', 'X-3', 'Servicio X', null,
  'recurrente', 20, -100, 10, 'Alta', 10)$$, '23514', 'el precio no es negativo');
select pg_temp.assert(
  (select (price, direct_cost, operator_commission_pct) = (200::numeric, 20::numeric, 30::numeric)
     from public.center_catalog(:'A') where id = :'lmd'),
  'el catálogo del centro muestra precio, otros costos directos y % del operador');
reset role;

-- OS con el ejemplo: 200 × 30 % = 60; costo 20 + 60 = 80; margen 120.
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000001', 'Ana Ruiz', '5511112222', null, 'person', null,
  '{}', 'web', '[{"make":"Kia","model":"Rio","year":2022,"plate":"ANA0001"}]'::jsonb)).id as ana \gset
select id as car from public.vehicles where plate = 'ANA0001' \gset
select (public.create_service_order(:'A', gen_random_uuid(), :'ana', :'car',
  jsonb_build_array(jsonb_build_object('service_id', :'lmd'), jsonb_build_object('service_id', :'exp')))).id as o1 \gset
select pg_temp.assert(
  (select (unit_price, operator_commission_pct, operator_commission_amount) = (200::numeric, 30::numeric, 60::numeric)
     from public.service_order_items where service_order_id = :'o1' and service_id = :'lmd')
  and (select operator_commission_amount from public.service_order_items where service_order_id = :'o1' and service_id = :'exp') = 0,
  'la línea guarda precio aplicado, % del operador y pago (200 × 30 % = 60); sin % no hay pago');
select pg_temp.assert(
  (select (total, cost_total) = (350::numeric, 110::numeric) from public.service_orders where id = :'o1'),
  'costo de la OS = otros costos directos (20 + 30) + pago al operador (60)');
reset role;

-- Historial: cambiar precio o % del catálogo no altera lo ya vendido.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select from public.update_service(:'lmd', 'Lavado manual detallado', 'Lavado a mano', 'valor_medio', 90, 300, 20, true,
  'Nuevo precio y porcentaje', 40);
select pg_temp.assert(
  (select (operator_commission_pct, operator_commission_amount) = (30::numeric, 60::numeric)
     from public.service_order_items where service_order_id = :'o1' and service_id = :'lmd'),
  'la OS vendida conserva 30 % y $60 aunque el catálogo cambie a $300 y 40 %');
select pg_temp.assert(
  (select count(*) from public.service_price_history where service_id = :'lmd' and detail_center_id is null) = 2
  and (select operator_commission_pct from public.service_price_history where service_id = :'lmd'
        and reason = 'Nuevo precio y porcentaje') = 40,
  'el historial guarda cada cambio de precio y de % con su motivo');
-- % propio del centro B.
select from public.set_service_center_config(:'B', :'lmd', true, null, null, 'Porcentaje del centro B', 25);
select pg_temp.assert(
  (select operator_commission_pct from public.center_catalog(:'B') where id = :'lmd') = 25
  and (select operator_commission_pct from public.center_catalog(:'A') where id = :'lmd') = 40,
  'un centro puede tener su propio % (pisa al del servicio)');
select pg_temp.assert_fails($$select public.set_service_center_config('bbbbbbbb-0000-0000-0000-000000000000',
  (select id from public.services where code = 'LAV-MAN'), true, null, null, 'Mal', 101)$$, '23514',
  'el % del centro también va de 0 a 100');
reset role;
select pg_temp.assert_fails(format($$update public.service_order_items set operator_commission_pct = 50
  where service_order_id = %L$$, :'o1'), '22023', 'el % congelado de la línea no se edita');

-- Descuento de línea, cantidad y precio 0.
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select (public.create_service_order(:'A', gen_random_uuid(), :'ana', :'car',
  jsonb_build_array(jsonb_build_object('service_id', :'lmd', 'quantity', 2), jsonb_build_object('service_id', :'gratis')))).id as o2 \gset
select id as l2 from public.service_order_items where service_order_id = :'o2' and service_id = :'lmd' \gset
select pg_temp.assert(
  (select operator_commission_amount from public.service_order_items where id = :'l2') = 240
  and (select operator_commission_amount from public.service_order_items
        where service_order_id = :'o2' and service_id = :'gratis') = 0,
  'precio aplicado 2 × $300 al 40 % = $240; precio 0 → pago 0');
select from public.add_service_order_discount(:'o2', (select version from public.service_orders where id = :'o2'),
  :'l2', 'amount', 100, 'Cliente frecuente');
select pg_temp.assert(
  (select operator_commission_amount from public.service_order_items where id = :'l2') = 200,
  'la base es el precio aplicado de la línea después de su descuento: (600 − 100) × 40 % = 200');
select from public.add_service_order_discount(:'o2', (select version from public.service_orders where id = :'o2'),
  null, 'amount', 50, 'Descuento general');
select pg_temp.assert(
  (select operator_commission_amount from public.service_order_items where id = :'l2') = 200
  and (select cost_total from public.service_orders where id = :'o2') = 40 + 5 + 200,
  'el descuento general de la OS no reduce la base; el costo de la OS suma el pago');
reset role;

-- Reportes: P&L, ventas por servicio y detalle a OS con el operador.
select pg_temp.deliver(:'o1', (:'today'::date + time '12:00') at time zone 'America/Mexico_City',
  '7e000000-0000-0000-0000-000000000001');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(
  (select sum(amount) from public.pnl_lines(array[:'A']::uuid[], :'today'::date, :'today'::date)
    where section = 'costo_directo' and line = 'pago_operador') = 60
  and (select sum(amount) from public.pnl_lines(array[:'A']::uuid[], :'today'::date, :'today'::date)
        where section = 'costo_directo' and line = 'estandar') = 50,
  'P&L: renglón "pago a operadores" ($60) aparte del costo estándar ($50)');
select pg_temp.assert(
  (select sum((s ->> 'operator_pay')::numeric) from jsonb_array_elements(
     public.dashboard_facts(array['services'], array[:'A']::uuid[], :'today'::date, :'today'::date, 'total') -> 'services') s
    where s ->> 'service_name' = 'Lavado manual detallado') = 60,
  'ventas por servicio: el lavado manual trae su pago al operador');
select pg_temp.assert(
  (select (operator_pct, operator_pay, technician_name) = (30::numeric, 60::numeric, 'Toño Lavador')
     from public.corporate_order_lines(array[:'A']::uuid[], :'today'::date, :'today'::date, null, null, :'lmd')),
  'detalle a OS: % y pago de la línea y operador que lo realizó');
select pg_temp.assert(
  (select formula from public.metric_registry where id = 'pnl.contribution_margin') like '%pago a operadores%'
  and (select version from public.metric_registry where id = 'pnl.contribution_margin') = 2,
  'el margen de contribución registrado incluye el pago a operadores (versión 2)');
reset role;

rollback;
