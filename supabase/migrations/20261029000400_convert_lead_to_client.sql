-- «Convertir en cliente» desde el prospecto, con un botón:
-- * si ya hay un cliente de la organización con el mismo teléfono o correo,
--   lo liga (no duplica);
-- * si no, da de alta al cliente con nombre, teléfono, correo y los canales de
--   marketing que el prospecto autorizó, y lo liga.
-- Idempotente: el request_id del alta es el id del prospecto. Usa create_client
-- y link_lead_client, así que permisos (clients.write y leads.use), auditoría y
-- consentimiento son los mismos.
create function public.convert_lead_to_client(p_id uuid, p_version integer, p_reason text default null)
returns public.leads
language plpgsql security invoker set search_path = '' as $$
declare
  l public.leads;
  target uuid;
  reason text := coalesce(nullif(btrim(p_reason), ''), 'Prospecto convertido en cliente');
begin
  select * into l from public.leads where id = p_id;
  if not found then
    raise exception 'Prospecto inexistente o sin permiso' using errcode = '42501';
  end if;
  if l.client_id is not null then
    return l;
  end if;
  if l.phone is null then
    raise exception 'Agrega el teléfono del prospecto para convertirlo en cliente' using errcode = '22023';
  end if;
  select m.client_id into target
    from private.client_matches(l.organization_id, l.phone, l.email, '{}', '{}') m
   limit 1;
  if target is null then
    target := (public.create_client(
      l.detail_center_id, l.id, l.full_name, l.phone, l.email, 'person', null,
      array(select c from unnest(l.consent_channels) c where c in ('whatsapp', 'sms', 'email')),
      'web', '[]'::jsonb, null)).id;
  end if;
  return public.link_lead_client(l.id, p_version, target, reason);
end;
$$;

revoke all on function public.convert_lead_to_client(uuid, integer, text) from public, anon;
grant execute on function public.convert_lead_to_client(uuid, integer, text) to authenticated;
