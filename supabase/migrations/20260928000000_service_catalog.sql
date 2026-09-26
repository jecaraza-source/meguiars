-- O2 — Operación / Catálogo de servicios, precios y motores de ingreso.
--
-- * services: catálogo homologado de la organización (qué se vende, cuánto
--   cuesta, cuánto dura y a qué motor de ingreso pertenece). Sin borrado: se
--   desactiva.
-- * service_center_config: disponibilidad por centro y, opcionalmente, precio
--   y costo propios del centro (centro de costos independiente). Sin fila, el
--   servicio está disponible con los valores base.
-- * service_price_history: bitácora append-only de precio y costo (base y por
--   centro), escrita por triggers. service_price_at() resuelve el precio
--   vigente en cualquier fecha.
-- * La Orden de Servicio (módulo futuro) copiará el precio, costo, duración y
--   motor aplicados a su propia línea: cambiar el catálogo nunca altera OS
--   históricas.
--
-- Escrituras sólo por RPC con motivo (require_change_reason) y auditadas.
-- Compatible hacia atrás: sólo agrega objetos.

create type public.revenue_engine as enum ('recurrente', 'valor_medio', 'premium', 'producto_complemento', 'membresia');

-- ---------------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------------

create table public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  -- Clave homologada, única en la organización (p. ej. LAV-EXP).
  code text not null check (code ~ '^[A-Z0-9-]{2,20}$'),
  name text not null check (length(btrim(name)) between 2 and 120),
  description text check (description is null or length(description) <= 2000),
  revenue_engine public.revenue_engine not null,
  standard_duration_minutes integer not null check (standard_duration_minutes between 5 and 1440),
  -- Importes en MXN, con IVA incluido en el precio de venta.
  base_price numeric(12, 2) not null check (base_price >= 0),
  standard_direct_cost numeric(12, 2) not null check (standard_direct_cost >= 0),
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, code)
);

create table public.service_center_config (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  service_id uuid not null,
  available boolean not null default true,
  -- null = usa el valor base del servicio.
  price_override numeric(12, 2) check (price_override is null or price_override >= 0),
  direct_cost_override numeric(12, 2) check (direct_cost_override is null or direct_cost_override >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (detail_center_id, service_id),
  foreign key (organization_id, detail_center_id)
    references public.detail_centers (organization_id, id) on delete restrict,
  foreign key (organization_id, service_id) references public.services (organization_id, id) on delete restrict
);

-- Una fila por cambio. detail_center_id null = valores base del servicio; con
-- centro = valores propios del centro (price/cost null = vuelve a la base).
create table public.service_price_history (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  service_id uuid not null,
  detail_center_id uuid,
  price numeric(12, 2),
  direct_cost numeric(12, 2),
  -- clock_timestamp(): cambios sucesivos en una misma transacción quedan ordenados.
  valid_from timestamptz not null default clock_timestamp(),
  changed_by uuid default auth.uid(),
  reason text,
  foreign key (organization_id, service_id) references public.services (organization_id, id) on delete restrict,
  foreign key (organization_id, detail_center_id)
    references public.detail_centers (organization_id, id) on delete restrict,
  check (detail_center_id is not null or (price is not null and direct_cost is not null))
);

-- Catálogo filtrable por organización/activo/motor y por centro.
create index services_org_active_engine_idx on public.services (organization_id, active, revenue_engine);
create index service_center_config_center_idx on public.service_center_config (detail_center_id, available);
create index service_center_config_service_idx on public.service_center_config (service_id);
create index service_price_history_lookup_idx
  on public.service_price_history (service_id, detail_center_id, valid_from desc);

create trigger services_updated_at before update on public.services
  for each row execute function private.set_updated_at();
create trigger service_center_config_updated_at before update on public.service_center_config
  for each row execute function private.set_updated_at();

create trigger services_require_reason before insert or update or delete on public.services
  for each row execute function private.require_change_reason();
create trigger service_center_config_require_reason before insert or update or delete on public.service_center_config
  for each row execute function private.require_change_reason();

create trigger services_audit after insert or update or delete on public.services
  for each row execute function private.audit_row();
create trigger service_center_config_audit after insert or update or delete on public.service_center_config
  for each row execute function private.audit_row();

-- La clave homologada y la organización no cambian (las OS y reportes las usan).
create function private.keep_service_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id or new.code is distinct from old.code
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'La clave y la organización de un servicio no se pueden cambiar' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger services_keep_identity before update on public.services
  for each row execute function private.keep_service_identity();

create function private.keep_config_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.detail_center_id is distinct from old.detail_center_id
     or new.service_id is distinct from old.service_id then
    raise exception 'El centro y el servicio de una configuración no se pueden cambiar' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger service_center_config_keep_identity before update on public.service_center_config
  for each row execute function private.keep_config_identity();

-- Historial de precio y costo. Security definer: los clientes no escriben en
-- service_price_history; no revisa current_user.
create function private.record_service_price() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'services' then
    if tg_op = 'INSERT'
       or new.base_price is distinct from old.base_price
       or new.standard_direct_cost is distinct from old.standard_direct_cost then
      insert into public.service_price_history (organization_id, service_id, price, direct_cost, reason)
      values (new.organization_id, new.id, new.base_price, new.standard_direct_cost,
              nullif(current_setting('app.change_reason', true), ''));
    end if;
  elsif tg_op = 'INSERT'
     or new.price_override is distinct from old.price_override
     or new.direct_cost_override is distinct from old.direct_cost_override then
    if tg_op = 'INSERT' and new.price_override is null and new.direct_cost_override is null then
      return null;
    end if;
    insert into public.service_price_history
      (organization_id, service_id, detail_center_id, price, direct_cost, reason)
    values (new.organization_id, new.service_id, new.detail_center_id, new.price_override,
            new.direct_cost_override, nullif(current_setting('app.change_reason', true), ''));
  end if;
  return null;
end;
$$;
create trigger services_price_history after insert or update on public.services
  for each row execute function private.record_service_price();
create trigger service_center_config_price_history after insert or update on public.service_center_config
  for each row execute function private.record_service_price();

-- ---------------------------------------------------------------------------
-- 2. Autorización (espejo de catalog.read / catalog.manage en roles.ts)
-- ---------------------------------------------------------------------------

-- Leer el catálogo: cualquier miembro de la organización (todos venden o reportan).
-- Crear/editar servicios homologados: admin_socio corporativo.
-- Configurar un centro: admin_socio del centro (o corporativo).
create function private.can_manage_center_catalog(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(p_detail_center_id, array['admin_socio']::public.app_role[]);
$$;

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

alter table public.services enable row level security;
alter table public.service_center_config enable row level security;
alter table public.service_price_history enable row level security;

create policy services_select on public.services
  for select to authenticated using (private.is_org_member(organization_id));
create policy services_insert on public.services
  for insert to authenticated
  with check (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]));
