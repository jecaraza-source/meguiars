-- CR2 (fase 2) — Conexiones oficiales y bandeja unificada (WhatsApp Business,
-- Messenger de Facebook e Instagram) sobre las API oficiales de Meta.
--
-- * channel_accounts: la cuenta oficial conectada (número de WhatsApp Cloud
--   API, página de Facebook o cuenta profesional de Instagram), con el centro
--   al que llegan sus conversaciones. NO guarda secretos: los tokens y el App
--   Secret viven sólo en variables del servidor web. El estado «verificada»
--   sólo lo fija el servidor tras consultar la API de Meta con esas
--   credenciales (record_channel_verification); nunca se marca a mano.
-- * conversations: un hilo por cuenta y contacto (wa_id o BSUID de WhatsApp,
--   PSID de Messenger, IGSID de Instagram), con responsable, estado, no leídos,
--   último mensaje entrante (ventana de atención de 24 h) y el prospecto o
--   cliente ligado.
-- * messages: entrantes (webhook firmado) y salientes (respuesta desde la
--   bandeja). El texto no se edita; sólo cambia el estado de entrega.
-- * Entrada del webhook y resultado del envío: RPC exclusivas de la llave de
--   servicio (private.is_service_request); el servidor verifica antes la firma
--   X-Hub-Signature-256 con el App Secret.
-- * Responder: prepare_outbound_message valida permiso y ventana y deja el
--   mensaje «pendiente»; el servidor lo envía con el token y registra el
--   resultado (finish_outbound_message). La primera respuesta a un prospecto
--   ligado cuenta como su primer contacto.
--
-- Escrituras sólo por RPC; configuración con motivo y auditoría.

-- ---------------------------------------------------------------------------
-- 1. Permisos
-- ---------------------------------------------------------------------------

-- channels.manage: registrar y desactivar cuentas oficiales (admin de la organización).
create function private.can_manage_channels(p_organization_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_org_role(p_organization_id, array['admin_socio']::public.app_role[]);
$$;

-- ---------------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------------

create table public.channel_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  -- Centro al que llegan las conversaciones nuevas de esta cuenta.
  detail_center_id uuid not null,
  channel text not null check (channel in ('whatsapp', 'messenger', 'instagram')),
  -- phone_number_id (WhatsApp), page_id (Messenger) o IG ID (Instagram).
  external_account_id text not null check (external_account_id ~ '^[0-9]{5,30}$'),
  label text not null check (length(btrim(label)) between 2 and 80),
  -- Nombre que devuelve Meta al verificar (número visible, página o @usuario).
  verified_name text check (verified_name is null or length(verified_name) <= 200),
  status text not null default 'pendiente' check (status in ('pendiente', 'verificada', 'error')),
  last_verified_at timestamptz,
  last_verify_error text check (last_verify_error is null or length(last_verify_error) <= 500),
  last_webhook_at timestamptz,
  active boolean not null default true,
  version integer not null default 1,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (channel, external_account_id),
  check ((status = 'verificada') = (last_verified_at is not null and last_verify_error is null)),
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete restrict
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  channel_account_id uuid not null,
  channel text not null check (channel in ('whatsapp', 'messenger', 'instagram')),
  -- wa_id o BSUID (WhatsApp), PSID (Messenger), IGSID (Instagram).
  contact_external_id text not null check (length(contact_external_id) between 3 and 128),
  -- Teléfono en E.164 cuando WhatsApp lo comparte (con nombre de usuario puede no venir).
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  contact_name text check (contact_name is null or length(contact_name) <= 120),
  lead_id uuid,
  client_id uuid,
  assigned_to uuid references auth.users (id) on delete set null,
  status text not null default 'abierta' check (status in ('abierta', 'cerrada')),
  unread_count integer not null default 0 check (unread_count >= 0),
  last_inbound_at timestamptz,
  last_message_at timestamptz not null default now(),
  last_message_preview text check (last_message_preview is null or length(last_message_preview) <= 160),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (channel_account_id, contact_external_id),
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete restrict,
  foreign key (organization_id, channel_account_id) references public.channel_accounts (organization_id, id) on delete restrict,
  foreign key (organization_id, lead_id) references public.leads (organization_id, id) on delete restrict,
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete restrict
);
create index conversations_center_idx on public.conversations (detail_center_id, status, last_message_at desc);
create index conversations_lead_idx on public.conversations (lead_id) where lead_id is not null;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  conversation_id uuid not null,
  direction text not null check (direction in ('entrante', 'saliente')),
  -- wamid (WhatsApp) o mid (Messenger/Instagram). Evita duplicar reintentos del webhook.
  external_id text check (external_id is null or length(external_id) between 3 and 255),
  -- Tipo original (text, image, audio…). La bandeja muestra el texto; lo demás como aviso.
  message_type text not null default 'text' check (length(message_type) between 2 and 40),
  body text check (body is null or length(body) <= 4096),
  status text not null check (status in ('recibido', 'pendiente', 'enviado', 'entregado', 'leido', 'fallido')),
  error text check (error is null or length(error) <= 500),
  sent_by uuid references auth.users (id) on delete set null,
  request_id uuid,
  occurred_at timestamptz not null default now(),
  status_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  check ((direction = 'entrante') = (status = 'recibido')),
  check (direction = 'entrante' or sent_by is not null),
  check (direction = 'saliente' or external_id is not null),
  foreign key (organization_id, conversation_id) references public.conversations (organization_id, id) on delete restrict,
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete restrict
);
create unique index messages_external_key on public.messages (conversation_id, external_id) where external_id is not null;
create unique index messages_request_key on public.messages (conversation_id, request_id) where request_id is not null;
create index messages_conversation_idx on public.messages (conversation_id, occurred_at);
-- Estados de entrega: WhatsApp los identifica por el wamid del mensaje saliente.
create index messages_external_idx on public.messages (external_id) where external_id is not null;

