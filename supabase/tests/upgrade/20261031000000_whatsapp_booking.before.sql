-- Datos con el esquema anterior a 20261031000000_whatsapp_booking: una cita
-- registrada por el personal para el vehículo previo (con placa).
select set_config('app.change_reason', 'Datos previos', false);
insert into public.appointments (id, organization_id, detail_center_id, client_id, vehicle_id, starts_at, duration_minutes,
                                 request_id)
values ('2a900000-0000-0000-0000-000000000001', '2e000000-0000-0000-0000-000000000001', '2eea0000-0000-0000-0000-000000000001',
        '2c000000-0000-0000-0000-000000000003', '2f000000-0000-0000-0000-000000000001', now() + interval '3 days', 60,
        '2a900000-0000-0000-0000-0000000000a1');
