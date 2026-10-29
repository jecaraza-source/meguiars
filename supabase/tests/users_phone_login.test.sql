-- Usuarios que entran con celular (20261108000000_users_phone_login): el listado
-- de usuarios muestra el celular cuando la cuenta no tiene correo.
\set ON_ERROR_STOP on
begin;

create function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('app.change_reason', '', true);
  execute 'set local role authenticated';
end $$;

grant execute on all functions in schema pg_temp to authenticated;

-- Supabase guarda el celular sin «+».
insert into auth.users (id, email, phone, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1', null, '{"full_name":"Admin Uno"}'),
  ('00000000-0000-0000-0000-0000000000f1', null, '525512345678', '{"full_name":"Recepción Celular"}'),
  ('00000000-0000-0000-0000-0000000000f2', '', '525587654321', '{"full_name":"Correo Vacío"}'),
  ('00000000-0000-0000-0000-0000000000f3', 'ambos@o1', '525511112222', '{"full_name":"Con Ambos"}');
insert into public.organizations (id, slug, name) values ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f3', 'encargado');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(
  (select string_agg(full_name || '=' || email, ', ' order by full_name)
     from public.org_users('0e000000-0000-0000-0000-000000000001'))
  = 'Admin Uno=admin@o1, Con Ambos=ambos@o1, Correo Vacío=+525587654321, Recepción Celular=+525512345678',
  'el listado muestra el correo o, si no tiene, el celular en E.164');
reset role;

rollback;
