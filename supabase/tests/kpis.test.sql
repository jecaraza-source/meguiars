-- Pruebas de D2: KPIs de rentabilidad y gestión. Dataset fixture con valores
-- esperados para las fuentes nuevas de public.dashboard_facts (OS entregadas,
-- recursos del centro, clientes) y parámetros gerenciales; permisos por centro
-- y registro de las métricas. Los mismos números están en
-- packages/analytics/src/kpis/kpis.test.ts (cálculo de cada KPI).
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

-- Entrega (fixture) con marcas de trabajo opcionales y canal.
create function pg_temp.deliver(p_id uuid, p_at timestamptz, p_minutes integer, p_channel text default null)
returns void language plpgsql as $$
begin
  perform set_config('session_replication_role', 'replica', true);
  update public.service_orders
     set status = 'entregada',
         started_at = case when p_minutes is null then null else p_at - make_interval(mins => p_minutes + 10) end,
         finished_at = case when p_minutes is null then null else p_at - interval '10 minutes' end,
         delivered_at = p_at, channel = coalesce(p_channel::public.sales_channel, channel)
   where id = p_id;
  perform set_config('session_replication_role', 'origin', true);
end $$;

-- Suma de un campo de una fuente de hechos.
create function pg_temp.total(p_facts jsonb, p_source text, p_field text) returns numeric language sql as $$
  select coalesce(sum((f ->> p_field)::numeric), 0) from jsonb_array_elements(p_facts -> p_source) f
$$;

grant execute on all functions in schema pg_temp to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@a'),
  ('00000000-0000-0000-0000-0000000000e2', 'encargado@b'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000b1', 'comercial@a');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Monterrey');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'contador'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e2', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'comercial_b2b');

\set O1 '0e000000-0000-0000-0000-000000000001'
\set A 'aaaaaaaa-0000-0000-0000-000000000000'
select private.center_today(:'A') as today \gset
-- Mediodía local de un día del centro.
create function pg_temp.at(p_day date) returns timestamptz language sql as $$
  select (p_day + time '12:00') at time zone 'America/Mexico_City'
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- Registro: métricas de D2 con su fuente y permiso.
select pg_temp.assert(
  (select count(*) from public.metric_registry where source in ('orders', 'upsell', 'customers')) = 11
  and (select capability from public.metric_registry where id = 'customers.ltv') = 'customers.metrics.read'
  and (select filters from public.metric_registry where id = 'pnl.contribution_margin') = '{motor}',
  'las métricas de D2 están registradas con fuente, permiso y filtros');

-- Parámetros gerenciales: valores por defecto, sólo el admin corporativo los cambia.
select private.seed_default_dashboard(:'O1');
select from set_config('app.change_reason', 'Fixture', false);
insert into public.kpi_settings (organization_id) values (:'O1');
select from set_config('app.change_reason', '', false);
select pg_temp.assert(
  (select (ltv_lifetime_years, operating_hours_per_day, operating_days_per_week)
     = (3.00::numeric, 10.00::numeric, 6::smallint) from public.kpi_settings where organization_id = :'O1'),
  'parámetros por defecto: 3 años de vida, 10 horas y 6 días operativos');
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert_fails($$select public.set_kpi_settings('0e000000-0000-0000-0000-000000000001', 1, 5, 10, 6::smallint, 'Cambio')$$,
  '42501', 'el contador no cambia los parámetros');
select pg_temp.assert((select count(*) from public.kpi_settings) = 1, 'los miembros de la organización leen los parámetros');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert_fails($$select public.set_kpi_settings('0e000000-0000-0000-0000-000000000001', 1, 20, 10, 6::smallint, 'Cambio')$$,
  '22023', 'la vida esperada del LTV está acotada');
select pg_temp.assert_fails($$select public.set_kpi_settings('0e000000-0000-0000-0000-000000000001', 7, 5, 10, 6::smallint, 'Cambio')$$,
  '40001', 'una versión vieja se rechaza');
select pg_temp.assert_fails($$select public.set_kpi_settings('0e000000-0000-0000-0000-000000000001', 1, 5, 10, 6::smallint, null)$$,
  '22023', 'cambiar los parámetros exige motivo');
select pg_temp.assert(
  (public.set_kpi_settings(:'O1', 1, 4, 10, 6::smallint, 'Vida esperada según histórico')).version = 2,
  'el admin corporativo cambia los parámetros (versión)');
