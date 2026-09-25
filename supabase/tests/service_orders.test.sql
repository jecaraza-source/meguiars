-- Pruebas de O4: Orden de Servicio (folio, snapshot, líneas con precio
-- congelado, totales server-side, descuentos por nivel, estatus y reglas por
-- canal, cobro, versión concurrente, vínculo con la cita y RLS).
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

-- Versión vigente de la OS (la que web o móvil acaban de leer).
create function pg_temp.v(p_id uuid) returns integer language sql as $$
  select version from public.service_orders where id = p_id
$$;

grant execute on all functions in schema pg_temp to authenticated, anon;

-- Org O1: centro A (Ciudad de México) y B (Monterrey).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@o1'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000f2', 'operador@b');
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
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion');

-- Catálogo (admin corporativo), bahía y técnico (encargado).
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'LAV', 'Lavado', null, 'recurrente', 40, 250, 80)).id as lavado \gset
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'POL', 'Pulido', null, 'valor_medio', 120, 2800, 900)).id as pulido \gset
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'AROM', 'Aromatizante', null, 'producto_complemento', 5, 90, 30)).id as aroma \gset
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select (public.upsert_bay('aaaaaaaa-0000-0000-0000-000000000000', null, 'Bahía 1', true, 'Alta de bahía')).id as bay1 \gset
select (public.upsert_technician('aaaaaaaa-0000-0000-0000-000000000000', null, 'Toño Ruiz', true, 'Alta de técnico')).id as tech1 \gset
reset role;

-- Clientes (O1) del operador de A.
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client('aaaaaaaa-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001',
  'José Pérez', '5512345678', 'jose@example.com', 'person', null, '{}', 'web',
  '[{"make":"Mazda","model":"3","year":2021,"plate":"ABC1234"}]'::jsonb)).id as client \gset
select id as vehicle from public.vehicles where plate = 'ABC1234' \gset
select (public.create_client('aaaaaaaa-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000002',
  'Flotillas SA', '5598765432', null, 'company', null, '{}', 'web',
  '[{"make":"Nissan","model":"NP300","year":2020,"plate":"XYZ999"}]'::jsonb)).id as client2 \gset
select id as vehicle2 from public.vehicles where plate = 'XYZ999' \gset

-- ---------------------------------------------------------------------------
-- Alta walk-in: folio, snapshot, líneas congeladas y totales
-- ---------------------------------------------------------------------------
select (public.create_service_order('aaaaaaaa-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000001',
  :'client', :'vehicle',
  jsonb_build_array(jsonb_build_object('service_id', :'lavado', 'quantity', 1),
                    jsonb_build_object('service_id', :'pulido', 'quantity', 1),
                    jsonb_build_object('service_id', :'aroma', 'quantity', 2)),
  'b2c', null, :'bay1', :'tech1', 'Rayón en puerta trasera', 45210)).id as o1 \gset
select pg_temp.assert(
  (select folio = 'A-01-000001' and status = 'abierta' and version >= 1 from public.service_orders where id = :'o1'),
  'la OS nace abierta con folio legible del centro');
select pg_temp.assert(
  (select client_name = 'José Pérez' and client_phone = '+525512345678' and vehicle_plate = 'ABC1234'
       and vehicle_make = 'Mazda' and odometer_km = 45210 and bay_id = :'bay1' and technician_id = :'tech1'
     from public.service_orders where id = :'o1'),
  'snapshot de cliente y vehículo, kilometraje, bahía y técnico');
select pg_temp.assert(
  (select subtotal = 3230 and discount_total = 0 and total = 3230 and cost_total = 1040 and estimated_minutes = 170
     from public.service_orders where id = :'o1'),
  'totales calculados en la base: 250 + 2800 + 2 × 90 = 3230; costo 1040; 170 min');
select pg_temp.assert(
  (select array_agg(kind || ':' || service_code || ':' || unit_price::text order by position)
     = '{servicio:LAV:250.00,servicio:POL:2800.00,producto:AROM:90.00}'
     from public.service_order_items where service_order_id = :'o1'),
  'líneas de servicio y producto con precio congelado');
select pg_temp.assert(
  (public.create_service_order('aaaaaaaa-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000001',
    :'client', :'vehicle', jsonb_build_array(jsonb_build_object('service_id', :'lavado')))).id = :'o1',
  'crear OS es idempotente por request_id (doble envío o web + móvil)');
