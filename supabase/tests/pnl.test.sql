-- Pruebas de AF4: P&L multicentro con un dataset conocido. Ventas reconocidas
-- por OS entregada (no por cobros), por canal y por motor (con descuento
-- general), membresías y cuotas B2B; costo directo; gastos; fuera del P&L;
-- cada cifra rastreable a sus movimientos; consolidado = suma de centros
-- autorizados; periodos reproducibles (frontera del día del centro); permisos.
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

create function pg_temp.v(p_id uuid) returns integer language sql security definer as $$
  select version from public.service_orders where id = p_id
$$;

-- Entrega (fixture): la ejecución y el cobro no son parte de esta prueba.
create function pg_temp.deliver(p_id uuid, p_at timestamptz, p_channel text default null) returns void
language plpgsql as $$
begin
  perform set_config('session_replication_role', 'replica', true);
  update public.service_orders
     set status = 'entregada', started_at = p_at - interval '2 hours', finished_at = p_at - interval '1 hour',
         delivered_at = p_at, channel = coalesce(p_channel::public.sales_channel, channel)
   where id = p_id;
  perform set_config('session_replication_role', 'origin', true);
end $$;

-- Suma de una línea del P&L (centro o varios).
create function pg_temp.line(p_centers uuid[], p_from date, p_to date, p_section text, p_line text default null)
returns numeric language sql as $$
  select coalesce(sum(amount), 0) from public.pnl_lines(p_centers, p_from, p_to)
   where section = p_section and (p_line is null or line = p_line)
$$;

-- Σ total de las OS entregadas en el día del centro (lectura directa, sin RLS).
create function pg_temp.delivered_total(p_center uuid, p_day date) returns numeric language sql security definer as $$
  select sum(total) from public.service_orders
   where detail_center_id = p_center and status = 'entregada'
     and (delivered_at at time zone 'America/Mexico_City')::date = p_day
$$;

grant execute on all functions in schema pg_temp to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@a'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000e2', 'encargado@b'),
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
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'contador'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e2', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion');

\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set B 'bbbbbbbb-0000-0000-0000-000000000000'
\set ORG '0e000000-0000-0000-0000-000000000001'
select private.center_today(:'A') as today \gset
select (:'today'::date - 1) as yesterday \gset

-- ---------------------------------------------------------------------------
-- Dataset conocido
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service(:'ORG', 'LAV', 'Lavado', null, 'recurrente', 40, 250, 80)).id as lav \gset
select (public.create_service(:'ORG', 'POL', 'Pulido', null, 'valor_medio', 120, 2800, 900)).id as pol \gset
select (public.create_service(:'ORG', 'CER', 'Cerámico', null, 'premium', 480, 5000, 1500)).id as cer \gset
select (public.upsert_membership_plan(:'ORG', null, 'CARE', 'care', 'Care', null, 449, 1::smallint, 'centro_origen', null,
  7::smallint, null, null, true, 'Alta del plan')).id as care \gset
select from public.set_membership_benefit(:'care', :'lav', 2::smallint, null, 'Beneficio del plan');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000001', 'Ana Ruiz', '5511112222', null, 'person', null,
  '{}', 'web', '[{"make":"Kia","model":"Rio","year":2022,"plate":"ANA0001"}]'::jsonb)).id as ana \gset
select id as ana_car from public.vehicles where plate = 'ANA0001' \gset
-- O1: pulido + 2 lavados = $3,300, descuento general de $300 → $3,000; costo $1,060.
select (public.create_service_order(:'A', '30000000-0000-4000-8000-000000000001', :'ana', :'ana_car',
  jsonb_build_array(jsonb_build_object('service_id', :'pol'), jsonb_build_object('service_id', :'lav', 'quantity', 2)))).id as o1 \gset
-- O2: cerámico $5,000 (canal B2B), costo $1,500.
select (public.create_service_order(:'A', '30000000-0000-4000-8000-000000000002', :'ana', :'ana_car',
  jsonb_build_array(jsonb_build_object('service_id', :'cer')))).id as o2 \gset
-- O3: lavado $250 entregado hoy a las 00:30 (cuenta hoy).
select (public.create_service_order(:'A', '30000000-0000-4000-8000-000000000003', :'ana', :'ana_car',
  jsonb_build_array(jsonb_build_object('service_id', :'lav')))).id as o3 \gset
-- O4: lavado $250 entregado ayer a las 23:30 (no cuenta hoy).
select (public.create_service_order(:'A', '30000000-0000-4000-8000-000000000004', :'ana', :'ana_car',
  jsonb_build_array(jsonb_build_object('service_id', :'lav')))).id as o4 \gset
