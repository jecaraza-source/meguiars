-- C2 (complemento) — Generación diaria de seguimientos del CRM.
--
-- * private.generate_crm_tasks_for_center: la lógica de generate_crm_tasks sin
--   el chequeo de permisos (renovaciones de membresía y próximas visitas; misma
--   deduplicación por llave, así que correrla varias veces no duplica).
-- * public.generate_crm_tasks: igual que antes (botón "Generar pendientes"),
--   ahora delega en la función privada tras validar el permiso.
-- * private.generate_crm_tasks_all: todos los centros activos. Sólo la ejecuta
--   el sistema (pg_cron), nunca un usuario.
-- * Tarea de pg_cron "crm-generar-pendientes" diaria a las 13:00 UTC (07:00 en
--   Ciudad de México y Monterrey). Si pg_cron no está disponible (Postgres local
--   de pruebas) no se programa; la función sigue disponible.

create function private.generate_crm_tasks_for_center(p_detail_center_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  today date;
  created integer := 0;
  r record;
begin
  today := private.center_today(p_detail_center_id);
  for r in
    select m.* from public.memberships m
     where m.detail_center_id = p_detail_center_id and m.state = 'activa'
       and private.membership_status(m.state, m.ends_on, m.renewal_notice_days, today) in ('proxima_a_vencer', 'vencida')
       and m.ends_on >= today - 30
  loop
    if private.enqueue_crm_task(r.organization_id, r.detail_center_id, r.client_id, r.vehicle_id, 'renovar',
         today, 'membresia', 'mem:' || r.id || ':' || r.ends_on,
         'Membresía ' || r.number || ' vence el ' || to_char(r.ends_on, 'DD/MM/YYYY'), null, r.id, null) then
      created := created + 1;
    end if;
  end loop;
  for r in
    select distinct on (o.client_id) o.* from public.service_orders o
     where o.detail_center_id = p_detail_center_id and o.status <> 'cancelada' and o.next_visit_on is not null
     order by o.client_id, coalesce(o.finished_at, o.created_at) desc, o.folio_number desc
  loop
    if r.next_visit_on between today - 30 and today + private.crm_rule('due_soon_days')
       and private.enqueue_crm_task(r.organization_id, r.detail_center_id, r.client_id, r.vehicle_id,
             'ofrecer_mantenimiento', greatest(today, r.next_visit_on - private.crm_rule('task_lead_days')),
             'proxima_visita', 'os:' || r.id, r.next_visit_notes, r.id, null, r.next_visit_service_id) then
      created := created + 1;
    end if;
  end loop;
  return created;
end;
$$;

create or replace function public.generate_crm_tasks(p_detail_center_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_use_crm(p_detail_center_id) then
    raise exception 'Sin permiso para el CRM de este centro' using errcode = '42501';
  end if;
  return private.generate_crm_tasks_for_center(p_detail_center_id);
end;
$$;

-- Todos los centros activos; devuelve el total de seguimientos creados.
create function private.generate_crm_tasks_all() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  total integer := 0;
begin
  for c in select d.id from public.detail_centers d where d.active order by d.id loop
    total := total + private.generate_crm_tasks_for_center(c.id);
  end loop;
  return total;
end;
$$;

-- Sólo el sistema: ningún rol de la API ejecuta las funciones sin chequeo.
revoke all on function private.generate_crm_tasks_for_center(uuid) from public, anon, authenticated;
revoke all on function private.generate_crm_tasks_all() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron no está disponible: la generación diaria no se programa en esta base';
    return;
  end if;
  create extension if not exists pg_cron with schema pg_catalog;
  if exists (select 1 from cron.job where jobname = 'crm-generar-pendientes') then
    perform cron.unschedule('crm-generar-pendientes');
  end if;
  perform cron.schedule('crm-generar-pendientes', '0 13 * * *', 'select private.generate_crm_tasks_all()');
end $$;
