-- Asistente de WhatsApp (ADR 0045): el número del contacto se lee en E.164 (un
-- número extranjero no se confunde con un cliente mexicano), límites de turnos
-- por conversación y de presupuesto por organización, y como máximo dos citas
-- futuras agendadas por conversación.
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

-- Mensaje entrante de otro número (contact_phone en E.164 sin «+», como lo manda Meta).
create function pg_temp.inbound_from(phone text, ext text, body text) returns uuid language plpgsql as $$
declare
  r jsonb;
begin
  r := public.ingest_inbound_messages('whatsapp', '1234567890', jsonb_build_array(
    jsonb_build_object('external_id', ext, 'contact_id', phone, 'contact_phone', phone, 'contact_name', 'Contacto',
                       'body', body, 'message_type', 'text', 'occurred_at', now())));
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
-- Número del contacto
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  private.whatsapp_phone('+5215512345678') = '+525512345678'
  and private.whatsapp_phone('5215512345678') = '+525512345678'
  and private.whatsapp_phone('+525512345678') = '+525512345678'
  and private.whatsapp_phone('+4771234567') = '+4771234567'
  and private.whatsapp_phone('+6561234567') = '+6561234567'
  and private.whatsapp_phone('+12025550123') = '+12025550123'
  and private.whatsapp_phone('123') is null,
  'el 521 de México se normaliza; un número extranjero de 10 dígitos se conserva (no se lee como de México)');
insert into public.clients (id, organization_id, home_detail_center_id, kind, full_name, phone, request_id, created_in_detail_center_id)
values ('c1000000-0000-0000-0000-000000000047', :'O1', :'A', 'person', 'Cliente de León', '+524771234567',
        'c1000000-0000-0000-0000-0000000000b7', :'A');
select pg_temp.as_service();
select pg_temp.inbound_from('4771234567', 'wamid.no1', 'Hola') as mno \gset
reset role;
select pg_temp.assert(
  private.conversation_client((select conversation_id from public.messages where id = :'mno')) is null,
  'un contacto de Noruega (+47 71234567) no se identifica como el cliente de León (+52 477 123 4567)');

-- ---------------------------------------------------------------------------
-- Límite de turnos por conversación
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
select from (select pg_temp.turn('wamid.l' || g, 'Mensaje ' || g) from generate_series(1, 12) g) s;
select pg_temp.assert(
  public.assistant_begin_turn(pg_temp.inbound('wamid.l13', 'Mensaje 13')) ->> 'skip' = 'límite de mensajes por conversación',
  'el turno 13 en una hora no se atiende');
reset role;
select pg_temp.assert(
  (select bot_status = 'pausado' and bot_paused_reason = 'Límite de mensajes del asistente'
     from public.conversations where contact_external_id = '5215511112222'),
  'la conversación se pausa para que la atienda una persona');

-- ---------------------------------------------------------------------------
-- Presupuesto diario por organización
-- ---------------------------------------------------------------------------
-- La conversación vuelve a estar activa y sus turnos se dan por viejos.
update public.bot_turns set started_at = now() - interval '2 hours';
select from set_config('app.change_reason', 'Prueba', true);
update public.conversations set bot_status = 'activo', bot_paused_reason = null, bot_paused_at = null,
       bot_resumed_at = now() where contact_external_id = '5215511112222';
select from set_config('app.change_reason', '', true);
update public.bot_turns set input_tokens = 6000000, started_at = now() - interval '1 hour'
 where id = (select id from public.bot_turns order by started_at limit 1);
select pg_temp.as_service();
select pg_temp.assert(
  public.assistant_begin_turn(pg_temp.inbound('wamid.b1', 'Hola')) ->> 'skip' = 'presupuesto diario del asistente agotado',
  'con 6 millones de tokens en 24 h el asistente deja de responder en la organización');
reset role;
select pg_temp.assert(
  (select bot_status = 'activo' from public.conversations where contact_external_id = '5215511112222'),
  'agotar el presupuesto no pausa la conversación');
update public.bot_turns set started_at = now() - interval '2 days';

-- ---------------------------------------------------------------------------
-- Como máximo dos citas futuras por conversación
-- ---------------------------------------------------------------------------
create function pg_temp.book(n integer, hour text) returns jsonb language plpgsql as $$
declare
  t uuid;
  p uuid;
  m uuid;
begin
  t := pg_temp.turn('wamid.k' || n, 'Quiero una cita');
  p := (public.assistant_propose_booking(t, 'aaaaaaaa-0000-0000-0000-000000000000',
          array['5e000000-0000-0000-0000-000000000001']::uuid[],
          (now() at time zone 'America/Mexico_City')::date + 2, hour, 'Laura Pérez',
          null, 'Mazda', '3', 2021, null) ->> 'propuesta_id')::uuid;
  perform public.assistant_reply_proposal(t, p);
  perform public.assistant_finish_turn(t, 'respondido', 1, 1, 0, 0, '[]', null);
  m := pg_temp.inbound('wamid.kc' || n, 'Confirmar', 'cita:confirmar:' || p);
  return public.assistant_handle_button(m);
end $$;
grant execute on function pg_temp.book(integer, text) to service_role;
select pg_temp.as_service();
select pg_temp.assert(pg_temp.book(1, '10:00') -> 'reply' ->> 'body' like 'Listo, su cita quedó agendada%',
  'primera cita agendada');
select pg_temp.assert(pg_temp.book(2, '12:00') -> 'reply' ->> 'body' like 'Listo, su cita quedó agendada%',
  'segunda cita agendada');
select pg_temp.assert(pg_temp.book(3, '14:00') -> 'reply' ->> 'body' like '%le atiende una persona%',
  'la tercera cita futura se rechaza: un número no llena la agenda');
reset role;
select pg_temp.assert(
  (select count(*) = 2 from public.appointments where source = 'whatsapp' and status = 'programada'),
  'quedan sólo dos citas programadas desde WhatsApp');

rollback;