-- O6: terminada pero no entregada: no es venta aunque esté cobrada.
select (public.create_service_order(:'A', '30000000-0000-4000-8000-000000000006', :'ana', :'ana_car',
  jsonb_build_array(jsonb_build_object('service_id', :'pol')))).id as o6 \gset
select from public.set_service_order_status(:'o6', pg_temp.v(:'o6'), 'autorizada');
select from public.register_payment(:'o6', pg_temp.v(:'o6'), gen_random_uuid(), '[{"method":"efectivo","amount":2800}]'::jsonb);
select from public.create_membership(:'A', gen_random_uuid(), :'care', :'ana', :'ana_car', null, 'Efectivo');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select from public.add_service_order_discount(:'o1', pg_temp.v(:'o1'), null, 'amount', 300, 'Cliente frecuente');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select (public.create_client(:'B', '10000000-0000-4000-8000-000000000005', 'Beto Luna', '5599998888', null, 'person', null,
  '{}', 'web', '[{"make":"VW","model":"Vento","year":2021,"plate":"BET0001"}]'::jsonb)).id as beto \gset
select id as beto_car from public.vehicles where plate = 'BET0001' \gset
-- O5 (centro B): pulido $2,800, costo $900.
select (public.create_service_order(:'B', '30000000-0000-4000-8000-000000000005', :'beto', :'beto_car',
  jsonb_build_array(jsonb_build_object('service_id', :'pol')))).id as o5 \gset
reset role;

set local app.change_reason = 'Dataset de prueba';
select pg_temp.deliver(:'o1', now());
select pg_temp.deliver(:'o2', now(), 'b2b');
select pg_temp.deliver(:'o3', (:'today'::date + time '00:30') at time zone 'America/Mexico_City');
select pg_temp.deliver(:'o4', (:'yesterday'::date + time '23:30') at time zone 'America/Mexico_City');
select pg_temp.deliver(:'o5', now());
update public.service_orders set status = 'terminada' where id = :'o6';

-- Variación de insumos en O1: 1.5 L reales vs 1 L estándar a $20/L = +$10.
insert into public.inventory_items (id, organization_id, code, name, unit, unit_cost)
values ('1e000000-0000-4000-8000-000000000001', :'ORG', 'CERA-1', 'Cera líquida', 'l', 20);
insert into public.service_order_consumptions (organization_id, detail_center_id, service_order_id, item_id,
  inventory_item_id, unit, standard_quantity, actual_quantity, unit_cost)
select :'ORG', :'A', :'o1', i.id, '1e000000-0000-4000-8000-000000000001', 'l', 1, 1.5, 20
  from public.service_order_items i where i.service_order_id = :'o1' and i.service_code = 'POL';

-- Cuota B2B: iguala mensual de $1,000 que inicia hoy, cuenta gestionada por A.
insert into public.b2b_accounts (id, organization_id, home_detail_center_id, client_id, name, request_id)
values ('2e000000-0000-4000-8000-000000000001', :'ORG', :'A', :'ana', 'Flotillas SA', gen_random_uuid());
insert into public.b2b_agreements (organization_id, account_id, name, billing_model, starts_on, ends_on, fee_amount,
  included_units, request_id)
values (:'ORG', '2e000000-0000-4000-8000-000000000001', 'Iguala 2026', 'iguala', :'today', :'today'::date + 365, 1000, 4,
  gen_random_uuid());
reset app.change_reason;

-- Egresos: umbral de $5,000 en A; el encargado captura.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select from public.set_expense_approval_threshold(:'A', 5000, 'Política de aprobación');
reset role;
create function pg_temp.cat(p_code text) returns uuid language sql security definer as $$
  select id from public.expense_categories where code = p_code
$$;
grant execute on function pg_temp.cat(text) to authenticated;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select from public.create_expense(:'A', gen_random_uuid(), pg_temp.cat('nomina'), null, 'Nómina semanal', 1000, 'transferencia', :'today');
select from public.create_expense(:'A', gen_random_uuid(), pg_temp.cat('renta'), null, 'Renta proporcional', 500, 'transferencia', :'today');
select from public.create_expense(:'A', gen_random_uuid(), pg_temp.cat('marketing'), null, 'Anuncios', 200, 'tarjeta', :'today');
select from public.create_expense(:'A', gen_random_uuid(), pg_temp.cat('comisiones_bancarias'), null, 'Comisión terminal', 50, 'transferencia', :'today');
select from public.create_expense(:'A', gen_random_uuid(), pg_temp.cat('subcontratos'), null, 'Pintura subcontratada', 100, 'efectivo', :'today');
select from public.create_expense(:'A', gen_random_uuid(), pg_temp.cat('insumos'), null, 'Compra de cera', 700, 'efectivo', :'today');
select from public.create_expense(:'A', gen_random_uuid(), pg_temp.cat('nomina'), null, 'Bono trimestral', 6000, 'transferencia', :'today');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select from public.create_expense(:'B', gen_random_uuid(), pg_temp.cat('renta'), null, 'Renta B', 300, 'transferencia', :'today');
reset role;

