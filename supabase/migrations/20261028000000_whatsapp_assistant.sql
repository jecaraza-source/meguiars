-- Asistente de WhatsApp (fases F0 y F1): un número central de la organización
-- atendido por un asistente con IA que SÓLO informa con datos de la plataforma.
--
-- * center_public_info / center_hours: dirección, teléfono, mapa, cómo llegar,
--   zonas cercanas, responsable de la bandeja y horario de cada centro. Los usa
--   el asistente (y cualquier comunicación al cliente); nunca se inventan.
-- * bot_settings: una fila por organización (apagado / prueba / activo, modelo,
--   nombre, tono, saludo, aviso de privacidad, reglas de agenda, números de prueba).
-- * bot_faqs: respuestas aprobadas por la organización (por centro u organización).
-- * bot_handoff_rules: cuándo el asistente pasa la conversación a una persona y a
--   quién; «el cliente pide una persona» no se puede desactivar.
-- * bot_service_settings: qué servicios ofrece el asistente, cuáles se pueden
--   agendar sin valoración y cuáles cambian de precio por tamaño (ése no se cotiza solo).
-- * conversations: estado del asistente por conversación (activo / pausado) y la
--   baja de promociones por WhatsApp pedida por el contacto.
-- * messages.sent_by_bot: los mensajes del asistente quedan marcados en la bandeja.
-- * bot_turns: una fila por mensaje atendido (idempotente frente a reintentos de
--   Meta): resultado, motivo de escalamiento, herramientas usadas y consumo de tokens.
--
-- Todo lo que el asistente lee o escribe pasa por RPC exclusivas de la llave de
-- servicio que reciben el turno en curso: el turno fija la organización y la
-- conversación, así una herramienta no puede leer datos de otra organización.
-- F1 no crea citas, cotizaciones ni cobros: muestra horarios libres y pasa la
-- conversación a una persona para confirmar.

-- ---------------------------------------------------------------------------
-- 1. Permisos
-- ---------------------------------------------------------------------------

-- Configurar el asistente: admin de la organización (igual que las cuentas oficiales).
create function private.can_manage_assistant(p_organization_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_org_role(p_organization_id, array['admin_socio']::public.app_role[]);
$$;

-- Datos públicos del centro: admin de la organización o admin/encargado del centro.
create function private.can_edit_center_info(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.detail_centers c
     where c.id = p_detail_center_id
       and (private.has_org_role(c.organization_id, array['admin_socio']::public.app_role[])
            or private.has_center_role(c.id, array['admin_socio', 'encargado']::public.app_role[])));
$$;

-- Leer la configuración: quien atiende la bandeja en algún centro de la organización.
create function private.can_read_assistant(p_organization_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_manage_assistant(p_organization_id)
      or exists (select 1 from public.detail_centers c
                  where c.organization_id = p_organization_id and private.can_use_leads(c.id));
$$;

-- ---------------------------------------------------------------------------
-- 2. Datos públicos y horario de los centros
-- ---------------------------------------------------------------------------

create table public.center_public_info (
  detail_center_id uuid primary key,
  organization_id uuid not null,
  address text check (address is null or length(btrim(address)) between 5 and 300),
  phone text check (phone is null or phone ~ '^[0-9 +()-]{7,25}$'),
  maps_url text check (maps_url is null or (maps_url ~ '^https://' and length(maps_url) <= 500)),
  directions text check (directions is null or length(btrim(directions)) between 2 and 500),
  -- Colonias o zonas cercanas: el asistente sugiere el centro más cercano.
  nearby_zones text[] not null default '{}' check (cardinality(nearby_zones) <= 40),
  -- Quién toma la conversación cuando el asistente la pasa a una persona.
  handoff_user_id uuid references auth.users (id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete cascade
);

-- Horario de atención por día ISO (1 = lunes … 7 = domingo); sin fila = cerrado.
create table public.center_hours (
  detail_center_id uuid not null,
  organization_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  opens_at time not null,
  closes_at time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (detail_center_id, weekday),
  check (closes_at > opens_at),
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- 3. Configuración del asistente
-- ---------------------------------------------------------------------------

create table public.bot_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  -- apagado: no responde · prueba: sólo a los números de prueba · activo: a todos.
  mode text not null default 'apagado' check (mode in ('apagado', 'prueba', 'activo')),
  model text not null default 'claude-opus-5-5'
    check (model in ('claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5')),
  assistant_name text not null default 'Asistente virtual' check (length(btrim(assistant_name)) between 2 and 40),
  tone text not null default 'Cordial, breve y claro; trata al cliente de usted.'
    check (length(btrim(tone)) between 3 and 300),
  greeting text check (greeting is null or length(btrim(greeting)) between 3 and 500),
  privacy_url text check (privacy_url is null or (privacy_url ~ '^https://' and length(privacy_url) <= 500)),
  human_hours text check (human_hours is null or length(btrim(human_hours)) between 3 and 200),
  after_hours_message text check (after_hours_message is null or length(btrim(after_hours_message)) between 3 and 500),
  -- colonia: pregunta la zona y sugiere el centro · lista: muestra los centros.
  center_choice text not null default 'colonia' check (center_choice in ('colonia', 'lista')),
  max_days_ahead smallint not null default 14 check (max_days_ahead between 1 and 60),
  min_hours_ahead smallint not null default 2 check (min_hours_ahead between 0 and 72),
  mention_promotions boolean not null default true,
  mention_memberships boolean not null default true,
  -- Celulares (sólo dígitos, con lada de país) que reciben respuestas en modo prueba.
  test_numbers text[] not null default '{}'
    check (cardinality(test_numbers) <= 20 and array_to_string(test_numbers, ',') ~ '^([0-9]{10,15}(,[0-9]{10,15})*)?$'),
  version integer not null default 1,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bot_faqs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- null = todos los centros.
  detail_center_id uuid,
  question text not null check (length(btrim(question)) between 3 and 300),
  answer text not null check (length(btrim(answer)) between 2 and 1000),
  position smallint not null default 100 check (position between 1 and 999),
  active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete cascade
);
create index bot_faqs_org_idx on public.bot_faqs (organization_id, active, position);

create table public.bot_handoff_rules (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (code in ('pide_persona', 'no_entiende', 'queja', 'descuento', 'b2b', 'fotos',
                                     'requiere_valoracion', 'garantia', 'agendar', 'falla_tecnica')),
  active boolean not null default true,
  -- null = responsable del centro (center_public_info.handoff_user_id).
  assign_to uuid references auth.users (id) on delete set null,
  message text check (message is null or length(btrim(message)) between 3 and 300),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, code),
  -- Pedir una persona siempre funciona; en F1 una persona confirma toda cita; y si el
  -- asistente falla, la conversación siempre pasa a una persona.
  check (active or code not in ('pide_persona', 'agendar', 'falla_tecnica'))
);

create table public.bot_service_settings (
  service_id uuid primary key,
  organization_id uuid not null,
  visible boolean not null default true,
  bookable boolean not null default true,
  price_varies_by_size boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, service_id) references public.services (organization_id, id) on delete cascade
);

comment on table public.bot_settings is
  'Configuración del asistente de WhatsApp por organización. La llave de la API de Claude vive sólo en el servidor (ANTHROPIC_API_KEY).';

-- ---------------------------------------------------------------------------
-- 4. Conversaciones, mensajes y turnos del asistente
-- ---------------------------------------------------------------------------

alter table public.conversations
  add column bot_status text not null default 'activo' check (bot_status in ('activo', 'pausado')),
  add column bot_paused_reason text check (bot_paused_reason is null or length(bot_paused_reason) <= 200),
  add column bot_paused_at timestamptz,
  -- Desde cuándo el asistente vuelve a atender (una respuesta humana anterior ya no lo pausa).
  add column bot_resumed_at timestamptz,
  -- El contacto pidió no recibir promociones por WhatsApp (aunque no esté ligado a un cliente).
  add column marketing_opt_out_at timestamptz,
  -- El cliente ya eligió centro (número central): el asistente no vuelve a preguntar.
  add column center_confirmed_at timestamptz,
  add constraint conversations_bot_paused_check
    check ((bot_status = 'pausado') = (bot_paused_at is not null));

alter table public.messages add column sent_by_bot boolean not null default false;
do $$
declare
  v_name text;
begin
  select conname into v_name from pg_constraint
   where conrelid = 'public.messages'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%sent_by IS NOT NULL%';
  execute format('alter table public.messages drop constraint %I', v_name);
end $$;
alter table public.messages
  add constraint messages_sender_check check (direction = 'entrante' or sent_by is not null or sent_by_bot),
  add constraint messages_bot_outbound_check check (not sent_by_bot or (direction = 'saliente' and sent_by is null));

-- El contenido (incluido quién lo envió) no se edita.
create or replace function private.keep_message_content() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los mensajes no se borran' using errcode = '42501';
  end if;
  if (new.conversation_id, new.direction, new.body, new.message_type, new.sent_by, new.sent_by_bot, new.occurred_at,
      new.organization_id)
     is distinct from
     (old.conversation_id, old.direction, old.body, old.message_type, old.sent_by, old.sent_by_bot, old.occurred_at,
      old.organization_id) then
    raise exception 'El contenido de un mensaje no se edita' using errcode = '42501';
  end if;
  return new;
end;
$$;

create table public.bot_turns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  conversation_id uuid not null,
  -- Un turno por mensaje entrante: los reintentos del webhook no responden dos veces.
  inbound_message_id uuid not null unique,
  status text not null default 'procesando'
    check (status in ('procesando', 'respondido', 'escalado', 'omitido', 'error')),
  skip_reason text check (skip_reason is null or length(skip_reason) <= 200),
  model text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  tool_calls jsonb not null default '[]'::jsonb check (jsonb_typeof(tool_calls) = 'array'),
  reply_message_id uuid,
  handoff_code text,
  error text check (error is null or length(error) <= 500),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, conversation_id) references public.conversations (organization_id, id) on delete cascade,
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete restrict
);
create index bot_turns_center_idx on public.bot_turns (detail_center_id, started_at desc);
create index bot_turns_conversation_idx on public.bot_turns (conversation_id, started_at desc);

