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

-- Membresías (C1): planes CARE / PLUS / PREMIUM y tres membresías de ejemplo
-- (activa en CDMX, próxima a vencer en CDMX y trimestral en Monterrey).
insert into public.membership_plans (id, organization_id, code, tier, name, description, price, period_months,
                                     redeem_scope, restrictions, renewal_notice_days, available_from) values
  ('3b000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', 'CARE', 'care', 'Care',
   'Dos lavados exprés al mes.', 449, 1, 'centro_origen', 'Autos particulares; un vehículo por membresía.', 7,
   current_date - 90),
  ('3b000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000d3e0', 'PLUS', 'plus', 'Plus',
   'Dos lavados exprés y un lavado premium al mes, en cualquier centro.', 849, 1, 'cualquier_centro', null, 7,
   current_date - 90),
  ('3b000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000d3e0', 'PREMIUM', 'premium', 'Premium',
   'Tres lavados premium y un detallado de interiores por trimestre.', 3900, 3, 'cualquier_centro', null, 15,
   current_date - 90)
on conflict (id) do nothing;

insert into public.membership_benefits (organization_id, plan_id, service_id, quantity_per_period) values
  ('00000000-0000-4000-8000-00000000d3e0', '3b000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000001', 2),
  ('00000000-0000-4000-8000-00000000d3e0', '3b000000-0000-4000-8000-000000000002', '5e000000-0000-4000-8000-000000000001', 2),
  ('00000000-0000-4000-8000-00000000d3e0', '3b000000-0000-4000-8000-000000000002', '5e000000-0000-4000-8000-000000000002', 1),
  ('00000000-0000-4000-8000-00000000d3e0', '3b000000-0000-4000-8000-000000000003', '5e000000-0000-4000-8000-000000000002', 3),
  ('00000000-0000-4000-8000-00000000d3e0', '3b000000-0000-4000-8000-000000000003', '5e000000-0000-4000-8000-000000000003', 1)
on conflict (plan_id, service_id) do nothing;

insert into public.memberships (id, organization_id, detail_center_id, number, number_seq, plan_id, client_id, vehicle_id,
                                plan_code, plan_name, plan_tier, price, period_months, redeem_scope, renewal_notice_days,
                                benefits, started_on, period_anchor, ends_on, request_id)
select x.id, p.organization_id, x.center, x.number, x.seq, p.id, x.client, x.vehicle, p.code, p.name, p.tier, p.price,
       p.period_months, p.redeem_scope, p.renewal_notice_days, private.membership_plan_snapshot(p.id),
       x.anchor, x.anchor, (x.anchor + make_interval(months => p.period_months))::date - 1, x.request
  from (values
    ('3c000000-0000-4000-8000-000000000001'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'MEM-000001', 1,
     '3b000000-0000-4000-8000-000000000002'::uuid, 'c1000000-0000-4000-8000-000000000001'::uuid,
     'c2000000-0000-4000-8000-000000000001'::uuid, current_date - 20, '3c000000-0000-4000-8000-0000000000a1'::uuid),
    ('3c000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'MEM-000002', 2,
     '3b000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000003',
     'c2000000-0000-4000-8000-000000000004', (current_date + 4 - interval '1 month')::date,
     '3c000000-0000-4000-8000-0000000000a2'),
    ('3c000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'MEM-000003', 3,
     '3b000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000002',
     'c2000000-0000-4000-8000-000000000002', current_date - 30, '3c000000-0000-4000-8000-0000000000a3')
  ) as x(id, center, number, seq, plan, client, vehicle, anchor, request)
  join public.membership_plans p on p.id = x.plan
on conflict (id) do nothing;

insert into private.membership_counters (organization_id, last_number)
values ('00000000-0000-4000-8000-00000000d3e0', 3)
on conflict (organization_id) do update set last_number = greatest(private.membership_counters.last_number, 3);

insert into public.membership_events (organization_id, membership_id, membership_center_id, detail_center_id, kind,
                                      to_state, plan_code, amount, period_start, period_end, reason, occurred_at)
select m.organization_id, m.id, m.detail_center_id, m.detail_center_id, 'alta', 'activa', m.plan_code, m.price,
       m.period_anchor, m.ends_on, 'Alta de membresía (seed)', m.period_anchor::timestamptz + interval '10 hours'
  from public.memberships m
 where m.id in ('3c000000-0000-4000-8000-000000000001', '3c000000-0000-4000-8000-000000000002',
                '3c000000-0000-4000-8000-000000000003')
   and not exists (select 1 from public.membership_events e where e.membership_id = m.id);

-- CRM (C2): consentimiento de llamada y seguimientos de ejemplo. El
-- consentimiento por whatsapp/sms/email ya lo sincroniza clients.marketing_*.
insert into public.contact_preferences (organization_id, client_id, channel, opted_in, source)
values ('00000000-0000-4000-8000-00000000d3e0', 'c1000000-0000-4000-8000-000000000001', 'llamada', true, 'web')
on conflict (client_id, channel) do nothing;

insert into public.crm_tasks (id, organization_id, detail_center_id, client_id, vehicle_id, kind, channel, due_on, notes,
                              source, membership_id, dedupe_key)
values
  ('4c000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', '11111111-1111-4111-8111-111111111111',
   'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'whatsapp', 'whatsapp',
   current_date + 1, 'Ofrecer pulido antes de vacaciones', 'manual', null, null),
  ('4c000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000d3e0', '11111111-1111-4111-8111-111111111111',
   'c1000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000004', 'renovar', 'presencial',
   current_date, 'Membresía MEM-000002 por vencer', 'membresia', '3c000000-0000-4000-8000-000000000002',
   'mem:3c000000-0000-4000-8000-000000000002:seed')
on conflict (id) do nothing;

-- B2B (C3): cuenta de Transportes del Norte (centro gestor Monterrey) con un
-- convenio por vehículo vigente en ambos centros, tarifas y un vehículo
-- autorizado. La OS MTY-01-000001 (B2B previa) queda a cuenta de la empresa.
insert into public.b2b_accounts (id, organization_id, home_detail_center_id, client_id, name, legal_name, rfc, tax_regime,
                                 fiscal_zip, billing_email, status, request_id)
