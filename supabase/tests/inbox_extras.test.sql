-- Pruebas de los pendientes de la bandeja (CR2): triaje, notas internas,
-- respuestas rápidas, respuestas sin duplicar y plantillas de WhatsApp
-- (sólo el servidor las sincroniza; aprobadas; marketing con consentimiento).
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

-- Cuenta verificada y una conversación de 3 h (ventana abierta) y otra de 2 días (cerrada).
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.upsert_channel_account(:'O1', null, :'A', 'whatsapp', '1234567890', 'WhatsApp A', true, 'Alta del número')).id as wa \gset
reset role;
select pg_temp.as_service();
select from public.record_channel_verification(:'wa', true, '+52 55 1111 2222', null);
select from public.ingest_inbound_messages('whatsapp', '1234567890', jsonb_build_array(
  jsonb_build_object('external_id', 'wamid.1', 'contact_id', '5215511112222', 'contact_phone', '5215511112222',
                     'contact_name', 'Ana Ruiz', 'body', 'Hola', 'occurred_at', now() - interval '3 hours'),
  jsonb_build_object('external_id', 'wamid.2', 'contact_id', '5215533334444', 'contact_phone', '5215533334444',
                     'contact_name', 'Beto Sol', 'body', 'Info', 'occurred_at', now() - interval '2 days')));
reset role;
select id as cv1 from public.conversations where contact_external_id = '5215511112222' \gset
select id as cv2 from public.conversations where contact_external_id = '5215533334444' \gset

-- ---------------------------------------------------------------------------
-- Triaje: prioridad, etiquetas y pendiente.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select from public.set_conversation_triage(:'cv1', (select version from public.conversations where id = :'cv1'), 'alta',
  array['Pulido', 'cotizar', 'pulido', ' '], true);
select pg_temp.assert((select priority || ':' || array_to_string(tags, ',') || ':' || pending from public.conversations where id = :'cv1')
                      = 'alta:cotizar,pulido:true',
  'triaje: prioridad alta, etiquetas en minúsculas sin repetir y marcada pendiente');
select pg_temp.assert((select count(*) from public.list_conversations(array[:'A']::uuid[], null, p_pending => true)) = 1
  and (select count(*) from public.list_conversations(array[:'A']::uuid[], null, p_tag => 'pulido')) = 1
  and (select id from public.list_conversations(array[:'A']::uuid[], null) limit 1) = :'cv1'::uuid,
  'la bandeja filtra por pendiente y etiqueta y pone primero la prioridad alta');
select pg_temp.assert_fails(format($$select public.set_conversation_triage(%L, (select version from public.conversations where id = %L), 'urgente', '{}', false)$$, :'cv1', :'cv1'),
  '22023', 'prioridad inválida rechazada');
select pg_temp.assert_fails(format($$select public.set_conversation_triage(%L, (select version from public.conversations where id = %L), 'normal', array['<script>'], false)$$, :'cv1', :'cv1'),
  'MG002', 'etiquetas sólo con letras, números, espacios o guiones');
reset role;

-- ---------------------------------------------------------------------------
-- Notas internas: nunca se envían ni se editan.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select gen_random_uuid() as rq \gset
select from public.add_conversation_note(:'cv1', :'rq', 'Pidió precio de pulido; esperar foto del auto');
select from public.add_conversation_note(:'cv1', :'rq', 'Pidió precio de pulido; esperar foto del auto');
select pg_temp.assert((select count(*) from public.conversation_notes_list(:'cv1')) = 1
  and (select author_name from public.conversation_notes_list(:'cv1')) = 'Fer Recepción'
  and (select count(*) from public.messages where conversation_id = :'cv1' and direction = 'saliente') = 0,
  'la nota interna queda una sola vez, con autor, y no crea ningún mensaje al cliente');
select pg_temp.assert((select notes from public.list_conversations(array[:'A']::uuid[], null) where id = :'cv1') = 1,
  'la bandeja cuenta las notas de la conversación');
select pg_temp.assert_fails('update public.conversation_notes set body = ''x''', '42501', 'las notas no se editan desde la API');
reset role;
select pg_temp.assert_fails('update public.conversation_notes set body = ''x''', 'MG002', 'ni siquiera con privilegios: las notas no se editan');

-- ---------------------------------------------------------------------------
-- Respuestas rápidas.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails(format($$select public.upsert_quick_reply(%L, null, null, %L, 'Horario', 'Abrimos de 9 a 7', true, 'Alta')$$, :'O1', :'A'),
  '42501', 'la recepción no administra respuestas rápidas');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails(format($$select public.upsert_quick_reply(%L, null, null, %L, 'Precio', 'Hola {nombre}, cuesta {precio}', true, 'Alta')$$, :'O1', :'A'),
  'MG002', 'las respuestas rápidas no admiten marcadores inventados como {precio}');
select (public.upsert_quick_reply(:'O1', null, null, :'A', 'Horario', 'Hola {nombre}, en {centro} abrimos de 9:00 a 19:00.', true, 'Alta')).id as qr \gset
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert((select title || ':' || can_manage from public.list_quick_replies(:'O1', :'A')) = 'Horario:false',
  'la recepción usa las respuestas rápidas de su centro sin poder editarlas');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert((select count(*) from public.list_quick_replies(:'O1', :'B')) = 0,
  'otro centro no ve las respuestas rápidas del centro A');
