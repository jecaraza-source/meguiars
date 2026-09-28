-- Pruebas de AF5: cuentas por cobrar B2B. Documentos de cobro por cuenta y
-- periodo, factura externa opcional, fecha compromiso, estados derivados,
-- pagos aplicados a varios documentos (explícito y automático), saldo a favor,
-- antigüedad, saldo por cuenta trazable, export de soporte, P&L sin duplicar y
-- permisos (contador de sólo lectura).
\set ON_ERROR_STOP on
begin;

create function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

create function pg_temp.assert_fails(stmt text, expected_state text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate = expected_state then
      raise notice 'ok - %', msg;
      return;
    end if;
    raise exception 'FALLÓ: % (SQLSTATE % en lugar de %: %)', msg, sqlstate, expected_state, sqlerrm;
  end;
  raise exception 'FALLÓ: % (no produjo error)', msg;
end $$;

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('app.change_reason', '', true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.n(sql text) returns bigint language plpgsql as $$
declare c bigint;
begin
  execute 'select count(*) from (' || sql || ') s' into c;
  return c;
end $$;

create function pg_temp.v(p_id uuid) returns integer language sql as $$
  select version from public.service_orders where id = p_id
$$;

create function pg_temp.deliver(p_id uuid) returns void language plpgsql as $$
begin
  perform public.set_service_order_status(p_id, pg_temp.v(p_id), 'autorizada');
  perform public.set_service_order_status(p_id, pg_temp.v(p_id), 'en_proceso');
  perform public.set_service_order_status(p_id, pg_temp.v(p_id), 'terminada');
  perform public.set_service_order_status(p_id, pg_temp.v(p_id), 'entregada');
end $$;

-- Documento por folio (como superusuario, sin RLS).
create function pg_temp.doc(p_folio text) returns uuid language sql as $$
  select id from public.b2b_invoices where folio = p_folio
$$;

grant execute on all functions in schema pg_temp to authenticated, anon;

-- Reglas puras (espejo de b2bDocumentStatus).
select pg_temp.assert(
  private.b2b_document_status('anulada', 100, 100, 'F-1', '2026-10-01', '2026-10-10') = 'anulado'
  and private.b2b_document_status('emitida', 100, 100, null, '2026-10-01', '2026-10-10') = 'cobrado'
  and private.b2b_document_status('emitida', 100, 40, 'F-1', '2026-10-01', '2026-10-02') = 'vencido'
  and private.b2b_document_status('emitida', 100, 0, null, '2026-10-01', '2026-10-02') = 'vencido'
  and private.b2b_document_status('emitida', 100, 40, 'F-1', '2026-10-01', '2026-10-01') = 'parcial'
  and private.b2b_document_status('emitida', 100, 0, 'F-1', '2026-10-01', '2026-10-01') = 'facturado_externo'
  and private.b2b_document_status('emitida', 100, 0, null, '2026-10-01', '2026-10-01') = 'por_facturar',
  'estado del documento: anulado > cobrado > vencido > parcial > facturado externo > por facturar');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@a'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000b1', 'comercial@a'),
  ('00000000-0000-0000-0000-0000000000b2', 'comercial@b');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Monterrey');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'comercial_b2b'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'contador'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b2', 'comercial_b2b');

select private.center_today('aaaaaaaa-0000-0000-0000-000000000000') as today \gset
\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set B 'bbbbbbbb-0000-0000-0000-000000000000'

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'LAV', 'Lavado', null, 'recurrente', 40, 250, 80)).id as lavado \gset
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'POL', 'Pulido', null, 'valor_medio', 120, 2800, 900)).id as pulido \gset
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000001', 'Flotillas SA', '5511112222', null, 'company', null,
  '{}', 'web', '[{"make":"Nissan","model":"NP300","year":2020,"plate":"FLT0001"}]'::jsonb)).id as flota \gset
select id as car1 from public.vehicles where plate = 'FLT0001' \gset
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000002', 'Hotel Sol', '5555556666', null, 'company',
  null, '{}', 'web', '[{"make":"Toyota","model":"Hiace","year":2023,"plate":"HOT0001"}]'::jsonb)).id as hotel \gset
select id as hcar from public.vehicles where plate = 'HOT0001' \gset
reset role;

