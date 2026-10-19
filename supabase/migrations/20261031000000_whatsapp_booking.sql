-- Citas desde WhatsApp (asistente F2, parte 1): el asistente propone la cita y
-- el cliente la confirma con un botón; la base la crea, la reprograma o la
-- cancela. Ver ADR 0038.
--
-- * vehicles.plate es opcional: un auto agendado por WhatsApp puede llegar sin
--   placa. La OS sigue exigiéndola (la recepción la captura al recibir el auto).
-- * appointments.source: 'agenda' (personal) o 'whatsapp' (el cliente confirmó).
-- * bot_settings.self_booking: el asistente agenda (true) o pasa a una persona.
-- * bot_booking_proposals: lo que el asistente propuso (agendar, reagendar o
--   cancelar) y su resultado. Sólo la llave de servicio escribe.
-- * messages.payload (id del botón que tocó el cliente) y messages.buttons
--   (botones que envió el asistente).
-- * El horario se valida en la base al proponer Y al confirmar (bloqueo por
--   centro, capacidad por bahías activas y una bahía libre asignada; las
--   exclusion constraints siguen siendo la última palabra).

-- ---------------------------------------------------------------------------
-- 1. Placa opcional
-- ---------------------------------------------------------------------------

alter table public.vehicles alter column plate drop not null;
comment on column public.vehicles.plate is
  'Placa normalizada (mayúsculas, letras y dígitos). Opcional: un auto agendado por WhatsApp puede llegar sin placa; la OS la exige.';

-- La OS copia la placa del vehículo: sin placa no se abre (mensaje claro en lugar del NOT NULL).
create function private.require_order_plate() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.vehicle_plate is null or btrim(new.vehicle_plate) = '' then
    raise exception 'Captura la placa del vehículo antes de abrir la OS' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger service_orders_require_plate before insert on public.service_orders
  for each row execute function private.require_order_plate();

-- Texto del vehículo para listas: «Mazda 3 2021 · ABC123» o «Mazda 3 2021 · sin placa».
create function private.vehicle_label(p_make text, p_model text, p_year smallint, p_plate text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select p_make || ' ' || p_model || ' ' || p_year || ' · ' || coalesce(p_plate, 'sin placa');
$$;

-- ---------------------------------------------------------------------------
-- 2. Origen de la cita, botones y ajuste del asistente
-- ---------------------------------------------------------------------------

alter table public.appointments
  add column source text not null default 'agenda' check (source in ('agenda', 'whatsapp'));
comment on column public.appointments.source is
  'agenda: la registró el personal · whatsapp: el cliente la confirmó con el botón del asistente.';

alter table public.messages
  add column payload text check (payload is null or length(payload) <= 200),
  add column buttons jsonb check (buttons is null or (jsonb_typeof(buttons) = 'array' and jsonb_array_length(buttons) between 1 and 3));
comment on column public.messages.payload is 'Id del botón que tocó el contacto (respuesta interactiva o de plantilla).';
comment on column public.messages.buttons is 'Botones de respuesta rápida que envió el asistente: [{id, titulo}].';

-- El contenido (incluidos botón y botones) no se edita.
create or replace function private.keep_message_content() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los mensajes no se borran' using errcode = '42501';
  end if;
  if (new.conversation_id, new.direction, new.body, new.message_type, new.sent_by, new.sent_by_bot, new.occurred_at,
      new.organization_id, new.payload, new.buttons)
     is distinct from
     (old.conversation_id, old.direction, old.body, old.message_type, old.sent_by, old.sent_by_bot, old.occurred_at,
      old.organization_id, old.payload, old.buttons) then
    raise exception 'El contenido de un mensaje no se edita' using errcode = '42501';
  end if;
  return new;
end;
$$;

alter table public.bot_settings add column self_booking boolean not null default true;
comment on column public.bot_settings.self_booking is
  'true: el asistente propone la cita y el cliente la confirma con un botón · false: pasa a una persona para agendar.';

-- ---------------------------------------------------------------------------
-- 3. Propuestas del asistente
-- ---------------------------------------------------------------------------

create table public.bot_booking_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  conversation_id uuid not null,
  turn_id uuid not null,
  kind text not null check (kind in ('agendar', 'reagendar', 'cancelar')),
  -- reagendar / cancelar: la cita a cambiar · agendar: la cita creada al confirmar.
  appointment_id uuid,
  service_ids uuid[] not null default '{}',
  starts_at timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 5 and 1440),
  client_name text check (client_name is null or length(btrim(client_name)) between 2 and 120),
  vehicle_id uuid,
  vehicle_make text check (vehicle_make is null or length(btrim(vehicle_make)) between 1 and 60),
  vehicle_model text check (vehicle_model is null or length(btrim(vehicle_model)) between 1 and 60),
  vehicle_year smallint check (vehicle_year is null or vehicle_year between 1950 and 2100),
  vehicle_plate text check (vehicle_plate is null or vehicle_plate ~ '^[A-Z0-9]{3,10}$'),
  summary text not null check (length(summary) between 10 and 1024),
  status text not null default 'pendiente'
    check (status in ('pendiente', 'confirmada', 'descartada', 'vencida', 'fallida')),
  result text check (result is null or length(result) <= 500),
  message_id uuid,
  decided_message_id uuid,
  expires_at timestamptz not null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  check (kind = 'cancelar' or (starts_at is not null and cardinality(service_ids) > 0)),
  check (kind = 'agendar' or appointment_id is not null),
  check ((status = 'pendiente') = (decided_at is null)),
  foreign key (organization_id, conversation_id) references public.conversations (organization_id, id) on delete cascade,
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id) on delete restrict,
  foreign key (organization_id, turn_id) references public.bot_turns (organization_id, id) on delete cascade,
  foreign key (organization_id, appointment_id) references public.appointments (organization_id, id) on delete restrict
);
create index bot_booking_proposals_conversation_idx on public.bot_booking_proposals (conversation_id, created_at desc);
create index bot_booking_proposals_appointment_idx on public.bot_booking_proposals (appointment_id);
create index bot_booking_proposals_center_idx on public.bot_booking_proposals (detail_center_id, created_at desc);