select pg_temp.assert(
  (select last_visit_at is not null from public.clients where id = :'client'),
  'el walk-in registra la visita del cliente (O1)');
select pg_temp.assert_fails($$select public.create_service_order('aaaaaaaa-0000-0000-0000-000000000000',
    '30000000-0000-4000-8000-000000000009', '$$ || :'client' || $$', '$$ || :'vehicle2' || $$',
    '[{"service_id":"$$ || :'lavado' || $$"}]')$$,
  '22023', 'el vehículo debe ser del cliente');
select pg_temp.assert_fails($$select public.create_service_order('aaaaaaaa-0000-0000-0000-000000000000',
    '30000000-0000-4000-8000-000000000009', '$$ || :'client' || $$', '$$ || :'vehicle' || $$', '[]')$$,
  '22023', 'la OS requiere al menos una línea');
select pg_temp.assert_fails($$select public.create_service_order('aaaaaaaa-0000-0000-0000-000000000000',
    '30000000-0000-4000-8000-000000000009', '$$ || :'client' || $$', '$$ || :'vehicle' || $$',
    '[{"service_id":"$$ || :'lavado' || $$","quantity":0}]')$$,
  '22023', 'cantidad fuera de rango');

-- ---------------------------------------------------------------------------
-- Precios históricos congelados
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select from public.update_service(:'lavado', 'Lavado', null, 'recurrente', 40, 300, 90, true, 'Ajuste de precio 2026');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select from public.set_service_order_item(:'o1', pg_temp.v(:'o1'), :'lavado', 2);
select pg_temp.assert(
  (select unit_price = 250 and line_subtotal = 500 from public.service_order_items
    where service_order_id = :'o1' and service_code = 'LAV'),
  'subir el precio del catálogo no altera la línea: 2 × 250 congelado');
select pg_temp.assert(
  (select subtotal = 3480 and cost_total = 1120 from public.service_orders where id = :'o1'),
  'los totales se recalculan con la cantidad nueva');
select (public.create_service_order('aaaaaaaa-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000002',
  :'client', :'vehicle', jsonb_build_array(jsonb_build_object('service_id', :'lavado')))).id as o2 \gset
select pg_temp.assert(
  (select folio = 'A-01-000002' and total = 300 from public.service_orders where id = :'o2'),
  'una OS nueva toma el precio vigente y el siguiente folio');
select from public.set_service_order_item(:'o1', pg_temp.v(:'o1'), :'lavado', 1);

-- ---------------------------------------------------------------------------
-- Concurrencia optimista y reglas de integridad
-- ---------------------------------------------------------------------------
select pg_temp.v(:'o1') as stale \gset
select from public.update_service_order_details(:'o1', pg_temp.v(:'o1'), 'b2c', null, :'bay1', :'tech1',
  'Pintura con micro rayones', 'Rayón en puerta trasera', null, null, null, null, 45210, null);
select pg_temp.assert_fails($$select public.set_service_order_item('$$ || :'o1' || $$', $$ || :'stale' || $$,
    '$$ || :'aroma' || $$', 1)$$,
  '40001', 'una versión vieja (otro dispositivo guardó antes) se rechaza');
select pg_temp.assert_fails($$update public.service_orders set total = 1 where id = '$$ || :'o1' || $$'$$,
  '23514', 'no se escriben totales directamente');
select pg_temp.assert_fails($$delete from public.service_orders$$, '42501', 'no hay borrado físico de OS');
select pg_temp.assert_fails($$insert into public.service_order_status_history
    (organization_id, detail_center_id, service_order_id, to_status)
    values ('0e000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', '$$ || :'o1' || $$', 'entregada')$$,
  '42501', 'el historial de estatus no se escribe directamente');
reset role;
select from set_config('app.change_reason', 'Prueba', true);
select pg_temp.assert_fails($$update public.service_order_items set unit_price = 1
    where service_order_id = '$$ || :'o1' || $$'$$,
  '22023', 'el precio de una línea no cambia ni con motivo');
select pg_temp.assert_fails($$update public.service_orders set client_name = 'Otro' where id = '$$ || :'o1' || $$'$$,
  '22023', 'el snapshot, el folio y el cliente de la OS no cambian');
select from set_config('app.change_reason', '', true);

