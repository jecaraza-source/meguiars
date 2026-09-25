-- O3 — Operación / Agenda, bahías y capacidad.
--
-- * bays y technicians: recursos de cada centro (los técnicos son una
--   referencia simple; no necesitan cuenta en la app).
-- * appointments: citas y walk-ins del centro, con cliente, vehículo,
--   servicios del catálogo, hora (UTC), duración estimada, bahía y técnico
--   opcionales, notas y estatus.
-- * Capacidad: exclusion constraints impiden encimar citas activas en la misma
--   bahía o con el mismo técnico. Sólo un encargado/admin puede autorizar un
--   override, con motivo y auditoría.
-- * Estatus con transiciones válidas (espejo en packages/domain/src/agenda).
-- * Vínculo con la OS: appointment_order_draft() arma el borrador (cliente,
--   vehículo y servicios con precio congelado) y service_order_id queda para
--   el módulo de Órdenes de Servicio.
--
-- Escrituras sólo por RPC con motivo y auditoría. Compatible hacia atrás.

create extension if not exists btree_gist with schema extensions;

create type public.appointment_status as enum
  ('programada', 'recibida', 'en_servicio', 'terminada', 'entregada', 'cancelada', 'no_show');

-- ---------------------------------------------------------------------------
-- 1. Recursos del centro
-- ---------------------------------------------------------------------------

create table public.bays (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (detail_center_id, id),
  unique (detail_center_id, name),
  foreign key (organization_id, detail_center_id)
    references public.detail_centers (organization_id, id) on delete restrict
);

