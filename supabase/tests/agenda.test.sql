-- Pruebas de O3: agenda, bahías, técnicos, conflictos, estatus, zona horaria
-- y borrador de OS.
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

create function pg_temp.n(sql text) returns bigint language plpgsql as $$
declare c bigint;
begin
  execute 'select count(*) from (' || sql || ') s' into c;
  return c;
end $$;

grant execute on all functions in schema pg_temp to authenticated, anon;

-- Org O1: centro A (Ciudad de México) y B (Monterrey).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@o1'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000f2', 'operador@b');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Monterrey');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio'),
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'contador');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion');

-- Catálogo (admin corporativo) y recursos del centro A (encargado).
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'LAV', 'Lavado', null, 'recurrente', 40, 250, 80)).id as lavado \gset
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'POL', 'Pulido', null, 'valor_medio', 120, 2800, 900)).id as pulido \gset
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails($$select public.upsert_bay('aaaaaaaa-0000-0000-0000-000000000000', null, 'Bahía 1', true, 'Alta')$$,
  '42501', 'operador no administra bahías');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select (public.upsert_bay('aaaaaaaa-0000-0000-0000-000000000000', null, 'Bahía 1', true, 'Alta de bahía')).id as bay1 \gset
select (public.upsert_bay('aaaaaaaa-0000-0000-0000-000000000000', null, 'Bahía 2', true, 'Alta de bahía')).id as bay2 \gset
select (public.upsert_technician('aaaaaaaa-0000-0000-0000-000000000000', null, 'Toño  Ruiz', true, 'Alta de técnico')).id as tech1 \gset
select pg_temp.assert_fails($$select public.upsert_bay('aaaaaaaa-0000-0000-0000-000000000000', null, 'Bahía 1', true, 'Repetida')$$,
  '23505', 'el nombre de la bahía es único en el centro');
select pg_temp.assert(pg_temp.n($$select 1 from public.technicians where full_name = 'Toño Ruiz'$$) = 1,
  'encargado da de alta técnicos (nombre normalizado)');
reset role;

-- Cliente y vehículo (O1) registrados por el operador de A.
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client('aaaaaaaa-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001',
  'José Pérez', '5512345678', null, 'person', null, '{}', 'web',
  '[{"make":"Mazda","model":"3","year":2021,"plate":"ABC1234"}]'::jsonb)).id as client \gset
select id as vehicle from public.vehicles where plate = 'ABC1234' \gset
select (public.create_client('aaaaaaaa-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000002',
  'Ana Ruiz', '5598765432', null, 'person', null, '{}', 'web',
  '[{"make":"VW","model":"Jetta","year":2019,"plate":"XYZ999"}]'::jsonb)).id as client2 \gset
select id as vehicle2 from public.vehicles where plate = 'XYZ999' \gset

-- ---------------------------------------------------------------------------
-- Alta de cita, zona horaria y duración por catálogo
-- ---------------------------------------------------------------------------
-- 10:00 hora de Ciudad de México = 16:00 UTC.
select (public.create_appointment('aaaaaaaa-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000001',
  :'client', :'vehicle', array[:'lavado', :'pulido']::uuid[], '2026-10-01 16:00:00+00', null, :'bay1', :'tech1',
  'Cliente pide revisar rayón')).id as appt1 \gset
select pg_temp.assert(
  (select duration_minutes = 160 and ends_at = '2026-10-01 18:40:00+00' and status = 'programada'
     from public.appointments where id = :'appt1'),
  'sin duración explícita se usa la suma del catálogo (40 + 120 min)');
select pg_temp.assert(
  (public.create_appointment('aaaaaaaa-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000001',
    :'client', :'vehicle', array[:'lavado']::uuid[], '2026-10-01 16:00:00+00')).id = :'appt1',
  'crear cita es idempotente por request_id (web y móvil)');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.list_appointments('aaaaaaaa-0000-0000-0000-000000000000', '2026-10-01')$$) = 1,
  'la cita aparece el 1 de octubre en la agenda del centro');
select pg_temp.assert(
  (select services = '{Lavado,Pulido}' and bay_name = 'Bahía 1' and technician_name = 'Toño Ruiz'
       and vehicle_label = 'Mazda 3 2021 · ABC1234'
     from public.list_appointments('aaaaaaaa-0000-0000-0000-000000000000', '2026-10-01')),
  'la agenda trae servicios, bahía, técnico y vehículo');

-- 23:30 del 1 de octubre en CDMX = 05:30 UTC del 2 de octubre: pertenece al día 1 del centro.
select (public.create_appointment('aaaaaaaa-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000002',
  :'client2', :'vehicle2', array[:'lavado']::uuid[], '2026-10-02 05:30:00+00', 30)).id as late \gset
