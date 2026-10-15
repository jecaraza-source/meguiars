-- «Mi día» del técnico / lavador.
--
-- * Rol `tecnico` (migración anterior): sólo ve su centro y su trabajo. Los
--   chequeos genéricos «cualquier rol del centro / de la organización»
--   (has_center_role y has_org_role sin lista) ya no lo incluyen, así que no
--   lee catálogo, costos, indicadores ni clientes.
-- * technicians.profile_id liga un técnico de la agenda con un usuario
--   (link_technician_user, encargado o admin del centro).
-- * RPC my_work_*: security definer con chequeo explícito de asignación. El
--   técnico sólo trabaja OS asignadas a él (técnico de la OS, participante, de
--   una línea o de la cita). Las RPC de ejecución existentes hacen el trabajo,
--   así que las reglas (transiciones, tiempos, bitácora) son las mismas.
-- * Nuevo evento de bitácora `comentario`.
-- * Storage de evidencias: el técnico asignado también sube y ve las fotos.

-- ---------------------------------------------------------------------------
-- 1. Chequeos genéricos sin el técnico
-- ---------------------------------------------------------------------------

create or replace function private.has_center_role(center_id uuid, roles public.app_role[] default null)
returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when roles is null then cardinality(array_remove(private.center_roles(center_id), 'tecnico')) > 0
    else private.center_roles(center_id) && roles
  end;
$$;

create or replace function private.has_org_role(p_organization_id uuid, roles public.app_role[] default null)
returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when roles is null then cardinality(array_remove(private.org_roles(p_organization_id), 'tecnico')) > 0
    else private.org_roles(p_organization_id) && roles
  end;
$$;

-- El técnico es un rol de centro, nunca corporativo.
alter table public.role_assignments
  add constraint role_assignments_not_tecnico check (role <> 'tecnico');

