-- A1 — Administración de usuarios (admin corporativo).
--
-- La cuenta (correo y contraseña) sólo la crea o cambia el servidor web con la
-- llave de servicio (Auth Admin API). Aquí queda lo que se puede hacer con la
-- sesión del admin, con permisos, motivo y auditoría:
-- * org_users: usuarios de la organización con correo, estado, último acceso
--   y roles (corporativos y por centro);
-- * can_admin_user: el servidor lo consulta, con la sesión del admin, antes de
--   usar la llave de servicio sobre un usuario (contraseña);
-- * admin_set_user_disabled: desactivar/reactivar (retira el acceso por RLS y
--   bloquea el login), sólo usuarios que pertenecen únicamente a su organización.
-- Los roles se siguen asignando con set_role_assignment / set_center_membership.

-- Usuarios con algún rol (activo o no) en la organización.
create function private.org_user_ids(p_organization_id uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select ra.user_id from public.role_assignments ra where ra.organization_id = p_organization_id
  union
  select m.user_id from public.user_detail_centers m
    join public.detail_centers c on c.id = m.detail_center_id
   where c.organization_id = p_organization_id;
$$;

-- ¿El usuario tiene roles en otra organización? (no se administra desde aquí)
create function private.user_in_other_org(p_organization_id uuid, p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.role_assignments ra
                  where ra.user_id = p_user_id and ra.organization_id <> p_organization_id)
      or exists (select 1 from public.user_detail_centers m
                   join public.detail_centers c on c.id = m.detail_center_id
                  where m.user_id = p_user_id and c.organization_id <> p_organization_id);
$$;

-- Admin corporativo de la organización (quien da de alta usuarios).
create function public.can_admin_users(p_organization_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and private.is_active_user()
     and private.has_org_role(p_organization_id, array['admin_socio']::public.app_role[]);
$$;

-- ¿Puede el admin de la sesión administrar la cuenta de p_user_id? (sin usuario
-- = alta nueva). El usuario debe ser sólo de esta organización.
create function public.can_admin_user(p_organization_id uuid, p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_admin_users(p_organization_id)
     and (p_user_id is null
          or (p_user_id in (select private.org_user_ids(p_organization_id))
              and not private.user_in_other_org(p_organization_id, p_user_id)));
$$;

create function public.org_users(p_organization_id uuid)
returns table (
  user_id uuid,
  email text,
  full_name text,
  active boolean,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  corporate_roles public.app_role[],
  center_roles jsonb,
  other_org boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_admin_users(p_organization_id) then
    raise exception 'Sólo el admin corporativo administra usuarios' using errcode = '42501';
  end if;
  return query
  select u.id, u.email::text, p.full_name, coalesce(p.active, false), u.last_sign_in_at, u.created_at,
         coalesce((select array_agg(ra.role order by ra.role) from public.role_assignments ra
                    where ra.user_id = u.id and ra.organization_id = p_organization_id and ra.active),
                  '{}'::public.app_role[]),
         coalesce((select jsonb_agg(jsonb_build_object('detail_center_id', m.detail_center_id, 'center_name', c.name,
                                                       'role', m.role, 'active', m.active) order by c.code)
                     from public.user_detail_centers m join public.detail_centers c on c.id = m.detail_center_id
                    where m.user_id = u.id and c.organization_id = p_organization_id), '[]'::jsonb),
         private.user_in_other_org(p_organization_id, u.id)
    from auth.users u
    left join public.profiles p on p.id = u.id
   where u.id in (select private.org_user_ids(p_organization_id))
   order by coalesce(p.full_name, u.email::text);
end;
$$;

create function public.admin_set_user_disabled(p_organization_id uuid, p_user_id uuid, p_disabled boolean, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_admin_user(p_organization_id, p_user_id) then
    raise exception 'Sin permiso sobre este usuario' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'No puedes desactivar tu propia cuenta' using errcode = '22023';
  end if;
  perform public.set_user_disabled(p_user_id, p_disabled, p_reason);
end;
$$;

revoke all on function private.org_user_ids(uuid) from public, anon;
revoke all on function private.user_in_other_org(uuid, uuid) from public, anon;
grant execute on function private.org_user_ids(uuid) to authenticated;
grant execute on function private.user_in_other_org(uuid, uuid) to authenticated;
revoke all on function public.can_admin_users(uuid) from public, anon;
revoke all on function public.can_admin_user(uuid, uuid) from public, anon;
revoke all on function public.org_users(uuid) from public, anon;
revoke all on function public.admin_set_user_disabled(uuid, uuid, boolean, text) from public, anon;
grant execute on function public.can_admin_users(uuid) to authenticated;
grant execute on function public.can_admin_user(uuid, uuid) to authenticated;
grant execute on function public.org_users(uuid) to authenticated;
grant execute on function public.admin_set_user_disabled(uuid, uuid, boolean, text) to authenticated;
