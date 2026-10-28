-- Asistente de WhatsApp: número del contacto y límites de gasto y de citas
-- (auditoría de seguridad, ADR 0045).
--
-- 1. private.whatsapp_phone quitaba el «+» antes de normalizar, así que un número
--    extranjero de 10 dígitos (p. ej. Noruega +47 7xxxxxxx) se leía como celular
--    de México y podía coincidir con un cliente mexicano (y ver sus citas). Ahora
--    sólo se reescribe el 521 de México; el resto se conserva en E.164.
-- 2. Límites por turno en assistant_begin_turn: mensajes por conversación por
--    hora (al pasarlo, el asistente se pausa y la conversación la atiende una
--    persona) y turnos y tokens por organización en 24 h (al pasarlo, el mensaje
--    queda sin respuesta del asistente para el equipo).
-- 3. booking_execute: como máximo N citas futuras programadas por conversación.
--
-- Los límites viven en private.assistant_limits() (cambiarlos es una migración).

-- 1. Número del contacto --------------------------------------------------------
-- WhatsApp manda los celulares de México como +521XXXXXXXXXX: se quita el 1
-- (formato de clients). Cualquier otro número se conserva tal cual (E.164).
create or replace function private.whatsapp_phone(p_contact_phone text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case
    when d ~ '^521[0-9]{10}$' then '+52' || substr(d, 4)
    when d ~ '^[1-9][0-9]{7,14}$' then '+' || d
  end
  from (select regexp_replace(coalesce(p_contact_phone, ''), '\D', '', 'g') as d) x;
$$;

-- 2. Límites -------------------------------------------------------------------
create function private.assistant_limits() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'turns_per_conversation_hour', 12,
    'turns_per_org_day', 1500,
    'tokens_per_org_day', 6000000,
    'future_bookings_per_conversation', 2);
$$;
revoke all on function private.assistant_limits() from public;
grant execute on function private.assistant_limits() to service_role;

create or replace function public.assistant_begin_turn(p_message_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m public.messages;
  c public.conversations;
  s public.bot_settings;
  t public.bot_turns;
  digits text;
  centers jsonb;
  lim jsonb;
  used_turns bigint;
  used_tokens bigint;
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
  -- Límites de gasto (ADR 0045): por conversación, el asistente se pausa y la
  -- atiende una persona; por organización, deja el mensaje sin responder.
  lim := private.assistant_limits();
  if (select count(*) from public.bot_turns x
       where x.conversation_id = c.id and x.started_at > now() - interval '1 hour') >= (lim ->> 'turns_per_conversation_hour')::integer then
    perform private.set_change_reason('El asistente se pausa: demasiados mensajes en una hora');
    update public.conversations
       set bot_status = 'pausado', bot_paused_reason = 'Límite de mensajes del asistente', bot_paused_at = now()
     where id = c.id;
    return jsonb_build_object('skip', 'límite de mensajes por conversación');
  end if;
  select count(*), coalesce(sum(x.input_tokens + x.output_tokens + x.cache_write_tokens), 0)
    into used_turns, used_tokens
    from public.bot_turns x
   where x.organization_id = c.organization_id and x.started_at > now() - interval '24 hours';
  if used_turns >= (lim ->> 'turns_per_org_day')::integer or used_tokens >= (lim ->> 'tokens_per_org_day')::bigint then
    return jsonb_build_object('skip', 'presupuesto diario del asistente agotado');
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

-- 3. Citas por conversación -------------------------------------------------------
create or replace function private.booking_execute(p_proposal_id uuid) returns jsonb
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
  -- Límite de citas por conversación (ADR 0045): un número no llena la agenda.
  if (select count(*) from public.appointments x
        join public.bot_booking_proposals y on y.id = x.request_id
       where y.conversation_id = conv.id and x.status = 'programada' and x.starts_at > now())
     >= (private.assistant_limits() ->> 'future_bookings_per_conversation')::integer then
    return jsonb_build_object('error',
      'Ya tiene citas próximas agendadas por aquí. Para agendar otra, le atiende una persona del centro.');
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