create policy services_update on public.services
  for update to authenticated
  using (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]))
  with check (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]));

create policy service_center_config_select on public.service_center_config
  for select to authenticated using (private.has_center_role(detail_center_id));
create policy service_center_config_insert on public.service_center_config
  for insert to authenticated with check (private.can_manage_center_catalog(detail_center_id));
create policy service_center_config_update on public.service_center_config
  for update to authenticated
  using (private.can_manage_center_catalog(detail_center_id))
  with check (private.can_manage_center_catalog(detail_center_id));

-- Historial: valores base para la organización; los de un centro, sólo para ese centro.
create policy service_price_history_select on public.service_price_history
  for select to authenticated using (
    case when detail_center_id is null then private.is_org_member(organization_id)
         else private.has_center_role(detail_center_id) end
  );

revoke all on public.services, public.service_center_config, public.service_price_history from anon;
revoke delete, truncate on public.services, public.service_center_config from authenticated;
revoke insert, update, delete, truncate on public.service_price_history from authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC
-- ---------------------------------------------------------------------------

create function public.create_service(
  p_organization_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_revenue_engine public.revenue_engine,
  p_standard_duration_minutes integer,
  p_base_price numeric,
  p_standard_direct_cost numeric,
  p_reason text default 'Alta de servicio'
) returns public.services
language plpgsql security invoker set search_path = '' as $$
declare
  result public.services;
begin
  perform private.set_change_reason(p_reason);
  insert into public.services (
    organization_id, code, name, description, revenue_engine, standard_duration_minutes,
    base_price, standard_direct_cost
  ) values (
    p_organization_id, upper(btrim(p_code)), regexp_replace(btrim(p_name), '\s+', ' ', 'g'),
    nullif(btrim(p_description), ''), p_revenue_engine, p_standard_duration_minutes,
    p_base_price, p_standard_direct_cost
  )
  returning * into result;
  return result;
end;
$$;

-- Edición y desactivación (p_active = false) con motivo. La clave no cambia.
create function public.update_service(
  p_id uuid,
  p_name text,
  p_description text,
  p_revenue_engine public.revenue_engine,
  p_standard_duration_minutes integer,
  p_base_price numeric,
  p_standard_direct_cost numeric,
  p_active boolean,
  p_reason text
) returns public.services
language plpgsql security invoker set search_path = '' as $$
declare
  result public.services;
begin
  perform private.set_change_reason(p_reason);
  update public.services
     set name = regexp_replace(btrim(p_name), '\s+', ' ', 'g'),
         description = nullif(btrim(p_description), ''),
         revenue_engine = p_revenue_engine,
         standard_duration_minutes = p_standard_duration_minutes,
         base_price = p_base_price,
         standard_direct_cost = p_standard_direct_cost,
         active = coalesce(p_active, active)
   where id = p_id
  returning * into result;
  if not found then
    raise exception 'Servicio inexistente o sin permiso para editarlo' using errcode = '42501';
  end if;
  return result;
