-- O5 — Operación / Ejecución, evidencias y consumos.
--
-- Seguimiento de la ejecución real sin convertir el MVP en un WMS:
-- * Ejecución por línea (iniciar, pausar, terminar) además de la OS completa;
--   tiempos calculados en la base, nunca negativos.
-- * service_order_events: bitácora append-only de la ejecución (OS, líneas,
--   personal, evidencias, consumos e incidencias), con actor y hora del servidor.
-- * service_order_staff: técnicos que participaron en la OS.
-- * service_order_evidence: fotos antes/durante/después/incidencia en Storage
--   (bucket privado service-order-evidence, ruta <org>/<centro>/<OS>/<archivo>)
--   con acceso firmado; las políticas de Storage usan las mismas reglas que RLS.
-- * inventory_items + service_supply_standards: insumos y consumo estándar sólo
--   para los servicios configurados; service_order_consumptions guarda estándar
--   vs real por línea, con costo congelado (sin existencias ni almacenes).
-- * service_order_incidents: incidencias y retrabajos básicos.
--
-- Escrituras sólo por RPC con motivo y auditoría. Compatible hacia atrás.

create type public.item_work_status as enum ('pendiente', 'en_proceso', 'pausada', 'terminada');

-- ---------------------------------------------------------------------------
-- 1. Ejecución por línea y tiempos no negativos
-- ---------------------------------------------------------------------------

alter table public.service_order_items
  add column work_status public.item_work_status not null default 'pendiente',
  add column started_at timestamptz,
  add column finished_at timestamptz,
  add column work_started_at timestamptz,
  add column worked_minutes integer not null default 0,
  add column technician_id uuid,
  add constraint service_order_items_worked_minutes_check check (worked_minutes >= 0),
  add constraint service_order_items_work_dates_check check (finished_at is null or started_at is null or finished_at >= started_at),
  add constraint service_order_items_running_check check ((work_status = 'en_proceso') = (work_started_at is not null));

alter table public.service_orders
  add constraint service_orders_worked_minutes_check check (worked_minutes >= 0),
  add constraint service_orders_work_dates_check check (finished_at is null or started_at is null or finished_at >= started_at);

create index service_order_items_technician_idx on public.service_order_items (technician_id) where technician_id is not null;

-- Transiciones de una línea (espejo de ITEM_WORK_TRANSITIONS en el dominio).
create function private.item_work_transition_allowed(
  p_from public.item_work_status,
  p_to public.item_work_status
) returns boolean
language sql immutable set search_path = '' as $$
  select (p_from, p_to) in (
    ('pendiente'::public.item_work_status, 'en_proceso'::public.item_work_status),
    ('en_proceso', 'pausada'),
    ('en_proceso', 'terminada'),
    ('pausada', 'en_proceso'),
    ('pausada', 'terminada')
  );
$$;

-- Minutos transcurridos desde un inicio (0 si no hay tramo o si el reloj retrocede).
create function private.elapsed_minutes(p_since timestamptz) returns integer
language sql stable set search_path = '' as $$
  select case when p_since is null then 0
              else greatest(0, floor(extract(epoch from (now() - p_since)) / 60))::integer end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Personal, eventos, incidencias
-- ---------------------------------------------------------------------------