comment on table public.bot_booking_proposals is
  'Citas que el asistente propuso por WhatsApp (agendar, reagendar o cancelar) y el resultado del botón del cliente. Sólo la llave de servicio escribe.';

alter table public.bot_booking_proposals enable row level security;
-- Quien atiende la bandeja del centro ve lo que el asistente propuso.
create policy bot_booking_proposals_select on public.bot_booking_proposals
  for select to authenticated using (private.can_use_leads(detail_center_id));
revoke all on public.bot_booking_proposals from anon;
revoke insert, update, delete, truncate, references, trigger on public.bot_booking_proposals from authenticated;
grant select on public.bot_booking_proposals to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Ayudantes (sólo dentro de las funciones del asistente)
-- ---------------------------------------------------------------------------

-- «jueves 22 de octubre, 10:00» en la zona del centro.
create function private.es_when(p_at timestamptz, p_timezone text) returns text
language sql stable set search_path = '' as $$
  select (array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'])[extract(isodow from l)::integer]
         || ' ' || extract(day from l)::integer || ' de '
         || (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre',
                   'noviembre', 'diciembre'])[extract(month from l)::integer]
         || ', ' || to_char(l, 'HH24:MI')
    from (select p_at at time zone p_timezone as l) x;
$$;

-- Teléfono del contacto de WhatsApp en el formato de clients. WhatsApp manda los
-- celulares de México como 521XXXXXXXXXX: se normaliza sin el «+» para aplicar
-- la regla del 521 (igual que normalizePhone).
create function private.whatsapp_phone(p_contact_phone text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select private.normalize_phone(regexp_replace(coalesce(p_contact_phone, ''), '\D', '', 'g'));
$$;

-- Cliente de la conversación: el ligado o, si no hay, el de la organización con
-- el mismo teléfono (WhatsApp comparte el número verificado del contacto).
create function private.conversation_client(p_conversation_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select cl.id from public.conversations c join public.clients cl on cl.id = c.client_id and cl.active
      where c.id = p_conversation_id),
    (select m.client_id
       from public.conversations c,
            private.client_matches(c.organization_id, private.whatsapp_phone(c.contact_phone), null, '{}', '{}') m
      where c.id = p_conversation_id and c.contact_phone is not null and 'phone' = any (m.matched_on)
      limit 1));
$$;

-- Servicios que el asistente puede agendar en el centro, o el motivo por el que no.
create function private.booking_services_error(p_organization_id uuid, p_detail_center_id uuid, p_service_ids uuid[])
returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(cardinality(p_service_ids), 0) not between 1 and 5 then
    return 'Indica de 1 a 5 servicios del catálogo (servicio_ids de consultar_servicios)';
  end if;
  -- Misma regla que center_catalog (activo y disponible en el centro), sin sesión de usuario.
  if exists (select 1 from unnest(p_service_ids) sid
              where not exists (select 1 from public.services s
                                  left join public.service_center_config cfg
                                    on cfg.detail_center_id = p_detail_center_id and cfg.service_id = s.id
                                 where s.id = sid and s.organization_id = p_organization_id and s.active
                                   and coalesce(cfg.available, true))) then
    return 'Algún servicio no está disponible en este centro';
  end if;
  if exists (select 1 from public.bot_service_settings b
              where b.service_id = any (p_service_ids) and (not b.bookable or not b.visible)) then
    return 'Alguno de esos servicios requiere valoración previa: pasa a una persona con motivo requiere_valoracion';
  end if;
  return null;
end;
$$;

-- Bahía libre para [inicio, fin) en el centro, o null. Respeta la capacidad
-- (citas activas sin bahía también ocupan) y deja fuera la cita que se reprograma.
create function private.booking_free_bay(
  p_detail_center_id uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_exclude uuid default null
) returns uuid
language sql stable security definer set search_path = '' as $$
  with busy as (
    select a.bay_id from public.appointments a
     where a.detail_center_id = p_detail_center_id and a.id is distinct from p_exclude
       and a.status in ('programada', 'recibida', 'en_servicio')
       and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  )
  select b.id from public.bays b
   where b.detail_center_id = p_detail_center_id and b.active
     and (select count(*) from busy) < (select count(*) from public.bays x where x.detail_center_id = p_detail_center_id and x.active)
     and not exists (select 1 from busy where busy.bay_id = b.id)
   order by b.name, b.id
   limit 1;
$$;