-- ---------------------------------------------------------------------------
-- Descuentos por nivel de autorización (subtotal 3230)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select id as pol_item from public.service_order_items where service_order_id = :'o1' and service_code = 'POL' \gset
select pg_temp.assert_fails($$select public.add_service_order_discount('$$ || :'o1' || $$', pg_temp.v('$$ || :'o1' || $$'),
    null, 'amount', 50, '')$$,
  '22023', 'el descuento exige motivo');
select from public.add_service_order_discount(:'o1', pg_temp.v(:'o1'), :'pol_item', 'percent', 10, 'Cliente frecuente');
select pg_temp.assert(
  (select discount_total = 280 and total = 2950 from public.service_orders where id = :'o1')
  and (select line_discount = 280 from public.service_order_items where id = :'pol_item'),
  'operador: 10 % a la línea de pulido (8.7 % de la OS) = 280');
select pg_temp.assert_fails($$select public.add_service_order_discount('$$ || :'o1' || $$', pg_temp.v('$$ || :'o1' || $$'),
    null, 'amount', 100, 'Cortesía')$$,
  '42501', 'el operador no autoriza un acumulado de 11.8 % (encargado)');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select from public.add_service_order_discount(:'o1', pg_temp.v(:'o1'), null, 'amount', 100, 'Cortesía por espera');
select pg_temp.assert(
  (select discount_total = 380 and total = 2850 from public.service_orders where id = :'o1'),
  'encargado: 100 más sobre la OS; total 2850');
select pg_temp.assert(
  (select authorization_level = 'encargado' and authorized_by = '00000000-0000-0000-0000-0000000000e1'
     from public.service_order_discounts where service_order_id = :'o1' and item_id is null),
  'el descuento guarda nivel exigido y quién lo autorizó');
select pg_temp.assert_fails($$select public.add_service_order_discount('$$ || :'o1' || $$', pg_temp.v('$$ || :'o1' || $$'),
    null, 'percent', 25, 'Promoción')$$,
  '42501', 'el encargado no autoriza un acumulado de 34.6 % (admin)');
select pg_temp.assert_fails($$select public.add_service_order_discount('$$ || :'o1' || $$', pg_temp.v('$$ || :'o1' || $$'),
    null, 'amount', 5000, 'Excesivo')$$,
  '22023', 'un descuento no excede el importe pendiente');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select from public.add_service_order_discount(:'o1', pg_temp.v(:'o1'), null, 'percent', 25, 'Promoción aniversario');
select pg_temp.assert(
  (select discount_total = 1117.50 and total = 2112.50 from public.service_orders where id = :'o1'),
  'admin: 25 % sobre 2950 = 737.50; total 2112.50');
select id as promo from public.service_order_discounts where reason = 'Promoción aniversario' \gset
select from public.void_service_order_discount(:'promo', pg_temp.v(:'o1'), 'Promoción no aplica a pulido');
select pg_temp.assert(
  (select total = 2850 from public.service_orders where id = :'o1')
  and (select voided_at is not null and void_reason = 'Promoción no aplica a pulido'
         from public.service_order_discounts where id = :'promo'),
  'anular un descuento con motivo lo conserva y recalcula el total');
reset role;
select pg_temp.assert(
  pg_temp.n($$select 1 from public.audit_log where event = 'service_order.discount_authorized'$$) = 3
  and pg_temp.n($$select 1 from public.audit_log where table_name = 'public.service_order_discounts'
                    and action = 'UPDATE' and reason = 'Promoción no aplica a pulido'$$) >= 1,
  'descuentos auditados con actor, motivo y valores');

-- ---------------------------------------------------------------------------
-- Estatus y reglas por canal
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails($$select public.set_service_order_status('$$ || :'o1' || $$', pg_temp.v('$$ || :'o1' || $$'), 'en_proceso')$$,
  '22023', 'no se salta de abierta a en proceso');
select pg_temp.assert(
  (select status = 'autorizada' and authorized_total = 2850 and authorized_by = '00000000-0000-0000-0000-0000000000f1'
     from public.set_service_order_status(:'o1', pg_temp.v(:'o1'), 'autorizada')),
  'autorizar registra quién, cuándo y el total autorizado');
