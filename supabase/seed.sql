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
