-- Datos con el esquema anterior a 20261006000000_pipeline: una organización ya
-- existente (sin etapas), un seguimiento del CRM (cliente obligatorio) y una
-- cuenta B2B con RFC.
insert into public.crm_tasks (id, organization_id, detail_center_id, client_id, kind, channel, due_on, notes, source) values
  ('2b000000-0000-0000-0000-000000000001', '2e000000-0000-0000-0000-000000000001', '2eea0000-0000-0000-0000-000000000001',
   '2c000000-0000-0000-0000-000000000001', 'llamar', 'llamada', current_date + 1, 'Seguimiento previo', 'manual');
insert into public.clients (id, organization_id, home_detail_center_id, kind, full_name, phone, request_id,
                            created_in_detail_center_id) values
  ('2c000000-0000-0000-0000-000000000003', '2e000000-0000-0000-0000-000000000001', '2eea0000-0000-0000-0000-000000000001',
   'company', 'Flotilla previa', '+525500000003', '2c000000-0000-0000-0000-0000000000a3',
   '2eea0000-0000-0000-0000-000000000001');
insert into public.b2b_accounts (id, organization_id, home_detail_center_id, client_id, name, rfc, request_id) values
  ('2b100000-0000-0000-0000-000000000001', '2e000000-0000-0000-0000-000000000001', '2eea0000-0000-0000-0000-000000000001',
   '2c000000-0000-0000-0000-000000000003', 'Flotilla previa', 'FPR010101AB1', '2b100000-0000-0000-0000-0000000000a1');