-- Cuenta por vehículo (lavado a $200, pulido a lista) y cuenta con iguala de $1,000.
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select (public.upsert_b2b_account(null, '20000000-0000-4000-8000-000000000001', :'A', :'flota', 'Flotillas SA',
  'Flotillas del Valle SA de CV', 'FVA010101AB1', '601', '06600', 'facturas@flotillas.mx', 'activa', null, 'Alta')).id as acc \gset
select (public.upsert_b2b_agreement(:'acc', null, '21000000-0000-4000-8000-000000000001', 'Convenio 2026', 'por_vehiculo',
  :'today'::date - 90, :'today'::date + 90, 'activo', 'cualquiera', 15::smallint, null, null, null, array[:'A'::uuid], null,
  'Alta de convenio')).id as ag \gset
select from public.set_b2b_price_rule(:'ag', null, :'lavado', 'precio_fijo', 200, 0, true, null, 'Tarifa lavado');
select (public.upsert_b2b_account(null, '20000000-0000-4000-8000-000000000002', :'A', :'hotel', 'Hotel Sol', null, null,
  null, null, null, 'activa', null, 'Alta')).id as acc2 \gset
select (public.upsert_b2b_agreement(:'acc2', null, '21000000-0000-4000-8000-000000000002', 'Iguala', 'iguala',
  :'today'::date - 20, :'today'::date + 300, 'activo', 'cualquiera', 30::smallint, null, 1000, 2, array[:'A'::uuid], null,
  'Alta de iguala')).id as ag2 \gset
reset role;

-- Cuatro OS entregadas de la cuenta: dos hace 40 días, una hace 10 y una hoy.
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_b2b_service_order(:'A', gen_random_uuid(), :'acc', :'car1',
  jsonb_build_array(jsonb_build_object('service_id', :'lavado')), 'OC-1')).id as os1 \gset
select (public.create_b2b_service_order(:'A', gen_random_uuid(), :'acc', :'car1',
  jsonb_build_array(jsonb_build_object('service_id', :'pulido')), 'OC-2')).id as os2 \gset
select (public.create_b2b_service_order(:'A', gen_random_uuid(), :'acc', :'car1',
  jsonb_build_array(jsonb_build_object('service_id', :'lavado')), 'OC-3')).id as os3 \gset
select (public.create_b2b_service_order(:'A', gen_random_uuid(), :'acc', :'car1',
  jsonb_build_array(jsonb_build_object('service_id', :'lavado', 'quantity', 2)), 'OC-4')).id as os4 \gset
select pg_temp.deliver(:'os1');
select pg_temp.deliver(:'os2');
select pg_temp.deliver(:'os3');
select pg_temp.deliver(:'os4');
select (public.create_b2b_service_order(:'A', gen_random_uuid(), :'acc', :'car1',
  jsonb_build_array(jsonb_build_object('service_id', :'lavado')), 'OC-5')).id as os_open \gset
reset role;

set session_replication_role = replica;
update public.service_orders set delivered_at = now() - interval '40 days' where id in (:'os1', :'os2');
update public.service_orders set delivered_at = now() - interval '10 days' where id = :'os3';
set session_replication_role = origin;

select pg_temp.assert(
  (select sum(total) = 200 + 2800 + 200 + 400 from public.service_orders where id in (:'os1', :'os2', :'os3', :'os4')),
  'escenario: $3,600 entregados (tarifa convenida) y una OS en curso');

-- P&L antes de agrupar, facturar y cobrar (para comparar al final).
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select sum(amount) as pnl_before from public.pnl_lines(array[:'A'::uuid], :'today'::date - 60, :'today'::date)
 where section = 'ingreso' \gset
reset role;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(
  (select unbilled_orders = 3600 and unbilled_orders_count = 4 and documents_balance = 0
     from public.b2b_receivables(array[:'A'::uuid]) where account_id = :'acc')
  and pg_temp.n($$select 1 from public.b2b_unbilled_orders(array['$$ || :'A' || $$'::uuid], '$$ || :'acc' || $$')$$) = 4,
  'el contador consulta el saldo por cuenta y las OS por agrupar');
