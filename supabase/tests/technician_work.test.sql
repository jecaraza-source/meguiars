-- Pruebas de «Mi día» del técnico / lavador: rol sin acceso genérico, vínculo
-- técnico-usuario, asignaciones del día, empezar, trabajo realizado (cierra la
-- OS), comentarios, fotos en Storage, problemas y aislamiento.
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

create function pg_temp.v(p_id uuid) returns integer language sql as $$
  select version from public.service_orders where id = p_id
$$;

grant execute on all functions in schema pg_temp to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000d1', 'lavador1@a'),
  ('00000000-0000-0000-0000-0000000000d2', 'lavador2@a'),
  ('00000000-0000-0000-0000-0000000000d3', 'lavador@b');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Monterrey');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000d1', 'tecnico'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000d2', 'tecnico'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000d3', 'tecnico');

select pg_temp.assert_fails($$insert into public.role_assignments (organization_id, user_id, role)
  values ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'tecnico')$$,
  '23514', 'el técnico no puede ser rol corporativo');

-- Catálogo, técnicos, cliente y OS.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'LAV', 'Lavado', null, 'recurrente', 40, 250, 80)).id as lavado \gset
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'ASP', 'Aspirado', null, 'recurrente', 20, 120, 30)).id as aspirado \gset
select (public.upsert_technician('bbbbbbbb-0000-0000-0000-000000000000', null, 'Beto Garza', true, 'Alta de técnico')).id as techb \gset
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select (public.upsert_technician('aaaaaaaa-0000-0000-0000-000000000000', null, 'Toño Ruiz', true, 'Alta de técnico')).id as tech1 \gset
select (public.upsert_technician('aaaaaaaa-0000-0000-0000-000000000000', null, 'Luis Gómez', true, 'Alta de técnico')).id as tech2 \gset
select (public.upsert_bay('aaaaaaaa-0000-0000-0000-000000000000', null, 'Bahía 1', true, 'Alta de bahía')).id as bay1 \gset
reset role;

-- ---------------------------------------------------------------------------
-- El rol técnico no tiene acceso genérico
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.my_detail_centers() where 'tecnico' = any (roles)$$) = 1
  and pg_temp.n($$select 1 from public.organizations$$) = 1,
  'el técnico ve su centro (con rol tecnico) y su organización');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.services$$) = 0
  and pg_temp.n($$select 1 from public.clients$$) = 0
  and pg_temp.n($$select 1 from public.service_orders$$) = 0
  and pg_temp.n($$select 1 from public.technicians$$) = 0,
  'el técnico no lee catálogo (costos), clientes, OS ni técnicos directamente');
select pg_temp.assert(public.set_active_center('aaaaaaaa-0000-0000-0000-000000000000') is not null,
  'el técnico puede elegir su centro activo');
select pg_temp.assert_fails($$select public.set_active_center('bbbbbbbb-0000-0000-0000-000000000000')$$,
  '42501', 'pero no otro centro');
select pg_temp.assert_fails($$select public.my_work('aaaaaaaa-0000-0000-0000-000000000000')$$,
  '42501', 'sin vínculo con un técnico no hay «Mi día»');
reset role;

-- ---------------------------------------------------------------------------
-- Vínculo técnico ↔ usuario
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails($$select public.link_technician_user('$$ || :'tech1' || $$', 'Ligar', '00000000-0000-0000-0000-0000000000d1')$$,
  '42501', 'la recepción no liga técnicos');
select pg_temp.assert_fails($$select * from public.center_technician_users('aaaaaaaa-0000-0000-0000-000000000000')$$,
  '42501', 'ni lista usuarios para ligar');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert(
  (select role = 'tecnico' from public.center_technician_users('aaaaaaaa-0000-0000-0000-000000000000') limit 1)
  and pg_temp.n($$select 1 from public.center_technician_users('aaaaaaaa-0000-0000-0000-000000000000')$$) = 4,
  'el encargado lista los usuarios del centro (técnicos primero)');
select pg_temp.assert_fails($$select public.link_technician_user('$$ || :'tech1' || $$', 'Ligar', '00000000-0000-0000-0000-0000000000d3')$$,
  '22023', 'no se liga un usuario de otro centro');
select pg_temp.assert(
  (select profile_id = '00000000-0000-0000-0000-0000000000d1'
     from public.link_technician_user(:'tech1', 'Ligar a su usuario', '00000000-0000-0000-0000-0000000000d1')),
  'el encargado liga al técnico con su usuario');
