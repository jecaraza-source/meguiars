-- Datos mínimos para desarrollo local (`supabase db reset` los carga después de las migraciones).
-- Organización demo con dos centros. Los usuarios se crean con Auth (Studio local →
-- Authentication → Add user) y después se les da acceso, por ejemplo:
--   -- admin_socio corporativo (ve y consolida ambos centros):
--   insert into public.role_assignments (organization_id, user_id, role)
--   values ('00000000-0000-4000-8000-00000000d3e0', '<uuid del usuario>', 'admin_socio');
--   -- encargado de un solo centro:
--   insert into public.user_detail_centers (detail_center_id, user_id, role)
--   values ('11111111-1111-4111-8111-111111111111', '<uuid del usuario>', 'encargado');
insert into public.organizations (id, slug, name) values
  ('00000000-0000-4000-8000-00000000d3e0', 'meguiars-demo', 'Meguiar''s Detail Center Demo')
on conflict (id) do nothing;

insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-00000000d3e0',
   'CDMX-01', 'Meguiar''s Detail Center CDMX', 'America/Mexico_City'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-4000-8000-00000000d3e0',
   'MTY-01', 'Meguiar''s Detail Center Monterrey', 'America/Monterrey')
on conflict (id) do nothing;

-- Clientes y vehículos de ejemplo (O1). Un cliente de CDMX también atendido en
-- Monterrey, una flotilla (empresa) y un cliente con consentimiento comercial.
insert into public.clients (id, organization_id, home_detail_center_id, kind, full_name, phone, email,
                            marketing_opt_in, marketing_channels, marketing_opt_in_at, marketing_opt_in_source,
                            request_id, created_in_detail_center_id) values
  ('c1000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0',
   '11111111-1111-4111-8111-111111111111', 'person', 'José Pérez', '+525512345678', 'jose.perez@example.com',
   true, '{whatsapp}', now(), 'web', 'c1000000-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111'),
  ('c1000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000d3e0',
   '22222222-2222-4222-8222-222222222222', 'company', 'Transportes del Norte', '+528181234567', 'flotilla@example.com',
   false, '{}', null, null, 'c1000000-0000-4000-8000-0000000000a2', '22222222-2222-4222-8222-222222222222'),
  ('c1000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000d3e0',
   '11111111-1111-4111-8111-111111111111', 'person', 'María López', '+525598765432', null,
   false, '{}', null, null, 'c1000000-0000-4000-8000-0000000000a3', '11111111-1111-4111-8111-111111111111')
on conflict (id) do nothing;

insert into public.client_centers (client_id, detail_center_id, organization_id) values
  ('c1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-00000000d3e0'),
  ('c1000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', '00000000-0000-4000-8000-00000000d3e0'),
  ('c1000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', '00000000-0000-4000-8000-00000000d3e0'),
  ('c1000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-00000000d3e0')
on conflict do nothing;

insert into public.vehicles (id, organization_id, client_id, make, model, year, plate, identifier,
                             created_in_detail_center_id) values
  ('c2000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', 'c1000000-0000-4000-8000-000000000001',
   'Mazda', '3 Hatchback', 2021, 'ABC1234', null, '11111111-1111-4111-8111-111111111111'),
  ('c2000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000d3e0', 'c1000000-0000-4000-8000-000000000002',
   'Nissan', 'NP300', 2020, 'NL4521A', 'ECO014', '22222222-2222-4222-8222-222222222222'),
  ('c2000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000d3e0', 'c1000000-0000-4000-8000-000000000002',
   'Nissan', 'NP300', 2022, 'NL4522A', 'ECO015', '22222222-2222-4222-8222-222222222222'),
  ('c2000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-00000000d3e0', 'c1000000-0000-4000-8000-000000000003',
   'Toyota', 'RAV4', 2019, 'MEX9087', null, '11111111-1111-4111-8111-111111111111')
on conflict (id) do nothing;

