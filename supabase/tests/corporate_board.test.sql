-- Pruebas de D3: tablero corporativo multicentro. Las ventas por servicio
-- (fuente "services" y public.corporate_order_lines) cuadran con el P&L sin
-- diferencias (incluido el descuento general de la OS), la fecha de inicio de
-- operación por centro, permisos por centro y umbrales de alerta (sólo el
-- admin corporativo, con versión, motivo y auditoría). Los mismos números
-- están en packages/analytics/src/corporate/corporate.test.ts.
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

-- Entrega (fixture) con canal y, opcional, un descuento general sobre el total.
create function pg_temp.deliver(p_id uuid, p_at timestamptz, p_channel text default null, p_discount numeric default 0)
returns void language plpgsql as $$
begin
  perform set_config('session_replication_role', 'replica', true);
  update public.service_orders
     set status = 'entregada', delivered_at = p_at, total = total - p_discount, discount_total = discount_total + p_discount,
         channel = coalesce(p_channel::public.sales_channel, channel)
   where id = p_id;
  perform set_config('session_replication_role', 'origin', true);
end $$;

create function pg_temp.total(p_facts jsonb, p_source text, p_field text) returns numeric language sql as $$
  select coalesce(sum((f ->> p_field)::numeric), 0) from jsonb_array_elements(p_facts -> p_source) f
$$;

grant execute on all functions in schema pg_temp to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@a'),
  ('00000000-0000-0000-0000-0000000000e2', 'encargado@b'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno'),
  ('0e000000-0000-0000-0000-000000000002', 'org-dos', 'Organización Dos');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Mexico_City'),
  ('cccccccc-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000002', 'C-01', 'Centro C', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'contador'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e2', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion');

\set O1 '0e000000-0000-0000-0000-000000000001'
\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set B 'bbbbbbbb-0000-0000-0000-000000000000'
select private.center_today(:'A') as today \gset
create function pg_temp.at(p_day date) returns timestamptz language sql as $$
  select (p_day + time '12:00') at time zone 'America/Mexico_City'
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- Fixture: lavado $250 (costo $80, recurrente) y cera $200 (producto, costo $60).
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service(:'O1', 'LAV', 'Lavado', null, 'recurrente', 40, 250, 80)).id as lav \gset
select (public.create_service(:'O1', 'CERA', 'Cera', null, 'producto_complemento', 10, 200, 60)).id as cera \gset
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000001', 'Ana Ruiz', '5511112222', null, 'person', null,
  '{}', 'web', '[{"make":"Kia","model":"Rio","year":2022,"plate":"ANA0001"}]'::jsonb)).id as ana \gset
select id as ana_car from public.vehicles where plate = 'ANA0001' \gset
-- o1: lavado + cera = $450 con $50 de descuento general (neto $400), B2C.
select (public.create_service_order(:'A', gen_random_uuid(), :'ana', :'ana_car',
  jsonb_build_array(jsonb_build_object('service_id', :'lav'), jsonb_build_object('service_id', :'cera')))).id as o1 \gset
-- o2: lavado $250 por canal B2B.
select (public.create_service_order(:'A', gen_random_uuid(), :'ana', :'ana_car',
  jsonb_build_array(jsonb_build_object('service_id', :'lav')))).id as o2 \gset
-- o0: lavado entregado hace 40 días (inicio de operación del centro A).
select (public.create_service_order(:'A', gen_random_uuid(), :'ana', :'ana_car',
  jsonb_build_array(jsonb_build_object('service_id', :'lav')))).id as o0 \gset
reset role;
select pg_temp.deliver(:'o1', pg_temp.at(:'today'::date - 1), null, 50);
select pg_temp.deliver(:'o2', pg_temp.at(:'today'::date), 'b2b');
select pg_temp.deliver(:'o0', pg_temp.at(:'today'::date - 40));

-- Hechos del periodo (7 días) como admin corporativo, dos centros.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select public.dashboard_facts(array['pnl', 'services'], array[:'A', :'B']::uuid[],
  :'today'::date - 6, :'today'::date, 'total') as f \gset
