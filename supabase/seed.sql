-- Datos mínimos para desarrollo local (`supabase db reset` los carga después de las migraciones).
-- Los usuarios se crean con Auth (Studio local → Authentication → Add user); después
-- se asignan a un centro, por ejemplo:
--   insert into public.center_memberships (detail_center_id, user_id, role)
--   select id, '<uuid del usuario>', 'owner' from public.detail_centers;
insert into public.detail_centers (id, code, name, timezone) values
  ('11111111-1111-4111-8111-111111111111', 'CDMX-01', 'Meguiar''s Detail Center CDMX', 'America/Mexico_City'),
  ('22222222-2222-4222-8222-222222222222', 'MTY-01', 'Meguiar''s Detail Center Monterrey', 'America/Monterrey')
on conflict (id) do nothing;
