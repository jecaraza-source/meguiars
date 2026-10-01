-- CR2 (pendientes de la bandeja) — Triaje, notas internas, respuestas rápidas,
-- respuestas sin duplicar y plantillas aprobadas de WhatsApp.
--
-- * conversations: prioridad (baja/normal/alta), etiquetas y «pendiente»
--   (seguimiento), con set_conversation_triage.
-- * conversation_notes: notas internas del equipo. NUNCA se envían al cliente
--   y se muestran separadas de los mensajes; no se editan ni se borran.
-- * quick_replies: respuestas rápidas por organización o centro, con los
--   mismos marcadores de datos reales ({nombre}, {centro}); la bandeja sólo
--   las pega en la caja de respuesta, la persona decide enviar.
-- * Respuestas duplicadas: prepare_outbound_message recibe el último mensaje
--   que la persona vio (p_expected_last_message_at). Si alguien más respondió
--   o llegó un mensaje nuevo desde entonces, no envía (40001) y pide revisar.
-- * whatsapp_templates: plantillas de la cuenta de WhatsApp Business
--   sincronizadas desde Meta (GET /{WABA}/message_templates) sólo por el
--   servidor. Sólo las APPROVED se envían; permiten escribir fuera de la
--   ventana de 24 h. Las de MARKETING exigen el consentimiento de WhatsApp del
--   contacto; las de AUTHENTICATION no se usan desde la bandeja.

-- ---------------------------------------------------------------------------
-- 1. Triaje de conversaciones
-- ---------------------------------------------------------------------------

alter table public.conversations
  add column priority text not null default 'normal' check (priority in ('baja', 'normal', 'alta')),
  add column tags text[] not null default '{}'
    check (cardinality(tags) <= 10 and array_to_string(tags, ',') !~ '[^a-z0-9áéíóúñü ,_-]'),
  add column pending boolean not null default false;
create index conversations_pending_idx on public.conversations (detail_center_id, pending) where pending;

-- La auditoría de la conversación también registra el triaje.
create or replace function private.audit_conversation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.assigned_to, new.status, new.lead_id, new.client_id, new.detail_center_id, new.priority, new.tags, new.pending)
     is distinct from
     (old.assigned_to, old.status, old.lead_id, old.client_id, old.detail_center_id, old.priority, old.tags, old.pending) then
    insert into public.audit_log (organization_id, detail_center_id, table_name, record_id, action, actor_id, reason, old_data, new_data)
    values (new.organization_id, new.detail_center_id, 'public.conversations', new.id::text, 'UPDATE', auth.uid(),
            nullif(current_setting('app.change_reason', true), ''),
            jsonb_build_object('assigned_to', old.assigned_to, 'status', old.status, 'lead_id', old.lead_id,
                               'client_id', old.client_id, 'detail_center_id', old.detail_center_id,
                               'priority', old.priority, 'tags', old.tags, 'pending', old.pending),
            jsonb_build_object('assigned_to', new.assigned_to, 'status', new.status, 'lead_id', new.lead_id,
                               'client_id', new.client_id, 'detail_center_id', new.detail_center_id,
                               'priority', new.priority, 'tags', new.tags, 'pending', new.pending));
  end if;
  return new;
end;
$$;

create function public.set_conversation_triage(
  p_conversation_id uuid,
  p_version integer,
  p_priority text,
  p_tags text[],
  p_pending boolean
) returns public.conversations
language plpgsql security definer set search_path = '' as $$
declare
  c public.conversations;
  v_tags text[] := coalesce((select array_agg(distinct lower(btrim(t)) order by lower(btrim(t)))
                               from unnest(p_tags) t where length(btrim(t)) between 1 and 30), '{}');
