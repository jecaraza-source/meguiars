-- Pruebas de tenancy multicentro, RLS, RPC y auditoría (F0.1 + F0.2).
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

create function pg_temp.n(sql text) returns bigint language plpgsql as $$
declare c bigint;
begin
  execute 'select count(*) from (' || sql || ') s' into c;
  return c;
end $$;

grant execute on all functions in schema pg_temp to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Datos
--   Org O1 (demo): centros A, B y X (deshabilitado).   Org O2: centro C.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1', '{"full_name":"Admin Corporativo"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@o1', '{}'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a', '{}'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a', '{}'),
  ('00000000-0000-0000-0000-0000000000f2', 'operador@ab', '{}'),
  ('00000000-0000-0000-0000-0000000000d1', 'socio@a', '{}'),
  ('00000000-0000-0000-0000-0000000000b1', 'b2b@b', '{}'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@o2', '{}'),
  ('00000000-0000-0000-0000-0000000000ff', 'baja@a', '{}');

insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno'),
  ('0e000000-0000-0000-0000-000000000002', 'org-dos', 'Organización Dos');
insert into public.detail_centers (id, organization_id, code, name, timezone, active) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'CDMX-01', 'Centro A', 'America/Mexico_City', true),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'MTY-01', 'Centro B', 'America/Monterrey', true),
  ('eeeeeeee-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'GDL-01', 'Centro X', 'America/Mexico_City', false),
  ('cccccccc-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000002', 'CDMX-01', 'Centro C', 'America/Mexico_City', true);
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio'),
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'contador'),
  ('0e000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a2', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000d1', 'admin_socio'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'comercial_b2b'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000ff', 'operador_recepcion');
update public.profiles set active = false where id = '00000000-0000-0000-0000-0000000000ff';

-- ---------------------------------------------------------------------------
-- Estructura y deny-by-default
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select count(*) from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) = 0,
  'todas las tablas de public tienen RLS habilitado');
select pg_temp.assert(
  (select count(*) from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind in ('r', 'v', 'm')
      and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'INSERT')
        or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE'))) = 0,
  'anon no tiene privilegios sobre ninguna tabla de public');
create table public.zz_tabla_futura (id int);
create function public.zz_rpc_futura() returns int language sql as 'select 1';
select pg_temp.assert(not has_table_privilege('anon', 'public.zz_tabla_futura', 'SELECT'),
  'tablas futuras nacen sin privilegios para anon');
select pg_temp.assert(not has_function_privilege('anon', 'public.zz_rpc_futura()', 'EXECUTE'),
  'RPC futuras nacen sin EXECUTE para anon/PUBLIC');
drop table public.zz_tabla_futura;
drop function public.zz_rpc_futura();