-- Valida un horario para el asistente: horario del centro, anticipación,
-- días hacia adelante y bahía libre. Devuelve {error} o {inicio, fin, duracion, bahia}.
create function private.booking_check_slot(
  p_organization_id uuid, p_detail_center_id uuid, p_starts_at timestamptz, p_duration integer,
  p_exclude uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.detail_centers;
  s public.bot_settings;
  h public.center_hours;
  local_day date;
  v_ends timestamptz := p_starts_at + make_interval(mins => p_duration);
  bay uuid;
begin
  select * into c from public.detail_centers where id = p_detail_center_id and organization_id = p_organization_id;
  select * into s from public.bot_settings where organization_id = p_organization_id;
  local_day := (p_starts_at at time zone c.timezone)::date;
  if p_starts_at < now() + make_interval(hours => s.min_hours_ahead) then
    return jsonb_build_object('error', format('Se agenda con al menos %s h de anticipación', s.min_hours_ahead));
  end if;
  if local_day > private.center_today(c.id) + s.max_days_ahead then
    return jsonb_build_object('error', format('Se agenda hasta %s días adelante', s.max_days_ahead));
  end if;
  select * into h from public.center_hours x where x.detail_center_id = c.id and x.weekday = extract(isodow from local_day);
  if not found then
    return jsonb_build_object('error', 'El centro no abre ese día');
  end if;
  if p_starts_at < (local_day + h.opens_at) at time zone c.timezone
     or v_ends > (local_day + h.closes_at) at time zone c.timezone then
    return jsonb_build_object('error', format('Fuera del horario del centro ese día (%s a %s, el servicio debe terminar antes del cierre)',
                                              to_char(h.opens_at, 'HH24:MI'), to_char(h.closes_at, 'HH24:MI')));
  end if;
  bay := private.booking_free_bay(c.id, p_starts_at, v_ends, p_exclude);
  if bay is null then
    return jsonb_build_object('error', 'Ese horario ya no está disponible; consulta los horarios libres otra vez');
  end if;
  return jsonb_build_object('inicio', p_starts_at, 'fin', v_ends, 'duracion', p_duration, 'bahia', bay);
end;
$$;

-- Inicio en UTC desde fecha y hora locales del centro (AAAA-MM-DD y HH:MM), o null.
create function private.booking_local_start(p_detail_center_id uuid, p_date date, p_time text) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select (p_date + p_time::time) at time zone c.timezone
    from public.detail_centers c
   where c.id = p_detail_center_id and p_date is not null and coalesce(p_time, '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';
$$;

-- Las propuestas anteriores que siguen pendientes en la conversación dejan de valer.
create function private.discard_pending_proposals(p_conversation_id uuid, p_reason text) returns void
language sql security definer set search_path = '' as $$
  update public.bot_booking_proposals
     set status = 'descartada', result = left(p_reason, 500), decided_at = now()
   where conversation_id = p_conversation_id and status = 'pendiente';
$$;

-- Cita de la conversación que el cliente puede cambiar (suya, programada y por venir).
create function private.client_appointment(p_conversation_id uuid, p_appointment_id uuid) returns public.appointments
language plpgsql stable security definer set search_path = '' as $$
declare
  a public.appointments;
  client uuid := private.conversation_client(p_conversation_id);
begin
  select * into a from public.appointments x
   where x.id = p_appointment_id and client is not null and x.client_id = client
     and x.status = 'programada' and x.starts_at > now();
  return a;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Herramientas del asistente (sólo la llave de servicio, con el turno)
-- ---------------------------------------------------------------------------

-- Lo que la plataforma sabe del contacto: nombre, autos y próximas citas.
create function public.assistant_client_profile(p_turn_id uuid) returns jsonb
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
                          and a.status in ('programada', 'recibida', 'en_servicio') and a.ends_at > now()), '[]'::jsonb));
end;
$$;

