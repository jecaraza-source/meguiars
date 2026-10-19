-- Bandeja y asistente (F2, parte 3): fotos y archivos de WhatsApp en la bandeja
-- y estado de la OS para el cliente. Ver ADR 0040.
--
-- * messages.media_*: archivo del mensaje. Entrantes: el webhook guarda el id
--   de Meta y el servidor lo descarga al bucket privado inbox-media; salientes:
--   la persona sube la foto al mismo bucket y el servidor la envía con una URL
--   firmada de corta duración. Se leen sólo con URL firmadas.
-- * Ruta: <organización>/<conversación>/<mensaje o archivo>.<ext>. Las políticas
--   de storage.objects usan las mismas reglas que la bandeja (can_use_leads).
-- * assistant_client_profile agrega las órdenes de servicio en curso del
--   cliente (estado y folio; nunca montos).

-- ---------------------------------------------------------------------------
-- 1. Archivos de los mensajes
-- ---------------------------------------------------------------------------

alter table public.messages
  add column media_id text check (media_id is null or media_id ~ '^[A-Za-z0-9._-]{1,128}$'),
  add column media_mime_type text check (media_mime_type is null or length(media_mime_type) <= 100),
  add column media_filename text check (media_filename is null or length(media_filename) <= 200),
  add column media_path text check (media_path is null or length(media_path) <= 300),
  add column media_size integer check (media_size is null or media_size > 0),
  add column media_error text check (media_error is null or length(media_error) <= 300);
comment on column public.messages.media_path is 'Archivo en el bucket privado inbox-media (se lee con URL firmada).';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inbox-media', 'inbox-media', false, 16777216,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'audio/ogg', 'audio/mpeg', 'audio/mp4',
              'audio/aac', 'audio/amr', 'video/mp4', 'video/3gpp'])
on conflict (id) do nothing;

-- Quién lee un archivo de la bandeja: quien atiende la bandeja del centro actual de la conversación.
create function private.can_read_inbox_media(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
     where c.id::text = split_part(p_name, '/', 2)
       and c.organization_id::text = split_part(p_name, '/', 1)
       and private.can_use_leads(c.detail_center_id));
$$;

-- Quién sube: lo mismo, y sólo fotos con nombre <uuid>.jpg|png|webp (la recepción envía fotos).
create function private.can_upload_inbox_media(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
     and private.can_read_inbox_media(p_name);
$$;

create policy inbox_media_objects_select on storage.objects
  for select to authenticated
  using (bucket_id = 'inbox-media' and private.can_read_inbox_media(name));
create policy inbox_media_objects_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'inbox-media' and private.can_upload_inbox_media(name));

