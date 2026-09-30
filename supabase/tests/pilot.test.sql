-- Pruebas de F5.2: alta de centro por datos, checklist de datos maestros,
-- línea base, errores de la app y métricas de adopción. Un centro nuevo entra
-- solo al P&L y a las métricas (N centros sin cambiar código).
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

grant execute on all functions in schema pg_temp to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'corp@o1'),
  ('00000000-0000-0000-0000-0000000000d1', 'socio@a'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@o1'),
  ('00000000-0000-0000-0000-0000000000e2', 'encargado@nuevo'),
  ('00000000-0000-0000-0000-0000000000f2', 'operador@nuevo');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Org uno'),
  ('0e000000-0000-0000-0000-000000000002', 'org-dos', 'Org dos');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio'),
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'contador');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000d1', 'admin_socio'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion');

-- ---------------------------------------------------------------------------
-- Alta de centro: sólo el admin corporativo; código validado y único.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select pg_temp.assert_fails($$select public.create_detail_center('0e000000-0000-0000-0000-000000000001', 'N-01', 'Centro nuevo', 'America/Monterrey', 'Rollout')$$,
  '42501', 'el admin de un centro no da de alta centros');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert_fails($$select public.create_detail_center('0e000000-0000-0000-0000-000000000001', 'n 01', 'Centro nuevo', 'America/Monterrey', 'Rollout')$$,
  '22023', 'código inválido');
select pg_temp.assert_fails($$select public.create_detail_center('0e000000-0000-0000-0000-000000000001', 'a-01', 'Otro', 'America/Monterrey', 'Rollout')$$,
  '23505', 'código repetido en la organización (sin importar mayúsculas)');
select pg_temp.assert_fails($$select public.create_detail_center('0e000000-0000-0000-0000-000000000002', 'N-01', 'Ajeno', 'America/Monterrey', 'Rollout')$$,
  '42501', 'no da de alta centros en otra organización');
select pg_temp.assert_fails($$select public.create_detail_center('0e000000-0000-0000-0000-000000000001', 'N-01', 'Centro nuevo', 'America/Monterrey', '')$$,
  '22023', 'exige motivo');
select (public.create_detail_center('0e000000-0000-0000-0000-000000000001', 'n-01', ' Centro nuevo ', 'America/Monterrey', 'Rollout Centro 2')).id as n \gset
select pg_temp.assert((select code = 'N-01' and name = 'Centro nuevo' and timezone = 'America/Monterrey' and active
                         from public.detail_centers where id = :'n'),
  'alta de centro por datos: código en mayúsculas, nombre y zona horaria');
select pg_temp.assert(exists (select 1 from public.my_detail_centers() where id = :'n'),
  'el centro nuevo aparece de inmediato para el corporativo');
reset role;
select pg_temp.assert(exists (select 1 from public.audit_log where table_name = 'public.detail_centers' and record_id = :'n'::text
                                 and reason = 'Rollout Centro 2'), 'el alta queda auditada con su motivo');

-- ---------------------------------------------------------------------------
-- Checklist: el centro nuevo no está listo hasta tener equipo, bahía y técnico.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
create temp table r0 on commit drop as select public.center_readiness(:'n') as j;
select pg_temp.assert((select not (j ->> 'ready')::boolean
                          and (select string_agg(i ->> 'key', ',' order by i ->> 'key') from jsonb_array_elements(j -> 'items') i
                                where i ->> 'status' = 'missing') = 'bahias,catalogo,equipo,tecnicos'
                         from r0), 'centro nuevo: faltan equipo, catálogo, bahías y técnicos (las categorías de egreso vienen con la organización)');
reset role;