create table public.technicians (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  full_name text not null check (length(btrim(full_name)) between 2 and 120),
  -- Opcional: si el técnico también usa la app.
  profile_id uuid references public.profiles (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (detail_center_id, id),
  foreign key (organization_id, detail_center_id)
    references public.detail_centers (organization_id, id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- 2. Citas
-- ---------------------------------------------------------------------------

-- FK compuesta (organización, vehículo): una cita no apunta a vehículos de otra organización.
alter table public.vehicles add constraint vehicles_org_id_key unique (organization_id, id);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  detail_center_id uuid not null,
  client_id uuid not null,
  vehicle_id uuid not null,
  starts_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 5 and 1440),
  -- Calculado por trigger (starts_at + duración); base de las reglas de conflicto.
  ends_at timestamptz not null,
  bay_id uuid,
  technician_id uuid,
  notes text check (notes is null or length(notes) <= 2000),
  status public.appointment_status not null default 'programada',
  is_walk_in boolean not null default false,
  -- Override autorizado de conflicto de bahía/técnico (motivo en audit_log).
  conflict_override boolean not null default false,
  received_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  -- Vínculo con la Orden de Servicio (el FK se agrega en su módulo).
  service_order_id uuid unique,
  request_id uuid not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, request_id),
  foreign key (organization_id, detail_center_id)
    references public.detail_centers (organization_id, id) on delete restrict,
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete restrict,
  foreign key (organization_id, vehicle_id) references public.vehicles (organization_id, id) on delete restrict,
  foreign key (detail_center_id, bay_id) references public.bays (detail_center_id, id) on delete restrict,
  foreign key (detail_center_id, technician_id) references public.technicians (detail_center_id, id) on delete restrict,
  -- Una bahía o un técnico no atienden dos citas activas a la vez (salvo override autorizado).
  constraint appointments_bay_no_overlap exclude using gist (
    bay_id extensions.gist_uuid_ops with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (bay_id is not null and not conflict_override and status in ('programada', 'recibida', 'en_servicio')),
  constraint appointments_technician_no_overlap exclude using gist (
    technician_id extensions.gist_uuid_ops with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (technician_id is not null and not conflict_override and status in ('programada', 'recibida', 'en_servicio'))
);

create table public.appointment_services (
  appointment_id uuid not null,
  service_id uuid not null,
  organization_id uuid not null,
  position smallint not null default 0,
  -- Duración estándar del servicio al agendar (referencia; el precio lo congela la OS).
  duration_minutes integer not null,
  created_at timestamptz not null default now(),
  primary key (appointment_id, service_id),
  foreign key (organization_id, appointment_id) references public.appointments (organization_id, id) on delete cascade,
  foreign key (organization_id, service_id) references public.services (organization_id, id) on delete restrict
);

-- Agenda del día por centro (y filtros por bahía/técnico/estatus).
create index appointments_center_day_idx on public.appointments (detail_center_id, starts_at);
create index appointments_center_status_idx on public.appointments (detail_center_id, status);
create index appointments_client_idx on public.appointments (client_id);
create index appointment_services_service_idx on public.appointment_services (service_id);
create index bays_center_idx on public.bays (detail_center_id, active);
create index technicians_center_idx on public.technicians (detail_center_id, active);

create function private.set_appointment_end() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.ends_at := new.starts_at + make_interval(mins => new.duration_minutes);
  return new;
end;
$$;
create trigger appointments_set_end before insert or update of starts_at, duration_minutes on public.appointments
  for each row execute function private.set_appointment_end();

create trigger bays_updated_at before update on public.bays
  for each row execute function private.set_updated_at();
create trigger technicians_updated_at before update on public.technicians
  for each row execute function private.set_updated_at();
create trigger appointments_updated_at before update on public.appointments
  for each row execute function private.set_updated_at();

create trigger bays_require_reason before insert or update or delete on public.bays
  for each row execute function private.require_change_reason();
create trigger technicians_require_reason before insert or update or delete on public.technicians
  for each row execute function private.require_change_reason();
create trigger appointments_require_reason before insert or update or delete on public.appointments
  for each row execute function private.require_change_reason();
create trigger appointment_services_require_reason before insert or update or delete on public.appointment_services
  for each row execute function private.require_change_reason();

create trigger bays_audit after insert or update or delete on public.bays
  for each row execute function private.audit_row();
create trigger technicians_audit after insert or update or delete on public.technicians
  for each row execute function private.audit_row();
create trigger appointments_audit after insert or update or delete on public.appointments
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- 3. Autorización (espejo de agenda.read / agenda.write / agenda.manage)
-- ---------------------------------------------------------------------------

create function private.can_use_agenda(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(
    p_detail_center_id, array['admin_socio', 'encargado', 'operador_recepcion']::public.app_role[]
  );
$$;

-- Recursos (bahías, técnicos) y override de conflictos.
create function private.can_manage_agenda(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(p_detail_center_id, array['admin_socio', 'encargado']::public.app_role[]);
$$;

-- Transiciones válidas (espejo de APPOINTMENT_TRANSITIONS en el dominio).
create function private.appointment_transition_allowed(
  p_from public.appointment_status,
  p_to public.appointment_status
) returns boolean
language sql immutable set search_path = '' as $$
  select (p_from, p_to) in (
    ('programada'::public.appointment_status, 'recibida'::public.appointment_status),
    ('programada', 'cancelada'),
    ('programada', 'no_show'),
    ('recibida', 'en_servicio'),
    ('recibida', 'cancelada'),
    ('en_servicio', 'terminada'),
    ('terminada', 'entregada')
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

alter table public.bays enable row level security;
alter table public.technicians enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_services enable row level security;

create policy bays_select on public.bays for select to authenticated using (private.can_use_agenda(detail_center_id));
create policy bays_insert on public.bays for insert to authenticated with check (private.can_manage_agenda(detail_center_id));
create policy bays_update on public.bays for update to authenticated
  using (private.can_manage_agenda(detail_center_id)) with check (private.can_manage_agenda(detail_center_id));

create policy technicians_select on public.technicians
  for select to authenticated using (private.can_use_agenda(detail_center_id));
create policy technicians_insert on public.technicians
  for insert to authenticated with check (private.can_manage_agenda(detail_center_id));
create policy technicians_update on public.technicians for update to authenticated
  using (private.can_manage_agenda(detail_center_id)) with check (private.can_manage_agenda(detail_center_id));

create policy appointments_select on public.appointments
  for select to authenticated using (private.can_use_agenda(detail_center_id));
create policy appointments_insert on public.appointments
  for insert to authenticated with check (private.can_use_agenda(detail_center_id));
create policy appointments_update on public.appointments for update to authenticated
  using (private.can_use_agenda(detail_center_id)) with check (private.can_use_agenda(detail_center_id));

create policy appointment_services_select on public.appointment_services
  for select to authenticated using (
    exists (select 1 from public.appointments a where a.id = appointment_id)
  );
create policy appointment_services_insert on public.appointment_services
  for insert to authenticated with check (
    exists (select 1 from public.appointments a where a.id = appointment_id)
  );
create policy appointment_services_delete on public.appointment_services
  for delete to authenticated using (
    exists (select 1 from public.appointments a where a.id = appointment_id)
  );

revoke all on public.bays, public.technicians, public.appointments, public.appointment_services from anon;
revoke delete, truncate on public.bays, public.technicians, public.appointments from authenticated;
revoke update, truncate on public.appointment_services from authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC
-- ---------------------------------------------------------------------------

create function public.upsert_bay(p_detail_center_id uuid, p_id uuid, p_name text, p_active boolean, p_reason text)
returns public.bays
language plpgsql security invoker set search_path = '' as $$
declare
  result public.bays;
begin
  perform private.set_change_reason(p_reason);
  if p_id is null then
    insert into public.bays (organization_id, detail_center_id, name, active)
    select c.organization_id, c.id, btrim(p_name), coalesce(p_active, true)
    from public.detail_centers c where c.id = p_detail_center_id
    returning * into result;
  else
    update public.bays set name = btrim(p_name), active = coalesce(p_active, active)
     where id = p_id and detail_center_id = p_detail_center_id
    returning * into result;
  end if;
  if result.id is null then
    raise exception 'Bahía inexistente o sin permiso' using errcode = '42501';
  end if;
  return result;
end;
$$;

create function public.upsert_technician(
  p_detail_center_id uuid, p_id uuid, p_full_name text, p_active boolean, p_reason text
) returns public.technicians
language plpgsql security invoker set search_path = '' as $$
declare
  result public.technicians;
begin
  perform private.set_change_reason(p_reason);
  if p_id is null then
    insert into public.technicians (organization_id, detail_center_id, full_name, active)
    select c.organization_id, c.id, regexp_replace(btrim(p_full_name), '\s+', ' ', 'g'), coalesce(p_active, true)
    from public.detail_centers c where c.id = p_detail_center_id
    returning * into result;
  else
    update public.technicians
       set full_name = regexp_replace(btrim(p_full_name), '\s+', ' ', 'g'), active = coalesce(p_active, active)
     where id = p_id and detail_center_id = p_detail_center_id
    returning * into result;
  end if;
  if result.id is null then
    raise exception 'Técnico inexistente o sin permiso' using errcode = '42501';
  end if;
  return result;
end;
$$;

-- Valida recursos, cliente/vehículo y servicios de una cita. Security invoker:
-- todo se lee bajo RLS del usuario.
create function private.check_appointment_refs(
  p_detail_center_id uuid, p_client_id uuid, p_vehicle_id uuid, p_service_ids uuid[],
  p_bay_id uuid, p_technician_id uuid
) returns void
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.clients c where c.id = p_client_id and c.active) then
    raise exception 'Cliente inexistente o no visible desde tus centros' using errcode = '22023';
  end if;
  if not exists (select 1 from public.vehicles v where v.id = p_vehicle_id and v.client_id = p_client_id and v.active) then
    raise exception 'El vehículo no pertenece al cliente o está dado de baja' using errcode = '22023';
  end if;
  if p_bay_id is not null and not exists (
    select 1 from public.bays b where b.id = p_bay_id and b.detail_center_id = p_detail_center_id and b.active) then
    raise exception 'Bahía inexistente o inactiva en este centro' using errcode = '22023';
  end if;
  if p_technician_id is not null and not exists (
    select 1 from public.technicians t where t.id = p_technician_id and t.detail_center_id = p_detail_center_id and t.active) then
    raise exception 'Técnico inexistente o inactivo en este centro' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_service_ids), 0) = 0 then
    raise exception 'Elige al menos un servicio' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_service_ids) sid
    where not exists (
      select 1 from public.center_catalog(p_detail_center_id) cat where cat.id = sid
    )
  ) then
    raise exception 'Algún servicio no está disponible en este centro' using errcode = '22023';
  end if;
