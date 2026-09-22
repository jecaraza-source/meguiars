-- Fundación multicentro: centros, perfiles, membresías con rol,
-- bitácora de auditoría y políticas RLS.
-- Reglas: toda entidad transaccional lleva detail_center_id; fechas en UTC
-- (timestamptz); la autorización vive en RLS, no en la UI.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.app_role as enum ('owner', 'admin', 'manager', 'advisor', 'technician', 'viewer');

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------

create function private.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function private.validate_timezone() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Zona horaria IANA inválida: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table public.detail_centers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9-]{2,20}$'),
  name text not null check (length(btrim(name)) between 2 and 120),
  timezone text not null default 'America/Mexico_City',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.center_memberships (
  detail_center_id uuid not null references public.detail_centers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (detail_center_id, user_id)
);
create index center_memberships_user_idx on public.center_memberships (user_id);

create table public.audit_log (
  id bigint generated always as identity primary key,
  detail_center_id uuid references public.detail_centers (id) on delete set null,
  table_name text not null,
  record_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id uuid,
  reason text,
  old_data jsonb,
  new_data jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_log_center_time_idx on public.audit_log (detail_center_id, occurred_at desc);
create index audit_log_record_idx on public.audit_log (table_name, record_id);

create trigger detail_centers_validate_tz before insert or update of timezone on public.detail_centers
  for each row execute function private.validate_timezone();
create trigger detail_centers_updated_at before update on public.detail_centers
  for each row execute function private.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger center_memberships_updated_at before update on public.center_memberships
  for each row execute function private.set_updated_at();

-- Crea el perfil al registrarse un usuario.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Auditoría
-- El motivo se toma de la variable de sesión app.change_reason, que las
-- funciones RPC de cambios sensibles fijan con set_config(..., true).
-- ---------------------------------------------------------------------------

create function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  old_json jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_json jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  row_json jsonb := coalesce(new_json, old_json);
  center_id uuid;
begin
  if tg_op = 'UPDATE' and old_json = new_json then
    return null;
  end if;

  center_id := case
    when tg_table_name = 'detail_centers' then (row_json ->> 'id')::uuid
    else (row_json ->> 'detail_center_id')::uuid
  end;

  insert into public.audit_log (detail_center_id, table_name, record_id, action, actor_id, reason, old_data, new_data)
  values (
    -- En un DELETE del propio centro la FK ya no existiría.
    case when tg_table_name = 'detail_centers' and tg_op = 'DELETE' then null else center_id end,
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

create trigger detail_centers_audit after insert or update or delete on public.detail_centers
  for each row execute function private.audit_row();
create trigger center_memberships_audit after insert or update or delete on public.center_memberships
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Autorización (security definer para evitar recursión de RLS)
-- ---------------------------------------------------------------------------

create function private.has_center_role(center_id uuid, roles public.app_role[] default null)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.center_memberships m
    where m.detail_center_id = center_id
      and m.user_id = auth.uid()
      and m.active
      and (roles is null or m.role = any (roles))
  );
$$;
revoke all on function private.has_center_role(uuid, public.app_role[]) from public;
grant execute on function private.has_center_role(uuid, public.app_role[]) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.detail_centers enable row level security;
alter table public.profiles enable row level security;
alter table public.center_memberships enable row level security;
alter table public.audit_log enable row level security;

-- Nada es accesible sin sesión.
revoke all on public.detail_centers, public.profiles, public.center_memberships, public.audit_log from anon;
revoke insert, update, delete, truncate on public.audit_log from authenticated;
-- Los centros se dan de alta con service_role (onboarding), no desde clientes.
revoke insert, delete, truncate on public.detail_centers from authenticated;

create policy detail_centers_select on public.detail_centers
  for select to authenticated using (private.has_center_role(id));
create policy detail_centers_update on public.detail_centers
  for update to authenticated
  using (private.has_center_role(id, array['owner', 'admin']::public.app_role[]))
  with check (private.has_center_role(id, array['owner', 'admin']::public.app_role[]));

create policy profiles_select on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or exists (
      select 1 from public.center_memberships m
      where m.user_id = profiles.id and private.has_center_role(m.detail_center_id)
    )
  );
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy memberships_select on public.center_memberships
  for select to authenticated using (
    user_id = auth.uid()
    or private.has_center_role(detail_center_id, array['owner', 'admin', 'manager']::public.app_role[])
  );
-- Owner/admin gestionan membresías; sólo un owner puede otorgar o modificar el rol owner.
create policy memberships_insert on public.center_memberships
  for insert to authenticated with check (
    private.has_center_role(detail_center_id, array['owner', 'admin']::public.app_role[])
    and (role <> 'owner' or private.has_center_role(detail_center_id, array['owner']::public.app_role[]))
  );
create policy memberships_update on public.center_memberships
  for update to authenticated
  using (
    private.has_center_role(detail_center_id, array['owner', 'admin']::public.app_role[])
    and (role <> 'owner' or private.has_center_role(detail_center_id, array['owner']::public.app_role[]))
  )
  with check (
    private.has_center_role(detail_center_id, array['owner', 'admin']::public.app_role[])
    and (role <> 'owner' or private.has_center_role(detail_center_id, array['owner']::public.app_role[]))
  );
create policy memberships_delete on public.center_memberships
  for delete to authenticated using (
    private.has_center_role(detail_center_id, array['owner', 'admin']::public.app_role[])
    and (role <> 'owner' or private.has_center_role(detail_center_id, array['owner']::public.app_role[]))
  );

create policy audit_log_select on public.audit_log
  for select to authenticated using (
    detail_center_id is not null
    and private.has_center_role(detail_center_id, array['owner', 'admin', 'manager']::public.app_role[])
  );
