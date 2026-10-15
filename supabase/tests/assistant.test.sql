-- Pruebas del asistente de WhatsApp (F0/F1): configuración (sólo admin), datos
-- públicos y horario del centro, cuándo atiende (apagado / prueba / pausado /
-- persona atendiendo / mensaje más reciente), herramientas de sólo lectura con
-- datos reales (catálogo, promociones preautorizadas, horarios libres), elección
-- de centro del número central, escalamiento a una persona, baja de promociones,
-- respuesta única por turno y aislamiento entre organizaciones.
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

create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
end $$;

-- Mensaje entrante simulado (webhook firmado) y devuelve su id.
create function pg_temp.inbound(ext text, contact text, body text, at timestamptz default now()) returns uuid
language plpgsql as $$
declare
  r jsonb;
begin
  r := public.ingest_inbound_messages('whatsapp', '1234567890', jsonb_build_array(
    jsonb_build_object('external_id', ext, 'contact_id', contact, 'contact_phone', contact, 'contact_name', 'Ana Ruiz',
                       'body', body, 'occurred_at', at)));
  return (r -> 'messages' -> 0 ->> 'message_id')::uuid;
end $$;

grant execute on all functions in schema pg_temp to authenticated, anon, service_role;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'corp@o1'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000f2', 'operador@b'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@a'),
  ('00000000-0000-0000-0000-0000000000a2', 'corp@o2');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Org uno'),
  ('0e000000-0000-0000-0000-000000000002', 'org-dos', 'Org dos');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro Polanco', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro Coyoacán', 'America/Mexico_City'),
  ('cccccccc-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000002', 'C-01', 'Centro ajeno', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio'),
  ('0e000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a2', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'contador'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion');
insert into public.profiles (id, full_name) values
  ('00000000-0000-0000-0000-0000000000f1', 'Fer Recepción'),
  ('00000000-0000-0000-0000-0000000000f2', 'Gil Recepción')
on conflict (id) do update set full_name = excluded.full_name;

\set O1 '0e000000-0000-0000-0000-000000000001'
\set O2 '0e000000-0000-0000-0000-000000000002'
\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set B 'bbbbbbbb-0000-0000-0000-000000000000'
\set C 'cccccccc-0000-0000-0000-000000000000'

-- Catálogo: lavado (60 min, visible), cerámico (requiere valoración) y uno oculto al asistente.
insert into public.services (id, organization_id, code, name, description, revenue_engine, standard_duration_minutes, base_price, standard_direct_cost)
values ('5e000000-0000-0000-0000-000000000001', :'O1', 'LAV-EXP', 'Lavado exprés', 'Exterior e interior básico', 'recurrente', 60, 250, 40),
       ('5e000000-0000-0000-0000-000000000002', :'O1', 'CER-PRO', 'Cerámico profesional', null, 'premium', 480, 9500, 2500),
       ('5e000000-0000-0000-0000-000000000003', :'O1', 'INT-OCU', 'Servicio interno', null, 'valor_medio', 30, 100, 10),
       ('5e000000-0000-0000-0000-000000000009', :'O2', 'AJENO', 'Servicio ajeno', null, 'recurrente', 60, 1, 1);
insert into public.service_center_config (organization_id, detail_center_id, service_id, price_override)
values (:'O1', :'B', '5e000000-0000-0000-0000-000000000001', 280);

-- ---------------------------------------------------------------------------
-- Alta: cada organización nace con el asistente apagado y sus reglas.
-- ---------------------------------------------------------------------------
select pg_temp.assert((select mode from public.bot_settings where organization_id = :'O1') = 'apagado'
  and (select count(*) from public.bot_handoff_rules where organization_id = :'O1') = 10
  and (select count(*) from public.bot_handoff_rules where organization_id = :'O2') = 10,
  'cada organización nace con el asistente apagado y las 10 reglas de escalamiento');

-- ---------------------------------------------------------------------------
-- Configuración: sólo el admin de la organización.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert((select mode || ':' || can_manage || ':' || cardinality(test_numbers) from public.get_assistant_settings(:'O1'))
                      = 'apagado:false:0',
  'la recepción ve la configuración (sin los números de prueba) pero no la administra');
select pg_temp.assert_fails(format($$select public.update_assistant_settings(%L, 1, 'activo', 'claude-opus-5-5', 'Asistente', 'Cordial', null, null, null, null, 'colonia', 14, 2, true, true, '{}', 'Encender')$$, :'O1'),
  '42501', 'la recepción no enciende el asistente');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select pg_temp.assert((select count(*) from public.get_assistant_settings(:'O1')) = 0,
  'el admin de otra organización no ve la configuración');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert_fails(format($$select public.update_assistant_settings(%L, 1, 'prueba', 'claude-opus-5-5', 'Asistente', 'Cordial', null, null, null, null, 'colonia', 14, 2, true, true, '{}', 'Probar')$$, :'O1'),
  'MG002', 'el modo prueba necesita al menos un número de prueba');
select pg_temp.assert_fails(format($$select public.update_assistant_settings(%L, 1, 'prueba', 'gpt-x', 'Asistente', 'Cordial', null, null, null, null, 'colonia', 14, 2, true, true, array['5511112222'], 'Probar')$$, :'O1'),
  '23514', 'sólo modelos permitidos');
select from public.update_assistant_settings(:'O1', 1, 'prueba', 'claude-opus-5-5', 'Asistente MEGUIAR''S', 'Cordial y breve', 'Hola, soy el asistente',
  'https://ejemplo.mx/privacidad', 'lun-sáb 9:00-19:00', null, 'colonia', 14, 2, true, true, array['55 1111-2222', '5215533334444'], 'Modo prueba');
select pg_temp.assert((select mode || ':' || array_to_string(test_numbers, ',') || ':' || version from public.bot_settings where organization_id = :'O1')
                      = 'prueba:5215533334444,5511112222:2',
  'el admin pone el modo prueba; los números quedan sólo con dígitos');
select pg_temp.assert_fails(format($$select public.update_assistant_settings(%L, 1, 'activo', 'claude-opus-5-5', 'Asistente', 'Cordial', null, null, null, null, 'colonia', 14, 2, true, true, '{}', 'Viejo')$$, :'O1'),
  '40001', 'una edición con versión vieja se rechaza');
select pg_temp.assert(exists (select 1 from public.audit_log where table_name = 'public.bot_settings' and reason = 'Modo prueba'),
  'el cambio de configuración queda en auditoría con su motivo');

-- Escalamiento: «pide persona» no se desactiva; el asignado debe atender la bandeja.
select pg_temp.assert_fails(format($$select public.set_assistant_handoff_rule(%L, 'pide_persona', 1, false, null, null, 'Quitar')$$, :'O1'),
  'MG002', 'pedir una persona no se puede desactivar');
select pg_temp.assert_fails(format($$select public.set_assistant_handoff_rule(%L, 'queja', 1, true, %L, null, 'Asignar')$$, :'O1', '00000000-0000-0000-0000-0000000000c1'),
  'MG002', 'no se asigna a quien no atiende la bandeja (contador)');
select from public.set_assistant_handoff_rule(:'O1', 'descuento', 1, false, null, null, 'No escalar descuentos');
select from public.set_assistant_handoff_rule(:'O1', 'queja', 1, true, '00000000-0000-0000-0000-0000000000f1',
  'Lamentamos lo ocurrido; en un momento le atiende el encargado.', 'Quejas a recepción');

-- Respuestas aprobadas y servicios que ofrece.
select from public.upsert_assistant_faq(:'O1', null, null, null, '¿Aceptan tarjeta?', 'Sí, tarjeta de crédito y débito.', 10, true, 'Alta');
select (public.upsert_assistant_faq(:'O1', null, null, :'A', '¿Hay estacionamiento?', 'Sí, en la entrada lateral.', 20, true, 'Alta')).id as faq \gset
select from public.set_assistant_service(:'O1', '5e000000-0000-0000-0000-000000000002', true, false, true, 'Cerámico con valoración');
select from public.set_assistant_service(:'O1', '5e000000-0000-0000-0000-000000000003', false, false, false, 'Interno');
select pg_temp.assert_fails(format($$select public.set_assistant_service(%L, %L, true, true, false, 'Ajeno')$$, :'O1', '5e000000-0000-0000-0000-000000000009'),
  'P0002', 'no se configuran servicios de otra organización');
reset role;

-- ---------------------------------------------------------------------------
-- Datos públicos y horario del centro.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails(format($$select public.set_center_public_info(%L, null, 'Av. 1', null, null, null, '{}', null, '[]', 'Editar')$$, :'A'),
  '42501', 'la recepción no edita los datos públicos del centro');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails(format($$select public.set_center_public_info(%L, null, 'Av. Presidente Masaryk 100', null, null, null, '{}', null, '[{"weekday": 1, "opens": "19:00", "closes": "08:00"}]', 'Horario')$$, :'A'),
  'MG002', 'el horario debe cerrar después de abrir');
select pg_temp.assert_fails(format($$select public.set_center_public_info(%L, null, 'Av. 1', null, null, null, '{}', null, '[]', 'Ajeno')$$, :'B'),
  '42501', 'el encargado no edita otro centro');
select from public.set_center_public_info(:'A', null, 'Av. Presidente Masaryk 100, Polanco', '55 1234 5678', 'https://maps.app.goo.gl/x',
  'Entrada por la calle lateral', array['Polanco', 'Anzures', ' ', 'Polanco'], '00000000-0000-0000-0000-0000000000f1',
  (select jsonb_agg(jsonb_build_object('weekday', d, 'opens', '08:00', 'closes', '20:00')) from generate_series(1, 7) d),
  'Datos del centro');
select pg_temp.assert((select array_to_string(nearby_zones, ',') || ':' || jsonb_array_length(hours) || ':' || handoff_user_name
                         from public.list_center_public_info(:'O1') where detail_center_id = :'A')
                      = 'Anzures,Polanco:7:Fer Recepción',
  'el encargado guarda dirección, zonas (sin repetir), responsable y el horario de 7 días');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select from public.set_center_public_info(:'B', null, 'Av. Universidad 2000, Coyoacán', null, null, null, array['Coyoacán', 'Del Valle'],
  '00000000-0000-0000-0000-0000000000f2', '[{"weekday": 1, "opens": "09:00", "closes": "18:00"}]', 'Datos del centro');
reset role;

-- Cuenta oficial central (llega al centro A) y verificada.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.upsert_channel_account(:'O1', null, :'A', 'whatsapp', '1234567890', 'WhatsApp central', true, 'Número central')).id as wa \gset
reset role;
select pg_temp.as_service();
select from public.record_channel_verification(:'wa', true, '+52 55 0000 0000', null);
reset role;

-- ---------------------------------------------------------------------------
-- Cuándo atiende.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
select pg_temp.inbound('wamid.ajeno', '5219998887777', 'Hola') as m_ajeno \gset
select pg_temp.assert(public.assistant_begin_turn(:'m_ajeno') ->> 'skip' = 'modo prueba: el número no es de prueba',
  'modo prueba: no responde a números que no son de prueba');
select pg_temp.inbound('wamid.1', '5215511112222', 'Hola, ¿cuánto cuesta un lavado?', now() - interval '2 minutes') as m1 \gset
select public.assistant_begin_turn(:'m1') as ctx \gset
select (:'ctx'::jsonb ->> 'turn_id') as t1 \gset
select pg_temp.assert(:'t1' is not null
  and (:'ctx'::jsonb -> 'conversation' ->> 'center_confirmed')::boolean = false
  and jsonb_array_length(:'ctx'::jsonb -> 'centers') = 2
  and jsonb_array_length(:'ctx'::jsonb -> 'faqs') = 2
  and not (:'ctx'::jsonb -> 'handoff') @> '[{"codigo": "descuento"}]'
  and (:'ctx'::jsonb -> 'history' -> 0 ->> 'body') = 'Hola, ¿cuánto cuesta un lavado?',
  'número de prueba (por sus últimos 10 dígitos): abre el turno con centros, respuestas, reglas activas e historial');
select pg_temp.assert(public.assistant_begin_turn(:'m1') ->> 'skip' = 'mensaje ya atendido',
  'un reintento del webhook no abre otro turno');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails(format($$select public.assistant_begin_turn(%L)$$, :'m1'), '42501',
  'una sesión de usuario no ejecuta el asistente');
select pg_temp.assert_fails(format($$select public.assistant_services(%L, %L, null)$$, :'t1', :'A'), '42501',
  'ni sus herramientas');
reset role;

-- ---------------------------------------------------------------------------
-- Herramientas de sólo lectura.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
select pg_temp.assert((select string_agg(x ->> 'nombre' || '=' || (x ->> 'precio'), ',' order by x ->> 'nombre')
                         from jsonb_array_elements(public.assistant_services(:'t1', :'B', null) -> 'servicios') x)
                      = 'Cerámico profesional=9500.00,Lavado exprés=280.00',
  'catálogo: precio vigente del centro elegido y sin los servicios ocultos al asistente');
select pg_temp.assert((select count(*) from jsonb_array_elements(public.assistant_services(:'t1', :'A', 'lavado') -> 'servicios')) = 1
  and (public.assistant_services(:'t1', :'A', 'ceramico') -> 'servicios' -> 0 ->> 'se_agenda_sin_valoracion')::boolean = false,
  'búsqueda sin acentos y marca de servicios que requieren valoración');
select pg_temp.assert_fails(format($$select public.assistant_services(%L, %L, null)$$, :'t1', :'C'), 'MG002',
  'un turno no lee centros de otra organización');

reset role;
insert into public.promotions (organization_id, code, name, kind, value, starts_on, ends_on, authorization_level, terms)
values (:'O1', 'BIENVENIDA10', 'Bienvenida', 'percent', 10, current_date - 1, current_date + 30, 'operador', 'Primera visita'),
       (:'O1', 'SOCIO30', 'Descuento especial', 'percent', 30, current_date - 1, current_date + 30, 'admin', null),
       (:'O1', 'VENCIDA', 'Vencida', 'amount', 100, current_date - 30, current_date - 1, 'operador', null);
select pg_temp.as_service();
select pg_temp.assert((select string_agg(x ->> 'codigo', ',') from jsonb_array_elements(public.assistant_promotions(:'t1', :'A') -> 'promociones') x)
                      = 'BIENVENIDA10',
  'promociones: sólo vigentes y que el mostrador puede aplicar sin autorización');

-- Horarios libres: 2 bahías; mañana 10:00-11:00 ambas ocupadas.
reset role;
insert into public.bays (organization_id, detail_center_id, name) values (:'O1', :'A', 'Bahía 1'), (:'O1', :'A', 'Bahía 2');
insert into public.clients (id, organization_id, home_detail_center_id, kind, full_name, phone, request_id, created_in_detail_center_id)
values ('c1000000-0000-0000-0000-000000000001', :'O1', :'A', 'person', 'Cliente Uno', '+525500000001',
        'c1000000-0000-0000-0000-0000000000a1', :'A');
insert into public.vehicles (id, organization_id, client_id, make, model, year, plate, created_in_detail_center_id)
values ('c2000000-0000-0000-0000-000000000001', :'O1', 'c1000000-0000-0000-0000-000000000001', 'Mazda', '3', 2021, 'ABC1234', :'A');
select ((now() at time zone 'America/Mexico_City')::date + 1) as tomorrow \gset
insert into public.appointments (organization_id, detail_center_id, client_id, vehicle_id, starts_at, duration_minutes, request_id)
select :'O1', :'A', 'c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001',
       (:'tomorrow'::date + time '10:00') at time zone 'America/Mexico_City', 60, gen_random_uuid()
  from generate_series(1, 2);
select pg_temp.as_service();
select public.assistant_free_slots(:'t1', :'A', array['5e000000-0000-0000-0000-000000000001']::uuid[], :'tomorrow'::date, 1) as slots \gset
select pg_temp.assert((:'slots'::jsonb -> 'dias' -> 0 -> 'horarios') ? '09:00'
  and not (:'slots'::jsonb -> 'dias' -> 0 -> 'horarios') ? '09:30'
  and not (:'slots'::jsonb -> 'dias' -> 0 -> 'horarios') ? '10:00'
  and (:'slots'::jsonb -> 'dias' -> 0 -> 'horarios') ? '11:00'
  and (:'slots'::jsonb ->> 'duracion_min')::integer = 60,
  'horarios libres: respeta el horario del centro, la duración y las bahías ocupadas');
select pg_temp.assert(public.assistant_free_slots(:'t1', :'A', array['5e000000-0000-0000-0000-000000000002']::uuid[], :'tomorrow'::date, 1) ? 'error'
  and public.assistant_free_slots(:'t1', :'B', array['5e000000-0000-0000-0000-000000000001']::uuid[], :'tomorrow'::date, 1) ->> 'error'
      like '%bahías%',
  'sin disponibilidad inventada: servicios con valoración o centro sin bahías no dan horarios');

-- ---------------------------------------------------------------------------
-- Número central: el cliente elige centro; la conversación pasa a ese centro.
-- ---------------------------------------------------------------------------
select pg_temp.assert((public.assistant_choose_center(:'t1', :'B') ->> 'cambiado')::boolean, 'el asistente pasa la conversación al centro elegido');
reset role;
select conversation_id as cv from public.messages where id = :'m1' \gset
select pg_temp.assert((select detail_center_id from public.conversations where id = :'cv') = :'B'::uuid
  and (select center_confirmed_at is not null from public.conversations where id = :'cv')
  and not exists (select 1 from public.messages where conversation_id = :'cv' and detail_center_id <> :'B'::uuid),
  'conversación y mensajes quedan en el centro elegido');
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert((select count(*) from public.list_conversations(array[:'B']::uuid[], null)) = 1,
  'la recepción del centro elegido ve la conversación');
reset role;

-- ---------------------------------------------------------------------------
-- Respuesta: una por turno, marcada como del asistente.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
select message_id as r1 from public.assistant_reply(:'t1', 'El lavado exprés cuesta $280 en Coyoacán.') \gset
select pg_temp.assert((select message_id from public.assistant_reply(:'t1', 'otro texto')) = :'r1'::uuid,
  'una sola respuesta por turno (reintento devuelve la misma)');
select from public.finish_outbound_message(:'r1', 'wamid.out1', null);
select from public.assistant_finish_turn(:'t1', 'respondido', 1200, 80, 900, 300, '[{"tool": "consultar_servicios"}]', null);
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert((select sent_by_bot::text || ':' || status || ':' || coalesce(sent_by_name, '-')
                         from public.conversation_messages(:'cv') where id = :'r1') = 'true:enviado:-',
  'la bandeja muestra la respuesta enviada marcada como del asistente');
select pg_temp.assert((select bot_status || ':' || turns || ':' || last_turn_status from public.conversation_assistant(:'cv'))
                      = 'activo:1:respondido',
  'la bandeja ve el estado del asistente y su último turno');
reset role;

-- Varios mensajes seguidos: sólo contesta el más reciente.
select pg_temp.as_service();
select pg_temp.inbound('wamid.2', '5215511112222', '¿y mañana a qué hora?', now() - interval '1 minute') as m2 \gset
select (public.assistant_begin_turn(:'m2') ->> 'turn_id') as t2 \gset
select pg_temp.inbound('wamid.3', '5215511112222', 'en la tarde', now()) as m3 \gset
select pg_temp.assert((select superseded from public.assistant_reply(:'t2', 'Mañana tenemos...')),
  'si llegó otro mensaje mientras pensaba, no responde');
select pg_temp.assert((select status from public.bot_turns where id = :'t2') = 'omitido', 'y el turno queda omitido');
select (public.assistant_begin_turn(:'m3') ->> 'turn_id') as t3 \gset
select pg_temp.assert(:'t3' is not null and (select (public.assistant_begin_turn(:'m2') ->> 'skip')) = 'mensaje ya atendido',
  'el turno del mensaje más reciente sí responde');

-- ---------------------------------------------------------------------------
-- Escalamiento a una persona.
-- ---------------------------------------------------------------------------
select pg_temp.assert((public.assistant_handoff(:'t3', 'descuento', 'pide 50 %') ->> 'escalado')::boolean = false,
  'una regla desactivada no escala');
select public.assistant_handoff(:'t3', 'agendar', 'Quiere lavado exprés mañana 17:00 en Coyoacán') as h \gset
select pg_temp.assert((:'h'::jsonb ->> 'escalado')::boolean
  and :'h'::jsonb ->> 'mensaje' like '%confirmar su cita%',
  'escalar devuelve el mensaje para el cliente');
reset role;
select pg_temp.assert((select bot_status || ':' || pending || ':' || assigned_to || ':' || array_to_string(tags, ',')
                         from public.conversations where id = :'cv')
                      = 'pausado:true:00000000-0000-0000-0000-0000000000f2:asistente',
  'la conversación queda pendiente, asignada al responsable del centro y con el asistente pausado');
select pg_temp.assert((select body from public.conversation_notes where conversation_id = :'cv')
                      like 'Asistente: Quiere agendar una cita. Resumen: Quiere lavado exprés%'
  and (select author_id is null from public.conversation_notes where conversation_id = :'cv'),
  'deja una nota interna con el resumen');
select pg_temp.as_service();
select from public.assistant_finish_turn(:'t3', 'escalado', 10, 5, 0, 0, '[]', null);
select pg_temp.inbound('wamid.4', '5215511112222', '¿sigue ahí?', now()) as m4 \gset
select pg_temp.assert(public.assistant_begin_turn(:'m4') ->> 'skip' = 'asistente pausado en la conversación',
  'con el asistente pausado ya no responde');
reset role;

-- Una persona responde; luego reactiva el asistente.
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select from public.prepare_outbound_message(:'cv', gen_random_uuid(), 'Hola Ana, le confirmo a las 17:00.');
select from public.set_conversation_assistant(:'cv', true);
reset role;
select pg_temp.as_service();
select pg_temp.inbound('wamid.5', '5215511112222', 'gracias, ¿cuánto dura?', now()) as m5 \gset
select pg_temp.assert(public.assistant_begin_turn(:'m5') ? 'turn_id',
  'reactivado: la respuesta humana anterior ya no lo detiene');
reset role;
-- En la prueba todo ocurre en la misma transacción (mismo now()): la reactivación fue antes.
update public.conversations set bot_resumed_at = now() - interval '1 minute' where id = :'cv';
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select from public.prepare_outbound_message(:'cv', gen_random_uuid(), 'Dura una hora.');
reset role;
select pg_temp.as_service();
select pg_temp.inbound('wamid.6', '5215511112222', 'perfecto', now()) as m6 \gset
select pg_temp.assert(public.assistant_begin_turn(:'m6') ->> 'skip' = 'la conversación la atiende una persona',
  'si una persona responde, el asistente no contesta');
select pg_temp.assert((select bot_status || ':' || bot_paused_reason from public.conversations where id = :'cv')
                      = 'pausado:Atendida por una persona',
  'y se pausa solo en esa conversación');
reset role;

-- ---------------------------------------------------------------------------
-- Baja de promociones por WhatsApp.
-- ---------------------------------------------------------------------------
update public.conversations set client_id = 'c1000000-0000-0000-0000-000000000001' where id = :'cv';
update public.clients set marketing_opt_in = true, marketing_channels = array['email', 'whatsapp'], marketing_opt_in_at = now(),
                          marketing_opt_in_source = 'web'
 where id = 'c1000000-0000-0000-0000-000000000001';
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select from public.set_conversation_assistant(:'cv', true);
reset role;
select pg_temp.as_service();
select pg_temp.inbound('wamid.7', '5215511112222', 'BAJA', now()) as m7 \gset
select (public.assistant_begin_turn(:'m7') ->> 'turn_id') as t7 \gset
select from public.assistant_opt_out(:'t7');
reset role;
select pg_temp.assert((select marketing_opt_out_at is not null from public.conversations where id = :'cv')
  and (select array_to_string(marketing_channels, ',') from public.clients where id = 'c1000000-0000-0000-0000-000000000001') = 'email'
  and (select not opted_in and source = 'whatsapp' from public.contact_preferences
        where client_id = 'c1000000-0000-0000-0000-000000000001' and channel = 'whatsapp'),
  'la baja queda en la conversación y retira el consentimiento de WhatsApp del cliente (con origen whatsapp)');

-- ---------------------------------------------------------------------------
-- Indicadores (sin datos personales; el contador también).
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert((select count(*) from public.assistant_metrics(array[:'A', :'B']::uuid[], current_date - 1, current_date + 1)) = 0,
  'el contador de A no ve indicadores de B');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert((select answered || ':' || handed_off || ':' || skipped || ':' || input_tokens || ':' || (handoffs ->> 'agendar')
                         from public.assistant_metrics(array[:'A', :'B']::uuid[], current_date - 1, current_date + 1)
                        where detail_center_id = :'B') = '1:1:1:1210:1',
  'indicadores: respondidos, escalados, omitidos, tokens y escalamientos por motivo');
select pg_temp.assert_fails(format($$select public.delete_assistant_faq(%L, %L, 'Borrar')$$, :'O2', :'faq'), '42501',
  'el admin no borra respuestas de otra organización');
select from public.delete_assistant_faq(:'O1', :'faq', 'Ya no aplica');
select pg_temp.assert((select count(*) from public.list_assistant_faqs(:'O1')) = 1, 'el admin borra una respuesta');
reset role;

rollback;