end;
$$;

create function private.set_appointment_services(p_appointment_id uuid, p_organization_id uuid, p_service_ids uuid[])
returns integer
language plpgsql set search_path = '' as $$
declare
  total integer;
begin
  delete from public.appointment_services where appointment_id = p_appointment_id;
  insert into public.appointment_services (appointment_id, service_id, organization_id, position, duration_minutes)
  select p_appointment_id, s.id, p_organization_id, (x.ord - 1)::smallint, s.standard_duration_minutes
  from unnest(p_service_ids) with ordinality x(sid, ord)
  join public.services s on s.id = x.sid;
  select coalesce(sum(duration_minutes), 0) into total from public.appointment_services where appointment_id = p_appointment_id;
  return total;
end;
$$;

-- Alta de cita o walk-in. Idempotente por request_id. p_override_reason
-- autoriza encimar bahía/técnico (sólo encargado/admin).
create function public.create_appointment(
  p_detail_center_id uuid,
  p_request_id uuid,
  p_client_id uuid,
  p_vehicle_id uuid,
  p_service_ids uuid[],
  p_starts_at timestamptz,
  p_duration_minutes integer default null,
  p_bay_id uuid default null,
  p_technician_id uuid default null,
  p_notes text default null,
  p_walk_in boolean default false,
  p_override_reason text default null
) returns public.appointments
language plpgsql security invoker set search_path = '' as $$
declare
  org uuid;
  new_id uuid := gen_random_uuid();
  total integer;
  walk_in boolean := coalesce(p_walk_in, false);
  result public.appointments;
