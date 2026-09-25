-- O1 — Operación / Clientes y vehículos (expediente operativo cliente–vehículo).
--
-- * clients: un expediente por organización (el mismo cliente puede atenderse en
--   varios centros sin duplicarse), con centro habitual, última visita y
--   consentimiento comercial (preparado para la fase Comercial).
-- * client_centers: centros donde el cliente se ha atendido. Define la
--   visibilidad: un usuario ve al cliente si puede leer clientes en alguno de
--   esos centros (o en su centro habitual). Guarda la última visita por centro.
-- * vehicles: uno o varios por cliente; placa única por organización entre
--   vehículos activos.
-- * Duplicados: el alta avisa (teléfono, email, placa o identificador en toda
--   la organización) y sólo continúa con confirmación y motivo.
-- * Idempotencia: cada alta lleva un request_id; reintentar (o enviar el mismo
--   formulario dos veces) devuelve el registro ya creado.
-- * Futuro: service_orders y memberships referenciarán clients(id) y
--   vehicles(id); el módulo de OS registra visitas con
--   private.register_client_visit y agrega sus entradas a client_history.
--
-- Todas las escrituras van por RPC con motivo (require_change_reason) y quedan
-- en audit_log. Compatible hacia atrás: sólo agrega objetos.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Normalización (misma regla que packages/domain/src/clients/normalize.ts)
-- ---------------------------------------------------------------------------

