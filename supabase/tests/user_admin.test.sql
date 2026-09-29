-- Pruebas de A1: administración de usuarios. Sólo el admin corporativo lista
-- usuarios de su organización (con correo y roles) y desactiva/reactiva cuentas
-- que pertenecen únicamente a su organización; nunca la propia.
\set ON_ERROR_STOP on
begin;

create function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

create function pg_temp.assert_fails(stmt text, expected_state text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate = expected_state then
      raise notice 'ok - %', msg;
      return;
    end if;
    raise exception 'FALLÓ: % (SQLSTATE % en lugar de %: %)', msg, sqlstate, expected_state, sqlerrm;
  end;
  raise exception 'FALLÓ: % (no produjo error)', msg;
end $$;

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('app.change_reason', '', true);
  execute 'set local role authenticated';
end $$;

grant execute on all functions in schema pg_temp to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1', '{"full_name":"Admin Uno"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@o2', '{"full_name":"Admin Dos"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'socio.centro@o1', '{"full_name":"Socio de Centro"}'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@o1', '{"full_name":"Encargado Uno"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'doble@o1o2', '{"full_name":"En Dos Organizaciones"}');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno'),
  ('0e000000-0000-0000-0000-000000000002', 'org-dos', 'Organización Dos');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000002', 'B-01', 'Centro B', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio'),
  ('0e000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a2', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'admin_socio'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000d1', 'contador'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000d1', 'contador');

-- Listado: sólo el admin corporativo, sólo su organización, con correo y roles.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(public.can_admin_users('0e000000-0000-0000-0000-000000000001'), 'admin corporativo administra usuarios');
select pg_temp.assert(not public.can_admin_users('0e000000-0000-0000-0000-000000000002'), 'no administra otra organización');
select pg_temp.assert((select count(*) from public.org_users('0e000000-0000-0000-0000-000000000001')) = 4,
  'lista los 4 usuarios con rol en su organización (no el admin de la otra)');
select pg_temp.assert((select email = 'encargado@o1' and full_name = 'Encargado Uno' and active
                         and center_roles -> 0 ->> 'role' = 'encargado' and center_roles -> 0 ->> 'center_name' = 'Centro A'
                         and cardinality(corporate_roles) = 0 and not other_org
                        from public.org_users('0e000000-0000-0000-0000-000000000001')
                       where user_id = '00000000-0000-0000-0000-0000000000e1'), 'correo, nombre, estado y rol por centro');
select pg_temp.assert((select corporate_roles = '{admin_socio}' from public.org_users('0e000000-0000-0000-0000-000000000001')
                       where user_id = '00000000-0000-0000-0000-0000000000a1'), 'rol corporativo');
select pg_temp.assert((select other_org from public.org_users('0e000000-0000-0000-0000-000000000001')
                       where user_id = '00000000-0000-0000-0000-0000000000d1'), 'marca a quien también está en otra organización');
select pg_temp.assert_fails($$select * from public.org_users('0e000000-0000-0000-0000-000000000002')$$, '42501',
  'no lista usuarios de otra organización');
select pg_temp.assert(public.can_admin_user('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1')
  and public.can_admin_user('0e000000-0000-0000-0000-000000000001', null),
  'puede administrar a su encargado y dar altas');
select pg_temp.assert(not public.can_admin_user('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1')
  and not public.can_admin_user('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2'),
  'no administra cuentas de otra organización ni compartidas');
reset role;

-- Un admin_socio sólo de centro, o un encargado, no administran usuarios.
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert(not public.can_admin_users('0e000000-0000-0000-0000-000000000001'), 'admin de centro no da altas');
select pg_temp.assert_fails($$select * from public.org_users('0e000000-0000-0000-0000-000000000001')$$, '42501',
  'admin de centro no lista usuarios');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.admin_set_user_disabled('0e000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000b1', true, 'Prueba de permisos')$$, '42501', 'encargado no desactiva usuarios');
reset role;

-- Desactivar / reactivar con motivo; nunca la propia cuenta ni una compartida.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select public.admin_set_user_disabled('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1',
  true, 'Dejó de laborar');
select pg_temp.assert((select not active from public.org_users('0e000000-0000-0000-0000-000000000001')
                       where user_id = '00000000-0000-0000-0000-0000000000e1'), 'queda inactivo');
select pg_temp.assert_fails($$select public.admin_set_user_disabled('0e000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1', true, 'Me desactivo')$$, '22023', 'no se desactiva a sí mismo');
select pg_temp.assert_fails($$select public.admin_set_user_disabled('0e000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000d1', true, 'Compartido')$$, '42501', 'no desactiva a quien está en otra organización');
select pg_temp.assert_fails($$select public.admin_set_user_disabled('0e000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000e1', false, '')$$, '22023', 'exige motivo');
select public.admin_set_user_disabled('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1',
  false, 'Regresó a laborar');
reset role;
select pg_temp.assert((select banned_until is null from auth.users where id = '00000000-0000-0000-0000-0000000000e1')
  and (select active from public.profiles where id = '00000000-0000-0000-0000-0000000000e1'), 'reactivado: login y acceso');
select pg_temp.assert((select count(*) from public.audit_log where table_name = 'public.profiles'
                        and record_id = '00000000-0000-0000-0000-0000000000e1') >= 2, 'desactivar y reactivar quedan en la bitácora');

-- Sin sesión (anon) no hay acceso.
select pg_temp.assert(not has_function_privilege('anon', 'public.org_users(uuid)', 'execute'), 'anon no ejecuta org_users');

rollback;
