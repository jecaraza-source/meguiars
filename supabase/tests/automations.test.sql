-- Pruebas de CR2 (fase 4): automatizaciones comerciales (permisos, disparadores,
-- consentimiento, frecuencia, paro de secuencias, historial, sin duplicados) y
-- hechos del panel comercial.
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

-- Entrega una OS en la fecha indicada (sin pasar por el flujo de cobro).
create function pg_temp.deliver_at(p_id uuid, p_at timestamptz) returns void language plpgsql as $$
begin
  perform set_config('session_replication_role', 'replica', true);
  update public.service_orders set status = 'entregada', delivered_at = p_at, created_at = p_at - interval '2 hours'
   where id = p_id;
  perform set_config('session_replication_role', 'origin', true);
end $$;

grant execute on all functions in schema pg_temp to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'corp@o1'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@a'),
  ('00000000-0000-0000-0000-0000000000f2', 'operador@b');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Org uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'contador'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion');

\set O1 '0e000000-0000-0000-0000-000000000001'
\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set B 'bbbbbbbb-0000-0000-0000-000000000000'
\set E1 '00000000-0000-0000-0000-0000000000e1'
\set F1 '00000000-0000-0000-0000-0000000000f1'
\set F2 '00000000-0000-0000-0000-0000000000f2'
select private.center_today(:'A') as today \gset

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service(:'O1', 'LAV-EXP', 'Lavado exprés', null, 'recurrente', 30, 150, 15)).id as lav \gset
select (public.create_service(:'O1', 'CERA', 'Encerado', null, 'premium', 60, 600, 120)).id as cera \gset
reset role;

-- ---------------------------------------------------------------------------
-- Permisos y validación.
-- ---------------------------------------------------------------------------
select pg_temp.login(:'F1');
select pg_temp.assert_fails(format($$select public.upsert_automation(%L, null, null, %L, 'Nuevo', 'prospecto_nuevo', 0, '{}', '{}', null, 0, null, 30, 50, null, null, 'Alta')$$, :'O1', :'A'),
  '42501', 'la recepción no configura automatizaciones');
reset role;
select pg_temp.login(:'E1');
select pg_temp.assert_fails(format($$select public.upsert_automation(%L, null, null, null, 'Toda la org', 'prospecto_nuevo', 0, '{}', '{}', null, 0, null, 30, 50, null, null, 'Alta')$$, :'O1'),
  '42501', 'el encargado no crea automatizaciones de toda la organización');
select pg_temp.assert_fails(format($$select public.upsert_automation(%L, null, null, %L, 'Nuevo', 'prospecto_nuevo', 0, '{}', '{}', null, 0, 'Hola {nombre}, tu precio es {precio}', 30, 50, null, null, 'Alta')$$, :'O1', :'A'),
  'MG002', 'el mensaje sólo admite datos reales ({precio} no existe: no se inventan precios)');
select pg_temp.assert_fails(format($$select public.upsert_automation(%L, null, null, %L, 'Nuevo', 'prospecto_nuevo', 0, '{}', '{}', %L, 0, null, 30, 50, null, null, 'Alta')$$, :'O1', :'A', :'F2'),
  'MG002', 'el responsable debe trabajar prospectos en el centro');
select (public.upsert_automation(:'O1', null, null, :'A', 'Nuevo prospecto: contactar hoy', 'prospecto_nuevo', 0, '{}', '{}', :'F1', 0,
  'Hola {nombre}, gracias por escribir a {centro}. ¿Te ayudo a cotizar?', 30, 50, '09:00', '19:00', 'Alta')).id as auto_new \gset
select pg_temp.assert((select purpose = 'operativa' and not active from public.automations where id = :'auto_new'),
  'la regla de prospecto nuevo es operativa y nace inactiva');
reset role;

-- Prospecto registrado ANTES de activar: no se toca.
select pg_temp.login(:'F1');
select (public.create_lead(:'A', gen_random_uuid(), 'Previo Pérez', 'instagram', '5500000001')).id as lead_old \gset
reset role;
update public.leads set created_at = now() - interval '10 days' where id = :'lead_old';