select from public.set_kpi_settings(:'O1', 2, 3, 10, 6::smallint, 'Regreso al valor por defecto');
reset role;
select pg_temp.assert(
  (select count(*) from public.audit_log where table_name = 'public.kpi_settings' and reason = 'Vida esperada según histórico') = 1,
  'el cambio de parámetros queda auditado');

-- Fixture: 2 bahías y 1 técnico activos en A; lavado $250 (40 min, costo $80) y
-- cera (producto) $200 (10 min, costo $60).
insert into public.bays (organization_id, detail_center_id, name, active) values
  (:'O1', :'A', 'Bahía 1', true), (:'O1', :'A', 'Bahía 2', true), (:'O1', :'A', 'Bahía vieja', false);
insert into public.technicians (organization_id, detail_center_id, full_name, active) values
  (:'O1', :'A', 'Técnico Uno', true), (:'O1', :'A', 'Técnico Dos', false);
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service(:'O1', 'LAV', 'Lavado', null, 'recurrente', 40, 250, 80)).id as lav \gset
select (public.create_service(:'O1', 'CERA', 'Cera', null, 'producto_complemento', 10, 200, 60)).id as cera \gset
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000001', 'Ana Ruiz', '5511112222', null, 'person', null,
  '{}', 'web', '[{"make":"Kia","model":"Rio","year":2022,"plate":"ANA0001"}]'::jsonb)).id as ana \gset
select id as ana_car from public.vehicles where plate = 'ANA0001' \gset
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000002', 'Beto Luna', '5599998888', null, 'person', null,
  '{}', 'web', '[{"make":"VW","model":"Jetta","year":2020,"plate":"BET0001"}]'::jsonb)).id as beto \gset
select id as beto_car from public.vehicles where plate = 'BET0001' \gset
-- o0: visita previa de Ana (fuera del periodo).
select (public.create_service_order(:'A', gen_random_uuid(), :'ana', :'ana_car',
  jsonb_build_array(jsonb_build_object('service_id', :'lav')))).id as o0 \gset
-- o1: Ana, lavado + cera = $450 (costo $140, 50 min estándar), 60 min reales.
select (public.create_service_order(:'A', gen_random_uuid(), :'ana', :'ana_car',
  jsonb_build_array(jsonb_build_object('service_id', :'lav'), jsonb_build_object('service_id', :'cera')))).id as o1 \gset
-- o2: Beto, lavado $250, 30 min reales, con retrabajo.
select (public.create_service_order(:'A', gen_random_uuid(), :'beto', :'beto_car',
  jsonb_build_array(jsonb_build_object('service_id', :'lav')))).id as o2 \gset
-- o3: Beto, lavado $250 por canal B2B, sin marcas de trabajo.
select (public.create_service_order(:'A', gen_random_uuid(), :'beto', :'beto_car',
  jsonb_build_array(jsonb_build_object('service_id', :'lav')))).id as o3 \gset
select from public.report_service_order_incident(:'o2', 'retrabajo', 'Quedaron marcas de agua');
reset role;
select pg_temp.deliver(:'o0', pg_temp.at(:'today'::date - 40), 40);
select pg_temp.deliver(:'o1', pg_temp.at(:'today'::date - 1), 60);
select pg_temp.deliver(:'o2', pg_temp.at(:'today'::date - 2), 30);
select pg_temp.deliver(:'o3', pg_temp.at(:'today'::date), null, 'b2b');

-- Hechos del periodo (7 días) como admin.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select public.dashboard_facts(array['orders', 'customers', 'upsell'], array[:'A'::uuid],
  :'today'::date - 6, :'today'::date, 'total') as f \gset
select pg_temp.assert(
  pg_temp.total(:'f', 'orders', 'orders') = 3
  and pg_temp.total(:'f', 'orders', 'sales') = 950
  and pg_temp.total(:'f', 'orders', 'product_sales') = 200
  and pg_temp.total(:'f', 'orders', 'standard_minutes') = 130
  and pg_temp.total(:'f', 'orders', 'timed_orders') = 2
  and pg_temp.total(:'f', 'orders', 'actual_minutes') = 90
  and pg_temp.total(:'f', 'orders', 'rework_orders') = 1,
  'OS del periodo: 3 vehículos, $950, $200 de productos, 130 min estándar, 90 min reales en 2 OS, 1 con retrabajo');