end;
$$;

-- Disponibilidad y valores propios de un centro.
create function public.set_service_center_config(
  p_detail_center_id uuid,
  p_service_id uuid,
  p_available boolean,
  p_price_override numeric,
  p_direct_cost_override numeric,
  p_reason text
) returns public.service_center_config
language plpgsql security invoker set search_path = '' as $$
declare
  org uuid;
  result public.service_center_config;
begin
  perform private.set_change_reason(p_reason);
  if not private.can_manage_center_catalog(p_detail_center_id) then
    raise exception 'Sin permiso para configurar el catálogo de este centro' using errcode = '42501';
  end if;
  select s.organization_id into org from public.services s where s.id = p_service_id;
  if org is null then
    raise exception 'Servicio inexistente' using errcode = '22023';
  end if;
  insert into public.service_center_config
    (organization_id, detail_center_id, service_id, available, price_override, direct_cost_override)
  values (org, p_detail_center_id, p_service_id, coalesce(p_available, true), p_price_override, p_direct_cost_override)
  on conflict (detail_center_id, service_id) do update
    set available = excluded.available,
        price_override = excluded.price_override,
        direct_cost_override = excluded.direct_cost_override
  returning * into result;
  return result;
end;
$$;

-- Catálogo efectivo de un centro: valores base o propios del centro,
-- disponibilidad y filtro opcional por motor. RLS limita a la organización.
create function public.center_catalog(
  p_detail_center_id uuid,
  p_revenue_engine public.revenue_engine default null,
  p_include_inactive boolean default false
)
returns table (
  id uuid,
  code text,
  name text,
  description text,
  revenue_engine public.revenue_engine,
  standard_duration_minutes integer,
  base_price numeric,
  standard_direct_cost numeric,
  price numeric,
  direct_cost numeric,
  price_source text,
  available boolean,
  active boolean
)
language sql stable security invoker set search_path = '' as $$
  select s.id, s.code, s.name, s.description, s.revenue_engine, s.standard_duration_minutes,
         s.base_price, s.standard_direct_cost,
         coalesce(cfg.price_override, s.base_price),
         coalesce(cfg.direct_cost_override, s.standard_direct_cost),
         case when cfg.price_override is not null or cfg.direct_cost_override is not null then 'center' else 'base' end,
         coalesce(cfg.available, true),
         s.active
  from public.detail_centers dc
  join public.services s on s.organization_id = dc.organization_id
  left join public.service_center_config cfg on cfg.detail_center_id = dc.id and cfg.service_id = s.id
  where dc.id = p_detail_center_id
    and private.has_center_role(dc.id)
    and (p_revenue_engine is null or s.revenue_engine = p_revenue_engine)
    and (coalesce(p_include_inactive, false) or (s.active and coalesce(cfg.available, true)))
  order by s.revenue_engine, s.name;
$$;

-- Precio y costo vigentes en un instante (valores del centro si los tenía en
-- ese momento; si no, los base). Base para congelar precios en la OS y para
-- auditar cobros pasados.
create function public.service_price_at(
  p_service_id uuid,
  p_detail_center_id uuid,
  -- clock_timestamp(): incluye cambios hechos antes en la misma transacción.
  p_at timestamptz default clock_timestamp()
)
returns table (price numeric, direct_cost numeric, source text)
language sql stable security invoker set search_path = '' as $$
  with base as (
    select h.price, h.direct_cost from public.service_price_history h
    where h.service_id = p_service_id and h.detail_center_id is null and h.valid_from <= p_at
    order by h.valid_from desc, h.id desc limit 1
  ),
  local as (
    select h.price, h.direct_cost from public.service_price_history h
    where h.service_id = p_service_id and h.detail_center_id = p_detail_center_id and h.valid_from <= p_at
    order by h.valid_from desc, h.id desc limit 1
  )
  select coalesce(l.price, b.price), coalesce(l.direct_cost, b.direct_cost),
         case when l.price is not null or l.direct_cost is not null then 'center' else 'base' end
  from base b left join local l on true;
$$;

do $$
declare
  fn text;
begin
  execute 'revoke all on function private.can_manage_center_catalog(uuid) from public';
  execute 'grant execute on function private.can_manage_center_catalog(uuid) to authenticated';
  foreach fn in array array[
    'public.create_service(uuid, text, text, text, public.revenue_engine, integer, numeric, numeric, text)',
    'public.update_service(uuid, text, text, public.revenue_engine, integer, numeric, numeric, boolean, text)',
    'public.set_service_center_config(uuid, uuid, boolean, numeric, numeric, text)',
    'public.center_catalog(uuid, public.revenue_engine, boolean)',
    'public.service_price_at(uuid, uuid, timestamptz)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