begin
  if not private.can_use_agenda(p_detail_center_id) then
    raise exception 'Sin permiso para agendar en este centro' using errcode = '42501';
  end if;
  select c.organization_id into org from public.detail_centers c where c.id = p_detail_center_id;
  select * into result from public.appointments where organization_id = org and request_id = p_request_id;
  if found then
    return result;
  end if;
  if p_override_reason is not null and not private.can_manage_agenda(p_detail_center_id) then
    raise exception 'Sólo el encargado o el admin autorizan encimar una bahía o técnico' using errcode = '42501';
  end if;
  perform private.check_appointment_refs(p_detail_center_id, p_client_id, p_vehicle_id, p_service_ids,
                                         p_bay_id, p_technician_id);
  perform private.set_change_reason(coalesce(p_override_reason, case when walk_in then 'Walk-in' else 'Cita agendada' end));

  -- El cliente queda vinculado al centro donde se atiende (visibilidad, O1).
  insert into public.client_centers (client_id, detail_center_id, organization_id)
  values (p_client_id, p_detail_center_id, org)
  on conflict (client_id, detail_center_id) do nothing;

  -- Duración: la indicada o la suma de las duraciones estándar del catálogo.
  select least(coalesce(p_duration_minutes, nullif(sum(s.standard_duration_minutes), 0), 30), 1440)::integer
    into total
    from public.services s where s.id = any (p_service_ids);
  begin
    insert into public.appointments (
      id, organization_id, detail_center_id, client_id, vehicle_id, starts_at, duration_minutes, bay_id,
      technician_id, notes, status, is_walk_in, received_at, request_id
    ) values (
      new_id, org, p_detail_center_id, p_client_id, p_vehicle_id,
      case when walk_in then coalesce(p_starts_at, now()) else p_starts_at end,
      total, p_bay_id, p_technician_id, nullif(btrim(p_notes), ''),
      case when walk_in then 'recibida'::public.appointment_status else 'programada' end,
      walk_in, case when walk_in then now() end, p_request_id
    );
  exception when exclusion_violation then
    -- Bahía o técnico ocupados: sólo continúa con override autorizado.
    if p_override_reason is null then
      raise exception 'La bahía o el técnico ya están ocupados en ese horario' using errcode = '23P01';
    end if;
    insert into public.appointments (
      id, organization_id, detail_center_id, client_id, vehicle_id, starts_at, duration_minutes, bay_id,
      technician_id, notes, status, is_walk_in, conflict_override, received_at, request_id
    ) values (
      new_id, org, p_detail_center_id, p_client_id, p_vehicle_id,
      case when walk_in then coalesce(p_starts_at, now()) else p_starts_at end,
      total, p_bay_id, p_technician_id, nullif(btrim(p_notes), ''),
      case when walk_in then 'recibida'::public.appointment_status else 'programada' end,
      walk_in, true, case when walk_in then now() end, p_request_id
    );
  end;
  perform private.set_appointment_services(new_id, org, p_service_ids);
  if walk_in then
    perform private.register_client_visit(p_client_id, p_detail_center_id, now());
  end if;
  if exists (select 1 from public.appointments where id = new_id and conflict_override) then
    perform private.log_event(org, p_detail_center_id, 'appointment.conflict_override', 'public.appointments',
                              new_id::text, jsonb_build_object('bay_id', p_bay_id, 'technician_id', p_technician_id));
  end if;
  select * into result from public.appointments where id = new_id;
  return result;
