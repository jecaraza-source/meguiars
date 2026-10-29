-- Acceso con celular (usuarios del equipo, no clientes).
--
-- El admin puede dar de alta a una persona sólo con su celular: la cuenta se
-- crea en Supabase Auth con el teléfono ya confirmado (auth.admin.createUser,
-- phone_confirm) y entra con celular + contraseña, sin SMS. Requiere activar el
-- proveedor Phone en Supabase (Authentication → Providers → Phone), con el
-- registro público apagado.
--
-- org_users devuelve en «email» el correo o, si no tiene, el celular (+52…), para
-- que el listado de usuarios muestre con qué entra cada persona. Misma firma.

create or replace function public.org_users(p_organization_id uuid)
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
  select u.id, coalesce(nullif(u.email::text, ''), '+' || nullif(u.phone::text, '')), p.full_name, coalesce(p.active, false), u.last_sign_in_at, u.created_at,
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
   order by coalesce(p.full_name, nullif(u.email::text, ''), u.phone::text);
end;
$$;