-- ---------------------------------------------------------------------------
-- P&L del centro A (hoy)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
create temp table la as select * from public.pnl_lines(array[:'A'::uuid], :'today', :'today');
select pg_temp.assert(
  (select string_agg(line || '=' || s, ',' order by line) from
     (select line, sum(amount) as s from la where section = 'ingreso' group by line) x)
    = 'b2b=5000.00,b2c=3250.00,cuotas_b2b=1000.00,membresias=449.00',
  'ventas por canal: B2C $3,250 (O1 con descuento + O3 a las 00:30), B2B $5,000, membresías $449 y cuota B2B $1,000; O4 (ayer 23:30) y O6 (terminada y cobrada) no son venta');
select pg_temp.assert(
  (select string_agg(dimension || '=' || s, ',' order by dimension) from
     (select dimension, sum(amount) as s from la where section = 'ingreso' group by dimension) x)
    = 'cuota_b2b=1000.00,descuento_os=-300.00,membresia=449.00,premium=5000.00,recurrente=750.00,valor_medio=2800.00',
  'ventas por motor: el descuento general de la OS aparece aparte y el total cuadra con el canal ($9,699)');
select pg_temp.assert(
  (select sum(amount) from la where section = 'ingreso') = 9699
  and (select sum(amount) from la where section = 'ingreso' and line in ('b2c', 'b2b'))
      = pg_temp.delivered_total(:'A', :'today'),
  'ventas de OS = Σ total de las OS entregadas en el periodo (no los cobros)');
select pg_temp.assert(
  (select string_agg(line || '=' || s, ',' order by line) from
     (select line, sum(amount) as s from la where section = 'costo_directo' group by line) x)
    = 'egresos_costo_directo=100.00,estandar=2640.00,variacion_insumos=10.00',
  'costo directo: estándar $2,640 + variación de insumos $10 + subcontratos $100 = $2,750');
select pg_temp.assert(
  (select string_agg(line || '=' || s, ',' order by line) from
     (select line, sum(amount) as s from la where section = 'gasto' group by line) x)
    = 'financiero=50.00,marketing=200.00,operativo=500.00,personal=1000.00',
  'gastos aprobados por grupo; el bono de $6,000 (pendiente) no cuenta');
select pg_temp.assert(
  (select string_agg(line || ':' || coalesce(dimension, '') || '=' || amount, ',' order by line) from la where section = 'fuera_pnl')
    = 'insumos:=700.00,pendiente:personal=6000.00',
  'fuera del P&L: compra de insumos (salida de caja) y egresos pendientes');

-- Utilidades y márgenes con el dataset conocido (mismas fórmulas que @meguiars/analytics).
select pg_temp.assert(
  pg_temp.line(array[:'A'::uuid], :'today', :'today', 'ingreso') - pg_temp.line(array[:'A'::uuid], :'today', :'today', 'costo_directo') = 6949
  and round(6949 * 100.0 / 9699, 2) = 71.65,
  'utilidad bruta $6,949 (margen 71.65 %)');
select pg_temp.assert(
  6949 - (pg_temp.line(array[:'A'::uuid], :'today', :'today', 'gasto') - pg_temp.line(array[:'A'::uuid], :'today', :'today', 'gasto', 'financiero')) = 5249
  and round(5249 * 100.0 / 9699, 2) = 54.12
  and 5249 - pg_temp.line(array[:'A'::uuid], :'today', :'today', 'gasto', 'financiero') = 5199,
  'EBITDA gerencial $5,249 (54.12 %) = bruta − personal − operativos; UAI $5,199 tras financieros');

-- Rastreabilidad: cada línea = Σ de sus movimientos.
select pg_temp.assert(
  not exists (
    select 1 from la l
     where l.amount <> (select coalesce(sum(d.amount), 0)
                          from public.pnl_drilldown(array[:'A'::uuid], :'today', :'today', l.section, l.line,
                                                    coalesce(l.dimension, '-')) d)),
  'cada cifra del P&L es la suma exacta de sus movimientos fuente (drill-down)');