values ('b2000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', '22222222-2222-4222-8222-222222222222',
        'c1000000-0000-4000-8000-000000000002', 'Transportes del Norte', 'Transportes del Norte SA de CV', 'TNO150101AB1',
        '601', '64000', 'facturacion@example.com', 'activa', 'b2000000-0000-4000-8000-0000000000a1')
on conflict (id) do nothing;

insert into public.b2b_contacts (id, organization_id, account_id, full_name, title, phone, email, is_primary)
values ('b2c00000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', 'b2000000-0000-4000-8000-000000000001',
        'Ana Garza', 'Compras', '+528181230000', 'compras@example.com', true)
on conflict (id) do nothing;

insert into public.b2b_agreements (id, organization_id, account_id, name, billing_model, starts_on, ends_on, status,
                                   vehicle_rule, payment_terms_days, credit_limit, notes, request_id)
values ('b2100000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', 'b2000000-0000-4000-8000-000000000001',
        'Flotilla 2026', 'por_vehiculo', current_date - 30, current_date + 335, 'activo', 'lista', 30, 50000,
        'Lavado exprés a tarifa fija; 10 % sobre lista en el resto.', 'b2100000-0000-4000-8000-0000000000a1')
on conflict (id) do nothing;

insert into public.b2b_agreement_centers (agreement_id, detail_center_id, organization_id) values
  ('b2100000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-00000000d3e0'),
  ('b2100000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', '00000000-0000-4000-8000-00000000d3e0')
on conflict do nothing;
insert into public.client_centers (client_id, detail_center_id, organization_id)
values ('c1000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-00000000d3e0')
on conflict (client_id, detail_center_id) do nothing;

insert into public.b2b_price_rules (id, organization_id, agreement_id, service_id, kind, value) values
  ('b2e00000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', 'b2100000-0000-4000-8000-000000000001',
   '5e000000-0000-4000-8000-000000000001', 'precio_fijo', 199),
  ('b2e00000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000d3e0', 'b2100000-0000-4000-8000-000000000001',
   null, 'descuento_pct', 10)
on conflict (id) do nothing;

insert into public.b2b_vehicles (account_id, vehicle_id, organization_id, cost_center, driver_name)
values ('b2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000d3e0',
        'Reparto', 'Ramiro Treviño')
on conflict (account_id, vehicle_id) do nothing;

select set_config('app.b2b_link', 'on', false);
update public.service_orders
   set b2b_account_id = 'b2000000-0000-4000-8000-000000000001',
       b2b_agreement_id = 'b2100000-0000-4000-8000-000000000001'
 where id = '0d000000-0000-4000-8000-000000000003' and b2b_account_id is null;
select set_config('app.b2b_link', 'off', false);

-- Recomendaciones de venta (C4): cadena lavado -> descontaminación -> pulido ->
-- protección -> membresía, y un producto al cierre.
insert into public.services (id, organization_id, code, name, description, revenue_engine,
                             standard_duration_minutes, base_price, standard_direct_cost)
values ('5e000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-00000000d3e0', 'DESC-ARC', 'Descontaminación con clay bar',
        'Retira contaminantes adheridos antes de pulir o proteger.', 'valor_medio', 60, 650, 180)
on conflict (id) do nothing;

insert into public.upsell_rules (id, organization_id, name, source_service_id, target_service_id, target_plan_id, stage,
                                 priority, pitch, channels)
values
  ('0c000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', 'Lavado → descontaminación',
   '5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000008', null, 'diagnostico', 90,
   'Si la pintura se siente áspera tras el lavado, la descontaminación la deja lista para pulir.', '{b2c,membresia,b2b}'),
  ('0c000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000d3e0', 'Descontaminación → pulido',
   '5e000000-0000-4000-8000-000000000008', '5e000000-0000-4000-8000-000000000004', null, 'diagnostico', 80,
   'Con la pintura descontaminada, el pulido corrige micro rayones y devuelve el brillo.', '{b2c,membresia,b2b}'),
  ('0c000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000d3e0', 'Pulido → protección cerámica',
   '5e000000-0000-4000-8000-000000000004', '5e000000-0000-4000-8000-000000000005', null, 'diagnostico', 70,
   'Tras pulir es el mejor momento para proteger: el cerámico conserva el resultado por años.', '{b2c,membresia}'),
  ('0c000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-00000000d3e0', 'Protección → membresía PLUS',
   '5e000000-0000-4000-8000-000000000005', null, '3b000000-0000-4000-8000-000000000002', 'cierre', 60,
   'La membresía PLUS mantiene el cerámico con lavados premium incluidos.', '{b2c,membresia}'),
  ('0c000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-00000000d3e0', 'Lavado → membresía CARE',
   '5e000000-0000-4000-8000-000000000001', null, '3b000000-0000-4000-8000-000000000001', 'cierre', 55,
   'Con CARE, dos lavados exprés al mes por menos de lo que cuestan sueltos.', '{b2c}'),
  ('0c000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-00000000d3e0', 'Aromatizante al entregar',
   null, '5e000000-0000-4000-8000-000000000006', null, 'cierre', 40,
   'Un detalle para entregar el auto con olor a nuevo.', '{b2c,membresia,b2b}')
on conflict (id) do nothing;

-- Pipeline comercial (C5): las etapas mínimas se crean con la organización.
-- Oportunidades de ejemplo con su historial (las métricas salen de los eventos):
-- un prospecto B2B con propuesta de iguala, un cliente B2C premium, una
-- ampliación de la cuenta de Transportes del Norte y una oportunidad perdida.
insert into public.sales_opportunities (id, organization_id, detail_center_id, kind, title, client_id, b2b_account_id,
                                        company_name, legal_name, rfc, contact_name, contact_title, contact_phone,
                                        contact_email, estimated_value, stage_id, status, next_action, next_action_on,
                                        expected_close_on, source, proposed_billing_model, proposed_months,
                                        proposed_vehicle_rule, proposed_payment_terms_days, proposed_fee_amount,
                                        proposed_included_units, closed_at, loss_reason, request_id, created_at)