-- Catálogo homologado de ejemplo (O2), con un servicio por motor de ingreso.
-- Monterrey tiene precio propio en el lavado exprés y no ofrece el cerámico.
insert into public.services (id, organization_id, code, name, description, revenue_engine,
                             standard_duration_minutes, base_price, standard_direct_cost) values
  ('5e000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', 'LAV-EXP', 'Lavado exprés',
   'Exterior a mano, aspirado y cristales.', 'recurrente', 40, 250, 80),
  ('5e000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000d3e0', 'LAV-PRE', 'Lavado premium',
   'Lavado exprés más descontaminado, cera y acondicionado de interiores.', 'recurrente', 90, 550, 170),
  ('5e000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000d3e0', 'DET-INT', 'Detallado de interiores',
   'Limpieza profunda de vestiduras, alfombras y plásticos.', 'valor_medio', 240, 1800, 600),
  ('5e000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-00000000d3e0', 'PUL-1E', 'Pulido en una etapa',
   'Corrección ligera de pintura y sellador.', 'valor_medio', 300, 2800, 950),
  ('5e000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-00000000d3e0', 'CER-9H', 'Recubrimiento cerámico',
   'Corrección de pintura y cerámico 9H con garantía.', 'premium', 480, 12000, 4200),
  ('5e000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-00000000d3e0', 'AROM', 'Aromatizante',
   null, 'producto_complemento', 5, 90, 30),
  ('5e000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-00000000d3e0', 'MEM-MEN', 'Membresía mensual de lavado',
   'Hasta 4 lavados exprés al mes.', 'membresia', 5, 799, 0)
on conflict (id) do nothing;

insert into public.service_center_config (organization_id, detail_center_id, service_id, available, price_override,
                                          direct_cost_override) values
  ('00000000-0000-4000-8000-00000000d3e0', '22222222-2222-4222-8222-222222222222',
   '5e000000-0000-4000-8000-000000000001', true, 220, 70),
  ('00000000-0000-4000-8000-00000000d3e0', '22222222-2222-4222-8222-222222222222',
   '5e000000-0000-4000-8000-000000000005', false, null, null)
on conflict (detail_center_id, service_id) do nothing;

-- Agenda de ejemplo (O3): dos bahías y un técnico por centro, y citas de hoy
-- (hora local de cada centro).
insert into public.bays (id, organization_id, detail_center_id, name) values
  ('ba000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', '11111111-1111-4111-8111-111111111111', 'Bahía 1'),
  ('ba000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000d3e0', '11111111-1111-4111-8111-111111111111', 'Bahía 2'),
  ('ba000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000d3e0', '22222222-2222-4222-8222-222222222222', 'Bahía 1'),
  ('ba000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-00000000d3e0', '22222222-2222-4222-8222-222222222222', 'Bahía 2')
on conflict (id) do nothing;

insert into public.technicians (id, organization_id, detail_center_id, full_name) values
  ('7e000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', '11111111-1111-4111-8111-111111111111', 'Toño Ruiz'),
  ('7e000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000d3e0', '22222222-2222-4222-8222-222222222222', 'Beto Garza')
on conflict (id) do nothing;

insert into public.appointments (id, organization_id, detail_center_id, client_id, vehicle_id, starts_at,
                                 duration_minutes, ends_at, bay_id, technician_id, status, request_id) values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', '11111111-1111-4111-8111-111111111111',
   'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
   (current_date + time '10:00') at time zone 'America/Mexico_City', 40, now(),
   'ba000000-0000-4000-8000-000000000001', '7e000000-0000-4000-8000-000000000001', 'programada',
   'a0000000-0000-4000-8000-0000000000a1'),
  ('a0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000d3e0', '11111111-1111-4111-8111-111111111111',
   'c1000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000004',
   (current_date + time '12:00') at time zone 'America/Mexico_City', 240, now(),
   'ba000000-0000-4000-8000-000000000002', null, 'programada', 'a0000000-0000-4000-8000-0000000000a2'),
  ('a0000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000d3e0', '22222222-2222-4222-8222-222222222222',
   'c1000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000002',
   (current_date + time '09:00') at time zone 'America/Monterrey', 90, now(),
   'ba000000-0000-4000-8000-000000000003', '7e000000-0000-4000-8000-000000000002', 'programada',
   'a0000000-0000-4000-8000-0000000000a3')
