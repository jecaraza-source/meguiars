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
