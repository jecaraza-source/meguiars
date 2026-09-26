-- Datos para la prueba de concurrencia de OS (scripts/test-db.sh): varias
-- sesiones abren OS y editan la misma OS al mismo tiempo.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'operador@a');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion');
insert into public.services (id, organization_id, code, name, revenue_engine, standard_duration_minutes,
                             base_price, standard_direct_cost) values
  ('5e000000-0000-4000-8000-000000000001', '0e000000-0000-0000-0000-000000000001', 'LAV', 'Lavado', 'recurrente', 40, 250, 80);
insert into public.clients (id, organization_id, home_detail_center_id, kind, full_name, phone, request_id,
                            created_in_detail_center_id) values
  ('c1000000-0000-4000-8000-000000000001', '0e000000-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000000', 'person', 'José Pérez', '+525512345678',
   'c1000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000000');
insert into public.client_centers (client_id, detail_center_id, organization_id) values
  ('c1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001');
insert into public.vehicles (id, organization_id, client_id, make, model, year, plate, created_in_detail_center_id) values
  ('c2000000-0000-4000-8000-000000000001', '0e000000-0000-0000-0000-000000000001', 'c1000000-0000-4000-8000-000000000001',
   'Mazda', '3', 2021, 'ABC1234', 'aaaaaaaa-0000-0000-0000-000000000000');
