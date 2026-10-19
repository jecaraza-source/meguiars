-- Recordatorios de cita por WhatsApp (asistente F2, parte 2): configuración
-- (sólo admin, plantilla de utilidad aprobada con 3 datos y 2 botones), qué
-- citas tocan (horas antes, anticipación mínima, sin repetir), mensaje de
-- plantilla en la conversación del cliente (la crea si no existe), botón
-- «Confirmar» sin IA y sólo para el cliente de la cita, «Reagendar» al asistente.
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

-- Mensaje entrante de un contacto (webhook firmado); payload = botón tocado.
create function pg_temp.inbound(ext text, contact text, body text, payload text default null) returns uuid
language plpgsql as $$
declare
  r jsonb;
begin
  r := public.ingest_inbound_messages('whatsapp', '1234567890', jsonb_build_array(
    jsonb_build_object('external_id', ext, 'contact_id', contact, 'contact_phone', contact, 'body', body,
                       'payload', payload, 'message_type', case when payload is null then 'text' else 'button' end,
                       'occurred_at', now())));
  return (r -> 'messages' -> 0 ->> 'message_id')::uuid;
end $$;

grant execute on all functions in schema pg_temp to authenticated, anon, service_role;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'corp@o1'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a');
insert into public.organizations (id, slug, name) values ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Org uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro Polanco', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion');

\set O1 '0e000000-0000-0000-0000-000000000001'
\set A 'aaaaaaaa-0000-0000-0000-000000000000'

select set_config('app.change_reason', 'Datos de prueba', false);
insert into public.clients (id, organization_id, home_detail_center_id, kind, full_name, phone, request_id, created_in_detail_center_id)
values ('c1000000-0000-0000-0000-000000000001', :'O1', :'A', 'person', 'Laura Pérez', '+525512345678',
        'c1000000-0000-0000-0000-0000000000a1', :'A');
insert into public.client_centers (client_id, detail_center_id, organization_id)
values ('c1000000-0000-0000-0000-000000000001', :'A', :'O1');
insert into public.vehicles (id, organization_id, client_id, make, model, year, plate, created_in_detail_center_id)
values ('c2000000-0000-0000-0000-000000000001', :'O1', 'c1000000-0000-0000-0000-000000000001', 'Mazda', '3', 2021, 'ABC123', :'A');
-- 1: en 20 h, agendada hace 2 días (toca) · 2: en 30 h (todavía no) · 3: en 10 h pero agendada hace 1 h
-- (aviso muy corto: no toca) · 4: en 20 h, cancelada (no toca).
insert into public.appointments (id, organization_id, detail_center_id, client_id, vehicle_id, starts_at, duration_minutes,
                                 request_id, created_at, status)
values ('a0000000-0000-0000-0000-000000000001', :'O1', :'A', 'c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001',
        date_trunc('hour', now()) + interval '20 hours', 60, gen_random_uuid(), now() - interval '2 days', 'programada'),
       ('a0000000-0000-0000-0000-000000000002', :'O1', :'A', 'c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001',
        date_trunc('hour', now()) + interval '30 hours', 60, gen_random_uuid(), now() - interval '2 days', 'programada'),
       ('a0000000-0000-0000-0000-000000000003', :'O1', :'A', 'c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001',
        date_trunc('hour', now()) + interval '10 hours', 60, gen_random_uuid(), now() - interval '1 hour', 'programada'),
       ('a0000000-0000-0000-0000-000000000004', :'O1', :'A', 'c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001',
        date_trunc('hour', now()) + interval '21 hours', 60, gen_random_uuid(), now() - interval '2 days', 'cancelada');
select set_config('app.change_reason', '', false);