select pg_temp.assert(
  (select sum((o ->> 'orders')::int) from jsonb_array_elements(:'f'::jsonb -> 'orders') o where o ->> 'channel' = 'b2b') = 1,
  'las OS vienen por canal (filtro B2C/B2B)');
select pg_temp.assert(
  (:'f'::jsonb -> 'centers' -> 0 ->> 'bays')::int = 2 and (:'f'::jsonb -> 'centers' -> 0 ->> 'technicians')::int = 1
  and (:'f'::jsonb -> 'centers' -> 0 ->> 'operating_hours_per_day')::numeric = 10
  and (:'f'::jsonb -> 'centers' -> 0 ->> 'operating_days_per_week')::int = 6
  and (:'f'::jsonb -> 'centers' -> 0 ->> 'ltv_lifetime_years')::numeric = 3,
  'recursos del centro: 2 bahías y 1 técnico activos, 10 h × 6 días, 3 años de vida');
select pg_temp.assert(
  (select count(distinct c ->> 'client_key') from jsonb_array_elements(:'f'::jsonb -> 'customers') c) = 2
  and pg_temp.total(:'f', 'customers', 'visits') = 3
  and pg_temp.total(:'f', 'customers', 'sales') = 950
  and pg_temp.total(:'f', 'customers', 'cost') = 300
  and (select count(distinct c ->> 'client_key') from jsonb_array_elements(:'f'::jsonb -> 'customers') c
        where (c ->> 'prior_visit')::boolean) = 1,
  'clientes: 2 únicos, 3 visitas, $950 de venta y $300 de costo; 1 ya venía antes');
select pg_temp.assert(
  not exists (select 1 from jsonb_array_elements(:'f'::jsonb -> 'customers') c
               where c ->> 'client_key' in (:'ana', :'beto')),
  'los clientes viajan con llave anónima (sin ids ni datos personales)');
select pg_temp.assert(:'f'::jsonb ? 'upsell', 'la fuente de upselling viene en la misma llamada');
select pg_temp.assert(
  pg_temp.total(public.dashboard_facts(array['orders'], array[:'A'::uuid], :'today'::date - 6, :'today'::date, 'dia'),
                'orders', 'orders') = 3
  and jsonb_array_length(public.dashboard_facts(array['orders'], array[:'A'::uuid], :'today'::date - 6, :'today'::date, 'dia') -> 'orders') = 3,
  'serie diaria: una fila por día con OS');
reset role;

-- Permisos por centro.
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select public.dashboard_facts(array['orders', 'customers'], array[:'A'::uuid], :'today'::date - 6, :'today'::date, 'total') as fc \gset
select pg_temp.assert(
  jsonb_array_length(:'fc'::jsonb -> 'orders') = 0 and pg_temp.total(:'fc', 'customers', 'visits') = 3,
  'comercial B2B: sin OS/ventas (sin pnl.read) pero con indicadores de clientes');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select public.dashboard_facts(array['orders', 'customers'], array[:'A'::uuid], :'today'::date - 6, :'today'::date, 'total') as fo \gset
select pg_temp.assert(
  jsonb_array_length(:'fo'::jsonb -> 'orders') = 0 and jsonb_array_length(:'fo'::jsonb -> 'customers') = 0,
  'recepción: sin hechos de KPIs');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select public.dashboard_facts(array['orders', 'customers'], array[:'A'::uuid], :'today'::date - 6, :'today'::date, 'total') as fe \gset
select pg_temp.assert(
  jsonb_array_length(:'fe'::jsonb -> 'orders') = 0 and jsonb_array_length(:'fe'::jsonb -> 'customers') = 0
  and jsonb_array_length(:'fe'::jsonb -> 'centers') = 0,
  'un encargado no recibe hechos ni recursos de un centro ajeno');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select public.dashboard_facts(array['orders', 'customers'], array[:'A'::uuid], :'today'::date - 6, :'today'::date, 'total') as fk \gset
select pg_temp.assert(
  pg_temp.total(:'fk', 'orders', 'orders') = 3 and pg_temp.total(:'fk', 'customers', 'visits') = 3,
  'contador: KPIs de OS y clientes de su centro');
select pg_temp.assert_fails($$select public.dashboard_facts(array['clients'], array['aaaaaaaa-0000-0000-0000-000000000000'::uuid],
  current_date, current_date, 'total')$$, '22023', 'la fuente debe ser una de las registradas');
reset role;

rollback;