begin
  c := private.lock_conversation(p_conversation_id, p_version);
  if p_priority not in ('baja', 'normal', 'alta') then
    raise exception 'Prioridad inválida' using errcode = '22023';
  end if;
  if cardinality(v_tags) > 10 or exists (select 1 from unnest(v_tags) t where t !~ '^[a-z0-9áéíóúñü _-]+$') then
    raise exception 'Etiquetas: hasta 10, con letras, números, espacios o guiones' using errcode = 'MG002';
  end if;
  perform private.set_change_reason('Triaje de la conversación');
  update public.conversations set priority = p_priority, tags = v_tags, pending = coalesce(p_pending, false)
   where id = c.id returning * into c;
  return c;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Notas internas
-- ---------------------------------------------------------------------------

create table public.conversation_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  conversation_id uuid not null,
  body text not null check (length(btrim(body)) between 1 and 2000),
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (conversation_id, request_id),
  foreign key (organization_id, conversation_id) references public.conversations (organization_id, id) on delete cascade,
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete restrict
);
create index conversation_notes_conversation_idx on public.conversation_notes (conversation_id, created_at);

create function private.keep_note() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Las notas internas no se editan ni se borran' using errcode = 'MG002';
end;
$$;
create trigger conversation_notes_keep before update or delete on public.conversation_notes
  for each row execute function private.keep_note();

alter table public.conversation_notes enable row level security;
create policy conversation_notes_select on public.conversation_notes
  for select to authenticated using (private.can_use_leads(detail_center_id));
revoke all on public.conversation_notes from anon;
revoke insert, update, delete, truncate on public.conversation_notes from authenticated;

create function public.add_conversation_note(p_conversation_id uuid, p_request_id uuid, p_body text)
returns public.conversation_notes
language plpgsql security definer set search_path = '' as $$
declare
  c public.conversations;
  n public.conversation_notes;
begin
  c := private.lock_conversation(p_conversation_id, null);
  select * into n from public.conversation_notes x where x.conversation_id = c.id and x.request_id = p_request_id;
  if found then
    return n;
  end if;
  if length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception 'Escribe la nota (máximo 2000 caracteres)' using errcode = '22023';
  end if;
  insert into public.conversation_notes (organization_id, detail_center_id, conversation_id, body, request_id)
  values (c.organization_id, c.detail_center_id, c.id, btrim(p_body), p_request_id)
  returning * into n;
  return n;
end;
$$;

