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
