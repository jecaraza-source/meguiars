-- Datos con el esquema anterior a 20261003000000_crm: clientes con y sin
-- consentimiento de marketing (clients.marketing_channels).
insert into public.organizations (id, slug, name) values
  ('2e000000-0000-0000-0000-000000000001', 'org-crm', 'Organización CRM');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('2eea0000-0000-0000-0000-000000000001', '2e000000-0000-0000-0000-000000000001', 'CRM-01', 'Centro CRM', 'America/Mexico_City');
insert into public.clients (id, organization_id, home_detail_center_id, kind, full_name, phone, email,
                            marketing_opt_in, marketing_channels, marketing_opt_in_at, marketing_opt_in_source,
                            request_id, created_in_detail_center_id) values
  ('2c000000-0000-0000-0000-000000000001', '2e000000-0000-0000-0000-000000000001', '2eea0000-0000-0000-0000-000000000001',
   'person', 'Con consentimiento', '+525500000001', 'a@example.com', true, '{whatsapp,email}', now(), 'web',
   '2c000000-0000-0000-0000-0000000000a1', '2eea0000-0000-0000-0000-000000000001'),
  ('2c000000-0000-0000-0000-000000000002', '2e000000-0000-0000-0000-000000000001', '2eea0000-0000-0000-0000-000000000001',
   'person', 'Sin consentimiento', '+525500000002', null, false, '{}', null, null,
   '2c000000-0000-0000-0000-0000000000a2', '2eea0000-0000-0000-0000-000000000001');
