-- «Recibir y abrir OS» en un paso: si la cita sigue programada, la recibe
-- (registra la visita) y abre su OS con los servicios agendados. Reutiliza
-- set_appointment_status y create_service_order_from_appointment, así que
-- permisos, auditoría e idempotencia (request_id, una OS por cita) son los mismos.
create function public.receive_and_open_order(
  p_appointment_id uuid,
  p_request_id uuid,
  p_channel public.sales_channel default 'b2c',
  p_channel_reference text default null,
  p_odometer_km integer default null,
  p_promised_at timestamptz default null
) returns public.service_orders
language plpgsql security invoker set search_path = '' as $$
declare
  a public.appointments;
begin
  select * into a from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'Cita inexistente o sin permiso' using errcode = '42501';
  end if;
  if a.status = 'programada' then
    perform public.set_appointment_status(a.id, 'recibida', 'Recibida al abrir la OS');
  end if;
  return public.create_service_order_from_appointment(
    p_appointment_id, p_request_id, p_channel, p_channel_reference, p_odometer_km, p_promised_at);
end;
$$;

revoke all on function public.receive_and_open_order(uuid, uuid, public.sales_channel, text, integer, timestamptz)
  from public, anon;
grant execute on function public.receive_and_open_order(uuid, uuid, public.sales_channel, text, integer, timestamptz)
  to authenticated;