select pg_temp.assert(
  (select string_agg(reference || ' ' || description || ' ' || amount, ' | ' order by description)
     from public.pnl_drilldown(array[:'A'::uuid], :'today', :'today', 'ingreso', 'b2c'))
    = 'A-01-000001 Descuento general de la OS -300.00 | A-01-000003 Lavado × 1 250.00 | A-01-000001 Lavado × 2 500.00 | A-01-000001 Pulido × 1 2800.00',
  'drill-down de ventas B2C: líneas y descuento de cada OS con su folio');
select pg_temp.assert(
  (select source || ':' || reference || ':' || description from public.pnl_drilldown(array[:'A'::uuid], :'today', :'today', 'costo_directo', 'variacion_insumos'))
    = 'service_orders:A-01-000001:Cera líquida 1.500 vs 1.000 l',
  'la variación de insumos se rastrea a la OS y al insumo');
select pg_temp.assert(
  (select count(*) from public.pnl_drilldown(array[:'A'::uuid], :'today', :'today', 'gasto') where source = 'expenses') = 4,
  'los gastos se rastrean a sus egresos');
reset role;

-- ---------------------------------------------------------------------------
-- Consolidado, periodos y permisos
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
create temp table lab as select * from public.pnl_lines(array[:'A'::uuid, :'B'::uuid], :'today', :'today');
select pg_temp.assert(
  (select sum(amount) from lab where section = 'ingreso') = 12499
  and (select sum(amount) from lab where detail_center_id = :'B' and section = 'ingreso') = 2800
  and not exists (
    select 1 from (select section, line, dimension, sum(amount) as s from lab group by 1, 2, 3) c
     where c.s <> (select coalesce(sum(x.amount), 0)
                     from (select * from public.pnl_lines(array[:'A'::uuid], :'today', :'today')
                           union all select * from public.pnl_lines(array[:'B'::uuid], :'today', :'today')) x
                    where x.section = c.section and x.line = c.line and x.dimension is not distinct from c.dimension)),
  'consolidado = suma coherente de los centros (ventas $12,499 = A $9,699 + B $2,800)');
select pg_temp.assert(
  pg_temp.line(array[:'A'::uuid], :'yesterday', :'today', 'ingreso') = 9949
  and pg_temp.line(array[:'A'::uuid], :'yesterday', :'yesterday', 'ingreso') = 250,
  'periodo: la entrega de ayer a las 23:30 cuenta ayer; el rango de dos días suma ambos');
select pg_temp.assert(
  (select string_agg(section || line || coalesce(dimension, '') || amount, ',' order by 1) from public.pnl_lines(array[:'A'::uuid], :'today', :'today'))
    = (select string_agg(section || line || coalesce(dimension, '') || amount, ',' order by 1) from public.pnl_lines(array[:'A'::uuid], :'today', :'today')),
  'filtro reproducible: el mismo periodo da el mismo resultado');
select pg_temp.assert_fails($$select * from public.pnl_lines(array['$$ || :'A' || $$'::uuid], current_date, current_date - 1)$$,
  '22023', 'periodo inválido (fin antes del inicio)');
select pg_temp.assert_fails($$select * from public.pnl_lines(array['$$ || :'A' || $$'::uuid], current_date - 1200, current_date)$$,
  '22023', 'periodo de más de 3 años');
select pg_temp.assert_fails($$select * from public.pnl_drilldown(array['$$ || :'A' || $$'::uuid], current_date, current_date, 'caja')$$,
  '22023', 'sección del drill-down inválida');
select pg_temp.assert(
  (select sum(amount) from public.pnl_facts(array[:'A'::uuid], :'today', :'today') where section = 'ingreso') = 9699
  and (select amount from public.pnl_facts(array[:'A'::uuid], :'today', :'today') where section = 'egreso' and item = 'insumos') = 700,
  'pnl_facts (AF2) sale de los mismos movimientos');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select pg_temp.assert(
  (select sum(amount) from public.pnl_lines(array[:'A'::uuid, :'B'::uuid], :'today', :'today') where section = 'ingreso') = 2800
  and not exists (select 1 from public.pnl_drilldown(array[:'A'::uuid], :'today', :'today', 'ingreso')),
  'el encargado de B sólo ve su centro: el consolidado suma únicamente centros autorizados');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  not exists (select 1 from public.pnl_lines(array[:'A'::uuid], :'today', :'today'))
  and not exists (select 1 from public.pnl_drilldown(array[:'A'::uuid], :'today', :'today', 'gasto')),
  'recepción no ve el P&L');
select pg_temp.assert_fails($$select private.pnl_movements(array['$$ || :'A' || $$'::uuid], current_date, current_date)$$,
  '42501', 'los movimientos internos no se llaman directo');
reset role;

rollback;