select pg_temp.assert(
  pg_temp.total(:'f', 'services', 'revenue') = 650
  and pg_temp.total(:'f', 'services', 'standard_cost') = 220
  and (select sum((s ->> 'revenue')::numeric) from jsonb_array_elements(:'f'::jsonb -> 'services') s
        where s ->> 'service_name' = 'Lavado') = 500
  and (select sum((s ->> 'quantity')::int) from jsonb_array_elements(:'f'::jsonb -> 'services') s
        where s ->> 'service_name' = 'Lavado') = 2
  and (select (s ->> 'revenue')::numeric from jsonb_array_elements(:'f'::jsonb -> 'services') s
        where s ->> 'engine' = 'descuento_os') = -50
  and (select s ->> 'kind' from jsonb_array_elements(:'f'::jsonb -> 'services') s
        where s ->> 'service_name' = 'Cera') = 'producto',
  'servicios del periodo: lavado $500 (2), cera $200 (producto), descuento general −$50; costo estándar $220');
select pg_temp.assert(
  pg_temp.total(:'f', 'services', 'revenue')
    = (select sum((p ->> 'amount')::numeric) from jsonb_array_elements(:'f'::jsonb -> 'pnl') p
        where p ->> 'section' = 'ingreso' and p ->> 'line' in ('b2c', 'membresia', 'b2b'))
  and pg_temp.total(:'f', 'services', 'standard_cost')
    = (select sum((p ->> 'amount')::numeric) from jsonb_array_elements(:'f'::jsonb -> 'pnl') p
        where p ->> 'section' = 'costo_directo' and p ->> 'line' = 'estandar'),
  'la venta y el costo estándar por servicio cuadran con el P&L sin diferencias');
select pg_temp.assert(
  (select sum((s ->> 'revenue')::numeric) from jsonb_array_elements(:'f'::jsonb -> 'services') s
    where s ->> 'channel' = 'b2b') = 250
  and (select sum((s ->> 'revenue')::numeric) from jsonb_array_elements(:'f'::jsonb -> 'services') s
        where s ->> 'engine' = 'recurrente') = 500,
  'los servicios vienen por canal y motor (drill-down canal/motor → servicio)');
select pg_temp.assert(
  (select (c ->> 'first_activity_on')::date from jsonb_array_elements(:'f'::jsonb -> 'centers') c
    where c ->> 'detail_center_id' = :'A') = :'today'::date - 40
  and (select c ->> 'first_activity_on' from jsonb_array_elements(:'f'::jsonb -> 'centers') c
        where c ->> 'detail_center_id' = :'B') is null
  and jsonb_array_length(:'f'::jsonb -> 'centers') = 2,
  'recursos por centro con fecha de inicio de operación (null sin actividad)');

-- Último nivel: líneas de OS de un servicio / motor / canal.
select pg_temp.assert(
  (select count(*) from public.corporate_order_lines(array[:'A']::uuid[], :'today'::date - 6, :'today'::date,
     null, null, :'lav')) = 2
  and (select sum(revenue) from public.corporate_order_lines(array[:'A']::uuid[], :'today'::date - 6, :'today'::date,
     'b2c', null, null)) = 400
  and (select count(*) from public.corporate_order_lines(array[:'A']::uuid[], :'today'::date - 6, :'today'::date,
     null, 'descuento_os', null)) = 1
  and (select string_agg(distinct folio, ',') from public.corporate_order_lines(array[:'A']::uuid[],
     :'today'::date - 6, :'today'::date, 'b2b', 'recurrente', :'lav')) is not null,
  'drill-down a OS: por servicio (2 líneas), canal B2C ($400 neto) y descuento general');
select pg_temp.assert_fails($$select * from public.corporate_order_lines(array[]::uuid[], current_date, current_date)$$,
  '22023', 'el detalle exige de 1 a 50 centros');
select pg_temp.assert_fails($$select * from public.corporate_order_lines(array['aaaaaaaa-0000-0000-0000-000000000000'::uuid],
  current_date, current_date - 1)$$, '22023', 'el detalle valida el periodo');
reset role;

-- Permisos: mismo criterio que el P&L.
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(
  (select count(*) from public.corporate_order_lines(array[:'A', :'B']::uuid[], :'today'::date - 6, :'today'::date)) = 4
  and pg_temp.total(public.dashboard_facts(array['services'], array[:'A', :'B']::uuid[], :'today'::date - 6,
      :'today'::date, 'total'), 'services', 'revenue') = 650,
  'contador: ve las ventas por servicio de su centro');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select pg_temp.assert(
  (select count(*) from public.corporate_order_lines(array[:'A']::uuid[], :'today'::date - 6, :'today'::date)) = 0
  and jsonb_array_length(public.dashboard_facts(array['services'], array[:'A']::uuid[], :'today'::date - 6,
      :'today'::date, 'total') -> 'services') = 0,
  'un encargado no ve las ventas por servicio de un centro ajeno');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  (select count(*) from public.corporate_order_lines(array[:'A']::uuid[], :'today'::date - 6, :'today'::date)) = 0,
  'recepción: sin detalle de ventas (sin pnl.read)');