select pg_temp.assert_fails($$select public.link_technician_user('$$ || :'tech2' || $$', 'Ligar', '00000000-0000-0000-0000-0000000000d1')$$,
  '23505', 'un usuario sólo se liga a un técnico por centro');
select from public.link_technician_user(:'tech2', 'Ligar a su usuario', '00000000-0000-0000-0000-0000000000d2');
select pg_temp.assert_fails($$select public.link_technician_user('$$ || :'techb' || $$', 'Ligar', '00000000-0000-0000-0000-0000000000d3')$$,
  '42501', 'el encargado no liga técnicos de otro centro');
reset role;
select pg_temp.assert(
  pg_temp.n($$select 1 from public.audit_log where table_name = 'public.technicians' and reason = 'Ligar a su usuario'$$) = 2,
  'el vínculo queda en auditoría con motivo');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select from public.link_technician_user(:'techb', 'Ligar a su usuario', '00000000-0000-0000-0000-0000000000d3');
reset role;

-- OS de hoy para tech1 (lavado + aspirado), OS de tech2, cita sin OS de tech1 y cita de mañana.
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client('aaaaaaaa-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001',
  'José Pérez', '5512345678', null, 'person', null, '{}', 'web',
  '[{"make":"Mazda","model":"3","year":2021,"plate":"ABC1234"},{"make":"Kia","model":"Rio","year":2020,"plate":"XYZ987"}]'::jsonb)).id as client \gset
select id as vehicle from public.vehicles where plate = 'ABC1234' \gset
select id as vehicle2 from public.vehicles where plate = 'XYZ987' \gset
select (public.create_service_order('aaaaaaaa-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000001',
  :'client', :'vehicle',
  jsonb_build_array(jsonb_build_object('service_id', :'lavado'), jsonb_build_object('service_id', :'aspirado')),
  'b2c', null, :'bay1', :'tech1', 'Cuidado con el alerón')).id as os \gset
select (public.create_service_order('aaaaaaaa-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000002',
  :'client', :'vehicle2', jsonb_build_array(jsonb_build_object('service_id', :'lavado')),
  'b2c', null, null, :'tech2')).id as os2 \gset
select id as lav_line from public.service_order_items where service_order_id = :'os' and service_code = 'LAV' \gset
select id as asp_line from public.service_order_items where service_order_id = :'os' and service_code = 'ASP' \gset
select id as os2_line from public.service_order_items where service_order_id = :'os2' \gset
select (public.create_appointment('aaaaaaaa-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000001',
  :'client', :'vehicle2', array[:'aspirado']::uuid[],
  date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City' + interval '23 hours',
  null, null, :'tech1', 'Llega con prisa')).id as appt \gset
select (public.create_appointment('aaaaaaaa-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000002',
  :'client', :'vehicle2', array[:'lavado']::uuid[],
  date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City' + interval '34 hours',
  null, null, :'tech1')).id as appt_tomorrow \gset
select organization_id || '/' || detail_center_id || '/' || id as prefix from public.service_orders where id = :'os' \gset
select organization_id || '/' || detail_center_id || '/' || id as prefix2 from public.service_orders where id = :'os2' \gset
reset role;

-- ---------------------------------------------------------------------------
-- Asignaciones del día
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select public.my_work('aaaaaaaa-0000-0000-0000-000000000000') as w \gset
select pg_temp.assert(
  jsonb_array_length((:'w'::jsonb) -> 'orders') = 0
  and jsonb_array_length((:'w'::jsonb) -> 'appointments') = 1
  and (:'w'::jsonb) #>> '{appointments,0,notes}' = 'Llega con prisa'
  and (:'w'::jsonb) #>> '{appointments,0,services,0}' = 'Aspirado'
  and (:'w'::jsonb) #>> '{appointments,0,vehicle,plate}' = 'XYZ987',
  'una OS abierta (sin autorizar) no aparece; la cita del día sí, con servicios y notas');
select pg_temp.assert(
  jsonb_array_length(public.my_work('aaaaaaaa-0000-0000-0000-000000000000',
    (now() at time zone 'America/Mexico_City')::date + 1) -> 'appointments') = 1,
  'mañana muestra la cita de mañana');
select pg_temp.assert_fails($$select public.my_work_start('$$ || :'lav_line' || $$')$$,
  '22023', 'no se trabaja una OS sin autorizar');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select from public.set_service_order_status(:'os', pg_temp.v(:'os'), 'autorizada');
