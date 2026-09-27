-- Datos con el esquema anterior a 20261007000000_payments: una OS entregada con
-- $500 cobrados en O4 (sólo paid_amount) y dos eventos de cobro que explican
-- $450; la diferencia no tiene evento.
insert into public.service_orders (id, organization_id, detail_center_id, folio, folio_number, client_id, vehicle_id,
                                   channel, client_name, vehicle_make, vehicle_model, vehicle_year, vehicle_plate,
                                   request_id) values
  ('2a000000-0000-0000-0000-000000000007', '2e000000-0000-0000-0000-000000000001', '2eea0000-0000-0000-0000-000000000001',
   'CRM-01-000007', 7, '2c000000-0000-0000-0000-000000000001', '2f000000-0000-0000-0000-000000000001', 'b2c',
   'Con consentimiento', 'Nissan', 'NP300', 2020, 'LEG0001', '2a000000-0000-0000-0000-0000000000a7');
insert into public.service_order_items (organization_id, service_order_id, kind, service_id, service_code, service_name,
                                        revenue_engine, unit_price, unit_direct_cost, duration_minutes, price_source, quantity) values
  ('2e000000-0000-0000-0000-000000000001', '2a000000-0000-0000-0000-000000000007', 'servicio',
   '2d000000-0000-0000-0000-000000000001', 'LAV', 'Lavado', 'recurrente', 500, 80, 40, 'center', 1);
update public.service_orders set status = 'entregada', paid_amount = 500
 where id = '2a000000-0000-0000-0000-000000000007';
insert into public.audit_log (organization_id, detail_center_id, table_name, record_id, action, reason, new_data, occurred_at, event) values
  ('2e000000-0000-0000-0000-000000000001', '2eea0000-0000-0000-0000-000000000001', 'public.service_orders', '2a000000-0000-0000-0000-000000000007', 'EVENT',
   'Cobro efectivo', '{"amount": 200, "method": "efectivo", "reference": null}', now() - interval '2 days',
   'service_order.payment_recorded'),
  ('2e000000-0000-0000-0000-000000000001', '2eea0000-0000-0000-0000-000000000001', 'public.service_orders', '2a000000-0000-0000-0000-000000000007', 'EVENT',
   'Cobro tarjeta · AUT-9', '{"amount": 250, "method": "tarjeta", "reference": "AUT-9"}', now() - interval '1 day',
   'service_order.payment_recorded');