-- Propone una cita nueva. No la crea: el cliente la confirma con el botón.
create function public.assistant_propose_booking(
  p_turn_id uuid,
  p_detail_center_id uuid,
  p_service_ids uuid[],
  p_date date,
  p_time text,
  p_client_name text,
  p_vehicle_id uuid,
  p_vehicle_make text,
  p_vehicle_model text,
  p_vehicle_year integer,
  p_vehicle_plate text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.bot_turns := private.assistant_turn(p_turn_id);
  c public.detail_centers := private.assistant_center(t.organization_id, p_detail_center_id);
  s public.bot_settings;
  client uuid := private.conversation_client(t.conversation_id);
  err text;
  starts timestamptz;
  duration integer;
  slot jsonb;
  v public.vehicles;
  v_name text := nullif(regexp_replace(btrim(coalesce(p_client_name, '')), '\s+', ' ', 'g'), '');
  v_plate text := private.normalize_plate(p_vehicle_plate);
  v_make text := nullif(btrim(coalesce(p_vehicle_make, '')), '');
  v_model text := nullif(btrim(coalesce(p_vehicle_model, '')), '');
  vehicle_text text;
  services_text text;
  p public.bot_booking_proposals;
begin
  select * into s from public.bot_settings where organization_id = t.organization_id;
  if not s.self_booking then
    return jsonb_build_object('error', 'Esta organización agenda con una persona: usa pasar_a_persona con motivo agendar');
  end if;
  err := private.booking_services_error(t.organization_id, c.id, p_service_ids);
  if err is not null then
    return jsonb_build_object('error', err);
  end if;
  starts := private.booking_local_start(c.id, p_date, p_time);
  if starts is null then
    return jsonb_build_object('error', 'Fecha (AAAA-MM-DD) u hora (HH:MM) inválida');
  end if;
  select sum(x.standard_duration_minutes)::integer into duration from public.services x where x.id = any (p_service_ids);
  slot := private.booking_check_slot(t.organization_id, c.id, starts, duration);
  if slot ? 'error' then
    return slot;
  end if;
  -- Nombre: el del cliente registrado o el que dio el contacto.
  if client is not null then
    select cl.full_name into v_name from public.clients cl where cl.id = client;
  elsif v_name is null or length(v_name) not between 2 and 120 then
    return jsonb_build_object('error', 'Falta el nombre del cliente (2 a 120 caracteres)');
  end if;
  -- Auto: uno registrado del cliente o uno nuevo (marca, modelo y año; placa opcional).
  if p_vehicle_id is not null then
    select * into v from public.vehicles x where x.id = p_vehicle_id and x.active and client is not null and x.client_id = client;
    if not found then
      return jsonb_build_object('error', 'Ese vehículo no es de este cliente; usa un vehiculo_id de consultar_cliente o los datos del auto');
    end if;
    vehicle_text := private.vehicle_label(v.make, v.model, v.year, v.plate);
  else
    if v_make is null or v_model is null or length(v_make) > 60 or length(v_model) > 60 then
      return jsonb_build_object('error', 'Falta la marca o el modelo del auto');
    end if;
    if p_vehicle_year is null or p_vehicle_year not between 1950 and extract(year from now())::integer + 1 then
      return jsonb_build_object('error', 'Falta el año del auto (o no es válido)');
    end if;
    if p_vehicle_plate is not null and btrim(p_vehicle_plate) <> '' and coalesce(v_plate, '') !~ '^[A-Z0-9]{3,10}$' then
      return jsonb_build_object('error', 'Placa inválida (3 a 10 letras o dígitos); si el cliente no la tiene, déjala vacía');
    end if;
    if v_plate is not null and exists (select 1 from public.vehicles x
                                        where x.organization_id = t.organization_id and x.plate = v_plate and x.active
                                        and x.client_id is distinct from client) then
      return jsonb_build_object('error', 'Esa placa ya está registrada con otro cliente: pasa a una persona con motivo agendar');
    end if;
    vehicle_text := private.vehicle_label(v_make, v_model, p_vehicle_year::smallint, v_plate);
  end if;
  select string_agg(x.name || ' (' || x.standard_duration_minutes || ' min)', ', ' order by u.ord)
    into services_text
    from unnest(p_service_ids) with ordinality u(id, ord) join public.services x on x.id = u.id;
  perform private.discard_pending_proposals(t.conversation_id, 'Hubo una propuesta más reciente');
  insert into public.bot_booking_proposals (
    organization_id, detail_center_id, conversation_id, turn_id, kind, service_ids, starts_at, duration_minutes,
    client_name, vehicle_id, vehicle_make, vehicle_model, vehicle_year, vehicle_plate, summary, expires_at
  ) values (
    t.organization_id, c.id, t.conversation_id, t.id, 'agendar', p_service_ids, starts, duration,
    v_name, v.id, case when v.id is null then v_make end, case when v.id is null then v_model end,
    case when v.id is null then p_vehicle_year::smallint end, case when v.id is null then v_plate end,
    left('*Confirme su cita*' || chr(10)
         || 'Centro: ' || c.name || chr(10)
         || 'Fecha: ' || private.es_when(starts, c.timezone) || chr(10)
         || 'Servicio: ' || services_text || chr(10)
         || 'Auto: ' || vehicle_text || chr(10)
         || 'Nombre: ' || v_name || chr(10) || chr(10)
         || 'Toque *Confirmar* para agendarla o *Cambiar* si algo no está bien.', 1024),
    least(starts - make_interval(hours => s.min_hours_ahead), now() + interval '24 hours')
  ) returning * into p;
  return jsonb_build_object('propuesta_id', p.id, 'resumen', p.summary,
                            'nota', 'El sistema envía este resumen con los botones Confirmar y Cambiar; la cita se crea cuando el cliente toca Confirmar.');
end;
$$;

-- Propone mover una cita del cliente a otro horario (mismos servicios).
create function public.assistant_propose_reschedule(p_turn_id uuid, p_appointment_id uuid, p_date date, p_time text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.bot_turns := private.assistant_turn(p_turn_id);
  s public.bot_settings;
  a public.appointments := private.client_appointment(t.conversation_id, p_appointment_id);
  c public.detail_centers;
  starts timestamptz;
  slot jsonb;
  p public.bot_booking_proposals;
begin
  select * into s from public.bot_settings where organization_id = t.organization_id;
  if not s.self_booking then
    return jsonb_build_object('error', 'Esta organización cambia citas con una persona: usa pasar_a_persona con motivo agendar');
  end if;
  if a.id is null or a.organization_id <> t.organization_id then
    return jsonb_build_object('error', 'Esa cita no es de este cliente o ya no se puede cambiar (usa cita_id de consultar_cliente)');
  end if;
  select * into c from public.detail_centers where id = a.detail_center_id;
  starts := private.booking_local_start(c.id, p_date, p_time);
  if starts is null then
    return jsonb_build_object('error', 'Fecha (AAAA-MM-DD) u hora (HH:MM) inválida');
  end if;
  slot := private.booking_check_slot(t.organization_id, c.id, starts, a.duration_minutes, a.id);
  if slot ? 'error' then
    return slot;
  end if;
  perform private.discard_pending_proposals(t.conversation_id, 'Hubo una propuesta más reciente');
  insert into public.bot_booking_proposals (
    organization_id, detail_center_id, conversation_id, turn_id, kind, appointment_id, service_ids, starts_at,
    duration_minutes, summary, expires_at
  ) values (
    t.organization_id, c.id, t.conversation_id, t.id, 'reagendar', a.id,
    coalesce((select array_agg(aps.service_id order by aps.position) from public.appointment_services aps
               where aps.appointment_id = a.id), '{}'),
    starts, a.duration_minutes,
    left('*Cambio de cita*' || chr(10)
         || 'Centro: ' || c.name || chr(10)
         || 'Antes: ' || private.es_when(a.starts_at, c.timezone) || chr(10)
         || 'Nuevo horario: ' || private.es_when(starts, c.timezone) || chr(10) || chr(10)
         || 'Toque *Confirmar* para cambiarla o *Cambiar* si prefiere otro horario.', 1024),
    least(starts - make_interval(hours => s.min_hours_ahead), a.starts_at, now() + interval '24 hours')
  ) returning * into p;
  return jsonb_build_object('propuesta_id', p.id, 'resumen', p.summary,
                            'nota', 'El sistema envía este resumen con los botones; el cambio se hace cuando el cliente toca Confirmar.');
end;
$$;

-- Propone cancelar una cita del cliente.
create function public.assistant_propose_cancel(p_turn_id uuid, p_appointment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.bot_turns := private.assistant_turn(p_turn_id);
  a public.appointments := private.client_appointment(t.conversation_id, p_appointment_id);
  c public.detail_centers;
  p public.bot_booking_proposals;
begin
  if a.id is null or a.organization_id <> t.organization_id then
    return jsonb_build_object('error', 'Esa cita no es de este cliente o ya no se puede cancelar (usa cita_id de consultar_cliente)');
  end if;
  select * into c from public.detail_centers where id = a.detail_center_id;
  perform private.discard_pending_proposals(t.conversation_id, 'Hubo una propuesta más reciente');
  insert into public.bot_booking_proposals (
    organization_id, detail_center_id, conversation_id, turn_id, kind, appointment_id, summary, expires_at
  ) values (
    t.organization_id, c.id, t.conversation_id, t.id, 'cancelar', a.id,
    left('*Cancelar cita*' || chr(10)
         || 'Centro: ' || c.name || chr(10)
         || 'Fecha: ' || private.es_when(a.starts_at, c.timezone) || chr(10) || chr(10)
         || '¿Confirma que desea cancelarla?', 1024),
    least(a.starts_at, now() + interval '24 hours')
  ) returning * into p;
  return jsonb_build_object('propuesta_id', p.id, 'resumen', p.summary,
                            'nota', 'El sistema envía este resumen con los botones; se cancela cuando el cliente lo confirma.');
end;
$$;

-- Deja «pendiente» el mensaje con el resumen y los botones de la propuesta (en
-- lugar de la respuesta de texto del turno). Misma regla: una respuesta por turno.
create function public.assistant_reply_proposal(p_turn_id uuid, p_proposal_id uuid)
returns table (
  message_id uuid,
  channel text,
  external_account_id text,
  contact_external_id text,
  contact_phone text,
  body text,
  buttons jsonb,
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
  p public.bot_booking_proposals;
  v_buttons jsonb;
begin
  select * into v from public.conversations where id = t.conversation_id for update;
  select * into a from public.channel_accounts where id = v.channel_account_id;
  select * into m from public.messages x where x.conversation_id = v.id and x.request_id = t.id;
  if found then
    return query select m.id, v.channel, a.external_account_id, v.contact_external_id, v.contact_phone, m.body,
                        m.buttons, m.status <> 'pendiente', false;
    return;
  end if;
  select * into p from public.bot_booking_proposals x
   where x.id = p_proposal_id and x.turn_id = t.id and x.status = 'pendiente';
  if not found then
    raise exception 'Propuesta inexistente o de otro turno' using errcode = 'MG002';
  end if;
  select * into inbound from public.messages where id = t.inbound_message_id;
  if exists (select 1 from public.messages x
              where x.conversation_id = v.id and x.direction = 'entrante' and x.id <> inbound.id
                and (x.occurred_at, x.created_at) > (inbound.occurred_at, inbound.created_at)) then
    update public.bot_booking_proposals
       set status = 'descartada', result = 'Llegó un mensaje más reciente', decided_at = now()
     where id = p.id;
    update public.bot_turns set status = 'omitido', skip_reason = 'Llegó un mensaje más reciente', finished_at = now()
     where id = t.id;
    return query select null::uuid, v.channel, null::text, null::text, null::text, null::text, null::jsonb, false, true;
    return;
  end if;
  if not a.active or a.status <> 'verificada' then
    raise exception 'La cuenta de WhatsApp no está verificada' using errcode = 'MG002';
  end if;
  if not private.conversation_window_open(v) then
    raise exception 'Ventana de 24 h cerrada' using errcode = 'MG002';
  end if;
  v_buttons := case when p.kind = 'cancelar'
    then jsonb_build_array(jsonb_build_object('id', 'cita:confirmar:' || p.id, 'titulo', 'Sí, cancelar'),
                           jsonb_build_object('id', 'cita:cambiar:' || p.id, 'titulo', 'No, mantenerla'))
    else jsonb_build_array(jsonb_build_object('id', 'cita:confirmar:' || p.id, 'titulo', 'Confirmar'),
                           jsonb_build_object('id', 'cita:cambiar:' || p.id, 'titulo', 'Cambiar')) end;
  insert into public.messages (organization_id, detail_center_id, conversation_id, direction, message_type, body, status,
                               sent_by, sent_by_bot, request_id, buttons)
  values (v.organization_id, v.detail_center_id, v.id, 'saliente', 'interactive', p.summary, 'pendiente', null, true, t.id,
          v_buttons)
  returning * into m;
  update public.bot_turns set reply_message_id = m.id where id = t.id;
  update public.bot_booking_proposals set message_id = m.id where id = p.id;
  return query select m.id, v.channel, a.external_account_id, v.contact_external_id, v.contact_phone, m.body, m.buttons,
                      false, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Confirmación con el botón del cliente
-- ---------------------------------------------------------------------------

-- Ejecuta una propuesta confirmada. Devuelve {ok, appointment_id} o {error}.
-- Sólo se llama desde assistant_handle_button (llave de servicio).
create function private.booking_execute(p_proposal_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.bot_booking_proposals;
  conv public.conversations;
  c public.detail_centers;
  a public.appointments;
  v_client uuid;
  v_vehicle uuid;
  v_phone text;
  slot jsonb;
  new_id uuid;
begin
  select * into p from public.bot_booking_proposals where id = p_proposal_id;
  select * into conv from public.conversations where id = p.conversation_id;
  select * into c from public.detail_centers where id = p.detail_center_id;
  -- Una confirmación a la vez por centro: el horario se vuelve a validar con el bloqueo tomado.
  perform pg_advisory_xact_lock(hashtextextended('agenda:' || c.id::text, 0));

  if p.kind = 'cancelar' then
    a := private.client_appointment(p.conversation_id, p.appointment_id);
    if a.id is null then
      return jsonb_build_object('error', 'Esa cita ya no se puede cancelar desde aquí.');
    end if;
    perform private.set_change_reason('Cancelada por el cliente en WhatsApp');
    update public.appointments set status = 'cancelada', cancelled_at = now() where id = a.id;
    return jsonb_build_object('ok', true, 'appointment_id', a.id);
  end if;

  if p.kind = 'reagendar' then
    a := private.client_appointment(p.conversation_id, p.appointment_id);
    if a.id is null then
      return jsonb_build_object('error', 'Esa cita ya no se puede cambiar desde aquí.');
    end if;
    slot := private.booking_check_slot(p.organization_id, c.id, p.starts_at, a.duration_minutes, a.id);
    if slot ? 'error' then
      return jsonb_build_object('error', slot ->> 'error');
    end if;
    perform private.set_change_reason('Reprogramada por el cliente en WhatsApp');
    begin
      update public.appointments
         set starts_at = p.starts_at, bay_id = (slot ->> 'bahia')::uuid, conflict_override = false
       where id = a.id;
    exception when exclusion_violation then
      return jsonb_build_object('error', 'Ese horario se acaba de ocupar.');
    end;
    return jsonb_build_object('ok', true, 'appointment_id', a.id);
  end if;

  -- agendar
  select * into a from public.appointments x where x.organization_id = p.organization_id and x.request_id = p.id;
  if found then
    return jsonb_build_object('ok', true, 'appointment_id', a.id);
  end if;
  if private.booking_services_error(p.organization_id, c.id, p.service_ids) is not null then
    return jsonb_build_object('error', 'Alguno de los servicios ya no se puede agendar por aquí.');
  end if;
  slot := private.booking_check_slot(p.organization_id, c.id, p.starts_at, p.duration_minutes);
  if slot ? 'error' then
    return jsonb_build_object('error', 'Ese horario ya no está disponible.');
  end if;

  v_client := private.conversation_client(conv.id);
  if v_client is null then
    v_phone := private.whatsapp_phone(conv.contact_phone);
    if v_phone is null then
      return jsonb_build_object('error', 'No tenemos su número de teléfono para registrarle.');
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p.organization_id::text || v_phone, 0));
    v_client := private.conversation_client(conv.id);
  end if;
  if v_client is null then
    perform private.set_change_reason('Alta de cliente: confirmó su cita por WhatsApp');
    new_id := gen_random_uuid();
    insert into public.clients (id, organization_id, home_detail_center_id, kind, full_name, phone, request_id,
                                created_in_detail_center_id, created_by)
    values (new_id, p.organization_id, c.id, 'person', p.client_name, v_phone, p.id, c.id, null);
    v_client := new_id;
  end if;
  perform private.set_change_reason('Cita confirmada por el cliente en WhatsApp');
  insert into public.client_centers (client_id, detail_center_id, organization_id)
  values (v_client, c.id, p.organization_id)
  on conflict (client_id, detail_center_id) do nothing;

  if p.vehicle_id is not null then
    select x.id into v_vehicle from public.vehicles x where x.id = p.vehicle_id and x.client_id = v_client and x.active;
    if v_vehicle is null then
      return jsonb_build_object('error', 'El auto ya no está registrado con este cliente.');
    end if;
  else
    select x.id into v_vehicle from public.vehicles x
     where x.organization_id = p.organization_id and x.request_id = p.id;
    if v_vehicle is null and p.vehicle_plate is not null then
      select x.id into v_vehicle from public.vehicles x
       where x.organization_id = p.organization_id and x.plate = p.vehicle_plate and x.active;
      if v_vehicle is not null and not exists (select 1 from public.vehicles x where x.id = v_vehicle and x.client_id = v_client) then
        return jsonb_build_object('error', 'Esa placa ya está registrada con otro cliente.');
      end if;
    end if;
    if v_vehicle is null then
      insert into public.vehicles (organization_id, client_id, make, model, year, plate, request_id,
                                   created_in_detail_center_id, created_by)
      values (p.organization_id, v_client, p.vehicle_make, p.vehicle_model, p.vehicle_year, p.vehicle_plate, p.id, c.id, null)
      returning id into v_vehicle;
    end if;
  end if;

  if conv.client_id is null then
    update public.conversations set client_id = v_client where id = conv.id;
  end if;

  new_id := gen_random_uuid();
  begin
    insert into public.appointments (
      id, organization_id, detail_center_id, client_id, vehicle_id, starts_at, duration_minutes, bay_id, notes,
      status, source, request_id, created_by
    ) values (
      new_id, p.organization_id, c.id, v_client, v_vehicle, p.starts_at, p.duration_minutes, (slot ->> 'bahia')::uuid,
      'Agendada por el cliente en WhatsApp', 'programada', 'whatsapp', p.id, null
    );
  exception when exclusion_violation then
    return jsonb_build_object('error', 'Ese horario se acaba de ocupar.');
  end;
  perform private.set_appointment_services(new_id, p.organization_id, p.service_ids);
  return jsonb_build_object('ok', true, 'appointment_id', new_id);
end;
$$;

-- El contacto tocó un botón (payload «cita:<accion>:<propuesta>»). Si es de una
-- propuesta de esta conversación, la ejecuta o la descarta y devuelve la
-- respuesta a enviar. {handled: false} = el asistente atiende el mensaje como
-- cualquier otro (p. ej. «Cambiar»).
create function public.assistant_handle_button(p_message_id uuid) returns jsonb
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
-- 7. Ajustes a funciones existentes
-- ---------------------------------------------------------------------------

-- El webhook guarda el id del botón que tocó el contacto.
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
                                 body, status, occurred_at, status_at, payload)
    values (conv.organization_id, conv.detail_center_id, conv.id, 'entrante', item ->> 'external_id',
            coalesce(nullif(item ->> 'message_type', ''), 'text'), body, 'recibido', at, now(),
            left(nullif(btrim(item ->> 'payload'), ''), 200))
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

-- El turno lleva el ajuste de agenda propia; la configuración lo muestra y lo cambia.
create or replace function public.assistant_begin_turn(p_message_id uuid) returns jsonb
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
      'mention_promotions', s.mention_promotions, 'mention_memberships', s.mention_memberships,
      'self_booking', s.self_booking),
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
  version integer,
  updated_at timestamptz,
  can_manage boolean
)
language sql stable security definer set search_path = '' as $$
  select s.mode, s.model, s.assistant_name, s.tone, s.greeting, s.privacy_url, s.human_hours, s.after_hours_message,
         s.center_choice, s.max_days_ahead, s.min_hours_ahead, s.mention_promotions, s.mention_memberships,
         case when private.can_manage_assistant(s.organization_id) then s.test_numbers else '{}'::text[] end,
         s.self_booking, s.version, s.updated_at, private.can_manage_assistant(s.organization_id)
    from public.bot_settings s
   where s.organization_id = p_organization_id and private.can_read_assistant(s.organization_id);