on conflict (id) do nothing;

insert into public.appointment_services (appointment_id, service_id, organization_id, position, duration_minutes) values
  ('a0000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', 0, 40),
  ('a0000000-0000-4000-8000-000000000002', '5e000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000d3e0', 0, 240),
  ('a0000000-0000-4000-8000-000000000003', '5e000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000d3e0', 0, 90)
on conflict do nothing;

-- Órdenes de servicio de ejemplo (O4): una en proceso y una abierta con
-- descuento en CDMX, y una B2B autorizada en Monterrey. Precios congelados del
-- catálogo del centro; los totales los calcula la base.
insert into public.service_orders (id, organization_id, detail_center_id, folio, folio_number, client_id, vehicle_id,
                                   channel, channel_reference, status, client_name, client_phone, client_email,
                                   vehicle_make, vehicle_model, vehicle_year, vehicle_plate, odometer_km, bay_id,
                                   technician_id, observations, authorized_at, started_at, work_started_at, request_id)
values
  ('0d000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', '11111111-1111-4111-8111-111111111111',
   'CDMX-01-000001', 1, 'c1000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000004',
   'b2c', null, 'en_proceso', 'María López', '+525598765432', null, 'Toyota', 'RAV4', 2019, 'MEX9087', 61200,
   'ba000000-0000-4000-8000-000000000002', '7e000000-0000-4000-8000-000000000001', 'Walk-in: manchas en asientos',
   now() - interval '1 hour', now() - interval '40 minutes', now() - interval '40 minutes',
   '0d000000-0000-4000-8000-0000000000a1'),
  ('0d000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000d3e0', '11111111-1111-4111-8111-111111111111',
   'CDMX-01-000002', 2, 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001',
   'b2c', null, 'abierta', 'José Pérez', '+525512345678', 'jose.perez@example.com', 'Mazda', '3 Hatchback', 2021,
   'ABC1234', 45210, null, null, null, null, null, null, '0d000000-0000-4000-8000-0000000000a2'),
  ('0d000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000d3e0', '22222222-2222-4222-8222-222222222222',
   'MTY-01-000001', 1, 'c1000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000002',
   'b2b', 'OC-5521', 'autorizada', 'Transportes del Norte', '+528181234567', 'flotilla@example.com', 'Nissan',
   'NP300', 2020, 'NL4521A', null, 'ba000000-0000-4000-8000-000000000003', '7e000000-0000-4000-8000-000000000002',
   null, now(), null, null, '0d000000-0000-4000-8000-0000000000a3')
on conflict (id) do nothing;

insert into public.service_order_items (id, organization_id, service_order_id, position, kind, service_id, service_code,
                                        service_name, revenue_engine, unit_price, unit_direct_cost, duration_minutes,
                                        price_source, quantity) values
  ('0e100000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', '0d000000-0000-4000-8000-000000000001',
   0, 'servicio', '5e000000-0000-4000-8000-000000000003', 'DET-INT', 'Detallado de interiores', 'valor_medio',
   1800, 600, 240, 'base', 1),
  ('0e100000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000d3e0', '0d000000-0000-4000-8000-000000000001',
   1, 'producto', '5e000000-0000-4000-8000-000000000006', 'AROM', 'Aromatizante', 'producto_complemento',
   90, 30, 5, 'base', 1),
  ('0e100000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000d3e0', '0d000000-0000-4000-8000-000000000002',
   0, 'servicio', '5e000000-0000-4000-8000-000000000004', 'PUL-1E', 'Pulido en una etapa', 'valor_medio',
   2800, 950, 300, 'base', 1),
  ('0e100000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-00000000d3e0', '0d000000-0000-4000-8000-000000000003',
   0, 'servicio', '5e000000-0000-4000-8000-000000000001', 'LAV-EXP', 'Lavado exprés', 'recurrente',
   220, 70, 40, 'center', 1)