select pg_temp.assert_fails($$select public.set_service_order_item('$$ || :'o1' || $$', pg_temp.v('$$ || :'o1' || $$'),
    '$$ || :'aroma' || $$', 3)$$,
  '22023', 'después de autorizar, cambiar líneas exige motivo');
select pg_temp.assert(
  (select total = 2940 and authorized_total = 2940
     from public.set_service_order_item(:'o1', pg_temp.v(:'o1'), :'aroma', 3, 'Cliente pidió otro aromatizante')),
  'adicional autorizado por el cliente actualiza el total autorizado');
select from public.set_service_order_status(:'o1', pg_temp.v(:'o1'), 'en_proceso');
select pg_temp.assert_fails($$select public.set_service_order_status('$$ || :'o1' || $$', pg_temp.v('$$ || :'o1' || $$'), 'pausada')$$,
  '22023', 'pausar exige motivo');
reset role;
update public.service_orders set work_started_at = now() - interval '50 minutes' where id = :'o1';
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  (select status = 'pausada' and worked_minutes = 50 and work_started_at is null
     from public.set_service_order_status(:'o1', pg_temp.v(:'o1'), 'pausada', 'Falta pieza')),
  'pausar acumula el tiempo real trabajado (50 min)');
select from public.set_service_order_status(:'o1', pg_temp.v(:'o1'), 'en_proceso');
select pg_temp.assert_fails($$select public.set_service_order_status('$$ || :'o1' || $$', pg_temp.v('$$ || :'o1' || $$'), 'cancelada', 'Ya no')$$,
  '22023', 'una OS en proceso no se cancela directamente');
select from public.set_service_order_status(:'o1', pg_temp.v(:'o1'), 'terminada');
select pg_temp.assert_fails($$select public.set_service_order_item('$$ || :'o1' || $$', pg_temp.v('$$ || :'o1' || $$'),
    '$$ || :'aroma' || $$', 1, 'Cambio')$$,
  '22023', 'una OS terminada ya no cambia sus líneas');
select pg_temp.assert_fails($$select public.set_service_order_status('$$ || :'o1' || $$', pg_temp.v('$$ || :'o1' || $$'), 'entregada')$$,
  'MG002', 'B2C: no se entrega con saldo pendiente');
select pg_temp.assert_fails($$select public.record_service_order_payment('$$ || :'o1' || $$', pg_temp.v('$$ || :'o1' || $$'),
    5000, 'efectivo')$$,
  '22023', 'un cobro no excede el saldo');
select pg_temp.assert_fails($$select public.record_service_order_payment('$$ || :'o1' || $$', pg_temp.v('$$ || :'o1' || $$'),
    100, 'cripto')$$,
  '22023', 'forma de pago válida');
select from public.record_service_order_payment(:'o1', pg_temp.v(:'o1'), 1000, 'tarjeta', 'AUT-123');
select pg_temp.assert_fails($$select public.set_service_order_status('$$ || :'o1' || $$', pg_temp.v('$$ || :'o1' || $$'), 'entregada')$$,
  'MG002', 'con pago parcial tampoco se entrega');
select from public.record_service_order_payment(:'o1', pg_temp.v(:'o1'), 1940, 'efectivo');
select pg_temp.assert_fails($$select public.add_service_order_discount('$$ || :'o1' || $$', pg_temp.v('$$ || :'o1' || $$'),
    null, 'amount', 10, 'Redondeo')$$,
  '22023', 'no se descuenta una OS cobrada (dejaría saldo a favor)');
select pg_temp.assert(
  (select status = 'entregada' and delivered_at is not null and paid_amount = total
     from public.set_service_order_status(:'o1', pg_temp.v(:'o1'), 'entregada')),
  'B2C: cobrada completa se entrega');
select pg_temp.assert(
  (select array_agg(coalesce(from_status::text, '-') || '>' || to_status order by occurred_at, id)
       = '{->abierta,abierta>autorizada,autorizada>en_proceso,en_proceso>pausada,pausada>en_proceso,en_proceso>terminada,terminada>entregada}'
     from public.service_order_status_history where service_order_id = :'o1')
  and (select reason = 'Falta pieza' and actor_id = '00000000-0000-0000-0000-0000000000f1'
         from public.service_order_status_history where service_order_id = :'o1' and to_status = 'pausada'),
  'historial de estatus completo con actor y motivo');
