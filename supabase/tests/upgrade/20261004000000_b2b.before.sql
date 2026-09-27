-- Datos con el esquema anterior a 20261004000000_b2b: una OS de canal B2B sin
-- cuenta (orden de compra capturada a mano) con una línea a precio del centro.
insert into public.services (id, organization_id, code, name, revenue_engine, standard_duration_minutes, base_price,
                             standard_direct_cost) values
  ('2d000000-0000-0000-0000-000000000001', '2e000000-0000-0000-0000-000000000001', 'LAV', 'Lavado', 'recurrente', 40, 250, 80);
insert into public.vehicles (id, organization_id, client_id, make, model, year, plate, created_in_detail_center_id) values
  ('2f000000-0000-0000-0000-000000000001', '2e000000-0000-0000-0000-000000000001', '2c000000-0000-0000-0000-000000000001',
   'Nissan', 'NP300', 2020, 'LEG0001', '2eea0000-0000-0000-0000-000000000001');
insert into public.service_orders (id, organization_id, detail_center_id, folio, folio_number, client_id, vehicle_id, channel,
                                   channel_reference, client_name, vehicle_make, vehicle_model, vehicle_year, vehicle_plate,
                                   request_id) values
  ('2a000000-0000-0000-0000-000000000001', '2e000000-0000-0000-0000-000000000001', '2eea0000-0000-0000-0000-000000000001',
   'CRM-01-000001', 1, '2c000000-0000-0000-0000-000000000001', '2f000000-0000-0000-0000-000000000001', 'b2b', 'OC-LEGADO',
   'Con consentimiento', 'Nissan', 'NP300', 2020, 'LEG0001', '2a000000-0000-0000-0000-0000000000a1');
insert into public.service_order_items (organization_id, service_order_id, kind, service_id, service_code, service_name,
                                        revenue_engine, unit_price, unit_direct_cost, duration_minutes, price_source, quantity) values
  ('2e000000-0000-0000-0000-000000000001', '2a000000-0000-0000-0000-000000000001', 'servicio',
   '2d000000-0000-0000-0000-000000000001', 'LAV', 'Lavado', 'recurrente', 220, 80, 40, 'center', 1);