-- Ve su centro y el nombre de su organización (para elegir centro en la app).
create function private.is_center_technician(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(p_detail_center_id, array['tecnico']::public.app_role[]);
$$;

create function private.is_org_technician(p_organization_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.detail_centers c
    where c.organization_id = p_organization_id and private.is_center_technician(c.id)
  );
$$;

drop policy detail_centers_select on public.detail_centers;
create policy detail_centers_select on public.detail_centers
  for select to authenticated using (
    private.has_center_role(id)
    or private.is_center_technician(id)
    or private.has_org_role(organization_id, array['admin_socio']::public.app_role[])
  );

drop policy organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select to authenticated using (private.is_org_member(id) or private.is_org_technician(id));

create or replace function public.set_active_center(p_detail_center_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_detail_center_id is null
     or not (private.has_center_role(p_detail_center_id) or private.is_center_technician(p_detail_center_id)) then
    raise exception 'Centro inexistente, deshabilitado o sin acceso' using errcode = '42501';
  end if;
  update public.profiles set last_detail_center_id = p_detail_center_id where id = auth.uid();
  return p_detail_center_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Técnico ligado a un usuario
-- ---------------------------------------------------------------------------

create unique index technicians_center_profile_key on public.technicians (detail_center_id, profile_id)
  where profile_id is not null;

-- Técnico activo del usuario de la sesión en el centro. Cualquier rol del
-- centro sirve (un recepcionista que también lava usa «Mi día»).
create function private.my_technician_id(p_detail_center_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select t.id from public.technicians t
  where t.detail_center_id = p_detail_center_id
    and t.profile_id = auth.uid()
    and t.active
    and cardinality(private.center_roles(p_detail_center_id)) > 0;
$$;

-- ¿La OS está asignada al técnico de la sesión?
create function private.can_work_on_order(p_order_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.service_orders o
    cross join lateral (select private.my_technician_id(o.detail_center_id) as tid) me
    where o.id = p_order_id
      and me.tid is not null
      and (
        o.technician_id = me.tid
        or exists (select 1 from public.service_order_staff s where s.service_order_id = o.id and s.technician_id = me.tid)
        or exists (select 1 from public.service_order_items i where i.service_order_id = o.id and i.technician_id = me.tid)
        or exists (select 1 from public.appointments a where a.id = o.appointment_id and a.technician_id = me.tid)
      )
  );
$$;

-- Usuarios del centro que se pueden ligar a un técnico (encargado o admin).
create function public.center_technician_users(p_detail_center_id uuid)
returns table (user_id uuid, full_name text, role public.app_role, technician_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_manage_agenda(p_detail_center_id) then
    raise exception 'Sin permiso para administrar técnicos en este centro' using errcode = '42501';
  end if;
  return query
    select m.user_id, p.full_name, m.role, t.id
    from public.user_detail_centers m
    join public.profiles p on p.id = m.user_id and p.active
    left join public.technicians t on t.detail_center_id = m.detail_center_id and t.profile_id = m.user_id
    where m.detail_center_id = p_detail_center_id and m.active
    order by (m.role = 'tecnico') desc, p.full_name;
end;
$$;

-- Liga (o desliga, sin p_user_id) un técnico con un usuario del centro.
create function public.link_technician_user(p_technician_id uuid, p_reason text, p_user_id uuid default null)
returns public.technicians
language plpgsql security definer set search_path = '' as $$
declare
  t public.technicians;
begin
  select * into t from public.technicians where id = p_technician_id for update;
  if not found or not private.can_manage_agenda(t.detail_center_id) then
    raise exception 'Técnico inexistente o sin permiso' using errcode = '42501';
  end if;
  if p_user_id is not null and not exists (
    select 1 from public.user_detail_centers m
    join public.profiles p on p.id = m.user_id and p.active
    where m.detail_center_id = t.detail_center_id and m.user_id = p_user_id and m.active
  ) then
    raise exception 'El usuario no tiene acceso activo a este centro' using errcode = '22023';
  end if;
  if p_user_id is not null and exists (
    select 1 from public.technicians x
    where x.detail_center_id = t.detail_center_id and x.profile_id = p_user_id and x.id <> t.id
  ) then
    raise exception 'Ese usuario ya está ligado a otro técnico del centro' using errcode = '23505';
  end if;
  perform private.set_change_reason(p_reason);
  update public.technicians set profile_id = p_user_id where id = t.id returning * into t;
  return t;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Bitácora: comentarios del técnico
-- ---------------------------------------------------------------------------

do $$
declare
  c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.service_order_events'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%os_inicio%';
  execute format('alter table public.service_order_events drop constraint %I', c);
end $$;
alter table public.service_order_events add constraint service_order_events_kind_check check (kind in (
  'os_inicio', 'os_pausa', 'os_reanudacion', 'os_fin',
  'linea_inicio', 'linea_pausa', 'linea_reanudacion', 'linea_fin',
  'personal', 'evidencia', 'evidencia_eliminada', 'consumo', 'incidencia', 'incidencia_resuelta',
  'comentario'
));

-- ---------------------------------------------------------------------------
-- 4. Storage de evidencias: también el técnico asignado
-- ---------------------------------------------------------------------------

create or replace function private.can_read_order_evidence(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.service_orders o
    where o.id::text = split_part(p_name, '/', 3)
      and o.detail_center_id::text = split_part(p_name, '/', 2)
      and o.organization_id::text = split_part(p_name, '/', 1)
      and (private.can_use_orders(o.detail_center_id) or private.can_work_on_order(o.id))
  );
$$;

create or replace function private.can_upload_order_evidence(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
     and exists (
       select 1 from public.service_orders o
       where o.id::text = split_part(p_name, '/', 3)
         and o.detail_center_id::text = split_part(p_name, '/', 2)
         and o.organization_id::text = split_part(p_name, '/', 1)
         and o.status not in ('cancelada', 'entregada')
         and (private.can_use_orders(o.detail_center_id) or private.can_work_on_order(o.id))
     );
$$;

-- ---------------------------------------------------------------------------
-- 5. «Mi día»
-- ---------------------------------------------------------------------------

-- OS asignada al técnico de la sesión, bloqueada para ejecución.
create function private.my_work_order(p_order_id uuid) returns public.service_orders
language plpgsql security definer set search_path = '' as $$
declare
  o public.service_orders;
begin
  if p_order_id is null or not private.can_work_on_order(p_order_id) then
    raise exception 'Esta orden no está asignada a ti' using errcode = '42501';
  end if;
  select * into o from public.service_orders where id = p_order_id for update;
  if o.status in ('abierta', 'cancelada', 'entregada') then
    raise exception 'Esta orden no está lista para trabajarse' using errcode = '22023';
  end if;
  return o;
end;
$$;

-- Pone la OS en proceso si estaba autorizada o pausada.
create function private.my_work_ensure_running(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.service_orders;
begin
  select * into o from public.service_orders where id = p_order_id;
  if o.status in ('autorizada', 'pausada') then
    perform public.set_service_order_status(o.id, o.version, 'en_proceso', 'Inicio desde Mi día');
  elsif o.status <> 'en_proceso' then
    raise exception 'Esta orden ya está terminada' using errcode = '22023';
  end if;
end;
$$;

create function private.my_work_item(p_item_id uuid) returns public.service_order_items
language plpgsql security definer set search_path = '' as $$
declare
  it public.service_order_items;
begin
  select * into it from public.service_order_items where id = p_item_id and kind = 'servicio';
  if not found then
    raise exception 'Servicio inexistente' using errcode = '42501';
  end if;
  return it;
end;
$$;

-- Asignaciones del día: OS por trabajar (y terminadas ese día) y citas sin OS.
create function public.my_work(p_detail_center_id uuid, p_day date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  tid uuid := private.my_technician_id(p_detail_center_id);
  tz text;
  today date;
  d date;
  orders jsonb;
  appts jsonb;
begin
  if tid is null then
    raise exception 'Tu usuario no está ligado a un técnico de este centro; pide al encargado que lo ligue'
      using errcode = '42501';
  end if;
  select c.timezone into tz from public.detail_centers c where c.id = p_detail_center_id;
  today := (now() at time zone tz)::date;
  d := coalesce(p_day, today);

  select coalesce(jsonb_agg(x.j order by x.sort_at, x.folio), '[]') into orders
  from (
    select coalesce(a.starts_at, o.promised_at, o.created_at) as sort_at, o.folio,
      jsonb_build_object(
        'id', o.id,
        'organization_id', o.organization_id,
        'detail_center_id', o.detail_center_id,
        'folio', o.folio,
        'status', o.status,
        'scheduled_at', coalesce(a.starts_at, o.created_at),
        'promised_at', o.promised_at,
        'bay', b.name,
        'vehicle', jsonb_build_object('make', v.make, 'model', v.model, 'year', v.year, 'plate', v.plate),
        'observations', o.observations,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'id', i.id, 'name', i.service_name, 'quantity', i.quantity, 'status', i.work_status,
                   'mine', i.technician_id is not distinct from tid, 'started_at', i.started_at,
                   'finished_at', i.finished_at)
                 order by i.position, i.created_at)
          from public.service_order_items i where i.service_order_id = o.id and i.kind = 'servicio'), '[]'),
        'evidence', coalesce((
          select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'path', e.storage_path,
                                              'item_id', e.item_id, 'at', e.created_at)
                 order by e.created_at)
          from public.service_order_evidence e where e.service_order_id = o.id and e.deleted_at is null), '[]'),
        'comments', coalesce((
          select jsonb_agg(jsonb_build_object('note', ev.note, 'item_id', ev.item_id, 'at', ev.occurred_at,
                                              'by', p.full_name)
                 order by ev.occurred_at)
          from public.service_order_events ev
          left join public.profiles p on p.id = ev.actor_id
          where ev.service_order_id = o.id and ev.kind = 'comentario'), '[]'),
        'open_problems', (select count(*) from public.service_order_incidents n
                           where n.service_order_id = o.id and n.status = 'abierta')
      ) as j
    from public.service_orders o
    join public.vehicles v on v.id = o.vehicle_id
    left join public.appointments a on a.id = o.appointment_id
    left join public.bays b on b.id = o.bay_id
    where o.detail_center_id = p_detail_center_id
      and private.can_work_on_order(o.id)
      and (
        (o.status in ('autorizada', 'en_proceso', 'pausada')
          and case when d <= today
                   then (coalesce(a.starts_at, o.promised_at, o.created_at) at time zone tz)::date <= d
                   else (coalesce(a.starts_at, o.promised_at, o.created_at) at time zone tz)::date = d end)
        or (o.status in ('terminada', 'entregada') and (o.finished_at at time zone tz)::date = d)
      )
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id,
           'starts_at', a.starts_at,
           'ends_at', a.ends_at,
           'status', a.status,
           'bay', b.name,
           'vehicle', jsonb_build_object('make', v.make, 'model', v.model, 'year', v.year, 'plate', v.plate),
           'services', coalesce((
             select jsonb_agg(s.name order by x.position)
             from public.appointment_services x join public.services s on s.id = x.service_id
             where x.appointment_id = a.id), '[]'),
           'notes', a.notes)
         order by a.starts_at), '[]') into appts
  from public.appointments a
  join public.vehicles v on v.id = a.vehicle_id
  left join public.bays b on b.id = a.bay_id
  where a.detail_center_id = p_detail_center_id
    and a.technician_id = tid
    and a.service_order_id is null
    and a.status in ('programada', 'recibida')
    and (a.starts_at at time zone tz)::date = d;

  return jsonb_build_object('day', d, 'today', today, 'technician_id', tid, 'orders', orders,
                            'appointments', appts);