-- Cuenta central verificada y plantillas sincronizadas desde Meta.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.upsert_channel_account(:'O1', null, :'A', 'whatsapp', '1234567890', 'WhatsApp central', true, 'Número central')).id as wa \gset
reset role;
select pg_temp.as_service();
select from public.record_channel_verification(:'wa', true, '+52 55 0000 0000', null);
select from public.record_whatsapp_templates(:'O1', '1000000001', '[
  {"name": "recordatorio_cita", "language": "es_MX", "category": "UTILITY", "status": "APPROVED",
   "body": "Hola {{1}}, le recordamos su cita el {{2}} en {{3}}. ¿Nos confirma?", "param_count": 3, "quick_replies": 2},
  {"name": "sin_botones", "language": "es_MX", "category": "UTILITY", "status": "APPROVED",
   "body": "Hola {{1}}, cita {{2}} en {{3}}", "param_count": 3, "quick_replies": 0},
  {"name": "promo", "language": "es_MX", "category": "MARKETING", "status": "APPROVED",
   "body": "Hola {{1}} {{2}} {{3}}", "param_count": 3, "quick_replies": 2}]');
reset role;
select id as tpl from public.whatsapp_templates where name = 'recordatorio_cita' \gset
select id as tpl_sin from public.whatsapp_templates where name = 'sin_botones' \gset
select id as tpl_mkt from public.whatsapp_templates where name = 'promo' \gset

-- ---------------------------------------------------------------------------
-- Configuración.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert((select quick_reply_count from public.list_whatsapp_templates(:'O1') where id = :'tpl') = 2,
  'las plantillas guardan cuántos botones tienen');
select pg_temp.assert_fails(format($$select public.set_assistant_reminders(%L, 1, true, %L, 24, 'Encender')$$, :'O1', :'tpl'), '42501',
  'la recepción no configura recordatorios');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert_fails(format($$select public.set_assistant_reminders(%L, 1, true, null, 24, 'Encender')$$, :'O1'), 'MG002',
  'encender exige una plantilla');
select pg_temp.assert_fails(format($$select public.set_assistant_reminders(%L, 1, true, %L, 24, 'Encender')$$, :'O1', :'tpl_sin'), 'MG002',
  'la plantilla debe tener los 2 botones');
select pg_temp.assert_fails(format($$select public.set_assistant_reminders(%L, 1, true, %L, 24, 'Encender')$$, :'O1', :'tpl_mkt'), 'MG002',
  'una plantilla de marketing no sirve de recordatorio');
select from public.set_assistant_reminders(:'O1', 1, true, :'tpl', 24, 'Recordatorios 24 h antes');
select pg_temp.assert((select reminders_enabled::text || ':' || reminder_hours || ':' || (reminder_template_id = :'tpl')::text
                         from public.get_assistant_settings(:'O1')) = 'true:24:true'
  and exists (select 1 from public.audit_log where table_name = 'public.bot_settings' and reason = 'Recordatorios 24 h antes'),
  'el admin enciende los recordatorios con auditoría');
select pg_temp.assert_fails('select * from public.reminders_due(10)', '42501', 'una sesión de usuario no lista recordatorios');
reset role;

-- ---------------------------------------------------------------------------
-- Qué citas tocan y el mensaje de plantilla.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
select pg_temp.assert((select array_agg(appointment_id) from public.reminders_due(10)) = array['a0000000-0000-0000-0000-000000000001']::uuid[],
  'sólo la cita programada dentro de las 24 h, agendada con anticipación');
select * from public.prepare_appointment_reminder('a0000000-0000-0000-0000-000000000001') \gset rem_
select pg_temp.assert(:'rem_contact_external_id' = '5215512345678' and :'rem_template_name' = 'recordatorio_cita'
  and :'rem_template_params' like '{Laura,%,"Centro Polanco"}'
  and :'rem_button_payloads' = '{recordatorio:confirmar:a0000000-0000-0000-0000-000000000001,recordatorio:reagendar:a0000000-0000-0000-0000-000000000001}'
  and :'rem_body' like 'Hola Laura, le recordamos su cita el % en Centro Polanco.%',
  'plantilla con nombre, fecha local y centro, y los botones con la cita');
select pg_temp.assert((select message_id from public.prepare_appointment_reminder('a0000000-0000-0000-0000-000000000001')) = :'rem_message_id'::uuid
  and not exists (select 1 from public.reminders_due(10)),
  'un recordatorio por cita: repetir devuelve el mismo y ya no aparece pendiente');
