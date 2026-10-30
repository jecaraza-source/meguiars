-- Aviso por WhatsApp a clientes con membresía para que la usen.
--
-- Si una membresía activa tiene servicios incluidos sin usar en su periodo y el
-- cliente no ha venido en N días (configurable, 7 a 60), se le manda una
-- plantilla aprobada por Meta: «Hola {{1}}, le recordamos que su membresía
-- incluye {{2}}…». Reglas:
--
-- * Sólo a quien aceptó WhatsApp (contact_preferences.whatsapp = opted_in) y
--   tiene celular; nunca a clientes inactivos.
-- * Como máximo un aviso cada N días por membresía (tabla membership_reminders).
-- * Sólo entre 10:00 y 19:00 del centro (el cron corre cada hora).
-- * La plantilla es de utilidad o marketing, con 2 datos y sin botones: si el
--   cliente responde, lo atiende el asistente como cualquier mensaje.
--
-- La base decide a quién y prepara el mensaje en la conversación del cliente
-- (igual que los recordatorios de cita, ADR 0039); el servidor web lo envía con
-- el token de Meta desde /api/cron/recordatorios. ADR 0049.

-- ---------------------------------------------------------------------------
-- 1. Configuración
-- ---------------------------------------------------------------------------

alter table public.bot_settings
  add column membership_reminders_enabled boolean not null default false,
  add column membership_reminder_template_id uuid references public.whatsapp_templates (id) on delete set null,
  add column membership_reminder_days smallint not null default 14 check (membership_reminder_days between 7 and 60);
comment on column public.bot_settings.membership_reminder_template_id is
  'Plantilla aprobada (utilidad o marketing) con 2 datos ({{1}} nombre, {{2}} servicios disponibles) y sin botones.';
grant select (membership_reminders_enabled, membership_reminder_template_id, membership_reminder_days)
  on public.bot_settings to authenticated;

-- Reglas del aviso (espejo de MEMBERSHIP_REMINDER_RULES en el dominio).
create function private.membership_reminder_rules() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('param_count', 2, 'quick_replies', 0, 'from_hour', 10, 'to_hour', 19,
                            'min_days', 7, 'max_days', 60);
$$;

-- ¿Es hora de mandar avisos en el centro? (entre 10:00 y 19:00 de su zona).
create function private.membership_reminder_in_hours(p_timezone text) returns boolean
language sql stable set search_path = '' as $$
  select extract(hour from now() at time zone p_timezone)
         between (private.membership_reminder_rules() ->> 'from_hour')::integer
             and (private.membership_reminder_rules() ->> 'to_hour')::integer - 1;
$$;

-- Bitácora de avisos enviados (uno por membresía cada N días).
create table public.membership_reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null references public.detail_centers (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  client_id uuid not null,
  message_id uuid references public.messages (id) on delete set null,
  benefits_text text not null,
  sent boolean not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete cascade
);
create index membership_reminders_membership_idx on public.membership_reminders (membership_id, created_at desc);
alter table public.membership_reminders enable row level security;
create policy membership_reminders_select on public.membership_reminders
  for select to authenticated using (private.can_use_memberships(detail_center_id));
revoke all on public.membership_reminders from anon;
revoke insert, update, delete, truncate on public.membership_reminders from authenticated;
grant select on public.membership_reminders to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Configurar (admin) y leer
-- ---------------------------------------------------------------------------

create function public.set_membership_reminders(
  p_organization_id uuid,
  p_version integer,
  p_enabled boolean,
  p_template_id uuid,
  p_days integer,
  p_reason text
) returns public.bot_settings
language plpgsql security definer set search_path = '' as $$
declare
  s public.bot_settings;
  t public.whatsapp_templates;
  rules jsonb := private.membership_reminder_rules();