select pg_temp.assert_fails($$select public.create_b2b_billing_batch('$$ || :'acc' || $$', gen_random_uuid(),
  current_date - 60, current_date - 1)$$, '42501', 'el contador no agrupa ni factura (sólo lectura)');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.create_b2b_billing_batch('$$ || :'acc' || $$', gen_random_uuid(),
  current_date - 60, current_date - 1)$$, '42501', 'el encargado no factura');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.b2b_receivables(array['$$ || :'A' || $$'::uuid])$$) = 0,
  'el operador no ve cuentas por cobrar');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000b2');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.b2b_receivables(array['$$ || :'A' || $$', '$$ || :'B' || $$']::uuid[])$$) = 0,
  'el comercial de otro centro no ve la cartera de un centro gestor ajeno');
reset role;

-- ---------------------------------------------------------------------------
-- Documentos de cobro por cuenta y periodo
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert_fails($$select public.create_b2b_billing_batch('$$ || :'acc' || $$', gen_random_uuid(),
  '$$ || :'today' || $$'::date - 5, '$$ || :'today' || $$'::date + 1)$$, '22023', 'el periodo no incluye fechas futuras');
select pg_temp.assert_fails($$select public.create_b2b_billing_batch('$$ || :'acc' || $$', gen_random_uuid(),
  '$$ || :'today' || $$'::date - 5, '$$ || :'today' || $$'::date - 6)$$, '22023', 'el periodo va del inicio al fin');
select pg_temp.assert_fails($$select public.create_b2b_billing_batch('$$ || :'acc' || $$', gen_random_uuid(),
  '$$ || :'today' || $$'::date - 60, '$$ || :'today' || $$'::date - 50)$$, 'MG002', 'sin OS en el periodo no hay documento');
select pg_temp.assert_fails($$select public.create_b2b_billing_batch('$$ || :'acc' || $$', gen_random_uuid(),
  '$$ || :'today' || $$'::date - 45, '$$ || :'today' || $$'::date - 30, array['$$ || :'os3' || $$'::uuid])$$, 'MG002',
  'las OS indicadas deben estar entregadas en el periodo');
select pg_temp.assert_fails($$select public.create_b2b_billing_batch('$$ || :'acc' || $$', gen_random_uuid(),
  '$$ || :'today' || $$'::date - 45, '$$ || :'today' || $$'::date, array['$$ || :'os_open' || $$'::uuid])$$, 'MG002',
  'una OS en curso no se agrupa');

select (public.create_b2b_billing_batch(:'acc', '40000000-0000-4000-8000-000000000001', :'today'::date - 45,
  :'today'::date - 30)).id as d1 \gset
select pg_temp.assert(
  (select folio = 'CXC-000001' and orders_amount = 3000 and fee_amount = 0 and amount = 3000 and reference is null
          and issued_on = :'today'::date and due_on = :'today'::date + 15 and period_from = :'today'::date - 45
     from public.b2b_invoices where id = :'d1')
  and (select array_agg(o ->> 'id' order by o ->> 'id') from public.b2b_billing_document(:'d1') d,
              jsonb_array_elements(d -> 'orders') o)
      = (select array_agg(x::text order by x::text) from unnest(array[:'os1'::uuid, :'os2'::uuid]) x)
  and (select status = 'por_facturar' and balance = 3000 and orders_count = 2 and age_days = 0
         from public.b2b_billing_documents(array[:'A'::uuid]) where id = :'d1'),
  'agrupa las OS entregadas del periodo: folio CXC, vence según la condición de pago, estado por facturar');
select pg_temp.assert(
  (public.create_b2b_billing_batch(:'acc', '40000000-0000-4000-8000-000000000001', :'today'::date - 45,
     :'today'::date - 30)).id = :'d1'
  and pg_temp.n('select 1 from public.b2b_invoices') = 1,
  'idempotente por request_id');
select pg_temp.assert_fails($$select public.create_b2b_billing_batch('$$ || :'acc' || $$', gen_random_uuid(),
  '$$ || :'today' || $$'::date - 45, '$$ || :'today' || $$'::date, array['$$ || :'os1' || $$'::uuid])$$, 'MG002',
  'una OS no queda en dos documentos');

-- Segundo documento con factura externa desde el alta y fecha compromiso propia.
select (public.create_b2b_billing_batch(:'acc', gen_random_uuid(), :'today'::date - 15, :'today'::date - 1, null, 0,
  :'today'::date + 5, 'FAC-778', :'today'::date - 1, 'Servicios de la quincena')).id as d2 \gset