-- El servidor registra el archivo descargado de Meta (o por qué no se pudo).
create function public.record_message_media(
  p_message_id uuid, p_path text, p_mime_type text, p_size integer, p_error text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.messages;
begin
  if not private.is_service_request() then
    raise exception 'Sólo el servidor registra archivos de mensajes' using errcode = '42501';
  end if;
  select * into m from public.messages where id = p_message_id for update;
  if not found or m.direction <> 'entrante' or m.media_id is null then
    raise exception 'Mensaje sin archivo' using errcode = 'P0002';
  end if;
  if p_path is not null and p_path <> m.organization_id || '/' || m.conversation_id || '/' || split_part(p_path, '/', 3) then
    raise exception 'Ruta de archivo inválida' using errcode = '22023';
  end if;
  update public.messages
     set media_path = coalesce(media_path, p_path),
         media_mime_type = coalesce(nullif(left(split_part(p_mime_type, ';', 1), 100), ''), media_mime_type),
         media_size = coalesce(media_size, p_size),
         media_error = case when p_path is null then left(nullif(btrim(p_error), ''), 300) end
   where id = m.id;
end;
$$;

-- Deja «pendiente» una foto de la bandeja (ya subida por quien responde) y
-- devuelve lo que el servidor necesita para enviarla. Mismas reglas que el
-- texto: permiso, cuenta verificada, ventana de 24 h y guarda contra duplicados.
create function public.prepare_outbound_media(
  p_conversation_id uuid,
  p_request_id uuid,
  p_path text,
  p_caption text,
  p_expected_last_message_at timestamptz default null
)
returns table (
  message_id uuid,
  channel text,
  external_account_id text,
  contact_external_id text,
  contact_phone text,
  body text,
  media_path text,
  media_mime_type text,
  already_sent boolean
)
language plpgsql security definer set search_path = '' as $$
declare
  c public.conversations;
  a public.channel_accounts;
  m public.messages;
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  v_mime text;
begin
  c := private.lock_conversation(p_conversation_id, null);
  select * into m from public.messages x where x.conversation_id = c.id and x.request_id = p_request_id;
  if found then
    select * into a from public.channel_accounts where id = c.channel_account_id;
    return query select m.id, c.channel, a.external_account_id, c.contact_external_id, c.contact_phone, m.body,
                        m.media_path, m.media_mime_type, m.status <> 'pendiente';
    return;
  end if;
  if c.channel <> 'whatsapp' then
    raise exception 'Por ahora las fotos se envían sólo por WhatsApp' using errcode = 'MG002';
  end if;
  if p_expected_last_message_at is not null and c.last_message_at > p_expected_last_message_at + interval '1 second' then
    raise exception 'La conversación cambió mientras escribías (alguien más respondió o llegó un mensaje). Revísala antes de enviar.'
      using errcode = '40001';
  end if;
  if coalesce(p_path, '') !~ ('^' || c.organization_id || '/' || c.id || '/[0-9a-f-]{36}\.(jpg|png|webp)$')
     or not exists (select 1 from storage.objects o where o.bucket_id = 'inbox-media' and o.name = p_path) then
    raise exception 'Sube la foto antes de enviarla' using errcode = '22023';
  end if;
  if length(coalesce(v_caption, '')) > 1024 then
    raise exception 'El texto de la foto admite máximo 1024 caracteres' using errcode = '22023';
  end if;
  select * into a from public.channel_accounts where id = c.channel_account_id;
  if not a.active or a.status <> 'verificada' then
    raise exception 'La cuenta de este canal no está verificada; revisa Integraciones' using errcode = 'MG002';
  end if;
  if not private.conversation_window_open(c) then
    raise exception 'Pasaron más de 24 h desde el último mensaje del contacto: sólo se permiten plantillas aprobadas de WhatsApp.'
      using errcode = 'MG002';
  end if;
  v_mime := case split_part(p_path, '.', 2) when 'png' then 'image/png' when 'webp' then 'image/webp' else 'image/jpeg' end;
  insert into public.messages (organization_id, detail_center_id, conversation_id, direction, message_type, body, status,
                               sent_by, request_id, media_path, media_mime_type)
  values (c.organization_id, c.detail_center_id, c.id, 'saliente', 'image', v_caption, 'pendiente', auth.uid(),
          p_request_id, p_path, v_mime)
  returning * into m;
  return query select m.id, c.channel, a.external_account_id, c.contact_external_id, c.contact_phone, m.body,
                      m.media_path, m.media_mime_type, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Estado de la OS para el cliente (sin montos)
-- ---------------------------------------------------------------------------

create function private.order_status_for_client(p_status public.service_order_status) returns text
language sql immutable set search_path = '' as $$
  select case p_status
    when 'abierta' then 'Recibido, en espera de iniciar'
    when 'autorizada' then 'Autorizado, en espera de iniciar'
    when 'en_proceso' then 'En proceso'
    when 'pausada' then 'En pausa'
    when 'terminada' then 'Listo para entregar'
    when 'entregada' then 'Entregado'
    else 'Cancelado' end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Ajustes a funciones existentes
-- ---------------------------------------------------------------------------

-- El webhook guarda el archivo de Meta (id, tipo y nombre) y avisa al servidor que lo descargue.
create or replace function public.ingest_inbound_messages(
  p_channel text,
  p_external_account_id text,
  p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.channel_accounts;
  item jsonb;
  conv public.conversations;
  n_inserted integer := 0;
  n_duplicates integer := 0;
  msg_id uuid;
  at timestamptz;
  body text;
  phone text;
  fresh jsonb := '[]'::jsonb;
begin
  if not private.is_service_request() then
    raise exception 'Sólo el webhook del servidor registra mensajes entrantes' using errcode = '42501';
  end if;
  select * into a from public.channel_accounts where channel = p_channel and external_account_id = p_external_account_id;
  if not found then
    return jsonb_build_object('ignored', 'cuenta no registrada', 'channel', p_channel);
  end if;
  update public.channel_accounts set last_webhook_at = now() where id = a.id;
  if not a.active then
    return jsonb_build_object('ignored', 'cuenta desactivada', 'account', a.id);
  end if;
  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if coalesce(item ->> 'external_id', '') = '' or coalesce(item ->> 'contact_id', '') = '' then
      continue;
    end if;
    at := coalesce((item ->> 'occurred_at')::timestamptz, now());
    body := left(nullif(item ->> 'body', ''), 4096);
    phone := case when coalesce(item ->> 'contact_phone', '') ~ '^\+?[1-9][0-9]{7,14}$'
                  then '+' || ltrim(item ->> 'contact_phone', '+') end;
    insert into public.conversations (organization_id, detail_center_id, channel_account_id, channel, contact_external_id,
                                      contact_phone, contact_name, last_message_at)
    values (a.organization_id, a.detail_center_id, a.id, a.channel, item ->> 'contact_id', phone,
            left(nullif(btrim(item ->> 'contact_name'), ''), 120), at)
    on conflict (channel_account_id, contact_external_id) do update
      set contact_phone = coalesce(excluded.contact_phone, public.conversations.contact_phone),
          contact_name = coalesce(excluded.contact_name, public.conversations.contact_name)
    returning * into conv;
    insert into public.messages (organization_id, detail_center_id, conversation_id, direction, external_id, message_type,
                                 body, status, occurred_at, status_at, payload, media_id, media_mime_type, media_filename)
    values (conv.organization_id, conv.detail_center_id, conv.id, 'entrante', item ->> 'external_id',
            coalesce(nullif(item ->> 'message_type', ''), 'text'), body, 'recibido', at, now(),
            left(nullif(btrim(item ->> 'payload'), ''), 200),
            case when coalesce(item ->> 'media_id', '') ~ '^[A-Za-z0-9._-]{1,128}$' then item ->> 'media_id' end,
            case when coalesce(item ->> 'media_mime_type', '') ~ '^[a-z]+/[A-Za-z0-9.+-]+' then left(split_part(item ->> 'media_mime_type', ';', 1), 100) end,
            left(nullif(btrim(item ->> 'media_filename'), ''), 200))
    on conflict (conversation_id, external_id) where external_id is not null do nothing
    returning id into msg_id;
    if msg_id is null then
      n_duplicates := n_duplicates + 1;
      continue;
    end if;
    n_inserted := n_inserted + 1;
    fresh := fresh || jsonb_build_object('conversation_id', conv.id, 'message_id', msg_id,
                                         'has_media', coalesce(item ->> 'media_id', '') <> '');
    -- Un mensaje nuevo reabre la conversación y renueva la ventana de atención.
    update public.conversations
       set unread_count = unread_count + 1,
           status = 'abierta',
           last_inbound_at = greatest(coalesce(last_inbound_at, at), at),
           last_message_at = greatest(last_message_at, at),
           last_message_preview = left(coalesce(body, '[' || coalesce(nullif(item ->> 'message_type', ''), 'mensaje') || ']'), 160)
     where id = conv.id;
    msg_id := null;
  end loop;
  return jsonb_build_object('account', a.id, 'inserted', n_inserted, 'duplicates', n_duplicates, 'messages', fresh);
end;
$$;

-- La bandeja muestra el archivo de cada mensaje.
drop function public.conversation_messages(uuid, integer);
create function public.conversation_messages(p_conversation_id uuid, p_limit integer default 200)
returns table (
  id uuid,
  direction text,
  message_type text,
  body text,
  status text,
  error text,
  sent_by_name text,
  occurred_at timestamptz,
  status_at timestamptz,
  sent_by_bot boolean,
  media_path text,
  media_mime_type text,
  media_filename text,
  media_error text
)
language plpgsql security definer set search_path = '' as $$
declare
  c public.conversations;
begin
  select * into c from public.conversations where conversations.id = p_conversation_id;
  if not found or not private.can_use_leads(c.detail_center_id) then
    return;
  end if;
  if c.unread_count > 0 then
    update public.conversations set unread_count = 0 where conversations.id = c.id;
  end if;
  return query
    select * from (
      select m.id, m.direction, m.message_type, m.body, m.status, m.error,
             (select p.full_name from public.profiles p where p.id = m.sent_by), m.occurred_at, m.status_at, m.sent_by_bot,
             m.media_path, m.media_mime_type, m.media_filename, m.media_error
        from public.messages m
       where m.conversation_id = c.id
       order by m.occurred_at desc, m.created_at desc
       limit least(greatest(coalesce(p_limit, 200), 1), 500)
    ) t
    order by t.occurred_at, t.status_at;
end;
$$;

-- El asistente ve las órdenes en curso del cliente (estado y folio).
create or replace function public.assistant_client_profile(p_turn_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.bot_turns := private.assistant_turn(p_turn_id);
  client uuid := private.conversation_client(t.conversation_id);
begin
  if client is null then
    return jsonb_build_object('cliente', null, 'vehiculos', '[]'::jsonb, 'citas', '[]'::jsonb,
                              'nota', 'El número no está registrado como cliente: para agendar pide nombre y auto');
  end if;
  return jsonb_build_object(
    'cliente', (select jsonb_build_object('nombre', cl.full_name) from public.clients cl where cl.id = client),
    'vehiculos', coalesce((select jsonb_agg(jsonb_build_object(
                             'vehiculo_id', v.id, 'descripcion', private.vehicle_label(v.make, v.model, v.year, v.plate))
                             order by v.created_at)
                             from public.vehicles v where v.client_id = client and v.active), '[]'::jsonb),
    'citas', coalesce((select jsonb_agg(jsonb_build_object(
                         'cita_id', a.id, 'centro', dc.name, 'cuando', private.es_when(a.starts_at, dc.timezone),
                         'estado', a.status,
                         'se_puede_cambiar', a.status = 'programada',
                         'servicios', coalesce((select jsonb_agg(s.name order by aps.position)
                                                  from public.appointment_services aps
                                                  join public.services s on s.id = aps.service_id
                                                 where aps.appointment_id = a.id), '[]'::jsonb),
                         'vehiculo', private.vehicle_label(v.make, v.model, v.year, v.plate))
                         order by a.starts_at)
                         from public.appointments a
                         join public.detail_centers dc on dc.id = a.detail_center_id
                         join public.vehicles v on v.id = a.vehicle_id
                        where a.client_id = client and a.organization_id = t.organization_id
                          and a.status in ('programada', 'recibida', 'en_servicio') and a.ends_at > now()), '[]'::jsonb),
    -- Órdenes de servicio en curso o entregadas en los últimos 3 días: estado y folio, nunca montos.
    'ordenes', coalesce((select jsonb_agg(jsonb_build_object(
                           'folio', o.folio, 'centro', dc.name,
                           'estado', private.order_status_for_client(o.status),
                           'auto', private.vehicle_label(o.vehicle_make, o.vehicle_model, o.vehicle_year, o.vehicle_plate),
                           'servicios', coalesce((select jsonb_agg(i.service_name order by i.position, i.created_at)
                                                    from public.service_order_items i
                                                   where i.service_order_id = o.id and i.kind = 'servicio'), '[]'::jsonb),
                           'listo_para_entregar', o.status = 'terminada',
                           'hora_promesa', case when o.promised_at is not null then private.es_when(o.promised_at, dc.timezone) end)
                           order by o.created_at desc)
                           from public.service_orders o
                           join public.detail_centers dc on dc.id = o.detail_center_id
                          where o.client_id = client and o.organization_id = t.organization_id
                            and (o.status not in ('entregada', 'cancelada')
                                 or (o.status = 'entregada' and o.delivered_at > now() - interval '3 days'))), '[]'::jsonb));
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array['private.order_status_for_client(public.service_order_status)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
  -- Las políticas de Storage las evalúan con la sesión del usuario.
  foreach fn in array array['private.can_read_inbox_media(text)', 'private.can_upload_inbox_media(text)'] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.conversation_messages(uuid, integer)',
    'public.prepare_outbound_media(uuid, uuid, text, text, timestamptz)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array['public.record_message_media(uuid, text, text, integer, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