begin
  if not private.can_manage_assistant(p_organization_id) then
    raise exception 'Sólo el admin de la organización configura los avisos de membresía' using errcode = '42501';
  end if;
  select * into s from public.bot_settings where organization_id = p_organization_id for update;
  if not found then
    raise exception 'La organización no tiene configuración del asistente' using errcode = 'P0002';
  end if;
  if s.version <> p_version then
    raise exception 'La configuración cambió en otro dispositivo; recarga' using errcode = '40001';
  end if;
  if p_days is not null and (p_days < (rules ->> 'min_days')::integer or p_days > (rules ->> 'max_days')::integer) then
    raise exception 'Los días sin visita van de 7 a 60' using errcode = '22023';
  end if;
  if p_template_id is not null then
    select * into t from public.whatsapp_templates where id = p_template_id and organization_id = p_organization_id;
    if not found then
      raise exception 'Plantilla inexistente' using errcode = '22023';
    end if;
  end if;
  if coalesce(p_enabled, false) then
    if t.id is null then
      raise exception 'Elige la plantilla del aviso' using errcode = 'MG002';
    end if;
    if t.status <> 'APPROVED' or t.category not in ('UTILITY', 'MARKETING') then
      raise exception 'El aviso necesita una plantilla aprobada por Meta (utilidad o marketing)' using errcode = 'MG002';
    end if;
    if t.param_count <> (rules ->> 'param_count')::integer or t.quick_reply_count <> (rules ->> 'quick_replies')::integer then
      raise exception 'La plantilla debe tener 2 datos ({{1}} nombre, {{2}} servicios disponibles) y no llevar botones'
        using errcode = 'MG002';
    end if;
  end if;
  perform private.set_change_reason(p_reason);
  update public.bot_settings
     set membership_reminders_enabled = coalesce(p_enabled, false), membership_reminder_template_id = p_template_id,
         membership_reminder_days = coalesce(p_days, membership_reminder_days), updated_by = auth.uid()
   where organization_id = p_organization_id
   returning * into s;
  return s;
end;
$$;

create function public.get_membership_reminder_settings(p_organization_id uuid)
returns table (
  enabled boolean,
  template_id uuid,
  days smallint,
  sent_last_30_days bigint,
  version integer,
  can_manage boolean
)
language sql stable security definer set search_path = '' as $$
  select s.membership_reminders_enabled, s.membership_reminder_template_id, s.membership_reminder_days,
         (select count(*) from public.membership_reminders r
           where r.organization_id = s.organization_id and r.sent and r.created_at > now() - interval '30 days'),
         s.version, private.can_manage_assistant(s.organization_id)
    from public.bot_settings s
   where s.organization_id = p_organization_id and private.can_read_assistant(s.organization_id);
$$;

-- ---------------------------------------------------------------------------
-- 3. A quién le toca (sólo el servidor)
-- ---------------------------------------------------------------------------