end;
$$;

-- Reprogramar o reasignar (sólo citas programadas o recibidas), con motivo.
create function public.update_appointment(
  p_id uuid,
  p_service_ids uuid[],
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_bay_id uuid,
  p_technician_id uuid,
  p_notes text,
  p_reason text,
  p_override_reason text default null
) returns public.appointments
language plpgsql security invoker set search_path = '' as $$
declare
  current_row public.appointments;
  result public.appointments;
begin
  perform private.set_change_reason(p_reason);
  if p_override_reason is not null then
    perform private.set_change_reason(p_override_reason);
    perform set_config('app.change_reason', btrim(p_reason) || ' · Override: ' || btrim(p_override_reason), true);
  end if;
  select * into current_row from public.appointments where id = p_id;
  if not found then
    raise exception 'Cita inexistente o sin permiso' using errcode = '42501';
  end if;
  if current_row.status not in ('programada', 'recibida') then
    raise exception 'Sólo se reprograman citas programadas o recibidas' using errcode = '22023';
  end if;
  if p_override_reason is not null and not private.can_manage_agenda(current_row.detail_center_id) then
    raise exception 'Sólo el encargado o el admin autorizan encimar una bahía o técnico' using errcode = '42501';
  end if;
  perform private.check_appointment_refs(current_row.detail_center_id, current_row.client_id, current_row.vehicle_id,
                                         p_service_ids, p_bay_id, p_technician_id);
  begin
    update public.appointments
       set starts_at = p_starts_at, duration_minutes = p_duration_minutes, bay_id = p_bay_id,
           technician_id = p_technician_id, notes = nullif(btrim(p_notes), ''), conflict_override = false
     where id = p_id;
  exception when exclusion_violation then
    if p_override_reason is null then
      raise exception 'La bahía o el técnico ya están ocupados en ese horario' using errcode = '23P01';
    end if;
    update public.appointments
       set starts_at = p_starts_at, duration_minutes = p_duration_minutes, bay_id = p_bay_id,
           technician_id = p_technician_id, notes = nullif(btrim(p_notes), ''), conflict_override = true
     where id = p_id;
  end;
  perform private.set_appointment_services(p_id, current_row.organization_id, p_service_ids);
  if exists (select 1 from public.appointments where id = p_id and conflict_override) then
    perform private.log_event(current_row.organization_id, current_row.detail_center_id,
                              'appointment.conflict_override', 'public.appointments', p_id::text,
                              jsonb_build_object('bay_id', p_bay_id, 'technician_id', p_technician_id));
  end if;
  select * into result from public.appointments where id = p_id;
  return result;
end;
$$;

-- Cambio de estatus con transiciones válidas. Cancelar y no_show exigen motivo.
create function public.set_appointment_status(p_id uuid, p_status public.appointment_status, p_reason text default null)
returns public.appointments
language plpgsql security invoker set search_path = '' as $$
declare
  current_row public.appointments;
  result public.appointments;
begin
  select * into current_row from public.appointments where id = p_id;
  if not found then
    raise exception 'Cita inexistente o sin permiso' using errcode = '42501';
  end if;
  if not private.appointment_transition_allowed(current_row.status, p_status) then
    raise exception 'Transición no permitida: % → %', current_row.status, p_status using errcode = '22023';
  end if;
  if p_status in ('cancelada', 'no_show') then
    perform private.set_change_reason(p_reason);
  else
    perform private.set_change_reason(coalesce(nullif(btrim(p_reason), ''), 'Estatus: ' || p_status::text));
  end if;
  update public.appointments
     set status = p_status,
         received_at = case when p_status = 'recibida' then now() else received_at end,
         started_at = case when p_status = 'en_servicio' then now() else started_at end,
         finished_at = case when p_status = 'terminada' then now() else finished_at end,
         delivered_at = case when p_status = 'entregada' then now() else delivered_at end,
         cancelled_at = case when p_status in ('cancelada', 'no_show') then now() else cancelled_at end
   where id = p_id
  returning * into result;
  if p_status = 'recibida' then
    perform private.register_client_visit(result.client_id, result.detail_center_id, result.received_at);
  end if;
  return result;
