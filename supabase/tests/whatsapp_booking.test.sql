-- Citas desde WhatsApp (asistente F2, parte 1): el asistente propone y el
-- cliente confirma con un botón. Cubre: validación del horario en la base
-- (horario del centro, anticipación, bahías), alta de cliente y auto (placa
-- opcional) al confirmar, idempotencia del botón, horario ganado por otro,
-- reagendar, cancelar, «Cambiar», propuestas vencidas, agenda propia apagada,
-- sólo la llave de servicio, lectura por centro y la OS que exige placa.
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

-- Como assert_fails, pero además revisa el texto del error.
create function pg_temp.assert_fails_like(stmt text, expected_state text, pattern text, msg text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate = expected_state and sqlerrm like pattern then
      raise notice 'ok - %', msg;
      return;
    end if;
    raise exception 'FALLÓ: % (SQLSTATE %: %)', msg, sqlstate, sqlerrm;
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
  perform set_config('app.change_reason', '', true);
  execute 'set local role service_role';
end $$;

-- Mensaje entrante (webhook firmado); payload = id del botón que tocó el contacto.
create function pg_temp.inbound(ext text, body text, payload text default null) returns uuid
language plpgsql as $$
declare
  r jsonb;
begin
  r := public.ingest_inbound_messages('whatsapp', '1234567890', jsonb_build_array(
    jsonb_build_object('external_id', ext, 'contact_id', '5215511112222', 'contact_phone', '5215511112222',
                       'contact_name', 'Laura', 'body', body, 'payload', payload,
                       'message_type', case when payload is null then 'text' else 'interactive' end,
                       'occurred_at', now())));
  return (r -> 'messages' -> 0 ->> 'message_id')::uuid;
end $$;

-- Abre un turno del asistente para un mensaje nuevo.
create function pg_temp.turn(ext text, body text) returns uuid language plpgsql as $$
begin
  return (public.assistant_begin_turn(pg_temp.inbound(ext, body)) ->> 'turn_id')::uuid;
end $$;

grant execute on all functions in schema pg_temp to authenticated, anon, service_role;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'corp@o1'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@a'),
  ('00000000-0000-0000-0000-0000000000a2', 'corp@o2');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Org uno'),
  ('0e000000-0000-0000-0000-000000000002', 'org-dos', 'Org dos');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro Polanco', 'America/Mexico_City'),
  ('cccccccc-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000002', 'C-01', 'Centro ajeno', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio'),
  ('0e000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a2', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'contador');

\set O1 '0e000000-0000-0000-0000-000000000001'
\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set LAV '5e000000-0000-0000-0000-000000000001'
\set CER '5e000000-0000-0000-0000-000000000002'

insert into public.services (id, organization_id, code, name, revenue_engine, standard_duration_minutes, base_price, standard_direct_cost)
values (:'LAV', :'O1', 'LAV-EXP', 'Lavado exprés', 'recurrente', 60, 250, 40),
       (:'CER', :'O1', 'CER-PRO', 'Cerámico profesional', 'premium', 480, 9500, 2500);
insert into public.bays (organization_id, detail_center_id, name) values (:'O1', :'A', 'Bahía 1'), (:'O1', :'A', 'Bahía 2');
insert into public.clients (id, organization_id, home_detail_center_id, kind, full_name, phone, request_id, created_in_detail_center_id)
values ('c1000000-0000-0000-0000-000000000009', :'O1', :'A', 'person', 'Otro Cliente', '+525599990000',
        'c1000000-0000-0000-0000-0000000000a9', :'A');
insert into public.vehicles (id, organization_id, client_id, make, model, year, plate, created_in_detail_center_id)
values ('c2000000-0000-0000-0000-000000000009', :'O1', 'c1000000-0000-0000-0000-000000000009', 'Nissan', 'Versa', 2019, 'ZZZ999', :'A');

-- Asistente en modo prueba, horario 8:00-20:00 todos los días, cuenta central verificada.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select from public.update_assistant_settings(:'O1', 1, 'prueba', 'claude-opus-5-5', 'Asistente', 'Cordial', null, null, null, null,
  'colonia', 14, 2, true, true, array['5215511112222'], 'Modo prueba');
select from public.set_assistant_service(:'O1', :'CER', true, false, true, 'Cerámico con valoración');
select from public.set_center_public_info(:'A', null, 'Av. Masaryk 100', null, null, null, '{}', null,
  (select jsonb_agg(jsonb_build_object('weekday', d, 'opens', '08:00', 'closes', '20:00')) from generate_series(1, 7) d),
  'Horario');
select (public.upsert_channel_account(:'O1', null, :'A', 'whatsapp', '1234567890', 'WhatsApp central', true, 'Número central')).id as wa \gset
select pg_temp.assert((select self_booking from public.get_assistant_settings(:'O1')),
  'la agenda propia del asistente viene encendida y la configuración la muestra');
reset role;
select pg_temp.as_service();
select from public.record_channel_verification(:'wa', true, '+52 55 0000 0000', null);
reset role;

select ((now() at time zone 'America/Mexico_City')::date + 2) as day2 \gset

-- ---------------------------------------------------------------------------
-- Proponer: la base valida todo antes de mostrar el resumen.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
select pg_temp.turn('wamid.1', 'Quiero lavado pasado mañana a las 10') as t1 \gset
select pg_temp.assert(public.assistant_client_profile(:'t1') -> 'cliente' = 'null'::jsonb,
  'perfil: el número todavía no es cliente');
select pg_temp.assert(public.assistant_propose_booking(:'t1', :'A', array[:'LAV']::uuid[], :'day2', '10:00', 'Laura Pérez',
                        null, 'Mazda', '3', null, null) ->> 'error' like '%año%',
  'sin año del auto no hay propuesta');
select pg_temp.assert(public.assistant_propose_booking(:'t1', :'A', array[:'LAV']::uuid[], :'day2', '10:00', 'Laura Pérez',
                        null, 'Mazda', '3', 2021, 'A-1') ->> 'error' like 'Placa inválida%',
  'una placa mal escrita se rechaza');
select pg_temp.assert(public.assistant_propose_booking(:'t1', :'A', array[:'LAV']::uuid[], :'day2', '10:00', 'Laura Pérez',
                        null, 'Mazda', '3', 2021, 'zzz-999') ->> 'error' like '%otro cliente%',
  'una placa de otro cliente no se usa');
select pg_temp.assert(public.assistant_propose_booking(:'t1', :'A', array[:'CER']::uuid[], :'day2', '10:00', 'Laura Pérez',
                        null, 'Mazda', '3', 2021, null) ->> 'error' like '%valoración%',
  'un servicio con valoración no se agenda solo');
select pg_temp.assert(public.assistant_propose_booking(:'t1', :'A', array[:'LAV']::uuid[], :'day2', '19:30', 'Laura Pérez',
                        null, 'Mazda', '3', 2021, null) ->> 'error' like 'Fuera del horario%',
  'el servicio debe terminar antes del cierre');
select pg_temp.assert(public.assistant_propose_booking(:'t1', :'A', array[:'LAV']::uuid[],
                        (now() at time zone 'America/Mexico_City')::date + 30, '10:00', 'Laura Pérez',
                        null, 'Mazda', '3', 2021, null) ->> 'error' like '%días adelante%',
  'no más allá de los días configurados');
select pg_temp.assert(public.assistant_propose_booking(:'t1', :'A', array[:'LAV']::uuid[], :'day2', '25:00', 'Laura Pérez',
                        null, 'Mazda', '3', 2021, null) ->> 'error' like '%inválida%',
  'hora inválida');
select public.assistant_propose_booking(:'t1', :'A', array[:'LAV']::uuid[], :'day2', '10:00', 'Laura Pérez',
  null, 'Mazda', '3', 2021, null) as prop1 \gset
select (:'prop1'::jsonb ->> 'propuesta_id') as p1 \gset
select pg_temp.assert(:'p1' is not null and (:'prop1'::jsonb ->> 'resumen') like '%Mazda 3 2021 · sin placa%'
  and (:'prop1'::jsonb ->> 'resumen') like '%Lavado exprés (60 min)%' and (:'prop1'::jsonb ->> 'resumen') like '%10:00%',
  'propuesta con resumen: centro, fecha local, servicio, auto sin placa y nombre');
select pg_temp.assert(not exists (select 1 from public.appointments where request_id = :'p1'),
  'proponer no crea la cita');

-- El resumen sale con botones (una respuesta por turno).
select message_id as r1, buttons as b1 from public.assistant_reply_proposal(:'t1', :'p1') \gset
select pg_temp.assert((select message_id from public.assistant_reply_proposal(:'t1', :'p1')) = :'r1'::uuid
  and (:'b1'::jsonb -> 0 ->> 'id') = 'cita:confirmar:' || :'p1' and (:'b1'::jsonb -> 1 ->> 'titulo') = 'Cambiar'
  and (select message_type || ':' || sent_by_bot from public.messages where id = :'r1') = 'interactive:true',
  'el resumen sale como mensaje interactivo con Confirmar y Cambiar, una sola vez');
select from public.finish_outbound_message(:'r1', 'wamid.out1', null);
select from public.assistant_finish_turn(:'t1', 'respondido', 1, 1, 0, 0, '[]', null);

-- ---------------------------------------------------------------------------
-- Confirmar con el botón: cliente, auto y cita en un paso.
-- ---------------------------------------------------------------------------
select pg_temp.inbound('wamid.2', 'Confirmar', 'cita:confirmar:' || :'p1') as m2 \gset
select public.assistant_handle_button(:'m2') as h2 \gset
select pg_temp.assert((:'h2'::jsonb ->> 'handled')::boolean and (:'h2'::jsonb -> 'reply' ->> 'body') like 'Listo, su cita quedó agendada%',
  'el botón Confirmar agenda y responde la confirmación');
select appointment_id as ap1 from public.bot_booking_proposals where id = :'p1' \gset
reset role;
select pg_temp.assert((select status || ':' || source || ':' || (bay_id is not null)::text || ':' || coalesce(created_by::text, '-')
                         from public.appointments where id = :'ap1') = 'programada:whatsapp:true:-'
  and (select count(*) from public.appointment_services where appointment_id = :'ap1') = 1,
  'la cita queda programada, de origen WhatsApp, con bahía asignada y sus servicios');
select pg_temp.assert((select c.full_name || ':' || c.phone || ':' || c.marketing_opt_in::text
                         from public.appointments a join public.clients c on c.id = a.client_id where a.id = :'ap1')
                      = 'Laura Pérez:+525511112222:false'
  and (select v.plate is null from public.appointments a join public.vehicles v on v.id = a.vehicle_id where a.id = :'ap1')
  and (select client_id from public.conversations where contact_external_id = '5215511112222')
      = (select client_id from public.appointments where id = :'ap1'),
  'alta del cliente con su teléfono normalizado (sin consentimiento de marketing), auto sin placa y conversación ligada');
select pg_temp.assert(exists (select 1 from public.audit_log where table_name = 'public.appointments' and record_id = :'ap1'
                                and reason = 'Cita confirmada por el cliente en WhatsApp')
  and exists (select 1 from public.conversation_notes where request_id = :'p1' and body like 'Asistente: el cliente confirmó%'),
  'queda en auditoría con su motivo y como nota interna para el equipo');
select pg_temp.as_service();
select public.assistant_handle_button(:'m2') as h2b \gset
select pg_temp.assert((:'h2b'::jsonb -> 'reply' ->> 'message_id') = (:'h2'::jsonb -> 'reply' ->> 'message_id')
  and (select count(*) from public.appointments where request_id = :'p1') = 1,
  'un reintento del mismo botón no duplica la cita ni la respuesta');
select pg_temp.inbound('wamid.3', 'Confirmar', 'cita:confirmar:' || :'p1') as m3 \gset
select pg_temp.assert(public.assistant_handle_button(:'m3') -> 'reply' ->> 'body' = 'Su cita ya quedó confirmada.',
  'tocar Confirmar otra vez sólo avisa que ya está confirmada');

-- ---------------------------------------------------------------------------
-- El perfil ya lo conoce; capacidad y horario ganado por otro.
-- ---------------------------------------------------------------------------
select pg_temp.turn('wamid.4', 'Y otra cita a las 10 para otro auto') as t2 \gset
select public.assistant_client_profile(:'t2') as prof \gset
select pg_temp.assert((:'prof'::jsonb -> 'cliente' ->> 'nombre') = 'Laura Pérez'
  and (:'prof'::jsonb -> 'vehiculos' -> 0 ->> 'descripcion') = 'Mazda 3 2021 · sin placa'
  and (:'prof'::jsonb -> 'citas' -> 0 ->> 'cita_id') = :'ap1',
  'perfil: nombre, autos y próximas citas del cliente');
reset role;
insert into public.appointments (organization_id, detail_center_id, client_id, vehicle_id, starts_at, duration_minutes, bay_id, request_id)
select :'O1', :'A', 'c1000000-0000-0000-0000-000000000009', 'c2000000-0000-0000-0000-000000000009',
       (:'day2'::date + time '10:00') at time zone 'America/Mexico_City', 60,
       (select id from public.bays where detail_center_id = :'A' and id <> (select bay_id from public.appointments where id = :'ap1')),
       gen_random_uuid();
select pg_temp.as_service();
select pg_temp.assert(public.assistant_propose_booking(:'t2', :'A', array[:'LAV']::uuid[], :'day2', '10:30', null,
                        null, 'Kia', 'Rio', 2020, 'XYZ123') ->> 'error' like 'Ese horario ya no está disponible%',
  'con las dos bahías ocupadas no se propone el horario');
select (public.assistant_propose_booking(:'t2', :'A', array[:'LAV']::uuid[], :'day2', '12:00', null,
  null, 'Kia', 'Rio', 2020, 'xyz-123') ->> 'propuesta_id') as p2 \gset
reset role;
insert into public.appointments (organization_id, detail_center_id, client_id, vehicle_id, starts_at, duration_minutes, bay_id, request_id)
select :'O1', :'A', 'c1000000-0000-0000-0000-000000000009', 'c2000000-0000-0000-0000-000000000009',
       (:'day2'::date + time '12:00') at time zone 'America/Mexico_City', 60, b.id, gen_random_uuid()
  from public.bays b where b.detail_center_id = :'A';
select pg_temp.as_service();
select pg_temp.inbound('wamid.5', 'Confirmar', 'cita:confirmar:' || :'p2') as m5 \gset
-- (La llamada va aparte: dentro de una misma consulta las subconsultas no ven sus cambios.)
select public.assistant_handle_button(:'m5') as h5 \gset
select pg_temp.assert((:'h5'::jsonb -> 'reply' ->> 'body') like 'Ese horario ya no está disponible.%otros horarios%'
  and (select status from public.bot_booking_proposals where id = :'p2') = 'fallida'
  and not exists (select 1 from public.vehicles where plate = 'XYZ123'),
  'si alguien ganó el horario antes de confirmar, no se agenda (ni se registra el auto) y ofrece otros');

-- ---------------------------------------------------------------------------
-- Reagendar, «Cambiar» y cancelar.
-- ---------------------------------------------------------------------------
select pg_temp.turn('wamid.6', 'Mejor muévela a las 15:00') as t3 \gset
select pg_temp.assert(public.assistant_propose_reschedule(:'t3', (select id from public.appointments where client_id = 'c1000000-0000-0000-0000-000000000009' limit 1),
                        :'day2', '15:00') ->> 'error' like 'Esa cita no es de este cliente%',
  'no se cambia la cita de otro cliente');
select (public.assistant_propose_reschedule(:'t3', :'ap1', :'day2', '15:00') ->> 'propuesta_id') as p3 \gset
select pg_temp.inbound('wamid.7', 'Confirmar', 'cita:confirmar:' || :'p3') as m7 \gset
select pg_temp.assert(public.assistant_handle_button(:'m7') -> 'reply' ->> 'body' like 'Listo, su cita quedó para el%15:00%',
  'el botón Confirmar reprograma');
reset role;
select pg_temp.assert(((select starts_at from public.appointments where id = :'ap1') at time zone 'America/Mexico_City')::time = '15:00'
  and exists (select 1 from public.audit_log where record_id = :'ap1' and reason = 'Reprogramada por el cliente en WhatsApp'),
  'la cita se movió en la base, con auditoría');
select pg_temp.as_service();
select pg_temp.turn('wamid.8', 'Cancélala') as t4 \gset
select (public.assistant_propose_cancel(:'t4', :'ap1') ->> 'propuesta_id') as p4 \gset
select pg_temp.inbound('wamid.9', 'No, mantenerla', 'cita:cambiar:' || :'p4') as m9 \gset
select public.assistant_handle_button(:'m9') as h9 \gset
select pg_temp.assert(not (:'h9'::jsonb ->> 'handled')::boolean
  and (select status from public.bot_booking_proposals where id = :'p4') = 'descartada'
  and (select status from public.appointments where id = :'ap1') = 'programada',
  '«No» descarta la propuesta y el asistente sigue la conversación');
select pg_temp.turn('wamid.10', 'Sí, cancélala') as t5 \gset
select (public.assistant_propose_cancel(:'t5', :'ap1') ->> 'propuesta_id') as p5 \gset
select pg_temp.assert((select buttons -> 0 ->> 'titulo' from public.assistant_reply_proposal(:'t5', :'p5')) = 'Sí, cancelar',
  'la cancelación pide confirmar con «Sí, cancelar»');
select pg_temp.inbound('wamid.11', 'Sí, cancelar', 'cita:confirmar:' || :'p5') as m11 \gset
select public.assistant_handle_button(:'m11') as h11 \gset
select pg_temp.assert((:'h11'::jsonb -> 'reply' ->> 'body') like 'Listo, su cita quedó cancelada%'
  and (select status from public.appointments where id = :'ap1') = 'cancelada',
  'el botón cancela la cita');

-- Vencida y propuesta más reciente.
select pg_temp.turn('wamid.12', 'Agéndame otra vez el lavado a las 11') as t6 \gset
select (public.assistant_propose_booking(:'t6', :'A', array[:'LAV']::uuid[], :'day2', '11:00', null, (select vehicle_id from public.appointments where id = :'ap1'),
  null, null, null, null) ->> 'propuesta_id') as p6 \gset
select (public.assistant_propose_booking(:'t6', :'A', array[:'LAV']::uuid[], :'day2', '13:00', null, (select vehicle_id from public.appointments where id = :'ap1'),
  null, null, null, null) ->> 'propuesta_id') as p7 \gset
select pg_temp.assert((select status from public.bot_booking_proposals where id = :'p6') = 'descartada',
  'una propuesta nueva deja sin efecto la anterior');
reset role;
update public.bot_booking_proposals set expires_at = now() - interval '1 minute' where id = :'p7';
select pg_temp.as_service();
select pg_temp.inbound('wamid.13', 'Confirmar', 'cita:confirmar:' || :'p7') as m13 \gset
select public.assistant_handle_button(:'m13') as h13 \gset
select pg_temp.assert((:'h13'::jsonb -> 'reply' ->> 'body') like 'Esa propuesta ya venció%'
  and (select status from public.bot_booking_proposals where id = :'p7') = 'vencida',
  'una propuesta vencida no agenda');
select pg_temp.inbound('wamid.14', 'hola') as m14 \gset
select pg_temp.assert(not (public.assistant_handle_button(:'m14') ->> 'handled')::boolean,
  'un mensaje normal no es un botón: lo atiende el asistente');

-- Agenda propia apagada: el asistente pasa a una persona.
reset role;
update public.bot_settings set self_booking = false where organization_id = :'O1';
select pg_temp.as_service();
select pg_temp.turn('wamid.15', 'Agéndame') as t7 \gset
select pg_temp.assert(public.assistant_propose_booking(:'t7', :'A', array[:'LAV']::uuid[], :'day2', '16:00', 'Laura', null,
                        'Mazda', '3', 2021, null) ->> 'error' like '%pasar_a_persona%',
  'con la agenda propia apagada no propone: pasa a una persona');
reset role;

-- ---------------------------------------------------------------------------
-- Permisos y lectura.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails(format($$select public.assistant_handle_button(%L)$$, :'m2'), '42501',
  'una sesión de usuario no confirma botones');
select pg_temp.assert_fails(format($$select public.assistant_propose_booking(%L, %L, '{}', null, null, null, null, null, null, null, null)$$, :'t7', :'A'),
  '42501', 'ni propone citas');
select pg_temp.assert((select count(*) from public.bot_booking_proposals) = 7,
  'la recepción del centro ve lo que propuso el asistente');
select pg_temp.assert((select source || ':' || vehicle_label from public.list_appointments(:'A', :'day2') where id = :'ap1')
                      = 'whatsapp:Mazda 3 2021 · sin placa',
  'la agenda marca el origen WhatsApp y el auto sin placa');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert((select count(*) from public.bot_booking_proposals) = 0, 'el contador no ve las propuestas');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select pg_temp.assert((select count(*) from public.bot_booking_proposals) = 0, 'otra organización no ve las propuestas');
reset role;
select pg_temp.assert_fails(format($$update public.messages set payload = 'otro' where id = %L$$, :'m2'), '42501',
  'el botón que tocó el contacto no se edita');

-- ---------------------------------------------------------------------------
-- La OS exige placa: la recepción la captura y después abre la OS.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
select pg_temp.turn('wamid.16', 'Agéndame') as t8 \gset
reset role;
update public.bot_settings set self_booking = true where organization_id = :'O1';
select pg_temp.as_service();
select (public.assistant_propose_booking(:'t8', :'A', array[:'LAV']::uuid[], :'day2', '16:00', null,
  (select vehicle_id from public.appointments where id = :'ap1'), null, null, null, null) ->> 'propuesta_id') as p8 \gset
select pg_temp.inbound('wamid.17', 'Confirmar', 'cita:confirmar:' || :'p8') as m17 \gset
select from public.assistant_handle_button(:'m17');
select appointment_id as ap2 from public.bot_booking_proposals where id = :'p8' \gset
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails_like(format($$select public.receive_and_open_order(%L, gen_random_uuid())$$, :'ap2'), '22023',
  'Captura la placa%', 'sin placa no se abre la OS (mensaje claro) y la cita sigue programada');
select pg_temp.assert((select status from public.appointments where id = :'ap2') = 'programada', 'nada quedó a medias');
select from public.update_vehicle((select vehicle_id from public.appointments where id = :'ap2'), 'Mazda', '3', 2021, 'mzd-321', null, null, true,
  'Placa capturada en recepción');
select pg_temp.assert((public.receive_and_open_order(:'ap2', gen_random_uuid())).vehicle_plate = 'MZD321',
  'con la placa capturada la OS se abre y la copia');
reset role;

rollback;