-- ---------------------------------------------------------------------------
-- 5. Triggers
-- ---------------------------------------------------------------------------

create trigger center_public_info_updated_at before update on public.center_public_info
  for each row execute function private.set_updated_at();
create trigger center_hours_updated_at before update on public.center_hours
  for each row execute function private.set_updated_at();
create trigger bot_settings_updated_at before update on public.bot_settings
  for each row execute function private.set_updated_at();
create trigger bot_faqs_updated_at before update on public.bot_faqs
  for each row execute function private.set_updated_at();
create trigger bot_handoff_rules_updated_at before update on public.bot_handoff_rules
  for each row execute function private.set_updated_at();
create trigger bot_service_settings_updated_at before update on public.bot_service_settings
  for each row execute function private.set_updated_at();

create trigger center_public_info_version before update on public.center_public_info
  for each row execute function private.bump_row_version();
create trigger bot_settings_version before update on public.bot_settings
  for each row execute function private.bump_row_version();
create trigger bot_faqs_version before update on public.bot_faqs
  for each row execute function private.bump_row_version();
create trigger bot_handoff_rules_version before update on public.bot_handoff_rules
  for each row execute function private.bump_row_version();
create trigger bot_service_settings_version before update on public.bot_service_settings
  for each row execute function private.bump_row_version();

do $$
declare
  t text;