select from public.set_service_order_status(:'os2', pg_temp.v(:'os2'), 'autorizada');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select public.my_work('aaaaaaaa-0000-0000-0000-000000000000') as w \gset
select pg_temp.assert(
  jsonb_array_length((:'w'::jsonb) -> 'orders') = 1
  and (:'w'::jsonb) #>> '{orders,0,id}' = :'os'
  and (:'w'::jsonb) #>> '{orders,0,bay}' = 'Bahía 1'
  and (:'w'::jsonb) #>> '{orders,0,observations}' = 'Cuidado con el alerón'
  and jsonb_array_length((:'w'::jsonb) #> '{orders,0,items}') = 2
  and (:'w'::jsonb) #>> '{orders,0,items,0,status}' = 'pendiente',
  'el técnico ve sólo su OS autorizada, con bahía, indicaciones y servicios');
select pg_temp.assert(
  not ((:'w'::jsonb) #>> '{orders,0}') ~ '(unit_price|unit_cost|phone|total)',
  'sin precios, costos ni datos de contacto del cliente');
select pg_temp.assert_fails($$select public.my_work_start('$$ || :'os2_line' || $$')$$,
  '42501', 'no trabaja una OS asignada a otro técnico');
select pg_temp.assert_fails($$select public.my_work_note('$$ || :'os2' || $$', 'Hola', null)$$,
  '42501', 'ni comenta en ella');
select pg_temp.assert_fails($$select public.my_work('bbbbbbbb-0000-0000-0000-000000000000')$$,
  '42501', 'ni ve «Mi día» de otro centro');
select pg_temp.assert_fails($$select public.set_service_order_status('$$ || :'os' || $$', 1, 'en_proceso')$$,
  '42501', 'las RPC generales de OS siguen cerradas para el técnico');

-- ---------------------------------------------------------------------------
-- Empezar, comentar, fotos, problema y trabajo realizado
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select r ->> 'order_status' = 'en_proceso' and r ->> 'item_status' = 'en_proceso'
     from public.my_work_start(:'lav_line') r),
  'empezar un servicio inicia la OS y el servicio');
reset role;
select pg_temp.assert(
  (select technician_id = :'tech1' and work_status = 'en_proceso' from public.service_order_items where id = :'lav_line')
  and pg_temp.n($$select 1 from public.service_order_events where kind in ('os_inicio', 'linea_inicio')
                   and actor_id = '00000000-0000-0000-0000-0000000000d1'$$) = 2
  and pg_temp.n($$select 1 from public.service_order_status_history
                   where to_status = 'en_proceso' and actor_id = '00000000-0000-0000-0000-0000000000d1'$$) = 1,
  'queda en la bitácora y el historial a nombre del técnico');
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select pg_temp.assert(
  (select r ->> 'item_status' = 'en_proceso' from public.my_work_start(:'lav_line') r),
  'empezar dos veces no falla');

select from public.my_work_note(:'os', '  Tiene un rayón en la puerta  ', :'lav_line');
select pg_temp.assert_fails($$select public.my_work_note('$$ || :'os' || $$', '   ', null)$$,
  '22023', 'el comentario no va vacío');
select pg_temp.assert_fails($$select public.my_work_note('$$ || :'os' || $$', 'X', '$$ || :'os2_line' || $$')$$,
  '22023', 'el servicio del comentario debe ser de la OS');

select :'prefix' || '/' || gen_random_uuid() || '.jpg' as photo \gset
insert into storage.objects (bucket_id, name) values ('service-order-evidence', :'photo');
select pg_temp.assert(
  (select kind = 'antes' and taken_by = '00000000-0000-0000-0000-0000000000d1'
     from public.my_work_register_evidence(:'os', :'photo', 'antes', 'image/jpeg', 120000, 1280, 960, :'lav_line')),
  'el técnico sube y registra la foto de antes');
select pg_temp.assert(
  pg_temp.n($$select 1 from storage.objects where bucket_id = 'service-order-evidence'$$) = 1,
  'y la puede ver en Storage');
select pg_temp.assert_fails($$insert into storage.objects (bucket_id, name) values ('service-order-evidence',
  '$$ || :'prefix2' || '/' || gen_random_uuid() || $$.jpg')$$,
  '42501', 'no sube fotos a una OS que no es suya');
select pg_temp.assert_fails($$select public.my_work_register_evidence('$$ || :'os' || $$', '$$ || :'photo' || $$', 'otra', 'image/jpeg', 1)$$,
  '22023', 'tipo de foto inválido');

