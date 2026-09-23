-- F0.2 — Supabase multicentro y seguridad.
--
-- Transición desde 20260922000000_foundation (compatible con datos existentes):
--   * organizations: nueva entidad raíz; los centros existentes pasan a la
--     organización 'default'.
--   * center_memberships  → user_detail_centers (misma PK y columnas).
--   * role_assignments: roles a nivel organización (vista corporativa).
--   * app_role: owner/admin → admin_socio, manager → encargado,
--     advisor/technician → operador_recepcion, viewer → contador.
--   * Soft-disable (active) en organizations, detail_centers, profiles,
--     user_detail_centers y role_assignments.
--   * Deny-by-default: anon y PUBLIC ya no reciben privilegios por defecto.
--
-- Modelo de autorización: los roles efectivos de un usuario en un centro son
-- la unión de su rol en ese centro (user_detail_centers) y sus roles en la
-- organización del centro (role_assignments). Todo exige organización, centro,
-- perfil y asignación activos.

-- ---------------------------------------------------------------------------
-- 1. Retirar objetos que dependen del enum anterior o del nombre de la tabla
-- ---------------------------------------------------------------------------

drop policy detail_centers_select on public.detail_centers;
drop policy detail_centers_update on public.detail_centers;
drop policy profiles_select on public.profiles;
drop policy memberships_select on public.center_memberships;
drop policy memberships_insert on public.center_memberships;
drop policy memberships_update on public.center_memberships;
drop policy audit_log_select on public.audit_log;

drop trigger center_memberships_keep_owner on public.center_memberships;
drop function private.prevent_ownerless_center();
drop function private.center_has_active_owner(uuid);
drop function public.set_center_membership(uuid, uuid, public.app_role, boolean, text);
drop function private.shares_center_with(uuid);
drop function private.has_center_role(uuid, public.app_role[]);

-- ---------------------------------------------------------------------------
-- 2. Roles
-- ---------------------------------------------------------------------------

create type public.app_role_v2 as enum ('admin_socio', 'encargado', 'operador_recepcion', 'contador', 'comercial_b2b');

alter table public.center_memberships
  alter column role type public.app_role_v2 using (
    case role::text
      when 'owner' then 'admin_socio'
      when 'admin' then 'admin_socio'
      when 'manager' then 'encargado'
      when 'advisor' then 'operador_recepcion'
      when 'technician' then 'operador_recepcion'
      when 'viewer' then 'contador'
    end
  )::public.app_role_v2;

drop type public.app_role;
alter type public.app_role_v2 rename to app_role;

-- ---------------------------------------------------------------------------
-- 3. Organizaciones y centros
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (length(btrim(name)) between 2 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();

alter table public.detail_centers
  add column organization_id uuid references public.organizations (id) on delete restrict,
  add column active boolean not null default true;

insert into public.organizations (slug, name)
select 'default', 'Organización'
where exists (select 1 from public.detail_centers);

update public.detail_centers
   set organization_id = (select id from public.organizations where slug = 'default')
 where organization_id is null;

alter table public.detail_centers alter column organization_id set not null;

-- El código es único dentro de la organización, no global.
alter table public.detail_centers drop constraint detail_centers_code_key;
alter table public.detail_centers add constraint detail_centers_org_code_key unique (organization_id, code);
create index detail_centers_organization_idx on public.detail_centers (organization_id);

-- ---------------------------------------------------------------------------
-- 4. Perfiles, asignación a centros y roles corporativos
-- ---------------------------------------------------------------------------

-- Deshabilitar un usuario en toda la plataforma es una operación de service_role.
alter table public.profiles add column active boolean not null default true;

alter table public.center_memberships rename to user_detail_centers;
alter table public.user_detail_centers rename constraint center_memberships_pkey to user_detail_centers_pkey;
alter table public.user_detail_centers
  rename constraint center_memberships_detail_center_id_fkey to user_detail_centers_detail_center_id_fkey;
alter table public.user_detail_centers
  rename constraint center_memberships_user_id_fkey to user_detail_centers_user_id_fkey;
alter index public.center_memberships_user_idx rename to user_detail_centers_user_idx;
create index user_detail_centers_center_idx on public.user_detail_centers (detail_center_id);
alter trigger center_memberships_updated_at on public.user_detail_centers rename to user_detail_centers_updated_at;
alter trigger center_memberships_audit on public.user_detail_centers rename to user_detail_centers_audit;
alter trigger center_memberships_require_reason on public.user_detail_centers
  rename to user_detail_centers_require_reason;

create table public.role_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, role)
);
create index role_assignments_user_idx on public.role_assignments (user_id);