select x.id, '00000000-0000-4000-8000-00000000d3e0', x.center, x.kind, x.title, x.client, x.account, x.company, x.legal,
       x.rfc, x.contact, x.contact_title, x.phone, x.email, x.value, s.id, s.kind, x.next_action, x.next_on,
       x.close_on, x.source, x.model, x.months, x.vehicle_rule, x.terms, x.fee, x.units,
       case when s.kind <> 'abierta' then now() - interval '2 days' end, x.loss, x.id, now() - x.age
  from (values
    ('0f000000-0000-4000-8000-000000000001'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'b2b',
     'Hoteles Reforma: flotilla de 12 camionetas', null::uuid, null::uuid, 'Hoteles Reforma',
     'Hoteles Reforma SA de CV', 'HRE100101AB1', 'Laura Castillo', 'Gerente de compras', '+525544443333',
     'compras@hotelesreforma.example.com', 114000::numeric, 'propuesta', 'Resolver dudas de la propuesta',
     current_date + 1, current_date + 20, 'referido', 'iguala', 12::smallint, 'cualquiera', 30::smallint,
     9500::numeric, 24, null, interval '12 days'),
    ('0f000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'b2c_premium',
     'José Pérez: protección cerámica', 'c1000000-0000-4000-8000-000000000001', null, null, null, null, null, null,
     null, null, 12000, 'contactado', 'Enviar cotización por WhatsApp', current_date, current_date + 10, 'cliente_actual',
     null, null, null, null, null, null, null, interval '3 days'),
    ('0f000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'b2b',
     'Transportes del Norte: ampliación a 20 unidades', 'c1000000-0000-4000-8000-000000000002',
     'b2000000-0000-4000-8000-000000000001', null, null, null, null, null, null, null, 60000, 'negociacion',
     'Confirmar volumen mensual', current_date + 3, current_date + 15, 'cliente_actual', null, null, null, null, null,
     null, null, interval '20 days'),
    ('0f000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'b2b',
     'Mensajería Rápida: lavado semanal', null, null, 'Mensajería Rápida', null, null, 'Óscar Vidal', null,
     '+525566667777', null, 35000, 'perdido', null, null, null, 'llamada', null, null, null, null, null, null,
     'precio', interval '30 days')
  ) as x(id, center, kind, title, client, account, company, legal, rfc, contact, contact_title, phone, email, value,
         stage, next_action, next_on, close_on, source, model, months, vehicle_rule, terms, fee, units, loss, age)
  join public.pipeline_stages s on s.organization_id = '00000000-0000-4000-8000-00000000d3e0' and s.code = x.stage
on conflict (id) do nothing;

insert into public.opportunity_events (organization_id, detail_center_id, opportunity_id, kind, opportunity_kind,
                                       from_stage_id, to_stage_id, value, note, occurred_at)
select o.organization_id, o.detail_center_id, o.id, e.kind, o.kind, fs.id, ts.id, e.value, e.note, now() - e.age
  from (values
    ('0f000000-0000-4000-8000-000000000001'::uuid, 1, 'creada', null, 'prospecto', 114000::numeric,
     'Referido por un cliente', interval '12 days'),
    ('0f000000-0000-4000-8000-000000000001', 2, 'etapa', 'prospecto', 'contactado', 114000, 'Primera llamada', interval '9 days'),
    ('0f000000-0000-4000-8000-000000000001', 3, 'etapa', 'contactado', 'propuesta', 114000, 'Propuesta enviada', interval '4 days'),
    ('0f000000-0000-4000-8000-000000000002', 1, 'creada', null, 'prospecto', 12000, null, interval '3 days'),
    ('0f000000-0000-4000-8000-000000000002', 2, 'etapa', 'prospecto', 'contactado', 12000, null, interval '2 days'),
    ('0f000000-0000-4000-8000-000000000003', 1, 'creada', null, 'propuesta', 60000, null, interval '20 days'),
    ('0f000000-0000-4000-8000-000000000003', 2, 'etapa', 'propuesta', 'negociacion', 60000, null, interval '6 days'),
    ('0f000000-0000-4000-8000-000000000004', 1, 'creada', null, 'prospecto', 35000, null, interval '30 days'),
    ('0f000000-0000-4000-8000-000000000004', 2, 'perdida', 'prospecto', 'perdido', 35000, 'precio', interval '2 days')
  ) as e(opportunity_id, n, kind, from_stage, to_stage, value, note, age)
  join public.sales_opportunities o on o.id = e.opportunity_id
  left join public.pipeline_stages fs on fs.organization_id = o.organization_id and fs.code = e.from_stage
  left join public.pipeline_stages ts on ts.organization_id = o.organization_id and ts.code = e.to_stage
 where not exists (select 1 from public.opportunity_events x where x.opportunity_id = o.id)
 order by e.opportunity_id, e.n;

-- Cobranza de ejemplo (AF1): anticipo mixto (efectivo con cambio + tarjeta) de la
-- OS en proceso de CDMX; queda parcial y aparece en "por cobrar".
select private.create_order_payment(o, '0e300000-0000-4000-8000-0000000000a1',
  '[{"method":"efectivo","amount":500},{"method":"tarjeta","amount":500,"reference":"AUT-4411"}]'::jsonb,
  600, 'Anticipo al recibir el vehículo')
  from public.service_orders o
 where o.id = '0d000000-0000-4000-8000-000000000001'
   and not exists (select 1 from public.payments p where p.request_id = '0e300000-0000-4000-8000-0000000000a1');

-- Egresos de ejemplo (AF2): umbral de $5,000 en CDMX, un proveedor, una renta
-- aprobada, una compra de insumos (fuera del P&L) y una nómina pendiente.
insert into public.vendors (id, organization_id, name, rfc)
values ('0e400000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', 'Químicos del Valle', 'QVA010101AB1')
on conflict do nothing;
insert into public.expense_settings (detail_center_id, organization_id, approval_threshold)
values ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-00000000d3e0', 5000)
on conflict do nothing;
insert into public.expenses (id, organization_id, detail_center_id, number, folio, category_id, pnl_group, vendor_id,
                             concept, amount, payment_method, paid_on, status, requires_approval, approved_at, request_id)