comment on table public.channel_accounts is
  'Cuenta oficial conectada (WhatsApp Cloud API, página de Facebook, cuenta profesional de Instagram). Sin secretos: los tokens viven en el servidor.';
comment on table public.messages is
  'Mensajes de la bandeja. Entrantes por webhook firmado; salientes enviados por el servidor con la API oficial.';

-- ---------------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------------

create trigger channel_accounts_updated_at before update on public.channel_accounts
  for each row execute function private.set_updated_at();
create trigger conversations_updated_at before update on public.conversations
  for each row execute function private.set_updated_at();

create trigger channel_accounts_require_reason before insert or update or delete on public.channel_accounts
  for each row execute function private.require_change_reason();
create trigger channel_accounts_audit after insert or update or delete on public.channel_accounts
  for each row execute function private.audit_row();

create trigger channel_accounts_version before update on public.channel_accounts
  for each row execute function private.bump_row_version();

-- La versión de la conversación sólo sube con cambios de quien atiende
-- (responsable, estado, prospecto); los mensajes nuevos no invalidan un formulario abierto.
create function private.bump_conversation_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.assigned_to, new.status, new.lead_id, new.client_id) is distinct from
     (old.assigned_to, old.status, old.lead_id, old.client_id) then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  return new;
end;
$$;
create trigger conversations_version before update on public.conversations
  for each row execute function private.bump_conversation_version();

-- El texto de un mensaje no cambia; sólo su estado de entrega.
create function private.keep_message_content() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los mensajes no se borran' using errcode = '42501';
  end if;
  if (new.conversation_id, new.direction, new.body, new.message_type, new.sent_by, new.occurred_at, new.organization_id)
     is distinct from
     (old.conversation_id, old.direction, old.body, old.message_type, old.sent_by, old.occurred_at, old.organization_id) then
    raise exception 'El contenido de un mensaje no se edita' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger messages_keep_content before update or delete on public.messages
  for each row execute function private.keep_message_content();

-- Cambios de responsable, estado y prospecto de la conversación quedan en auditoría.
create function private.audit_conversation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.assigned_to, new.status, new.lead_id, new.client_id, new.detail_center_id) is distinct from
     (old.assigned_to, old.status, old.lead_id, old.client_id, old.detail_center_id) then
    insert into public.audit_log (organization_id, detail_center_id, table_name, record_id, action, actor_id, reason, old_data, new_data)
    values (new.organization_id, new.detail_center_id, 'public.conversations', new.id::text, 'UPDATE', auth.uid(),
            nullif(current_setting('app.change_reason', true), ''),
            jsonb_build_object('assigned_to', old.assigned_to, 'status', old.status, 'lead_id', old.lead_id,
                               'client_id', old.client_id, 'detail_center_id', old.detail_center_id),
            jsonb_build_object('assigned_to', new.assigned_to, 'status', new.status, 'lead_id', new.lead_id,
                               'client_id', new.client_id, 'detail_center_id', new.detail_center_id));
  end if;
  return new;
