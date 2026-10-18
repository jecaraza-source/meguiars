-- Historial de conversaciones: búsqueda por cliente (palabras en cualquier
-- orden, sin acentos) y por teléfono (cualquier formato), con el mismo acceso
-- que la bandeja.
\set ON_ERROR_STOP on
begin;

create function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
  raise notice 'ok - %', msg;
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
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'contador'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion');

\set O1 '0e000000-0000-0000-0000-000000000001'
\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set B 'bbbbbbbb-0000-0000-0000-000000000000'

-- Dos contactos en el centro A: Ana (hoy, dos mensajes) y Beto (hace 10 días, atendido).
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.upsert_channel_account(:'O1', null, :'A', 'whatsapp', '1234567890', 'WhatsApp A', true, 'Alta del número')).id as wa \gset
reset role;
select pg_temp.as_service();
select from public.record_channel_verification(:'wa', true, '+52 55 1111 2222', null);
select from public.ingest_inbound_messages('whatsapp', '1234567890', jsonb_build_array(
  jsonb_build_object('external_id', 'wamid.1', 'contact_id', '5215511112222', 'contact_phone', '5215511112222',
                     'contact_name', 'Ana Ruíz López', 'body', 'Hola', 'occurred_at', now() - interval '2 hours'),
  jsonb_build_object('external_id', 'wamid.2', 'contact_id', '5215511112222', 'contact_phone', '5215511112222',
                     'contact_name', 'Ana Ruíz López', 'body', '¿Precio del pulido?', 'occurred_at', now() - interval '1 hours'),
  jsonb_build_object('external_id', 'wamid.3', 'contact_id', '5215533334444', 'contact_phone', '5215533334444',
                     'contact_name', 'Beto Sol', 'body', 'Info', 'occurred_at', now() - interval '10 days')));
reset role;
select id as ana from public.conversations where contact_external_id = '5215511112222' \gset
select id as beto from public.conversations where contact_external_id = '5215533334444' \gset
update public.conversations set status = 'cerrada', created_at = now() - interval '10 days',
       last_message_at = now() - interval '10 days' where id = :'beto';

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert((select count(*) from public.conversation_history(array[:'A']::uuid[])) = 2,
  'sin filtros muestra abiertas y atendidas');
select pg_temp.assert((select id from public.conversation_history(array[:'A']::uuid[]) limit 1) = :'ana'::uuid,
  'la más reciente primero');
select pg_temp.assert((select array_agg(id) from public.conversation_history(array[:'A']::uuid[], p_client => 'lopez ana')) = array[:'ana'::uuid],
  'cliente: todas las palabras en cualquier orden y sin acentos');
select pg_temp.assert((select count(*) from public.conversation_history(array[:'A']::uuid[], p_client => 'ana sol')) = 0,
  'cliente: deben coincidir todas las palabras');
select pg_temp.assert((select count(*) from public.conversation_history(array[:'A']::uuid[], p_phone => '55 1111 2222')) = 1
  and (select count(*) from public.conversation_history(array[:'A']::uuid[], p_phone => '+52 55 1111 2222')) = 1
  and (select count(*) from public.conversation_history(array[:'A']::uuid[], p_phone => '5215511112222')) = 1
  and (select count(*) from public.conversation_history(array[:'A']::uuid[], p_phone => '2222')) = 1,
  'teléfono: encuentra el número en cualquier formato (con o sin 52 y el 1 de WhatsApp)');
select pg_temp.assert((select messages_in || '/' || messages_out from public.conversation_history(array[:'A']::uuid[], p_phone => '1111 2222')) = '2/0',
  'cuenta los mensajes recibidos y enviados');
select pg_temp.assert((select array_agg(id) from public.conversation_history(array[:'A']::uuid[], p_status => 'cerrada')) = array[:'beto'::uuid],
  'filtra por estado');
select pg_temp.assert((select array_agg(id) from public.conversation_history(array[:'A']::uuid[], p_from => current_date - 3)) = array[:'ana'::uuid]
  and (select array_agg(id) from public.conversation_history(array[:'A']::uuid[], p_to => current_date - 5)) = array[:'beto'::uuid],
  'filtra por fechas (día local del centro)');
select pg_temp.assert((select count(*) from public.conversation_history(array[:'A']::uuid[], p_channel => 'messenger')) = 0,
  'filtra por canal');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert((select count(*) from public.conversation_history(array[:'A']::uuid[])) = 0,
  'quien no usa la bandeja (contador) no ve el historial');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert((select count(*) from public.conversation_history(array[:'A', :'B']::uuid[])) = 0,
  'otro centro no ve el historial del centro A');
reset role;

rollback;