select pg_temp.assert(
  pg_temp.n($$select 1 from public.list_appointments('aaaaaaaa-0000-0000-0000-000000000000', '2026-10-01')$$) = 2
  and pg_temp.n($$select 1 from public.list_appointments('aaaaaaaa-0000-0000-0000-000000000000', '2026-10-02')$$) = 0,
  'zona horaria: el día de la agenda es el del centro, no el UTC');

select pg_temp.assert_fails($$select public.create_appointment('aaaaaaaa-0000-0000-0000-000000000000',
    '20000000-0000-4000-8000-000000000003', '$$ || :'client' || $$', '$$ || :'vehicle2' || $$',
    array['$$ || :'lavado' || $$']::uuid[], '2026-10-01 20:00:00+00')$$,
  '22023', 'el vehículo debe pertenecer al cliente');
select pg_temp.assert_fails($$select public.create_appointment('aaaaaaaa-0000-0000-0000-000000000000',
    '20000000-0000-4000-8000-000000000003', '$$ || :'client' || $$', '$$ || :'vehicle' || $$',
    '{}'::uuid[], '2026-10-01 20:00:00+00')$$,
  '22023', 'la cita requiere al menos un servicio');

-- ---------------------------------------------------------------------------
-- Conflictos de bahía y técnico
-- ---------------------------------------------------------------------------
select pg_temp.assert_fails($$select public.create_appointment('aaaaaaaa-0000-0000-0000-000000000000',
    '20000000-0000-4000-8000-000000000004', '$$ || :'client2' || $$', '$$ || :'vehicle2' || $$',
    array['$$ || :'lavado' || $$']::uuid[], '2026-10-01 17:00:00+00', 30, '$$ || :'bay1' || $$')$$,
  '23P01', 'no se enciman dos citas en la misma bahía');
select pg_temp.assert_fails($$select public.create_appointment('aaaaaaaa-0000-0000-0000-000000000000',
    '20000000-0000-4000-8000-000000000004', '$$ || :'client2' || $$', '$$ || :'vehicle2' || $$',
    array['$$ || :'lavado' || $$']::uuid[], '2026-10-01 17:00:00+00', 30, '$$ || :'bay2' || $$', '$$ || :'tech1' || $$')$$,
  '23P01', 'ni con el mismo técnico');
select pg_temp.assert(
  (public.create_appointment('aaaaaaaa-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000005',
    :'client2', :'vehicle2', array[:'lavado']::uuid[], '2026-10-01 18:40:00+00', 30, :'bay1')).bay_id = :'bay1',
  'una cita que empieza justo cuando termina otra no es conflicto');
select pg_temp.assert(
  (public.create_appointment('aaaaaaaa-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000006',
    :'client2', :'vehicle2', array[:'lavado']::uuid[], '2026-10-01 17:00:00+00', 30, :'bay2')).bay_id = :'bay2',
  'otra bahía en el mismo horario sí se puede');
select pg_temp.assert_fails($$select public.create_appointment('aaaaaaaa-0000-0000-0000-000000000000',
    '20000000-0000-4000-8000-000000000007', '$$ || :'client2' || $$', '$$ || :'vehicle2' || $$',
    array['$$ || :'lavado' || $$']::uuid[], '2026-10-01 17:00:00+00', 30, '$$ || :'bay1' || $$', null, null, false,
    'Cliente VIP')$$,
  '42501', 'el operador no puede autorizar un override');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert(
  (public.create_appointment('aaaaaaaa-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000007',
    :'client2', :'vehicle2', array[:'lavado']::uuid[], '2026-10-01 17:00:00+00', 30, :'bay1', null, null, false,
    'Cliente VIP: se atiende en paralelo')).conflict_override,
  'el encargado autoriza encimar la bahía con motivo');
select pg_temp.assert(
  (public.create_appointment('aaaaaaaa-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000008',
    :'client2', :'vehicle2', array[:'lavado']::uuid[], '2026-10-01 22:00:00+00', 30, :'bay1', null, null, false,
    'Override sin conflicto')).conflict_override = false,
  'un override sin conflicto real no marca la cita (sigue protegida)');
reset role;
select pg_temp.assert(
  pg_temp.n($$select 1 from public.audit_log where event = 'appointment.conflict_override'
      and reason = 'Cliente VIP: se atiende en paralelo' and actor_id = '00000000-0000-0000-0000-0000000000e1'$$) = 1,
  'el override queda auditado con actor y motivo');

-- ---------------------------------------------------------------------------
-- Estatus y recepción
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails($$select public.set_appointment_status('$$ || :'appt1' || $$', 'terminada')$$,
  '22023', 'no se salta de programada a terminada');
select pg_temp.assert_fails($$select public.set_appointment_status('$$ || :'late' || $$', 'cancelada')$$,
  '22023', 'cancelar exige motivo');
select pg_temp.assert((public.set_appointment_status(:'late', 'cancelada', 'El cliente reagendó')).cancelled_at is not null,
  'cancelar con motivo');