begin
  foreach t in array array['center_public_info', 'center_hours', 'bot_settings', 'bot_faqs', 'bot_handoff_rules',
                           'bot_service_settings'] loop
    execute format('create trigger %I before insert or update or delete on public.%I
                      for each row execute function private.require_change_reason()', t || '_require_reason', t);
    execute format('create trigger %I after insert or update or delete on public.%I
                      for each row execute function private.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- La auditoría de la conversación también registra el estado del asistente.
create or replace function private.audit_conversation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.assigned_to, new.status, new.lead_id, new.client_id, new.detail_center_id, new.priority, new.tags, new.pending,
      new.bot_status, new.marketing_opt_out_at)
     is distinct from
     (old.assigned_to, old.status, old.lead_id, old.client_id, old.detail_center_id, old.priority, old.tags, old.pending,
      old.bot_status, old.marketing_opt_out_at) then
    insert into public.audit_log (organization_id, detail_center_id, table_name, record_id, action, actor_id, reason, old_data, new_data)
    values (new.organization_id, new.detail_center_id, 'public.conversations', new.id::text, 'UPDATE', auth.uid(),
            nullif(current_setting('app.change_reason', true), ''),
            jsonb_build_object('assigned_to', old.assigned_to, 'status', old.status, 'lead_id', old.lead_id,
                               'client_id', old.client_id, 'detail_center_id', old.detail_center_id,
                               'priority', old.priority, 'tags', old.tags, 'pending', old.pending,
                               'bot_status', old.bot_status, 'marketing_opt_out_at', old.marketing_opt_out_at),
            jsonb_build_object('assigned_to', new.assigned_to, 'status', new.status, 'lead_id', new.lead_id,
                               'client_id', new.client_id, 'detail_center_id', new.detail_center_id,
                               'priority', new.priority, 'tags', new.tags, 'pending', new.pending,
                               'bot_status', new.bot_status, 'marketing_opt_out_at', new.marketing_opt_out_at));
  end if;
  return new;
end;
$$;

-- Toda organización tiene su configuración (apagada) y sus reglas de escalamiento.
create function private.seed_assistant(p_organization_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bot_settings (organization_id) values (p_organization_id) on conflict do nothing;
  insert into public.bot_handoff_rules (organization_id, code)
  select p_organization_id, x
    from unnest(array['pide_persona', 'no_entiende', 'queja', 'descuento', 'b2b', 'fotos', 'requiere_valoracion',
                      'garantia', 'agendar', 'falla_tecnica']) x
  on conflict do nothing;
end;
$$;

create function private.seed_org_assistant() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.seed_assistant(new.id);
  return null;
end;
$$;
create trigger organizations_assistant after insert on public.organizations
  for each row execute function private.seed_org_assistant();

do $$
begin
  perform set_config('app.change_reason', 'Configuración inicial del asistente de WhatsApp', true);
  perform private.seed_assistant(o.id) from public.organizations o;
end $$;

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------

alter table public.center_public_info enable row level security;
alter table public.center_hours enable row level security;
alter table public.bot_settings enable row level security;
alter table public.bot_faqs enable row level security;
alter table public.bot_handoff_rules enable row level security;
alter table public.bot_service_settings enable row level security;
alter table public.bot_turns enable row level security;

create policy center_public_info_select on public.center_public_info
  for select to authenticated using (private.has_center_role(detail_center_id) or private.can_read_assistant(organization_id));
create policy center_hours_select on public.center_hours
  for select to authenticated using (private.has_center_role(detail_center_id) or private.can_read_assistant(organization_id));
create policy bot_settings_select on public.bot_settings
  for select to authenticated using (private.can_read_assistant(organization_id));
create policy bot_faqs_select on public.bot_faqs
  for select to authenticated using (private.can_read_assistant(organization_id));
create policy bot_handoff_rules_select on public.bot_handoff_rules
  for select to authenticated using (private.can_read_assistant(organization_id));
create policy bot_service_settings_select on public.bot_service_settings
  for select to authenticated using (private.can_read_assistant(organization_id));
create policy bot_turns_select on public.bot_turns
  for select to authenticated using (private.can_use_leads(detail_center_id));

revoke all on public.center_public_info, public.center_hours, public.bot_settings, public.bot_faqs,
  public.bot_handoff_rules, public.bot_service_settings, public.bot_turns from anon;
revoke insert, update, delete, truncate on public.center_public_info, public.center_hours, public.bot_settings,
  public.bot_faqs, public.bot_handoff_rules, public.bot_service_settings, public.bot_turns from authenticated;

-- ---------------------------------------------------------------------------
-- 7. Configuración (pantalla Comercial → Asistente de WhatsApp)
-- ---------------------------------------------------------------------------

create function private.assistant_handoff_label(p_code text) returns text
language sql immutable set search_path = '' as $$
  select case p_code
    when 'pide_persona' then 'El cliente pidió hablar con una persona'
    when 'no_entiende' then 'El asistente no entendió la solicitud'
    when 'queja' then 'Queja o cliente molesto'
    when 'descuento' then 'Pide un descuento fuera de las promociones'
    when 'b2b' then 'Empresa o flotilla'
    when 'fotos' then 'Envió fotos o pide valoración'
    when 'requiere_valoracion' then 'Servicio que requiere valoración previa'
    when 'garantia' then 'Garantía o servicio ya realizado'
    when 'agendar' then 'Quiere agendar una cita'
    when 'falla_tecnica' then 'Falla técnica del asistente'
  end;
$$;

create function private.assistant_handoff_default(p_code text) returns text
language sql immutable set search_path = '' as $$
  select case p_code
    when 'pide_persona' then 'Con gusto, en un momento le atiende una persona de nuestro equipo.'
    when 'agendar' then 'Le comunico con una persona de nuestro equipo para confirmar su cita. En breve le responden por aquí.'
    when 'falla_tecnica' then 'Gracias por escribirnos. En un momento le atiende una persona de nuestro equipo.'
    else 'Le comunico con una persona de nuestro equipo para ayudarle mejor. En breve le responden por aquí.'
  end;
$$;

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
  version integer,
  updated_at timestamptz,
  can_manage boolean
)
language sql stable security definer set search_path = '' as $$
  select s.mode, s.model, s.assistant_name, s.tone, s.greeting, s.privacy_url, s.human_hours, s.after_hours_message,
         s.center_choice, s.max_days_ahead, s.min_hours_ahead, s.mention_promotions, s.mention_memberships,
         case when private.can_manage_assistant(s.organization_id) then s.test_numbers else '{}'::text[] end,
         s.version, s.updated_at, private.can_manage_assistant(s.organization_id)
    from public.bot_settings s
   where s.organization_id = p_organization_id and private.can_read_assistant(s.organization_id);
$$;

create function public.update_assistant_settings(
  p_organization_id uuid,
  p_version integer,
  p_mode text,
  p_model text,
  p_assistant_name text,
  p_tone text,
  p_greeting text,
  p_privacy_url text,
  p_human_hours text,
  p_after_hours_message text,
  p_center_choice text,
  p_max_days_ahead integer,
  p_min_hours_ahead integer,
  p_mention_promotions boolean,
  p_mention_memberships boolean,
  p_test_numbers text[],
  p_reason text
) returns public.bot_settings
language plpgsql security definer set search_path = '' as $$
declare
  s public.bot_settings;
  v_numbers text[] := coalesce((select array_agg(distinct regexp_replace(x, '\D', '', 'g'))
                                  from unnest(p_test_numbers) x where btrim(x) <> ''), '{}');
begin
  if not private.can_manage_assistant(p_organization_id) then
    raise exception 'Sólo el admin de la organización configura el asistente' using errcode = '42501';
  end if;
  select * into s from public.bot_settings where organization_id = p_organization_id for update;
  if not found then
    raise exception 'La organización no tiene configuración del asistente' using errcode = 'P0002';
  end if;
  if s.version <> p_version then
    raise exception 'La configuración cambió en otro dispositivo; recarga' using errcode = '40001';
  end if;
  if exists (select 1 from unnest(v_numbers) x where x !~ '^[0-9]{10,15}$') then
    raise exception 'Números de prueba: de 10 a 15 dígitos cada uno' using errcode = 'MG002';
  end if;
  if p_mode = 'prueba' and cardinality(v_numbers) = 0 then
    raise exception 'El modo prueba necesita al menos un número de prueba' using errcode = 'MG002';
  end if;
  perform private.set_change_reason(p_reason);
  update public.bot_settings
     set mode = p_mode, model = p_model, assistant_name = btrim(p_assistant_name), tone = btrim(p_tone),
         greeting = nullif(btrim(p_greeting), ''), privacy_url = nullif(btrim(p_privacy_url), ''),
         human_hours = nullif(btrim(p_human_hours), ''), after_hours_message = nullif(btrim(p_after_hours_message), ''),
         center_choice = p_center_choice, max_days_ahead = p_max_days_ahead, min_hours_ahead = p_min_hours_ahead,
         mention_promotions = coalesce(p_mention_promotions, true),
         mention_memberships = coalesce(p_mention_memberships, true),
         test_numbers = v_numbers, updated_by = auth.uid()
   where organization_id = p_organization_id
   returning * into s;
  return s;
end;
$$;

create function public.list_assistant_faqs(p_organization_id uuid)
returns table (
  id uuid,
  detail_center_id uuid,
  detail_center_name text,
  question text,
  answer text,
  "position" smallint,
  active boolean,
  version integer
)
language sql stable security definer set search_path = '' as $$
  select f.id, f.detail_center_id, dc.name, f.question, f.answer, f.position, f.active, f.version
    from public.bot_faqs f
    left join public.detail_centers dc on dc.id = f.detail_center_id
   where f.organization_id = p_organization_id and private.can_read_assistant(f.organization_id)
   order by f.active desc, f.position, f.question;
$$;

create function public.upsert_assistant_faq(
  p_organization_id uuid,
  p_id uuid,
  p_version integer,
  p_detail_center_id uuid,
  p_question text,
  p_answer text,
  p_position integer,
  p_active boolean,
  p_reason text
) returns public.bot_faqs
language plpgsql security definer set search_path = '' as $$
declare
  f public.bot_faqs;
begin
  if not private.can_manage_assistant(p_organization_id) then
    raise exception 'Sólo el admin de la organización edita las respuestas del asistente' using errcode = '42501';
  end if;
  if p_detail_center_id is not null and not exists (
       select 1 from public.detail_centers c where c.id = p_detail_center_id and c.organization_id = p_organization_id) then
    raise exception 'El centro no pertenece a la organización' using errcode = '22023';
  end if;
  perform private.set_change_reason(p_reason);
  if p_id is null then
    insert into public.bot_faqs (organization_id, detail_center_id, question, answer, position, active)
    values (p_organization_id, p_detail_center_id, btrim(p_question), btrim(p_answer), coalesce(p_position, 100),
            coalesce(p_active, true))
    returning * into f;
    return f;
  end if;
  select * into f from public.bot_faqs where id = p_id and organization_id = p_organization_id for update;
  if not found then
    raise exception 'Respuesta inexistente' using errcode = 'P0002';
  end if;
  if f.version <> p_version then
    raise exception 'La respuesta cambió en otro dispositivo; recarga' using errcode = '40001';
  end if;
  update public.bot_faqs
     set detail_center_id = p_detail_center_id, question = btrim(p_question), answer = btrim(p_answer),
         position = coalesce(p_position, 100), active = coalesce(p_active, true)
   where id = f.id returning * into f;
  return f;
end;
$$;

create function public.delete_assistant_faq(p_organization_id uuid, p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_manage_assistant(p_organization_id) then
    raise exception 'Sólo el admin de la organización edita las respuestas del asistente' using errcode = '42501';
  end if;
  perform private.set_change_reason(p_reason);
  delete from public.bot_faqs where id = p_id and organization_id = p_organization_id;
  if not found then
    raise exception 'Respuesta inexistente' using errcode = 'P0002';
  end if;
end;
$$;

create function public.list_assistant_handoff_rules(p_organization_id uuid)
returns table (
  code text,
  label text,
  active boolean,
  required boolean,
  assign_to uuid,
  assign_to_name text,
  message text,
  default_message text,
  version integer
)
language sql stable security definer set search_path = '' as $$
  select r.code, private.assistant_handoff_label(r.code), r.active, r.code in ('pide_persona', 'agendar', 'falla_tecnica'),
         r.assign_to, (select p.full_name from public.profiles p where p.id = r.assign_to), r.message,
         private.assistant_handoff_default(r.code), r.version
    from public.bot_handoff_rules r
   where r.organization_id = p_organization_id and private.can_read_assistant(r.organization_id)
   order by array_position(array['pide_persona', 'agendar', 'queja', 'descuento', 'b2b', 'fotos', 'requiere_valoracion',
                                 'garantia', 'no_entiende', 'falla_tecnica'], r.code);
$$;

create function public.set_assistant_handoff_rule(
  p_organization_id uuid,
  p_code text,
  p_version integer,
  p_active boolean,
  p_assign_to uuid,
  p_message text,
  p_reason text
) returns public.bot_handoff_rules
language plpgsql security definer set search_path = '' as $$
declare
  r public.bot_handoff_rules;
begin
  if not private.can_manage_assistant(p_organization_id) then
    raise exception 'Sólo el admin de la organización edita el escalamiento' using errcode = '42501';
  end if;
  select * into r from public.bot_handoff_rules where organization_id = p_organization_id and code = p_code for update;
  if not found then
    raise exception 'Regla inexistente' using errcode = 'P0002';
  end if;
  if r.version <> p_version then
    raise exception 'La regla cambió en otro dispositivo; recarga' using errcode = '40001';
  end if;
  if not coalesce(p_active, true) and p_code in ('pide_persona', 'agendar', 'falla_tecnica') then
    raise exception 'Esta regla no se puede desactivar' using errcode = 'MG002';
  end if;
  if p_assign_to is not null and not exists (
       select 1 from public.detail_centers c
        where c.organization_id = p_organization_id and c.active
          and private.user_has_center_role(p_assign_to, c.id,
                array['admin_socio', 'encargado', 'operador_recepcion', 'comercial_b2b']::public.app_role[])) then
    raise exception 'La persona asignada no atiende la bandeja en ningún centro' using errcode = 'MG002';
  end if;
  perform private.set_change_reason(p_reason);
  update public.bot_handoff_rules
     set active = coalesce(p_active, true), assign_to = p_assign_to, message = nullif(btrim(p_message), '')
   where organization_id = p_organization_id and code = p_code
   returning * into r;
  return r;
end;
$$;

create function public.list_assistant_services(p_organization_id uuid)
returns table (
  service_id uuid,
  code text,
  name text,
  revenue_engine public.revenue_engine,
  base_price numeric,
  standard_duration_minutes integer,
  active boolean,
  visible boolean,
  bookable boolean,
  price_varies_by_size boolean
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.code, s.name, s.revenue_engine, s.base_price, s.standard_duration_minutes, s.active,
         coalesce(b.visible, true), coalesce(b.bookable, true), coalesce(b.price_varies_by_size, false)
    from public.services s
    left join public.bot_service_settings b on b.service_id = s.id
   where s.organization_id = p_organization_id and private.can_read_assistant(s.organization_id)
   order by s.active desc, s.revenue_engine, s.name;
$$;

create function public.set_assistant_service(
  p_organization_id uuid,
  p_service_id uuid,
  p_visible boolean,
  p_bookable boolean,
  p_price_varies_by_size boolean,
  p_reason text
) returns public.bot_service_settings
language plpgsql security definer set search_path = '' as $$
declare
  b public.bot_service_settings;
begin
  if not private.can_manage_assistant(p_organization_id) then
    raise exception 'Sólo el admin de la organización decide qué ofrece el asistente' using errcode = '42501';
  end if;
  if not exists (select 1 from public.services s where s.id = p_service_id and s.organization_id = p_organization_id) then
    raise exception 'Servicio inexistente' using errcode = 'P0002';
  end if;
  perform private.set_change_reason(p_reason);
  insert into public.bot_service_settings (service_id, organization_id, visible, bookable, price_varies_by_size)
  values (p_service_id, p_organization_id, coalesce(p_visible, true), coalesce(p_bookable, true),
          coalesce(p_price_varies_by_size, false))
  on conflict (service_id) do update
    set visible = excluded.visible, bookable = excluded.bookable, price_varies_by_size = excluded.price_varies_by_size
  returning * into b;
  return b;
end;
$$;

create function public.list_center_public_info(p_organization_id uuid)
returns table (
  detail_center_id uuid,
  code text,
  name text,
  timezone text,
  active boolean,
  address text,
  phone text,
  maps_url text,
  directions text,
  nearby_zones text[],
  handoff_user_id uuid,
  handoff_user_name text,
  hours jsonb,
  version integer,
  can_edit boolean
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.code, c.name, c.timezone, c.active, i.address, i.phone, i.maps_url, i.directions,
         coalesce(i.nearby_zones, '{}'), i.handoff_user_id,
         (select p.full_name from public.profiles p where p.id = i.handoff_user_id),
         coalesce((select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'opens', to_char(h.opens_at, 'HH24:MI'),
                                                       'closes', to_char(h.closes_at, 'HH24:MI')) order by h.weekday)
                     from public.center_hours h where h.detail_center_id = c.id), '[]'::jsonb),
         i.version, private.can_edit_center_info(c.id)
    from public.detail_centers c
    left join public.center_public_info i on i.detail_center_id = c.id
   where c.organization_id = p_organization_id
     and (private.has_center_role(c.id) or private.can_read_assistant(c.organization_id))
   order by c.active desc, c.name;
$$;

-- p_hours: [{weekday: 1..7, opens: 'HH:MI', closes: 'HH:MI'}]; los días que no vienen quedan cerrados.
create function public.set_center_public_info(
  p_detail_center_id uuid,
  p_version integer,
  p_address text,
  p_phone text,
  p_maps_url text,
  p_directions text,
  p_nearby_zones text[],
  p_handoff_user_id uuid,
  p_hours jsonb,
  p_reason text
) returns public.center_public_info
language plpgsql security definer set search_path = '' as $$
declare
  c public.detail_centers;
  i public.center_public_info;
  h jsonb;
  v_zones text[] := coalesce((select array_agg(distinct btrim(z) order by btrim(z))
                                from unnest(p_nearby_zones) z where btrim(z) <> ''), '{}');
begin
  select * into c from public.detail_centers where id = p_detail_center_id;
  if not found or not private.can_edit_center_info(p_detail_center_id) then
    raise exception 'Sin permiso para editar los datos de este centro' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(v_zones) z where length(z) > 60) then
    raise exception 'Cada zona cercana: máximo 60 caracteres' using errcode = 'MG002';
  end if;
  if p_handoff_user_id is not null and not private.user_has_center_role(p_handoff_user_id, c.id,
       array['admin_socio', 'encargado', 'operador_recepcion', 'comercial_b2b']::public.app_role[]) then
    raise exception 'El responsable debe atender la bandeja en este centro' using errcode = 'MG002';
  end if;
  if jsonb_typeof(coalesce(p_hours, '[]'::jsonb)) <> 'array'
     or exists (select 1 from jsonb_array_elements(coalesce(p_hours, '[]'::jsonb)) x
                 where coalesce(x ->> 'weekday', '') !~ '^[1-7]$'
                    or coalesce(x ->> 'opens', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
                    or coalesce(x ->> 'closes', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
                    or (x ->> 'closes')::time <= (x ->> 'opens')::time)
     or (select count(*) <> count(distinct x ->> 'weekday') from jsonb_array_elements(coalesce(p_hours, '[]'::jsonb)) x) then
    raise exception 'Horario inválido: un horario por día, con cierre después de la apertura (HH:MM)' using errcode = 'MG002';
  end if;
  perform private.set_change_reason(p_reason);
  select * into i from public.center_public_info where detail_center_id = c.id for update;
  if found and i.version <> p_version then
    raise exception 'Los datos del centro cambiaron en otro dispositivo; recarga' using errcode = '40001';
  end if;
  insert into public.center_public_info (detail_center_id, organization_id, address, phone, maps_url, directions,
                                         nearby_zones, handoff_user_id)
  values (c.id, c.organization_id, nullif(btrim(p_address), ''), nullif(btrim(p_phone), ''), nullif(btrim(p_maps_url), ''),
          nullif(btrim(p_directions), ''), v_zones, p_handoff_user_id)
  on conflict (detail_center_id) do update
    set address = excluded.address, phone = excluded.phone, maps_url = excluded.maps_url,
        directions = excluded.directions, nearby_zones = excluded.nearby_zones, handoff_user_id = excluded.handoff_user_id
  returning * into i;
  delete from public.center_hours ch
   where ch.detail_center_id = c.id
     and not exists (select 1 from jsonb_array_elements(coalesce(p_hours, '[]'::jsonb)) x
                      where (x ->> 'weekday')::smallint = ch.weekday);
  for h in select * from jsonb_array_elements(coalesce(p_hours, '[]'::jsonb)) loop
    insert into public.center_hours (detail_center_id, organization_id, weekday, opens_at, closes_at)
    values (c.id, c.organization_id, (h ->> 'weekday')::smallint, (h ->> 'opens')::time, (h ->> 'closes')::time)
    on conflict (detail_center_id, weekday) do update
      set opens_at = excluded.opens_at, closes_at = excluded.closes_at
      where (public.center_hours.opens_at, public.center_hours.closes_at)
            is distinct from (excluded.opens_at, excluded.closes_at);
  end loop;
  return i;
end;
$$;

-- Estado del asistente en una conversación (bandeja).
create function public.conversation_assistant(p_conversation_id uuid)
returns table (
  bot_status text,
  bot_paused_reason text,
  bot_paused_at timestamptz,
  marketing_opt_out_at timestamptz,
  assistant_mode text,
  turns integer,
  last_turn_status text,
  last_turn_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select c.bot_status, c.bot_paused_reason, c.bot_paused_at, c.marketing_opt_out_at, s.mode,
         (select count(*)::integer from public.bot_turns t where t.conversation_id = c.id),
         (select t.status from public.bot_turns t where t.conversation_id = c.id order by t.started_at desc limit 1),
         (select t.started_at from public.bot_turns t where t.conversation_id = c.id order by t.started_at desc limit 1)
    from public.conversations c
    join public.bot_settings s on s.organization_id = c.organization_id
   where c.id = p_conversation_id and private.can_use_leads(c.detail_center_id);
$$;

-- Pausar o reactivar el asistente en una conversación (quien atiende la bandeja).
create function public.set_conversation_assistant(p_conversation_id uuid, p_active boolean)
returns public.conversations
language plpgsql security definer set search_path = '' as $$
declare
  c public.conversations;
begin
  c := private.lock_conversation(p_conversation_id, null);
  if c.channel <> 'whatsapp' then
    raise exception 'El asistente sólo atiende WhatsApp' using errcode = 'MG002';
  end if;
  perform private.set_change_reason(case when p_active then 'Asistente reactivado en la conversación'
                                         else 'Asistente pausado en la conversación' end);
  if p_active then
    update public.conversations
       set bot_status = 'activo', bot_paused_reason = null, bot_paused_at = null, bot_resumed_at = now()
     where id = c.id returning * into c;
  else
    update public.conversations
       set bot_status = 'pausado', bot_paused_reason = 'Pausado por ' || coalesce(
             (select p.full_name from public.profiles p where p.id = auth.uid()), 'una persona'),
           bot_paused_at = now()
     where id = c.id and bot_status = 'activo' returning * into c;
    if not found then
      select * into c from public.conversations where id = p_conversation_id;
    end if;
  end if;
  return c;
end;
$$;

-- Indicadores del asistente en el periodo (por centro de la conversación).
create function public.assistant_metrics(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  detail_center_id uuid,
  conversations integer,
  turns integer,
  answered integer,
  handed_off integer,
  skipped integer,
  errors integer,
  input_tokens bigint,
  output_tokens bigint,
  cache_read_tokens bigint,
  cache_write_tokens bigint,
  handoffs jsonb
)
language sql stable security definer set search_path = '' as $$
  select t.detail_center_id, count(distinct t.conversation_id)::integer, count(*)::integer,
         count(*) filter (where t.status = 'respondido')::integer,
         count(*) filter (where t.status = 'escalado')::integer,
         count(*) filter (where t.status = 'omitido')::integer,
         count(*) filter (where t.status = 'error')::integer,
         sum(t.input_tokens), sum(t.output_tokens), sum(t.cache_read_tokens), sum(t.cache_write_tokens),
         coalesce((select jsonb_object_agg(x.code, x.n) from (
                     select t2.handoff_code as code, count(*) as n from public.bot_turns t2
                      where t2.detail_center_id = t.detail_center_id and t2.handoff_code is not null
                        and (t2.started_at at time zone dc.timezone)::date between p_from and p_to
                      group by t2.handoff_code) x), '{}'::jsonb)
    from public.bot_turns t
    join public.detail_centers dc on dc.id = t.detail_center_id
   where t.detail_center_id = any (p_detail_center_ids)
     and private.can_read_commercial_metrics(t.detail_center_id)
     and (t.started_at at time zone dc.timezone)::date between p_from and p_to
   group by t.detail_center_id, dc.timezone;
$$;

-- ---------------------------------------------------------------------------
-- 8. Turnos del asistente (sólo el servidor con la llave de servicio)
-- ---------------------------------------------------------------------------

-- Turno en curso: fija organización y conversación de todas las herramientas.
create function private.assistant_turn(p_turn_id uuid) returns public.bot_turns
language plpgsql set search_path = '' as $$
declare
  t public.bot_turns;
begin
  if not private.is_service_request() then
    raise exception 'Sólo el servidor ejecuta el asistente' using errcode = '42501';
  end if;
  select * into t from public.bot_turns where id = p_turn_id;
  if not found or t.status <> 'procesando' then
    raise exception 'Turno inexistente o terminado' using errcode = 'MG002';
  end if;
  return t;
end;
$$;

create function private.assistant_center(p_organization_id uuid, p_detail_center_id uuid) returns public.detail_centers
language plpgsql stable set search_path = '' as $$
declare
  c public.detail_centers;
begin
  select * into c from public.detail_centers
   where id = p_detail_center_id and organization_id = p_organization_id and active;
  if not found then
    raise exception 'Centro inexistente' using errcode = 'MG002';
  end if;
  return c;
end;
$$;

create function private.assistant_centers_json(p_organization_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'nombre', c.name, 'zona_horaria', c.timezone, 'direccion', i.address, 'telefono', i.phone,
           'mapa', i.maps_url, 'como_llegar', i.directions, 'zonas_cercanas', coalesce(i.nearby_zones, '{}'),
           'horario', coalesce((select jsonb_agg(jsonb_build_object('dia', h.weekday, 'abre', to_char(h.opens_at, 'HH24:MI'),
                                                                    'cierra', to_char(h.closes_at, 'HH24:MI'))
                                                 order by h.weekday)
                                  from public.center_hours h where h.detail_center_id = c.id), '[]'::jsonb))
           order by c.name), '[]'::jsonb)
    from public.detail_centers c
    left join public.center_public_info i on i.detail_center_id = c.id
   where c.organization_id = p_organization_id and c.active;
$$;

-- Decide si el asistente atiende el mensaje y, si sí, abre el turno con su contexto.
-- Devuelve {skip: motivo} o {turn_id, settings, conversation, message, centers, faqs, handoff, history}.
create function public.assistant_begin_turn(p_message_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m public.messages;
  c public.conversations;
  s public.bot_settings;
  t public.bot_turns;
  digits text;
  centers jsonb;
begin
  if not private.is_service_request() then
    raise exception 'Sólo el servidor ejecuta el asistente' using errcode = '42501';
  end if;
  select * into m from public.messages where id = p_message_id and direction = 'entrante';
  if not found then
    return jsonb_build_object('skip', 'mensaje inexistente');
  end if;
  if exists (select 1 from public.bot_turns x where x.inbound_message_id = m.id) then
    return jsonb_build_object('skip', 'mensaje ya atendido');
  end if;
  select * into c from public.conversations where id = m.conversation_id for update;
  if c.channel <> 'whatsapp' then
    return jsonb_build_object('skip', 'el asistente sólo atiende WhatsApp');
  end if;
  select * into s from public.bot_settings where organization_id = c.organization_id;
  if not found or s.mode = 'apagado' then
    return jsonb_build_object('skip', 'asistente apagado');
  end if;
  digits := regexp_replace(coalesce(c.contact_phone, c.contact_external_id), '\D', '', 'g');
  if s.mode = 'prueba' and not exists (select 1 from unnest(s.test_numbers) n
                                        where length(digits) >= 10 and right(n, 10) = right(digits, 10)) then
    return jsonb_build_object('skip', 'modo prueba: el número no es de prueba');
  end if;
  if c.bot_status = 'pausado' then
    return jsonb_build_object('skip', 'asistente pausado en la conversación');
  end if;
  -- Si una persona ya respondió (después de la última reactivación), el asistente se retira.
  if exists (select 1 from public.messages x
              where x.conversation_id = c.id and x.direction = 'saliente' and not x.sent_by_bot
                and x.occurred_at > coalesce(c.bot_resumed_at, '-infinity'::timestamptz)) then
    perform private.set_change_reason('El asistente se retira: la conversación la atiende una persona');
    update public.conversations
       set bot_status = 'pausado', bot_paused_reason = 'Atendida por una persona', bot_paused_at = now()
     where id = c.id;
    return jsonb_build_object('skip', 'la conversación la atiende una persona');
  end if;
  -- Varios mensajes seguidos: responde sólo el turno del más reciente (con todo el contexto).
  if exists (select 1 from public.messages x
              where x.conversation_id = c.id and x.direction = 'entrante' and x.id <> m.id
                and (x.occurred_at, x.created_at) > (m.occurred_at, m.created_at)) then
    return jsonb_build_object('skip', 'llegó un mensaje más reciente');
  end if;
  if not private.conversation_window_open(c) then
    return jsonb_build_object('skip', 'ventana de 24 h cerrada');
  end if;
  insert into public.bot_turns (organization_id, detail_center_id, conversation_id, inbound_message_id, model)
  values (c.organization_id, c.detail_center_id, c.id, m.id, s.model)
  returning * into t;
  centers := private.assistant_centers_json(c.organization_id);
  return jsonb_build_object(
    'turn_id', t.id,
    'now', now(),
    'settings', jsonb_build_object(
      'model', s.model, 'assistant_name', s.assistant_name, 'tone', s.tone, 'greeting', s.greeting,
      'privacy_url', s.privacy_url, 'human_hours', s.human_hours, 'after_hours_message', s.after_hours_message,
      'center_choice', s.center_choice, 'max_days_ahead', s.max_days_ahead, 'min_hours_ahead', s.min_hours_ahead,
      'mention_promotions', s.mention_promotions, 'mention_memberships', s.mention_memberships),
    'conversation', jsonb_build_object(
      'id', c.id, 'detail_center_id', c.detail_center_id,
      'detail_center_name', (select dc.name from public.detail_centers dc where dc.id = c.detail_center_id),
      'center_confirmed', c.center_confirmed_at is not null or jsonb_array_length(centers) = 1,
      'contact_name', c.contact_name,
      'client_name', (select cl.full_name from public.clients cl where cl.id = c.client_id),
      'marketing_opt_out', c.marketing_opt_out_at is not null,
      'first_contact', not exists (select 1 from public.messages x
                                    where x.conversation_id = c.id and x.direction = 'saliente')),
    'message', jsonb_build_object('id', m.id, 'type', m.message_type, 'body', m.body, 'occurred_at', m.occurred_at),
    'centers', centers,
    'faqs', coalesce((select jsonb_agg(jsonb_build_object('centro', f.detail_center_id, 'pregunta', f.question,
                                                          'respuesta', f.answer) order by f.position, f.question)
                        from public.bot_faqs f where f.organization_id = c.organization_id and f.active), '[]'::jsonb),
    'handoff', coalesce((select jsonb_agg(jsonb_build_object('codigo', r.code,
                                                             'cuando', private.assistant_handoff_label(r.code))
                                          order by r.code)
                           from public.bot_handoff_rules r where r.organization_id = c.organization_id and r.active),
                        '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('direction', h.direction, 'by_bot', h.sent_by_bot,
                                                             'type', h.message_type, 'body', h.body,
                                                             'at', h.occurred_at) order by h.occurred_at, h.created_at)
                           from (select x.* from public.messages x
                                  where x.conversation_id = c.id and x.status <> 'fallido'
                                    and x.occurred_at > now() - interval '7 days'
                                  order by x.occurred_at desc, x.created_at desc limit 30) h), '[]'::jsonb));