reset role;
select pg_temp.assert(
  pg_temp.n($$select 1 from public.audit_log where event = 'service_order.payment_recorded'
               and actor_id = '00000000-0000-0000-0000-0000000000f1'$$) = 2
  and pg_temp.n($$select 1 from public.audit_log where table_name = 'public.service_orders'
                    and action = 'UPDATE' and reason = 'Cobro tarjeta · AUT-123'$$) = 1,
  'cada cobro queda auditado con actor, forma de pago y referencia');
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails($$select public.update_service_order_details('$$ || :'o1' || $$', pg_temp.v('$$ || :'o1' || $$'),
    'b2c', null, null, null, null, null, null, null, null, null, null, null)$$,
  '22023', 'una OS entregada ya no se edita');

-- B2B: autoriza y entrega con orden de compra, sin cobro.
select (public.create_service_order('aaaaaaaa-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000003',
  :'client2', :'vehicle2', jsonb_build_array(jsonb_build_object('service_id', :'lavado', 'quantity', 1)), 'b2b')).id as ob \gset
select pg_temp.assert_fails($$select public.set_service_order_status('$$ || :'ob' || $$', pg_temp.v('$$ || :'ob' || $$'), 'autorizada')$$,
  'MG002', 'B2B: sin orden de compra no se autoriza');
select from public.update_service_order_details(:'ob', pg_temp.v(:'ob'), 'b2b', 'OC-7781', null, null, null, null,
  'Lavar chasis cada 15 días', current_date + 15, :'lavado', 'Flotilla: programar unidades', null, null);
select from public.set_service_order_status(:'ob', pg_temp.v(:'ob'), 'autorizada');
select pg_temp.assert_fails($$select public.update_service_order_details('$$ || :'ob' || $$', pg_temp.v('$$ || :'ob' || $$'),
    'b2c', null, null, null, null, null, null, null, null, null, null, null)$$,
  '22023', 'el canal no cambia después de autorizar');
select from public.set_service_order_status(:'ob', pg_temp.v(:'ob'), 'en_proceso');
select from public.set_service_order_status(:'ob', pg_temp.v(:'ob'), 'terminada');
select pg_temp.assert(
  (select status = 'entregada' and paid_amount = 0 and next_visit_on = current_date + 15
       and next_visit_service_id = :'lavado' and recommendations = 'Lavar chasis cada 15 días'
     from public.set_service_order_status(:'ob', pg_temp.v(:'ob'), 'entregada')),
  'B2B: con orden de compra se entrega a crédito; recomendación y próxima visita guardadas');

-- Membresía: exige número de membresía para autorizar.
select (public.create_service_order('aaaaaaaa-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000004',
  :'client', :'vehicle', jsonb_build_array(jsonb_build_object('service_id', :'lavado')), 'membresia')).id as om \gset
select pg_temp.assert_fails($$select public.set_service_order_status('$$ || :'om' || $$', pg_temp.v('$$ || :'om' || $$'), 'autorizada')$$,
  'MG002', 'membresía: sin número de membresía no se autoriza');

-- Cancelación: motivo; después de autorizar sólo encargado/admin; nunca con cobros.
select pg_temp.assert_fails($$select public.set_service_order_status('$$ || :'om' || $$', pg_temp.v('$$ || :'om' || $$'), 'cancelada')$$,
  '22023', 'cancelar exige motivo');
select pg_temp.assert(
  (select status = 'cancelada' and cancelled_at is not null
     from public.set_service_order_status(:'om', pg_temp.v(:'om'), 'cancelada', 'Cliente no esperó')),
  'el operador cancela una OS abierta con motivo');
select from public.set_service_order_status(:'o2', pg_temp.v(:'o2'), 'autorizada');
select pg_temp.assert_fails($$select public.set_service_order_status('$$ || :'o2' || $$', pg_temp.v('$$ || :'o2' || $$'), 'cancelada', 'Cambio de opinión')$$,
  '42501', 'el operador no cancela una OS autorizada');
select from public.record_service_order_payment(:'o2', pg_temp.v(:'o2'), 100, 'efectivo', 'Anticipo');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.set_service_order_status('$$ || :'o2' || $$', pg_temp.v('$$ || :'o2' || $$'), 'cancelada', 'Cambio de opinión')$$,
  '22023', 'una OS con cobros no se cancela (reembolso en el módulo de pagos)');
reset role;