create table public.service_order_staff (
  service_order_id uuid not null,
  technician_id uuid not null,
  organization_id uuid not null,
  detail_center_id uuid not null,
  added_by uuid default auth.uid() references auth.users (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (service_order_id, technician_id),
  foreign key (organization_id, service_order_id) references public.service_orders (organization_id, id) on delete cascade,
  foreign key (detail_center_id, technician_id) references public.technicians (detail_center_id, id) on delete restrict
);
create index service_order_staff_technician_idx on public.service_order_staff (technician_id);

create table public.service_order_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  service_order_id uuid not null,
  item_id uuid,
  kind text not null check (kind in ('incidencia', 'retrabajo')),
  description text not null check (length(btrim(description)) between 3 and 2000),
  status text not null default 'abierta' check (status in ('abierta', 'resuelta')),
  resolution text check (resolution is null or length(btrim(resolution)) between 3 and 2000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (service_order_id, id),
  check ((status = 'resuelta') = (resolved_at is not null and resolution is not null)),
  foreign key (organization_id, service_order_id) references public.service_orders (organization_id, id) on delete cascade,
  foreign key (service_order_id, item_id) references public.service_order_items (service_order_id, id) on delete restrict
);
create index service_order_incidents_order_idx on public.service_order_incidents (service_order_id);
create index service_order_incidents_center_status_idx on public.service_order_incidents (detail_center_id, status);
create index service_order_incidents_item_idx on public.service_order_incidents (item_id) where item_id is not null;

create table public.service_order_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  detail_center_id uuid not null,
  service_order_id uuid not null,
  item_id uuid,
  kind text not null check (kind in (
    'os_inicio', 'os_pausa', 'os_reanudacion', 'os_fin',
    'linea_inicio', 'linea_pausa', 'linea_reanudacion', 'linea_fin',
    'personal', 'evidencia', 'evidencia_eliminada', 'consumo', 'incidencia', 'incidencia_resuelta'
  )),
  technician_id uuid,
  note text,
  data jsonb,
  actor_id uuid references auth.users (id) on delete set null,
  -- Hora del servidor: los clientes no envían tiempos.
  occurred_at timestamptz not null default clock_timestamp(),
  foreign key (organization_id, service_order_id) references public.service_orders (organization_id, id) on delete cascade
);
create index service_order_events_order_idx on public.service_order_events (service_order_id, occurred_at);

-- ---------------------------------------------------------------------------
-- 3. Evidencias (Storage privado + metadatos)
-- ---------------------------------------------------------------------------

create table public.service_order_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  service_order_id uuid not null,
  item_id uuid,
  incident_id uuid,
  kind text not null check (kind in ('antes', 'durante', 'despues', 'incidencia')),
  -- Ruta dentro del bucket: <org>/<centro>/<OS>/<uuid>.<ext>
  storage_path text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  width integer check (width is null or width between 1 and 10000),
  height integer check (height is null or height between 1 and 10000),
  note text check (note is null or length(note) <= 1000),
  taken_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  delete_reason text,
  updated_at timestamptz not null default now(),
  check ((deleted_at is null) = (delete_reason is null)),
  check (storage_path = organization_id || '/' || detail_center_id || '/' || service_order_id || '/' || split_part(storage_path, '/', 4)),
  foreign key (organization_id, service_order_id) references public.service_orders (organization_id, id) on delete cascade,
  foreign key (service_order_id, item_id) references public.service_order_items (service_order_id, id) on delete restrict,
  foreign key (service_order_id, incident_id) references public.service_order_incidents (service_order_id, id) on delete restrict
);
create index service_order_evidence_order_idx on public.service_order_evidence (service_order_id, created_at);
create index service_order_evidence_item_idx on public.service_order_evidence (item_id) where item_id is not null;
create index service_order_evidence_incident_idx on public.service_order_evidence (incident_id) where incident_id is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('service-order-evidence', 'service-order-evidence', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Insumos y consumos (estándar vs real, sin existencias)
-- ---------------------------------------------------------------------------

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  code text not null check (code ~ '^[A-Z0-9-]{2,20}$'),
  name text not null check (length(btrim(name)) between 2 and 120),
  unit text not null check (unit in ('ml', 'l', 'g', 'kg', 'pza')),
  -- Costo por unidad (MXN), para valorar el consumo real.
  unit_cost numeric(12, 4) not null check (unit_cost >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, code)
);

-- Consumo estándar por unidad vendida del servicio (sólo servicios configurados).
create table public.service_supply_standards (
  organization_id uuid not null,
  service_id uuid not null,
  inventory_item_id uuid not null,
  quantity numeric(12, 3) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (service_id, inventory_item_id),
  foreign key (organization_id, service_id) references public.services (organization_id, id) on delete restrict,
  foreign key (organization_id, inventory_item_id) references public.inventory_items (organization_id, id) on delete restrict
);
create index service_supply_standards_item_idx on public.service_supply_standards (inventory_item_id);

