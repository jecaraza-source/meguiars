-- Lotes de insumos con caducidad y avisos (ADR 0052).
--
-- Recepción, el encargado o el admin registran cada lote que llega al centro
-- (insumo, lote, fecha de caducidad). La base calcula su estado con la fecha
-- del centro: vigente, por caducar (30 días o menos) o caducado. Operación del
-- día avisa qué hay que usar primero o sacar. Cuando el lote se termina o se
-- retira se cierra con motivo; nunca se borra.
--
-- No es un inventario: no lleva existencias ni movimientos (ADR 0012). La
-- cantidad recibida es sólo informativa.

create function private.can_use_supply_lots(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(
    p_detail_center_id, array['admin_socio', 'encargado', 'operador_recepcion']::public.app_role[]);
$$;

-- Espejo de supplyLotState / SUPPLY_EXPIRY_WARNING_DAYS (@meguiars/domain).
create function private.supply_lot_state(p_expires_on date, p_today date) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_expires_on < p_today then 'caducado'
    when p_expires_on - p_today <= 30 then 'por_caducar'
    else 'vigente'
  end;
$$;

create table public.supply_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  detail_center_id uuid not null references public.detail_centers (id) on delete restrict,
  inventory_item_id uuid not null,
  lot_code text not null check (length(btrim(lot_code)) between 1 and 40),
  expires_on date not null,
  received_on date not null,
  quantity numeric(12, 3) check (quantity is null or quantity > 0),
  notes text check (length(notes) <= 500),
  status text not null default 'activo' check (status in ('activo', 'agotado', 'retirado')),
  closed_reason text check (length(closed_reason) <= 500),
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  request_id uuid not null,
  version integer not null default 1 check (version >= 1),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_on >= received_on - 3650),
  check ((status = 'activo') = (closed_at is null)),
  unique (detail_center_id, request_id),
  foreign key (organization_id, inventory_item_id) references public.inventory_items (organization_id, id) on delete restrict
);
create index supply_lots_center_idx on public.supply_lots (detail_center_id, status, expires_on);
create index supply_lots_item_idx on public.supply_lots (inventory_item_id);
create index supply_lots_created_by_idx on public.supply_lots (created_by);
create index supply_lots_closed_by_idx on public.supply_lots (closed_by);
comment on table public.supply_lots is
  'Lotes de insumos con fecha de caducidad por centro; sin existencias (ADR 0052).';

create trigger supply_lots_updated_at before update on public.supply_lots
  for each row execute function private.set_updated_at();
create trigger supply_lots_require_reason before insert or update or delete on public.supply_lots
  for each row execute function private.require_change_reason();
create trigger supply_lots_audit after insert or update or delete on public.supply_lots
  for each row execute function private.audit_row();

alter table public.supply_lots enable row level security;
create policy supply_lots_select on public.supply_lots
  for select to authenticated using (private.can_use_supply_lots(detail_center_id));
revoke all on public.supply_lots from anon;
revoke insert, update, delete, truncate on public.supply_lots from authenticated;
grant select on public.supply_lots to authenticated;