-- ---------------------------------------------------------------------------
-- OS desde cita (sin recapturar) y sincronía de la cita
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_appointment('aaaaaaaa-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000001',
  :'client2', :'vehicle2', array[:'lavado', :'pulido']::uuid[], now() + interval '1 hour', null, :'bay1', :'tech1',
  'Revisar faros')).id as appt \gset
select pg_temp.assert_fails($$select public.create_service_order_from_appointment('$$ || :'appt' || $$',
    '30000000-0000-4000-8000-000000000005')$$,
  '22023', 'la OS se abre cuando la cita ya se recibió');
select from public.set_appointment_status(:'appt', 'recibida');
select (public.create_service_order_from_appointment(:'appt', '30000000-0000-4000-8000-000000000005', 'b2c', null, 88000)).id as oa \gset
select pg_temp.assert(
  (select appointment_id = :'appt' and client_id = :'client2' and vehicle_id = :'vehicle2' and bay_id = :'bay1'
       and technician_id = :'tech1' and observations = 'Revisar faros' and odometer_km = 88000 and total = 3100
     from public.service_orders where id = :'oa'),
  'desde la cita: cliente, vehículo, bahía, técnico, notas y servicios (300 + 2800) sin recapturar');
select pg_temp.assert(
  (select service_order_id = :'oa' from public.appointments where id = :'appt')
  and (public.create_service_order_from_appointment(:'appt', '30000000-0000-4000-8000-000000000006')).id = :'oa',
  'la cita queda vinculada y tiene una sola OS');
select from public.set_service_order_status(:'oa', pg_temp.v(:'oa'), 'autorizada');
select from public.set_service_order_status(:'oa', pg_temp.v(:'oa'), 'en_proceso');
select pg_temp.assert(
  (select status = 'en_servicio' from public.appointments where id = :'appt'),
  'iniciar la OS pone la cita en servicio');
select from public.set_service_order_status(:'oa', pg_temp.v(:'oa'), 'terminada');
select pg_temp.assert(
  (select status = 'terminada' from public.appointments where id = :'appt'),
  'terminar la OS termina la cita (libera la bahía)');
reset role;

-- ---------------------------------------------------------------------------
-- Listado, folios por centro y RLS
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.list_service_orders('aaaaaaaa-0000-0000-0000-000000000000')$$) = 5
  and pg_temp.n($$select 1 from public.list_service_orders('aaaaaaaa-0000-0000-0000-000000000000', 'entregada')$$) = 2
  and pg_temp.n($$select 1 from public.list_service_orders('aaaaaaaa-0000-0000-0000-000000000000', null, 'xyz 999')$$) = 2
  and pg_temp.n($$select 1 from public.list_service_orders('aaaaaaaa-0000-0000-0000-000000000000', null, '000001')$$) = 1,
  'listado del centro con filtro por estatus y búsqueda por placa o folio');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.service_orders$$) = 0
  and pg_temp.n($$select 1 from public.service_order_items$$) = 0
  and pg_temp.n($$select 1 from public.service_order_status_history$$) = 0,
  'operador de B no ve OS, líneas ni historial de A');
select pg_temp.assert_fails($$select public.set_service_order_status('$$ || :'o2' || $$', 1, 'en_proceso')$$,
  '42501', 'operador de B no modifica OS de A');
select pg_temp.assert_fails($$select public.create_service_order('aaaaaaaa-0000-0000-0000-000000000000',
    '30000000-0000-4000-8000-000000000007', '$$ || :'client' || $$', '$$ || :'vehicle' || $$',
    '[{"service_id":"$$ || :'lavado' || $$"}]')$$,
  '42501', 'operador de B no abre OS en A');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(pg_temp.n($$select 1 from public.service_orders$$) = 0,
  'contador no ve OS (datos personales del snapshot)');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service_order('bbbbbbbb-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000008',
  :'client', :'vehicle', jsonb_build_array(jsonb_build_object('service_id', :'lavado')))).folio as folio_b \gset
select pg_temp.assert(:'folio_b' = 'B-01-000001', 'cada centro tiene su propio consecutivo de folios');
reset role;

select pg_temp.assert(
  (select count(*) = 2 from pg_constraint
    where conname in ('service_orders_detail_center_id_folio_key', 'service_orders_detail_center_id_folio_number_key')),
  'folio único por centro en la base');

rollback;
