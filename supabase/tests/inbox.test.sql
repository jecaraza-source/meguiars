-- Pruebas de CR2 (fase 2): cuentas oficiales sin secretos, webhook sólo por la
-- llave de servicio (sin duplicados por reintentos), bandeja por centro,
-- ventana de 24 h, envío en dos pasos (preparar / resultado del servidor),
-- estados que no retroceden, prospecto desde la conversación y aislamiento.
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

grant execute on all functions in schema pg_temp to authenticated, anon, service_role;

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
insert into public.profiles (id, full_name) values
  ('00000000-0000-0000-0000-0000000000f1', 'Fer Recepción')
on conflict (id) do update set full_name = excluded.full_name;

\set O1 '0e000000-0000-0000-0000-000000000001'
\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set B 'bbbbbbbb-0000-0000-0000-000000000000'

-- ---------------------------------------------------------------------------
-- Cuentas oficiales: sólo el admin; nunca se marcan verificadas a mano.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails(format($$select public.upsert_channel_account(%L, null, %L, 'whatsapp', '1234567890', 'WhatsApp A', true, 'Alta')$$, :'O1', :'A'),
  '42501', 'el encargado no conecta cuentas oficiales');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.upsert_channel_account(:'O1', null, :'A', 'whatsapp', '1234567890', 'WhatsApp A', true, 'Alta del número')).id as wa \gset
select (public.upsert_channel_account(:'O1', null, :'A', 'instagram', '178414000000001', 'Instagram A', true, 'Alta de la cuenta')).id as ig \gset
select pg_temp.assert((select status from public.channel_accounts where id = :'wa') = 'pendiente',
  'una cuenta nueva queda pendiente hasta verificarla con Meta');
select pg_temp.assert_fails(format($$select public.upsert_channel_account(%L, null, %L, 'whatsapp', '1234567890', 'Otra', true, 'Alta')$$, :'O1', :'A'),
  'MG002', 'la misma cuenta no se registra dos veces');
select pg_temp.assert_fails(format($$select public.record_channel_verification(%L, true, 'Meguiars', null)$$, :'wa'),
  '42501', 'un usuario no puede marcar la cuenta como verificada (sólo el servidor tras consultar a Meta)');
select pg_temp.assert_fails($$update public.channel_accounts set status = 'verificada'$$, '42501',
  'la tabla de cuentas no se edita directamente');
select pg_temp.assert((select count(*) from information_schema.columns
  where table_schema = 'public' and table_name = 'channel_accounts'
    and column_name ~ '(token|secret|password)') = 0, 'la tabla de cuentas no tiene columnas de secretos');
reset role;

select pg_temp.as_service();
select public.record_channel_verification(:'wa', true, '+52 55 1111 2222', null);
select public.record_channel_verification(:'ig', false, null, 'Token inválido (#190)');
reset role;
select pg_temp.assert((select status || ':' || verified_name from public.channel_accounts where id = :'wa') = 'verificada:+52 55 1111 2222',
  'el servidor marca verificada la cuenta tras consultarla en Meta');
select pg_temp.assert((select status || ':' || last_verify_error from public.channel_accounts where id = :'ig') = 'error:Token inválido (#190)',
  'un error de verificación queda visible con su causa');
select pg_temp.assert((select count(*) from public.audit_log where table_name = 'public.channel_accounts' and record_id = :'wa') >= 2,
  'alta y verificación de la cuenta quedan en auditoría');

-- ---------------------------------------------------------------------------
-- Webhook: sólo la llave de servicio; reintentos no duplican.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.ingest_inbound_messages('whatsapp', '1234567890', '[]')$$, '42501',
  'un usuario no puede inyectar mensajes entrantes');
reset role;

select pg_temp.as_service();
select public.ingest_inbound_messages('whatsapp', '1234567890', jsonb_build_array(
  jsonb_build_object('external_id', 'wamid.1', 'contact_id', '5215511112222', 'contact_phone', '5215511112222',
                     'contact_name', 'Ana Ruiz', 'message_type', 'text', 'body', 'Hola, ¿precio del lavado manual?',
                     'occurred_at', now() - interval '2 hours'),
  jsonb_build_object('external_id', 'wamid.2', 'contact_id', '5215511112222', 'message_type', 'image',
                     'occurred_at', now() - interval '1 hour'))) as r1 \gset
select public.ingest_inbound_messages('whatsapp', '1234567890', jsonb_build_array(
  jsonb_build_object('external_id', 'wamid.1', 'contact_id', '5215511112222', 'body', 'Hola, ¿precio del lavado manual?'))) as r2 \gset
select public.ingest_inbound_messages('whatsapp', '999999', jsonb_build_array(
  jsonb_build_object('external_id', 'wamid.x', 'contact_id', '5215500000000', 'body', 'x'))) as r3 \gset
