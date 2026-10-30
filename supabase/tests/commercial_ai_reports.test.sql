-- Reportes comerciales por IA (20261113000000_commercial_ai_reports).
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
  execute 'set local role authenticated';
end $$;

create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
end $$;

grant execute on all functions in schema pg_temp to authenticated, anon, service_role;

\set O1 '0e000000-0000-0000-0000-000000000001'
\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set B 'bbbbbbbb-0000-0000-0000-000000000000'
\set ENC '00000000-0000-0000-0000-0000000000e1'
\set REC '00000000-0000-0000-0000-0000000000f1'
\set CORP '00000000-0000-0000-0000-0000000000a1'

insert into auth.users (id, email) values (:'CORP', 'corp@o1'), (:'ENC', 'encargado@a'), (:'REC', 'recepcion@a');
insert into public.organizations (id, slug, name) values (:'O1', 'org-uno', 'Org uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  (:'A', :'O1', 'A-01', 'Centro Polanco', 'America/Mexico_City'),
  (:'B', :'O1', 'B-01', 'Centro Monterrey', 'America/Monterrey');
insert into public.role_assignments (organization_id, user_id, role) values (:'O1', :'CORP', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  (:'A', :'ENC', 'encargado'), (:'A', :'REC', 'operador_recepcion');

-- Recepción no ve métricas comerciales: no puede pedir el reporte.
select pg_temp.login(:'REC');
select pg_temp.assert_fails(format(
  $$select public.start_commercial_ai_report(%L, array[%L]::uuid[], '2026-10-01', '2026-10-30', 'Últimos 30 días', 'Centro Polanco', gen_random_uuid())$$,
  :'A', :'A'), '42501', 'recepción no pide reportes comerciales');
reset role;

-- El encargado de A no puede incluir B en el alcance.
select pg_temp.login(:'ENC');
select pg_temp.assert_fails(format(
  $$select public.start_commercial_ai_report(%L, array[%L, %L]::uuid[], '2026-10-01', '2026-10-30', 'Últimos 30 días', 'Todos', gen_random_uuid())$$,
  :'A', :'A', :'B'), '42501', 'el alcance sólo incluye centros con métricas visibles');
select pg_temp.assert_fails(format(
  $$select public.start_commercial_ai_report(%L, array[%L]::uuid[], '2026-10-01', '2026-10-30', 'Últimos 30 días', 'B', gen_random_uuid())$$,
  :'A', :'B'), '22023', 'el alcance incluye el centro activo');
select public.start_commercial_ai_report(:'A', array[:'A']::uuid[], '2026-10-01', '2026-10-30',
  'Últimos 30 días', 'Centro Polanco', 'cccccccc-0000-0000-0000-000000000001') as r1 \gset
select pg_temp.assert(
  public.start_commercial_ai_report(:'A', array[:'A']::uuid[], '2026-10-01', '2026-10-30',
    'Últimos 30 días', 'Centro Polanco', 'cccccccc-0000-0000-0000-000000000001') = :'r1'::uuid,
  'mismo request_id, mismo reporte');
select pg_temp.assert(
  (select status = 'pendiente' and created_by = :'ENC'::uuid from public.commercial_ai_reports where id = :'r1'),
  'queda pendiente a nombre de quien lo pidió');
-- El usuario no escribe el texto: sólo el servidor.
select pg_temp.assert_fails(format(
  $$select public.complete_commercial_ai_report(%L, 'Texto inventado', '{}', '{}', '{}', 'x')$$, :'r1'),
  '42501', 'una sesión de usuario no escribe el texto de la IA');
select pg_temp.assert_fails(format($$update public.commercial_ai_reports set summary = 'x' where id = %L$$, :'r1'),
  '42501', 'sin UPDATE directo');
reset role;

select pg_temp.as_service();
select public.complete_commercial_ai_report(:'r1', 'Las ventas crecieron.', array['WhatsApp trae 60 %'],
  array['Respuesta lenta'], array['Contestar en 15 min'], 'claude-opus-5-5');
select pg_temp.assert_fails(format(
  $$select public.complete_commercial_ai_report(%L, 'otra', '{}', '{}', '{}', 'x')$$, :'r1'),
  'P0002', 'un reporte terminado no se reescribe');
reset role;

select pg_temp.login(:'ENC');
select pg_temp.assert(
  (select status = 'listo' and summary = 'Las ventas crecieron.' and actions = array['Contestar en 15 min']
     from public.commercial_ai_reports where id = :'r1'),
  'el encargado ve el reporte terminado');
reset role;
select pg_temp.login(:'REC');
select pg_temp.assert(not exists (select 1 from public.commercial_ai_reports), 'recepción no ve los reportes');
reset role;

-- El corporativo pide uno de ambos centros; el encargado de A no lo ve.
select pg_temp.login(:'CORP');
select public.start_commercial_ai_report(:'A', array[:'A', :'B']::uuid[], '2026-10-01', '2026-10-30',
  'Últimos 30 días', 'Todos los centros', gen_random_uuid()) as r2 \gset
reset role;
select pg_temp.as_service();
select public.fail_commercial_ai_report(:'r2', 'IA no disponible');
reset role;
select pg_temp.login(:'ENC');
select pg_temp.assert(not exists (select 1 from public.commercial_ai_reports where id = :'r2'),
  'un reporte con un centro ajeno no se ve');
reset role;
select pg_temp.login(:'CORP');
select pg_temp.assert((select status = 'fallido' and error = 'IA no disponible' from public.commercial_ai_reports where id = :'r2'),
  'el error queda registrado');
reset role;

rollback;