end;
$$;
create trigger conversations_audit after update on public.conversations
  for each row execute function private.audit_conversation();

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

alter table public.channel_accounts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Las cuentas (sin secretos) las ve quien atiende la bandeja en el centro o el admin.
create policy channel_accounts_select on public.channel_accounts
  for select to authenticated using (
    private.can_use_leads(detail_center_id) or private.can_manage_channels(organization_id));
create policy conversations_select on public.conversations
  for select to authenticated using (private.can_use_leads(detail_center_id));
create policy messages_select on public.messages
  for select to authenticated using (private.can_use_leads(detail_center_id));

revoke all on public.channel_accounts, public.conversations, public.messages from anon;
revoke insert, update, delete, truncate on public.channel_accounts, public.conversations, public.messages from authenticated;

-- ---------------------------------------------------------------------------
-- 5. Cuentas oficiales
-- ---------------------------------------------------------------------------

create function public.upsert_channel_account(
  p_organization_id uuid,
  p_channel_account_id uuid,
  p_detail_center_id uuid,
  p_channel text,
  p_external_account_id text,
  p_label text,
  p_active boolean,
  p_reason text
) returns public.channel_accounts
language plpgsql security definer set search_path = '' as $$
declare
  a public.channel_accounts;
begin
  if not private.can_manage_channels(p_organization_id) then
    raise exception 'Sólo el admin de la organización conecta cuentas oficiales' using errcode = '42501';
  end if;
  if not exists (select 1 from public.detail_centers c where c.id = p_detail_center_id and c.organization_id = p_organization_id) then
    raise exception 'El centro no pertenece a la organización' using errcode = '22023';
  end if;
  perform private.set_change_reason(p_reason);
  if p_channel_account_id is null then
    if exists (select 1 from public.channel_accounts x where x.channel = p_channel and x.external_account_id = btrim(p_external_account_id)) then
      raise exception 'Esa cuenta ya está registrada' using errcode = 'MG002';
    end if;
    insert into public.channel_accounts (organization_id, detail_center_id, channel, external_account_id, label, active)
    values (p_organization_id, p_detail_center_id, p_channel, btrim(p_external_account_id), btrim(p_label), coalesce(p_active, true))
    returning * into a;
  else
    select * into a from public.channel_accounts where id = p_channel_account_id and organization_id = p_organization_id for update;
    if not found then
      raise exception 'Cuenta inexistente o sin permiso' using errcode = '42501';
    end if;
    -- Cambiar el identificador de la cuenta invalida la verificación anterior.
    update public.channel_accounts
       set detail_center_id = p_detail_center_id,
           label = btrim(p_label),
           active = coalesce(p_active, true),
           external_account_id = btrim(p_external_account_id),
           channel = p_channel,
           status = case when external_account_id = btrim(p_external_account_id) and channel = p_channel then status else 'pendiente' end,
           verified_name = case when external_account_id = btrim(p_external_account_id) and channel = p_channel then verified_name end,
           last_verified_at = case when external_account_id = btrim(p_external_account_id) and channel = p_channel then last_verified_at end,
           last_verify_error = case when external_account_id = btrim(p_external_account_id) and channel = p_channel then last_verify_error end
     where id = a.id
     returning * into a;
  end if;
  return a;
end;
$$;