create table public.service_order_consumptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  service_order_id uuid not null,
  item_id uuid not null,
  inventory_item_id uuid not null,
  unit text not null,
  -- Congelados al registrar: estándar = cantidad estándar × cantidad de la línea.
  standard_quantity numeric(12, 3) not null check (standard_quantity >= 0),
  actual_quantity numeric(12, 3) not null check (actual_quantity >= 0),
  unit_cost numeric(12, 4) not null check (unit_cost >= 0),
  note text check (note is null or length(note) <= 1000),
  recorded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, inventory_item_id),
  foreign key (organization_id, service_order_id) references public.service_orders (organization_id, id) on delete cascade,
  foreign key (service_order_id, item_id) references public.service_order_items (service_order_id, id) on delete cascade,
  foreign key (organization_id, inventory_item_id) references public.inventory_items (organization_id, id) on delete restrict
);
create index service_order_consumptions_order_idx on public.service_order_consumptions (service_order_id);
create index service_order_consumptions_center_idx on public.service_order_consumptions (detail_center_id, created_at);
create index service_order_consumptions_inventory_idx on public.service_order_consumptions (inventory_item_id);

-- ---------------------------------------------------------------------------
-- 5. Triggers
-- ---------------------------------------------------------------------------

create trigger service_order_incidents_updated_at before update on public.service_order_incidents
  for each row execute function private.set_updated_at();
create trigger service_order_evidence_updated_at before update on public.service_order_evidence
  for each row execute function private.set_updated_at();
create trigger inventory_items_updated_at before update on public.inventory_items
  for each row execute function private.set_updated_at();
create trigger service_supply_standards_updated_at before update on public.service_supply_standards
  for each row execute function private.set_updated_at();
create trigger service_order_consumptions_updated_at before update on public.service_order_consumptions
  for each row execute function private.set_updated_at();

create trigger service_order_staff_require_reason before insert or update or delete on public.service_order_staff
  for each row execute function private.require_change_reason();
create trigger service_order_incidents_require_reason before insert or update or delete on public.service_order_incidents
  for each row execute function private.require_change_reason();
create trigger service_order_evidence_require_reason before insert or update or delete on public.service_order_evidence
  for each row execute function private.require_change_reason();
create trigger inventory_items_require_reason before insert or update or delete on public.inventory_items
  for each row execute function private.require_change_reason();
create trigger service_supply_standards_require_reason before insert or update or delete on public.service_supply_standards
  for each row execute function private.require_change_reason();
create trigger service_order_consumptions_require_reason before insert or update or delete on public.service_order_consumptions
  for each row execute function private.require_change_reason();

create trigger service_order_staff_audit after insert or update or delete on public.service_order_staff
  for each row execute function private.audit_row();
create trigger service_order_incidents_audit after insert or update or delete on public.service_order_incidents
  for each row execute function private.audit_row();
create trigger service_order_evidence_audit after insert or update or delete on public.service_order_evidence
  for each row execute function private.audit_row();
create trigger inventory_items_audit after insert or update or delete on public.inventory_items
  for each row execute function private.audit_row();
create trigger service_supply_standards_audit after insert or update or delete on public.service_supply_standards
  for each row execute function private.audit_row();
create trigger service_order_consumptions_audit after insert or update or delete on public.service_order_consumptions
  for each row execute function private.audit_row();