$$;

drop function public.update_assistant_settings(uuid, integer, text, text, text, text, text, text, text, text, text, integer, integer, boolean, boolean, text[], text);
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
  p_reason text,
  p_self_booking boolean default null
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
         test_numbers = v_numbers, self_booking = coalesce(p_self_booking, self_booking),
         updated_by = auth.uid()
   where organization_id = p_organization_id
   returning * into s;
  return s;
end;
$$;

-- Listas que muestran el vehículo: un auto sin placa sigue apareciendo («sin placa»);
-- la agenda muestra además el origen de la cita.
create or replace function public.client_history(p_client_id uuid)
returns table (
  occurred_at timestamptz,
  kind text,
  detail_center_id uuid,
  detail_center_name text,
  title text,
  vehicle_id uuid
)
language sql stable security invoker set search_path = '' as $$
  with fam as (
    select unnest(private.client_family(p_client_id)) as id
     where exists (select 1 from public.clients c where c.id = p_client_id)
  ), entries as (
    select c.created_at as occurred_at, 'client_created' as kind, c.created_in_detail_center_id as center_id,
           'Alta del cliente' as title, null::uuid as vehicle_id
    from public.clients c where c.id = p_client_id
    union all
    select c.merged_at, 'client_merged', c.created_in_detail_center_id,
           'Se fusionó un duplicado: ' || c.full_name, null
    from public.clients c where c.merged_into_id = p_client_id
    union all
    select v.created_at, 'vehicle_added', v.created_in_detail_center_id,
           'Vehículo ' || v.make || ' ' || v.model || ' ' || v.year || coalesce(' (' || v.plate || ')', ' (sin placa)'), v.id
    from public.vehicles v where v.client_id in (select id from fam)
    union all
    select cc.first_seen_at, 'center_linked', cc.detail_center_id, 'Primera atención en el centro', null
    from public.client_centers cc
    join public.clients c on c.id = cc.client_id
    where cc.client_id = p_client_id and cc.detail_center_id <> c.created_in_detail_center_id
    union all
    select cc.last_visit_at, 'visit', cc.detail_center_id, 'Última visita', null
    from public.client_centers cc
    where cc.client_id = p_client_id and cc.last_visit_at is not null
  )
  select e.occurred_at, e.kind, e.center_id, dc.name, e.title, e.vehicle_id
  from entries e
  join public.detail_centers dc on dc.id = e.center_id
  where private.can_read_clients(e.center_id)
  order by e.occurred_at desc, e.kind;
