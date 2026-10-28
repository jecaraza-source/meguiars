-- Datos previos a 20261102000000_payment_integrity_hardening: una OS B2B sin
-- cuenta, terminada, con orden de compra y sin cobrar (antes se entregaba a
-- crédito; ahora se cobra antes de entregar).
insert into public.service_orders (id, organization_id, detail_center_id, folio, folio_number, client_id, vehicle_id,
                                   channel, channel_reference, client_name, vehicle_make, vehicle_model, vehicle_year,
                                   vehicle_plate, request_id) values
  ('2a000000-0000-0000-0000-000000000042', '2e000000-0000-0000-0000-000000000001', '2eea0000-0000-0000-0000-000000000001',
   'CRM-01-000042', 42, '2c000000-0000-0000-0000-000000000001', '2f000000-0000-0000-0000-000000000001', 'b2b', 'OC-42',
   'Con consentimiento', 'Nissan', 'NP300', 2020, 'LEG0001', '2a000000-0000-0000-0000-0000000000b2');
insert into public.service_order_items (organization_id, service_order_id, kind, service_id, service_code, service_name,
                                        revenue_engine, unit_price, unit_direct_cost, duration_minutes, price_source, quantity) values
  ('2e000000-0000-0000-0000-000000000001', '2a000000-0000-0000-0000-000000000042', 'servicio',
   '2d000000-0000-0000-0000-000000000001', 'LAV', 'Lavado', 'recurrente', 500, 80, 40, 'center', 1);
update public.service_orders set status = 'terminada', subtotal = 500, total = 500
 where id = '2a000000-0000-0000-0000-000000000042';