create trigger role_assignments_updated_at before update on public.role_assignments
  for each row execute function private.set_updated_at();
create trigger role_assignments_require_reason before insert or update or delete on public.role_assignments
  for each row execute function private.require_change_reason();

-- ---------------------------------------------------------------------------
-- 5. Auditoría genérica
-- ---------------------------------------------------------------------------

alter table public.audit_log
  add column organization_id uuid,
  add column event text;
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log
  add constraint audit_log_action_check check (action in ('INSERT', 'UPDATE', 'DELETE', 'EVENT')),
  add constraint audit_log_event_check check ((action = 'EVENT') = (event is not null));
create index audit_log_org_time_idx on public.audit_log (organization_id, occurred_at desc);

update public.audit_log a
   set organization_id = c.organization_id
  from public.detail_centers c
 where a.detail_center_id = c.id and a.organization_id is null;

create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  old_json jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_json jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  row_json jsonb := coalesce(new_json, old_json);
  center_id uuid;
  org_id uuid;
begin
  -- updated_at siempre cambia (trigger set_updated_at); no cuenta como cambio.
  if tg_op = 'UPDATE' and old_json - 'updated_at' = new_json - 'updated_at' then
    return null;
  end if;

  center_id := case
    when tg_table_name = 'detail_centers' then (row_json ->> 'id')::uuid
    else (row_json ->> 'detail_center_id')::uuid
  end;
  org_id := case
    when tg_table_name = 'organizations' then (row_json ->> 'id')::uuid
    else (row_json ->> 'organization_id')::uuid
  end;
  if org_id is null and center_id is not null then
    select c.organization_id into org_id from public.detail_centers c where c.id = center_id;
  end if;

  insert into public.audit_log
    (organization_id, detail_center_id, table_name, record_id, action, actor_id, reason, old_data, new_data)
  values (
    org_id,
    center_id,
    tg_table_schema || '.' || tg_table_name,
    coalesce(row_json ->> 'id', row_json ->> 'user_id'),
    tg_op,
    auth.uid(),
    nullif(current_setting('app.change_reason', true), ''),
    old_json,
    new_json
  );
  return null;
end;
$$;

create trigger organizations_audit after insert or update or delete on public.organizations
  for each row execute function private.audit_row();
create trigger role_assignments_audit after insert or update or delete on public.role_assignments
  for each row execute function private.audit_row();

-- Eventos sensibles que no son un cambio de fila (p. ej. exportaciones,
-- aprobaciones). Lo llaman las RPC de módulos futuros; el actor y el motivo
-- se toman de la sesión.
create function private.log_event(
  p_organization_id uuid,
  p_detail_center_id uuid,
  p_event text,
  p_table_name text default null,
  p_record_id text default null,
  p_data jsonb default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  new_id bigint;
begin
  if p_event is null or p_event !~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$' then
    raise exception 'Evento de auditoría inválido: %', p_event using errcode = '22023';
  end if;
  insert into public.audit_log
    (organization_id, detail_center_id, table_name, record_id, action, event, actor_id, reason, new_data)
  values (
    p_organization_id, p_detail_center_id, coalesce(p_table_name, 'event'), p_record_id, 'EVENT', p_event,
    auth.uid(), nullif(current_setting('app.change_reason', true), ''), p_data
  )
  returning id into new_id;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Helpers de autorización (security definer: leen membresías sin RLS)
-- ---------------------------------------------------------------------------

create function private.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active);
$$;

-- Roles corporativos del usuario en la organización (vacío si algo está inactivo).
create function private.org_roles(p_organization_id uuid) returns public.app_role[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct ra.role), '{}')
  from public.role_assignments ra
  join public.organizations o on o.id = ra.organization_id and o.active
  where ra.organization_id = p_organization_id
    and ra.user_id = auth.uid()
    and ra.active
    and private.is_active_user();
$$;

-- Roles efectivos en el centro: rol en el centro ∪ roles corporativos.
create function private.center_roles(p_detail_center_id uuid) returns public.app_role[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct r.role), '{}')
  from public.detail_centers c
  join public.organizations o on o.id = c.organization_id and o.active
  cross join lateral (
    select m.role from public.user_detail_centers m
     where m.detail_center_id = c.id and m.user_id = auth.uid() and m.active
    union all
    select ra.role from public.role_assignments ra
     where ra.organization_id = c.organization_id and ra.user_id = auth.uid() and ra.active
  ) r
  where c.id = p_detail_center_id
    and c.active
    and private.is_active_user();