reset role;

-- Umbrales de alerta.
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert_fails($$select public.set_kpi_threshold('0e000000-0000-0000-0000-000000000001', null, null,
  'pnl.revenue', null, null, 1000, null, 'Meta')$$, '42501', 'el contador no configura umbrales');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.set_kpi_threshold(:'O1', null, null, 'pnl.revenue', null, null, 1000, null, 'Venta mínima del periodo')).id as t1 \gset
select (public.set_kpi_threshold(:'O1', null, null, 'pnl.revenue', 'b2b', :'A', 100, 5000, 'Rango de venta B2B en A')).id as t2 \gset
select pg_temp.assert((select count(*) from public.kpi_thresholds) = 2,
  'el admin corporativo crea umbrales generales y por centro, con canal fijo');
select pg_temp.assert_fails($$select public.set_kpi_threshold('0e000000-0000-0000-0000-000000000001', null, null,
  'pnl.revenue', null, null, 500, null, 'Otra vez')$$, '23505', 'un umbral por métrica, canal y centro');
select pg_temp.assert_fails($$select public.set_kpi_threshold('0e000000-0000-0000-0000-000000000001', null, null,
  'pnl.ebitda', null, null, 500, 100, 'Rango al revés')$$, '22023', 'el mínimo debe ser menor que el máximo');
select pg_temp.assert_fails($$select public.set_kpi_threshold('0e000000-0000-0000-0000-000000000001', null, null,
  'pnl.ebitda', null, null, null, null, 'Vacío')$$, '22023', 'el umbral exige mínimo o máximo');
select pg_temp.assert_fails($$select public.set_kpi_threshold('0e000000-0000-0000-0000-000000000001', null, null,
  'membership.mrr', 'b2b', null, 1, null, 'Canal')$$, '22023', 'el canal fijo sólo en métricas que lo admiten');
select pg_temp.assert_fails($$select public.set_kpi_threshold('0e000000-0000-0000-0000-000000000001', null, null,
  'no.existe', null, null, 1, null, 'Métrica')$$, '22023', 'sólo métricas registradas');
select pg_temp.assert_fails($$select public.set_kpi_threshold('0e000000-0000-0000-0000-000000000001', null, null,
  'pnl.ebitda', null, 'cccccccc-0000-0000-0000-000000000000', 1, null, 'Centro ajeno')$$, '22023',
  'el centro debe ser de la organización');
select pg_temp.assert_fails($$select public.set_kpi_threshold('0e000000-0000-0000-0000-000000000001', null, null,
  'pnl.ebitda', null, null, 1, null, null)$$, '22023', 'configurar un umbral exige motivo');
select pg_temp.assert_fails(format($$select public.set_kpi_threshold(%L, %L, 9, 'pnl.revenue', null, null, 900, null, 'Viejo')$$,
  :'O1', :'t1'), '40001', 'una versión vieja se rechaza');
select pg_temp.assert(
  (public.set_kpi_threshold(:'O1', :'t1', 1, 'pnl.revenue', null, null, 900, null, 'Ajuste de meta')).version = 2,
  'el admin corporativo cambia un umbral (versión)');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select pg_temp.assert((select count(*) from public.kpi_thresholds) = 2, 'los miembros de la organización leen los umbrales');
select pg_temp.assert_fails(format($$select public.delete_kpi_threshold(%L, 'Borrar')$$, :'t2'), '42501',
  'un encargado no borra umbrales');
select pg_temp.assert_fails($$insert into public.kpi_thresholds (organization_id, metric_id, min_value)
  values ('0e000000-0000-0000-0000-000000000001', 'pnl.ebitda', 1)$$, '42501', 'sin escritura directa en umbrales');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select public.delete_kpi_threshold(:'t2', 'Ya no aplica');
select pg_temp.assert((select count(*) from public.kpi_thresholds) = 1, 'el admin corporativo borra un umbral');
reset role;
select pg_temp.assert(
  (select count(*) from public.audit_log where table_name = 'public.kpi_thresholds'
     and reason in ('Venta mínima del periodo', 'Ajuste de meta', 'Ya no aplica')) = 3,
  'los cambios de umbrales quedan auditados con su motivo');

rollback;