reset role;
select pg_temp.assert((select client_id::text || ':' || status || ':' || contact_phone from public.conversations
                        where id = (select conversation_id from public.messages where id = :'rem_message_id'))
                      = 'c1000000-0000-0000-0000-000000000001:cerrada:+525512345678'
  and (select message_type || ':' || sent_by_bot from public.messages where id = :'rem_message_id') = 'template:true',
  'crea la conversación de WhatsApp del cliente (ligada) con el recordatorio');

-- ---------------------------------------------------------------------------
-- Botones del recordatorio.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
select from public.finish_outbound_message(:'rem_message_id', 'wamid.rem1', null);
select pg_temp.inbound('wamid.c1', '5215512345678', 'Confirmar', 'recordatorio:confirmar:a0000000-0000-0000-0000-000000000001') as mc \gset
select public.assistant_handle_button(:'mc') as hc \gset
select pg_temp.assert((:'hc'::jsonb ->> 'handled')::boolean and (:'hc'::jsonb -> 'reply' ->> 'body') like 'Gracias por confirmar. Le esperamos el %',
  '«Confirmar» responde sin IA');
reset role;
select pg_temp.assert((select confirmed_at is not null from public.appointments where id = 'a0000000-0000-0000-0000-000000000001')
  and exists (select 1 from public.audit_log where record_id = 'a0000000-0000-0000-0000-000000000001'
                and reason = 'El cliente confirmó su asistencia en el recordatorio de WhatsApp'),
  'la cita queda confirmada por el cliente, con auditoría');
select pg_temp.as_service();
select public.assistant_handle_button(:'mc') as hc2 \gset
select pg_temp.assert((:'hc2'::jsonb -> 'reply' ->> 'message_id') = (:'hc'::jsonb -> 'reply' ->> 'message_id'),
  'un reintento del webhook devuelve la misma respuesta');
select pg_temp.inbound('wamid.r1', '5215512345678', 'Reagendar', 'recordatorio:reagendar:a0000000-0000-0000-0000-000000000001') as mr \gset
select pg_temp.assert(not (public.assistant_handle_button(:'mr') ->> 'handled')::boolean,
  '«Reagendar» lo atiende el asistente');
select pg_temp.inbound('wamid.x1', '5219990001111', 'Confirmar', 'recordatorio:confirmar:a0000000-0000-0000-0000-000000000002') as mx \gset
select public.assistant_handle_button(:'mx') as hx \gset
reset role;
select pg_temp.assert(not (:'hx'::jsonb ->> 'handled')::boolean
  and (select confirmed_at is null from public.appointments where id = 'a0000000-0000-0000-0000-000000000002'),
  'otro número no confirma una cita ajena');

-- La agenda muestra la confirmación.
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert((select confirmed_at is not null and reminder_sent_at is not null
                         from public.list_appointments(:'A', ((now() + interval '20 hours') at time zone 'America/Mexico_City')::date)
                        where id = 'a0000000-0000-0000-0000-000000000001')
  or (select confirmed_at is not null and reminder_sent_at is not null
        from public.list_appointments(:'A', ((date_trunc('hour', now()) + interval '20 hours') at time zone 'America/Mexico_City')::date)
       where id = 'a0000000-0000-0000-0000-000000000001'),
  'la agenda muestra el recordatorio enviado y la confirmación del cliente');
reset role;

-- Apagados: no hay pendientes.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select from public.set_assistant_reminders(:'O1', (select version from public.get_assistant_settings(:'O1')), false, :'tpl', 24, 'Apagar');
reset role;
update public.appointments set reminder_sent_at = null where id = 'a0000000-0000-0000-0000-000000000002';
update public.appointments set starts_at = date_trunc('hour', now()) + interval '22 hours'
 where id = 'a0000000-0000-0000-0000-000000000002';
select pg_temp.as_service();
select pg_temp.assert(not exists (select 1 from public.reminders_due(10)), 'con los recordatorios apagados no hay pendientes');
reset role;

rollback;
