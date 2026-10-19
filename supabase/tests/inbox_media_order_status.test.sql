-- Fotos y archivos de WhatsApp en la bandeja y estado de la OS para el cliente
-- (asistente F2, parte 3): el webhook guarda el archivo de Meta, sólo el
-- servidor registra la descarga, la bandeja del centro lo lee (el contador y
-- otros centros no), la recepción sube y envía fotos con las mismas reglas que
-- el texto, y el asistente ve las órdenes en curso del cliente sin montos.
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

create function pg_temp.n(q text) returns bigint language plpgsql as $$
declare r bigint;
begin
  execute 'select count(*) from (' || q || ') s' into r;
  return r;
end $$;

create function pg_temp.inbound(ext text, body text, item jsonb default '{}') returns uuid
language plpgsql as $$
declare
  r jsonb;
begin
  r := public.ingest_inbound_messages('whatsapp', '1234567890', jsonb_build_array(
    jsonb_build_object('external_id', ext, 'contact_id', '5215512345678', 'contact_phone', '5215512345678',
                       'contact_name', 'Laura', 'body', body, 'message_type', 'text', 'occurred_at', now()) || item));
  return (r -> 'messages' -> 0 ->> 'message_id')::uuid;
end $$;

grant execute on all functions in schema pg_temp to authenticated, anon, service_role;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'corp@o1'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000f2', 'operador@b'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@a');
insert into public.organizations (id, slug, name) values ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Org uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro Polanco', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro Coyoacán', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'contador');

\set O1 '0e000000-0000-0000-0000-000000000001'
\set A 'aaaaaaaa-0000-0000-0000-000000000000'

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.upsert_channel_account(:'O1', null, :'A', 'whatsapp', '1234567890', 'WhatsApp central', true, 'Número central')).id as wa \gset
reset role;
select pg_temp.as_service();
select from public.record_channel_verification(:'wa', true, '+52 55 0000 0000', null);

-- ---------------------------------------------------------------------------
-- Foto entrante: el webhook guarda el archivo de Meta; el servidor la descarga.
-- ---------------------------------------------------------------------------
select public.ingest_inbound_messages('whatsapp', '1234567890', jsonb_build_array(jsonb_build_object(
  'external_id', 'wamid.f1', 'contact_id', '5215512345678', 'contact_phone', '5215512345678', 'message_type', 'image',
  'body', 'Así quedó el cofre', 'media_id', '1234567890123', 'media_mime_type', 'image/jpeg; charset=binary',
  'occurred_at', now()))) as ing \gset
select (:'ing'::jsonb -> 'messages' -> 0 ->> 'message_id') as photo \gset
select conversation_id as cv from public.messages where id = :'photo' \gset
select pg_temp.assert((:'ing'::jsonb -> 'messages' -> 0 ->> 'has_media')::boolean
  and (select media_id || ':' || media_mime_type from public.messages where id = :'photo') = '1234567890123:image/jpeg',
  'el webhook guarda el id y el tipo del archivo de Meta y avisa que hay que descargarlo');
select pg_temp.assert_fails(format($$select public.record_message_media(%L, 'otra-org/x/y.jpg', 'image/jpeg', 100, null)$$, :'photo'),
  '22023', 'la ruta debe ser de la organización y la conversación del mensaje');
select from public.record_message_media(:'photo', :'O1' || '/' || :'cv' || '/' || :'photo' || '.jpg', 'image/jpeg', 2048, null);
reset role;
insert into storage.objects (bucket_id, name) values ('inbox-media', :'O1' || '/' || :'cv' || '/' || :'photo' || '.jpg');

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails(format($$select public.record_message_media(%L, null, null, null, 'x')$$, :'photo'), '42501',
  'sólo el servidor registra la descarga');
select pg_temp.assert((select media_path from public.conversation_messages(:'cv') where id = :'photo') = :'O1' || '/' || :'cv' || '/' || :'photo' || '.jpg'
  and pg_temp.n($$select 1 from storage.objects where bucket_id = 'inbox-media'$$) = 1,
  'la recepción del centro ve la foto en el hilo y puede leer el archivo');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(pg_temp.n($$select 1 from storage.objects where bucket_id = 'inbox-media'$$) = 0,
  'el contador no lee los archivos de la bandeja');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert(pg_temp.n($$select 1 from storage.objects where bucket_id = 'inbox-media'$$) = 0,
  'otro centro no lee los archivos de la bandeja');
reset role;
select pg_temp.as_service();
select pg_temp.inbound('wamid.f2', '', '{"message_type": "document", "media_id": "9876", "media_filename": "factura.pdf"}') as doc \gset
select from public.record_message_media(:'doc', null, 'application/pdf', null, 'Archivo de más de 16 MB');
reset role;
select pg_temp.assert((select media_path is null and media_error = 'Archivo de más de 16 MB' and media_filename = 'factura.pdf'
                         from public.messages where id = :'doc'),
  'si la descarga no se puede, queda el motivo y el nombre del archivo');

-- ---------------------------------------------------------------------------
-- Foto saliente desde la bandeja.
-- ---------------------------------------------------------------------------
select gen_random_uuid() as file1 \gset
select gen_random_uuid() as req1 \gset
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails(format($$insert into storage.objects (bucket_id, name) values ('inbox-media', '%s/%s/nota.pdf')$$, :'O1', :'cv'),
  '42501', 'la recepción sólo sube fotos con nombre aleatorio');