insert into public.user_detail_centers (detail_center_id, user_id, role) values
  (:'n', '00000000-0000-0000-0000-0000000000e2', 'encargado'),
  (:'n', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion');
insert into public.services (id, organization_id, code, name, revenue_engine, standard_duration_minutes, base_price, standard_direct_cost)
values ('5e000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000001', 'LAV', 'Lavado', 'recurrente', 30, 250, 60),
       ('5e000000-0000-0000-0000-000000000002', '0e000000-0000-0000-0000-000000000001', 'ENC', 'Encerado', 'valor_medio', 60, 800, 0);
insert into public.bays (organization_id, detail_center_id, name) values ('0e000000-0000-0000-0000-000000000001', :'n', 'Bahía 1');
insert into public.technicians (organization_id, detail_center_id, full_name) values ('0e000000-0000-0000-0000-000000000001', :'n', 'Téc. Uno');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
create temp table r1 on commit drop as select public.center_readiness(:'n') as j;
select pg_temp.assert((select (j ->> 'ready')::boolean
                          and (select i ->> 'status' from jsonb_array_elements(j -> 'items') i where i ->> 'key' = 'catalogo') = 'warning'
                          and (select i ->> 'detail' from jsonb_array_elements(j -> 'items') i where i ->> 'key' = 'catalogo') like '%1 sin precio o sin costo%'
                         from r1), 'con equipo, catálogo, bahía y técnico: listo; avisa del servicio sin costo directo');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select pg_temp.assert_fails(format('select public.center_readiness(%L)', :'n'), '42501', 'el encargado no ve el checklist (lo configura el admin)');
reset role;

-- ---------------------------------------------------------------------------
-- Línea base: la fija el admin (centro o corporativo), la lee quien lee el P&L.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.set_center_baseline('aaaaaaaa-0000-0000-0000-000000000000', 'ticket_promedio', 450, null, null, 'Ventas 2025', 'Línea base')$$,
  '42501', 'el encargado no fija la línea base');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select pg_temp.assert_fails($$select public.set_center_baseline('aaaaaaaa-0000-0000-0000-000000000000', 'inventado', 1, null, null, 'Ventas 2025', 'Línea base')$$,
  '22023', 'indicador desconocido');
select pg_temp.assert_fails($$select public.set_center_baseline('aaaaaaaa-0000-0000-0000-000000000000', 'ticket_promedio', 450, '2025-12-31', '2025-01-01', 'Ventas 2025', 'Línea base')$$,
  '22023', 'periodo al revés');
select from public.set_center_baseline('aaaaaaaa-0000-0000-0000-000000000000', 'ticket_promedio', 450, '2025-01-01', '2025-12-31', 'Ventas 2025 (Excel)', 'Línea base');
select from public.set_center_baseline('aaaaaaaa-0000-0000-0000-000000000000', 'ticket_promedio', 470, '2025-01-01', '2025-12-31', 'Ventas 2025 (Excel)', 'Corrección');
select from public.set_center_baseline('aaaaaaaa-0000-0000-0000-000000000000', 'ordenes_dia', 12, null, null, 'Bitácora', 'Línea base');
select from public.set_center_baseline('aaaaaaaa-0000-0000-0000-000000000000', 'ordenes_dia', null, null, null, null, 'Ya no aplica');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert((select count(*) = 1 and min(value) = 470 and min(version) = 2 from public.center_baselines),
  'upsert con versión y borrado con valor vacío; el contador la lee');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert((select count(*) = 0 from public.center_baselines), 'el operador no ve la línea base');
reset role;

-- ---------------------------------------------------------------------------
-- Errores de la app: recortados, centro sólo si el usuario pertenece, límite por hora.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select public.report_client_error('web', 'TypeError', repeat('x', 900), 'digest-1', '/ordenes/1?q=Juan', 'aaaaaaaa-0000-0000-0000-000000000000');
select public.report_client_error('mobile', '', 'fallo', null, null, :'n');
reset role;
select pg_temp.assert((select count(*) = 2
                          and count(*) filter (where detail_center_id = 'aaaaaaaa-0000-0000-0000-000000000000' and length(message) = 400
                                                 and route = '/ordenes/1' and source = 'web') = 1
                          and count(*) filter (where detail_center_id is null and name = 'Error' and source = 'mobile') = 1
                         from public.client_error_reports),
  'reporte recortado, sin query; un centro ajeno se descarta');
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select public.report_client_error('web', 'E', 'm', null, null, null) from generate_series(1, 40);
select pg_temp.assert((select count(*) = 0 from public.client_error_reports), 'el operador no lee los errores');
reset role;
select pg_temp.assert((select count(*) = 30 from public.client_error_reports where user_id = '00000000-0000-0000-0000-0000000000f1'),
  'máximo 30 reportes por usuario por hora');
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select pg_temp.assert((select count(*) = 1 from public.client_error_reports), 'el admin del centro ve los errores de su centro');
reset role;
set local role anon;
select pg_temp.assert_fails($$select public.report_client_error('web', 'E', 'm', null, null, null)$$, '42501', 'sin sesión no se reporta');
reset role;