create function public.conversation_notes_list(p_conversation_id uuid)
returns table (id uuid, body text, author_name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select n.id, n.body, (select p.full_name from public.profiles p where p.id = n.author_id), n.created_at
    from public.conversation_notes n
   where n.conversation_id = p_conversation_id and private.can_use_leads(n.detail_center_id)
   order by n.created_at;
$$;

-- Lista de la bandeja con triaje y número de notas.
drop function public.list_conversations(uuid[], text, text, uuid, boolean, uuid, integer);
create function public.list_conversations(
  p_detail_center_ids uuid[],
  p_status text default 'abierta',
  p_channel text default null,
  p_assigned_to uuid default null,
  p_unassigned boolean default false,
  p_conversation_id uuid default null,
  p_limit integer default 100,
  p_pending boolean default false,
  p_tag text default null
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
  version integer,
  priority text,
  tags text[],
  pending boolean,
  notes integer
)
language sql stable security definer set search_path = '' as $$
  select v.id, v.detail_center_id, dc.name, v.channel_account_id, a.label, a.status, v.channel, v.contact_external_id,
         v.contact_phone, v.contact_name, v.lead_id, l.full_name, l.status, v.client_id, cl.full_name, v.assigned_to,
         (select p.full_name from public.profiles p where p.id = v.assigned_to), v.status, v.unread_count,
         v.last_inbound_at, v.last_message_at, v.last_message_preview, private.conversation_window_open(v),
         v.last_inbound_at + interval '24 hours', v.version, v.priority, v.tags, v.pending,
         (select count(*)::integer from public.conversation_notes n where n.conversation_id = v.id)
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
     and (not coalesce(p_pending, false) or v.pending)
     and (p_tag is null or lower(p_tag) = any (v.tags))
   order by v.priority = 'alta' desc, v.unread_count > 0 desc, v.last_message_at desc
   limit least(greatest(coalesce(p_limit, 100), 1), 300);
$$;

-- ---------------------------------------------------------------------------
-- 3. Respuestas rápidas
-- ---------------------------------------------------------------------------

-- Las administra el admin de la organización o el admin/encargado del centro.
create function private.can_manage_quick_replies(p_organization_id uuid, p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_org_role(p_organization_id, array['admin_socio']::public.app_role[])
      or (p_detail_center_id is not null
          and exists (select 1 from public.detail_centers c where c.id = p_detail_center_id and c.organization_id = p_organization_id)
          and private.has_center_role(p_detail_center_id, array['admin_socio', 'encargado']::public.app_role[]));
$$;

create table public.quick_replies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  -- null = todos los centros.
  detail_center_id uuid,
  title text not null check (length(btrim(title)) between 2 and 60),
  body text not null check (length(btrim(body)) between 2 and 1000
                            and body !~ '\{(?!(nombre|centro)\})[^}]*\}'),
  active boolean not null default true,
  version integer not null default 1,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete restrict
);
create trigger quick_replies_updated_at before update on public.quick_replies
  for each row execute function private.set_updated_at();
create trigger quick_replies_version before update on public.quick_replies
  for each row execute function private.bump_row_version();
create trigger quick_replies_require_reason before insert or update or delete on public.quick_replies
  for each row execute function private.require_change_reason();
create trigger quick_replies_audit after insert or update or delete on public.quick_replies
  for each row execute function private.audit_row();

alter table public.quick_replies enable row level security;
create policy quick_replies_select on public.quick_replies
  for select to authenticated using (
    case when detail_center_id is null
         then exists (select 1 from public.detail_centers c where c.organization_id = quick_replies.organization_id
                       and private.can_use_leads(c.id))
         else private.can_use_leads(detail_center_id) end);
revoke all on public.quick_replies from anon;
revoke insert, update, delete, truncate on public.quick_replies from authenticated;

create function public.upsert_quick_reply(
  p_organization_id uuid,
  p_id uuid,
  p_version integer,
  p_detail_center_id uuid,
  p_title text,
  p_body text,
  p_active boolean,
  p_reason text
) returns public.quick_replies
language plpgsql security definer set search_path = '' as $$
declare
  q public.quick_replies;
begin
  if not private.can_manage_quick_replies(p_organization_id, p_detail_center_id) then
    raise exception 'Sin permiso para administrar respuestas rápidas aquí' using errcode = '42501';
  end if;
  if coalesce(p_body, '') ~ '\{(?!(nombre|centro)\})[^}]*\}' then
    raise exception 'Las respuestas rápidas sólo admiten {nombre} y {centro}' using errcode = 'MG002';
  end if;
  perform private.set_change_reason(p_reason);
  if p_id is null then
    insert into public.quick_replies (organization_id, detail_center_id, title, body, active)
    values (p_organization_id, p_detail_center_id, btrim(p_title), btrim(p_body), coalesce(p_active, true))
    returning * into q;
    return q;
  end if;
  select * into q from public.quick_replies where id = p_id and organization_id = p_organization_id for update;
  if not found or not private.can_manage_quick_replies(q.organization_id, q.detail_center_id) then
    raise exception 'Respuesta rápida inexistente o sin permiso' using errcode = '42501';
  end if;
  if q.version <> p_version then
    raise exception 'La respuesta rápida cambió en otro dispositivo; recarga' using errcode = '40001';
  end if;
  update public.quick_replies
     set detail_center_id = p_detail_center_id, title = btrim(p_title), body = btrim(p_body), active = coalesce(p_active, true)
   where id = q.id returning * into q;
  return q;
end;
$$;

create function public.list_quick_replies(p_organization_id uuid, p_detail_center_id uuid default null)
returns table (
  id uuid,
  detail_center_id uuid,
  detail_center_name text,
  title text,
  body text,
  active boolean,
  version integer,
  can_manage boolean
)
language sql stable security definer set search_path = '' as $$
  select q.id, q.detail_center_id, dc.name, q.title, q.body, q.active, q.version,
         private.can_manage_quick_replies(q.organization_id, q.detail_center_id)
    from public.quick_replies q
    left join public.detail_centers dc on dc.id = q.detail_center_id
   where q.organization_id = p_organization_id
     and (p_detail_center_id is null or q.detail_center_id is null or q.detail_center_id = p_detail_center_id)
     and (case when q.detail_center_id is null
               then exists (select 1 from public.detail_centers c where c.organization_id = q.organization_id
                             and private.can_use_leads(c.id))
               else private.can_use_leads(q.detail_center_id) end)
   order by q.active desc, q.title;
$$;

-- ---------------------------------------------------------------------------
-- 4. Respuestas sin duplicar
-- ---------------------------------------------------------------------------

drop function public.prepare_outbound_message(uuid, uuid, text);
create function public.prepare_outbound_message(
  p_conversation_id uuid,
  p_request_id uuid,
  p_body text,
  p_expected_last_message_at timestamptz default null
)
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
  -- Otro usuario respondió o llegó un mensaje nuevo mientras se escribía.
  if p_expected_last_message_at is not null and c.last_message_at > p_expected_last_message_at + interval '1 second' then
    raise exception 'La conversación cambió mientras escribías (alguien más respondió o llegó un mensaje). Revísala antes de enviar.'
      using errcode = '40001';
  end if;
  if length(txt) not between 1 and 4096 then
    raise exception 'Escribe el mensaje (máximo 4096 caracteres)' using errcode = '22023';
  end if;
  select * into a from public.channel_accounts where id = c.channel_account_id;
  if not a.active or a.status <> 'verificada' then
    raise exception 'La cuenta de este canal no está verificada; revisa Integraciones' using errcode = 'MG002';
  end if;
  if not private.conversation_window_open(c) then
    raise exception 'Pasaron más de 24 h desde el último mensaje del contacto: sólo se permiten plantillas aprobadas de WhatsApp.'
      using errcode = 'MG002';
  end if;
  insert into public.messages (organization_id, detail_center_id, conversation_id, direction, message_type, body, status,
                               sent_by, request_id)
  values (c.organization_id, c.detail_center_id, c.id, 'saliente', 'text', txt, 'pendiente', auth.uid(), p_request_id)
  returning * into m;
  return query select m.id, c.channel, a.external_account_id, c.contact_external_id, c.contact_phone, m.body, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Plantillas de WhatsApp
-- ---------------------------------------------------------------------------

create table public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- WhatsApp Business Account (WABA) dueña de la plantilla.
  business_account_id text not null check (business_account_id ~ '^[0-9]{5,30}$'),
  name text not null check (name ~ '^[a-z0-9_]+$' and length(name) <= 512),
  language text not null check (language ~ '^[a-z]{2,3}(_[A-Z]{2})?$'),
  category text not null check (category in ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  -- Estado que reporta Meta (APPROVED, PENDING, REJECTED, PAUSED, DISABLED…).
  status text not null check (status ~ '^[A-Z_]{3,30}$'),
  body_text text check (body_text is null or length(body_text) <= 1024),
  param_count integer not null default 0 check (param_count between 0 and 20),
  synced_at timestamptz not null default now(),
  unique (organization_id, business_account_id, name, language)
);

alter table public.whatsapp_templates enable row level security;
create policy whatsapp_templates_select on public.whatsapp_templates
  for select to authenticated using (
    exists (select 1 from public.detail_centers c where c.organization_id = whatsapp_templates.organization_id
             and private.can_use_leads(c.id)));
revoke all on public.whatsapp_templates from anon;
revoke insert, update, delete, truncate on public.whatsapp_templates from authenticated;

-- El admin pide la sincronización (la hace el servidor con su token).
create function public.can_sync_whatsapp_templates(p_organization_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage_channels(p_organization_id);
$$;

-- Sólo el servidor: reemplaza el catálogo de la WABA con lo que devolvió Meta.
create function public.record_whatsapp_templates(p_organization_id uuid, p_business_account_id text, p_items jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if not private.is_service_request() then
    raise exception 'Sólo el servidor registra las plantillas de Meta' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Formato inválido' using errcode = '22023';
  end if;
  delete from public.whatsapp_templates t
   where t.organization_id = p_organization_id and t.business_account_id = p_business_account_id
     and not exists (select 1 from jsonb_array_elements(p_items) i
                      where i ->> 'name' = t.name and i ->> 'language' = t.language);
  insert into public.whatsapp_templates (organization_id, business_account_id, name, language, category, status, body_text,
                                         param_count, synced_at)
  select p_organization_id, p_business_account_id, i ->> 'name', i ->> 'language', i ->> 'category', i ->> 'status',
         left(i ->> 'body', 1024), coalesce((i ->> 'param_count')::integer, 0), now()
    from jsonb_array_elements(p_items) i
  on conflict (organization_id, business_account_id, name, language) do update
    set category = excluded.category, status = excluded.status, body_text = excluded.body_text,
        param_count = excluded.param_count, synced_at = now();
  get diagnostics n = row_count;
  return n;
end;
$$;

create function public.list_whatsapp_templates(p_organization_id uuid)
returns table (
  id uuid,
  name text,
  language text,
  category text,
  status text,
  body_text text,
  param_count integer,
  synced_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select t.id, t.name, t.language, t.category, t.status, t.body_text, t.param_count, t.synced_at
    from public.whatsapp_templates t
   where t.organization_id = p_organization_id
     and exists (select 1 from public.detail_centers c where c.organization_id = t.organization_id and private.can_use_leads(c.id))
   order by t.status = 'APPROVED' desc, t.name, t.language;
$$;

-- Deja «pendiente» un mensaje de plantilla (se permite fuera de las 24 h) y
-- devuelve lo necesario para enviarlo. Marketing exige consentimiento.
create function public.prepare_template_message(
  p_conversation_id uuid,
  p_request_id uuid,
  p_template_id uuid,
  p_params text[]
)
returns table (
  message_id uuid,
  channel text,
  external_account_id text,
  contact_external_id text,
  contact_phone text,
  body text,
  already_sent boolean,
  template_name text,
  template_language text,
  template_params text[]
)
language plpgsql security definer set search_path = '' as $$
declare
  c public.conversations;
  a public.channel_accounts;
  t public.whatsapp_templates;
  m public.messages;
  v_params text[] := coalesce((select array_agg(btrim(x) order by o) from unnest(p_params) with ordinality u(x, o)), '{}');
  v_body text;
  i integer;
begin
  c := private.lock_conversation(p_conversation_id, null);
  select * into t from public.whatsapp_templates where id = p_template_id and organization_id = c.organization_id;
  if not found then
    raise exception 'Plantilla inexistente' using errcode = '22023';
  end if;
  select * into m from public.messages x where x.conversation_id = c.id and x.request_id = p_request_id;
  if found then
    select * into a from public.channel_accounts where id = c.channel_account_id;
    return query select m.id, c.channel, a.external_account_id, c.contact_external_id, c.contact_phone, m.body,
                        m.status <> 'pendiente', t.name, t.language, v_params;
    return;
  end if;
  if c.channel <> 'whatsapp' then
    raise exception 'Las plantillas son de WhatsApp' using errcode = 'MG002';
  end if;
  select * into a from public.channel_accounts where id = c.channel_account_id;
  if not a.active or a.status <> 'verificada' then
    raise exception 'La cuenta de WhatsApp no está verificada; revisa Integraciones' using errcode = 'MG002';
  end if;
  if t.status <> 'APPROVED' then
    raise exception 'Sólo se envían plantillas aprobadas por Meta (esta está %)', t.status using errcode = 'MG002';
  end if;
  if t.category = 'AUTHENTICATION' then
    raise exception 'Las plantillas de autenticación no se envían desde la bandeja' using errcode = 'MG002';
  end if;
  if t.category = 'MARKETING' and not (
       exists (select 1 from public.leads l where l.id = c.lead_id and 'whatsapp' = any (l.consent_channels))
       or (c.client_id is not null and private.has_consent(c.client_id, 'whatsapp'))) then
    raise exception 'Plantilla de marketing: el contacto no autorizó recibir promociones por WhatsApp' using errcode = 'MG002';
  end if;
  if cardinality(v_params) <> t.param_count or exists (select 1 from unnest(v_params) x where length(x) not between 1 and 200) then
    raise exception 'La plantilla necesita % datos (cada uno de 1 a 200 caracteres)', t.param_count using errcode = '22023';
  end if;
  v_body := coalesce(t.body_text, t.name);
  for i in 1 .. cardinality(v_params) loop
    v_body := replace(v_body, '{{' || i || '}}', v_params[i]);
  end loop;
  insert into public.messages (organization_id, detail_center_id, conversation_id, direction, message_type, body, status,
                               sent_by, request_id)
  values (c.organization_id, c.detail_center_id, c.id, 'saliente', 'template', left(v_body, 4096), 'pendiente', auth.uid(),
          p_request_id)
  returning * into m;
  return query select m.id, c.channel, a.external_account_id, c.contact_external_id, c.contact_phone, m.body, false,
                      t.name, t.language, v_params;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  execute 'revoke all on function private.keep_note() from public, anon, authenticated';
  foreach fn in array array['private.can_manage_quick_replies(uuid, uuid)'] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.set_conversation_triage(uuid, integer, text, text[], boolean)',
    'public.list_conversations(uuid[], text, text, uuid, boolean, uuid, integer, boolean, text)',
    'public.add_conversation_note(uuid, uuid, text)',
    'public.conversation_notes_list(uuid)',
    'public.upsert_quick_reply(uuid, uuid, integer, uuid, text, text, boolean, text)',
    'public.list_quick_replies(uuid, uuid)',
    'public.prepare_outbound_message(uuid, uuid, text, timestamptz)',
    'public.can_sync_whatsapp_templates(uuid)',
    'public.list_whatsapp_templates(uuid)',
    'public.prepare_template_message(uuid, uuid, uuid, text[])'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  -- Sólo el servidor (valida is_service_request dentro).
  execute 'revoke all on function public.record_whatsapp_templates(uuid, text, jsonb) from public, anon, authenticated';
  execute 'grant execute on function public.record_whatsapp_templates(uuid, text, jsonb) to service_role';
end $$;

-- ---------------------------------------------------------------------------
-- Corrección: campaign_facts contaba los usos de promoción por día UTC
-- (d.created_at::date). Entre las 00:00 y las 06:00 UTC un descuento de «hoy»
-- en México caía en el día siguiente. Ahora usa la zona horaria del centro,
-- igual que los prospectos. Misma firma: se conservan los permisos.
-- ---------------------------------------------------------------------------

create or replace function public.campaign_facts(p_organization_id uuid, p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  campaign_id uuid,
  name text,
  objective text,
  status text,
  starts_on date,
  ends_on date,
  budget numeric,
  spend numeric,
  leads integer,
  contacted integer,
  quoted integer,
  booked integer,
  won integer,
  sales numeric,
  sales_cost numeric,
  sales_margin numeric,
  promo_uses integer,
  promo_discount numeric
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Periodo inválido (máximo 366 días)' using errcode = '22023';
  end if;
  return query
  with vis as (
    select c.id from public.detail_centers c
     where c.id = any (p_detail_center_ids) and c.organization_id = p_organization_id
       and private.can_read_commercial_metrics(c.id)
  ), l as (
    select l.*, o.total as o_total, o.cost_total as o_cost
      from public.leads l
      join public.detail_centers dc on dc.id = l.detail_center_id
      left join public.service_orders o on o.id = l.service_order_id and o.status = 'entregada'
     where l.campaign_id is not null
       and l.detail_center_id in (select id from vis)
       and (l.created_at at time zone dc.timezone)::date between p_from and p_to
  )
  select c.id, c.name, c.objective, c.status, c.starts_on, c.ends_on, c.budget,
         coalesce((select sum(s.amount) from public.campaign_spend s
                    where s.campaign_id = c.id and s.voided_at is null and s.spent_on between p_from and p_to), 0),
         (select count(*)::integer from l where l.campaign_id = c.id),
         (select count(*)::integer from l where l.campaign_id = c.id and l.first_contact_at is not null),
         (select count(*)::integer from l where l.campaign_id = c.id
            and exists (select 1 from public.lead_events e where e.lead_id = l.id and e.kind = 'cotizacion')),
         (select count(*)::integer from l where l.campaign_id = c.id
            and exists (select 1 from public.lead_events e where e.lead_id = l.id and e.kind = 'reserva')),
         (select count(*)::integer from l where l.campaign_id = c.id and l.status = 'ganada'),
         (select coalesce(sum(l.o_total), 0) from l where l.campaign_id = c.id),
         (select coalesce(sum(l.o_cost), 0) from l where l.campaign_id = c.id),
         (select coalesce(sum(l.o_total - l.o_cost), 0) from l where l.campaign_id = c.id),
         ((select count(*) from public.quote_discounts d join public.promotions p on p.id = d.promotion_id
            join public.quotes q on q.id = d.quote_id join public.detail_centers dc on dc.id = q.detail_center_id
           where p.campaign_id = c.id and d.voided_at is null and q.detail_center_id in (select id from vis)
             and (d.created_at at time zone dc.timezone)::date between p_from and p_to)
        + (select count(*) from public.service_order_discounts d join public.promotions p on p.id = d.promotion_id
            join public.service_orders o on o.id = d.service_order_id join public.detail_centers dc on dc.id = o.detail_center_id
           where p.campaign_id = c.id and d.voided_at is null and o.detail_center_id in (select id from vis)
             and (d.created_at at time zone dc.timezone)::date between p_from and p_to))::integer,
         coalesce((select sum(d.amount) from public.quote_discounts d join public.promotions p on p.id = d.promotion_id
                    join public.quotes q on q.id = d.quote_id join public.detail_centers dc on dc.id = q.detail_center_id
                   where p.campaign_id = c.id and d.voided_at is null and q.detail_center_id in (select id from vis)
                     and (d.created_at at time zone dc.timezone)::date between p_from and p_to), 0)
        + coalesce((select sum(d.amount) from public.service_order_discounts d join public.promotions p on p.id = d.promotion_id
                    join public.service_orders o on o.id = d.service_order_id join public.detail_centers dc on dc.id = o.detail_center_id
                   where p.campaign_id = c.id and d.voided_at is null and o.detail_center_id in (select id from vis)
                     and (d.created_at at time zone dc.timezone)::date between p_from and p_to), 0)
    from public.campaigns c
   where c.organization_id = p_organization_id
     and exists (select 1 from vis)
     and (c.detail_center_id is null or c.detail_center_id in (select id from vis))
     and c.starts_on <= p_to and c.ends_on >= p_from
   order by c.starts_on desc;
end;
$$;