-- Bitácora de ejecución (security definer: nadie escribe eventos directamente).
create function private.log_order_event(
  p_order_id uuid,
  p_kind text,
  p_item_id uuid default null,
  p_technician_id uuid default null,
  p_note text default null,
  p_data jsonb default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.service_order_events
    (organization_id, detail_center_id, service_order_id, item_id, kind, technician_id, note, data, actor_id)
  select o.organization_id, o.detail_center_id, o.id, p_item_id, p_kind, p_technician_id,
         nullif(btrim(coalesce(p_note, current_setting('app.change_reason', true))), ''), p_data, auth.uid()
  from public.service_orders o where o.id = p_order_id;
end;
$$;

-- Pausa o cierra una línea en curso acumulando sus minutos.
create function private.stop_item_work(p_item_id uuid, p_to public.item_work_status) returns void
language plpgsql set search_path = '' as $$
begin
  update public.service_order_items
     set work_status = p_to,
         worked_minutes = worked_minutes + private.elapsed_minutes(work_started_at),
         work_started_at = null,
         finished_at = case when p_to = 'terminada' then now() else finished_at end
   where id = p_item_id;
end;
$$;

-- Eventos de la OS completa y efecto en las líneas: pausar la OS pausa las
-- líneas en curso; terminarla cierra las líneas iniciadas.
create function private.on_service_order_execution() returns trigger
language plpgsql set search_path = '' as $$
declare
  it record;
begin
  if new.status is not distinct from old.status then
    return null;
  end if;
  if new.status = 'en_proceso' then
    perform private.log_order_event(new.id, case when old.status = 'pausada' then 'os_reanudacion' else 'os_inicio' end);
  elsif new.status = 'pausada' then
    perform private.log_order_event(new.id, 'os_pausa');
    for it in select id from public.service_order_items where service_order_id = new.id and work_status = 'en_proceso' loop
      perform private.stop_item_work(it.id, 'pausada');
      perform private.log_order_event(new.id, 'linea_pausa', it.id);
    end loop;
  elsif new.status = 'terminada' then
    for it in select id from public.service_order_items
               where service_order_id = new.id and work_status in ('en_proceso', 'pausada') loop
      perform private.stop_item_work(it.id, 'terminada');
      perform private.log_order_event(new.id, 'linea_fin', it.id);
    end loop;
    perform private.log_order_event(new.id, 'os_fin');
  end if;
  return null;
end;
$$;
create trigger service_orders_execution after update of status on public.service_orders
  for each row execute function private.on_service_order_execution();

-- ---------------------------------------------------------------------------
-- 6. Autorización y RLS
-- ---------------------------------------------------------------------------

-- Evidencia: ruta <org>/<centro>/<OS>/<archivo>. Lee quien usa OS en el centro;
-- sube quien puede y la OS está abierta a evidencias (no cancelada ni entregada).
create function private.can_read_order_evidence(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.service_orders o
    where o.id::text = split_part(p_name, '/', 3)
      and o.detail_center_id::text = split_part(p_name, '/', 2)
      and o.organization_id::text = split_part(p_name, '/', 1)
      and private.can_use_orders(o.detail_center_id)
  );
$$;

create function private.can_upload_order_evidence(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
     and exists (
       select 1 from public.service_orders o
       where o.id::text = split_part(p_name, '/', 3)
         and o.detail_center_id::text = split_part(p_name, '/', 2)
         and o.organization_id::text = split_part(p_name, '/', 1)
         and o.status not in ('cancelada', 'entregada')
         and private.can_use_orders(o.detail_center_id)
     );
$$;

create policy service_order_evidence_objects_select on storage.objects
  for select to authenticated
  using (bucket_id = 'service-order-evidence' and private.can_read_order_evidence(name));
create policy service_order_evidence_objects_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'service-order-evidence' and private.can_upload_order_evidence(name));

alter table public.service_order_staff enable row level security;
alter table public.service_order_incidents enable row level security;
alter table public.service_order_events enable row level security;
alter table public.service_order_evidence enable row level security;
alter table public.inventory_items enable row level security;
alter table public.service_supply_standards enable row level security;
alter table public.service_order_consumptions enable row level security;

create policy service_order_staff_select on public.service_order_staff
  for select to authenticated using (private.can_use_orders(detail_center_id));
create policy service_order_staff_insert on public.service_order_staff
  for insert to authenticated with check (private.can_use_orders(detail_center_id));
create policy service_order_staff_delete on public.service_order_staff
  for delete to authenticated using (private.can_use_orders(detail_center_id));

create policy service_order_incidents_select on public.service_order_incidents
  for select to authenticated using (private.can_use_orders(detail_center_id));
create policy service_order_incidents_insert on public.service_order_incidents
  for insert to authenticated with check (private.can_use_orders(detail_center_id));
create policy service_order_incidents_update on public.service_order_incidents for update to authenticated
  using (private.can_use_orders(detail_center_id)) with check (private.can_use_orders(detail_center_id));

create policy service_order_events_select on public.service_order_events
  for select to authenticated using (private.can_use_orders(detail_center_id));

create policy service_order_evidence_select on public.service_order_evidence
  for select to authenticated using (private.can_use_orders(detail_center_id));
create policy service_order_evidence_insert on public.service_order_evidence
  for insert to authenticated with check (private.can_use_orders(detail_center_id));
create policy service_order_evidence_update on public.service_order_evidence for update to authenticated
  using (private.can_use_orders(detail_center_id)) with check (private.can_use_orders(detail_center_id));

-- Insumos y estándares: los lee la organización; los administra el admin_socio corporativo.
create policy inventory_items_select on public.inventory_items
  for select to authenticated using (private.is_org_member(organization_id));
create policy inventory_items_insert on public.inventory_items
  for insert to authenticated with check (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]));