select pg_temp.assert((select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1') = 'Admin Corporativo',
  'el perfil se crea al registrar usuario');
select pg_temp.assert_fails(
  $$insert into public.detail_centers (organization_id, code, name, timezone)
    values ('0e000000-0000-0000-0000-000000000001', 'BAD-01', 'Malo', 'Mars/Olympus')$$,
  '22023', 'rechaza zona horaria inválida');
select pg_temp.assert_fails(
  $$insert into public.detail_centers (organization_id, code, name)
    values ('0e000000-0000-0000-0000-000000000001', 'CDMX-01', 'Duplicado')$$,
  '23505', 'código de centro único dentro de la organización');

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------
set local role anon;
select pg_temp.assert_fails('select 1 from public.detail_centers', '42501', 'anon no lee centros');
select pg_temp.assert_fails('select 1 from public.organizations', '42501', 'anon no lee organizaciones');
select pg_temp.assert_fails('select * from public.my_detail_centers()', '42501', 'anon no ejecuta my_detail_centers');
select pg_temp.assert_fails(
  $$select public.update_detail_center('aaaaaaaa-0000-0000-0000-000000000000', 'X', 'UTC', 'motivo')$$,
  '42501', 'anon no ejecuta RPC de escritura');
reset role;

-- ---------------------------------------------------------------------------
-- operador_recepcion de A: sólo su centro
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(pg_temp.n('select 1 from public.detail_centers') = 1, 'operador A sólo ve el centro A');
select pg_temp.assert(pg_temp.n($$select 1 from public.detail_centers where code = 'MTY-01'$$) = 0,
  'operador A no lee el centro B');
select pg_temp.assert(pg_temp.n('select 1 from public.organizations') = 1, 'operador A ve sólo su organización');
select pg_temp.assert(
  (select roles = array['operador_recepcion']::public.app_role[] and corporate_roles = '{}'
     from public.my_detail_centers()),
  'my_detail_centers devuelve A con su rol y sin roles corporativos');
select pg_temp.assert(pg_temp.n('select 1 from public.user_detail_centers') = 1, 'operador A sólo ve su membresía');
select pg_temp.assert(pg_temp.n('select 1 from public.audit_log') = 0, 'operador A no lee auditoría');
select pg_temp.assert(pg_temp.n('select 1 from public.role_assignments') = 0, 'operador A no ve roles corporativos ajenos');
select pg_temp.assert(pg_temp.n('select 1 from public.profiles') = 5,
  'operador A ve los perfiles de sus compañeros de A (incluido el suyo) y ningún otro');
select pg_temp.assert_fails(
  $$select public.update_detail_center('aaaaaaaa-0000-0000-0000-000000000000', 'Hackeado', 'UTC', 'porque sí')$$,
  '42501', 'operador A no edita su centro');
select pg_temp.assert_fails(
  $$select public.update_detail_center('bbbbbbbb-0000-0000-0000-000000000000', 'Hackeado', 'UTC', 'porque sí')$$,
  '42501', 'operador A no escribe en el centro B');
select pg_temp.assert_fails(
  $$select public.set_center_membership('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'encargado', true, 'me agrego')$$,
  '42501', 'operador A no se agrega al centro B');
select pg_temp.assert_fails(
  $$update public.profiles set active = true where id = auth.uid()$$,
  '42501', 'un usuario no puede cambiar su propio estado active');
update public.profiles set full_name = 'Operador A' where id = auth.uid();
select pg_temp.assert((select full_name from public.profiles where id = auth.uid()) = 'Operador A',
  'un usuario sí puede editar su nombre');
reset role;

-- operador en A y B: varios centros
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert(pg_temp.n('select 1 from public.detail_centers') = 2, 'usuario asignado a A y B ve ambos centros');
select pg_temp.assert(pg_temp.n('select 1 from public.my_detail_centers() where corporate_roles = $${}$$') = 2,
  'su acceso a A y B es por centro, no corporativo');
reset role;

-- usuario deshabilitado (soft-disable del perfil)
select pg_temp.login('00000000-0000-0000-0000-0000000000ff');
select pg_temp.assert(pg_temp.n('select 1 from public.detail_centers') = 0, 'usuario deshabilitado no ve centros');
reset role;

-- ---------------------------------------------------------------------------
-- encargado de A
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert(pg_temp.n('select 1 from public.user_detail_centers') = 5,
  'encargado ve las membresías de A y no las de B');
select pg_temp.assert(pg_temp.n('select 1 from public.audit_log') = 0, 'encargado no lee auditoría');
select pg_temp.assert_fails(
  $$select public.set_center_membership('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'encargado', true, 'ascenso')$$,
  '42501', 'encargado no gestiona membresías');
reset role;

-- ---------------------------------------------------------------------------
-- admin_socio de centro (sólo A)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select pg_temp.assert(pg_temp.n('select 1 from public.detail_centers') = 1, 'admin_socio de A no ve otros centros');
select from public.update_detail_center('aaaaaaaa-0000-0000-0000-000000000000', ' Centro A Polanco ', 'America/Cancun', 'Horario de verano');
select pg_temp.assert((select name from public.detail_centers where code = 'CDMX-01') = 'Centro A Polanco',
  'admin_socio de A edita su centro vía RPC');
select from public.set_center_membership('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1',
  'encargado', true, 'Ascenso a encargado');
select pg_temp.assert(
  (select role from public.user_detail_centers where user_id = '00000000-0000-0000-0000-0000000000f1') = 'encargado',
  'admin_socio de A asigna roles en A');
select pg_temp.assert_fails(
  $$select public.set_center_membership('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'admin_socio', true, 'nuevo socio')$$,
  '42501', 'admin_socio de centro no otorga admin_socio');
select pg_temp.assert_fails(
  $$select public.set_center_membership('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado', true, 'cruzar')$$,
  '42501', 'admin_socio de A no gestiona el centro B');
select pg_temp.assert_fails(
  $$select public.set_role_assignment('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'admin_socio', true, 'me promuevo')$$,
  '42501', 'admin_socio de centro no se otorga rol corporativo');
select pg_temp.assert(pg_temp.n('select 1 from public.audit_log where detail_center_id <> $$aaaaaaaa-0000-0000-0000-000000000000$$') = 0,
  'admin_socio de A sólo lee la auditoría de A');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.audit_log where action = 'UPDATE' and reason = 'Horario de verano'
    and actor_id = '00000000-0000-0000-0000-0000000000d1'
    and old_data ->> 'timezone' = 'America/Mexico_City' and new_data ->> 'timezone' = 'America/Cancun'
    and organization_id = '0e000000-0000-0000-0000-000000000001'$$) = 1,
  'auditoría registra actor, motivo, organización, valor anterior y nuevo');
-- Nueva "petición": el motivo de la RPC anterior no se arrastra.
select set_config('app.change_reason', '', true);
select pg_temp.assert_fails(
  $$update public.detail_centers set name = 'Directo' where code = 'CDMX-01'$$,
  '23514', 'escritura directa sin RPC/motivo es rechazada');
select pg_temp.assert_fails(
  $$select public.update_detail_center('aaaaaaaa-0000-0000-0000-000000000000', 'Centro A', 'UTC', 'no')$$,
  '22023', 'RPC exige motivo de 3+ caracteres');
select pg_temp.assert_fails(
  $$delete from public.user_detail_centers where user_id = '00000000-0000-0000-0000-0000000000f1'$$,
  '42501', 'las membresías no se borran, se desactivan');
reset role;

-- ---------------------------------------------------------------------------
-- contador corporativo: sólo lectura, consolidado
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(pg_temp.n('select 1 from public.detail_centers') = 2, 'contador corporativo lee los centros activos de su organización');
select pg_temp.assert(pg_temp.n('select 1 from public.detail_centers where organization_id = $$0e000000-0000-0000-0000-000000000002$$') = 0,
  'contador no lee otra organización');
select pg_temp.assert(pg_temp.n($$select 1 from public.my_detail_centers() where 'contador' = any (corporate_roles)$$) = 2,
  'contador tiene vista corporativa de A y B');
select pg_temp.assert(pg_temp.n('select 1 from public.audit_log') > 0, 'contador lee la auditoría de su organización');
select pg_temp.assert(pg_temp.n('select 1 from public.role_assignments') = 2, 'contador lee los roles corporativos de su organización');
select pg_temp.assert(pg_temp.n('select 1 from public.user_detail_centers') = 7, 'contador lee las membresías de A y B');
select pg_temp.assert_fails(
  $$select public.update_detail_center('aaaaaaaa-0000-0000-0000-000000000000', 'X', 'UTC', 'ajuste contable')$$,
  '42501', 'contador no edita centros');
select pg_temp.assert_fails(
  $$select public.set_center_membership('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'encargado', true, 'autoasignación')$$,
  '42501', 'contador no gestiona membresías');
select pg_temp.assert_fails(
  $$select public.set_role_assignment('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'admin_socio', true, 'autopromoción')$$,
  '42501', 'contador no gestiona roles corporativos');
select pg_temp.assert_fails(
  $$insert into public.organizations (slug, name) values ('otra', 'Otra')$$,
  '42501', 'contador no crea organizaciones');
reset role;

-- ---------------------------------------------------------------------------
-- admin_socio corporativo: consolida y administra su organización
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(pg_temp.n('select 1 from public.detail_centers') = 3,
  'admin corporativo ve todos los centros de su organización, incluido el deshabilitado');
select pg_temp.assert(pg_temp.n('select 1 from public.detail_centers where organization_id = $$0e000000-0000-0000-0000-000000000002$$') = 0,
  'admin corporativo no ve centros de otra organización');
select pg_temp.assert(pg_temp.n($$select 1 from public.my_detail_centers() where active and 'admin_socio' = any (roles)$$) = 2,
  'admin corporativo tiene admin_socio efectivo en A y B (consolidación)');
select from public.update_detail_center('bbbbbbbb-0000-0000-0000-000000000000', 'Centro B Norte', 'America/Monterrey', 'Cambio de nombre');
select pg_temp.assert((select name from public.detail_centers where code = 'MTY-01') = 'Centro B Norte',
  'admin corporativo edita cualquier centro de su organización');
select from public.set_center_membership('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1',
  'admin_socio', true, 'Nuevo socio de A');
select pg_temp.assert(
  (select role from public.user_detail_centers where user_id = '00000000-0000-0000-0000-0000000000e1') = 'admin_socio',
  'admin corporativo otorga admin_socio de centro');
select from public.set_role_assignment('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1',
  'contador', true, 'Contador externo');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.audit_log where table_name = 'public.role_assignments' and action = 'INSERT'
    and reason = 'Contador externo' and organization_id = '0e000000-0000-0000-0000-000000000001'$$) = 1,
  'asignar rol corporativo queda auditado con motivo');
select pg_temp.assert_fails(
  $$select public.set_center_membership('cccccccc-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1', 'admin_socio', true, 'cruzar')$$,
  '42501', 'admin corporativo no gestiona centros de otra organización');
select pg_temp.assert_fails(
  $$select public.set_role_assignment('0e000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'admin_socio', true, 'cruzar')$$,
  '42501', 'admin corporativo no se otorga roles en otra organización');
select pg_temp.assert_fails(
  $$select public.set_role_assignment('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio', false, 'me retiro')$$,
  '23514', 'la organización conserva al menos un admin_socio activo');
select from public.set_role_assignment('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1',
  'admin_socio', true, 'Segundo socio');
select from public.set_role_assignment('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1',
  'admin_socio', false, 'Relevo');
select pg_temp.assert(
  (select not active from public.role_assignments where user_id = '00000000-0000-0000-0000-0000000000a1'),
  'con otro admin_socio activo, el anterior puede retirarse');
reset role;

-- ---------------------------------------------------------------------------
-- Otra organización y organización deshabilitada
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select pg_temp.assert(pg_temp.n('select 1 from public.detail_centers') = 1, 'admin de O2 sólo ve su centro C');
select pg_temp.assert(pg_temp.n('select 1 from public.profiles') = 1, 'admin de O2 no ve perfiles de O1');
select pg_temp.assert(pg_temp.n('select 1 from public.audit_log where organization_id = $$0e000000-0000-0000-0000-000000000001$$') = 0,
  'admin de O2 no lee auditoría de O1');
reset role;
update public.organizations set active = false where slug = 'org-dos';
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select pg_temp.assert(pg_temp.n('select 1 from public.detail_centers') = 0, 'organización deshabilitada: sin acceso');
reset role;

-- ---------------------------------------------------------------------------
-- Eventos de auditoría genéricos
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select from set_config('app.change_reason', 'Cierre de caja', true);
select private.log_event('0e000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000',
  'cash.close_approved', 'public.cash_sessions', '42', '{"amount": 100}'::jsonb) is not null as logged;
select pg_temp.assert(
  pg_temp.n($$select 1 from public.audit_log where action = 'EVENT' and event = 'cash.close_approved'
    and actor_id = '00000000-0000-0000-0000-0000000000d1' and reason = 'Cierre de caja'$$) = 1,
  'log_event registra evento con actor y motivo');
select pg_temp.assert_fails(
  $$select private.log_event(null, null, 'Evento Malo')$$, '22023', 'log_event rechaza nombres de evento inválidos');
reset role;

rollback;