select (public.my_work_report_problem(:'os', 'Falta shampoo neutro', :'lav_line')).id as problem \gset
select pg_temp.assert_fails($$select public.my_work_report_problem('$$ || :'os' || $$', 'x', null)$$,
  '22023', 'el problema necesita una descripción');

select public.my_work('aaaaaaaa-0000-0000-0000-000000000000') as w \gset
select pg_temp.assert(
  (:'w'::jsonb) #>> '{orders,0,comments,0,note}' = 'Tiene un rayón en la puerta'
  and jsonb_array_length((:'w'::jsonb) #> '{orders,0,evidence}') = 1
  and ((:'w'::jsonb) #>> '{orders,0,open_problems}')::int = 1
  and ((:'w'::jsonb) #>> '{orders,0,items,0,mine}')::boolean,
  '«Mi día» muestra comentarios, fotos y problemas abiertos');

select pg_temp.assert(
  (select r ->> 'item_status' = 'terminada' and r ->> 'order_status' = 'en_proceso'
     from public.my_work_done(:'lav_line', 'Listo, quedó brillante') r),
  'trabajo realizado termina el servicio; la OS sigue mientras falte otro');
select pg_temp.assert(
  (select (r ->> 'order_finished')::boolean and r ->> 'order_status' = 'terminada'
     from public.my_work_done(:'asp_line') r),
  'trabajo realizado en el último servicio (sin haberlo empezado) termina la OS');
select pg_temp.assert(
  (select r ->> 'item_status' = 'terminada' from public.my_work_done(:'asp_line') r),
  'repetir trabajo realizado no falla');
select pg_temp.assert_fails($$select public.my_work_start('$$ || :'asp_line' || $$')$$,
  '22023', 'un servicio terminado no se vuelve a empezar');
select pg_temp.assert(
  (select (r #>> '{orders,0,status}') = 'terminada' from public.my_work('aaaaaaaa-0000-0000-0000-000000000000') r),
  'la OS terminada hoy sigue en «Mi día» como terminada');
reset role;
select pg_temp.assert(
  (select status = 'terminada' and finished_at is not null from public.service_orders where id = :'os')
  and (select note = 'Listo, quedó brillante' from public.service_order_events
        where kind = 'linea_fin' and item_id = :'lav_line')
  and pg_temp.n($$select 1 from public.service_order_events where kind = 'os_fin'$$) = 1,
  'la OS queda terminada para que recepción la entregue, con la nota del técnico');

-- La recepción ve el trabajo del técnico.
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.service_order_events where service_order_id = '$$ || :'os' || $$' and kind = 'comentario'$$) = 1
  and pg_temp.n($$select 1 from public.service_order_evidence where service_order_id = '$$ || :'os' || $$'$$) = 1
  and pg_temp.n($$select 1 from public.service_order_incidents where id = '$$ || :'problem' || $$'$$) = 1,
  'la recepción ve comentarios, fotos y problemas del técnico');
-- Participante: tech2 ayuda en la OS de tech1 → también la ve.
select from public.set_service_order_staff(:'os2', array[:'tech1']::uuid[], 'Apoyo');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select pg_temp.assert(
  (select exists (select 1 from jsonb_array_elements(r -> 'orders') x where x ->> 'id' = :'os2')
     from public.my_work('aaaaaaaa-0000-0000-0000-000000000000') r),
  'un técnico agregado como participante ve esa OS');
reset role;

-- Desligar quita el acceso.
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select from public.link_technician_user(:'tech1', 'Ya no trabaja aquí', null);
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select pg_temp.assert_fails($$select public.my_work('aaaaaaaa-0000-0000-0000-000000000000')$$,
  '42501', 'al desligarlo pierde «Mi día»');
select pg_temp.assert_fails($$select public.my_work_note('$$ || :'os2' || $$', 'Hola', null)$$,
  '42501', 'y sus acciones');
reset role;

-- El técnico de otro centro no ve nada de A.
select pg_temp.login('00000000-0000-0000-0000-0000000000d3');
select pg_temp.assert(
  jsonb_array_length(public.my_work('bbbbbbbb-0000-0000-0000-000000000000') -> 'orders') = 0
  and pg_temp.n($$select 1 from public.detail_centers$$) = 1,
  'el técnico del centro B sólo ve su centro');
select pg_temp.assert_fails($$select public.my_work_done('$$ || :'os2_line' || $$')$$,
  '42501', 'y no trabaja OS del centro A');
reset role;

rollback;