$$;

create function private.has_center_role(center_id uuid, roles public.app_role[] default null)
returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when roles is null then cardinality(private.center_roles(center_id)) > 0
    else private.center_roles(center_id) && roles
  end;
$$;

create function private.has_org_role(p_organization_id uuid, roles public.app_role[] default null)
returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when roles is null then cardinality(private.org_roles(p_organization_id)) > 0
    else private.org_roles(p_organization_id) && roles
  end;
$$;

-- Pertenece a la organización por rol corporativo o por algún centro activo.
create function private.is_org_member(p_organization_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_org_role(p_organization_id)
    or exists (
      select 1 from public.detail_centers c
      where c.organization_id = p_organization_id and private.has_center_role(c.id)
    );
$$;

-- Un admin_socio corporativo gestiona cualquier rol en los centros de su
-- organización; un admin_socio de centro, cualquier rol salvo admin_socio.
create function private.can_manage_center_member(p_detail_center_id uuid, p_role public.app_role)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.detail_centers c
    where c.id = p_detail_center_id
      and (
        private.has_org_role(c.organization_id, array['admin_socio']::public.app_role[])
        or (p_role <> 'admin_socio' and private.has_center_role(c.id, array['admin_socio']::public.app_role[]))
      )
  );
$$;

-- ¿Puede el usuario de la sesión ver el perfil p_user_id? Sí, si comparten
-- algún centro al que el usuario de la sesión tiene acceso, o una organización
-- donde éste tiene rol corporativo.
create function private.can_see_profile(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
      select 1 from public.user_detail_centers t
      where t.user_id = p_user_id and private.has_center_role(t.detail_center_id)
    )
    or exists (
      select 1 from public.role_assignments t
      where t.user_id = p_user_id and private.has_org_role(t.organization_id)
    )
    or exists (
      select 1 from public.user_detail_centers t
      join public.detail_centers c on c.id = t.detail_center_id
      where t.user_id = p_user_id and private.has_org_role(c.organization_id)
    );
$$;

-- Toda organización conserva al menos un admin_socio corporativo activo.
-- La verificación es security definer (bloquea la organización para serializar
-- cambios concurrentes y ve todas las asignaciones); el trigger NO lo es, para
-- que current_user siga siendo el rol del cliente.
create function private.org_has_active_admin(p_organization_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.organizations where id = p_organization_id for no key update;
  return exists (
    select 1 from public.role_assignments
    where organization_id = p_organization_id and role = 'admin_socio' and active
  );
end;
$$;

create function private.prevent_orphan_organization() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated'
     and old.role = 'admin_socio' and old.active
     and (new.role <> 'admin_socio' or not new.active)
     and not private.org_has_active_admin(old.organization_id) then
    raise exception 'La organización debe conservar al menos un admin_socio activo'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create trigger role_assignments_keep_admin after update of role, active on public.role_assignments
  for each row execute function private.prevent_orphan_organization();

-- ---------------------------------------------------------------------------
-- 7. Privilegios: deny-by-default
-- ---------------------------------------------------------------------------

-- Objetos futuros de public: nada para anon ni PUBLIC; cada tabla/RPC nueva
-- debe habilitar RLS y otorgar explícitamente lo que necesite.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
-- El EXECUTE para PUBLIC es un privilegio por defecto global: sólo se retira sin "in schema".
alter default privileges revoke execute on functions from public;

revoke all on public.organizations, public.role_assignments from anon;
revoke insert, update, delete, truncate on public.organizations from authenticated;
revoke delete, truncate on public.role_assignments from authenticated;

-- El usuario sólo puede editar su nombre; active lo controla service_role.
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.is_active_user()',
    'private.org_roles(uuid)',
    'private.center_roles(uuid)',
    'private.has_center_role(uuid, public.app_role[])',
    'private.has_org_role(uuid, public.app_role[])',
    'private.is_org_member(uuid)',
    'private.can_manage_center_member(uuid, public.app_role)',
    'private.can_see_profile(uuid)',
    'private.log_event(uuid, uuid, text, text, text, jsonb)',
    'private.org_has_active_admin(uuid)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Políticas RLS
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.role_assignments enable row level security;

create policy organizations_select on public.organizations
  for select to authenticated using (private.is_org_member(id));

-- admin_socio corporativo ve también los centros deshabilitados de su organización.
create policy detail_centers_select on public.detail_centers
  for select to authenticated using (
    private.has_center_role(id)
    or private.has_org_role(organization_id, array['admin_socio']::public.app_role[])
  );
create policy detail_centers_update on public.detail_centers
  for update to authenticated
  using (private.has_center_role(id, array['admin_socio']::public.app_role[]))
  with check (private.has_center_role(id, array['admin_socio']::public.app_role[]));

create policy profiles_select on public.profiles
  for select to authenticated using (id = auth.uid() or private.can_see_profile(id));

create policy user_detail_centers_select on public.user_detail_centers
  for select to authenticated using (
    user_id = auth.uid()
    or private.has_center_role(detail_center_id, array['admin_socio', 'encargado', 'contador']::public.app_role[])
  );
create policy user_detail_centers_insert on public.user_detail_centers
  for insert to authenticated with check (private.can_manage_center_member(detail_center_id, role));
create policy user_detail_centers_update on public.user_detail_centers
  for update to authenticated
  using (private.can_manage_center_member(detail_center_id, role))
  with check (private.can_manage_center_member(detail_center_id, role));

create policy role_assignments_select on public.role_assignments
  for select to authenticated using (
    user_id = auth.uid()
    or private.has_org_role(organization_id, array['admin_socio', 'contador']::public.app_role[])
  );
create policy role_assignments_insert on public.role_assignments
  for insert to authenticated
  with check (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]));