select x.id, c.organization_id, '11111111-1111-4111-8111-111111111111', x.n, 'CDMX-01-E-' || lpad(x.n::text, 6, '0'),
       c.id, c.pnl_group, x.vendor, x.concept, x.amount, x.method, current_date - x.age, x.status, x.amount >= 5000,
       case when x.status = 'aprobado' then now() end, x.id
  from (values
    ('0e500000-0000-4000-8000-000000000001'::uuid, 1, 'renta', null::uuid, 'Renta del local', 18000, 'transferencia', 3, 'aprobado'),
    ('0e500000-0000-4000-8000-000000000002'::uuid, 2, 'insumos', '0e400000-0000-4000-8000-000000000001'::uuid,
     'Shampoo y cera (galones)', 3200, 'efectivo', 2, 'aprobado'),
    ('0e500000-0000-4000-8000-000000000003'::uuid, 3, 'nomina', null::uuid, 'Nómina quincenal', 22000, 'transferencia', 1, 'pendiente')
  ) as x(id, n, category, vendor, concept, amount, method, age, status)
  join public.expense_categories c on c.organization_id = '00000000-0000-4000-8000-00000000d3e0' and c.code = x.category
on conflict (id) do nothing;
insert into private.expense_counters (detail_center_id, last_number) values ('11111111-1111-4111-8111-111111111111', 3)
on conflict (detail_center_id) do update set last_number = greatest(private.expense_counters.last_number, 3);
insert into public.approval_events (organization_id, detail_center_id, expense_id, kind, amount)
select organization_id, detail_center_id, id, 'solicitada', amount from public.expenses e
 where e.id = '0e500000-0000-4000-8000-000000000003'
   and not exists (select 1 from public.approval_events x where x.expense_id = e.id);

-- Corte de caja de ejemplo (AF3) en CDMX: ayer, turno único cerrado con un
-- faltante de $20 explicado; hoy, caja abierta desde antes del anticipo de AF1
-- (esperado = fondo $1,000 + efectivo $500).
insert into public.cash_sessions (id, organization_id, detail_center_id, number, folio, business_date, shift,
                                  opening_float, status, opened_at, window_end, closed_at, closings_count, request_id)
select '0e600000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0',
       '11111111-1111-4111-8111-111111111111', 1, 'CDMX-01-C-000001', d, 'unico', 1000, 'cerrada',
       (d + time '09:00') at time zone 'America/Mexico_City', (d + time '20:00') at time zone 'America/Mexico_City',
       (d + time '20:05') at time zone 'America/Mexico_City', 1, '0e600000-0000-4000-8000-000000000001'
  from (select (now() at time zone 'America/Mexico_City')::date - 1 as d) x
on conflict (id) do nothing;
insert into public.cash_closings (id, organization_id, detail_center_id, session_id, sequence, window_from, window_to,
  opening_float, cash_collected, cash_refunded, expected_cash, counted_cash, difference, card_total, transfer_total,
  non_cash_total, payments_count, reversals_count, breakdown, notes, closed_at, request_id)
select '0e700000-0000-4000-8000-000000000001', s.organization_id, s.detail_center_id, s.id, 1, s.opened_at, s.window_end,
       1000, 0, 0, 1000, 980, -20, 0, 0, 0, 0, 0,
       private.cash_window_totals(s.detail_center_id, s.opened_at, s.window_end, 1000) -> 'breakdown',
       'Faltante de $20 por cambio mal entregado', s.closed_at, '0e700000-0000-4000-8000-000000000001'
  from public.cash_sessions s where s.id = '0e600000-0000-4000-8000-000000000001'
on conflict (id) do nothing;
insert into public.cash_sessions (id, organization_id, detail_center_id, number, folio, business_date, shift,
                                  opening_float, opened_at, request_id)
select '0e600000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000d3e0',
       '11111111-1111-4111-8111-111111111111', 2, 'CDMX-01-C-000002',
       (now() at time zone 'America/Mexico_City')::date, 'unico', 1000,
       coalesce((select min(p.received_at) from public.payments p
                  where p.detail_center_id = '11111111-1111-4111-8111-111111111111'), now()) - interval '1 hour',
       '0e600000-0000-4000-8000-000000000002'
on conflict (id) do nothing;
insert into private.cash_session_counters (detail_center_id, last_number) values ('11111111-1111-4111-8111-111111111111', 2)
on conflict (detail_center_id) do update set last_number = greatest(private.cash_session_counters.last_number, 2);

-- P&L de ejemplo (AF4): una OS entregada hoy en cada centro, pagadas con tarjeta
-- (la venta se reconoce por la entrega; el cobro no mueve el efectivo esperado).
insert into public.service_orders (id, organization_id, detail_center_id, folio, folio_number, client_id, vehicle_id,
                                   channel, status, client_name, client_phone, client_email, vehicle_make, vehicle_model,
                                   vehicle_year, vehicle_plate, authorized_at, started_at, finished_at, delivered_at,
                                   request_id)
values
  ('0d000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-00000000d3e0', '11111111-1111-4111-8111-111111111111',
   'CDMX-01-000003', 3, 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'b2c', 'entregada',
   'José Pérez', '+525512345678', 'jose.perez@example.com', 'Mazda', '3 Hatchback', 2021, 'ABC1234',
   now() - interval '3 hours', now() - interval '170 minutes', now() - interval '20 minutes', now() - interval '10 minutes',
   '0d000000-0000-4000-8000-0000000000a4'),
  ('0d000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-00000000d3e0', '22222222-2222-4222-8222-222222222222',
   'MTY-01-000002', 2, 'c1000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000002', 'b2c', 'entregada',
   'Transportes del Norte', '+528181234567', 'flotilla@example.com', 'Nissan', 'NP300', 2020, 'NL4521A',
   now() - interval '2 hours', now() - interval '110 minutes', now() - interval '20 minutes', now() - interval '10 minutes',
   '0d000000-0000-4000-8000-0000000000a5')
on conflict (id) do nothing;
insert into public.service_order_items (id, organization_id, service_order_id, position, kind, service_id, service_code,
                                        service_name, revenue_engine, unit_price, unit_direct_cost, duration_minutes,
                                        price_source, quantity) values
  ('0e100000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-00000000d3e0', '0d000000-0000-4000-8000-000000000004',
   0, 'servicio', '5e000000-0000-4000-8000-000000000004', 'PUL-1E', 'Pulido en una etapa', 'valor_medio',
   2800, 950, 300, 'base', 1),
  ('0e100000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-00000000d3e0', '0d000000-0000-4000-8000-000000000004',
   1, 'producto', '5e000000-0000-4000-8000-000000000006', 'AROM', 'Aromatizante', 'producto_complemento',
   90, 30, 5, 'base', 2),
  ('0e100000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-00000000d3e0', '0d000000-0000-4000-8000-000000000005',
   0, 'servicio', '5e000000-0000-4000-8000-000000000001', 'LAV-EXP', 'Lavado exprés', 'recurrente',
   220, 70, 40, 'center', 2)