select pg_temp.login(:'E1');
select from public.set_automation_active(:'auto_new', 1, true, 'Arranque');
reset role;
select pg_temp.login(:'F1');
select (public.create_lead(:'A', gen_random_uuid(), 'Mario Díaz', 'facebook', '5500000002', p_consent_channels => '{whatsapp}')).id as lead1 \gset
reset role;

select pg_temp.login(:'E1');
select (public.run_automation_now(:'auto_new', true)).created as preview \gset
select pg_temp.assert(:preview = 1 and (select count(*) from public.crm_tasks where automation_id = :'auto_new') = 0,
  'vista previa: 1 prospecto nuevo, sin crear tareas');
select (public.run_automation_now(:'auto_new', false)).created as created1 \gset
reset role;
select pg_temp.assert(:created1 = 1
  and (select kind || ':' || channel || ':' || source || ':' || assigned_to from public.crm_tasks where automation_id = :'auto_new')
      = 'whatsapp:whatsapp:automatizacion:' || :'F1'
  and (select notes like '%Hola Mario, gracias por escribir a Centro A%Contactar entre 09:00 y 19:00%' from public.crm_tasks where automation_id = :'auto_new'),
  'prospecto nuevo: tarea de WhatsApp (autorizó ese canal) con el mensaje sugerido y el horario');
select pg_temp.assert((select owner_id = :'F1'::uuid from public.leads where id = :'lead1')
  and exists (select 1 from public.lead_events where lead_id = :'lead1' and kind = 'responsable'),
  'el prospecto sin responsable queda asignado y el historial lo registra');
select pg_temp.assert((select owner_id is null from public.leads where id = :'lead_old'),
  'el prospecto registrado antes de activar la regla no se toca');
select pg_temp.login(:'E1');
select (public.run_automation_now(:'auto_new', false)).created as created2 \gset
reset role;
select pg_temp.assert(:created2 = 0 and (select count(*) from public.crm_tasks where automation_id = :'auto_new') = 1,
  'correr otra vez no duplica la tarea');

-- El cliente responde en la bandeja: la secuencia se detiene.
insert into public.channel_accounts (id, organization_id, detail_center_id, channel, external_account_id, label)
values ('ca110000-0000-0000-0000-000000000001', :'O1', :'A', 'whatsapp', '1234567890', 'WhatsApp A');
insert into public.conversations (id, organization_id, detail_center_id, channel_account_id, channel, contact_external_id, lead_id)
values ('c0110000-0000-0000-0000-000000000001', :'O1', :'A', 'ca110000-0000-0000-0000-000000000001', 'whatsapp', '5215500000002', :'lead1');
insert into public.messages (organization_id, detail_center_id, conversation_id, direction, external_id, body, status)
values (:'O1', :'A', 'c0110000-0000-0000-0000-000000000001', 'entrante', 'wamid.1', 'Hola, ¿precio?', 'recibido');
select pg_temp.assert((select status || ':' || cancel_reason from public.crm_tasks where automation_id = :'auto_new')
                      = 'cancelada:El cliente respondió'
  and exists (select 1 from public.automation_executions where automation_id = :'auto_new' and outcome = 'detenida'),
  'cuando el cliente responde, la tarea pendiente se cancela y queda en el historial');

-- ---------------------------------------------------------------------------
-- Promocionales: consentimiento, frecuencia y paro al reservar.
-- ---------------------------------------------------------------------------
select pg_temp.login(:'F1');
select (public.create_client(:'A', gen_random_uuid(), 'Beto Sin Permiso', '5511110001', null, 'person', null, '{}', 'web',
  '[{"make":"Kia","model":"Rio","year":2022,"plate":"BET0001"}]'::jsonb)).id as beto \gset
select (public.create_client(:'A', gen_random_uuid(), 'Carla Con Permiso', '5511110002', null, 'person', null, '{whatsapp}', 'web',
  '[{"make":"Mazda","model":"3","year":2021,"plate":"CAR0001"}]'::jsonb)).id as carla \gset
select (public.create_client(:'A', gen_random_uuid(), 'Dana Reserva', '5511110003', null, 'person', null, '{whatsapp}', 'web',
  '[{"make":"VW","model":"Jetta","year":2020,"plate":"DAN0001"}]'::jsonb)).id as dana \gset