reset role;

-- ---------------------------------------------------------------------------
-- Respuestas sin duplicar entre usuarios.
-- ---------------------------------------------------------------------------
select last_message_at as seen from public.conversations where id = :'cv1' \gset
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select from public.prepare_outbound_message(:'cv1', gen_random_uuid(), 'Hola Ana, te comparto precios', :'seen'::timestamptz);
reset role;
select pg_temp.as_service();
select from public.finish_outbound_message((select id from public.messages where conversation_id = :'cv1' and direction = 'saliente'), 'wamid.out1', null);
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails(format($$select public.prepare_outbound_message(%L, gen_random_uuid(), 'Hola Ana, ¿en qué te ayudo?', %L::timestamptz)$$, :'cv1', :'seen'),
  '40001', 'si otra persona respondió mientras escribías, el segundo envío se detiene y pide revisar');
select pg_temp.assert((select count(*) from public.messages where conversation_id = :'cv1' and direction = 'saliente') = 1,
  'sólo queda una respuesta');
reset role;

-- ---------------------------------------------------------------------------
-- Plantillas de WhatsApp.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(public.can_sync_whatsapp_templates(:'O1'), 'el admin puede pedir la sincronización');
select pg_temp.assert_fails(format($$select public.record_whatsapp_templates(%L, '1029384756', '[]')$$, :'O1'),
  '42501', 'sólo el servidor registra las plantillas que devuelve Meta');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert(not public.can_sync_whatsapp_templates(:'O1'), 'el encargado no sincroniza plantillas');
reset role;
select pg_temp.as_service();
select from public.record_whatsapp_templates(:'O1', '1029384756', jsonb_build_array(
  jsonb_build_object('name', 'recordatorio_cita', 'language', 'es_MX', 'category', 'UTILITY', 'status', 'APPROVED',
                     'body', 'Hola {{1}}, te esperamos el {{2}}.', 'param_count', 2),
  jsonb_build_object('name', 'promo_pulido', 'language', 'es_MX', 'category', 'MARKETING', 'status', 'APPROVED',
                     'body', 'Hola {{1}}, este mes hay pulido.', 'param_count', 1),
  jsonb_build_object('name', 'en_revision', 'language', 'es_MX', 'category', 'UTILITY', 'status', 'PENDING',
                     'body', 'Hola', 'param_count', 0)));
reset role;
select id as t_util from public.whatsapp_templates where name = 'recordatorio_cita' \gset
select id as t_mkt from public.whatsapp_templates where name = 'promo_pulido' \gset
select id as t_pend from public.whatsapp_templates where name = 'en_revision' \gset

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails(format($$select public.prepare_outbound_message(%L, gen_random_uuid(), 'Hola Beto')$$, :'cv2'),
  'MG002', 'fuera de 24 h no se envía texto libre');
select pg_temp.assert_fails(format($$select public.prepare_template_message(%L, gen_random_uuid(), %L, '{}')$$, :'cv2', :'t_pend'),
  'MG002', 'una plantilla en revisión no se envía');
select pg_temp.assert_fails(format($$select public.prepare_template_message(%L, gen_random_uuid(), %L, array['Beto'])$$, :'cv2', :'t_mkt'),
  'MG002', 'plantilla de marketing sin consentimiento de WhatsApp: no se envía');
select pg_temp.assert_fails(format($$select public.prepare_template_message(%L, gen_random_uuid(), %L, array['Beto'])$$, :'cv2', :'t_util'),
  '22023', 'la plantilla exige exactamente sus datos');
select body as tbody, template_name as tname, template_language as tlang
  from public.prepare_template_message(:'cv2', gen_random_uuid(), :'t_util', array['Beto', '05/10 a las 10:00']) \gset
select pg_temp.assert(:'tbody' = 'Hola Beto, te esperamos el 05/10 a las 10:00.' and :'tname' = 'recordatorio_cita' and :'tlang' = 'es_MX',
  'plantilla de utilidad aprobada: se prepara fuera de 24 h con el texto que verá el cliente');
select pg_temp.assert((select message_type || ':' || status from public.messages where conversation_id = :'cv2' and direction = 'saliente') = 'template:pendiente',
  'queda como mensaje de plantilla pendiente de envío por el servidor');
reset role;
select pg_temp.as_service();
select from public.record_whatsapp_templates(:'O1', '1029384756', jsonb_build_array(
  jsonb_build_object('name', 'recordatorio_cita', 'language', 'es_MX', 'category', 'UTILITY', 'status', 'PAUSED',
                     'body', 'Hola {{1}}, te esperamos el {{2}}.', 'param_count', 2)));
reset role;
select pg_temp.assert((select count(*) from public.whatsapp_templates) = 1
  and (select status from public.whatsapp_templates) = 'PAUSED',
  'la sincronización refleja lo que dice Meta: pausada y las borradas desaparecen');
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert((select count(*) from public.list_whatsapp_templates(:'O1')) = 0
  and (select count(*) from public.conversation_notes) = 0,
  'el contador no ve plantillas ni notas');
reset role;
select pg_temp.assert((select count(*) from public.audit_log where table_name in ('public.quick_replies', 'public.conversations')) >= 2,
  'respuestas rápidas y triaje quedan en auditoría');

rollback;
