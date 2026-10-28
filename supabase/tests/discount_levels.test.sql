-- Pruebas del nivel de autorización de descuentos al cambiar líneas (ADR 0044):
-- bajar cantidades o quitar líneas no puede subir el % de descuento acumulado
-- por encima del nivel de quien hace el cambio, en la OS y en la cotización.
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

create function pg_temp.v(p_id uuid) returns integer language sql as $$
  select version from public.service_orders where id = p_id
$$;

create function pg_temp.qv(p_id uuid) returns integer language sql as $$
  select version from public.quotes where id = p_id
$$;

-- Cambia la cantidad de una línea de la OS.
create function pg_temp.qty(p_order uuid, p_service uuid, p_quantity integer) returns public.service_orders
language sql as $$
  select public.set_service_order_item(p_order, pg_temp.v(p_order), p_service, p_quantity)
$$;

grant execute on all functions in schema pg_temp to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'LAV', 'Lavado', null, 'recurrente', 40, 500, 80)).id as lav \gset
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'POL', 'Pulido', null, 'valor_medio', 120, 2800, 900)).id as pol \gset
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client('aaaaaaaa-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001',
  'José Pérez', '5512345678', null, 'person', null, '{}', 'web',
  '[{"make":"Mazda","model":"3","year":2021,"plate":"ABC1234"}]'::jsonb)).id as c1 \gset
select id as v1 from public.vehicles where plate = 'ABC1234' \gset

-- ---------------------------------------------------------------------------
-- OS: descuento por importe en la línea y luego bajar la cantidad
-- ---------------------------------------------------------------------------
select (public.create_service_order('aaaaaaaa-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000001',
  :'c1', :'v1', jsonb_build_array(jsonb_build_object('service_id', :'lav', 'quantity', 10)))).id as o1 \gset
select id as lav_line from public.service_order_items where service_order_id = :'o1' \gset
select from public.add_service_order_discount(:'o1', pg_temp.v(:'o1'), :'lav_line', 'amount', 500, 'Cliente frecuente');
select pg_temp.assert(
  (select (subtotal, discount_total, total) = (5000::numeric, 500::numeric, 4500::numeric) from public.service_orders where id = :'o1')
  and (select authorization_level = 'operador' from public.service_order_discounts where service_order_id = :'o1'),
  'recepción aplica $500 sobre 10 lavados (10 %, nivel operador)');
select pg_temp.assert_fails($$select pg_temp.qty('$$ || :'o1' || $$', '$$ || :'lav' || $$', 1)$$,
  '42501', 'recepción no baja a 1 lavado: el descuento sube a 100 % y exige nivel admin');
select pg_temp.assert(
  (select (subtotal, total) = (5000::numeric, 4500::numeric) from public.service_orders where id = :'o1')
  and (select quantity = 10 from public.service_order_items where id = :'lav_line'),
  'el cambio rechazado no toca la OS');
select pg_temp.assert(
  (select total = 5500 from pg_temp.qty(:'o1', :'lav', 12)),
  'subir la cantidad baja el % y no pide autorización');
select pg_temp.assert(
  (select total = 4500 from pg_temp.qty(:'o1', :'lav', 10)),
  'regresar a un % que no supera el nivel de recepción (10 %) se permite');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select pg_temp.qty('$$ || :'o1' || $$', '$$ || :'lav' || $$', 2)$$,
  '42501', 'el encargado no baja a 2 lavados: 50 % exige nivel admin');
select pg_temp.assert(
  (select total = 1500 from pg_temp.qty(:'o1', :'lav', 4)),
  'el encargado sí baja a 4 lavados: 25 % está en su nivel');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(
  (select (subtotal, total) = (500::numeric, 0::numeric) from pg_temp.qty(:'o1', :'lav', 1)),
  'el admin puede dejar el descuento en 100 %');
reset role;

-- ---------------------------------------------------------------------------
-- OS: descuento general por importe y luego quitar otra línea
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_service_order('aaaaaaaa-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000002',
  :'c1', :'v1', jsonb_build_array(jsonb_build_object('service_id', :'lav'), jsonb_build_object('service_id', :'pol')))).id as o2 \gset
select from public.add_service_order_discount(:'o2', pg_temp.v(:'o2'), null, 'amount', 300, 'Cliente frecuente');
select pg_temp.assert_fails($$select pg_temp.qty('$$ || :'o2' || $$', '$$ || :'pol' || $$', 0)$$,
  '42501', 'recepción no quita el pulido: el descuento general de $300 pasaría a 60 % del lavado');
select pg_temp.assert(
  (select (subtotal, total) = (3300::numeric, 3000::numeric) from public.service_orders where id = :'o2'),
  'la OS conserva sus dos líneas');

-- ---------------------------------------------------------------------------
-- Cotización: misma regla antes de convertirse en OS
-- ---------------------------------------------------------------------------
select (public.create_quote('aaaaaaaa-0000-0000-0000-000000000000', '40000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object('service_id', :'lav', 'quantity', 10)), null, :'c1', :'v1')).id as q \gset
select id as q_line from public.quote_items where quote_id = :'q' \gset
select from public.add_quote_discount(:'q', pg_temp.qv(:'q'), :'q_line', 'amount', 500, 'Cliente frecuente');
select pg_temp.assert_fails($$select public.set_quote_item('$$ || :'q' || $$', pg_temp.qv('$$ || :'q' || $$'),
  '$$ || :'lav' || $$', 1)$$,
  '42501', 'recepción no baja la cotización a 1 lavado con el descuento de $500');
select pg_temp.assert(
  (select (subtotal, total) = (5000::numeric, 4500::numeric) from public.quotes where id = :'q'),
  'la cotización conserva su cantidad');
select pg_temp.assert(
  (select total = 5500 from public.set_quote_item(:'q', pg_temp.qv(:'q'), :'lav', 12)),
  'en la cotización también se puede subir la cantidad');
reset role;

rollback;
