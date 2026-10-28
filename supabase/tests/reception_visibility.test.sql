-- Recepción ve sólo lo de su trabajo (20261107000000_reception_visibility): cobra
-- desde la OS e imprime su recibo, pero no ve la cobranza del centro, el corte de
-- caja, la venta y lo cobrado del día ni el dinero de las campañas.
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

create function pg_temp.v(p_id uuid) returns integer language sql security definer as $$
  select version from public.service_orders where id = p_id
$$;

grant execute on all functions in schema pg_temp to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@a'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'recepcion@a');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'contador'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion');

select 'aaaaaaaa-0000-0000-0000-000000000000' as a \gset
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'LAV', 'Lavado', null, 'recurrente', 40, 500, 80)).id as lav \gset
reset role;

-- ---------------------------------------------------------------------------
-- Recepción cobra y entrega la OS, e imprime su recibo
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select private.center_today(:'a') as today \gset
select (public.create_client(:'a', '10000000-0000-4000-8000-000000000001',
  'José Pérez', '5512345678', null, 'person', null, '{}', 'web',
  '[{"make":"Mazda","model":"3","year":2021,"plate":"ABC1234"}]'::jsonb)).id as c1 \gset
select id as v1 from public.vehicles where plate = 'ABC1234' \gset
select (public.create_service_order(:'a', '30000000-0000-4000-8000-000000000001',
  :'c1', :'v1', jsonb_build_array(jsonb_build_object('service_id', :'lav')))).id as o1 \gset
select from public.set_service_order_status(:'o1', pg_temp.v(:'o1'), 'autorizada');
select from public.set_service_order_status(:'o1', pg_temp.v(:'o1'), 'en_proceso');
select from public.set_service_order_status(:'o1', pg_temp.v(:'o1'), 'terminada');
select (public.register_payment(:'o1', pg_temp.v(:'o1'), gen_random_uuid(),
  '[{"method":"efectivo","amount":500}]'::jsonb, 500)).id as p1 \gset
select from public.set_service_order_status(:'o1', pg_temp.v(:'o1'), 'entregada');
select pg_temp.assert(
  (select count(*) = 1 from public.order_payments(:'o1'))
  and (select (public.payment_receipt(:'p1') ->> 'receipt_folio') is not null),
  'recepción cobra la OS y ve e imprime su recibo');

-- ---------------------------------------------------------------------------
-- Recepción no ve la cobranza, el corte ni las cifras del día
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select count(*) = 0 from public.list_payments(array[:'a']::uuid[], :'today'::date, :'today'::date))
  and (select count(*) = 0 from public.payment_facts(array[:'a']::uuid[], :'today'::date, :'today'::date))
  and (select count(*) = 0 from public.receivable_orders(array[:'a']::uuid[]))
  and (select count(*) = 0 from public.sales_reconciliation(array[:'a']::uuid[], :'today'::date, :'today'::date)),
  'recepción no lista recibos, formas de pago, cuentas por cobrar ni conciliación');
select pg_temp.assert(
  (select count(*) = 0 from public.list_cash_sessions(array[:'a']::uuid[], :'today'::date, :'today'::date))
  and not private.can_read_cash(:'a'),
  'recepción no ve el corte de caja');
select pg_temp.assert(
  (select s -> 'payments' = 'null'::jsonb
          and (s #>> '{orders,delivered_today,count}')::int = 1
          and s #> '{orders,delivered_today,total}' = 'null'::jsonb
          and s #> '{orders,delivered_today,pending}' = 'null'::jsonb
          and jsonb_array_length(s #> '{orders,active}') = 0
     from public.center_day_summary(:'a') s),
  'Operación del día: recepción ve las entregadas, sin venta, cobrado ni por cobrar');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert(
  (select count(*) = 1 from public.list_payments(array[:'a']::uuid[], :'today'::date, :'today'::date))
  and (select (s #>> '{payments,total}')::numeric = 500 and (s #>> '{orders,delivered_today,total}')::numeric = 500
         from public.center_day_summary(:'a') s)
  and private.can_read_cash(:'a'),
  'el encargado sí ve la cobranza, el corte y las cifras del día');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(
  (select count(*) = 1 from public.payment_facts(array[:'a']::uuid[], :'today'::date, :'today'::date))
  and private.can_read_cash(:'a'),
  'el contador sí ve la cobranza y el corte');
reset role;

-- ---------------------------------------------------------------------------
-- Campañas: recepción las ve sin presupuesto ni inversión
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select (public.upsert_campaign('0e000000-0000-0000-0000-000000000001', null, null, :'a', 'Lavado octubre', 'prospectos',
  array['instagram'], :'today'::date - 5, :'today'::date + 25, 5000, 'activa', 'instagram', 'paid_social', 'lav_oct',
  null, null, 'Campaña del mes')).id as camp \gset
select from public.add_campaign_spend(:'camp', :'today'::date - 1, 800, 'instagram', null, 'Boost');
select pg_temp.assert(
  (select (budget, spend) = (5000::numeric, 800::numeric)
     from public.list_campaigns('0e000000-0000-0000-0000-000000000001', :'camp'))
  and (select count(*) = 1 from public.campaign_spend_entries(:'camp')),
  'el encargado ve presupuesto, inversión y gasto');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  (select name = 'Lavado octubre' and budget is null and spend = 0
     from public.list_campaigns('0e000000-0000-0000-0000-000000000001', :'camp'))
  and (select count(*) = 0 from public.campaign_spend_entries(:'camp'))
  and (select count(*) = 0 from public.campaign_spend),
  'recepción ve la campaña sin presupuesto, inversión ni gasto');
select pg_temp.assert((select count(*) = 1 from public.campaigns where id = :'camp'),
  'recepción sigue leyendo la campaña');
select pg_temp.assert_fails($$select budget from public.campaigns$$, '42501',
  'recepción no lee el presupuesto directo de la tabla');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(
  (select budget = 5000 and spend = 800
     from public.list_campaigns('0e000000-0000-0000-0000-000000000001', :'camp')),
  'el contador ve el dinero de la campaña (métricas comerciales)');
reset role;

rollback;