$$;

create or replace function public.list_memberships(
  p_detail_center_id uuid,
  p_status text default null,
  p_query text default null,
  p_limit integer default 50
)
returns table (
  id uuid,
  number text,
  state public.membership_state,
  status text,
  plan_code text,
  plan_name text,
  plan_tier text,
  price numeric,
  period_months smallint,
  client_id uuid,
  client_name text,
  vehicle_id uuid,
  vehicle_label text,
  started_on date,
  ends_on date,
  renewals integer
)
language sql stable security invoker set search_path = '' as $$
  select x.id, x.number, x.state, x.status, x.plan_code, x.plan_name, x.plan_tier, x.price, x.period_months,
         x.client_id, x.client_name, x.vehicle_id, x.vehicle_label, x.started_on, x.ends_on, x.renewals
  from (
    select m.*, c.full_name as client_name,
           private.vehicle_label(v.make, v.model, v.year, v.plate) as vehicle_label, v.plate,
           private.membership_status(m.state, m.ends_on, m.renewal_notice_days,
                                     private.center_today(m.detail_center_id)) as status
      from public.memberships m
      join public.clients c on c.id = m.client_id
      join public.vehicles v on v.id = m.vehicle_id
     where m.detail_center_id = p_detail_center_id
  ) x
  where (p_status is null or x.status = p_status)
    and (nullif(btrim(p_query), '') is null
         or x.number ilike '%' || private.like_escape(btrim(p_query)) || '%'
         or x.client_name ilike '%' || private.like_escape(btrim(p_query)) || '%'
         or x.plate ilike '%' || private.like_escape(private.normalize_plate(p_query)) || '%')
  order by x.ends_on, x.number
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