end;
$$;

-- Agenda de un día en la zona horaria del centro, con filtros.
create function public.list_appointments(
  p_detail_center_id uuid,
  p_day date,
  p_status public.appointment_status default null,
  p_bay_id uuid default null,
  p_technician_id uuid default null
)
returns table (
  id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  duration_minutes integer,
  status public.appointment_status,
  is_walk_in boolean,
  conflict_override boolean,
  client_id uuid,
  client_name text,
  client_phone text,
  vehicle_id uuid,
  vehicle_label text,
  bay_id uuid,
  bay_name text,
  technician_id uuid,
  technician_name text,
  services text[],
  notes text,
  service_order_id uuid
)
language sql stable security invoker set search_path = '' as $$
  with bounds as (
    select (p_day::timestamp at time zone dc.timezone) as day_start,
           ((p_day + 1)::timestamp at time zone dc.timezone) as day_end
    from public.detail_centers dc where dc.id = p_detail_center_id
  )
  select a.id, a.starts_at, a.ends_at, a.duration_minutes, a.status, a.is_walk_in, a.conflict_override,
         a.client_id, c.full_name, c.phone,
         a.vehicle_id, v.make || ' ' || v.model || ' ' || v.year || ' · ' || v.plate,
         a.bay_id, b.name, a.technician_id, t.full_name,
         coalesce((select array_agg(s.name order by aps.position)
                     from public.appointment_services aps join public.services s on s.id = aps.service_id
                    where aps.appointment_id = a.id), '{}'),
         a.notes, a.service_order_id
  from public.appointments a
  cross join bounds
  left join public.clients c on c.id = a.client_id
  left join public.vehicles v on v.id = a.vehicle_id
  left join public.bays b on b.id = a.bay_id
  left join public.technicians t on t.id = a.technician_id
  where a.detail_center_id = p_detail_center_id
    and a.starts_at >= bounds.day_start and a.starts_at < bounds.day_end
    and (p_status is null or a.status = p_status)
    and (p_bay_id is null or a.bay_id = p_bay_id)
    and (p_technician_id is null or a.technician_id = p_technician_id)
  order by a.starts_at, b.name nulls last;
$$;

-- Borrador de OS a partir de la cita: cliente y vehículo de la cita y
-- servicios con el precio vigente del centro (a congelar en la OS). Así la
-- recepción no recaptura nada.
create function public.appointment_order_draft(p_appointment_id uuid)
returns table (
  appointment_id uuid,
  detail_center_id uuid,
  client_id uuid,
  vehicle_id uuid,
  service_id uuid,
  service_code text,
  service_name text,
  revenue_engine public.revenue_engine,
  unit_price numeric,
  unit_direct_cost numeric,
  duration_minutes integer
)
language sql stable security invoker set search_path = '' as $$
  select a.id, a.detail_center_id, a.client_id, a.vehicle_id,
         cat.id, cat.code, cat.name, cat.revenue_engine, cat.price, cat.direct_cost, cat.standard_duration_minutes
  from public.appointments a
  join public.appointment_services aps on aps.appointment_id = a.id
  join public.center_catalog(a.detail_center_id, null, true) cat on cat.id = aps.service_id
  where a.id = p_appointment_id
  order by aps.position;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.can_use_agenda(uuid)',
    'private.can_manage_agenda(uuid)',
    'private.appointment_transition_allowed(public.appointment_status, public.appointment_status)',
    'private.check_appointment_refs(uuid, uuid, uuid, uuid[], uuid, uuid)',
    'private.set_appointment_services(uuid, uuid, uuid[])'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.upsert_bay(uuid, uuid, text, boolean, text)',
    'public.upsert_technician(uuid, uuid, text, boolean, text)',
    'public.create_appointment(uuid, uuid, uuid, uuid, uuid[], timestamptz, integer, uuid, uuid, text, boolean, text)',
    'public.update_appointment(uuid, uuid[], timestamptz, integer, uuid, uuid, text, text, text)',
    'public.set_appointment_status(uuid, public.appointment_status, text)',
    'public.list_appointments(uuid, date, public.appointment_status, uuid, uuid)',
    'public.appointment_order_draft(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
