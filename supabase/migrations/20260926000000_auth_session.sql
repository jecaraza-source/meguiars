-- F0.3 — Autenticación, roles y sesión web/móvil.
--
-- * profiles.last_detail_center_id: centro activo del usuario, compartido por
--   web y móvil. Sólo se cambia con set_active_center, que exige acceso al centro.
-- * set_user_disabled (sólo service_role): deshabilita/rehabilita una cuenta.
--   profiles.active = false retira todo acceso vía RLS de inmediato, y
--   auth.users.banned_until impide nuevos logins y el refresco de sesión.

alter table public.profiles
  add column last_detail_center_id uuid references public.detail_centers (id) on delete set null;

-- Centro activo: security definer porque el cliente no tiene UPDATE sobre esta
-- columna (sólo sobre full_name). La autorización la da has_center_role.
create function public.set_active_center(p_detail_center_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_detail_center_id is null
     or not private.has_center_role(p_detail_center_id) then
    raise exception 'Centro inexistente, deshabilitado o sin acceso' using errcode = '42501';
  end if;
  update public.profiles set last_detail_center_id = p_detail_center_id where id = auth.uid();
  return p_detail_center_id;
end;
$$;

-- Deshabilitar/rehabilitar una cuenta (soporte u onboarding con service_role).
create function public.set_user_disabled(p_user_id uuid, p_disabled boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.set_change_reason(p_reason);
  update public.profiles set active = not p_disabled where id = p_user_id;
  if not found then
    raise exception 'Usuario inexistente: %', p_user_id using errcode = '22023';
  end if;
  update auth.users
     set banned_until = case when p_disabled then 'infinity'::timestamptz end
   where id = p_user_id;
  perform private.log_event(
    null, null,
    case when p_disabled then 'user.disabled' else 'user.enabled' end,
    'public.profiles', p_user_id::text, null
  );
end;
$$;

revoke all on function public.set_active_center(uuid) from public, anon;
grant execute on function public.set_active_center(uuid) to authenticated;
revoke all on function public.set_user_disabled(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.set_user_disabled(uuid, boolean, text) to service_role;
