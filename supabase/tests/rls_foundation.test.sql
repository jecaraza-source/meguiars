-- Pruebas de RLS y auditoría de la migración foundation.
-- Se ejecuta con: npm run test:db  (falla con ON_ERROR_STOP si una aserción no se cumple)
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

-- Zona horaria inválida
do $$ begin
  begin
    insert into public.detail_centers (code, name, timezone) values ('BAD-01', 'Malo', 'Mars/Olympus');
    raise exception 'FALLÓ: aceptó zona horaria inválida';
  exception when invalid_parameter_value then raise notice 'ok - rechaza zona horaria inválida';
  end;
end $$;

-- anon no ve nada
set local role anon;
do $$ begin
  begin
    perform 1 from public.detail_centers;
    raise exception 'FALLÓ: anon pudo leer detail_centers';
  exception when insufficient_privilege then raise notice 'ok - anon sin acceso a detail_centers';
  end;
end $$;
reset role;

-- Técnico del centro A
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert((select count(*) from public.detail_centers) = 1, 'técnico sólo ve su centro');
select pg_temp.assert((select count(*) from public.center_memberships) = 1, 'técnico sólo ve su propia membresía');
select pg_temp.assert((select count(*) from public.audit_log) = 0, 'técnico no lee auditoría');
update public.detail_centers set name = 'Hackeado';
select pg_temp.assert((select count(*) from public.detail_centers where name = 'Hackeado') = 0, 'técnico no puede editar el centro');
do $$ begin
  begin
    insert into public.center_memberships (detail_center_id, user_id, role)
    values ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000c', 'owner');
    raise exception 'FALLÓ: técnico se auto-asignó owner';
  exception when insufficient_privilege or unique_violation then raise notice 'ok - técnico no gestiona membresías';
  end;
end $$;
reset role;

-- Admin del centro A
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.assert((select count(*) from public.center_memberships) = 3, 'admin ve membresías de su centro y no las de B');
update public.center_memberships set role = 'manager'
  where user_id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.assert((select role from public.center_memberships where user_id = '00000000-0000-0000-0000-00000000000c') = 'manager',
  'admin cambia rol de técnico a manager');
update public.center_memberships set role = 'viewer'
  where user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.assert((select role from public.center_memberships where user_id = '00000000-0000-0000-0000-00000000000a') = 'owner',
  'admin no puede degradar a un owner');
do $$ begin
  begin
    update public.center_memberships set role = 'owner'
      where user_id = '00000000-0000-0000-0000-00000000000b';
    raise exception 'FALLÓ: admin se promovió a owner';
  exception when insufficient_privilege then raise notice 'ok - admin no puede otorgar owner';
  end;
end $$;
do $$ begin
  begin
    insert into public.center_memberships (detail_center_id, user_id, role)
    values ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000b', 'admin');
    raise exception 'FALLÓ: admin de A se agregó al centro B';
  exception when insufficient_privilege then raise notice 'ok - admin no cruza centros';
  end;
end $$;
do $$ begin
  begin
    insert into public.audit_log (table_name, action) values ('x', 'INSERT');
    raise exception 'FALLÓ: cliente escribió en audit_log';
  exception when insufficient_privilege then raise notice 'ok - audit_log es de sólo lectura para clientes';
  end;
end $$;

-- Cambio sensible con motivo: queda auditado con actor y valores anterior/nuevo.
select set_config('app.change_reason', 'Horario de verano', true);
update public.detail_centers set timezone = 'America/Cancun' where code = 'CDMX-01';
select pg_temp.assert(
  (select count(*) from public.audit_log
    where table_name = 'public.detail_centers' and action = 'UPDATE'
      and actor_id = '00000000-0000-0000-0000-00000000000b'
      and reason = 'Horario de verano'
      and old_data ->> 'timezone' = 'America/Mexico_City'
      and new_data ->> 'timezone' = 'America/Cancun') = 1,
  'auditoría registra actor, motivo, valor anterior y nuevo');
select pg_temp.assert(
  (select count(*) from public.audit_log
    where table_name = 'public.center_memberships' and action = 'UPDATE'
      and old_data ->> 'role' = 'technician' and new_data ->> 'role' = 'manager') = 1,
  'cambio de rol queda auditado');
select pg_temp.assert(
  (select count(*) from public.audit_log where detail_center_id = 'bbbbbbbb-0000-0000-0000-000000000000') = 0,
  'admin de A no ve auditoría de B');
reset role;

-- Owner de B no ve nada de A
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.assert((select count(*) from public.detail_centers) = 1, 'owner de B sólo ve B');
select pg_temp.assert((select count(*) from public.profiles) = 1, 'owner de B sólo ve perfiles de su centro');
reset role;

rollback;