on conflict (id) do nothing;

insert into public.service_order_discounts (id, organization_id, service_order_id, item_id, kind, value, reason,
                                            authorization_level) values
  ('0e200000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', '0d000000-0000-4000-8000-000000000002',
   '0e100000-0000-4000-8000-000000000003', 'percent', 10, 'Cliente frecuente', 'operador')
on conflict (id) do nothing;

update public.service_orders set authorized_total = 1890 where id = '0d000000-0000-4000-8000-000000000001' and authorized_total is null;
update public.service_orders set authorized_total = 220 where id = '0d000000-0000-4000-8000-000000000003' and authorized_total is null;
select count(private.recalc_service_order(id)) from public.service_orders where id::text like '0d000000-%';

insert into private.service_order_counters (detail_center_id, last_number) values
  ('11111111-1111-4111-8111-111111111111', 2), ('22222222-2222-4222-8222-222222222222', 1)
on conflict (detail_center_id) do update set last_number = greatest(private.service_order_counters.last_number, excluded.last_number);

-- Ejecución y consumos de ejemplo (O5): insumos con estándar para los lavados y
-- el detallado; la OS CDMX-01-000001 tiene su línea principal en proceso con
-- dos técnicos y un consumo registrado. (Las fotos viven en Storage; el seed no las incluye.)
insert into public.inventory_items (id, organization_id, code, name, unit, unit_cost) values
  ('1a000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', 'SHP-NEU', 'Shampoo pH neutro', 'ml', 0.06),
  ('1a000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000d3e0', 'CERA-LIQ', 'Cera líquida', 'ml', 0.18),
  ('1a000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000d3e0', 'LIMP-VEST', 'Limpiador de vestiduras', 'ml', 0.12)
on conflict (id) do nothing;

insert into public.service_supply_standards (organization_id, service_id, inventory_item_id, quantity) values
  ('00000000-0000-4000-8000-00000000d3e0', '5e000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000001', 60),
  ('00000000-0000-4000-8000-00000000d3e0', '5e000000-0000-4000-8000-000000000002', '1a000000-0000-4000-8000-000000000001', 80),
  ('00000000-0000-4000-8000-00000000d3e0', '5e000000-0000-4000-8000-000000000002', '1a000000-0000-4000-8000-000000000002', 40),
  ('00000000-0000-4000-8000-00000000d3e0', '5e000000-0000-4000-8000-000000000003', '1a000000-0000-4000-8000-000000000003', 250)
on conflict do nothing;

insert into public.technicians (id, organization_id, detail_center_id, full_name) values
  ('7e000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000d3e0', '11111111-1111-4111-8111-111111111111', 'Luis Gómez')
on conflict (id) do nothing;

insert into public.service_order_staff (service_order_id, technician_id, organization_id, detail_center_id) values
  ('0d000000-0000-4000-8000-000000000001', '7e000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', '11111111-1111-4111-8111-111111111111'),
  ('0d000000-0000-4000-8000-000000000001', '7e000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000d3e0', '11111111-1111-4111-8111-111111111111')
on conflict do nothing;

update public.service_order_items
   set work_status = 'en_proceso', started_at = now() - interval '35 minutes', work_started_at = now() - interval '35 minutes',
       technician_id = '7e000000-0000-4000-8000-000000000003'
 where id = '0e100000-0000-4000-8000-000000000001' and work_status = 'pendiente';

insert into public.service_order_consumptions (id, organization_id, detail_center_id, service_order_id, item_id,
                                               inventory_item_id, unit, standard_quantity, actual_quantity, unit_cost) values
  ('1c000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', '11111111-1111-4111-8111-111111111111',
   '0d000000-0000-4000-8000-000000000001', '0e100000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000003',
   'ml', 250, 300, 0.12)
on conflict (id) do nothing;