-- «2 Lavado, 1 Encerado»: servicios incluidos que le quedan en el periodo actual.
create function private.membership_benefits_left(p_membership_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select string_agg(b.remaining || ' ' || b.service_name, ', ' order by b.service_name)
    from public.membership_balance(p_membership_id) b
   where b.remaining > 0;
$$;

create function public.membership_reminders_due(p_limit integer default 50)
returns table (membership_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_service_request() then
    raise exception 'Sólo el servidor envía avisos de membresía' using errcode = '42501';
  end if;
  return query
    select m.id
      from public.memberships m
      join public.bot_settings s on s.organization_id = m.organization_id
      join public.clients cl on cl.id = m.client_id
      join public.detail_centers dc on dc.id = m.detail_center_id
     where s.membership_reminders_enabled and s.membership_reminder_template_id is not null
       and private.membership_status(m.state, m.ends_on, m.renewal_notice_days, private.center_today(m.detail_center_id))
           in ('activa', 'proxima_a_vencer')
       and cl.active and cl.phone is not null
       and exists (select 1 from public.contact_preferences cp
                    where cp.client_id = cl.id and cp.channel = 'whatsapp' and cp.opted_in)
       -- Entre 10:00 y 19:00 del centro.
       and private.membership_reminder_in_hours(dc.timezone)
       -- Sin visita ni uso en N días (ni membresía recién vendida).
       and greatest(coalesce(cl.last_visit_at, '-infinity'::timestamptz),
                    coalesce((select max(r.redeemed_at) from public.membership_redemptions r
                               where r.membership_id = m.id and r.voided_at is null), '-infinity'::timestamptz),
                    m.created_at)
           <= now() - make_interval(days => s.membership_reminder_days)
       -- Un aviso cada N días por membresía.
       and not exists (select 1 from public.membership_reminders x
                        where x.membership_id = m.id
                          and x.created_at > now() - make_interval(days => s.membership_reminder_days))
       and private.membership_benefits_left(m.id) is not null
     order by m.created_at
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Preparar el mensaje (sólo el servidor)
-- ---------------------------------------------------------------------------

-- Deja «pendiente» el aviso en la conversación de WhatsApp del cliente (la crea
-- si no existe) y devuelve lo que el servidor necesita para enviarlo. Registra
-- el aviso aunque no se pueda enviar, para no insistir cada hora.
create function public.prepare_membership_reminder(p_membership_id uuid)
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
  mb public.memberships;
  s public.bot_settings;
  t public.whatsapp_templates;
  cl public.clients;
  acc public.channel_accounts;
  conv public.conversations;
  m public.messages;
  v_benefits text;
  v_params text[];
  v_body text;
  i integer;
begin
  if not private.is_service_request() then
    raise exception 'Sólo el servidor envía avisos de membresía' using errcode = '42501';
  end if;
  select * into mb from public.memberships where id = p_membership_id for update;
  if not found then
    raise exception 'Membresía inexistente' using errcode = 'P0002';
  end if;
  select * into s from public.bot_settings where organization_id = mb.organization_id;
  select * into t from public.whatsapp_templates where id = s.membership_reminder_template_id;
  select * into cl from public.clients where id = mb.client_id;
  v_benefits := coalesce(private.membership_benefits_left(mb.id), '');
  -- {{1}} nombre, {{2}} servicios disponibles.
  v_params := array[split_part(cl.full_name, ' ', 1), v_benefits];
  -- Reintento del mismo aviso (aún dentro de los N días): devuelve el mismo mensaje.
  select ms.* into m
    from public.membership_reminders x join public.messages ms on ms.id = x.message_id
   where x.membership_id = mb.id and x.created_at > now() - make_interval(days => s.membership_reminder_days)
   order by x.created_at desc
   limit 1;
  if m.id is not null then
    select * into conv from public.conversations where id = m.conversation_id;
    select * into acc from public.channel_accounts where id = conv.channel_account_id;
    return query select m.id, acc.external_account_id, conv.contact_external_id, conv.contact_phone, m.body,
                        m.status <> 'pendiente', t.name, t.language, v_params, '{}'::text[];
    return;
  end if;
  select * into acc from public.channel_accounts x
   where x.organization_id = mb.organization_id and x.channel = 'whatsapp' and x.active and x.status = 'verificada'
   order by x.detail_center_id = mb.detail_center_id desc, x.created_at
   limit 1;
  if not s.membership_reminders_enabled or t.id is null or t.status <> 'APPROVED' or acc.id is null
     or v_benefits = '' or cl.phone is null then
    -- Sin configuración válida o sin beneficios: queda registrado sin enviar.
    insert into public.membership_reminders (organization_id, detail_center_id, membership_id, client_id, benefits_text, sent)
    values (mb.organization_id, mb.detail_center_id, mb.id, cl.id, v_benefits, false);
    return;
  end if;
  perform private.set_change_reason('Aviso de membresía por WhatsApp');
  select * into conv from public.conversations x
   where x.channel_account_id = acc.id
     and (x.client_id = cl.id or private.whatsapp_phone(x.contact_phone) = cl.phone)
   order by x.client_id = cl.id desc, x.last_message_at desc nulls last
   limit 1;
  if conv.id is null then
    insert into public.conversations (organization_id, detail_center_id, channel_account_id, channel, contact_external_id,
                                      contact_phone, contact_name, client_id, last_message_at, status)
    values (mb.organization_id, mb.detail_center_id, acc.id, 'whatsapp', private.whatsapp_contact_id(cl.phone), cl.phone,
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
                               sent_by, sent_by_bot, request_id)
  values (conv.organization_id, conv.detail_center_id, conv.id, 'saliente', 'template', left(v_body, 4096), 'pendiente',
          null, true, gen_random_uuid())
  returning * into m;
  insert into public.membership_reminders (organization_id, detail_center_id, membership_id, client_id, message_id,
                                           benefits_text, sent)
  values (mb.organization_id, mb.detail_center_id, mb.id, cl.id, m.id, v_benefits, true);
  update public.conversations set last_message_at = greatest(last_message_at, now()),
                                  last_message_preview = left(m.body, 160)
   where id = conv.id;
  return query select m.id, acc.external_account_id, conv.contact_external_id, conv.contact_phone, m.body, false,
                      t.name, t.language, v_params, '{}'::text[];
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.membership_reminder_rules()',
    'private.membership_reminder_in_hours(text)',
    'private.membership_benefits_left(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.set_membership_reminders(uuid, integer, boolean, uuid, integer, text)',
    'public.get_membership_reminder_settings(uuid)',
    'public.membership_reminders_due(integer)',
    'public.prepare_membership_reminder(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end $$;