reset role;
select pg_temp.assert((:'r1'::jsonb ->> 'inserted')::int = 2 and (:'r2'::jsonb ->> 'duplicates')::int = 1,
  'dos mensajes entran; el reintento del mismo wamid no se duplica');
select pg_temp.assert(:'r3'::jsonb ->> 'ignored' = 'cuenta no registrada',
  'un número que no está registrado se ignora');
select id as conv from public.conversations where contact_external_id = '5215511112222' \gset
select pg_temp.assert((select detail_center_id = :'A' and contact_phone = '+5215511112222' and contact_name = 'Ana Ruiz'
                              and unread_count = 2 and last_message_preview = '[image]' from public.conversations where id = :'conv'),
  'la conversación llega al centro de la cuenta con teléfono, nombre y 2 no leídos');
select pg_temp.assert((select last_webhook_at is not null from public.channel_accounts where id = :'wa'),
  'la cuenta registra el último webhook recibido');

-- ---------------------------------------------------------------------------
-- Bandeja por centro y permisos.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert((select count(*) from public.list_conversations(array[:'A', :'B']::uuid[])) = 0,
  'recepción de otro centro no ve la conversación');
select pg_temp.assert((select count(*) from public.conversation_messages(:'conv')) = 0,
  'ni sus mensajes');
select pg_temp.assert_fails(format($$select * from public.prepare_outbound_message(%L, gen_random_uuid(), 'hola')$$, :'conv'),
  '42501', 'ni puede responder');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert((select count(*) from public.conversations) = 0 and (select count(*) from public.messages) = 0,
  'el contador no lee mensajes (datos personales)');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert((select window_open and unread_count = 2 from public.list_conversations(array[:'A']::uuid[]) where id = :'conv'),
  'recepción del centro ve la conversación con la ventana de 24 h abierta');
select pg_temp.assert((select string_agg(direction || ':' || coalesce(body, message_type), '|' order by occurred_at)
                         from public.conversation_messages(:'conv')) = 'entrante:Hola, ¿precio del lavado manual?|entrante:image',
  'el hilo muestra los mensajes en orden');
select pg_temp.assert((select unread_count from public.conversations where id = :'conv') = 0,
  'abrir el hilo marca los mensajes como leídos');
select version as cv from public.conversations where id = :'conv' \gset
select public.assign_conversation(:'conv', :'cv', '00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert((select assigned_name from public.list_conversations(array[:'A']::uuid[]) where id = :'conv') = 'Fer Recepción',
  'la conversación se asigna a quien la atiende');
select pg_temp.assert_fails(format($$select public.assign_conversation(%L, %s, '00000000-0000-0000-0000-0000000000c1')$$, :'conv', :'cv' + 1),
  'MG002', 'no se asigna a quien no atiende prospectos (contador)');
select pg_temp.assert_fails(format($$select public.assign_conversation(%L, %s, null)$$, :'conv', :'cv'),
  '40001', 'la versión evita pisar un cambio hecho en otro dispositivo');

-- Prospecto desde la conversación (sin recapturar canal ni teléfono).
select (public.create_lead_from_conversation(:'conv', :'cv' + 1, gen_random_uuid(), 'Ana Ruiz')).id as lead \gset
select pg_temp.assert((select source_channel || ':' || phone || ':' || owner_id::text from public.leads where id = :'lead')
                      = 'whatsapp:+5215511112222:00000000-0000-0000-0000-0000000000f1',
  'el prospecto nace con canal WhatsApp, el teléfono de la conversación y quien atiende como responsable');
select pg_temp.assert((select lead_id from public.conversations where id = :'conv') = :'lead'::uuid,
  'la conversación queda ligada al prospecto');

-- Responder: preparar (usuario) y resultado (servidor).
select message_id as m1 from public.prepare_outbound_message(:'conv', 'e2000000-0000-0000-0000-000000000001', 'Hola Ana, cuesta $450') \gset
select pg_temp.assert((select status from public.messages where id = :'m1') = 'pendiente',
  'el mensaje queda pendiente hasta que el servidor lo envía');
select pg_temp.assert((select message_id = :'m1'::uuid from public.prepare_outbound_message(:'conv', 'e2000000-0000-0000-0000-000000000001', 'Hola Ana, cuesta $450')),
  'reintentar con el mismo request_id no crea otro mensaje');
select pg_temp.assert_fails(format($$select public.finish_outbound_message(%L, 'wamid.out1', null)$$, :'m1'),
  '42501', 'el usuario no puede marcar su mensaje como enviado');
reset role;
select pg_temp.as_service();
select public.finish_outbound_message(:'m1', 'wamid.out1', null);
reset role;
select pg_temp.assert((select status || ':' || external_id from public.messages where id = :'m1') = 'enviado:wamid.out1',
  'el servidor registra el envío con el id de Meta');