create function public.list_channel_accounts(p_organization_id uuid)
returns table (
  id uuid,
  detail_center_id uuid,
  detail_center_name text,
  channel text,
  external_account_id text,
  label text,
  verified_name text,
  status text,
  last_verified_at timestamptz,
  last_verify_error text,
  last_webhook_at timestamptz,
  active boolean,
  open_conversations integer,
  version integer
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.detail_center_id, c.name, a.channel, a.external_account_id, a.label, a.verified_name, a.status,
         a.last_verified_at, a.last_verify_error, a.last_webhook_at, a.active,
         (select count(*)::integer from public.conversations v where v.channel_account_id = a.id and v.status = 'abierta'),
         a.version
    from public.channel_accounts a
    join public.detail_centers c on c.id = a.detail_center_id
   where a.organization_id = p_organization_id
     and (private.can_manage_channels(a.organization_id) or private.can_use_leads(a.detail_center_id))
   order by a.channel, a.label;
$$;

-- Resultado de «Probar conexión»: sólo el servidor, tras consultar la API de Meta.
create function public.record_channel_verification(
  p_channel_account_id uuid,
  p_ok boolean,
  p_verified_name text,
  p_error text
) returns public.channel_accounts
language plpgsql security definer set search_path = '' as $$
declare
  a public.channel_accounts;
begin
  if not private.is_service_request() then
    raise exception 'Sólo el servidor registra la verificación con Meta' using errcode = '42501';
  end if;
  perform private.set_change_reason(case when p_ok then 'Conexión verificada con Meta' else 'Falló la verificación con Meta' end);
  update public.channel_accounts
     set status = case when p_ok then 'verificada' else 'error' end,
         verified_name = case when p_ok then left(nullif(btrim(p_verified_name), ''), 200) else verified_name end,
         last_verified_at = case when p_ok then now() end,
         last_verify_error = case when p_ok then null else left(coalesce(nullif(btrim(p_error), ''), 'Error desconocido'), 500) end
   where id = p_channel_account_id
   returning * into a;
  if not found then
    raise exception 'Cuenta inexistente' using errcode = 'P0002';
  end if;
  return a;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Webhook (sólo servidor, después de verificar la firma)
-- ---------------------------------------------------------------------------

-- p_items: [{external_id, contact_id, contact_phone?, contact_name?, message_type, body?, occurred_at}]
-- Devuelve {account, inserted, duplicates} o {ignored: 'cuenta no registrada' …}.
create function public.ingest_inbound_messages(
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
                                 body, status, occurred_at, status_at)
    values (conv.organization_id, conv.detail_center_id, conv.id, 'entrante', item ->> 'external_id',
            coalesce(nullif(item ->> 'message_type', ''), 'text'), body, 'recibido', at, now())
    on conflict (conversation_id, external_id) where external_id is not null do nothing
    returning id into msg_id;
    if msg_id is null then
      n_duplicates := n_duplicates + 1;
      continue;
    end if;
    n_inserted := n_inserted + 1;
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
  return jsonb_build_object('account', a.id, 'inserted', n_inserted, 'duplicates', n_duplicates);
end;
$$;

-- p_items: [{external_id, status: enviado|entregado|leido|fallido, occurred_at, error?}]
create function public.ingest_message_statuses(p_channel text, p_items jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
  n integer := 0;
  k integer;
  rank_new integer;
begin
  if not private.is_service_request() then
    raise exception 'Sólo el webhook del servidor registra estados de entrega' using errcode = '42501';
  end if;
  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if item ->> 'status' not in ('enviado', 'entregado', 'leido', 'fallido') then
      continue;
    end if;
    rank_new := array_position(array['pendiente', 'enviado', 'entregado', 'leido'], item ->> 'status');
    -- Los estados llegan desordenados: nunca retroceden (leído no vuelve a entregado).
    update public.messages m
       set status = item ->> 'status',
           error = case when item ->> 'status' = 'fallido' then left(coalesce(item ->> 'error', 'Meta no entregó el mensaje'), 500) end,
           status_at = coalesce((item ->> 'occurred_at')::timestamptz, now())
      from public.conversations c
     where m.external_id = item ->> 'external_id'
       and m.direction = 'saliente'
       and c.id = m.conversation_id and c.channel = p_channel
       and m.status <> 'fallido'
       and (item ->> 'status' = 'fallido'
            or coalesce(array_position(array['pendiente', 'enviado', 'entregado', 'leido'], m.status), 0) < rank_new);
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Bandeja
-- ---------------------------------------------------------------------------

create function private.lock_conversation(p_id uuid, p_version integer) returns public.conversations
language plpgsql set search_path = '' as $$
declare
  c public.conversations;
begin
  select * into c from public.conversations where id = p_id for update;
  if not found or not private.can_use_leads(c.detail_center_id) then
    raise exception 'Conversación inexistente o sin permiso' using errcode = '42501';
  end if;
  if p_version is not null and c.version <> p_version then
    raise exception 'La conversación cambió en otro dispositivo; recarga' using errcode = '40001';
  end if;
  return c;
end;
$$;

-- Ventana de atención: 24 h desde el último mensaje del contacto (las tres
-- plataformas). Fuera de ella la bandeja no envía texto libre.
create function private.conversation_window_open(c public.conversations) returns boolean
language sql stable set search_path = '' as $$
  select c.last_inbound_at is not null and c.last_inbound_at > now() - interval '24 hours';
$$;

create function public.list_conversations(
  p_detail_center_ids uuid[],
  p_status text default 'abierta',
  p_channel text default null,
  p_assigned_to uuid default null,
  p_unassigned boolean default false,
  p_conversation_id uuid default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  detail_center_id uuid,
  detail_center_name text,
  channel_account_id uuid,
  account_label text,
  account_status text,
  channel text,
  contact_external_id text,
  contact_phone text,
  contact_name text,
  lead_id uuid,
  lead_name text,
  lead_status text,
  client_id uuid,
  client_name text,
  assigned_to uuid,
  assigned_name text,
  status text,
  unread_count integer,
  last_inbound_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  window_open boolean,
  window_closes_at timestamptz,
  version integer
)
language sql stable security definer set search_path = '' as $$
  select v.id, v.detail_center_id, dc.name, v.channel_account_id, a.label, a.status, v.channel, v.contact_external_id,
         v.contact_phone, v.contact_name, v.lead_id, l.full_name, l.status, v.client_id, cl.full_name, v.assigned_to,
         (select p.full_name from public.profiles p where p.id = v.assigned_to), v.status, v.unread_count,
         v.last_inbound_at, v.last_message_at, v.last_message_preview, private.conversation_window_open(v),
         v.last_inbound_at + interval '24 hours', v.version
    from public.conversations v
    join public.detail_centers dc on dc.id = v.detail_center_id
    join public.channel_accounts a on a.id = v.channel_account_id
    left join public.leads l on l.id = v.lead_id
    left join public.clients cl on cl.id = v.client_id
   where v.detail_center_id = any (p_detail_center_ids)
     and private.can_use_leads(v.detail_center_id)
     and (p_conversation_id is not null or p_status is null or v.status = p_status)
     and (p_conversation_id is null or v.id = p_conversation_id)
     and (p_channel is null or v.channel = p_channel)
     and (p_assigned_to is null or v.assigned_to = p_assigned_to)
     and (not coalesce(p_unassigned, false) or v.assigned_to is null)
   order by v.unread_count > 0 desc, v.last_message_at desc
   limit least(greatest(coalesce(p_limit, 100), 1), 300);
$$;

-- Mensajes del hilo; al abrirlo se marcan como leídos en la bandeja.
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
  status_at timestamptz
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
             (select p.full_name from public.profiles p where p.id = m.sent_by), m.occurred_at, m.status_at
        from public.messages m
       where m.conversation_id = c.id
       order by m.occurred_at desc, m.created_at desc
       limit least(greatest(coalesce(p_limit, 200), 1), 500)
    ) t
    order by t.occurred_at, t.status_at;
end;
$$;

create function public.assign_conversation(p_conversation_id uuid, p_version integer, p_user_id uuid)
returns public.conversations
language plpgsql security definer set search_path = '' as $$
declare
  c public.conversations;
begin
  c := private.lock_conversation(p_conversation_id, p_version);
  perform private.check_lead_owner(p_user_id, c.detail_center_id);
  perform private.set_change_reason('Responsable de la conversación');
  update public.conversations set assigned_to = p_user_id where id = c.id returning * into c;
  return c;
end;
$$;

create function public.set_conversation_status(p_conversation_id uuid, p_version integer, p_status text)
returns public.conversations
language plpgsql security definer set search_path = '' as $$
declare
  c public.conversations;
begin
  c := private.lock_conversation(p_conversation_id, p_version);
  if p_status not in ('abierta', 'cerrada') then
    raise exception 'Estado inválido' using errcode = '22023';
  end if;
  perform private.set_change_reason(case when p_status = 'cerrada' then 'Conversación atendida' else 'Conversación reabierta' end);
  update public.conversations set status = p_status, unread_count = case when p_status = 'cerrada' then 0 else unread_count end
   where id = c.id returning * into c;
  return c;
end;
$$;

-- Liga la conversación a un prospecto existente (y a su cliente, si tiene).
create function public.link_conversation_lead(p_conversation_id uuid, p_version integer, p_lead_id uuid)
returns public.conversations
language plpgsql security definer set search_path = '' as $$
declare
  c public.conversations;
  l public.leads;
begin
  c := private.lock_conversation(p_conversation_id, p_version);
  select * into l from public.leads where id = p_lead_id and organization_id = c.organization_id;
  if not found or not private.can_use_leads(l.detail_center_id) then
    raise exception 'Prospecto inexistente o sin permiso' using errcode = '42501';
  end if;
  perform private.set_change_reason('Conversación ligada al prospecto');
  update public.conversations set lead_id = l.id, client_id = coalesce(l.client_id, client_id)
   where id = c.id returning * into c;
  perform private.lead_event(l, 'nota', null, null, null,
    'Conversación de ' || case c.channel when 'whatsapp' then 'WhatsApp' when 'messenger' then 'Messenger' else 'Instagram' end
    || ' ligada desde la bandeja');
  return c;
end;
$$;

-- Registra la consulta como prospecto sin recapturar (canal y teléfono de la conversación).
create function public.create_lead_from_conversation(
  p_conversation_id uuid,
  p_version integer,
  p_request_id uuid,
  p_full_name text,
  p_social_handle text default null,
  p_interest_service_ids uuid[] default '{}',
  p_notes text default null
) returns public.leads
language plpgsql security definer set search_path = '' as $$
declare
  c public.conversations;
  l public.leads;
begin
  c := private.lock_conversation(p_conversation_id, p_version);
  if c.lead_id is not null then
    raise exception 'La conversación ya está ligada a un prospecto' using errcode = 'MG002';
  end if;
  if c.contact_phone is null and nullif(btrim(p_social_handle), '') is null then
    raise exception 'Indica el usuario de redes del contacto (Meta no comparte su teléfono)' using errcode = '22023';
  end if;
  l := public.create_lead(
    c.detail_center_id, p_request_id, p_full_name,
    case c.channel when 'whatsapp' then 'whatsapp' when 'messenger' then 'facebook' else 'instagram' end,
    c.contact_phone, null, nullif(btrim(p_social_handle), ''), 'Bandeja de mensajes', null, c.client_id,
    coalesce(p_interest_service_ids, '{}'), null, p_notes, '{}', null, coalesce(c.assigned_to, auth.uid()), null, null);
  perform private.set_change_reason('Prospecto creado desde la bandeja');
  update public.conversations set lead_id = l.id where id = c.id;
  return l;
end;
$$;

-- Deja el mensaje «pendiente» y devuelve lo que el servidor necesita para
-- enviarlo con la API oficial. El texto se guarda tal cual se envía.
create function public.prepare_outbound_message(p_conversation_id uuid, p_request_id uuid, p_body text)
returns table (
  message_id uuid,
  channel text,
  external_account_id text,
  contact_external_id text,
  contact_phone text,
  body text,
  already_sent boolean
)
language plpgsql security definer set search_path = '' as $$
declare
  c public.conversations;
  a public.channel_accounts;
  m public.messages;
  txt text := btrim(coalesce(p_body, ''));
begin
  c := private.lock_conversation(p_conversation_id, null);
  select * into m from public.messages x where x.conversation_id = c.id and x.request_id = p_request_id;
  if found then
    select * into a from public.channel_accounts where id = c.channel_account_id;
    return query select m.id, c.channel, a.external_account_id, c.contact_external_id, c.contact_phone, m.body,
                        m.status <> 'pendiente';
    return;
  end if;
  if length(txt) not between 1 and 4096 then
    raise exception 'Escribe el mensaje (máximo 4096 caracteres)' using errcode = '22023';
  end if;
  select * into a from public.channel_accounts where id = c.channel_account_id;
  if not a.active or a.status <> 'verificada' then
    raise exception 'La cuenta de este canal no está verificada; revisa Integraciones' using errcode = 'MG002';
  end if;
  if not private.conversation_window_open(c) then
    raise exception 'Pasaron más de 24 h desde el último mensaje del contacto: la plataforma sólo permite plantillas aprobadas. Contáctalo por otro medio.'
      using errcode = 'MG002';
  end if;
  insert into public.messages (organization_id, detail_center_id, conversation_id, direction, message_type, body, status,
                               sent_by, request_id)
  values (c.organization_id, c.detail_center_id, c.id, 'saliente', 'text', txt, 'pendiente', auth.uid(), p_request_id)
  returning * into m;
  return query select m.id, c.channel, a.external_account_id, c.contact_external_id, c.contact_phone, m.body, false;
end;
$$;

-- Resultado del envío (sólo servidor). Con éxito, la primera respuesta a un
-- prospecto ligado cuenta como su primer contacto.
create function public.finish_outbound_message(p_message_id uuid, p_external_id text, p_error text)
returns public.messages
language plpgsql security definer set search_path = '' as $$
declare
  m public.messages;
  c public.conversations;
  l public.leads;
begin
  if not private.is_service_request() then
    raise exception 'Sólo el servidor registra el resultado del envío' using errcode = '42501';
  end if;
  select * into m from public.messages where id = p_message_id and direction = 'saliente' for update;
  if not found then
    raise exception 'Mensaje inexistente' using errcode = 'P0002';
  end if;
  if m.status <> 'pendiente' then
    return m;
  end if;
  if nullif(btrim(p_external_id), '') is not null then
    update public.messages set status = 'enviado', external_id = btrim(p_external_id), error = null, status_at = now()
     where id = m.id returning * into m;
  else
    update public.messages set status = 'fallido', error = left(coalesce(nullif(btrim(p_error), ''), 'Error al enviar'), 500),
                               status_at = now()
     where id = m.id returning * into m;
    return m;
  end if;
  update public.conversations
     set last_message_at = greatest(last_message_at, m.occurred_at),
         last_message_preview = left(m.body, 160)
   where id = m.conversation_id
   returning * into c;
  if c.lead_id is not null then
    select * into l from public.leads where id = c.lead_id for update;
    if found and l.status = 'abierta' then
      -- Actúa como quien respondió: el historial del prospecto registra a esa persona.
      perform set_config('request.jwt.claims', jsonb_build_object('sub', m.sent_by, 'role', 'authenticated')::text, true);
      perform private.set_change_reason('Respuesta desde la bandeja');
      if l.first_contact_at is null then
        update public.leads set first_contact_at = now() where id = l.id returning * into l;
        perform private.lead_event(l, 'contacto', null, null, null, 'Respuesta desde la bandeja',
                                   case c.channel when 'whatsapp' then 'whatsapp' else 'redes' end);
      end if;
      perform private.advance_lead_to_milestone(l.id, 'contactado', 'Primer contacto');
    end if;
  end if;
  return m;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.bump_conversation_version()', 'private.keep_message_content()', 'private.audit_conversation()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
  foreach fn in array array[
    'private.can_manage_channels(uuid)', 'private.lock_conversation(uuid, integer)',
    'private.conversation_window_open(public.conversations)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.upsert_channel_account(uuid, uuid, uuid, text, text, text, boolean, text)',
    'public.list_channel_accounts(uuid)',
    'public.list_conversations(uuid[], text, text, uuid, boolean, uuid, integer)',
    'public.conversation_messages(uuid, integer)',
    'public.assign_conversation(uuid, integer, uuid)',
    'public.set_conversation_status(uuid, integer, text)',
    'public.link_conversation_lead(uuid, integer, uuid)',
    'public.create_lead_from_conversation(uuid, integer, uuid, text, text, uuid[], text)',
    'public.prepare_outbound_message(uuid, uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  -- Sólo el servidor con la llave de servicio (webhook firmado, verificación y resultado del envío).
  foreach fn in array array[
    'public.record_channel_verification(uuid, boolean, text, text)',
    'public.ingest_inbound_messages(text, text, jsonb)',
    'public.ingest_message_statuses(text, jsonb)',
    'public.finish_outbound_message(uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
grant select on public.channel_accounts, public.conversations, public.messages to service_role;