end;
$$;

-- Servicios que ofrece el asistente en un centro (precio y duración vigentes del centro).
create function public.assistant_services(p_turn_id uuid, p_detail_center_id uuid, p_query text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.bot_turns := private.assistant_turn(p_turn_id);
  c public.detail_centers := private.assistant_center(t.organization_id, p_detail_center_id);
  q text := nullif(private.normalize_text(btrim(coalesce(p_query, ''))), '');
  result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'servicio_id', s.id, 'nombre', s.name, 'descripcion', s.description,
           'precio', coalesce(cfg.price_override, s.base_price), 'duracion_min', s.standard_duration_minutes,
           'precio_varia_por_tamano', coalesce(b.price_varies_by_size, false),
           'se_agenda_sin_valoracion', coalesce(b.bookable, true))
           order by s.revenue_engine, s.name), '[]'::jsonb)
    into result
    from public.services s
    left join public.service_center_config cfg on cfg.detail_center_id = c.id and cfg.service_id = s.id
    left join public.bot_service_settings b on b.service_id = s.id
   where s.organization_id = t.organization_id and s.active and coalesce(cfg.available, true)
     and coalesce(b.visible, true)
     and (q is null or private.normalize_text(s.name || ' ' || coalesce(s.description, '') || ' ' || s.code)
                       like '%' || q || '%');
  return jsonb_build_object('centro', c.name, 'moneda', 'MXN', 'precios_incluyen_iva', true, 'servicios', result);
