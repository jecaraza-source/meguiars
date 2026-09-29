-- O6 — Operación del día: resumen del centro activo en una sola lectura.
-- Día = fecha del centro (private.center_today). Cada bloque respeta su permiso:
-- órdenes (can_use_orders), agenda (can_use_agenda) y cobros (can_read_payments);
-- si falta, el bloque viene en null. Sólo lectura.
create function public.center_day_summary(p_detail_center_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  tz text;
  day date;
  day_from timestamptz;
  day_to timestamptz;
  orders jsonb;
  agenda jsonb;
  payments jsonb;
begin
  select c.timezone into tz from public.detail_centers c where c.id = p_detail_center_id;
  if tz is null or not private.has_center_role(p_detail_center_id) then
    raise exception 'Centro inexistente o sin acceso' using errcode = '42501';
  end if;
  day := private.center_today(p_detail_center_id);
  day_from := day::timestamp at time zone tz;
  day_to := (day + 1)::timestamp at time zone tz;

  if private.can_use_orders(p_detail_center_id) then
    select jsonb_build_object(
      'by_status', coalesce((
        select jsonb_object_agg(s.status, s.n) from (
          select o.status::text as status, count(*) as n from public.service_orders o
           where o.detail_center_id = p_detail_center_id
             and o.status in ('abierta', 'autorizada', 'en_proceso', 'pausada', 'terminada')
           group by o.status) s), '{}'::jsonb),
      'active', coalesce((
        select jsonb_agg(to_jsonb(a) order by a.rank, a.created_at) from (
          select o.id, o.folio, o.status::text as status, o.client_name,
                 concat_ws(' · ', concat_ws(' ', o.vehicle_make, o.vehicle_model), o.vehicle_plate) as vehicle,
                 o.total, o.paid_amount, o.promised_at, o.created_at, b.name as bay_name, t.full_name as technician_name,
                 array_position(array['terminada', 'en_proceso', 'pausada', 'autorizada', 'abierta'], o.status::text) as rank
            from public.service_orders o
            left join public.bays b on b.id = o.bay_id
            left join public.technicians t on t.id = o.technician_id
           where o.detail_center_id = p_detail_center_id
             and o.status in ('abierta', 'autorizada', 'en_proceso', 'pausada', 'terminada')
           order by rank, o.created_at
           limit 50) a), '[]'::jsonb),
      'delivered_today', (
        select jsonb_build_object('count', count(*), 'total', coalesce(sum(o.total), 0),
                                  'pending', coalesce(sum(greatest(o.total - o.paid_amount, 0)), 0))
          from public.service_orders o
         where o.detail_center_id = p_detail_center_id and o.status = 'entregada'
           and o.delivered_at >= day_from and o.delivered_at < day_to),
      'opened_today', (
        select count(*) from public.service_orders o
         where o.detail_center_id = p_detail_center_id and o.created_at >= day_from and o.created_at < day_to)
    ) into orders;
  end if;

  if private.can_use_agenda(p_detail_center_id) then
    select jsonb_build_object(
      'by_status', coalesce((
        select jsonb_object_agg(s.status, s.n) from (
          select a.status::text as status, count(*) as n from public.appointments a
           where a.detail_center_id = p_detail_center_id and a.starts_at >= day_from and a.starts_at < day_to
           group by a.status) s), '{}'::jsonb),
      'upcoming', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.starts_at) from (
          select a.id, a.starts_at, a.status::text as status, c.full_name as client_name,
                 concat_ws(' · ', concat_ws(' ', v.make, v.model), v.plate) as vehicle, b.name as bay_name
            from public.appointments a
            join public.clients c on c.id = a.client_id
            join public.vehicles v on v.id = a.vehicle_id
            left join public.bays b on b.id = a.bay_id
           where a.detail_center_id = p_detail_center_id and a.starts_at >= day_from and a.starts_at < day_to
             and a.status in ('programada', 'recibida')
           order by a.starts_at
           limit 20) x), '[]'::jsonb)
    ) into agenda;
  end if;

  if private.can_read_payments(p_detail_center_id) then
    select jsonb_build_object(
      'count', count(*), 'total', coalesce(sum(p.amount), 0)
    ) into payments
      from public.payments p
     where p.detail_center_id = p_detail_center_id and p.status = 'valido'
       and p.received_at >= day_from and p.received_at < day_to;
  end if;

  return jsonb_build_object('day', day, 'orders', orders, 'agenda', agenda, 'payments', payments);
end;
$$;

revoke all on function public.center_day_summary(uuid) from public, anon;
grant execute on function public.center_day_summary(uuid) to authenticated;