select (public.create_service_order(:'A', gen_random_uuid(), :'beto', (select id from public.vehicles where plate = 'BET0001'),
  jsonb_build_array(jsonb_build_object('service_id', :'lav')))).id as os_beto \gset
select (public.create_service_order(:'A', gen_random_uuid(), :'carla', (select id from public.vehicles where plate = 'CAR0001'),
  jsonb_build_array(jsonb_build_object('service_id', :'lav')))).id as os_carla \gset
select (public.create_service_order(:'A', gen_random_uuid(), :'dana', (select id from public.vehicles where plate = 'DAN0001'),
  jsonb_build_array(jsonb_build_object('service_id', :'lav')))).id as os_dana \gset
reset role;
select pg_temp.deliver_at(:'os_beto', now() - interval '35 days');
select pg_temp.deliver_at(:'os_carla', now() - interval '35 days');
select pg_temp.deliver_at(:'os_dana', now() - interval '36 days');

select pg_temp.login(:'E1');
select (public.upsert_automation(:'O1', null, null, :'A', 'Recompra de lavado', 'mantenimiento', 30, '{}', '{}', null, 1,
  'Hola {nombre}, ya toca tu {servicio} en {centro}.', 30, 50, '10:00', '18:00', 'Alta')).id as auto_mant \gset
select from public.set_automation_active(:'auto_mant', 1, true, 'Arranque');
select (public.run_automation_now(:'auto_mant', false)) as run_mant \gset
reset role;
select pg_temp.assert((select created = 2 and (skipped ->> 'sin_consentimiento')::integer = 1
                         from public.automation_runs where automation_id = :'auto_mant' and mode = 'manual'),
  'mantenimiento (promocional): 2 tareas y 1 omitida porque Beto no autorizó promociones');
select pg_temp.assert((select purpose from public.automations where id = :'auto_mant') = 'promocional'
  and not exists (select 1 from public.crm_tasks where automation_id = :'auto_mant' and client_id = :'beto')
  and (select due_on = :'today'::date + 1 and kind = 'whatsapp' and notes like '%ya toca tu Lavado exprés%Promocional%'
         from public.crm_tasks where automation_id = :'auto_mant' and client_id = :'carla'),
  'Carla recibe tarea de WhatsApp para mañana con el servicio real y la marca promocional');

-- Otra promocional sobre la misma clienta dentro del enfriamiento: se omite.
select pg_temp.login(:'E1');
select (public.upsert_automation(:'O1', null, null, :'A', 'Reactivar inactivos', 'cliente_inactivo', 30, '{}', '{}', null, 0,
  null, 30, 50, null, null, 'Alta')).id as auto_inact \gset
select from public.set_automation_active(:'auto_inact', 1, true, 'Arranque');
select from public.run_automation_now(:'auto_inact', false);
reset role;
select pg_temp.assert((select created = 0 and (skipped ->> 'limite_frecuencia')::integer = 2
                         from public.automation_runs where automation_id = :'auto_inact' and mode = 'manual'),
  'límite de frecuencia: Carla y Dana ya recibieron una promocional en los últimos 30 días');

-- Dana reserva: su recordatorio promocional se detiene solo.
select from set_config('app.change_reason', 'prueba', true);
insert into public.appointments (organization_id, detail_center_id, client_id, vehicle_id, starts_at, duration_minutes, request_id)
values (:'O1', :'A', :'dana', (select id from public.vehicles where plate = 'DAN0001'), now() + interval '3 days', 60, gen_random_uuid());
select pg_temp.assert((select status || ':' || cancel_reason from public.crm_tasks where automation_id = :'auto_mant' and client_id = :'dana')
                      = 'cancelada:El cliente ya reservó',
  'al reservar, la tarea promocional pendiente se cancela');

-- Carla retira el consentimiento: su tarea promocional se cancela.
select from private.put_contact_preference(:'carla', 'whatsapp', false, 'web');
select pg_temp.assert((select status from public.crm_tasks where automation_id = :'auto_mant' and client_id = :'carla') = 'cancelada',
  'retirar el consentimiento cancela la tarea promocional');
select from set_config('app.change_reason', '', true);

