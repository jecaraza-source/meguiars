-- Datos con el esquema de 20260922000000_foundation (roles anteriores),
-- cargados justo antes de aplicar 20260923000000_multicenter_security.
insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'owner@legacy'),
  ('10000000-0000-0000-0000-000000000002', 'admin@legacy'),
  ('10000000-0000-0000-0000-000000000003', 'manager@legacy'),
  ('10000000-0000-0000-0000-000000000004', 'advisor@legacy'),
  ('10000000-0000-0000-0000-000000000005', 'tech@legacy'),
  ('10000000-0000-0000-0000-000000000006', 'viewer@legacy');
insert into public.detail_centers (id, code, name, timezone) values
  ('1eea0000-0000-0000-0000-000000000001', 'CDMX-01', 'Legado CDMX', 'America/Mexico_City'),
  ('1eea0000-0000-0000-0000-000000000002', 'MTY-01', 'Legado MTY', 'America/Monterrey');
insert into public.center_memberships (detail_center_id, user_id, role) values
  ('1eea0000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('1eea0000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'admin'),
  ('1eea0000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'manager'),
  ('1eea0000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', 'advisor'),
  ('1eea0000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000005', 'technician'),
  ('1eea0000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000006', 'viewer');