-- Minúsculas, sin acentos y con espacios simples (búsqueda por nombre).
create function private.normalize_text(p_value text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select lower(translate(
    btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g')),
    'ÁÉÍÓÚÜÑáéíóúüñ',
    'AEIOUUNaeiouun'
  ));
$$;

-- Teléfono a E.164. Sin "+", 10 dígitos son un número de México (+52);
-- 12 dígitos que empiezan con 52 y 13 con 521 (prefijo móvil anterior) también.
-- Devuelve null si no es válido.
create function private.normalize_phone(p_value text) returns text
language plpgsql immutable parallel safe set search_path = '' as $$
declare
  digits text := regexp_replace(coalesce(p_value, ''), '\D', '', 'g');
  result text;
begin
  if btrim(coalesce(p_value, '')) like '+%' then
    result := '+' || digits;
  elsif length(digits) = 10 then
    result := '+52' || digits;
  elsif length(digits) = 12 and digits like '52%' then
    result := '+' || digits;
  elsif length(digits) = 13 and digits like '521%' then
    result := '+52' || substr(digits, 4);
  end if;
  if result is null or result !~ '^\+[1-9][0-9]{7,14}$' then
    return null;
  end if;
  return result;
end;
$$;

-- Placa / identificador: mayúsculas, sólo letras y dígitos.
create function private.normalize_plate(p_value text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select nullif(upper(regexp_replace(coalesce(p_value, ''), '[^A-Za-z0-9]', '', 'g')), '');
$$;

-- Email en minúsculas; null si está vacío o no tiene forma de email.
create function private.normalize_email(p_value text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select e from (select lower(btrim(coalesce(p_value, ''))) as e) t
  where length(e) <= 254 and e ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';
$$;

-- Escapa comodines de LIKE en texto del usuario.
create function private.like_escape(p_value text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select replace(replace(replace(p_value, '\', '\\'), '%', '\%'), '_', '\_');
$$;

-- ---------------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------------

-- Permite FKs compuestas (organización, centro): un cliente sólo puede
-- apuntar a centros de su propia organización.
alter table public.detail_centers add constraint detail_centers_org_id_key unique (organization_id, id);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  -- Centro habitual (se muestra y define visibilidad junto con client_centers).
  home_detail_center_id uuid not null,
  kind text not null default 'person' check (kind in ('person', 'company')),
  full_name text not null check (length(btrim(full_name)) between 2 and 120),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (
    email is null
    or (email = lower(email) and length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  ),
  notes text check (notes is null or length(notes) <= 2000),
  -- Consentimiento comercial (se usa en la fase Comercial). _at/_source registran el último cambio.
  marketing_opt_in boolean not null default false,
  marketing_channels text[] not null default '{}'
    check (marketing_channels <@ array['whatsapp', 'sms', 'email']::text[]),
  marketing_opt_in_at timestamptz,
  marketing_opt_in_source text check (marketing_opt_in_source in ('web', 'mobile')),
  last_visit_at timestamptz,
  last_visit_detail_center_id uuid references public.detail_centers (id) on delete set null,
  active boolean not null default true,
  request_id uuid not null,
  created_in_detail_center_id uuid not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  search_name text generated always as (private.normalize_text(full_name)) stored,
  phone_digits text generated always as (regexp_replace(phone, '\D', '', 'g')) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, request_id),
  foreign key (organization_id, home_detail_center_id)
    references public.detail_centers (organization_id, id) on delete restrict,
  foreign key (organization_id, created_in_detail_center_id)
    references public.detail_centers (organization_id, id) on delete restrict,
  check (marketing_opt_in = (cardinality(marketing_channels) > 0)),
  check (not marketing_opt_in or (marketing_opt_in_at is not null and marketing_opt_in_source is not null))
);

create table public.client_centers (
  client_id uuid not null,
  detail_center_id uuid not null,
  organization_id uuid not null,
  first_seen_at timestamptz not null default now(),
  last_visit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_id, detail_center_id),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete cascade,
  foreign key (organization_id, detail_center_id)
    references public.detail_centers (organization_id, id) on delete restrict
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  make text not null check (length(btrim(make)) between 1 and 60),
  model text not null check (length(btrim(model)) between 1 and 60),
  year smallint not null check (year between 1950 and 2100),
  -- Normalizada: mayúsculas y sólo letras/dígitos.
  plate text not null check (plate ~ '^[A-Z0-9]{3,10}$'),
  -- Identificador opcional: VIN, número económico de flotilla, etc.
  identifier text check (identifier is null or identifier ~ '^[A-Z0-9]{3,30}$'),
  notes text check (notes is null or length(notes) <= 1000),
  active boolean not null default true,
  request_id uuid,
  created_in_detail_center_id uuid not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, request_id),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete cascade,
  foreign key (organization_id, created_in_detail_center_id)
    references public.detail_centers (organization_id, id) on delete restrict
);

-- Búsqueda rápida: trigramas para "contiene" (nombre, teléfono, placa) y
-- btree para coincidencias exactas (duplicados).
create index clients_search_name_trgm on public.clients using gin (search_name extensions.gin_trgm_ops);
create index clients_phone_digits_trgm on public.clients using gin (phone_digits extensions.gin_trgm_ops);
create index clients_org_phone_idx on public.clients (organization_id, phone);
create index clients_org_email_idx on public.clients (organization_id, email) where email is not null;
create index clients_home_center_idx on public.clients (home_detail_center_id);
create index client_centers_center_idx on public.client_centers (detail_center_id);
create index vehicles_client_idx on public.vehicles (client_id);
create index vehicles_plate_trgm on public.vehicles using gin (plate extensions.gin_trgm_ops);
-- Una placa (o identificador) no puede estar en dos vehículos activos de la organización.
create unique index vehicles_org_plate_active_key on public.vehicles (organization_id, plate) where active;
create unique index vehicles_org_identifier_active_key on public.vehicles (organization_id, identifier)
  where active and identifier is not null;

create trigger clients_updated_at before update on public.clients
  for each row execute function private.set_updated_at();
create trigger client_centers_updated_at before update on public.client_centers
  for each row execute function private.set_updated_at();
create trigger vehicles_updated_at before update on public.vehicles
  for each row execute function private.set_updated_at();

create trigger clients_require_reason before insert or update or delete on public.clients
  for each row execute function private.require_change_reason();
create trigger client_centers_require_reason before insert or update or delete on public.client_centers
  for each row execute function private.require_change_reason();
create trigger vehicles_require_reason before insert or update or delete on public.vehicles
  for each row execute function private.require_change_reason();

-- Columnas de origen inmutables (no security definer: sólo compara filas).
create function private.keep_origin_columns() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.request_id is distinct from old.request_id
     or new.created_in_detail_center_id is distinct from old.created_in_detail_center_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Las columnas de origen del registro no se pueden cambiar' using errcode = '23514';
  end if;
  if tg_table_name = 'vehicles' then
    -- Un vehículo no cambia de cliente por edición (la transferencia es otro flujo).
    if (to_jsonb(new) ->> 'client_id') is distinct from (to_jsonb(old) ->> 'client_id') then
      raise exception 'Las columnas de origen del registro no se pueden cambiar' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger clients_keep_origin before update on public.clients
  for each row execute function private.keep_origin_columns();
create trigger vehicles_keep_origin before update on public.vehicles
  for each row execute function private.keep_origin_columns();

-- Auditoría: igual que antes, con client_id como identificador de las filas sin id propio.
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
    else coalesce(
      (row_json ->> 'detail_center_id')::uuid,
      (row_json ->> 'home_detail_center_id')::uuid,
      (row_json ->> 'created_in_detail_center_id')::uuid
    )
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
    coalesce(row_json ->> 'id', row_json ->> 'user_id', row_json ->> 'client_id'),
    tg_op,
    auth.uid(),
    nullif(current_setting('app.change_reason', true), ''),
    old_json,
    new_json
  );
  return null;
end;
$$;

create trigger clients_audit after insert or update or delete on public.clients
  for each row execute function private.audit_row();
create trigger client_centers_audit after insert or update or delete on public.client_centers
  for each row execute function private.audit_row();
create trigger vehicles_audit after insert or update or delete on public.vehicles
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- 3. Helpers de autorización (espejo de clients.read / clients.write en roles.ts)
-- ---------------------------------------------------------------------------

create function private.can_read_clients(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(
    p_detail_center_id,
    array['admin_socio', 'encargado', 'operador_recepcion', 'comercial_b2b']::public.app_role[]
  );
$$;

create function private.can_write_clients(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(
    p_detail_center_id,
    array['admin_socio', 'encargado', 'operador_recepcion']::public.app_role[]
  );
$$;

-- Security definer: lee client_centers sin RLS (evita recursión de políticas).
create function private.can_see_client(p_client_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.client_centers cc
    where cc.client_id = p_client_id and private.can_read_clients(cc.detail_center_id)
  );
$$;

create function private.can_edit_client(p_client_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.client_centers cc
    where cc.client_id = p_client_id and private.can_write_clients(cc.detail_center_id)
  );
$$;

-- Clientes activos de la organización que coinciden por teléfono, email,
-- placa o identificador (sin RLS: la detección de duplicados abarca toda la
-- organización; sólo se exponen datos enmascarados vía find_client_matches).
create function private.client_matches(
  p_organization_id uuid,
  p_phone text,
  p_email text,
  p_plates text[],
  p_identifiers text[],
  p_exclude_client_id uuid default null
) returns table (client_id uuid, matched_on text[])
language sql stable security definer set search_path = '' as $$
  with input as (
    select private.normalize_phone(p_phone) as phone,
           private.normalize_email(p_email) as email,
           coalesce((select array_agg(x) from (
             select private.normalize_plate(p) from unnest(coalesce(p_plates, '{}')) p) t(x) where x is not null), '{}') as plates,
           coalesce((select array_agg(x) from (
             select private.normalize_plate(p) from unnest(coalesce(p_identifiers, '{}')) p) t(x) where x is not null), '{}') as identifiers
  )
  select c.id,
         array_remove(array[
           case when c.phone = i.phone then 'phone' end,
           case when c.email = i.email then 'email' end,
           case when exists (select 1 from public.vehicles v
                              where v.client_id = c.id and v.active and v.plate = any (i.plates)) then 'plate' end,
           case when exists (select 1 from public.vehicles v
                              where v.client_id = c.id and v.active and v.identifier = any (i.identifiers)) then 'identifier' end
         ], null)
  from public.clients c, input i
  where c.organization_id = p_organization_id
    and c.active
    and c.id is distinct from p_exclude_client_id
    and (
      c.phone = i.phone
      or c.email = i.email
      or exists (select 1 from public.vehicles v
                 where v.client_id = c.id and v.active
                   and (v.plate = any (i.plates) or v.identifier = any (i.identifiers)))
    )
  order by c.created_at
  limit 10;
$$;

-- Registra una visita (la usará el módulo de Órdenes de Servicio).
create function private.register_client_visit(
  p_client_id uuid,
  p_detail_center_id uuid,
  p_visited_at timestamptz default now()
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
begin
  if not private.can_write_clients(p_detail_center_id) then
    raise exception 'Sin permiso para registrar visitas en este centro' using errcode = '42501';
  end if;
  select c.organization_id into org from public.clients c where c.id = p_client_id;
  if org is null then
    raise exception 'Cliente inexistente' using errcode = '22023';
  end if;
  perform set_config('app.change_reason', 'Visita registrada', true);
  insert into public.client_centers (client_id, detail_center_id, organization_id, last_visit_at)
  values (p_client_id, p_detail_center_id, org, p_visited_at)
  on conflict (client_id, detail_center_id)
    do update set last_visit_at = greatest(public.client_centers.last_visit_at, excluded.last_visit_at);
  update public.clients
     set last_visit_at = p_visited_at, last_visit_detail_center_id = p_detail_center_id
   where id = p_client_id and (last_visit_at is null or last_visit_at < p_visited_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

alter table public.clients enable row level security;
alter table public.client_centers enable row level security;
alter table public.vehicles enable row level security;

create policy clients_select on public.clients
  for select to authenticated using (
    private.can_read_clients(home_detail_center_id) or private.can_see_client(id)
  );
create policy clients_insert on public.clients
  for insert to authenticated with check (
    private.can_write_clients(created_in_detail_center_id) and private.can_write_clients(home_detail_center_id)
  );
create policy clients_update on public.clients
  for update to authenticated
  using (private.can_write_clients(home_detail_center_id) or private.can_edit_client(id))
  with check (private.can_write_clients(home_detail_center_id) or private.can_edit_client(id));

create policy client_centers_select on public.client_centers
  for select to authenticated using (
    private.can_read_clients(detail_center_id) or private.can_see_client(client_id)
  );
create policy client_centers_insert on public.client_centers
  for insert to authenticated with check (private.can_write_clients(detail_center_id));
create policy client_centers_update on public.client_centers
  for update to authenticated
  using (private.can_write_clients(detail_center_id))
  with check (private.can_write_clients(detail_center_id));

create policy vehicles_select on public.vehicles
  for select to authenticated using (private.can_see_client(client_id));
create policy vehicles_insert on public.vehicles
  for insert to authenticated with check (
    private.can_edit_client(client_id) and private.can_write_clients(created_in_detail_center_id)
  );
create policy vehicles_update on public.vehicles
  for update to authenticated
  using (private.can_edit_client(client_id))
  with check (private.can_edit_client(client_id));

-- Sin borrado físico: los clientes y vehículos se desactivan.
revoke all on public.clients, public.client_centers, public.vehicles from anon;
revoke delete, truncate on public.clients, public.client_centers, public.vehicles from authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC
-- ---------------------------------------------------------------------------

-- Posibles duplicados para el formulario de alta/edición. Sólo expone datos
-- enmascarados de clientes que el usuario no puede ver.
create function public.find_client_matches(
  p_detail_center_id uuid,
  p_phone text,
  p_email text default null,
  p_plates text[] default '{}',
  p_identifiers text[] default '{}',
  p_exclude_client_id uuid default null
)
returns table (
  client_id uuid,
  display_name text,
  phone_hint text,
  home_center_name text,
  matched_on text[],
  visible boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  org uuid;
begin
  if not private.can_write_clients(p_detail_center_id) then
    raise exception 'Sin permiso para registrar clientes en este centro' using errcode = '42501';
  end if;
  select c.organization_id into org from public.detail_centers c where c.id = p_detail_center_id;
  return query
    select c.id,
           case when private.can_read_clients(c.home_detail_center_id) or private.can_see_client(c.id)
                then c.full_name
                else split_part(c.full_name, ' ', 1)
                     || coalesce(' ' || nullif(left(split_part(c.full_name, ' ', 2), 1), '') || '.', '')
           end,
           '•••• ' || right(c.phone, 4),
           dc.name,
           m.matched_on,
           private.can_read_clients(c.home_detail_center_id) or private.can_see_client(c.id)
    from private.client_matches(org, p_phone, p_email, p_plates, p_identifiers, p_exclude_client_id) m
    join public.clients c on c.id = m.client_id
    join public.detail_centers dc on dc.id = c.home_detail_center_id;
end;
$$;

-- Alta de cliente con sus vehículos (0..n) en una sola transacción.
-- p_vehicles: [{ "make", "model", "year", "plate", "identifier"?, "notes"? }]
create function public.create_client(
  p_detail_center_id uuid,
  p_request_id uuid,
  p_full_name text,
  p_phone text,
  p_email text default null,
  p_kind text default 'person',
  p_notes text default null,
  p_marketing_channels text[] default '{}',
  p_source text default 'web',
  p_vehicles jsonb default '[]',
  p_duplicate_reason text default null
) returns public.clients
language plpgsql security invoker set search_path = '' as $$
declare
  org uuid;
  new_id uuid := gen_random_uuid();
  n_phone text := private.normalize_phone(p_phone);
  n_email text := private.normalize_email(p_email);
  channels text[] := coalesce(p_marketing_channels, '{}');
  v jsonb;
  plates text[];
  identifiers text[];
  result public.clients;
begin
  if p_request_id is null then
    raise exception 'Falta el identificador de la solicitud' using errcode = '22023';
  end if;
  if not private.can_write_clients(p_detail_center_id) then
    raise exception 'Sin permiso para registrar clientes en este centro' using errcode = '42501';
  end if;
  select c.organization_id into org from public.detail_centers c where c.id = p_detail_center_id;

  -- Idempotencia: la misma solicitud (reintento, doble envío) devuelve lo ya creado.
  select * into result from public.clients where organization_id = org and request_id = p_request_id;
  if found then
    return result;
  end if;

  if n_phone is null then
    raise exception 'Teléfono inválido' using errcode = '22023';
  end if;
  if p_email is not null and btrim(p_email) <> '' and n_email is null then
    raise exception 'Email inválido' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_vehicles, '[]')) <> 'array' then
    raise exception 'Vehículos inválidos' using errcode = '22023';
  end if;

  select coalesce(array_agg(e ->> 'plate'), '{}'), coalesce(array_agg(e ->> 'identifier'), '{}')
    into plates, identifiers
    from jsonb_array_elements(coalesce(p_vehicles, '[]')) e;

  -- Serializa altas concurrentes con el mismo teléfono (p. ej. web y móvil a la vez).
  perform pg_advisory_xact_lock(hashtextextended(org::text || n_phone, 0));

  if p_duplicate_reason is null
     and exists (select 1 from private.client_matches(org, n_phone, n_email, plates, identifiers)) then
    raise exception 'Posible cliente duplicado: confirma con un motivo para continuar'
      using errcode = 'MG001';
  end if;

  perform private.set_change_reason(coalesce(p_duplicate_reason, 'Alta de cliente'));

  -- Sin RETURNING: la fila es visible por RLS hasta que existe su client_centers.
  insert into public.clients (
    id, organization_id, home_detail_center_id, kind, full_name, phone, email, notes,
    marketing_opt_in, marketing_channels, marketing_opt_in_at, marketing_opt_in_source,
    request_id, created_in_detail_center_id
  ) values (
    new_id, org, p_detail_center_id, coalesce(p_kind, 'person'),
    regexp_replace(btrim(p_full_name), '\s+', ' ', 'g'), n_phone, n_email, nullif(btrim(p_notes), ''),
    cardinality(channels) > 0, channels,
    case when cardinality(channels) > 0 then now() end,
    case when cardinality(channels) > 0 then p_source end,
    p_request_id, p_detail_center_id
  );
  insert into public.client_centers (client_id, detail_center_id, organization_id)
  values (new_id, p_detail_center_id, org);

  for v in select * from jsonb_array_elements(coalesce(p_vehicles, '[]')) loop
    insert into public.vehicles (
      organization_id, client_id, make, model, year, plate, identifier, notes, created_in_detail_center_id
    ) values (
      org, new_id, btrim(v ->> 'make'), btrim(v ->> 'model'), (v ->> 'year')::smallint,
      private.normalize_plate(v ->> 'plate'), private.normalize_plate(v ->> 'identifier'),
      nullif(btrim(v ->> 'notes'), ''), p_detail_center_id
    );
  end loop;

  if p_duplicate_reason is not null then
    perform private.log_event(org, p_detail_center_id, 'client.duplicate_confirmed', 'public.clients', new_id::text,
      jsonb_build_object('matches',
        (select jsonb_agg(jsonb_build_object('client_id', m.client_id, 'matched_on', m.matched_on))
           from private.client_matches(org, n_phone, n_email, plates, identifiers, new_id) m)));
  end if;

  select * into result from public.clients where id = new_id;
  return result;
end;
$$;

-- Edición controlada: todos los cambios con motivo. Cambiar teléfono o email a
-- uno de otro cliente exige p_confirm_duplicate.
create function public.update_client(
  p_id uuid,
  p_full_name text,
  p_phone text,
  p_email text,
  p_kind text,
  p_notes text,
  p_home_detail_center_id uuid,
  p_marketing_channels text[],
  p_source text,
  p_reason text,
  p_confirm_duplicate boolean default false
) returns public.clients
language plpgsql security invoker set search_path = '' as $$
declare
  current_row public.clients;
  n_phone text := private.normalize_phone(p_phone);
  n_email text := private.normalize_email(p_email);
  channels text[] := coalesce(p_marketing_channels, '{}');
  consent_changed boolean;
  result public.clients;
begin
  perform private.set_change_reason(p_reason);
  select * into current_row from public.clients where id = p_id;
  if not found or not private.can_edit_client(p_id) then
    raise exception 'Cliente inexistente o sin permiso para editarlo' using errcode = '42501';
  end if;
  if n_phone is null then
    raise exception 'Teléfono inválido' using errcode = '22023';
  end if;
  if p_email is not null and btrim(p_email) <> '' and n_email is null then
    raise exception 'Email inválido' using errcode = '22023';
  end if;
  if p_home_detail_center_id is distinct from current_row.home_detail_center_id then
    if not private.can_write_clients(p_home_detail_center_id) then
      raise exception 'Sin permiso en el nuevo centro habitual' using errcode = '42501';
    end if;
    insert into public.client_centers (client_id, detail_center_id, organization_id)
    values (p_id, p_home_detail_center_id, current_row.organization_id)
    on conflict (client_id, detail_center_id) do nothing;
  end if;
  if not coalesce(p_confirm_duplicate, false)
     and exists (select 1 from private.client_matches(
       current_row.organization_id,
       case when n_phone is distinct from current_row.phone then n_phone end,
       case when n_email is distinct from current_row.email then n_email end,
       '{}', '{}', p_id)) then
    raise exception 'El teléfono o email ya pertenece a otro cliente: confirma para continuar'
      using errcode = 'MG001';
  end if;

  consent_changed := channels is distinct from current_row.marketing_channels;
  update public.clients
     set full_name = regexp_replace(btrim(p_full_name), '\s+', ' ', 'g'),
         phone = n_phone,
         email = n_email,
         kind = coalesce(p_kind, kind),
         notes = nullif(btrim(p_notes), ''),
         home_detail_center_id = p_home_detail_center_id,
         marketing_opt_in = cardinality(channels) > 0,
         marketing_channels = channels,
         marketing_opt_in_at = case when consent_changed then now() else marketing_opt_in_at end,
         marketing_opt_in_source = case when consent_changed then p_source else marketing_opt_in_source end
   where id = p_id;
  select * into result from public.clients where id = p_id;
  return result;
end;
$$;

create function public.add_vehicle(
  p_client_id uuid,
  p_detail_center_id uuid,
  p_request_id uuid,
  p_make text,
  p_model text,
  p_year integer,
  p_plate text,
  p_identifier text default null,
  p_notes text default null
) returns public.vehicles
language plpgsql security invoker set search_path = '' as $$
declare
  org uuid;
  new_id uuid := gen_random_uuid();
  result public.vehicles;
begin
  if not private.can_write_clients(p_detail_center_id) or not private.can_edit_client(p_client_id) then
    raise exception 'Cliente inexistente o sin permiso para editarlo' using errcode = '42501';
  end if;
  select c.organization_id into org from public.clients c where c.id = p_client_id;
  select * into result from public.vehicles where organization_id = org and request_id = p_request_id;
  if found then
    return result;
  end if;
  perform private.set_change_reason('Alta de vehículo');
  -- Atenderlo en otro centro lo vincula a ese centro.
  insert into public.client_centers (client_id, detail_center_id, organization_id)
  values (p_client_id, p_detail_center_id, org)
  on conflict (client_id, detail_center_id) do nothing;
  insert into public.vehicles (
    id, organization_id, client_id, make, model, year, plate, identifier, notes, request_id,
    created_in_detail_center_id
  ) values (
    new_id, org, p_client_id, btrim(p_make), btrim(p_model), p_year::smallint,
    private.normalize_plate(p_plate), private.normalize_plate(p_identifier), nullif(btrim(p_notes), ''),
    p_request_id, p_detail_center_id
  );
  select * into result from public.vehicles where id = new_id;
  return result;
end;
$$;

create function public.update_vehicle(
  p_id uuid,
  p_make text,
  p_model text,
  p_year integer,
  p_plate text,
  p_identifier text,
  p_notes text,
  p_active boolean,
  p_reason text
) returns public.vehicles
language plpgsql security invoker set search_path = '' as $$
declare
  result public.vehicles;
begin
  perform private.set_change_reason(p_reason);
  update public.vehicles
     set make = btrim(p_make),
         model = btrim(p_model),
         year = p_year::smallint,
         plate = private.normalize_plate(p_plate),
         identifier = private.normalize_plate(p_identifier),
         notes = nullif(btrim(p_notes), ''),
         active = coalesce(p_active, active)
   where id = p_id
  returning * into result;
  if not found then
    raise exception 'Vehículo inexistente o sin permiso para editarlo' using errcode = '42501';
  end if;
  return result;
end;
$$;

-- Vincula un cliente existente de la organización al centro (cuando el alta
-- detecta que ya existe pero no es visible desde este centro).
create function public.link_client_to_center(p_client_id uuid, p_detail_center_id uuid, p_reason text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
begin
  if not private.can_write_clients(p_detail_center_id) then
    raise exception 'Sin permiso para registrar clientes en este centro' using errcode = '42501';
  end if;
  select c.organization_id into org
    from public.clients c
    join public.detail_centers dc on dc.organization_id = c.organization_id and dc.id = p_detail_center_id
   where c.id = p_client_id and c.active;
  if org is null then
    raise exception 'Cliente inexistente en esta organización' using errcode = '22023';
  end if;
  perform private.set_change_reason(p_reason);
  insert into public.client_centers (client_id, detail_center_id, organization_id)
  values (p_client_id, p_detail_center_id, org)
  on conflict (client_id, detail_center_id) do nothing;
  perform private.log_event(org, p_detail_center_id, 'client.linked_to_center', 'public.clients', p_client_id::text, null);
  return p_client_id;
end;
$$;

-- Búsqueda por nombre, teléfono, email o placa. RLS limita a los clientes
-- visibles; los del centro activo aparecen primero.
create function public.search_clients(p_detail_center_id uuid, p_query text, p_limit integer default 20)
returns table (
  id uuid,
  full_name text,
  phone text,
  email text,
  kind text,
  home_detail_center_id uuid,
  home_center_name text,
  last_visit_at timestamptz,
  in_active_center boolean,
  plates text[],
  matched_on text
)
language sql stable security invoker set search_path = '' as $$
  with q as (
    select private.like_escape(private.normalize_text(p_query)) as name,
           regexp_replace(coalesce(p_query, ''), '\D', '', 'g') as digits,
           private.like_escape(coalesce(private.normalize_plate(p_query), '')) as plate,
           private.like_escape(coalesce(private.normalize_email(p_query), '')) as email
    where length(btrim(coalesce(p_query, ''))) >= 2
  ),
  hits as (
    select c.*, v.plates,
           case
             when q.plate <> '' and exists (select 1 from public.vehicles x
                    where x.client_id = c.id and x.active and x.plate like '%' || q.plate || '%') then 'plate'
             when length(q.digits) >= 4 and c.phone_digits like '%' || q.digits || '%' then 'phone'
             when q.email like '%@%' and c.email like q.email || '%' then 'email'
             when c.search_name like '%' || q.name || '%' then 'name'
           end as matched_on
    from public.clients c
    cross join q
    left join lateral (
      select coalesce(array_agg(x.plate order by x.created_at), '{}') as plates
      from public.vehicles x where x.client_id = c.id and x.active
    ) v on true
    where c.active
  )
  select h.id, h.full_name, h.phone, h.email, h.kind, h.home_detail_center_id, dc.name, h.last_visit_at,
         exists (select 1 from public.client_centers cc
                  where cc.client_id = h.id and cc.detail_center_id = p_detail_center_id),
         h.plates, h.matched_on
  from hits h
  left join public.detail_centers dc on dc.id = h.home_detail_center_id
  where h.matched_on is not null
  order by 9 desc, (h.matched_on = 'plate') desc, (h.matched_on = 'phone') desc, h.full_name
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- Historial cronológico del cliente. Cada entrada pertenece a un centro y sólo
-- se devuelve si el usuario puede leer clientes en ese centro. El módulo de
-- Órdenes de Servicio agregará sus entradas ('service_order').
create function public.client_history(p_client_id uuid)
returns table (
  occurred_at timestamptz,
  kind text,
  detail_center_id uuid,
  detail_center_name text,
  title text,
  vehicle_id uuid
)
language sql stable security invoker set search_path = '' as $$
  with entries as (
    select c.created_at as occurred_at, 'client_created' as kind, c.created_in_detail_center_id as center_id,
           'Alta del cliente' as title, null::uuid as vehicle_id
    from public.clients c where c.id = p_client_id
    union all
    select v.created_at, 'vehicle_added', v.created_in_detail_center_id,
           'Vehículo ' || v.make || ' ' || v.model || ' ' || v.year || ' (' || v.plate || ')', v.id
    from public.vehicles v where v.client_id = p_client_id
    union all
    select cc.first_seen_at, 'center_linked', cc.detail_center_id, 'Primera atención en el centro', null
    from public.client_centers cc
    join public.clients c on c.id = cc.client_id
    where cc.client_id = p_client_id and cc.detail_center_id <> c.created_in_detail_center_id
    union all
    select cc.last_visit_at, 'visit', cc.detail_center_id, 'Última visita', null
    from public.client_centers cc
    where cc.client_id = p_client_id and cc.last_visit_at is not null
  )
  select e.occurred_at, e.kind, e.center_id, dc.name, e.title, e.vehicle_id
  from entries e
  join public.detail_centers dc on dc.id = e.center_id
  where private.can_read_clients(e.center_id)
  order by e.occurred_at desc, e.kind;
$$;

-- ---------------------------------------------------------------------------
-- 6. Privilegios
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.normalize_text(text)',
    'private.normalize_phone(text)',
    'private.normalize_plate(text)',
    'private.normalize_email(text)',
    'private.like_escape(text)',
    'private.can_read_clients(uuid)',
    'private.can_write_clients(uuid)',
    'private.can_see_client(uuid)',
    'private.can_edit_client(uuid)',
    'private.client_matches(uuid, text, text, text[], text[], uuid)',
    'private.register_client_visit(uuid, uuid, timestamptz)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.find_client_matches(uuid, text, text, text[], text[], uuid)',
    'public.create_client(uuid, uuid, text, text, text, text, text, text[], text, jsonb, text)',
    'public.update_client(uuid, text, text, text, text, text, uuid, text[], text, text, boolean)',
    'public.add_vehicle(uuid, uuid, uuid, text, text, integer, text, text, text)',
    'public.update_vehicle(uuid, text, text, integer, text, text, text, boolean, text)',
    'public.link_client_to_center(uuid, uuid, text)',
    'public.search_clients(uuid, text, integer)',
    'public.client_history(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