-- ---------------------------------------------------------------------------
-- Operativas: reserva próxima (sin consentimiento promocional) y valoración.
-- ---------------------------------------------------------------------------
select from set_config('app.change_reason', 'prueba', true);
insert into public.appointments (id, organization_id, detail_center_id, client_id, vehicle_id, starts_at, duration_minutes, request_id)
values ('a0110000-0000-0000-0000-000000000001', :'O1', :'A', :'beto', (select id from public.vehicles where plate = 'BET0001'),
        (:'today'::date + 1 + time '11:00') at time zone 'America/Mexico_City', 60, gen_random_uuid());
select from set_config('app.change_reason', '', true);
select pg_temp.login(:'E1');
select (public.upsert_automation(:'O1', null, null, :'A', 'Confirmar cita', 'reserva_proxima', 1, '{}', '{}', null, 0,
  'Hola {nombre}, te esperamos el {fecha}.', 7, 50, null, null, 'Alta')).id as auto_conf \gset
select from public.set_automation_active(:'auto_conf', 1, true, 'Arranque');
select from public.run_automation_now(:'auto_conf', false);
reset role;
select pg_temp.assert((select kind || ':' || channel from public.crm_tasks where automation_id = :'auto_conf' and client_id = :'beto')
                      = 'llamar:llamada'
  and (select notes like '%te esperamos el ' || to_char(:'today'::date + 1, 'DD/MM/YYYY') || '%' from public.crm_tasks
        where automation_id = :'auto_conf' and client_id = :'beto'),
  'confirmar cita es operativa: llamada al teléfono de Beto aunque no autorizó promociones');
select from set_config('app.change_reason', 'prueba', true);
update public.appointments set status = 'cancelada', cancelled_at = now() where id = 'a0110000-0000-0000-0000-000000000001';
select from set_config('app.change_reason', '', true);
select pg_temp.login(:'E1');
select (public.run_automation_now(:'auto_conf', false)).stopped as stopped_conf \gset
reset role;
select pg_temp.assert(:stopped_conf = 1
  and (select cancel_reason from public.crm_tasks where automation_id = :'auto_conf') = 'La cita cambió de estado',
  'la cita cancelada detiene la confirmación en la siguiente corrida');

select pg_temp.login(:'F1');
select (public.create_service_order(:'A', gen_random_uuid(), :'beto', (select id from public.vehicles where plate = 'BET0001'),
  jsonb_build_array(jsonb_build_object('service_id', :'cera')))).id as os_rate \gset
reset role;
select pg_temp.deliver_at(:'os_rate', now() - interval '1 day');
select pg_temp.login(:'E1');
select (public.upsert_automation(:'O1', null, null, :'A', 'Pedir valoración', 'servicio_entregado', 1, array[:'cera']::uuid[], '{}', :'F1', 0,
  '¿Cómo quedó tu {servicio}, {nombre}? OS {folio}', 30, 50, null, null, 'Alta')).id as auto_rate \gset
select from public.set_automation_active(:'auto_rate', 1, true, 'Arranque');
select from public.run_automation_now(:'auto_rate', false);
reset role;
select pg_temp.assert((select notes like '%¿Cómo quedó tu Encerado, Beto? OS A-01-%' and service_order_id = :'os_rate'::uuid
                         from public.crm_tasks where automation_id = :'auto_rate'),
  'valoración tras el servicio: tarea ligada a la OS con servicio y folio reales');

-- ---------------------------------------------------------------------------
-- Cotización sin respuesta: se detiene al decidirse.
-- ---------------------------------------------------------------------------
select pg_temp.login(:'F1');
select (public.create_lead(:'A', gen_random_uuid(), 'Quique Cotiza', 'google', '5500000003')).id as lead_q \gset
select (public.create_quote(:'A', gen_random_uuid(), jsonb_build_array(jsonb_build_object('service_id', :'cera')), :'lead_q')).id as q \gset
select from public.set_quote_status(:'q', (select version from public.quotes where id = :'q'), 'enviada');
reset role;
update public.quotes set sent_at = now() - interval '3 days' where id = :'q';
select pg_temp.login(:'E1');
select (public.upsert_automation(:'O1', null, null, :'A', 'Seguimiento de cotización', 'cotizacion_pendiente', 2, '{}', '{}', null, 0,
  'Hola {nombre}, ¿revisaste la cotización {folio}?', 30, 50, null, null, 'Alta')).id as auto_q \gset