create policy role_assignments_update on public.role_assignments
  for update to authenticated
  using (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]))
  with check (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]));

-- Bitácora: admin_socio y contador (corporativos: toda la organización;
-- de centro: su centro).
create policy audit_log_select on public.audit_log
  for select to authenticated using (
    (organization_id is not null
      and private.has_org_role(organization_id, array['admin_socio', 'contador']::public.app_role[]))
    or (detail_center_id is not null
      and private.has_center_role(detail_center_id, array['admin_socio', 'contador']::public.app_role[]))
  );

-- ---------------------------------------------------------------------------
-- 9. RPC (security invoker: la autorización la aplican las políticas)
-- ---------------------------------------------------------------------------

create function public.set_center_membership(
  p_detail_center_id uuid,
  p_user_id uuid,
  p_role public.app_role,
  p_active boolean,
  p_reason text
) returns public.user_detail_centers
language plpgsql security invoker set search_path = '' as $$
declare
  result public.user_detail_centers;
begin
  perform private.set_change_reason(p_reason);
  insert into public.user_detail_centers (detail_center_id, user_id, role, active)
  values (p_detail_center_id, p_user_id, p_role, p_active)
  on conflict (detail_center_id, user_id)
    do update set role = excluded.role, active = excluded.active
  returning * into result;
  return result;
end;
$$;

create function public.set_role_assignment(
  p_organization_id uuid,
  p_user_id uuid,
  p_role public.app_role,
  p_active boolean,
  p_reason text
) returns public.role_assignments
language plpgsql security invoker set search_path = '' as $$
declare
  result public.role_assignments;
begin
  perform private.set_change_reason(p_reason);
  insert into public.role_assignments (organization_id, user_id, role, active)
  values (p_organization_id, p_user_id, p_role, p_active)
  on conflict (organization_id, user_id, role)
    do update set active = excluded.active
  returning * into result;
  return result;
end;
$$;

-- Centros visibles con los roles efectivos del usuario. corporate_roles son
-- los roles a nivel organización (vista consolidada).
create function public.my_detail_centers()
returns table (
  id uuid,
  organization_id uuid,
  organization_name text,
  code text,
  name text,
  timezone text,
  active boolean,
  roles public.app_role[],
  corporate_roles public.app_role[]
)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.organization_id, o.name, c.code, c.name, c.timezone, c.active,
         private.center_roles(c.id), private.org_roles(c.organization_id)
  from public.detail_centers c
  join public.organizations o on o.id = c.organization_id
  order by o.name, c.name;
$$;

revoke all on function public.set_center_membership(uuid, uuid, public.app_role, boolean, text) from public, anon;
revoke all on function public.set_role_assignment(uuid, uuid, public.app_role, boolean, text) from public, anon;
revoke all on function public.my_detail_centers() from public, anon;
grant execute on function public.set_center_membership(uuid, uuid, public.app_role, boolean, text) to authenticated;
grant execute on function public.set_role_assignment(uuid, uuid, public.app_role, boolean, text) to authenticated;
grant execute on function public.my_detail_centers() to authenticated;