end;
$$;

-- Promociones vigentes que cualquier persona del mostrador puede aplicar (nivel operador).
create function public.assistant_promotions(p_turn_id uuid, p_detail_center_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.bot_turns := private.assistant_turn(p_turn_id);
  c public.detail_centers := private.assistant_center(t.organization_id, p_detail_center_id);
  today date := private.center_today(c.id);
begin
  if not (select s.mention_promotions from public.bot_settings s where s.organization_id = t.organization_id) then
    return jsonb_build_object('promociones', '[]'::jsonb, 'nota', 'La organización no comparte promociones por este medio');
  end if;
  return jsonb_build_object('promociones', coalesce((
    select jsonb_agg(jsonb_build_object(
             'codigo', p.code, 'nombre', p.name,
             'descuento', case when p.kind = 'percent' then p.value::text || ' %' else '$' || p.value::text || ' MXN' end,
             'vigencia', p.starts_on::text || ' a ' || p.ends_on::text, 'condiciones', p.terms,
             'servicios', case when cardinality(p.service_ids) = 0 then null
                               else (select jsonb_agg(s.name order by s.name) from public.services s
                                      where s.id = any (p.service_ids)) end)
             order by p.ends_on)
      from public.promotions p
     where p.organization_id = t.organization_id and p.active and p.authorization_level = 'operador'
       and today between p.starts_on and p.ends_on
       and (cardinality(p.detail_center_ids) = 0 or c.id = any (p.detail_center_ids))
       and (p.max_uses is null or private.promotion_uses(p.id) < p.max_uses)), '[]'::jsonb));
end;
$$;

-- Planes de membresía disponibles hoy con sus beneficios.
create function public.assistant_membership_plans(p_turn_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.bot_turns := private.assistant_turn(p_turn_id);
  today date := private.center_today(t.detail_center_id);
begin
  if not (select s.mention_memberships from public.bot_settings s where s.organization_id = t.organization_id) then
    return jsonb_build_object('planes', '[]'::jsonb, 'nota', 'La organización no ofrece membresías por este medio');
  end if;
  return jsonb_build_object('planes', coalesce((
    select jsonb_agg(jsonb_build_object(
             'nombre', p.name, 'nivel', p.tier, 'precio', p.price, 'meses', p.period_months,
             'descripcion', p.description, 'restricciones', p.restrictions,
             'se_usa_en', case p.redeem_scope when 'cualquier_centro' then 'cualquier centro' else 'el centro donde se compra' end,
             'incluye', (select coalesce(jsonb_agg(jsonb_build_object('servicio', s.name, 'veces_por_periodo', b.quantity_per_period)
                                                   order by s.name), '[]'::jsonb)
                           from public.membership_benefits b join public.services s on s.id = b.service_id
                          where b.plan_id = p.id))
             order by p.price)
      from public.membership_plans p
     where p.organization_id = t.organization_id and p.active and p.available_from <= today
       and (p.available_until is null or p.available_until >= today)), '[]'::jsonb));
end;
$$;

-- Horarios libres (sólo consulta; en F1 una persona confirma la cita). Capacidad =
-- bahías activas; un horario está libre si las citas activas que se traslapan son
-- menos que las bahías. Horario de atención del centro, anticipación mínima y
-- máximo de días de la configuración.
create function public.assistant_free_slots(
  p_turn_id uuid,
  p_detail_center_id uuid,
  p_service_ids uuid[],
  p_from date default null,
  p_days integer default 3
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.bot_turns := private.assistant_turn(p_turn_id);
  c public.detail_centers := private.assistant_center(t.organization_id, p_detail_center_id);
  s public.bot_settings;
  today date := private.center_today(c.id);
  duration integer;
  capacity integer;
  earliest timestamptz;
  d date;
  last_day date;
  h public.center_hours;
  slots text[];
  days jsonb := '[]'::jsonb;
begin
  select * into s from public.bot_settings where organization_id = t.organization_id;
  select sum(x.standard_duration_minutes)::integer into duration
    from public.services x
   where x.id = any (coalesce(p_service_ids, '{}')) and x.organization_id = t.organization_id and x.active;
  if duration is null then
    return jsonb_build_object('error', 'Indica al menos un servicio del catálogo para calcular la duración');
  end if;
  if exists (select 1 from public.bot_service_settings b
              where b.service_id = any (p_service_ids) and (not b.bookable or not b.visible)) then
    return jsonb_build_object('error', 'Alguno de esos servicios requiere valoración previa: una persona agenda la cita');
  end if;
  select count(*)::integer into capacity from public.bays b where b.detail_center_id = c.id and b.active;
  if capacity = 0 then
    return jsonb_build_object('error', 'El centro no tiene bahías registradas: no hay datos de disponibilidad');
  end if;
  if not exists (select 1 from public.center_hours x where x.detail_center_id = c.id) then
    return jsonb_build_object('error', 'El centro no tiene horario registrado: no hay datos de disponibilidad');
  end if;
  earliest := now() + make_interval(hours => s.min_hours_ahead);
  d := greatest(coalesce(p_from, today), today);
  last_day := least(d + least(greatest(coalesce(p_days, 3), 1), 5) - 1, today + s.max_days_ahead);
  while d <= last_day loop
    select * into h from public.center_hours x where x.detail_center_id = c.id and x.weekday = extract(isodow from d);
    if not found then
      days := days || jsonb_build_object('fecha', d, 'dia', extract(isodow from d), 'cerrado', true, 'horarios', '[]'::jsonb);
    else
      slots := array(
        select to_char(x at time zone c.timezone, 'HH24:MI')
          from generate_series((d + h.opens_at) at time zone c.timezone,
                               (d + h.closes_at) at time zone c.timezone - make_interval(mins => duration),
                               interval '30 minutes') x
         where x >= earliest
           and (select count(*) from public.appointments a
                 where a.detail_center_id = c.id and a.status in ('programada', 'recibida', 'en_servicio')
                   and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(x, x + make_interval(mins => duration), '[)'))
               < capacity
         order by x
         limit 16);
      days := days || jsonb_build_object('fecha', d, 'dia', extract(isodow from d), 'cerrado', false,
                                         'horarios', to_jsonb(slots));
    end if;
    d := d + 1;
  end loop;
  return jsonb_build_object('centro', c.name, 'duracion_min', duration, 'dias', days,
                            'nota', 'Horarios disponibles en este momento; una persona del equipo confirma la cita.');
end;
$$;

-- El cliente eligió centro (número central): la conversación pasa a ese centro mientras
-- nadie la haya tomado todavía.
create function public.assistant_choose_center(p_turn_id uuid, p_detail_center_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.bot_turns := private.assistant_turn(p_turn_id);
  c public.detail_centers := private.assistant_center(t.organization_id, p_detail_center_id);
  v public.conversations;
begin
  select * into v from public.conversations where id = t.conversation_id for update;
  if v.detail_center_id = c.id then
    update public.conversations set center_confirmed_at = coalesce(center_confirmed_at, now()) where id = v.id;
    return jsonb_build_object('centro', c.name, 'cambiado', false);
  end if;
  if v.assigned_to is not null or exists (select 1 from public.conversation_notes n where n.conversation_id = v.id) then
    return jsonb_build_object('centro', (select dc.name from public.detail_centers dc where dc.id = v.detail_center_id),
                              'cambiado', false, 'nota', 'La conversación ya la atiende un centro; no se cambia');
  end if;
  perform private.set_change_reason('El cliente eligió centro con el asistente');
  update public.messages set detail_center_id = c.id where conversation_id = v.id;
  update public.bot_turns set detail_center_id = c.id where conversation_id = v.id;
  update public.conversations set detail_center_id = c.id, center_confirmed_at = now() where id = v.id;
  return jsonb_build_object('centro', c.name, 'cambiado', true);
end;
$$;

-- Pasa la conversación a una persona: pausa el asistente, la marca pendiente, la asigna
-- (regla o responsable del centro) y deja una nota interna con el resumen.
-- Devuelve el mensaje que el asistente envía al cliente.
create function public.assistant_handoff(p_turn_id uuid, p_code text, p_summary text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.bot_turns := private.assistant_turn(p_turn_id);
  r public.bot_handoff_rules;
  v public.conversations;
  candidate uuid;
  v_assign uuid;
begin
  select * into r from public.bot_handoff_rules where organization_id = t.organization_id and code = p_code;
  if not found or not r.active then
    return jsonb_build_object('escalado', false, 'nota', 'Esa regla de escalamiento está desactivada: sigue atendiendo');
  end if;
  select * into v from public.conversations where id = t.conversation_id for update;
  candidate := coalesce(r.assign_to,
                        (select i.handoff_user_id from public.center_public_info i where i.detail_center_id = v.detail_center_id));
  v_assign := v.assigned_to;
  if v_assign is null and candidate is not null and private.user_has_center_role(candidate, v.detail_center_id,
       array['admin_socio', 'encargado', 'operador_recepcion', 'comercial_b2b']::public.app_role[]) then
    v_assign := candidate;
  end if;
  perform private.set_change_reason('El asistente pasó la conversación a una persona');
  update public.conversations
     set bot_status = 'pausado', bot_paused_reason = private.assistant_handoff_label(p_code), bot_paused_at = now(),
         pending = true, assigned_to = v_assign, status = 'abierta',
         priority = case when p_code in ('queja', 'falla_tecnica') then 'alta' else priority end,
         tags = (select array_agg(distinct x order by x) from unnest(tags || array['asistente']) x)
   where id = v.id;
  insert into public.conversation_notes (organization_id, detail_center_id, conversation_id, body, author_id, request_id)
  values (v.organization_id, v.detail_center_id, v.id,
          left('Asistente: ' || private.assistant_handoff_label(p_code) || '.'
               || coalesce(' Resumen: ' || nullif(btrim(p_summary), ''), ''), 2000),
          null, t.id)
  on conflict (conversation_id, request_id) do nothing;
  update public.bot_turns set handoff_code = p_code where id = t.id;
  return jsonb_build_object('escalado', true,
                            'mensaje', coalesce(r.message, private.assistant_handoff_default(p_code)));
end;
$$;

-- El contacto pidió no recibir promociones por WhatsApp.
create function public.assistant_opt_out(p_turn_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.bot_turns := private.assistant_turn(p_turn_id);
  v public.conversations;
  cl public.clients;
  remaining text[];
begin
  select * into v from public.conversations where id = t.conversation_id for update;
  perform private.set_change_reason('El contacto pidió no recibir promociones por WhatsApp');
  update public.conversations set marketing_opt_out_at = coalesce(marketing_opt_out_at, now()) where id = v.id;
  if v.lead_id is not null then
    update public.leads
       set consent_channels = array_remove(consent_channels, 'whatsapp'),
           consent_at = case when cardinality(array_remove(consent_channels, 'whatsapp')) > 0 then consent_at end
     where id = v.lead_id and 'whatsapp' = any (consent_channels);
  end if;
  if v.client_id is not null then
    perform private.put_contact_preference(v.client_id, 'whatsapp', false, 'whatsapp');
    select * into cl from public.clients where id = v.client_id for update;
    if 'whatsapp' = any (cl.marketing_channels) then
      remaining := array_remove(cl.marketing_channels, 'whatsapp');
      update public.clients
         set marketing_channels = remaining, marketing_opt_in = cardinality(remaining) > 0,
             marketing_opt_in_at = now()
       where id = cl.id;
    end if;
  end if;
  return jsonb_build_object('baja', true);
end;
$$;

-- Deja la respuesta del asistente «pendiente» (una por turno) y devuelve lo que el
-- servidor necesita para enviarla. Si mientras tanto llegó otro mensaje del contacto,
-- no responde: el turno del mensaje nuevo contesta con todo el contexto.
create function public.assistant_reply(p_turn_id uuid, p_body text)
returns table (
  message_id uuid,
  channel text,
  external_account_id text,
  contact_external_id text,
  contact_phone text,
  body text,
  already_sent boolean,
  superseded boolean
)
language plpgsql security definer set search_path = '' as $$
declare
  t public.bot_turns := private.assistant_turn(p_turn_id);
  v public.conversations;
  a public.channel_accounts;
  inbound public.messages;
  m public.messages;
  txt text := btrim(coalesce(p_body, ''));
begin
  select * into v from public.conversations where id = t.conversation_id for update;
  select * into a from public.channel_accounts where id = v.channel_account_id;
  select * into m from public.messages x where x.conversation_id = v.id and x.request_id = t.id;
  if found then
    return query select m.id, v.channel, a.external_account_id, v.contact_external_id, v.contact_phone, m.body,
                        m.status <> 'pendiente', false;
    return;
  end if;
  select * into inbound from public.messages where id = t.inbound_message_id;
  if exists (select 1 from public.messages x
              where x.conversation_id = v.id and x.direction = 'entrante' and x.id <> inbound.id
                and (x.occurred_at, x.created_at) > (inbound.occurred_at, inbound.created_at)) then
    update public.bot_turns set status = 'omitido', skip_reason = 'Llegó un mensaje más reciente', finished_at = now()
     where id = t.id;
    return query select null::uuid, v.channel, null::text, null::text, null::text, null::text, false, true;
    return;
  end if;
  if length(txt) not between 1 and 4096 then
    raise exception 'Respuesta vacía o de más de 4096 caracteres' using errcode = '22023';
  end if;
  if not a.active or a.status <> 'verificada' then
    raise exception 'La cuenta de WhatsApp no está verificada' using errcode = 'MG002';
  end if;
  if not private.conversation_window_open(v) then
    raise exception 'Ventana de 24 h cerrada' using errcode = 'MG002';
  end if;
  insert into public.messages (organization_id, detail_center_id, conversation_id, direction, message_type, body, status,
                               sent_by, sent_by_bot, request_id)
  values (v.organization_id, v.detail_center_id, v.id, 'saliente', 'text', txt, 'pendiente', null, true, t.id)
  returning * into m;
  update public.bot_turns set reply_message_id = m.id where id = t.id;
  return query select m.id, v.channel, a.external_account_id, v.contact_external_id, v.contact_phone, m.body, false, false;
end;
$$;

create function public.assistant_finish_turn(
  p_turn_id uuid,
  p_status text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cache_read_tokens integer,
  p_cache_write_tokens integer,
  p_tool_calls jsonb,
  p_error text
) returns public.bot_turns
language plpgsql security definer set search_path = '' as $$
declare
  t public.bot_turns;
begin
  if not private.is_service_request() then
    raise exception 'Sólo el servidor ejecuta el asistente' using errcode = '42501';
  end if;
  if p_status not in ('respondido', 'escalado', 'omitido', 'error') then
    raise exception 'Estado de turno inválido' using errcode = '22023';
  end if;
  update public.bot_turns
     set status = case when status = 'procesando' then p_status else status end,
         input_tokens = input_tokens + greatest(coalesce(p_input_tokens, 0), 0),
         output_tokens = output_tokens + greatest(coalesce(p_output_tokens, 0), 0),
         cache_read_tokens = cache_read_tokens + greatest(coalesce(p_cache_read_tokens, 0), 0),
         cache_write_tokens = cache_write_tokens + greatest(coalesce(p_cache_write_tokens, 0), 0),
         tool_calls = case when jsonb_typeof(p_tool_calls) = 'array' then p_tool_calls else tool_calls end,
         error = left(nullif(btrim(p_error), ''), 500),
         finished_at = coalesce(finished_at, now())
   where id = p_turn_id
   returning * into t;
  if not found then
    raise exception 'Turno inexistente' using errcode = 'P0002';
  end if;
  return t;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Ajustes a la bandeja
-- ---------------------------------------------------------------------------

-- La baja pedida por WhatsApp queda con su origen.
do $$
declare
  v_name text;
begin
  select conname into v_name from pg_constraint
   where conrelid = 'public.contact_preferences'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%migracion%';
  execute format('alter table public.contact_preferences drop constraint %I', v_name);
end $$;
alter table public.contact_preferences
  add constraint contact_preferences_source_check check (source in ('web', 'mobile', 'migracion', 'whatsapp'));

-- El webhook devuelve además los mensajes nuevos (el servidor los pasa al asistente).
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
    fresh := fresh || jsonb_build_object('conversation_id', conv.id, 'message_id', msg_id);
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

-- Hilo con la marca de los mensajes del asistente.
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
  sent_by_bot boolean
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
             (select p.full_name from public.profiles p where p.id = m.sent_by), m.occurred_at, m.status_at, m.sent_by_bot
        from public.messages m
       where m.conversation_id = c.id
       order by m.occurred_at desc, m.created_at desc
       limit least(greatest(coalesce(p_limit, 200), 1), 500)
    ) t
    order by t.occurred_at, t.status_at;
end;
$$;

-- Resultado del envío: las respuestas del asistente no cuentan como primer contacto
-- de una persona del equipo (no hay usuario que lo registre en el prospecto).
create or replace function public.finish_outbound_message(p_message_id uuid, p_external_id text, p_error text)
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
  if c.lead_id is not null and not m.sent_by_bot then
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

-- Plantillas de marketing: respetan la baja pedida por WhatsApp aunque el contacto no esté ligado a un cliente.
create or replace function public.prepare_template_message(
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
  if t.category = 'MARKETING' and c.marketing_opt_out_at is not null then
    raise exception 'Plantilla de marketing: el contacto pidió por WhatsApp no recibir promociones' using errcode = 'MG002';
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
-- 10. Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.seed_assistant(uuid)', 'private.seed_org_assistant()', 'private.assistant_turn(uuid)',
    'private.assistant_center(uuid, uuid)', 'private.assistant_centers_json(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
  foreach fn in array array[
    'private.can_manage_assistant(uuid)', 'private.can_edit_center_info(uuid)', 'private.can_read_assistant(uuid)',
    'private.assistant_handoff_label(text)', 'private.assistant_handoff_default(text)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.get_assistant_settings(uuid)',
    'public.update_assistant_settings(uuid, integer, text, text, text, text, text, text, text, text, text, integer, integer, boolean, boolean, text[], text)',
    'public.list_assistant_faqs(uuid)',
    'public.upsert_assistant_faq(uuid, uuid, integer, uuid, text, text, integer, boolean, text)',
    'public.delete_assistant_faq(uuid, uuid, text)',
    'public.list_assistant_handoff_rules(uuid)',
    'public.set_assistant_handoff_rule(uuid, text, integer, boolean, uuid, text, text)',
    'public.list_assistant_services(uuid)',
    'public.set_assistant_service(uuid, uuid, boolean, boolean, boolean, text)',
    'public.list_center_public_info(uuid)',
    'public.set_center_public_info(uuid, integer, text, text, text, text, text[], uuid, jsonb, text)',
    'public.conversation_assistant(uuid)',
    'public.set_conversation_assistant(uuid, boolean)',
    'public.assistant_metrics(uuid[], date, date)',
    'public.conversation_messages(uuid, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  -- Sólo el servidor con la llave de servicio (el asistente).
  foreach fn in array array[
    'public.assistant_begin_turn(uuid)',
    'public.assistant_services(uuid, uuid, text)',
    'public.assistant_promotions(uuid, uuid)',
    'public.assistant_membership_plans(uuid)',
    'public.assistant_free_slots(uuid, uuid, uuid[], date, integer)',
    'public.assistant_choose_center(uuid, uuid)',
    'public.assistant_handoff(uuid, text, text)',
    'public.assistant_opt_out(uuid)',
    'public.assistant_reply(uuid, text)',
    'public.assistant_finish_turn(uuid, text, integer, integer, integer, integer, jsonb, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
grant select on public.center_public_info, public.center_hours, public.bot_settings, public.bot_faqs,
  public.bot_handoff_rules, public.bot_service_settings, public.bot_turns to service_role;