select pg_temp.assert(
  (select folio = 'CXC-000002' and amount = 200 and reference = 'FAC-778' and external_invoiced_on = :'today'::date - 1
          and due_on = :'today'::date + 5 from public.b2b_invoices where id = :'d2')
  and (select status = 'facturado_externo' from public.b2b_billing_documents(array[:'A'::uuid]) where id = :'d2'),
  'referencia de factura externa opcional al agrupar: estado facturado externo');

-- Factura externa y fecha compromiso después.
select pg_temp.assert_fails($$select public.update_b2b_billing_batch('$$ || :'d1' || $$', null, current_date,
  '$$ || :'today' || $$'::date + 15, 'Sin referencia')$$, '22023', 'la fecha de factura externa exige referencia');
select pg_temp.assert_fails($$select public.update_b2b_billing_batch('$$ || :'d1' || $$', 'FAC-778', null,
  '$$ || :'today' || $$'::date + 15, 'Duplicada')$$, 'MG002', 'una referencia de factura por cuenta');
select pg_temp.assert_fails($$select public.update_b2b_billing_batch('$$ || :'d1' || $$', 'FAC-777', null,
  '$$ || :'today' || $$'::date - 1, 'Antes')$$, '22023', 'la fecha compromiso no es anterior al documento');
select pg_temp.assert_fails($$select public.update_b2b_billing_batch('$$ || :'d1' || $$', 'FAC-777', null,
  '$$ || :'today' || $$'::date + 20, '')$$, '22023', 'cambiar el documento exige motivo');
select from public.update_b2b_billing_batch(:'d1', 'FAC-777', null, :'today'::date + 20, 'Compromiso del cliente por correo');
select pg_temp.assert(
  (select reference = 'FAC-777' and external_invoiced_on = :'today'::date and due_on = :'today'::date + 20
          and due_on_reason = 'Compromiso del cliente por correo' from public.b2b_invoices where id = :'d1'),
  'registra la factura externa y la nueva fecha compromiso con motivo');
reset role;
select pg_temp.assert(
  exists (select 1 from public.audit_log where table_name = 'public.b2b_invoices'
                                           and reason = 'Compromiso del cliente por correo'),
  'el cambio queda en la auditoría con su motivo');

-- ---------------------------------------------------------------------------
-- Pagos aplicados a varios documentos
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert_fails($$select public.register_b2b_payment('$$ || :'acc' || $$', gen_random_uuid(), 5000,
  'transferencia', null, null)$$, 'MG002', 'el pago no supera el saldo por cobrar ($3,200)');
select pg_temp.assert_fails($$select public.register_b2b_payment('$$ || :'acc' || $$', gen_random_uuid(), 500,
  'transferencia', null, null, jsonb_build_array(jsonb_build_object('invoice_id', '$$ || :'d2' || $$', 'amount', 300)))$$,
  'MG002', 'lo aplicado a un documento no supera su saldo');
select pg_temp.assert_fails($$select public.register_b2b_payment('$$ || :'acc' || $$', gen_random_uuid(), 100,
  'transferencia', null, null, jsonb_build_array(jsonb_build_object('invoice_id', '$$ || :'d1' || $$', 'amount', 150)))$$,
  'MG002', 'lo aplicado no supera el pago');
select pg_temp.assert_fails($$select public.register_b2b_payment('$$ || :'acc' || $$', gen_random_uuid(), 100,
  'transferencia', null, '$$ || :'today' || $$'::date + 1)$$, '22023', 'sin pagos con fecha futura');
select pg_temp.assert_fails($$select public.register_b2b_payment('$$ || :'acc' || $$', gen_random_uuid(), 300,
  'transferencia', null, null, jsonb_build_array(jsonb_build_object('invoice_id', '$$ || :'d2' || $$', 'amount', 100),
                                                 jsonb_build_object('invoice_id', gen_random_uuid(), 'amount', 100)))$$,
  'MG002', 'no se aplica a un documento inexistente (aunque el anterior sí exista)');
select pg_temp.assert_fails($$select public.register_b2b_payment('$$ || :'acc' || $$', gen_random_uuid(), 100,
  'transferencia', null, null, '[{"invoice_id":"x","amount":"y"}]')$$, '22023', 'aplicación con documento e importe válidos');