select pg_temp.assert((select first_contact_at is not null from public.leads where id = :'lead')
                      and (select s.milestone from public.leads l join public.lead_stages s on s.id = l.stage_id where l.id = :'lead') = 'contactado',
  'la primera respuesta cuenta como primer contacto y el prospecto avanza a Contactado');
select pg_temp.assert((select actor_id from public.lead_events where lead_id = :'lead' and kind = 'contacto') = '00000000-0000-0000-0000-0000000000f1',
  'el historial del prospecto registra a quien respondió');

-- Estados de entrega: nunca retroceden.
select pg_temp.as_service();
select public.ingest_message_statuses('whatsapp', jsonb_build_array(
  jsonb_build_object('external_id', 'wamid.out1', 'status', 'leido'),
  jsonb_build_object('external_id', 'wamid.out1', 'status', 'entregado')));
reset role;
select pg_temp.assert((select status from public.messages where id = :'m1') = 'leido',
  'un «entregado» que llega tarde no regresa un mensaje leído');
select pg_temp.assert_fails(format($$update public.messages set body = 'otro' where id = %L$$, :'m1'), '42501',
  'el texto de un mensaje no se edita');

-- Falla del envío.
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select message_id as m2 from public.prepare_outbound_message(:'conv', gen_random_uuid(), 'Segundo mensaje') \gset
reset role;
select pg_temp.as_service();
select public.finish_outbound_message(:'m2', null, '(#131047) Re-engagement message');
reset role;
select pg_temp.assert((select status || ':' || error from public.messages where id = :'m2') = 'fallido:(#131047) Re-engagement message',
  'un envío rechazado por Meta queda como fallido con su causa');

-- Ventana de 24 h cerrada y cuenta no verificada.
update public.conversations set last_inbound_at = now() - interval '25 hours' where id = :'conv';
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert((select not window_open from public.list_conversations(array[:'A']::uuid[]) where id = :'conv'),
  'pasadas 24 h la ventana se muestra cerrada');
select pg_temp.assert_fails(format($$select * from public.prepare_outbound_message(%L, gen_random_uuid(), 'hola')$$, :'conv'),
  'MG002', 'fuera de la ventana de 24 h no se envía texto libre');
reset role;
select pg_temp.as_service();
select public.ingest_inbound_messages('instagram', '178414000000001', jsonb_build_array(
  jsonb_build_object('external_id', 'mid.ig1', 'contact_id', '7001', 'body', '¿Tienen cita el sábado?')));
reset role;
select id as igconv from public.conversations where contact_external_id = '7001' \gset
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails(format($$select * from public.prepare_outbound_message(%L, gen_random_uuid(), 'hola')$$, :'igconv'),
  'MG002', 'con la cuenta en error (no verificada) no se envía');
select pg_temp.assert_fails(format($$select public.create_lead_from_conversation(%L, 1, gen_random_uuid(), 'Contacto IG')$$, :'igconv'),
  '22023', 'Instagram no comparte teléfono: el prospecto pide el usuario de redes');
select pg_temp.assert((public.create_lead_from_conversation(:'igconv', 1, gen_random_uuid(), 'Contacto IG', '@contacto')).source_channel = 'instagram',
  'con el @usuario el prospecto se registra con canal Instagram');

-- Cerrar y reabrir por mensaje nuevo.
select version as iv from public.conversations where id = :'igconv' \gset
select public.set_conversation_status(:'igconv', :'iv', 'cerrada');
reset role;
select pg_temp.as_service();
select public.ingest_inbound_messages('instagram', '178414000000001', jsonb_build_array(
  jsonb_build_object('external_id', 'mid.ig2', 'contact_id', '7001', 'body', '¿Siguen ahí?')));
reset role;
select pg_temp.assert((select status || ':' || unread_count from public.conversations where id = :'igconv') = 'abierta:1',
  'un mensaje nuevo reabre la conversación cerrada');
select pg_temp.assert((select count(*) from public.audit_log where table_name = 'public.conversations' and record_id = :'igconv') >= 2,
  'los cambios de la conversación quedan en auditoría');

-- Cuenta desactivada: el webhook no crea conversaciones.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select version as wv from public.channel_accounts where id = :'wa' \gset
select public.upsert_channel_account(:'O1', :'wa', :'A', 'whatsapp', '1234567890', 'WhatsApp A', false, 'Pausa');
reset role;
select pg_temp.as_service();
select public.ingest_inbound_messages('whatsapp', '1234567890', jsonb_build_array(
  jsonb_build_object('external_id', 'wamid.9', 'contact_id', '5215599990000', 'body', 'hola'))) as r4 \gset
reset role;
select pg_temp.assert(:'r4'::jsonb ->> 'ignored' = 'cuenta desactivada'
                      and not exists (select 1 from public.conversations where contact_external_id = '5215599990000'),
  'una cuenta desactivada no recibe conversaciones');

rollback;