create policy inventory_items_update on public.inventory_items for update to authenticated
  using (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]))
  with check (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]));

create policy service_supply_standards_select on public.service_supply_standards
  for select to authenticated using (private.is_org_member(organization_id));
create policy service_supply_standards_insert on public.service_supply_standards
  for insert to authenticated with check (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]));
create policy service_supply_standards_update on public.service_supply_standards for update to authenticated
  using (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]))
  with check (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]));
create policy service_supply_standards_delete on public.service_supply_standards
  for delete to authenticated using (private.has_org_role(organization_id, array['admin_socio']::public.app_role[]));

create policy service_order_consumptions_select on public.service_order_consumptions
  for select to authenticated using (private.can_use_orders(detail_center_id));
create policy service_order_consumptions_insert on public.service_order_consumptions
  for insert to authenticated with check (private.can_use_orders(detail_center_id));
create policy service_order_consumptions_update on public.service_order_consumptions for update to authenticated
  using (private.can_use_orders(detail_center_id)) with check (private.can_use_orders(detail_center_id));

revoke all on public.service_order_staff, public.service_order_incidents, public.service_order_events,
  public.service_order_evidence, public.inventory_items, public.service_supply_standards,
  public.service_order_consumptions from anon;
revoke update, truncate on public.service_order_staff from authenticated;
revoke delete, truncate on public.service_order_incidents, public.service_order_evidence, public.inventory_items,
  public.service_order_consumptions from authenticated;
revoke truncate on public.service_supply_standards from authenticated;
revoke insert, update, delete, truncate on public.service_order_events from authenticated;

-- ---------------------------------------------------------------------------
-- 7. RPC
-- ---------------------------------------------------------------------------

-- Bloquea la OS para operaciones de ejecución. No exige versión: varios
-- técnicos trabajan a la vez; el bloqueo serializa y la base valida el estado.
create function private.lock_order_for_execution(p_order_id uuid) returns public.service_orders
language plpgsql set search_path = '' as $$
declare
  o public.service_orders;
begin
  select * into o from public.service_orders where id = p_order_id for update;
  if not found then
    raise exception 'OS inexistente o sin permiso' using errcode = '42501';
  end if;
  return o;
end;
$$;

create function private.add_order_staff(o public.service_orders, p_technician_id uuid) returns void
language plpgsql set search_path = '' as $$
begin
  if p_technician_id is null then
    return;
  end if;
  if not exists (select 1 from public.technicians t
                  where t.id = p_technician_id and t.detail_center_id = o.detail_center_id and t.active) then
    raise exception 'Técnico inexistente o inactivo en este centro' using errcode = '22023';
  end if;
  insert into public.service_order_staff (service_order_id, technician_id, organization_id, detail_center_id)
  values (o.id, p_technician_id, o.organization_id, o.detail_center_id)
  on conflict do nothing;
end;
$$;

-- Iniciar, pausar, reanudar o terminar una línea. Sólo con la OS en proceso.
create function public.set_service_order_item_work(
  p_item_id uuid,
  p_status public.item_work_status,
  p_technician_id uuid default null,
  p_note text default null
) returns public.service_order_items
language plpgsql security invoker set search_path = '' as $$
declare
  it public.service_order_items;
  o public.service_orders;
  result public.service_order_items;
begin
  select * into it from public.service_order_items where id = p_item_id;
  if not found then
    raise exception 'Línea inexistente o sin permiso' using errcode = '42501';
  end if;
  o := private.lock_order_for_execution(it.service_order_id);
  select * into it from public.service_order_items where id = p_item_id for update;
  if o.status <> 'en_proceso' then
    raise exception 'Inicia la OS antes de trabajar sus líneas' using errcode = '22023';
  end if;
  if not private.item_work_transition_allowed(it.work_status, p_status) then
    raise exception 'Transición no permitida: % → %', it.work_status, p_status using errcode = '22023';
  end if;
  perform private.set_change_reason(coalesce(nullif(btrim(p_note), ''), 'Línea: ' || p_status::text));
  perform private.add_order_staff(o, p_technician_id);
  if p_status = 'en_proceso' then
    update public.service_order_items
       set work_status = 'en_proceso', work_started_at = now(), started_at = coalesce(started_at, now()),
           technician_id = coalesce(p_technician_id, technician_id)
     where id = p_item_id;
  else
    perform private.stop_item_work(p_item_id, p_status);
  end if;
  perform private.log_order_event(o.id,
    case p_status when 'en_proceso' then case when it.work_status = 'pausada' then 'linea_reanudacion' else 'linea_inicio' end
                  when 'pausada' then 'linea_pausa' else 'linea_fin' end,
    p_item_id, coalesce(p_technician_id, it.technician_id), p_note);
  select * into result from public.service_order_items where id = p_item_id;
  return result;