-- Alta de un lote (idempotente por request_id).
create function public.register_supply_lot(
  p_detail_center_id uuid,
  p_request_id uuid,
  p_inventory_item_id uuid,
  p_lot_code text,
  p_expires_on date,
  p_received_on date,
  p_quantity numeric,
  p_notes text
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
  tz text;
  rid uuid;
begin
  if not private.can_use_supply_lots(p_detail_center_id) then
    raise exception 'Sin permiso para registrar lotes en este centro' using errcode = '42501';
  end if;
  select organization_id, timezone into org, tz from public.detail_centers where id = p_detail_center_id;
  select id into rid from public.supply_lots
   where detail_center_id = p_detail_center_id and request_id = p_request_id;
  if rid is not null then return rid; end if;
  if not exists (select 1 from public.inventory_items i
                  where i.id = p_inventory_item_id and i.organization_id = org and i.active) then
    raise exception 'El insumo no existe o está inactivo' using errcode = 'MG002';
  end if;
  if p_lot_code is null or length(btrim(p_lot_code)) = 0 or p_expires_on is null then
    raise exception 'Lote y fecha de caducidad son obligatorios' using errcode = '22023';
  end if;
  if coalesce(p_received_on, (now() at time zone tz)::date) > (now() at time zone tz)::date then
    raise exception 'La fecha de recepción no puede ser futura' using errcode = '22023';
  end if;
  perform private.set_change_reason('Alta de lote de insumo');
  insert into public.supply_lots
    (organization_id, detail_center_id, inventory_item_id, lot_code, expires_on, received_on,
     quantity, notes, request_id)
  values (org, p_detail_center_id, p_inventory_item_id, upper(btrim(p_lot_code)), p_expires_on,
          coalesce(p_received_on, (now() at time zone tz)::date), p_quantity, nullif(btrim(p_notes), ''),
          p_request_id)
  returning id into rid;
  return rid;
end;
$$;

-- Cerrar un lote: se terminó (agotado) o se sacó (retirado, p. ej. caducado o dañado).
create function public.close_supply_lot(p_id uuid, p_version integer, p_outcome text, p_reason text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  lot public.supply_lots;
begin
  select * into lot from public.supply_lots where id = p_id for update;
  if not found or not private.can_use_supply_lots(lot.detail_center_id) then
    raise exception 'Lote inexistente o sin permiso' using errcode = '42501';
  end if;
  if p_outcome not in ('agotado', 'retirado') then
    raise exception 'Resultado inválido' using errcode = '22023';
  end if;
  if lot.version <> p_version then
    raise exception 'El lote cambió; recarga' using errcode = '40001';
  end if;
  if lot.status <> 'activo' then
    raise exception 'El lote ya está cerrado' using errcode = 'MG002';
  end if;
  perform private.set_change_reason(p_reason);
  update public.supply_lots
     set status = p_outcome, closed_reason = btrim(p_reason), closed_at = now(),
         closed_by = (select auth.uid()), version = version + 1
   where id = p_id;
  return lot.version + 1;
end;
$$;

-- Lotes del centro con su estado del día (zona del centro). Activos primero, por caducidad.
create function public.supply_lots_for_center(p_detail_center_id uuid, p_include_closed boolean default false)
returns table (
  id uuid,
  inventory_item_id uuid,
  item_code text,
  item_name text,
  item_unit text,
  lot_code text,
  expires_on date,
  received_on date,
  quantity numeric,
  notes text,
  status text,
  state text,
  days_left integer,
  closed_reason text,
  closed_at timestamptz,
  version integer
)
language sql stable security invoker set search_path = '' as $$
  with today as (
    select (now() at time zone d.timezone)::date as d from public.detail_centers d where d.id = p_detail_center_id
  )
  select l.id, l.inventory_item_id, i.code, i.name, i.unit, l.lot_code, l.expires_on, l.received_on,
         l.quantity, l.notes, l.status,
         case when l.status = 'activo' then private.supply_lot_state(l.expires_on, t.d) end,
         l.expires_on - t.d, l.closed_reason, l.closed_at, l.version
    from public.supply_lots l
    join public.inventory_items i on i.id = l.inventory_item_id
    cross join today t
   where l.detail_center_id = p_detail_center_id
     and (p_include_closed or l.status = 'activo')
   order by (l.status = 'activo') desc, l.expires_on, i.name
   limit 500;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.register_supply_lot(uuid, uuid, uuid, text, date, date, numeric, text)',
    'public.close_supply_lot(uuid, integer, text, text)',
    'public.supply_lots_for_center(uuid, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  -- Ayudantes que usan la RLS y la lista (security invoker) de quien llama.
  foreach fn in array array['private.can_use_supply_lots(uuid)', 'private.supply_lot_state(date, date)'] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