-- Un pago de $1,200: $200 al documento 2 y $1,000 al 1.
select (public.register_b2b_payment(:'acc', '50000000-0000-4000-8000-000000000001', 1200, 'transferencia', 'SPEI 991',
  :'today'::date, jsonb_build_array(jsonb_build_object('invoice_id', :'d2', 'amount', 200),
                                    jsonb_build_object('invoice_id', :'d1', 'amount', 1000)))).id as p1 \gset
select pg_temp.assert(
  (select status = 'cobrado' and balance = 0 from public.b2b_billing_documents(array[:'A'::uuid], :'acc', true) where id = :'d2')
  and (select status = 'parcial' and paid = 1000 and balance = 2000
         from public.b2b_billing_documents(array[:'A'::uuid]) where id = :'d1')
  and (select applied = 1200 and unapplied = 0 and jsonb_array_length(allocations) = 2
         from public.b2b_account_payments(:'acc') where id = :'p1')
  and (public.register_b2b_payment(:'acc', '50000000-0000-4000-8000-000000000001', 1200, 'transferencia', null, null)).id = :'p1',
  'un pago se reparte entre varios documentos (cobrado y parcial); idempotente por request_id');

-- Pago con aplicación parcial: el resto queda a favor y se aplica después.
select (public.register_b2b_payment(:'acc', gen_random_uuid(), 900, 'cheque', 'CH-12', null,
  jsonb_build_array(jsonb_build_object('invoice_id', :'d1', 'amount', 500)))).id as p2 \gset
select pg_temp.assert(
  (select unapplied = 400 from public.b2b_account_payments(:'acc') where id = :'p2')
  and (select unapplied = 400 and documents_balance = 1500 from public.b2b_receivables(array[:'A'::uuid]) where account_id = :'acc'),
  'lo no aplicado queda como saldo a favor de la cuenta');
select public.allocate_b2b_payment(:'p2') as allocated \gset
select pg_temp.assert(:allocated = 400
  and (select paid = 1900 and balance = 1100 from public.b2b_billing_documents(array[:'A'::uuid]) where id = :'d1'),
  'el saldo a favor se aplica después (automático, compromiso más antiguo primero)');
select pg_temp.assert_fails($$select public.allocate_b2b_payment('$$ || :'p2' || $$')$$, 'MG002',
  'un pago aplicado por completo no se vuelve a aplicar');
reset role;

-- Aplicación automática en orden de compromiso: un tercer documento que vence antes.
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select (public.create_b2b_billing_batch(:'acc', gen_random_uuid(), :'today'::date, :'today'::date, null, 0,
  :'today'::date + 1)).id as d3 \gset
select (public.register_b2b_payment(:'acc', gen_random_uuid(), 500, 'transferencia', 'SPEI 992', null)).id as p3 \gset
select pg_temp.assert(
  (select paid = 400 and status = 'cobrado' from public.b2b_billing_documents(array[:'A'::uuid], :'acc', true) where id = :'d3')
  and (select paid = 2000 from public.b2b_billing_documents(array[:'A'::uuid]) where id = :'d1'),
  'sin aplicación explícita el pago cubre primero el documento que vence antes');
reset role;

-- ---------------------------------------------------------------------------
-- Vencido y antigüedad
-- ---------------------------------------------------------------------------
set session_replication_role = replica;
update public.b2b_invoices set issued_on = :'today'::date - 70, due_on = :'today'::date - 40 where id = :'d1';
set session_replication_role = origin;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(
  (select status = 'vencido' and age_days = 70 and days_overdue = 40 and balance = 1000
     from public.b2b_billing_documents(array[:'A'::uuid]) where id = :'d1')
  and (select vencido = 1000 from public.b2b_receivables(array[:'A'::uuid]) where account_id = :'acc'),
  'vencido: saldo con fecha compromiso pasada; antigüedad desde el documento y días de atraso');
reset role;

-- ---------------------------------------------------------------------------
-- Anulaciones
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert_fails($$select public.void_b2b_invoice('$$ || :'d1' || $$', 'Error')$$, 'MG002',
  'un documento con pagos aplicados no se anula');
select from public.void_b2b_payment(:'p3', 'Pago rebotado');
select pg_temp.assert(
  (select status = 'por_facturar' and balance = 400 from public.b2b_billing_documents(array[:'A'::uuid]) where id = :'d3')
  and (select paid = 1900 from public.b2b_billing_documents(array[:'A'::uuid]) where id = :'d1'),
  'anular un pago regresa el saldo a sus documentos');