end;
$$;

-- Empezar un servicio (inicia la OS si hace falta).
create function public.my_work_start(p_item_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  it public.service_order_items := private.my_work_item(p_item_id);
  o public.service_orders := private.my_work_order(it.service_order_id);
  tid uuid := private.my_technician_id(o.detail_center_id);
begin
  if it.work_status = 'terminada' then
    raise exception 'Este servicio ya está terminado' using errcode = '22023';
  end if;
  perform private.my_work_ensure_running(o.id);
  if it.work_status <> 'en_proceso' then
    perform public.set_service_order_item_work(it.id, 'en_proceso', tid, null);
  end if;
  select * into o from public.service_orders where id = o.id;
  return jsonb_build_object('item_status', 'en_proceso', 'order_status', o.status);
end;
$$;

-- «Trabajo realizado»: termina el servicio (lo inicia si no se había iniciado)
-- y, si era el último pendiente, termina la OS.
create function public.my_work_done(p_item_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  it public.service_order_items := private.my_work_item(p_item_id);
  o public.service_orders := private.my_work_order(it.service_order_id);
  tid uuid := private.my_technician_id(o.detail_center_id);
  note text := nullif(btrim(p_note), '');
begin
  if note is not null and length(note) > 1000 then
    raise exception 'El comentario admite hasta 1000 caracteres' using errcode = '22023';
  end if;
  if it.work_status = 'terminada' then
    return jsonb_build_object('item_status', 'terminada', 'order_status', o.status, 'order_finished',
                              o.status = 'terminada');
  end if;
  perform private.my_work_ensure_running(o.id);
  if it.work_status = 'pendiente' then
    perform public.set_service_order_item_work(it.id, 'en_proceso', tid, null);
  end if;
  perform public.set_service_order_item_work(it.id, 'terminada', tid, coalesce(note, 'Trabajo realizado'));
  if not exists (select 1 from public.service_order_items i
                  where i.service_order_id = o.id and i.kind = 'servicio' and i.work_status <> 'terminada') then
    select * into o from public.service_orders where id = o.id;
    perform public.set_service_order_status(o.id, o.version, 'terminada', 'Trabajo terminado desde Mi día');
  end if;
  select * into o from public.service_orders where id = o.id;
  return jsonb_build_object('item_status', 'terminada', 'order_status', o.status, 'order_finished',
                            o.status = 'terminada');
end;
$$;

-- Comentario en la OS (o en uno de sus servicios).
create function public.my_work_note(p_order_id uuid, p_note text, p_item_id uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.service_orders := private.my_work_order(p_order_id);
  note text := btrim(coalesce(p_note, ''));
begin
  if length(note) not between 1 and 1000 then
    raise exception 'Escribe un comentario (hasta 1000 caracteres)' using errcode = '22023';
  end if;
  if p_item_id is not null and not exists (
    select 1 from public.service_order_items i where i.id = p_item_id and i.service_order_id = o.id) then
    raise exception 'El servicio no es de esta orden' using errcode = '22023';
  end if;
  perform private.log_order_event(o.id, 'comentario', p_item_id, private.my_technician_id(o.detail_center_id), note);
end;
$$;

-- Foto ya subida a Storage (antes, durante, después o de un problema).
create function public.my_work_register_evidence(
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
language plpgsql security definer set search_path = '' as $$
declare
  o public.service_orders := private.my_work_order(p_order_id);
begin
  if p_kind not in ('antes', 'durante', 'despues', 'incidencia') then
    raise exception 'Tipo de foto inválido' using errcode = '22023';
  end if;
  return public.register_service_order_evidence(o.id, p_storage_path, p_kind, p_content_type, p_size_bytes,
                                                p_width, p_height, p_item_id, p_incident_id, p_note);
end;
$$;

-- Reportar un problema (rayón previo, pieza dañada, falta de insumo…).
create function public.my_work_report_problem(p_order_id uuid, p_description text, p_item_id uuid default null)
returns public.service_order_incidents
language plpgsql security definer set search_path = '' as $$
declare
  o public.service_orders := private.my_work_order(p_order_id);
begin
  if p_item_id is not null and not exists (
    select 1 from public.service_order_items i where i.id = p_item_id and i.service_order_id = o.id) then
    raise exception 'El servicio no es de esta orden' using errcode = '22023';
  end if;
  return public.report_service_order_incident(o.id, 'incidencia', p_description, p_item_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Privilegios
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.my_work_order(uuid)', 'private.my_work_ensure_running(uuid)', 'private.my_work_item(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
  foreach fn in array array[
    'private.is_center_technician(uuid)', 'private.is_org_technician(uuid)', 'private.my_technician_id(uuid)',
    'private.can_work_on_order(uuid)',
    'public.center_technician_users(uuid)',
    'public.link_technician_user(uuid, text, uuid)',
    'public.my_work(uuid, date)',
    'public.my_work_start(uuid)',
    'public.my_work_done(uuid, text)',
    'public.my_work_note(uuid, text, uuid)',
    'public.my_work_register_evidence(uuid, text, text, text, integer, integer, integer, uuid, uuid, text)',
    'public.my_work_report_problem(uuid, text, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
