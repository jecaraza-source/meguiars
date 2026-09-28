-- Datos con el esquema anterior a 20261012000000_b2b_receivables: la cuenta B2B
-- previa con una OS entregada, dos cortes con referencia de CFDI (uno con la OS
-- y uno sin OS) y tres pagos: uno ligado al segundo corte, uno sin corte y uno
-- anulado.
select set_config('app.change_reason', 'Datos previos', false);
select set_config('app.b2b_link', 'on', false);
insert into public.service_orders (id, organization_id, detail_center_id, folio, folio_number, client_id, vehicle_id, channel,
                                   client_name, vehicle_make, vehicle_model, vehicle_year, vehicle_plate, request_id,
                                   b2b_account_id) values
  ('2a000000-0000-0000-0000-000000000012', '2e000000-0000-0000-0000-000000000001', '2eea0000-0000-0000-0000-000000000001',
   'CRM-01-000012', 12, '2c000000-0000-0000-0000-000000000003', '2f000000-0000-0000-0000-000000000001', 'b2b',
   'Flotilla previa', 'Nissan', 'NP300', 2020, 'LEG0001', '2a000000-0000-0000-0000-0000000000c2',
   '2b100000-0000-0000-0000-000000000001');
select set_config('app.b2b_link', 'off', false);
insert into public.service_order_items (organization_id, service_order_id, kind, service_id, service_code, service_name,
                                        revenue_engine, unit_price, unit_direct_cost, duration_minutes, price_source, quantity) values
  ('2e000000-0000-0000-0000-000000000001', '2a000000-0000-0000-0000-000000000012', 'servicio',
   '2d000000-0000-0000-0000-000000000001', 'LAV', 'Lavado', 'recurrente', 500, 80, 40, 'center', 1);
set session_replication_role = replica;
update public.service_orders set status = 'entregada', delivered_at = now() - interval '20 days'
 where id = '2a000000-0000-0000-0000-000000000012';
set session_replication_role = origin;
insert into public.b2b_invoices (id, organization_id, account_id, reference, issued_on, due_on, orders_amount, fee_amount,
                                 request_id, created_at) values
  ('2b200000-0000-0000-0000-000000000001', '2e000000-0000-0000-0000-000000000001', '2b100000-0000-0000-0000-000000000001',
   'F-100', current_date - 15, current_date + 15, 500, 0, '2b200000-0000-0000-0000-0000000000a1', now() - interval '15 days'),
  ('2b200000-0000-0000-0000-000000000002', '2e000000-0000-0000-0000-000000000001', '2b100000-0000-0000-0000-000000000001',
   'F-101', current_date - 5, current_date + 25, 300, 0, '2b200000-0000-0000-0000-0000000000a2', now() - interval '5 days');
select set_config('app.b2b_invoice', 'on', false);
update public.service_orders set b2b_invoice_id = '2b200000-0000-0000-0000-000000000001'
 where id = '2a000000-0000-0000-0000-000000000012';
select set_config('app.b2b_invoice', 'off', false);
insert into public.b2b_payments (id, organization_id, account_id, invoice_id, amount, method, reference, paid_on, request_id,
                                 voided_at, void_reason) values
  ('2b300000-0000-0000-0000-000000000001', '2e000000-0000-0000-0000-000000000001', '2b100000-0000-0000-0000-000000000001',
   '2b200000-0000-0000-0000-000000000002', 200, 'transferencia', 'SPEI-A', current_date - 3,
   '2b300000-0000-0000-0000-0000000000a1', null, null),
  ('2b300000-0000-0000-0000-000000000002', '2e000000-0000-0000-0000-000000000001', '2b100000-0000-0000-0000-000000000001',
   null, 400, 'cheque', 'CH-1', current_date - 2, '2b300000-0000-0000-0000-0000000000a2', null, null),
  ('2b300000-0000-0000-0000-000000000003', '2e000000-0000-0000-0000-000000000001', '2b100000-0000-0000-0000-000000000001',
   '2b200000-0000-0000-0000-000000000001', 100, 'efectivo', null, current_date - 1, '2b300000-0000-0000-0000-0000000000a3',
   now(), 'Capturado dos veces');
select set_config('app.change_reason', '', false);
