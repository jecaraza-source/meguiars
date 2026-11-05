-- El asistente de WhatsApp se reanuda solo (ADR 0053).
--
-- Cuando una persona toma una conversación (contestó a mano, el asistente la
-- escaló o llegó al límite de mensajes), el asistente se pausa para no
-- interrumpir. Si después nadie del equipo responde, el cliente se quedaba sin
-- respuesta. Ahora, cuando el cliente vuelve a escribir y nadie del equipo ha
-- respondido desde la pausa en 2 horas (private.assistant_limits →
-- auto_resume_minutes), el asistente se reactiva, deja una nota interna en la
-- conversación y contesta. Una pausa manual («Pausado por …») se respeta.

create or replace function private.assistant_limits() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'turns_per_conversation_hour', 12,
    'turns_per_org_day', 1500,
    'tokens_per_org_day', 6000000,
    'future_bookings_per_conversation', 2,
    -- Reanudar solo si nadie del equipo respondió en este tiempo (ADR 0053).
    'auto_resume_minutes', 120);
$$;
revoke all on function private.assistant_limits() from public;
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
  lim := private.assistant_limits();
  if c.bot_status = 'pausado' then
    -- Se reanuda solo cuando el cliente vuelve a escribir y nadie del equipo
    -- respondió desde la pausa en el tiempo configurado. Una pausa manual
    -- («Pausado por …») la decide una persona y se respeta.
    if coalesce(c.bot_paused_reason, '') like 'Pausado por %'
       or greatest(coalesce(c.bot_paused_at, '-infinity'::timestamptz),
                   coalesce((select max(x.occurred_at) from public.messages x
                              where x.conversation_id = c.id and x.direction = 'saliente' and not x.sent_by_bot),
                            '-infinity'::timestamptz))
          > now() - make_interval(mins => (lim ->> 'auto_resume_minutes')::integer) then
      return jsonb_build_object('skip', 'asistente pausado en la conversación');
    end if;
    perform private.set_change_reason('El asistente se reanudó solo: nadie del equipo respondió a tiempo');
    update public.conversations
       set bot_status = 'activo', bot_paused_reason = null, bot_paused_at = null, bot_resumed_at = now()
     where id = c.id
    returning * into c;
    insert into public.conversation_notes (organization_id, detail_center_id, conversation_id, body, author_id, request_id)
    values (c.organization_id, c.detail_center_id, c.id,
            'Asistente: se reanudó solo porque nadie del equipo respondió en '
              || ((lim ->> 'auto_resume_minutes')::integer / 60) || ' h. Para que no conteste, páusalo de nuevo.',
            null, m.id)
    on conflict (conversation_id, request_id) do nothing;
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