create or replace function public.list_quotes(
  p_detail_center_ids uuid[],
  p_status text default null,
  p_lead_id uuid default null,
  p_client_id uuid default null,
  p_id uuid default null,
  p_limit integer default 200
)
returns table (
  id uuid,
  detail_center_id uuid,
  detail_center_name text,
  folio text,
  lead_id uuid,
  lead_name text,
  client_id uuid,
  client_name text,
  vehicle_id uuid,
  vehicle_label text,
  contact_name text,
  status text,
  expired boolean,
  valid_until date,
  subtotal numeric,
  discount_total numeric,
  total numeric,
  standard_cost_total numeric,
  operator_pay_total numeric,
  cost_total numeric,
  contribution_margin numeric,
  notes text,
  appointment_id uuid,
  appointment_starts_at timestamptz,
  service_order_id uuid,
  service_order_folio text,
  sent_at timestamptz,
  decided_at timestamptz,
  decision_reason text,
  items jsonb,
  discounts jsonb,
  version integer,
  created_by_name text,
  created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select q.id, q.detail_center_id, dc.name, q.folio, q.lead_id, l.full_name, q.client_id, c.full_name, q.vehicle_id,
         private.vehicle_label(v.make, v.model, v.year, v.plate), q.contact_name, q.status,
         private.quote_expired(q), q.valid_until, q.subtotal, q.discount_total, q.total, q.standard_cost_total,
         q.operator_pay_total, q.cost_total, q.contribution_margin, q.notes, q.appointment_id, a.starts_at,
         a.service_order_id, o.folio, q.sent_at, q.decided_at, q.decision_reason,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', i.id, 'service_id', i.service_id, 'service_code', i.service_code,
                     'service_name', i.service_name, 'revenue_engine', i.revenue_engine, 'unit_price', i.unit_price,
                     'price_source', i.price_source, 'unit_direct_cost', i.unit_direct_cost,
                     'operator_commission_pct', i.operator_commission_pct, 'duration_minutes', i.duration_minutes,
                     'quantity', i.quantity, 'line_subtotal', i.line_subtotal, 'line_discount', i.line_discount,
                     'operator_pay', i.operator_pay,
                     'current_price', (select cat.price from public.center_catalog(q.detail_center_id) cat
                                        where cat.id = i.service_id))
                     order by i.position)
                     from public.quote_items i where i.quote_id = q.id), '[]'),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', d.id, 'item_id', d.item_id, 'kind', d.kind, 'value', d.value, 'amount', d.amount,
                     'reason', d.reason, 'authorization_level', d.authorization_level,
                     'authorized_by_name', pd.full_name, 'voided_at', d.voided_at, 'void_reason', d.void_reason,
                     'created_at', d.created_at) order by d.created_at)
                     from public.quote_discounts d left join public.profiles pd on pd.id = d.authorized_by
                    where d.quote_id = q.id), '[]'),
         q.version, pc.full_name, q.created_at
    from public.quotes q
    join public.detail_centers dc on dc.id = q.detail_center_id
    left join public.leads l on l.id = q.lead_id
    left join public.clients c on c.id = q.client_id
    left join public.vehicles v on v.id = q.vehicle_id
    left join public.appointments a on a.id = q.appointment_id
    left join public.service_orders o on o.id = a.service_order_id
    left join public.profiles pc on pc.id = q.created_by
   where q.detail_center_id = any (p_detail_center_ids)
     and private.can_use_leads(q.detail_center_id)
     and (p_id is null or q.id = p_id)
     and (p_lead_id is null or q.lead_id = p_lead_id)
     and (p_client_id is null or q.client_id = any (private.client_family(p_client_id)))
     and (p_status is null
          or (p_status = 'vencida' and private.quote_expired(q))
          or (p_status <> 'vencida' and q.status = p_status and not private.quote_expired(q)))
   order by q.created_at desc
   limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;