select from public.set_automation_active(:'auto_q', 1, true, 'Arranque');
select from public.run_automation_now(:'auto_q', false);
select from public.set_quote_status(:'q', (select version from public.quotes where id = :'q'), 'rechazada', 'Muy caro');
select from public.run_automation_now(:'auto_q', false);
reset role;
select pg_temp.assert((select lead_id = :'lead_q'::uuid and status = 'cancelada'
                              and cancel_reason = 'La cotización ya se decidió, reservó o venció'
                         from public.crm_tasks where automation_id = :'auto_q'),
  'la cotización rechazada detiene su recordatorio');

-- Desactivar cancela lo pendiente.
select pg_temp.login(:'E1');
select from public.set_automation_active(:'auto_rate', (select version from public.automations where id = :'auto_rate'), false, 'Pausa');
reset role;
select pg_temp.assert((select cancel_reason from public.crm_tasks where automation_id = :'auto_rate') = 'Automatización desactivada',
  'desactivar la regla cancela sus tareas pendientes');
select pg_temp.login(:'E1');
select pg_temp.assert_fails(format($$select public.run_automation_now(%L, false)$$, :'auto_rate'),
  'MG002', 'una regla inactiva sólo admite vista previa');
reset role;

-- ---------------------------------------------------------------------------
-- Lectura, historial, sistema y aislamiento.
-- ---------------------------------------------------------------------------
select pg_temp.login(:'E1');
select pg_temp.assert((select count(*) from public.list_automations(:'O1')) = 6
  and (select tasks_created = 1 and tasks_stopped = 1 and can_manage from public.list_automations(:'O1') where id = :'auto_new'),
  'la lista trae contadores de tareas y permiso');
select pg_temp.assert((select count(*) from public.automation_executions_list(:'auto_mant')) >= 3
  and exists (select 1 from public.automation_executions_list(:'auto_mant') where contact_name = 'Carla Con Permiso'),
  'el historial muestra cada acción con su contacto');
select pg_temp.assert_fails('select private.run_automations_all()', '42501', 'nadie ejecuta la corrida del sistema desde la API');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert((select count(*) from public.list_automations(:'O1')) = 0 and (select count(*) from public.automations) = 0,
  'el contador no ve automatizaciones (el historial trae nombres)');
reset role;
select pg_temp.login(:'F2');
select pg_temp.assert((select count(*) from public.list_automations(:'O1')) = 0
  and (select count(*) from public.automation_executions) = 0,
  'la recepción de otro centro no ve reglas ni historial');
reset role;

select private.run_automations_all() as all_created \gset
select pg_temp.assert((select count(*) from public.automation_runs where mode = 'programada') = 5,
  'la corrida programada recorre las 5 reglas activas');
select pg_temp.assert(:all_created = 1
  and exists (select 1 from public.crm_tasks where automation_id = :'auto_new' and lead_id = :'lead_q'),
  'la corrida diaria atiende al prospecto nuevo que faltaba (Quique)');
select private.run_automations_all() as again \gset
select pg_temp.assert(:again = 0, 'repetir la corrida diaria no duplica acciones');
select pg_temp.assert((select count(*) from public.audit_log where table_name = 'public.automations') >= 10,
  'altas y activaciones de reglas quedan en auditoría');

-- ---------------------------------------------------------------------------
-- Hechos del panel comercial.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert((select count(*) from public.commercial_sales_facts(array[:'A']::uuid[], :'today'::date - 60, :'today'::date)) = 4
  and (select count(*) filter (where first_purchase) from public.commercial_sales_facts(array[:'A']::uuid[], :'today'::date - 60, :'today'::date)) = 3,
  'ventas del periodo: 4 OS entregadas, 3 primeras compras (Beto repite)');
select pg_temp.assert((select bool_and(stage_name is not null) from public.commercial_funnel_facts(array[:'A']::uuid[], :'today'::date - 30, :'today'::date)),
  'el embudo trae la etapa actual de cada prospecto');
reset role;
select pg_temp.login(:'F2');
select pg_temp.assert((select count(*) from public.commercial_sales_facts(array[:'A', :'B']::uuid[], :'today'::date - 60, :'today'::date)) = 0,
  'otro centro no ve las ventas del centro A');
reset role;

rollback;