on conflict (id) do nothing;
select count(private.recalc_service_order(id)) from public.service_orders
 where id in ('0d000000-0000-4000-8000-000000000004', '0d000000-0000-4000-8000-000000000005');
update public.service_orders set authorized_total = total
 where id in ('0d000000-0000-4000-8000-000000000004', '0d000000-0000-4000-8000-000000000005') and authorized_total is null;
insert into private.service_order_counters (detail_center_id, last_number) values
  ('11111111-1111-4111-8111-111111111111', 3), ('22222222-2222-4222-8222-222222222222', 2)
on conflict (detail_center_id) do update set last_number = greatest(private.service_order_counters.last_number, excluded.last_number);
select count(private.create_order_payment(o, x.request_id, jsonb_build_array(jsonb_build_object('method', 'tarjeta',
         'amount', o.total, 'reference', x.reference)), null, 'Pago al entregar'))
  from public.service_orders o
  join (values ('0d000000-0000-4000-8000-000000000004'::uuid, '0e300000-0000-4000-8000-0000000000a4'::uuid, 'AUT-7001'),
               ('0d000000-0000-4000-8000-000000000005'::uuid, '0e300000-0000-4000-8000-0000000000a5'::uuid, 'AUT-7002'))
    as x(order_id, request_id, reference) on x.order_id = o.id
 where not exists (select 1 from public.payments p where p.request_id = x.request_id);

-- Cuentas por cobrar B2B de ejemplo (AF5): Transportes del Norte tiene una OS
-- entregada hace 25 días agrupada en el documento CXC-000001 (factura externa
-- A-1523, compromiso vencido hace 5 días, $200 cobrados: queda vencido) y una OS
-- entregada hace 3 días aún por agrupar.
select set_config('app.b2b_link', 'on', false);
insert into public.service_orders (id, organization_id, detail_center_id, folio, folio_number, client_id, vehicle_id,
                                   channel, channel_reference, status, client_name, client_phone, client_email,
                                   vehicle_make, vehicle_model, vehicle_year, vehicle_plate, authorized_at, started_at,
                                   finished_at, delivered_at, b2b_account_id, b2b_agreement_id, request_id)
values
  ('0d000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-00000000d3e0', '22222222-2222-4222-8222-222222222222',
   'MTY-01-000003', 3, 'c1000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000002', 'b2b', 'OC-5480',
   'entregada', 'Transportes del Norte', '+528181234567', 'flotilla@example.com', 'Nissan', 'NP300', 2020, 'NL4521A',
   now() - interval '25 days 3 hours', now() - interval '25 days 2 hours', now() - interval '25 days 1 hour',
   now() - interval '25 days', 'b2000000-0000-4000-8000-000000000001', 'b2100000-0000-4000-8000-000000000001',
   '0d000000-0000-4000-8000-0000000000a6'),
  ('0d000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-00000000d3e0', '22222222-2222-4222-8222-222222222222',
   'MTY-01-000004', 4, 'c1000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000002', 'b2b', 'OC-5533',
   'entregada', 'Transportes del Norte', '+528181234567', 'flotilla@example.com', 'Nissan', 'NP300', 2020, 'NL4521A',
   now() - interval '3 days 3 hours', now() - interval '3 days 2 hours', now() - interval '3 days 1 hour',
   now() - interval '3 days', 'b2000000-0000-4000-8000-000000000001', 'b2100000-0000-4000-8000-000000000001',
   '0d000000-0000-4000-8000-0000000000a7')
on conflict (id) do nothing;
select set_config('app.b2b_link', 'off', false);
insert into public.service_order_items (id, organization_id, service_order_id, position, kind, service_id, service_code,
                                        service_name, revenue_engine, unit_price, unit_direct_cost, duration_minutes,
                                        price_source, list_unit_price, b2b_price_rule_id, quantity) values
  ('0e100000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-00000000d3e0', '0d000000-0000-4000-8000-000000000006',
   0, 'servicio', '5e000000-0000-4000-8000-000000000001', 'LAV-EXP', 'Lavado exprés', 'recurrente',
   199, 70, 40, 'convenio', 220, 'b2e00000-0000-4000-8000-000000000001', 2),
  ('0e100000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-00000000d3e0', '0d000000-0000-4000-8000-000000000007',
   0, 'servicio', '5e000000-0000-4000-8000-000000000001', 'LAV-EXP', 'Lavado exprés', 'recurrente',
   199, 70, 40, 'convenio', 220, 'b2e00000-0000-4000-8000-000000000001', 1)
on conflict (id) do nothing;
select count(private.recalc_service_order(id)) from public.service_orders
 where id in ('0d000000-0000-4000-8000-000000000006', '0d000000-0000-4000-8000-000000000007');
update public.service_orders set authorized_total = total
 where id in ('0d000000-0000-4000-8000-000000000006', '0d000000-0000-4000-8000-000000000007') and authorized_total is null;
insert into private.service_order_counters (detail_center_id, last_number) values ('22222222-2222-4222-8222-222222222222', 4)
on conflict (detail_center_id) do update set last_number = greatest(private.service_order_counters.last_number, 4);

insert into public.b2b_invoices (id, organization_id, account_id, folio, folio_number, reference, issued_on, due_on,
                                 period_from, period_to, external_invoiced_on, orders_amount, fee_amount, notes, request_id)
select '0e800000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0',
       'b2000000-0000-4000-8000-000000000001', 'CXC-000001', 1, 'A-1523', d - 20, d - 5, d - 28, d - 21, d - 19,
       398, 0, 'Compromiso de pago a 15 días acordado con compras', '0e800000-0000-4000-8000-000000000001'
  from (select private.center_today('22222222-2222-4222-8222-222222222222') as d) x
on conflict (id) do nothing;
select set_config('app.b2b_invoice', 'on', false);
update public.service_orders set b2b_invoice_id = '0e800000-0000-4000-8000-000000000001'
 where id = '0d000000-0000-4000-8000-000000000006' and b2b_invoice_id is null;
