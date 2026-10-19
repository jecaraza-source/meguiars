-- Tras 20261031000000_whatsapp_booking: las citas previas son de la agenda, los
-- vehículos conservan su placa, los mensajes no tienen botón y cada
-- organización queda con la agenda propia del asistente encendida.
\set ON_ERROR_STOP on
do $$
begin
  if (select source from public.appointments where id = '2a900000-0000-0000-0000-000000000001') is distinct from 'agenda' then
    raise exception 'FALLÓ: una cita previa debe quedar con origen agenda';
  end if;
  if exists (select 1 from public.vehicles where plate is null) then
    raise exception 'FALLÓ: ningún vehículo previo pierde su placa';
  end if;
  if exists (select 1 from public.messages where payload is not null or buttons is not null) then
    raise exception 'FALLÓ: los mensajes previos no tienen botones';
  end if;
  if exists (select 1 from public.bot_settings where not self_booking) then
    raise exception 'FALLÓ: la agenda propia nace encendida en las organizaciones existentes';
  end if;
  if (select vehicle_label from public.list_appointments('2eea0000-0000-0000-0000-000000000001',
        ((select starts_at from public.appointments where id = '2a900000-0000-0000-0000-000000000001')
          at time zone (select timezone from public.detail_centers where id = '2eea0000-0000-0000-0000-000000000001'))::date)
      where id = '2a900000-0000-0000-0000-000000000001') not like '% · LEG0001' then
    raise exception 'FALLÓ: la agenda sigue mostrando la placa del vehículo previo';
  end if;
  raise notice 'ok - datos previos: citas de la agenda, placas intactas, sin botones y agenda propia encendida';
end $$;