create or replace function public.search_clients(p_detail_center_id uuid, p_query text, p_limit integer default 20)
returns table (
  id uuid,
  full_name text,
  phone text,
  email text,
  kind text,
  home_detail_center_id uuid,
  home_center_name text,
  last_visit_at timestamptz,
  in_active_center boolean,
  plates text[],
  matched_on text
)
language sql stable security invoker set search_path = '' as $$
  with q as (
    select private.like_escape(private.normalize_text(p_query)) as name,
           regexp_replace(coalesce(p_query, ''), '\D', '', 'g') as digits,
           private.like_escape(coalesce(private.normalize_plate(p_query), '')) as plate,
           private.like_escape(coalesce(private.normalize_email(p_query), '')) as email,
           array(select private.like_escape(w)
                   from unnest(regexp_split_to_array(private.normalize_text(p_query), ' ')) w
                  where w <> '') as words
    where length(btrim(coalesce(p_query, ''))) >= 2
  ),
  hits as (
    select c.*, v.plates,
           case
             when q.plate <> '' and exists (select 1 from public.vehicles x
                    where x.client_id = c.id and x.active and x.plate like '%' || q.plate || '%') then 'plate'
             when length(q.digits) >= 4 and c.phone_digits like '%' || q.digits || '%' then 'phone'
             when q.email like '%@%' and c.email like q.email || '%' then 'email'
             when c.search_name like '%' || q.name || '%'
                  or (cardinality(q.words) > 1
                      and not exists (select 1 from unnest(q.words) w where c.search_name not like '%' || w || '%'))
               then 'name'
           end as matched_on
    from public.clients c
    cross join q
    left join lateral (
      select coalesce(array_agg(x.plate order by x.created_at) filter (where x.plate is not null), '{}') as plates
      from public.vehicles x where x.client_id = c.id and x.active
    ) v on true
    where c.active
  )
  select h.id, h.full_name, h.phone, h.email, h.kind, h.home_detail_center_id, dc.name, h.last_visit_at,
         exists (select 1 from public.client_centers cc
                  where cc.client_id = h.id and cc.detail_center_id = p_detail_center_id),
         h.plates, h.matched_on
  from hits h
  left join public.detail_centers dc on dc.id = h.home_detail_center_id
  where h.matched_on is not null
  order by 9 desc, (h.matched_on = 'plate') desc, (h.matched_on = 'phone') desc,
           (h.search_name like (select q.name from q) || '%') desc, h.full_name
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

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
  source text
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
         a.notes, a.service_order_id, a.source
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
-- 8. Permisos
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.require_order_plate()', 'private.es_when(timestamptz, text)', 'private.conversation_client(uuid)',
    'private.whatsapp_phone(text)',
    'private.booking_services_error(uuid, uuid, uuid[])', 'private.booking_free_bay(uuid, timestamptz, timestamptz, uuid)',
    'private.booking_check_slot(uuid, uuid, timestamptz, integer, uuid)', 'private.booking_local_start(uuid, date, text)',
    'private.discard_pending_proposals(uuid, text)', 'private.client_appointment(uuid, uuid)',
    'private.booking_execute(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
  -- Etiqueta del vehículo: la usan las consultas con la sesión del usuario.
  execute 'revoke all on function private.vehicle_label(text, text, smallint, text) from public, anon';
  execute 'grant execute on function private.vehicle_label(text, text, smallint, text) to authenticated, service_role';
  foreach fn in array array[
    'public.get_assistant_settings(uuid)',
    'public.update_assistant_settings(uuid, integer, text, text, text, text, text, text, text, text, text, integer, integer, boolean, boolean, text[], text, boolean)',
    'public.list_appointments(uuid, date, public.appointment_status, uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  -- Sólo el servidor con la llave de servicio (el asistente y el webhook).
  foreach fn in array array[
    'public.assistant_client_profile(uuid)',
    'public.assistant_propose_booking(uuid, uuid, uuid[], date, text, text, uuid, text, text, integer, text)',
    'public.assistant_propose_reschedule(uuid, uuid, date, text)',
    'public.assistant_propose_cancel(uuid, uuid)',
    'public.assistant_reply_proposal(uuid, uuid)',
    'public.assistant_handle_button(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
