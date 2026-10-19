-- Recordatorios de cita por WhatsApp (asistente F2, parte 2): una plantilla
-- aprobada de utilidad con botones «Confirmar» y «Reagendar», enviada unas
-- horas antes de cada cita programada. Ver ADR 0039.
--
-- * bot_settings: recordatorios encendidos, plantilla y horas de anticipación.
-- * whatsapp_templates.quick_reply_count: botones de respuesta rápida de la
--   plantilla (el recordatorio exige 2).
-- * appointments.reminder_sent_at / reminder_message_id: un recordatorio por
--   cita (aunque el envío falle, no se reintenta para no insistir al cliente).
-- * appointments.confirmed_at: el cliente tocó «Confirmar» en el recordatorio.
-- * Cada hora pg_cron llama a /api/cron/recordatorios (pg_net) con la URL y
--   el secreto guardados en Supabase Vault; el servidor web envía con el token
--   de Meta. Sin Vault configurado no hace nada.

-- ---------------------------------------------------------------------------
-- 1. Columnas
-- ---------------------------------------------------------------------------

alter table public.whatsapp_templates
  add column quick_reply_count smallint not null default 0 check (quick_reply_count between 0 and 10);
comment on column public.whatsapp_templates.quick_reply_count is
  'Botones de respuesta rápida de la plantilla (los manda Meta al sincronizar).';

alter table public.bot_settings
  add column reminders_enabled boolean not null default false,
  add column reminder_template_id uuid references public.whatsapp_templates (id) on delete set null,
  add column reminder_hours smallint not null default 24 check (reminder_hours between 2 and 72);
comment on column public.bot_settings.reminder_template_id is
  'Plantilla de utilidad aprobada con 3 datos ({{1}} nombre, {{2}} fecha y hora, {{3}} centro) y 2 botones (Confirmar, Reagendar).';

alter table public.appointments
  add column confirmed_at timestamptz,
  add column reminder_sent_at timestamptz,
  add column reminder_message_id uuid;
comment on column public.appointments.confirmed_at is 'El cliente confirmó su asistencia con el botón del recordatorio.';
comment on column public.appointments.reminder_sent_at is 'Se preparó el recordatorio de WhatsApp (uno por cita).';

-- Reglas del recordatorio (espejo de REMINDER_RULES en el dominio).
create function private.reminder_rules() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('param_count', 3, 'quick_replies', 2, 'min_notice_hours', 12, 'min_lead_hours', 2);
$$;

-- ---------------------------------------------------------------------------
-- 2. Plantillas: se guardan los botones que reporta Meta
-- ---------------------------------------------------------------------------

create or replace function public.record_whatsapp_templates(p_organization_id uuid, p_business_account_id text, p_items jsonb)
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
                                         param_count, quick_reply_count, synced_at)
  select p_organization_id, p_business_account_id, i ->> 'name', i ->> 'language', i ->> 'category', i ->> 'status',
         left(i ->> 'body', 1024), coalesce((i ->> 'param_count')::integer, 0),
         least(greatest(coalesce((i ->> 'quick_replies')::integer, 0), 0), 10), now()
    from jsonb_array_elements(p_items) i
  on conflict (organization_id, business_account_id, name, language) do update
    set category = excluded.category, status = excluded.status, body_text = excluded.body_text,
        param_count = excluded.param_count, quick_reply_count = excluded.quick_reply_count, synced_at = now();
  get diagnostics n = row_count;
  return n;
end;
$$;