end;
$$;

-- Técnicos participantes: reemplaza la lista (el técnico principal de la OS siempre participa).
create function public.set_service_order_staff(p_order_id uuid, p_technician_ids uuid[], p_reason text default null)
returns setof public.service_order_staff
language plpgsql security invoker set search_path = '' as $$
declare
  o public.service_orders;
  tid uuid;
  ids uuid[] := array(select distinct x from unnest(coalesce(p_technician_ids, '{}')) x where x is not null);
begin
  o := private.lock_order_for_execution(p_order_id);
  if o.status in ('cancelada', 'entregada') then
    raise exception 'La OS ya está cerrada' using errcode = '22023';
  end if;
  perform private.set_change_reason(coalesce(nullif(btrim(p_reason), ''), 'Personal de la OS'));
  if o.technician_id is not null and not (o.technician_id = any (ids)) then
    ids := ids || o.technician_id;
  end if;
  delete from public.service_order_staff where service_order_id = o.id and not (technician_id = any (ids));
  foreach tid in array ids loop
    perform private.add_order_staff(o, tid);
  end loop;
  perform private.log_order_event(o.id, 'personal', null, null, null, jsonb_build_object('technician_ids', to_jsonb(ids)));
  return query select * from public.service_order_staff where service_order_id = o.id;
end;
$$;

-- Registra una evidencia ya subida a Storage (la ruta la valida la política de Storage).
create function public.register_service_order_evidence(
  p_order_id uuid,
  p_storage_path text,
  p_kind text,
  p_content_type text,
  p_size_bytes integer,
  p_width integer default null,
  p_height integer default null,
  p_item_id uuid default null,
  p_incident_id uuid default null,
  p_note text default null
) returns public.service_order_evidence
language plpgsql security invoker set search_path = '' as $$
declare
  o public.service_orders;
  result public.service_order_evidence;
begin
  o := private.lock_order_for_execution(p_order_id);
  select * into result from public.service_order_evidence where storage_path = p_storage_path;
  if found then
    return result;
  end if;
  if o.status in ('cancelada', 'entregada') then
    raise exception 'La OS ya está cerrada' using errcode = '22023';
  end if;
  if split_part(p_storage_path, '/', 1) <> o.organization_id::text
     or split_part(p_storage_path, '/', 2) <> o.detail_center_id::text
     or split_part(p_storage_path, '/', 3) <> o.id::text then
    raise exception 'La ruta de la evidencia no corresponde a la OS' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects s
                  where s.bucket_id = 'service-order-evidence' and s.name = p_storage_path) then
    raise exception 'Sube el archivo antes de registrarlo' using errcode = '22023';
  end if;
  perform private.set_change_reason('Evidencia ' || coalesce(p_kind, ''));
  insert into public.service_order_evidence (
    organization_id, detail_center_id, service_order_id, item_id, incident_id, kind, storage_path, content_type,
    size_bytes, width, height, note
  ) values (
    o.organization_id, o.detail_center_id, o.id, p_item_id, p_incident_id, p_kind, p_storage_path, p_content_type,
    p_size_bytes, p_width, p_height, nullif(btrim(p_note), '')
  ) returning * into result;
  perform private.log_order_event(o.id, 'evidencia', p_item_id, null, p_note,
                                  jsonb_build_object('evidence_id', result.id, 'kind', p_kind));
  return result;
end;
$$;

-- Retira una evidencia de la OS con motivo (el archivo se conserva para auditoría).
create function public.remove_service_order_evidence(p_evidence_id uuid, p_reason text)
returns public.service_order_evidence
language plpgsql security invoker set search_path = '' as $$
declare
  e public.service_order_evidence;
  o public.service_orders;