select set_config('app.b2b_invoice', 'off', false);
insert into private.b2b_document_counters (organization_id, last_number) values ('00000000-0000-4000-8000-00000000d3e0', 1)
on conflict (organization_id) do update set last_number = greatest(private.b2b_document_counters.last_number, 1);
insert into public.b2b_payments (id, organization_id, account_id, invoice_id, amount, method, reference, paid_on, request_id)
values ('0e900000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', 'b2000000-0000-4000-8000-000000000001',
        '0e800000-0000-4000-8000-000000000001', 200, 'transferencia', 'SPEI 0045',
        private.center_today('22222222-2222-4222-8222-222222222222') - 8, '0e900000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
insert into public.b2b_payment_allocations (id, organization_id, payment_id, invoice_id, amount)
values ('0ea00000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', '0e900000-0000-4000-8000-000000000001',
        '0e800000-0000-4000-8000-000000000001', 200)
on conflict (id) do nothing;

-- Tableros ejecutivos (D1): el corporativo por defecto y dos tableros por rol.
select private.seed_default_dashboard('00000000-0000-4000-8000-00000000d3e0');
select set_config('app.change_reason', 'Tableros de ejemplo', false);
insert into public.dashboard_definitions (id, organization_id, name, description, audience_role, default_range)
values
  ('0eb00000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', 'Comercial',
   'Pipeline B2B y B2C premium, y membresías.', 'comercial_b2b', 'mes'),
  ('0eb00000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000d3e0', 'Finanzas',
   'Resultados y cobranza para el contador.', 'contador', 'mes')
on conflict (id) do nothing;
insert into public.dashboard_widgets (id, organization_id, dashboard_id, metric_id, widget_type, position, col_span,
                                      row_span, options)
values
  ('0ec00000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', '0eb00000-0000-4000-8000-000000000001',
   'pipeline.won_value', 'kpi', 1, 1, 1, '{}'),
  ('0ec00000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000d3e0', '0eb00000-0000-4000-8000-000000000001',
   'pipeline.conversion_rate', 'kpi', 2, 1, 1, '{}'),
  ('0ec00000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000d3e0', '0eb00000-0000-4000-8000-000000000001',
   'membership.mrr', 'kpi', 3, 1, 1, '{}'),
  ('0ec00000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-00000000d3e0', '0eb00000-0000-4000-8000-000000000001',
   'pipeline.created', 'funnel', 4, 2, 2, '{}'),
  ('0ec00000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-00000000d3e0', '0eb00000-0000-4000-8000-000000000002',
   'pnl.revenue', 'kpi', 1, 1, 1, '{}'),
  ('0ec00000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-00000000d3e0', '0eb00000-0000-4000-8000-000000000002',
   'payments.collected', 'kpi', 2, 1, 1, '{}'),
  ('0ec00000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-00000000d3e0', '0eb00000-0000-4000-8000-000000000002',
   'expenses.cash_out', 'kpi', 3, 1, 1, '{}'),
  ('0ec00000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-00000000d3e0', '0eb00000-0000-4000-8000-000000000002',
   'payments.collected', 'distribution', 4, 2, 2, '{"breakdown": "forma_pago"}'),
  ('0ec00000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-00000000d3e0', '0eb00000-0000-4000-8000-000000000002',
   'pnl.gross_margin', 'bars', 5, 2, 1, '{}')
on conflict (id) do nothing;
select set_config('app.change_reason', '', false);

-- KPIs (D2): parámetros gerenciales de la organización demo (valores por defecto).
select set_config('app.change_reason', 'Parámetros de KPIs de ejemplo', false);
insert into public.kpi_settings (organization_id) values ('00000000-0000-4000-8000-00000000d3e0')
on conflict (organization_id) do nothing;
select set_config('app.change_reason', '', false);

-- Tablero corporativo (D3): umbrales de alerta visual de ejemplo. Venta mínima
-- del periodo y EBITDA no negativo para cada centro; venta B2B mínima en CDMX.
select set_config('app.change_reason', 'Umbrales de alerta de ejemplo', false);
insert into public.kpi_thresholds (organization_id, metric_id, channel, detail_center_id, min_value, max_value) values
  ('00000000-0000-4000-8000-00000000d3e0', 'pnl.revenue', null, null, 3000, null),
  ('00000000-0000-4000-8000-00000000d3e0', 'pnl.ebitda', null, null, 0, null),
  ('00000000-0000-4000-8000-00000000d3e0', 'pnl.revenue', 'b2b', '11111111-1111-4111-8111-111111111111', 1000, null)
on conflict on constraint kpi_thresholds_scope_key do nothing;
select set_config('app.change_reason', '', false);

-- CR1: servicio con pago al operador como % del precio. Valores de ejemplo
-- (el precio y el % los define cada organización en el catálogo). El costo
-- estándar son los otros costos directos (productos y consumibles), sin mano de obra.
select set_config('app.change_reason', 'Servicio de ejemplo con pago al operador', false);
insert into public.services (id, organization_id, code, name, description, revenue_engine,
                             standard_duration_minutes, base_price, standard_direct_cost, operator_commission_pct)
values ('5e000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-00000000d3e0', 'LAV-MAN', 'Lavado manual detallado',
        'Lavado a mano con detallado exterior e interior; al operador se le paga un % del precio.', 'recurrente', 120, 450, 60, 30)
on conflict (id) do nothing;
select set_config('app.change_reason', '', false);

-- D4: reglas de alerta de ejemplo. Sin usuarios en el seed quedan sin autor: el
-- cron las omite hasta que un admin corporativo las guarde (y las adopte). Una
-- alerta de ejemplo en la bandeja.
select set_config('app.change_reason', 'Reglas de alerta de ejemplo', false);
insert into public.alert_rules (id, organization_id, name, description, metric_id, channel, condition, threshold, period,
                                scope_kind, center_ids, severity, cooldown_minutes) values
  ('a1e70000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', 'Venta diaria baja',
   'Ventas del día anterior por debajo de $3,000 en un centro.', 'pnl.revenue', null, 'below', 3000, 'dia', 'centro',
   array['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']::uuid[], 'atencion', 1440),
  ('a1e70000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000d3e0', 'Caída de ventas del mes',
   'Ventas del mes en curso 15 % o más por debajo del mismo tramo del mes anterior.', 'pnl.revenue', null, 'drop_pct', 15,
   'mes_en_curso', 'corporativo', null, 'critica', 1440),
  ('a1e70000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000d3e0', 'Sin vehículos atendidos',
   'Un centro no entregó ninguna OS el día anterior.', 'orders.vehicles_served', null, 'no_data', null, 'dia', 'centro',
   array['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']::uuid[], 'critica', 1440)
on conflict (id) do nothing;
select set_config('app.change_reason', '', false);
insert into public.alert_instances (id, organization_id, rule_id, rule_name, metric_id, condition, threshold, severity,
  scope_key, detail_center_ids, period_from, period_to, value, last_period_from, last_period_to, last_value)
values ('a1e71000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0',
  'a1e70000-0000-4000-8000-000000000001', 'Venta diaria baja', 'pnl.revenue', 'below', 3000, 'atencion',
  '22222222-2222-4222-8222-222222222222', array['22222222-2222-4222-8222-222222222222']::uuid[],
  current_date - 1, current_date - 1, 660, current_date - 1, current_date - 1, 660)
on conflict (id) do nothing;
insert into public.alert_events (instance_id, kind, value, period_from, period_to)
select 'a1e71000-0000-4000-8000-000000000001', 'creada', 660, current_date - 1, current_date - 1
where not exists (select 1 from public.alert_events where instance_id = 'a1e71000-0000-4000-8000-000000000001');

-- CR2 (fase 1): prospectos por canal, cotizaciones y una tarea. El embudo
-- (etapas) se crea con la organización. Las cotizaciones toman precio, costo y
-- % del operador del catálogo y se recalculan como en la RPC.
select set_config('app.change_reason', 'Prospectos y cotizaciones de ejemplo', false);
insert into public.leads (id, organization_id, detail_center_id, full_name, phone, email, social_handle, source_channel,
                          source_detail, vehicle_description, consent_channels, consent_at, estimated_value, stage_id,
                          next_action, next_action_on, first_contact_at, request_id, created_at)
select x.id, '00000000-0000-4000-8000-00000000d3e0', x.center, x.name, x.phone, null, x.handle, x.channel, x.detail,
       x.vehicle, x.consent, case when cardinality(x.consent) > 0 then now() - interval '2 days' end, x.value, s.id,
       x.next_action, current_date + x.next_in, x.contacted, x.id, now() - interval '2 days'
  from (values
    ('1ead0000-0000-4000-8000-000000000001'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'Mariana Soto',
     '+525587654321', '@marianasoto', 'instagram', 'Anuncio: Lavado manual detallado', 'Honda CR-V 2020',
     array['whatsapp'], 450::numeric, 'cotizado', 'Confirmar fecha de reserva', 1, now() - interval '47 hours'),
    ('1ead0000-0000-4000-8000-000000000002'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, 'Luis Gómez',
     '+525544332211', null, 'whatsapp', null, 'Mazda CX-5', '{}'::text[], null::numeric, 'nuevo',
     'Responder precio de pulido', 0, null::timestamptz),
    ('1ead0000-0000-4000-8000-000000000003'::uuid, '22222222-2222-4222-8222-222222222222'::uuid, 'Carla Méndez',
     '+528112345670', null, 'facebook', 'Comentario en publicación', 'Toyota Hilux', array['whatsapp', 'email'],
     null::numeric, 'contactado', 'Enviar cotización', 1, now() - interval '46 hours')
  ) x(id, center, name, phone, handle, channel, detail, vehicle, consent, value, stage, next_action, next_in, contacted)
  join public.lead_stages s on s.organization_id = '00000000-0000-4000-8000-00000000d3e0' and s.code = x.stage
on conflict (id) do nothing;
insert into public.lead_services (lead_id, service_id, organization_id) values
  ('1ead0000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-00000000d3e0'),
  ('1ead0000-0000-4000-8000-000000000002', '5e000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-00000000d3e0'),
  ('1ead0000-0000-4000-8000-000000000003', '5e000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-00000000d3e0')
on conflict do nothing;

insert into private.quote_counters (detail_center_id, last_number) values
  ('11111111-1111-4111-8111-111111111111', 1), ('22222222-2222-4222-8222-222222222222', 1)
on conflict (detail_center_id) do nothing;
insert into public.quotes (id, organization_id, detail_center_id, folio, folio_number, lead_id, client_id, vehicle_id,
                           contact_name, status, valid_until, sent_at, request_id, created_at)
values
  ('c0700000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', '11111111-1111-4111-8111-111111111111',
   'CDMX-01-COT-00001', 1, '1ead0000-0000-4000-8000-000000000001', null, null, 'Mariana Soto', 'enviada',
   current_date + 13, now() - interval '1 day', 'c0700000-0000-4000-8000-000000000001', now() - interval '1 day'),
  ('c0700000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000d3e0', '22222222-2222-4222-8222-222222222222',
   'MTY-01-COT-00001', 1, null, 'c1000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000002',
   'Transportes del Norte', 'borrador', current_date + 15, null, 'c0700000-0000-4000-8000-000000000002', now())
on conflict (id) do nothing;
insert into public.quote_items (organization_id, quote_id, position, service_id, service_code, service_name, revenue_engine,
                                unit_price, price_source, unit_direct_cost, operator_commission_pct, duration_minutes, quantity)
select s.organization_id, x.quote_id, 0, s.id, s.code, s.name, s.revenue_engine, s.base_price, 'base',
       s.standard_direct_cost, s.operator_commission_pct, s.standard_duration_minutes, x.qty
  from (values ('c0700000-0000-4000-8000-000000000001'::uuid, 1),
               ('c0700000-0000-4000-8000-000000000002'::uuid, 2)) x(quote_id, qty)
  join public.services s on s.id = '5e000000-0000-4000-8000-000000000009'
on conflict (quote_id, service_id) do nothing;
select private.recalc_quote(id) from public.quotes where id in
  ('c0700000-0000-4000-8000-000000000001', 'c0700000-0000-4000-8000-000000000002');

insert into public.lead_events (organization_id, detail_center_id, lead_id, kind, source_channel, from_stage_id, to_stage_id,
                                value, channel, quote_id, note, occurred_at)
select l.organization_id, l.detail_center_id, l.id, e.kind, l.source_channel, fs.id, ts.id, e.value, e.channel, e.quote_id,
       e.note, now() - e.ago
  from (values
    ('1ead0000-0000-4000-8000-000000000001'::uuid, 'creado', null, 'nuevo', 450::numeric, null, null::uuid, null, interval '48 hours'),
    ('1ead0000-0000-4000-8000-000000000001'::uuid, 'contacto', null, null, null, 'redes', null, 'Respondió el DM', interval '47 hours'),
    ('1ead0000-0000-4000-8000-000000000001'::uuid, 'etapa', 'nuevo', 'contactado', null, null, null, 'Primer contacto', interval '47 hours'),
    ('1ead0000-0000-4000-8000-000000000001'::uuid, 'cotizacion', null, null, 450, null, 'c0700000-0000-4000-8000-000000000001'::uuid, 'CDMX-01-COT-00001', interval '24 hours'),
    ('1ead0000-0000-4000-8000-000000000001'::uuid, 'etapa', 'contactado', 'cotizado', null, null, null, 'Cotización CDMX-01-COT-00001', interval '24 hours'),
    ('1ead0000-0000-4000-8000-000000000002'::uuid, 'creado', null, 'nuevo', null, null, null, null, interval '48 hours'),
    ('1ead0000-0000-4000-8000-000000000003'::uuid, 'creado', null, 'nuevo', null, null, null, null, interval '48 hours'),
    ('1ead0000-0000-4000-8000-000000000003'::uuid, 'contacto', null, null, null, 'redes', null, 'Respondí el comentario', interval '46 hours'),
    ('1ead0000-0000-4000-8000-000000000003'::uuid, 'etapa', 'nuevo', 'contactado', null, null, null, 'Primer contacto', interval '46 hours')
  ) e(lead_id, kind, from_stage, to_stage, value, channel, quote_id, note, ago)
  join public.leads l on l.id = e.lead_id
  left join public.lead_stages fs on fs.organization_id = l.organization_id and fs.code = e.from_stage
  left join public.lead_stages ts on ts.organization_id = l.organization_id and ts.code = e.to_stage
 where not exists (select 1 from public.lead_events x where x.lead_id = e.lead_id);

insert into public.crm_tasks (id, organization_id, detail_center_id, lead_id, kind, channel, due_on, notes, source, request_id)
values ('7a500000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', '11111111-1111-4111-8111-111111111111',
        '1ead0000-0000-4000-8000-000000000002', 'whatsapp', 'whatsapp', current_date, 'Enviar precio de pulido', 'prospecto',
        '7a500000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- CR2 (fase 2): bandeja demo. La cuenta queda «pendiente» (no conectada): sólo el
-- servidor la marca verificada tras consultar a Meta con credenciales reales.
insert into public.channel_accounts (id, organization_id, detail_center_id, channel, external_account_id, label)
values ('c4a00000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', '11111111-1111-4111-8111-111111111111',
        'whatsapp', '100000000000001', 'WhatsApp demo (no conectado)')
on conflict (id) do nothing;
insert into public.conversations (id, organization_id, detail_center_id, channel_account_id, channel, contact_external_id,
                                  contact_phone, contact_name, lead_id, status, unread_count, last_inbound_at, last_message_at,
                                  last_message_preview)
values ('c4b00000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', '11111111-1111-4111-8111-111111111111',
        'c4a00000-0000-4000-8000-000000000001', 'whatsapp', '5215544332211', '+5215544332211', 'Luis Gómez',
        '1ead0000-0000-4000-8000-000000000002', 'abierta', 1, now() - interval '3 hours', now() - interval '3 hours',
        '¿Cuánto cuesta el pulido?')
on conflict (id) do nothing;
insert into public.messages (id, organization_id, detail_center_id, conversation_id, direction, external_id, body, status, occurred_at)
values ('c4c00000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', '11111111-1111-4111-8111-111111111111',
        'c4b00000-0000-4000-8000-000000000001', 'entrante', 'wamid.demo.1', 'Hola, ¿cuánto cuesta el pulido?', 'recibido',
        now() - interval '3 hours 5 minutes'),
       ('c4c00000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000d3e0', '11111111-1111-4111-8111-111111111111',
        'c4b00000-0000-4000-8000-000000000001', 'entrante', 'wamid.demo.2', '¿Cuánto cuesta el pulido?', 'recibido',
        now() - interval '3 hours')
on conflict (id) do nothing;

-- CR2 (fase 3): campaña del centro CDMX con UTM, inversión, calendario y promoción.
insert into public.campaigns (id, organization_id, detail_center_id, name, objective, channels, starts_on, ends_on, budget,
                              status, utm_source, utm_medium, utm_campaign, landing_url)
values ('ca000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', '11111111-1111-4111-8111-111111111111',
        'Lavado manual del mes', 'prospectos', array['facebook', 'instagram'], current_date - 10, current_date + 20, 5000,
        'activa', 'instagram', 'paid_social', 'lavado_manual_mes', 'https://meguiars-web.vercel.app')
on conflict (id) do nothing;
insert into public.campaign_spend (id, organization_id, campaign_id, spent_on, amount, channel, note)
values ('ca100000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', 'ca000000-0000-4000-8000-000000000001',
        current_date - 3, 1200, 'instagram', 'Anuncios en Instagram (demo)')
on conflict (id) do nothing;
insert into public.content_posts (id, organization_id, detail_center_id, campaign_id, channel, format, title, copy, planned_at,
                                  status, link_url)
values ('ca200000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', '11111111-1111-4111-8111-111111111111',
        'ca000000-0000-4000-8000-000000000001', 'instagram', 'reel', 'Antes y después: lavado manual detallado',
        'Agenda por WhatsApp y menciona LAVA15.', now() + interval '2 days', 'programada',
        'https://meguiars-web.vercel.app?utm_source=instagram&utm_medium=paid_social&utm_campaign=lavado_manual_mes&utm_content=reel')
on conflict (id) do nothing;
insert into public.promotions (id, organization_id, campaign_id, code, name, kind, value, service_ids, starts_on, ends_on, max_uses)
select 'ca300000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d3e0', 'ca000000-0000-4000-8000-000000000001',
       'LAVA15', 'Lavado manual 15 %', 'percent', 15, array['5e000000-0000-4000-8000-000000000009']::uuid[],
       current_date - 10, current_date + 20, 100
 where exists (select 1 from public.services where id = '5e000000-0000-4000-8000-000000000009')
on conflict (id) do nothing;
update public.leads set campaign_id = 'ca000000-0000-4000-8000-000000000001'
 where id = '1ead0000-0000-4000-8000-000000000001' and campaign_id is null;
select set_config('app.change_reason', '', false);
