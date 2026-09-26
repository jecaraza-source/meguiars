-- Pruebas de F0.3: centro activo y cuentas deshabilitadas.
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

grant execute on all functions in schema pg_temp to authenticated, anon, service_role;

-- Org con centros A, B y X (deshabilitado); un operador en A y X, un usuario sin centros.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000f9', 'sin-centro@o1');
insert into public.organizations (id, slug, name) values ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno');
insert into public.detail_centers (id, organization_id, code, name, active) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', true),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', true),
  ('eeeeeeee-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'X-01', 'Centro X', false);
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('eeeeeeee-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion');

-- ---------------------------------------------------------------------------
-- Centro activo
-- ---------------------------------------------------------------------------
set local role anon;
select pg_temp.assert_fails($$select public.set_active_center('aaaaaaaa-0000-0000-0000-000000000000')$$,
  '42501', 'anon no fija centro activo');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(public.set_active_center('aaaaaaaa-0000-0000-0000-000000000000') = 'aaaaaaaa-0000-0000-0000-000000000000',
  'el usuario fija como activo un centro al que pertenece');
select pg_temp.assert(
  (select last_detail_center_id from public.profiles where id = auth.uid()) = 'aaaaaaaa-0000-0000-0000-000000000000',
  'el centro activo queda en su perfil (compartido web/móvil)');
select pg_temp.assert_fails($$select public.set_active_center('bbbbbbbb-0000-0000-0000-000000000000')$$,
  '42501', 'no puede activar un centro ajeno');
select pg_temp.assert_fails($$select public.set_active_center('eeeeeeee-0000-0000-0000-000000000000')$$,
  '42501', 'no puede activar un centro deshabilitado aunque tenga membresía');
select pg_temp.assert_fails(
  $$update public.profiles set last_detail_center_id = 'bbbbbbbb-0000-0000-0000-000000000000' where id = auth.uid()$$,
  '42501', 'no puede escribir last_detail_center_id directamente');
select pg_temp.assert_fails($$select public.set_user_disabled(auth.uid(), false, 'me rehabilito')$$,
  '42501', 'un usuario autenticado no ejecuta set_user_disabled');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f9');
select pg_temp.assert_fails($$select public.set_active_center('aaaaaaaa-0000-0000-0000-000000000000')$$,
  '42501', 'un usuario sin centros no activa ninguno');
reset role;

-- ---------------------------------------------------------------------------
-- Cuenta deshabilitada (service_role)
-- ---------------------------------------------------------------------------
set local role service_role;
select public.set_user_disabled('00000000-0000-0000-0000-0000000000f1', true, 'Baja del empleado');
reset role;
select pg_temp.assert(
  (select not p.active and u.banned_until = 'infinity'
     from public.profiles p join auth.users u on u.id = p.id
    where p.id = '00000000-0000-0000-0000-0000000000f1'),
  'deshabilitar marca el perfil inactivo y bloquea el login/refresco en Auth');
select pg_temp.assert(
  (select count(*) from public.audit_log where event = 'user.disabled' and reason = 'Baja del empleado'
     and record_id = '00000000-0000-0000-0000-0000000000f1') = 1,
  'deshabilitar queda auditado con motivo');

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert((select count(*) from public.my_detail_centers()) = 0,
  'la sesión vigente de un usuario deshabilitado ya no ve centros (RLS)');
select pg_temp.assert(
  (select active from public.profiles where id = auth.uid()) = false,
  'el usuario deshabilitado sí puede leer su perfil para mostrar "cuenta deshabilitada"');
select pg_temp.assert_fails($$select public.set_active_center('aaaaaaaa-0000-0000-0000-000000000000')$$,
  '42501', 'un usuario deshabilitado no fija centro activo');
reset role;

set local role service_role;
select pg_temp.assert_fails($$select public.set_user_disabled('00000000-0000-0000-0000-0000000000f1', false, 'no')$$,
  '22023', 'rehabilitar exige motivo');
select public.set_user_disabled('00000000-0000-0000-0000-0000000000f1', false, 'Reingreso');
select pg_temp.assert_fails($$select public.set_user_disabled('00000000-0000-0000-0000-000000000999', true, 'No existe')$$,
  '22023', 'deshabilitar un usuario inexistente falla');
reset role;
select pg_temp.assert(
  (select p.active and u.banned_until is null
     from public.profiles p join auth.users u on u.id = p.id
    where p.id = '00000000-0000-0000-0000-0000000000f1'),
  'rehabilitar restaura el perfil y quita el bloqueo de Auth');
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert((select count(*) from public.my_detail_centers() where active) = 1,
  'al rehabilitarlo recupera su acceso');
reset role;

rollback;