begin
  select * into e from public.service_order_evidence where id = p_evidence_id;
  if not found then
    raise exception 'Evidencia inexistente o sin permiso' using errcode = '42501';
  end if;
  o := private.lock_order_for_execution(e.service_order_id);
  perform private.set_change_reason(p_reason);
  if o.status in ('cancelada', 'entregada') then
    raise exception 'La OS ya está cerrada' using errcode = '22023';
  end if;
  if e.deleted_at is not null then
    raise exception 'La evidencia ya estaba retirada' using errcode = '22023';
  end if;
  update public.service_order_evidence
     set deleted_at = now(), deleted_by = auth.uid(), delete_reason = btrim(p_reason)
   where id = e.id
  returning * into e;
  perform private.log_order_event(o.id, 'evidencia_eliminada', e.item_id, null, p_reason,
                                  jsonb_build_object('evidence_id', e.id));
  return e;
end;
$$;

-- Consumo real de un insumo configurado para el servicio de la línea. El
-- estándar y el costo se congelan al registrar; volver a registrar corrige el real.
create function public.record_service_order_consumption(
  p_item_id uuid,
  p_inventory_item_id uuid,
  p_actual_quantity numeric,
  p_note text default null
) returns public.service_order_consumptions
language plpgsql security invoker set search_path = '' as $$
declare
  it public.service_order_items;
  o public.service_orders;
  std numeric;
  inv public.inventory_items;
  result public.service_order_consumptions;
begin
  select * into it from public.service_order_items where id = p_item_id;
  if not found then
    raise exception 'Línea inexistente o sin permiso' using errcode = '42501';
  end if;
  o := private.lock_order_for_execution(it.service_order_id);
  if o.status not in ('en_proceso', 'pausada', 'terminada') then
    raise exception 'El consumo se registra durante o al terminar el servicio' using errcode = '22023';
  end if;
  if p_actual_quantity is null or p_actual_quantity < 0 or p_actual_quantity > 100000 then
    raise exception 'Cantidad inválida' using errcode = '22023';
  end if;
  select s.quantity into std from public.service_supply_standards s
   where s.service_id = it.service_id and s.inventory_item_id = p_inventory_item_id;
  if not found then
    raise exception 'El insumo no está configurado para este servicio' using errcode = '22023';
  end if;
  select * into inv from public.inventory_items where id = p_inventory_item_id;
  perform private.set_change_reason(coalesce(nullif(btrim(p_note), ''), 'Consumo de insumos'));
  insert into public.service_order_consumptions (
    organization_id, detail_center_id, service_order_id, item_id, inventory_item_id, unit, standard_quantity,
    actual_quantity, unit_cost, note
  ) values (
    o.organization_id, o.detail_center_id, o.id, it.id, inv.id, inv.unit, round(std * it.quantity, 3),
    round(p_actual_quantity, 3), inv.unit_cost, nullif(btrim(p_note), '')
  )
  on conflict (item_id, inventory_item_id) do update
    set actual_quantity = excluded.actual_quantity, note = excluded.note
  returning * into result;
  perform private.log_order_event(o.id, 'consumo', it.id, null, p_note,
    jsonb_build_object('inventory_item_id', inv.id, 'standard', result.standard_quantity, 'actual', result.actual_quantity));
  return result;
end;
$$;

create function public.report_service_order_incident(
  p_order_id uuid,
  p_kind text,
  p_description text,
  p_item_id uuid default null
) returns public.service_order_incidents
language plpgsql security invoker set search_path = '' as $$
declare
  o public.service_orders;
  result public.service_order_incidents;
begin
  o := private.lock_order_for_execution(p_order_id);
  if o.status in ('cancelada', 'entregada') then
    raise exception 'La OS ya está cerrada' using errcode = '22023';
  end if;
  perform private.set_change_reason(p_description);
  insert into public.service_order_incidents
    (organization_id, detail_center_id, service_order_id, item_id, kind, description)
  values (o.organization_id, o.detail_center_id, o.id, p_item_id, p_kind, btrim(p_description))
  returning * into result;
  perform private.log_order_event(o.id, 'incidencia', p_item_id, null, p_description,
                                  jsonb_build_object('incident_id', result.id, 'kind', p_kind));
  return result;
end;
$$;

create function public.resolve_service_order_incident(p_incident_id uuid, p_resolution text)
returns public.service_order_incidents
language plpgsql security invoker set search_path = '' as $$
declare
  i public.service_order_incidents;
  o public.service_orders;