select pg_temp.assert_fails($$select public.set_appointment_status('$$ || :'late' || $$', 'recibida')$$,
  '22023', 'una cita cancelada no se reabre');
select pg_temp.assert((public.set_appointment_status(:'appt1', 'recibida')).received_at is not null,
  'recibir la cita registra la hora');
select pg_temp.assert(
  (select last_visit_at is not null from public.clients where id = :'client'),
  'recibir la cita registra la visita del cliente (O1)');
select pg_temp.assert(
  (select count(*) = 2 and bool_and(client_id = :'client' and vehicle_id = :'vehicle')
       and array_agg(service_code order by service_code) = '{LAV,POL}' and sum(unit_price) = 3050
     from public.appointment_order_draft(:'appt1')),
  'el borrador de OS trae cliente, vehículo y servicios con precio del centro, sin recapturar');
select (public.set_appointment_status(:'appt1', 'en_servicio')).started_at is not null as started;
select (public.set_appointment_status(:'appt1', 'terminada')).finished_at is not null as finished;
select pg_temp.assert((public.set_appointment_status(:'appt1', 'entregada')).status = 'entregada',
  'flujo completo programada → recibida → en_servicio → terminada → entregada');
select pg_temp.assert_fails($$select public.update_appointment('$$ || :'appt1' || $$',
    array['$$ || :'lavado' || $$']::uuid[], '2026-10-01 16:00:00+00', 30, null, null, null, 'Cambio')$$,
  '22023', 'una cita entregada no se reprograma');

-- Walk-in: entra recibida, sin cita previa.
select pg_temp.assert(
  (select status = 'recibida' and is_walk_in and received_at is not null
     from public.create_appointment('aaaaaaaa-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000009',
       :'client', :'vehicle', array[:'lavado']::uuid[], null, null, :'bay2', null, null, true)),
  'walk-in: entra como recibida, sin cita previa');

-- Reprogramar: respeta conflictos y exige motivo.
select pg_temp.assert_fails($$select public.update_appointment('$$ || :'late' || $$',
    array['$$ || :'lavado' || $$']::uuid[], '2026-10-01 16:00:00+00', 30, null, null, null, 'Cambio')$$,
  '22023', 'una cita cancelada no se reprograma');
select (public.create_appointment('aaaaaaaa-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000011',
  :'client2', :'vehicle2', array[:'lavado']::uuid[], '2026-10-05 16:00:00+00', 30)).id as appt5 \gset
select pg_temp.assert_fails($$select public.update_appointment('$$ || :'appt5' || $$',
    array['$$ || :'lavado' || $$']::uuid[], '2026-10-01 18:40:00+00', 30, '$$ || :'bay1' || $$', null, null, null)$$,
  '22023', 'reprogramar exige motivo');
select pg_temp.assert_fails($$select public.update_appointment('$$ || :'appt5' || $$',
    array['$$ || :'lavado' || $$']::uuid[], '2026-10-01 18:50:00+00', 30, '$$ || :'bay1' || $$', null, null, 'Cambio de horario')$$,
  '23P01', 'reprogramar a una bahía ocupada se rechaza');
select pg_temp.assert(
  (select starts_at = '2026-10-05 17:00:00+00' and ends_at = '2026-10-05 18:00:00+00' and bay_id = :'bay1'
     from public.update_appointment(:'appt5', array[:'lavado', :'pulido']::uuid[], '2026-10-05 17:00:00+00', 60,
       :'bay1', null, 'Llega más tarde', 'El cliente pidió otra hora')),
  'reprogramar con motivo recalcula el fin y cambia servicios');
select pg_temp.assert(
  (select services = '{Lavado,Pulido}' from public.list_appointments('aaaaaaaa-0000-0000-0000-000000000000', '2026-10-05')),
  'los servicios de la cita se actualizan');
reset role;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert(pg_temp.n($$select 1 from public.appointments$$) = 0, 'operador de B no ve la agenda de A');
select pg_temp.assert_fails($$select public.create_appointment('aaaaaaaa-0000-0000-0000-000000000000',
    '20000000-0000-4000-8000-000000000010', '$$ || :'client' || $$', '$$ || :'vehicle' || $$',
    array['$$ || :'lavado' || $$']::uuid[], '2026-10-03 16:00:00+00')$$,
  '42501', 'operador de B no agenda en A');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(pg_temp.n($$select 1 from public.appointments$$) = 0, 'contador no ve la agenda (datos operativos)');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails($$update public.appointments set notes = 'x'$$, '23514', 'escritura directa sin motivo se bloquea');
select pg_temp.assert_fails($$delete from public.appointments$$, '42501', 'no hay borrado físico de citas');
reset role;

select pg_temp.assert(
  (select count(*) = 2 from pg_constraint where conname in ('appointments_bay_no_overlap', 'appointments_technician_no_overlap')),
  'reglas de conflicto en la base (exclusion constraints)');

rollback;