-- ---------------------------------------------------------------------------
-- Métricas de adopción y N centros: el centro nuevo entra solo al P&L y a las métricas.
-- ---------------------------------------------------------------------------
insert into public.clients (id, organization_id, home_detail_center_id, kind, full_name, phone, request_id, created_in_detail_center_id)
values ('c1000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000001', :'n',
        'person', 'Cliente Uno', '+525500000001', 'c1000000-0000-0000-0000-0000000000a1', :'n');
insert into public.vehicles (id, organization_id, client_id, make, model, year, plate, created_in_detail_center_id)
values ('c2000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
        'Mazda', '3', 2021, 'ABC1234', :'n');
insert into public.service_orders (organization_id, detail_center_id, folio, folio_number, client_id, vehicle_id, channel, status,
  client_name, vehicle_make, vehicle_model, vehicle_year, vehicle_plate, subtotal, total, created_at, promised_at, delivered_at, cancelled_at, request_id)
select '0e000000-0000-0000-0000-000000000001', :'n', 'N-01-00000' || x.n, x.n, 'c1000000-0000-0000-0000-000000000001',
       'c2000000-0000-0000-0000-000000000001', 'b2c', x.status::public.service_order_status, 'Cliente Uno', 'Mazda', '3', 2021, 'ABC1234',
       x.total, x.total, x.created, x.promised, x.delivered, x.cancelled, gen_random_uuid()
  from (values
    (1, 'entregada', 600, now() - interval '3 hours', now() - interval '30 minutes', now() - interval '1 hour', null::timestamptz),
    (2, 'entregada', 400, now() - interval '2 hours', now() - interval '90 minutes', now() - interval '1 hour', null),
    (3, 'cancelada', 0, now() - interval '1 hour', null, null, now()),
    (4, 'abierta', 0, now(), null, null, null)
  ) as x(n, status, total, created, promised, delivered, cancelled);

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
create temp table pm on commit drop as
select * from public.pilot_metrics(array['aaaaaaaa-0000-0000-0000-000000000000', :'n']::uuid[],
                                   private.center_today(:'n') - 1, private.center_today(:'n'));
select pg_temp.assert((select count(*) = 4 and count(distinct detail_center_id) = 2 from pm),
  'una fila por centro y día, incluido el centro nuevo');
select pg_temp.assert((select orders_created = 4 and orders_delivered = 2 and orders_cancelled = 1 and revenue = 1000
                          and cycle_minutes_avg = 90 and promised_delivered = 2 and on_time_delivered = 1 and errors = 0
                         from pm where detail_center_id = :'n' and day = private.center_today(:'n')),
  'métricas del día: OS creadas, entregadas, canceladas, ingreso, ciclo y puntualidad');
select pg_temp.assert((select errors = 1 and active_users >= 0 from pm
                        where detail_center_id = 'aaaaaaaa-0000-0000-0000-000000000000' and day = private.center_today(:'n')),
  'errores de la app por centro y día');
select pg_temp.assert((select coalesce(sum(amount), 0) = 1000 from public.pnl_facts(array[:'n']::uuid[], private.center_today(:'n') - 1, private.center_today(:'n'))
                        where section = 'ingreso'),
  'el P&L incluye al centro nuevo sin configuración adicional');
select pg_temp.assert_fails($$select public.pilot_metrics(array['aaaaaaaa-0000-0000-0000-000000000000']::uuid[], '2026-01-01', '2025-01-01')$$,
  '22023', 'periodo inválido');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert((select count(*) = 0 from public.pilot_metrics(array['aaaaaaaa-0000-0000-0000-000000000000']::uuid[], current_date - 1, current_date)),
  'el operador no ve las métricas de adopción');
reset role;

rollback;
