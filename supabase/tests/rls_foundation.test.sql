-- Pruebas de RLS, RPC y auditoría de la migración foundation.
-- Se ejecuta con: npm run test:db  (ON_ERROR_STOP: cualquier aserción fallida aborta con código ≠ 0)
\set ON_ERROR_STOP on
begin;

create function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- Ejecuta `stmt` y exige que falle con el SQLSTATE indicado.
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

grant execute on all functions in schema pg_temp to authenticated, anon;

-- Datos: 2 centros, 4 usuarios.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@a', '{"full_name":"Owner A"}'),
  ('00000000-0000-0000-0000-00000000000b', 'admin@a', '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'tech@a', '{}'),
  ('00000000-0000-0000-0000-00000000000d', 'owner@b', '{}');
insert into public.detail_centers (id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'CDMX-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'MTY-01', 'Centro B', 'America/Monterrey');
insert into public.center_memberships (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000a', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000b', 'admin'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000c', 'technician'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000d', 'owner');

select pg_temp.assert((select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'Owner A',
  'el perfil se crea al registrar usuario');
select pg_temp.assert_fails(
  $$insert into public.detail_centers (code, name, timezone) values ('BAD-01', 'Malo', 'Mars/Olympus')$$,
  '22023', 'rechaza zona horaria inválida');

-- anon no ve ni ejecuta nada
set local role anon;
select pg_temp.assert_fails('select 1 from public.detail_centers', '42501', 'anon sin acceso a detail_centers');
select pg_temp.assert_fails(
  $$select public.update_detail_center('aaaaaaaa-0000-0000-0000-000000000000', 'X', 'UTC', 'motivo')$$,
  '42501', 'anon no puede ejecutar RPC');
reset role;

-- Técnico del centro A
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert((select count(*) from public.detail_centers) = 1, 'técnico sólo ve su centro');
select pg_temp.assert((select count(*) from public.center_memberships) = 1, 'técnico sólo ve su propia membresía');
select pg_temp.assert((select count(*) from public.audit_log) = 0, 'técnico no lee auditoría');
select pg_temp.assert_fails(
  $$select public.update_detail_center('aaaaaaaa-0000-0000-0000-000000000000', 'Hackeado', 'UTC', 'porque sí')$$,
  '42501', 'técnico no puede editar el centro');
select pg_temp.assert_fails(
  $$select public.set_center_membership('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000c', 'owner', true, 'me promuevo')$$,
  '42501', 'técnico no gestiona membresías');
reset role;

-- Admin del centro A
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.assert((select count(*) from public.center_memberships) = 3, 'admin ve membresías de su centro y no las de B');
select pg_temp.assert_fails(
  $$update public.detail_centers set name = 'Directo' where code = 'CDMX-01'$$,
  '23514', 'escritura directa sin RPC/motivo es rechazada');
select pg_temp.assert_fails(
  $$select public.update_detail_center('aaaaaaaa-0000-0000-0000-000000000000', 'Centro A', 'UTC', 'no')$$,
  '22023', 'RPC exige motivo de 3+ caracteres');
select pg_temp.assert_fails(
  $$delete from public.center_memberships where user_id = '00000000-0000-0000-0000-00000000000c'$$,
  '42501', 'las membresías no se borran, se desactivan');

select from public.set_center_membership('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000c',
  'manager', true, 'Ascenso a jefe de taller');
select pg_temp.assert((select role from public.center_memberships where user_id = '00000000-0000-0000-0000-00000000000c') = 'manager',
  'admin cambia rol de técnico a manager vía RPC');
select pg_temp.assert_fails(
  $$select public.set_center_membership('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000a', 'viewer', true, 'degradar')$$,
  '42501', 'admin no puede degradar a un owner');
select pg_temp.assert_fails(
  $$select public.set_center_membership('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000b', 'owner', true, 'autopromoción')$$,
  '42501', 'admin no puede otorgar owner');
select pg_temp.assert_fails(
  $$select public.set_center_membership('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000b', 'admin', true, 'cruzar centros')$$,
  '42501', 'admin no cruza centros');
select pg_temp.assert_fails(
  $$insert into public.audit_log (table_name, action) values ('x', 'INSERT')$$,
  '42501', 'audit_log es de sólo lectura para clientes');

-- Cambio sensible con motivo: queda auditado con actor y valores anterior/nuevo.
select from public.update_detail_center('aaaaaaaa-0000-0000-0000-000000000000', '  Centro A Polanco ', 'America/Cancun', 'Horario de verano');
select pg_temp.assert(
  (select count(*) from public.audit_log
    where table_name = 'public.detail_centers' and action = 'UPDATE'
      and actor_id = '00000000-0000-0000-0000-00000000000b'
      and reason = 'Horario de verano'
      and old_data ->> 'timezone' = 'America/Mexico_City'
      and new_data ->> 'timezone' = 'America/Cancun'
      and new_data ->> 'name' = 'Centro A Polanco') = 1,
  'auditoría registra actor, motivo, valor anterior y nuevo');
select pg_temp.assert(
  (select count(*) from public.audit_log
    where table_name = 'public.center_memberships' and action = 'UPDATE'
      and reason = 'Ascenso a jefe de taller'
      and old_data ->> 'role' = 'technician' and new_data ->> 'role' = 'manager') = 1,
  'cambio de rol queda auditado con motivo');
select pg_temp.assert(
  (select count(*) from public.audit_log where detail_center_id = 'bbbbbbbb-0000-0000-0000-000000000000') = 0,
  'admin de A no ve auditoría de B');
reset role;

-- Owner de A puede otorgar owner; owner de B no ve nada de A
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select from public.set_center_membership('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000b',
  'owner', true, 'Socio');
select pg_temp.assert((select role from public.center_memberships where user_id = '00000000-0000-0000-0000-00000000000b') = 'owner',
  'owner puede otorgar owner');
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.assert((select count(*) from public.detail_centers) = 1, 'owner de B sólo ve B');
select pg_temp.assert((select count(*) from public.profiles) = 1, 'owner de B sólo ve perfiles de su centro');
reset role;

-- Vista corporativa: un usuario con membresía en ambos centros ve ambos.
insert into public.center_memberships (detail_center_id, user_id, role) values
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000a', 'viewer');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.assert((select count(*) from public.detail_centers) = 2, 'usuario multicentro ve la vista consolidada');
reset role;

rollback;