select pg_temp.assert_fails(format($$select public.prepare_outbound_media(%L, %L, '%s/%s/%s.jpg', 'Así quedó', null)$$, :'cv', :'req1', :'O1', :'cv', :'file1'),
  '22023', 'no se envía una foto que no se subió');
insert into storage.objects (bucket_id, name) values ('inbox-media', :'O1' || '/' || :'cv' || '/' || :'file1' || '.jpg');
select * from public.prepare_outbound_media(:'cv', :'req1', :'O1' || '/' || :'cv' || '/' || :'file1' || '.jpg', 'Así quedó su auto', null) \gset out_
select pg_temp.assert(:'out_media_mime_type' = 'image/jpeg' and :'out_body' = 'Así quedó su auto' and :'out_already_sent' = 'f'
  and (select message_type || ':' || status || ':' || (sent_by = '00000000-0000-0000-0000-0000000000f1')::text
         from public.messages where id = :'out_message_id') = 'image:pendiente:true',
  'la foto queda pendiente con su texto, de quien la envía');
select pg_temp.assert((select message_id from public.prepare_outbound_media(:'cv', :'req1', :'O1' || '/' || :'cv' || '/' || :'file1' || '.jpg', 'otra', null)) = :'out_message_id'::uuid,
  'un doble envío devuelve la misma foto');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert_fails(format($$insert into storage.objects (bucket_id, name) values ('inbox-media', '%s/%s/%s.jpg')$$, :'O1', :'cv', gen_random_uuid()),
  '42501', 'otro centro no sube fotos a la conversación');
reset role;
update public.conversations set last_inbound_at = now() - interval '2 days' where id = :'cv';
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select gen_random_uuid() as file2 \gset
insert into storage.objects (bucket_id, name) values ('inbox-media', :'O1' || '/' || :'cv' || '/' || :'file2' || '.jpg');
select pg_temp.assert_fails(format($$select public.prepare_outbound_media(%L, gen_random_uuid(), '%s/%s/%s.jpg', null, null)$$, :'cv', :'O1', :'cv', :'file2'),
  'MG002', 'fuera de las 24 h no se envían fotos');
reset role;

-- ---------------------------------------------------------------------------
-- Estado de la OS para el asistente.
-- ---------------------------------------------------------------------------
update public.conversations set last_inbound_at = now() where id = :'cv';
select set_config('app.change_reason', 'Datos de prueba', false);
insert into public.clients (id, organization_id, home_detail_center_id, kind, full_name, phone, request_id, created_in_detail_center_id)
values ('c1000000-0000-0000-0000-000000000001', :'O1', :'A', 'person', 'Laura Pérez', '+525512345678', gen_random_uuid(), :'A');
insert into public.vehicles (id, organization_id, client_id, make, model, year, plate, created_in_detail_center_id)
values ('c2000000-0000-0000-0000-000000000001', :'O1', 'c1000000-0000-0000-0000-000000000001', 'Mazda', '3', 2021, 'ABC123', :'A');
insert into public.service_orders (id, organization_id, detail_center_id, folio, folio_number, client_id, vehicle_id, client_name,
                                   vehicle_make, vehicle_model, vehicle_year, vehicle_plate, request_id, status, promised_at)
values ('50000000-0000-0000-0000-000000000001', :'O1', :'A', 'A-01-000001', 1, 'c1000000-0000-0000-0000-000000000001',
        'c2000000-0000-0000-0000-000000000001', 'Laura Pérez', 'Mazda', '3', 2021, 'ABC123', gen_random_uuid(), 'abierta',
        now() + interval '3 hours'),
       ('50000000-0000-0000-0000-000000000002', :'O1', :'A', 'A-01-000002', 2, 'c1000000-0000-0000-0000-000000000001',
        'c2000000-0000-0000-0000-000000000001', 'Laura Pérez', 'Mazda', '3', 2021, 'ABC123', gen_random_uuid(), 'abierta', null);
set session_replication_role = replica;
update public.service_orders set status = 'terminada' where id = '50000000-0000-0000-0000-000000000001';
update public.service_orders set status = 'entregada', delivered_at = now() - interval '10 days'
 where id = '50000000-0000-0000-0000-000000000002';
set session_replication_role = origin;
select set_config('app.change_reason', '', false);
-- Asistente activo y reactivado en la conversación (antes respondió una persona con la foto).
update public.bot_settings set mode = 'activo' where organization_id = :'O1';
update public.conversations set bot_status = 'activo', bot_paused_at = null, bot_paused_reason = null, bot_resumed_at = now()
 where id = :'cv';
select pg_temp.as_service();
select (public.assistant_begin_turn(pg_temp.inbound('wamid.q2', '¿Ya está mi coche?')) ->> 'turn_id') as t1 \gset
select public.assistant_client_profile(:'t1') -> 'ordenes' as ords \gset
select pg_temp.assert(jsonb_array_length(:'ords'::jsonb) = 1
  and (:'ords'::jsonb -> 0 ->> 'folio') = 'A-01-000001'
  and (:'ords'::jsonb -> 0 ->> 'estado') = 'Listo para entregar'
  and (:'ords'::jsonb -> 0 ->> 'listo_para_entregar')::boolean
  and (:'ords'::jsonb -> 0 ->> 'auto') = 'Mazda 3 2021 · ABC123'
  and (:'ords'::jsonb -> 0) ? 'hora_promesa'
  and not (:'ords'::jsonb::text ~ 'total|precio|saldo'),
  'el asistente ve la OS en curso del cliente por su teléfono: folio, estado, auto, promesa; sin montos ni OS viejas');
reset role;

rollback;
