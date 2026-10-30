-- «Mi semana» del operador: trabajos terminados de lunes a domingo y su pago.
--
-- Los cortes de los operadores van de lunes a domingo (día del centro) y se
-- pagan el martes siguiente. Cada servicio terminado guarda en su línea la
-- comisión del operador (operator_commission_amount, ADR 0026): aquí sólo se
-- suman las líneas del técnico ligado al usuario (service_order_items.technician_id),
-- sin OS canceladas. El operador ve su pago, no el precio al cliente.
create function public.my_work_week(p_detail_center_id uuid, p_day date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  tid uuid := private.my_technician_id(p_detail_center_id);
  tz text;
  monday date;
  items jsonb;
begin
  if tid is null then
    raise exception 'Tu usuario no está ligado a un técnico de este centro; pide al encargado que lo ligue'
      using errcode = '42501';
  end if;
  select c.timezone into tz from public.detail_centers c where c.id = p_detail_center_id;
  monday := date_trunc('week', coalesce(p_day, (now() at time zone tz)::date))::date;

  select coalesce(jsonb_agg(jsonb_build_object(
           'item_id', i.id,
           'order_id', o.id,
           'folio', o.folio,
           'service', i.service_name,
           'quantity', i.quantity,
           'finished_at', i.finished_at,
           'day', (i.finished_at at time zone tz)::date,
           'vehicle', jsonb_build_object('make', o.vehicle_make, 'model', o.vehicle_model, 'plate', o.vehicle_plate),
           'commission', coalesce(i.operator_commission_amount, 0))
         order by i.finished_at), '[]') into items
    from public.service_order_items i
    join public.service_orders o on o.id = i.service_order_id
   where o.detail_center_id = p_detail_center_id
     and o.status <> 'cancelada'
     and i.kind = 'servicio'
     and i.technician_id = tid
     and i.work_status = 'terminada'
     and i.finished_at >= (monday::timestamp at time zone tz)
     and i.finished_at < ((monday + 7)::timestamp at time zone tz);

  return jsonb_build_object(
    'week_start', monday,
    'week_end', monday + 6,
    'pay_day', monday + 8,
    'today', (now() at time zone tz)::date,
    'items', items,
    'total', (select coalesce(sum((x ->> 'commission')::numeric), 0) from jsonb_array_elements(items) x));
end;
$$;

revoke all on function public.my_work_week(uuid, date) from public, anon;
grant execute on function public.my_work_week(uuid, date) to authenticated;