begin
  select * into i from public.service_order_incidents where id = p_incident_id;
  if not found then
    raise exception 'Incidencia inexistente o sin permiso' using errcode = '42501';
  end if;
  o := private.lock_order_for_execution(i.service_order_id);
  perform private.set_change_reason(p_resolution);
  if i.status = 'resuelta' then
    raise exception 'La incidencia ya estaba resuelta' using errcode = '22023';
  end if;
  update public.service_order_incidents
     set status = 'resuelta', resolution = btrim(p_resolution), resolved_by = auth.uid(), resolved_at = now()
   where id = i.id
  returning * into i;
  perform private.log_order_event(o.id, 'incidencia_resuelta', i.item_id, null, p_resolution,
                                  jsonb_build_object('incident_id', i.id));
  return i;
end;
$$;

-- Insumos de la organización (admin_socio corporativo; RLS lo aplica).
create function public.upsert_inventory_item(
  p_organization_id uuid,
  p_id uuid,
  p_code text,
  p_name text,
  p_unit text,
  p_unit_cost numeric,
  p_active boolean,
  p_reason text
) returns public.inventory_items
language plpgsql security invoker set search_path = '' as $$
declare
  result public.inventory_items;
begin
  perform private.set_change_reason(p_reason);
  if p_id is null then
    insert into public.inventory_items (organization_id, code, name, unit, unit_cost, active)
    values (p_organization_id, upper(btrim(p_code)), regexp_replace(btrim(p_name), '\s+', ' ', 'g'), p_unit,
            p_unit_cost, coalesce(p_active, true))
    returning * into result;
  else
    update public.inventory_items
       set name = regexp_replace(btrim(p_name), '\s+', ' ', 'g'), unit = p_unit, unit_cost = p_unit_cost,
           active = coalesce(p_active, active)
     where id = p_id and organization_id = p_organization_id
    returning * into result;
    if not found then
      raise exception 'Insumo inexistente o sin permiso' using errcode = '42501';
    end if;
  end if;
  return result;
end;
$$;

-- Consumo estándar de un insumo por unidad del servicio (null = quitarlo).
create function public.set_service_supply_standard(
  p_service_id uuid,
  p_inventory_item_id uuid,
  p_quantity numeric,
  p_reason text
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  org uuid;
begin
  perform private.set_change_reason(p_reason);
  select s.organization_id into org from public.services s where s.id = p_service_id;
  if org is null then
    raise exception 'Servicio inexistente' using errcode = '22023';
  end if;
  if p_quantity is null then
    delete from public.service_supply_standards where service_id = p_service_id and inventory_item_id = p_inventory_item_id;
    return;
  end if;
  insert into public.service_supply_standards (organization_id, service_id, inventory_item_id, quantity)
  values (org, p_service_id, p_inventory_item_id, p_quantity)
  on conflict (service_id, inventory_item_id) do update set quantity = excluded.quantity;
  if not exists (select 1 from public.service_supply_standards
                  where service_id = p_service_id and inventory_item_id = p_inventory_item_id) then
    raise exception 'Sin permiso para configurar insumos' using errcode = '42501';
  end if;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.item_work_transition_allowed(public.item_work_status, public.item_work_status)',
    'private.elapsed_minutes(timestamptz)',
    'private.log_order_event(uuid, text, uuid, uuid, text, jsonb)',
    'private.stop_item_work(uuid, public.item_work_status)',
    'private.can_read_order_evidence(text)',
    'private.can_upload_order_evidence(text)',
    'private.lock_order_for_execution(uuid)',
    'private.add_order_staff(public.service_orders, uuid)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.set_service_order_item_work(uuid, public.item_work_status, uuid, text)',
    'public.set_service_order_staff(uuid, uuid[], text)',
    'public.register_service_order_evidence(uuid, text, text, text, integer, integer, integer, uuid, uuid, text)',
    'public.remove_service_order_evidence(uuid, text)',
    'public.record_service_order_consumption(uuid, uuid, numeric, text)',
    'public.report_service_order_incident(uuid, text, text, uuid)',
    'public.resolve_service_order_incident(uuid, text)',
    'public.upsert_inventory_item(uuid, uuid, text, text, text, numeric, boolean, text)',
    'public.set_service_supply_standard(uuid, uuid, numeric, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