select from public.void_b2b_invoice(:'d3', 'Se agrupa con el siguiente periodo');
select pg_temp.assert(
  (select id = :'os4' from public.b2b_unbilled_orders(array[:'A'::uuid], :'acc'))
  and (select status = 'anulado' and balance = 0 from public.b2b_billing_documents(array[:'A'::uuid], :'acc', true,
         :'today'::date - 1, :'today'::date + 1) where id = :'d3')
  and pg_temp.n($$select 1 from public.b2b_unbilled_orders(array['$$ || :'A' || $$'::uuid], '$$ || :'acc' || $$')$$) = 1,
  'anular un documento libera sus OS (vuelven a por agrupar)');
select pg_temp.assert_fails($$update public.b2b_payment_allocations set amount = 1$$, '42501',
  'las aplicaciones no se editan');
select pg_temp.assert_fails($$insert into public.b2b_payment_allocations (organization_id, payment_id, invoice_id, amount)
  values ('0e000000-0000-0000-0000-000000000001', '$$ || :'p1' || $$', '$$ || :'d1' || $$', 1)$$, '42501',
  'nadie aplica pagos directamente');
reset role;
select pg_temp.assert_fails($$delete from public.b2b_payment_allocations$$, '42501', 'las aplicaciones no se borran');

-- ---------------------------------------------------------------------------
-- Saldo trazable, cuotas, export y P&L
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(
  (select consumption = 3600 and paid = 2100 and balance = 1500
          and unbilled_orders = 400 and documents_balance = 1100 and unapplied = 0
          and balance = unbilled_orders + unbilled_fees + documents_balance - unapplied
     from public.b2b_receivables(array[:'A'::uuid]) where account_id = :'acc')
  and (select receivable = 1100 and to_invoice = 400 from public.b2b_account_statement(:'acc')),
  'saldo por cuenta trazable: consumo − pagos = sin agrupar + documentos − saldo a favor (y cuadra con el estado de cuenta)');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert_fails($$select public.create_b2b_billing_batch('$$ || :'acc2' || $$', gen_random_uuid(),
  current_date - 20, current_date - 1, null, 5000)$$, 'MG002', 'la cuota no supera la devengada pendiente');
select (public.create_b2b_billing_batch(:'acc2', gen_random_uuid(), :'today'::date - 20, :'today'::date - 1, null, 1000,
  null, 'FAC-900')).id as d4 \gset
select pg_temp.assert(
  (select amount = 1000 and fee_amount = 1000 and orders_amount = 0 from public.b2b_invoices where id = :'d4')
  and (select unbilled_fees = 0 and documents_balance = 1000 from public.b2b_receivables(array[:'A'::uuid]) where account_id = :'acc2'),
  'la cuota devengada de una iguala se agrupa en un documento sin OS');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.b2b_receivables_export(array['$$ || :'A' || $$'::uuid], '$$ || :'today' || $$'::date - 90,
    '$$ || :'today' || $$'::date)$$) = 4
  and (select count(*) = 2 and bool_and(rfc = 'FVA010101AB1' and external_ref = 'FAC-777' and document_balance = 1100)
         from public.b2b_receivables_export(array[:'A'::uuid], :'today'::date - 90, :'today'::date) where folio = 'CXC-000001')
  and (select line_kind = 'cuota' and line_amount = 1000 from public.b2b_receivables_export(array[:'A'::uuid],
         :'today'::date - 90, :'today'::date) where folio = 'CXC-000004'),
  'export de soporte para el contador: una fila por OS o cuota, con datos fiscales y saldo (sin anulados)');
select pg_temp.assert_fails($$select public.b2b_receivables_export(array['$$ || :'A' || $$'::uuid], current_date - 400,
  current_date)$$, '22023', 'export con rango de hasta un año');
select pg_temp.assert(
  (select jsonb_array_length(d -> 'orders') = 2 and jsonb_array_length(d -> 'payments') = 4 and (d ->> 'status') = 'vencido'
     from public.b2b_billing_document(:'d1') d),
  'detalle del documento: OS incluidas y pagos aplicados (también los anulados, marcados)');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(
  (select sum(amount) from public.pnl_lines(array[:'A'::uuid], :'today'::date - 60, :'today'::date) where section = 'ingreso')
    = :pnl_before,
  'agrupar, registrar la factura externa y cobrar no duplican el ingreso del P&L');
reset role;

rollback;