drop function public.list_whatsapp_templates(uuid);
create function public.list_whatsapp_templates(p_organization_id uuid)
returns table (
  id uuid,
  name text,
  language text,
  category text,
  status text,
  body_text text,
  param_count integer,
  quick_reply_count smallint,
  synced_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select t.id, t.name, t.language, t.category, t.status, t.body_text, t.param_count, t.quick_reply_count, t.synced_at
    from public.whatsapp_templates t
   where t.organization_id = p_organization_id
     and exists (select 1 from public.detail_centers c where c.organization_id = t.organization_id and private.can_use_leads(c.id))
   order by t.status = 'APPROVED' desc, t.name, t.language;
$$;

-- ---------------------------------------------------------------------------
-- 3. Configuración (admin de la organización)
-- ---------------------------------------------------------------------------

create function public.set_assistant_reminders(
  p_organization_id uuid,
  p_version integer,
  p_enabled boolean,
  p_template_id uuid,
  p_hours integer,
  p_reason text
) returns public.bot_settings
language plpgsql security definer set search_path = '' as $$
declare
  s public.bot_settings;
  t public.whatsapp_templates;
  rules jsonb := private.reminder_rules();
begin
  if not private.can_manage_assistant(p_organization_id) then
    raise exception 'Sólo el admin de la organización configura los recordatorios' using errcode = '42501';
  end if;
  select * into s from public.bot_settings where organization_id = p_organization_id for update;
  if not found then
    raise exception 'La organización no tiene configuración del asistente' using errcode = 'P0002';
  end if;
  if s.version <> p_version then
    raise exception 'La configuración cambió en otro dispositivo; recarga' using errcode = '40001';
  end if;
  if p_template_id is not null then
    select * into t from public.whatsapp_templates where id = p_template_id and organization_id = p_organization_id;
    if not found then
      raise exception 'Plantilla inexistente' using errcode = '22023';
    end if;
  end if;
  if coalesce(p_enabled, false) then
    if t.id is null then
      raise exception 'Elige la plantilla del recordatorio' using errcode = 'MG002';
    end if;
    if t.status <> 'APPROVED' or t.category <> 'UTILITY' then
      raise exception 'El recordatorio necesita una plantilla de utilidad aprobada por Meta' using errcode = 'MG002';
    end if;
    if t.param_count <> (rules ->> 'param_count')::integer or t.quick_reply_count <> (rules ->> 'quick_replies')::integer then
      raise exception 'La plantilla debe tener 3 datos ({{1}} nombre, {{2}} fecha y hora, {{3}} centro) y 2 botones (Confirmar, Reagendar)'
        using errcode = 'MG002';
    end if;
  end if;
  perform private.set_change_reason(p_reason);
  update public.bot_settings
     set reminders_enabled = coalesce(p_enabled, false), reminder_template_id = p_template_id,
         reminder_hours = coalesce(p_hours, reminder_hours), updated_by = auth.uid()
   where organization_id = p_organization_id
   returning * into s;
  return s;
end;
$$;

-- La configuración muestra también los recordatorios.
drop function public.get_assistant_settings(uuid);
create function public.get_assistant_settings(p_organization_id uuid)
returns table (
  mode text,
  model text,
  assistant_name text,
  tone text,
  greeting text,
  privacy_url text,
  human_hours text,
  after_hours_message text,
  center_choice text,
  max_days_ahead smallint,
  min_hours_ahead smallint,
  mention_promotions boolean,
  mention_memberships boolean,
  test_numbers text[],
  self_booking boolean,
  reminders_enabled boolean,
  reminder_template_id uuid,
  reminder_hours smallint,
  version integer,
  updated_at timestamptz,
  can_manage boolean
)
language sql stable security definer set search_path = '' as $$
  select s.mode, s.model, s.assistant_name, s.tone, s.greeting, s.privacy_url, s.human_hours, s.after_hours_message,
         s.center_choice, s.max_days_ahead, s.min_hours_ahead, s.mention_promotions, s.mention_memberships,
         case when private.can_manage_assistant(s.organization_id) then s.test_numbers else '{}'::text[] end,
         s.self_booking, s.reminders_enabled, s.reminder_template_id, s.reminder_hours,
         s.version, s.updated_at, private.can_manage_assistant(s.organization_id)
    from public.bot_settings s
   where s.organization_id = p_organization_id and private.can_read_assistant(s.organization_id);
$$;

-- ---------------------------------------------------------------------------
-- 4. Recordatorios (sólo el servidor)
-- ---------------------------------------------------------------------------

-- Identificador de WhatsApp del contacto a partir del teléfono del cliente: los
-- celulares de México los reporta WhatsApp como 521XXXXXXXXXX.
create function private.whatsapp_contact_id(p_phone text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case when p_phone ~ '^\+52[0-9]{10}$' then '521' || right(p_phone, 10)
              else regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') end;
$$;

-- Citas a las que toca enviar recordatorio: programadas, dentro de las horas
-- configuradas, agendadas con suficiente anticipación y sin recordatorio.
create function public.reminders_due(p_limit integer default 50)
returns table (appointment_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare
  rules jsonb := private.reminder_rules();
begin
  if not private.is_service_request() then
    raise exception 'Sólo el servidor envía recordatorios' using errcode = '42501';
  end if;
  return query
    select a.id
      from public.appointments a
      join public.bot_settings s on s.organization_id = a.organization_id
      join public.clients cl on cl.id = a.client_id
     where s.reminders_enabled and s.reminder_template_id is not null
       and a.status = 'programada' and a.reminder_sent_at is null
       and a.starts_at <= now() + make_interval(hours => s.reminder_hours)
       and a.starts_at > now() + make_interval(hours => (rules ->> 'min_lead_hours')::integer)
       and a.created_at <= a.starts_at - make_interval(hours => (rules ->> 'min_notice_hours')::integer)
       and cl.active
     order by a.starts_at
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- Deja «pendiente» el recordatorio de la cita (plantilla con botones) en la
-- conversación de WhatsApp del cliente (la crea si no existe) y devuelve lo que
-- el servidor necesita para enviarlo. Idempotente por cita.
create function public.prepare_appointment_reminder(p_appointment_id uuid)
returns table (
  message_id uuid,
  external_account_id text,
  contact_external_id text,
  contact_phone text,
  body text,
  already_sent boolean,
  template_name text,
  template_language text,
  template_params text[],
  button_payloads text[]
)
language plpgsql security definer set search_path = '' as $$
declare
  a public.appointments;
  s public.bot_settings;
  t public.whatsapp_templates;
  cl public.clients;
  dc public.detail_centers;
  acc public.channel_accounts;
  conv public.conversations;
  m public.messages;
  v_params text[];
  v_payloads text[];
  v_body text;
  i integer;
begin
  if not private.is_service_request() then
    raise exception 'Sólo el servidor envía recordatorios' using errcode = '42501';
  end if;
  select * into a from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'Cita inexistente' using errcode = 'P0002';
  end if;
  select * into s from public.bot_settings where organization_id = a.organization_id;
  select * into t from public.whatsapp_templates where id = s.reminder_template_id;
  select * into cl from public.clients where id = a.client_id;
  select * into dc from public.detail_centers where id = a.detail_center_id;
  -- {{1}} nombre, {{2}} fecha y hora (zona del centro), {{3}} centro.
  v_params := array[split_part(cl.full_name, ' ', 1), private.es_when(a.starts_at, dc.timezone), dc.name];
  v_payloads := array['recordatorio:confirmar:' || a.id, 'recordatorio:reagendar:' || a.id];
  if a.reminder_message_id is not null then
    select * into m from public.messages where id = a.reminder_message_id;
    select * into conv from public.conversations where id = m.conversation_id;
    select * into acc from public.channel_accounts where id = conv.channel_account_id;
    return query select m.id, acc.external_account_id, conv.contact_external_id, conv.contact_phone, m.body,
                        m.status <> 'pendiente', t.name, t.language, v_params, v_payloads;
    return;
  end if;
  -- Cuenta de WhatsApp verificada de la organización: la del centro de la cita o, si no hay, la que exista.
  select * into acc from public.channel_accounts x
   where x.organization_id = a.organization_id and x.channel = 'whatsapp' and x.active and x.status = 'verificada'
   order by x.detail_center_id = a.detail_center_id desc, x.created_at
   limit 1;
  perform private.set_change_reason('Recordatorio de cita por WhatsApp');
  if not s.reminders_enabled or t.id is null or t.status <> 'APPROVED' or acc.id is null then
    -- Sin configuración válida: no se envía, pero queda marcado para no reintentar cada hora.
    update public.appointments set reminder_sent_at = now() where id = a.id;
    return;
  end if;
  -- Conversación del cliente en esa cuenta (por cliente ligado o por teléfono) o una nueva.
  select * into conv from public.conversations x
   where x.channel_account_id = acc.id
     and (x.client_id = cl.id or private.whatsapp_phone(x.contact_phone) = cl.phone)
   order by x.client_id = cl.id desc, x.last_message_at desc nulls last
   limit 1;
  if conv.id is null then
    insert into public.conversations (organization_id, detail_center_id, channel_account_id, channel, contact_external_id,
                                      contact_phone, contact_name, client_id, last_message_at, status)
    values (a.organization_id, a.detail_center_id, acc.id, 'whatsapp', private.whatsapp_contact_id(cl.phone), cl.phone,
            left(cl.full_name, 120), cl.id, now(), 'cerrada')
    on conflict on constraint conversations_channel_account_id_contact_external_id_key
      do update set client_id = coalesce(public.conversations.client_id, excluded.client_id)
    returning * into conv;
  end if;
  v_body := coalesce(t.body_text, t.name);
  for i in 1 .. cardinality(v_params) loop
    v_body := replace(v_body, '{{' || i || '}}', v_params[i]);
  end loop;
  insert into public.messages (organization_id, detail_center_id, conversation_id, direction, message_type, body, status,
                               sent_by, sent_by_bot, request_id, buttons)
  values (conv.organization_id, conv.detail_center_id, conv.id, 'saliente', 'template', left(v_body, 4096), 'pendiente',
          null, true, a.id,
          jsonb_build_array(jsonb_build_object('id', v_payloads[1], 'titulo', 'Confirmar'),
                            jsonb_build_object('id', v_payloads[2], 'titulo', 'Reagendar')))
  returning * into m;
  update public.appointments set reminder_sent_at = now(), reminder_message_id = m.id where id = a.id;
  update public.conversations set last_message_at = greatest(last_message_at, now()),
                                  last_message_preview = left(m.body, 160)
   where id = conv.id;
  return query select m.id, acc.external_account_id, conv.contact_external_id, conv.contact_phone, m.body, false,
                      t.name, t.language, v_params, v_payloads;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. El botón del recordatorio
-- ---------------------------------------------------------------------------

-- «recordatorio:confirmar:<cita>» confirma la asistencia (sin IA).
-- «recordatorio:reagendar:<cita>» lo atiende el asistente (handled = false).
create function private.handle_reminder_button(m public.messages) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  action text := split_part(m.payload, ':', 2);
  a public.appointments;
  dc public.detail_centers;
  txt text;
begin
  if action <> 'confirmar' then
    return jsonb_build_object('handled', false);
  end if;
  select * into a from public.appointments x
   where x.id = split_part(m.payload, ':', 3)::uuid and x.organization_id = m.organization_id for update;
  -- Sólo el cliente de la cita (su conversación del recordatorio o su teléfono).
  if not found or not (
       exists (select 1 from public.messages r where r.id = a.reminder_message_id and r.conversation_id = m.conversation_id)
       or coalesce(private.conversation_client(m.conversation_id) = a.client_id, false)) then
    return jsonb_build_object('handled', false);
  end if;
  select * into dc from public.detail_centers where id = a.detail_center_id;
  if a.status <> 'programada' then
    txt := 'Esa cita ya no está activa. Si quiere, le ayudo a agendar otra.';
  else
    if a.confirmed_at is null then
      perform private.set_change_reason('El cliente confirmó su asistencia en el recordatorio de WhatsApp');
      update public.appointments set confirmed_at = now() where id = a.id;
    end if;
    txt := 'Gracias por confirmar. Le esperamos el ' || private.es_when(a.starts_at, dc.timezone) || ' en ' || dc.name || '.';
  end if;
  return jsonb_build_object('handled', true, 'text', txt);
end;
$$;

-- El botón del recordatorio pasa por el mismo punto de entrada que los de las citas propuestas.
create or replace function public.assistant_handle_button(p_message_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m public.messages;
  v public.conversations;
  ac public.channel_accounts;
  c public.detail_centers;
  p public.bot_booking_proposals;
  out_msg public.messages;
  action text;
  pid uuid;
  r jsonb;
  txt text;
begin
  if not private.is_service_request() then
    raise exception 'Sólo el servidor ejecuta el asistente' using errcode = '42501';
  end if;
  select * into m from public.messages where id = p_message_id and direction = 'entrante';
  if found and coalesce(m.payload, '') ~ '^recordatorio:(confirmar|reagendar):[0-9a-f-]{36}$' then
    select * into v from public.conversations where id = m.conversation_id for update;
    select * into ac from public.channel_accounts where id = v.channel_account_id;
    -- Reintento: misma respuesta.
    select * into out_msg from public.messages x where x.conversation_id = v.id and x.request_id = m.id;
    if found then
      return jsonb_build_object('handled', true, 'reply', jsonb_build_object(
        'message_id', out_msg.id, 'channel', v.channel, 'external_account_id', ac.external_account_id,
        'contact_external_id', v.contact_external_id, 'contact_phone', v.contact_phone, 'body', out_msg.body,
        'already_sent', out_msg.status <> 'pendiente'));
    end if;
    r := private.handle_reminder_button(m);
    if not (r ->> 'handled')::boolean then
      return jsonb_build_object('handled', false);
    end if;
    txt := r ->> 'text';
    if not ac.active or ac.status <> 'verificada' or not private.conversation_window_open(v) then
      return jsonb_build_object('handled', true, 'reply', null);
    end if;
    insert into public.messages (organization_id, detail_center_id, conversation_id, direction, message_type, body, status,
                                 sent_by, sent_by_bot, request_id)
    values (v.organization_id, v.detail_center_id, v.id, 'saliente', 'text', txt, 'pendiente', null, true, m.id)
    returning * into out_msg;
    return jsonb_build_object('handled', true, 'reply', jsonb_build_object(
      'message_id', out_msg.id, 'channel', v.channel, 'external_account_id', ac.external_account_id,
      'contact_external_id', v.contact_external_id, 'contact_phone', v.contact_phone, 'body', out_msg.body,
      'already_sent', false));
  end if;
  if not found or coalesce(m.payload, '') !~ '^cita:(confirmar|cambiar):[0-9a-f-]{36}$' then
    return jsonb_build_object('handled', false);
  end if;
  action := split_part(m.payload, ':', 2);
  pid := split_part(m.payload, ':', 3)::uuid;
  select * into v from public.conversations where id = m.conversation_id for update;
  select * into p from public.bot_booking_proposals where id = pid and conversation_id = v.id for update;
  if not found then
    return jsonb_build_object('handled', false);
  end if;
  select * into c from public.detail_centers where id = p.detail_center_id;
  select * into ac from public.channel_accounts where id = v.channel_account_id;
  -- Reintento: ya se atendió este mismo botón (se devuelve la misma respuesta).
  select * into out_msg from public.messages x where x.conversation_id = v.id and x.request_id = m.id;
  if found or p.decided_message_id = m.id then
    return jsonb_build_object('handled', out_msg.id is not null or action = 'confirmar',
      'reply', case when out_msg.id is null then null else jsonb_build_object(
        'message_id', out_msg.id, 'channel', v.channel, 'external_account_id', ac.external_account_id,
        'contact_external_id', v.contact_external_id, 'contact_phone', v.contact_phone, 'body', out_msg.body,
        'already_sent', out_msg.status <> 'pendiente') end);
  end if;

  if action = 'cambiar' then
    if p.status = 'pendiente' then
      update public.bot_booking_proposals
         set status = 'descartada', result = 'El cliente pidió cambiar', decided_at = now(), decided_message_id = m.id
       where id = p.id;
    end if;
    return jsonb_build_object('handled', false);
  end if;

  if p.status = 'confirmada' then
    txt := case p.kind when 'cancelar' then 'Su cita ya quedó cancelada.' else 'Su cita ya quedó confirmada.' end;
  elsif p.status <> 'pendiente' then
    txt := 'Esa propuesta ya no está vigente. ¿Le muestro los horarios disponibles?';
  elsif p.expires_at < now() then
    update public.bot_booking_proposals
       set status = 'vencida', decided_at = now(), decided_message_id = m.id
     where id = p.id;
    txt := 'Esa propuesta ya venció. ¿Le muestro los horarios disponibles?';
  else
    r := private.booking_execute(p.id);
    if r ? 'error' then
      update public.bot_booking_proposals
         set status = 'fallida', result = left(r ->> 'error', 500), decided_at = now(), decided_message_id = m.id
       where id = p.id;
      txt := (r ->> 'error') || case when p.kind = 'cancelar' then ' Le paso con una persona del equipo si lo necesita.'
                                     else ' ¿Le muestro otros horarios?' end;
    else
      update public.bot_booking_proposals
         set status = 'confirmada', decided_at = now(), decided_message_id = m.id,
             appointment_id = (r ->> 'appointment_id')::uuid
       where id = p.id;
      select * into p from public.bot_booking_proposals where id = p.id;
      txt := case p.kind
        when 'agendar' then 'Listo, su cita quedó agendada para el ' || private.es_when(p.starts_at, c.timezone)
                            || ' en ' || c.name || '. Le esperamos.'
        when 'reagendar' then 'Listo, su cita quedó para el ' || private.es_when(p.starts_at, c.timezone)
                              || ' en ' || c.name || '.'
        else 'Listo, su cita quedó cancelada. Cuando guste, puede agendar otra por aquí.' end;
      -- El equipo lo ve en la bandeja (nota interna, nunca se envía a Meta).
      insert into public.conversation_notes (organization_id, detail_center_id, conversation_id, body, author_id, request_id)
      values (v.organization_id, v.detail_center_id, v.id,
              left('Asistente: el cliente confirmó por WhatsApp. ' || replace(p.summary, chr(10), ' · '), 2000), null, p.id)
      on conflict (conversation_id, request_id) do nothing;
      perform private.log_event(p.organization_id, p.detail_center_id, 'appointment.whatsapp_' || p.kind,
                                'public.appointments', p.appointment_id::text,
                                jsonb_build_object('proposal_id', p.id, 'conversation_id', v.id));
    end if;
  end if;

  if not ac.active or ac.status <> 'verificada' or not private.conversation_window_open(v) then
    return jsonb_build_object('handled', true, 'reply', null);
  end if;
  insert into public.messages (organization_id, detail_center_id, conversation_id, direction, message_type, body, status,
                               sent_by, sent_by_bot, request_id)
  values (v.organization_id, v.detail_center_id, v.id, 'saliente', 'text', txt, 'pendiente', null, true, m.id)
  returning * into out_msg;
  return jsonb_build_object('handled', true, 'reply', jsonb_build_object(
    'message_id', out_msg.id, 'channel', v.channel, 'external_account_id', ac.external_account_id,
    'contact_external_id', v.contact_external_id, 'contact_phone', v.contact_phone, 'body', out_msg.body,
    'already_sent', false));
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. La agenda muestra si el cliente confirmó y si se envió el recordatorio
-- ---------------------------------------------------------------------------

drop function public.list_appointments(uuid, date, public.appointment_status, uuid, uuid);
create function public.list_appointments(
  p_detail_center_id uuid,
  p_day date,
  p_status public.appointment_status default null,
  p_bay_id uuid default null,
  p_technician_id uuid default null
)
returns table (
  id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  duration_minutes integer,
  status public.appointment_status,
  is_walk_in boolean,
  conflict_override boolean,
  client_id uuid,
  client_name text,
  client_phone text,
  vehicle_id uuid,
  vehicle_label text,
  bay_id uuid,
  bay_name text,
  technician_id uuid,
  technician_name text,
  services text[],
  notes text,
  service_order_id uuid,
  source text,
  confirmed_at timestamptz,
  reminder_sent_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  with bounds as (
    select (p_day::timestamp at time zone dc.timezone) as day_start,
           ((p_day + 1)::timestamp at time zone dc.timezone) as day_end
    from public.detail_centers dc where dc.id = p_detail_center_id
  )
  select a.id, a.starts_at, a.ends_at, a.duration_minutes, a.status, a.is_walk_in, a.conflict_override,
         a.client_id, c.full_name, c.phone,
         a.vehicle_id, private.vehicle_label(v.make, v.model, v.year, v.plate),
         a.bay_id, b.name, a.technician_id, t.full_name,
         coalesce((select array_agg(s.name order by aps.position)
                     from public.appointment_services aps join public.services s on s.id = aps.service_id
                    where aps.appointment_id = a.id), '{}'),
         a.notes, a.service_order_id, a.source, a.confirmed_at, a.reminder_sent_at
  from public.appointments a
  cross join bounds
  left join public.clients c on c.id = a.client_id
  left join public.vehicles v on v.id = a.vehicle_id
  left join public.bays b on b.id = a.bay_id
  left join public.technicians t on t.id = a.technician_id
  where a.detail_center_id = p_detail_center_id
    and a.starts_at >= bounds.day_start and a.starts_at < bounds.day_end
    and (p_status is null or a.status = p_status)
    and (p_bay_id is null or a.bay_id = p_bay_id)
    and (p_technician_id is null or a.technician_id = p_technician_id)
  order by a.starts_at, b.name nulls last;
$$;

-- ---------------------------------------------------------------------------
-- 7. Cada hora: pg_cron llama al servidor web (pg_net) con la URL y el secreto
--    de Supabase Vault. Sin esos secretos (o sin pg_cron/pg_net, como en el
--    Postgres local de pruebas) no hace nada.
-- ---------------------------------------------------------------------------

create function private.call_reminders_endpoint() returns void
language plpgsql security definer set search_path = '' as $$
declare
  url text;
  secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return;
  end if;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'meguiars_web_url'$q$ into url;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'meguiars_cron_secret'$q$ into secret;
  if coalesce(url, '') !~ '^https://' or coalesce(secret, '') = '' then
    raise notice 'Recordatorios: faltan meguiars_web_url o meguiars_cron_secret en Vault';
    return;
  end if;
  execute $q$select net.http_get(url := $1, headers := jsonb_build_object('Authorization', 'Bearer ' || $2),
                                 timeout_milliseconds := 55000)$q$
    using rtrim(url, '/') || '/api/cron/recordatorios', secret;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_cron o pg_net no están disponibles: los recordatorios no se programan en esta base';
    return;
  end if;
  create extension if not exists pg_cron with schema pg_catalog;
  create extension if not exists pg_net with schema extensions;
  if exists (select 1 from cron.job where jobname = 'recordatorios-whatsapp') then
    perform cron.unschedule('recordatorios-whatsapp');
  end if;
  perform cron.schedule('recordatorios-whatsapp', '7 * * * *', 'select private.call_reminders_endpoint()');
end $$;

-- ---------------------------------------------------------------------------
-- 8. Permisos
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.reminder_rules()', 'private.whatsapp_contact_id(text)', 'private.handle_reminder_button(public.messages)',
    'private.call_reminders_endpoint()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.list_whatsapp_templates(uuid)',
    'public.set_assistant_reminders(uuid, integer, boolean, uuid, integer, text)',
    'public.get_assistant_settings(uuid)',
    'public.list_appointments(uuid, date, public.appointment_status, uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.reminders_due(integer)',
    'public.prepare_appointment_reminder(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
