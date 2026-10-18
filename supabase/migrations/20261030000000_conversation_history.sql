-- Historial de conversaciones (Comercial → Historial). Cada mensaje ya se
-- guarda en public.messages y cada contacto en public.conversations; esto
-- agrega la búsqueda sobre ese historial, abiertas y atendidas:
-- - Cliente: nombre del contacto en WhatsApp/Messenger/Instagram, del cliente o
--   del prospecto ligado; todas las palabras en cualquier orden y sin acentos
--   («ruiz ana» encuentra a «Ana Ruíz»).
-- - Teléfono: sólo dígitos; con 10 o más se comparan los últimos 10, así
--   «55 1111 2222», «+52 55…» y el «+52 1 55…» de WhatsApp son el mismo número.
-- - Canal, estado y fechas (día local del centro: la conversación tuvo
--   mensajes dentro del rango).
-- Mismo acceso que la bandeja (private.can_use_leads por centro).

create index conversations_center_last_idx on public.conversations (detail_center_id, last_message_at desc);

create function public.conversation_history(
  p_detail_center_ids uuid[],
  p_client text default null,
  p_phone text default null,
  p_channel text default null,
  p_status text default null,
  p_from date default null,
  p_to date default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  detail_center_id uuid,
  detail_center_name text,
  channel text,
  contact_name text,
  contact_phone text,
  client_id uuid,
  client_name text,
  lead_id uuid,
  lead_name text,
  status text,
  priority text,
  started_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  messages_in integer,
  messages_out integer
)
language sql stable security definer set search_path = '' as $$
  with q as (
    select array(select private.like_escape(w)
                   from unnest(regexp_split_to_array(private.normalize_text(coalesce(p_client, '')), ' ')) w
                  where w <> '') as words,
           regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as digits
  ),
  q2 as (
    select q.words, case when length(q.digits) > 10 then right(q.digits, 10) else q.digits end as digits from q
  )
  select v.id, v.detail_center_id, dc.name, v.channel, v.contact_name, v.contact_phone, v.client_id, cl.full_name,
         v.lead_id, l.full_name, v.status, v.priority, v.created_at, v.last_message_at, v.last_message_preview,
         (select count(*)::integer from public.messages m where m.conversation_id = v.id and m.direction = 'entrante'),
         (select count(*)::integer from public.messages m where m.conversation_id = v.id and m.direction = 'saliente')
    from public.conversations v
    cross join q2
    join public.detail_centers dc on dc.id = v.detail_center_id
    left join public.leads l on l.id = v.lead_id
    left join public.clients cl on cl.id = v.client_id
   where v.detail_center_id = any (p_detail_center_ids)
     and private.can_use_leads(v.detail_center_id)
     and (p_channel is null or v.channel = p_channel)
     and (p_status is null or v.status = p_status)
     and (p_from is null or (v.last_message_at at time zone dc.timezone)::date >= p_from)
     and (p_to is null or (v.created_at at time zone dc.timezone)::date <= p_to)
     and (cardinality(q2.words) = 0
          or not exists (
            select 1 from unnest(q2.words) w
             where private.normalize_text(concat_ws(' ', v.contact_name, cl.full_name, l.full_name))
                   not like '%' || w || '%'))
     and (length(q2.digits) < 4
          or exists (
            select 1 from unnest(array[v.contact_phone, cl.phone, l.phone]) p
             where p is not null and regexp_replace(p, '\D', '', 'g') like '%' || q2.digits || '%'))
   order by v.last_message_at desc
   limit least(greatest(coalesce(p_limit, 100), 1), 300);
$$;

revoke all on function public.conversation_history(uuid[], text, text, text, text, date, date, integer) from public, anon;
grant execute on function public.conversation_history(uuid[], text, text, text, text, date, date, integer) to authenticated;
