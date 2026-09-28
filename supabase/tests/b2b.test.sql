-- Pruebas de C3: cuentas B2B, convenios con vigencia y centros, tarifas
-- aplicadas en la base (por vehículo, volumen mensual, paquete e iguala),
-- vehículos autorizados, OS a cuenta B2B, límite de crédito, saldo por
-- facturar / cobrar, rentabilidad por cuenta y centro, y permisos.
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

-- B2B: autorizar, trabajar, terminar y entregar (sin cobro en mostrador).
create function pg_temp.deliver(p_id uuid) returns void language plpgsql as $$
begin
  perform public.set_service_order_status(p_id, pg_temp.v(p_id), 'autorizada');
  perform public.set_service_order_status(p_id, pg_temp.v(p_id), 'en_proceso');
  perform public.set_service_order_status(p_id, pg_temp.v(p_id), 'terminada');
  perform public.set_service_order_status(p_id, pg_temp.v(p_id), 'entregada');
end $$;

create function pg_temp.line(p_order uuid, p_service uuid) returns public.service_order_items language sql as $$
  select * from public.service_order_items where service_order_id = p_order and service_id = p_service
$$;

grant execute on all functions in schema pg_temp to authenticated, anon;

-- Reglas puras (espejo de agreementState / agreementFees).
select pg_temp.assert(
  private.b2b_agreement_state('activo', '2026-10-01', '2026-12-31', '2026-09-30') = 'programado'
  and private.b2b_agreement_state('activo', '2026-10-01', '2026-12-31', '2026-10-01') = 'vigente'
  and private.b2b_agreement_state('activo', '2026-10-01', '2026-12-31', '2026-12-31') = 'vigente'
  and private.b2b_agreement_state('activo', '2026-10-01', '2026-12-31', '2027-01-01') = 'vencido'
  and private.b2b_agreement_state('suspendido', '2026-10-01', '2026-12-31', '2026-11-01') = 'suspendido'
  and private.b2b_agreement_state('cancelado', '2026-10-01', '2026-12-31', '2026-11-01') = 'cancelado',
  'estado del convenio: programado, vigente (fechas inclusive), vencido; suspendido y cancelado mandan');
select pg_temp.assert(
  private.b2b_fee_accrued('iguala', 1000, '2026-01-31', '2026-12-31', '2026-01-01', '2026-03-30') = 2000
  and private.b2b_fee_accrued('iguala', 1000, '2026-01-31', '2026-12-31', '2026-01-01', '2026-03-31') = 3000
  and private.b2b_fee_accrued('iguala', 1000, '2026-01-31', '2026-02-15', '2026-01-01', '2026-12-31') = 1000
  and private.b2b_fee_accrued('paquete', 5000, '2026-02-01', '2026-12-31', '2026-01-01', '2026-02-01') = 5000
  and private.b2b_fee_accrued('paquete', 5000, '2026-02-01', '2026-12-31', '2026-03-01', '2026-12-31') = 0
  and private.b2b_fee_accrued('por_vehiculo', null, '2026-02-01', '2026-12-31', '2026-01-01', '2026-12-31') = 0,
  'cuotas: iguala por mes iniciado (fin de mes recortado), paquete una vez, sin cuota en tarifas');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@a'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000f2', 'operador@b'),
  ('00000000-0000-0000-0000-0000000000b1', 'comercial@a');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'comercial_b2b'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'contador');

select private.center_today('aaaaaaaa-0000-0000-0000-000000000000') as today \gset
\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set B 'bbbbbbbb-0000-0000-0000-000000000000'

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'LAV', 'Lavado', null, 'recurrente', 40, 250, 80)).id as lavado \gset
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'POL', 'Pulido', null, 'valor_medio', 120, 2800, 900)).id as pulido \gset
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'ARO', 'Aromatizante', null, 'producto_complemento', 5, 90, 30)).id as aroma \gset
reset role;

-- Flotillas (clientes empresa) y una persona.
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000001', 'Flotillas SA', '5511112222', null, 'company', null,
  '{}', 'web', '[{"make":"Nissan","model":"NP300","year":2020,"plate":"FLT0001"},
                 {"make":"Nissan","model":"NP300","year":2021,"plate":"FLT0002"}]'::jsonb)).id as flota \gset
select id as car1 from public.vehicles where plate = 'FLT0001' \gset
select id as car2 from public.vehicles where plate = 'FLT0002' \gset
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000002', 'Rutas del Centro', '5533334444', null, 'company',
  null, '{}', 'web', '[{"make":"Ford","model":"Transit","year":2022,"plate":"RUT0001"}]'::jsonb)).id as rutas \gset
select id as rcar from public.vehicles where plate = 'RUT0001' \gset
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000003', 'Hotel Sol', '5555556666', null, 'company',
  null, '{}', 'web', '[{"make":"Toyota","model":"Hiace","year":2023,"plate":"HOT0001"}]'::jsonb)).id as hotel \gset
select id as hcar from public.vehicles where plate = 'HOT0001' \gset
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000004', 'Luis Gómez', '5577778888', null, 'person',
  null, '{}', 'web', '[{"make":"Kia","model":"Rio","year":2022,"plate":"LUI0001"}]'::jsonb)).id as luis \gset

-- ---------------------------------------------------------------------------
-- Cuentas y permisos de administración
-- ---------------------------------------------------------------------------
select pg_temp.assert_fails($$select public.upsert_b2b_account(null, gen_random_uuid(), '$$ || :'A' || $$', '$$ || :'flota' || $$',
  'Flotillas', null, null, null, null, null, 'activa', null, 'Alta')$$, '42501', 'el operador no administra cuentas B2B');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert_fails($$select public.upsert_b2b_account(null, gen_random_uuid(), '$$ || :'A' || $$', '$$ || :'luis' || $$',
  'Luis', null, null, null, null, null, 'activa', null, 'Alta')$$, 'MG002', 'la cuenta se liga a un cliente empresa');
select pg_temp.assert_fails($$select public.upsert_b2b_account(null, gen_random_uuid(), '$$ || :'A' || $$', '$$ || :'flota' || $$',
  'Flotillas', null, 'rfc-malo', null, null, null, 'activa', null, 'Alta')$$, '23514', 'RFC con formato válido');
select (public.upsert_b2b_account(null, '20000000-0000-4000-8000-000000000001', :'A', :'flota', 'Flotillas SA',
  'Flotillas del Valle SA de CV', 'fva010101ab1', '601', '06600', 'Facturas@Flotillas.mx', 'activa', null, 'Alta de cuenta')).id as acc \gset
select pg_temp.assert(
  (select rfc = 'FVA010101AB1' and billing_email = 'facturas@flotillas.mx' and status = 'activa'
     from public.b2b_accounts where id = :'acc')
  and (public.upsert_b2b_account(null, '20000000-0000-4000-8000-000000000001', :'A', :'flota', 'Otra', null, null, null,
         null, null, 'activa', null, 'Reintento')).id = :'acc',
  'alta de cuenta con datos fiscales normalizados; idempotente por request_id');
select pg_temp.assert_fails($$select public.upsert_b2b_account(null, gen_random_uuid(), '$$ || :'A' || $$', '$$ || :'flota' || $$',
  'Duplicada', null, null, null, null, null, 'activa', null, 'Alta')$$, 'MG002', 'un cliente, una cuenta');
select from public.upsert_b2b_contact(:'acc', null, 'Laura Méndez', 'Compras', '+525512340000', 'laura@flotillas.mx', true, true, 'Contacto');
select from public.upsert_b2b_contact(:'acc', null, 'Pedro Ruiz', 'Flotilla', '+525512340001', null, true, true, 'Nuevo principal');
select pg_temp.assert(
  (select full_name from public.b2b_contacts where account_id = :'acc' and is_primary) = 'Pedro Ruiz'
  and pg_temp.n($$select 1 from public.b2b_contacts where account_id = '$$ || :'acc' || $$'$$) = 2,
  'contactos: un solo contacto principal');

-- Convenio por vehículo, vigente, sólo en A, lista de vehículos, límite de crédito.
select (public.upsert_b2b_agreement(:'acc', null, '21000000-0000-4000-8000-000000000001', 'Convenio 2026', 'por_vehiculo',
  :'today'::date - 10, :'today'::date + 30, 'activo', 'lista', 30::smallint, 6000, null, null, array[:'A'::uuid], null,
  'Alta de convenio')).id as ag \gset
select pg_temp.assert_fails($$select public.upsert_b2b_agreement('$$ || :'acc' || $$', null, gen_random_uuid(), 'Encimado',
  'por_vehiculo', current_date, current_date + 5, 'activo', 'lista', 30::smallint, null, null, null,
  array['$$ || :'A' || $$'::uuid], null, 'Alta')$$, 'MG002', 'un solo convenio activo por cuenta y fecha');
select from public.set_b2b_price_rule(:'ag', null, :'lavado', 'precio_fijo', 180, 0, true, null, 'Tarifa lavado');
select from public.set_b2b_price_rule(:'ag', null, null, 'descuento_pct', 10, 0, true, null, 'Descuento general');
select pg_temp.assert_fails($$select public.set_b2b_price_rule('$$ || :'ag' || $$', null, null, 'incluido', null, 0, true,
  null, 'Incluido')$$, 'MG002', '"incluido" sólo en paquete o iguala');
select pg_temp.assert_fails($$select public.set_b2b_price_rule('$$ || :'ag' || $$', null, null, 'descuento_pct', 150, 0, true,
  null, 'Descuento')$$, '22023', 'descuento entre 0 y 100 %');
select from public.set_b2b_vehicle(:'acc', :'car1', true, 'Ventas', 'Mario', null, 'Autorizado');
select pg_temp.assert_fails($$select public.set_b2b_vehicle('$$ || :'acc' || $$', '$$ || :'rcar' || $$', true, null, null, null,
  'Ajeno')$$, 'MG002', 'sólo vehículos de la flotilla de la empresa');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.set_b2b_price_rule('$$ || :'ag' || $$', null, '$$ || :'pulido' || $$', 'precio_fijo',
  1, 0, true, null, 'Rebaja')$$, '42501', 'el encargado no cambia tarifas del convenio');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails($$select public.set_b2b_price_rule('$$ || :'ag' || $$', null, '$$ || :'pulido' || $$', 'precio_fijo',
  1, 0, true, null, 'Rebaja')$$, '42501', 'el operador no cambia tarifas del convenio');
select pg_temp.assert(
  pg_temp.n('select 1 from public.b2b_price_rules') = 0 and pg_temp.n('select 1 from public.b2b_invoices') = 0
  and pg_temp.n('select 1 from public.b2b_accounts') = 1,
  'el operador del centro habilitado ve la cuenta, pero no las tarifas ni la facturación');
select pg_temp.assert_fails($$insert into public.b2b_price_rules (organization_id, agreement_id, kind, value)
  values ('0e000000-0000-0000-0000-000000000001', '$$ || :'ag' || $$', 'precio_fijo', 1)$$, '42501',
  'nadie escribe tarifas directamente');

-- ---------------------------------------------------------------------------
-- OS a cuenta B2B: tarifa convenida en la base
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select agreement_id = :'ag' and jsonb_array_length(vehicles) = 1 and vehicles -> 0 ->> 'plate' = 'FLT0001'
     from public.b2b_accounts_for_center(:'A') where account_id = :'acc'),
  'cuentas con convenio vigente en el centro y sólo sus vehículos autorizados');
select pg_temp.assert_fails($$select public.create_b2b_service_order('$$ || :'A' || $$', gen_random_uuid(), '$$ || :'acc' || $$',
  '$$ || :'car2' || $$', '[{"service_id":"$$ || :'lavado' || $$"}]')$$, 'MG002', 'vehículo no autorizado');
select (public.create_b2b_service_order(:'A', '30000000-0000-4000-8000-000000000001', :'acc', :'car1',
  jsonb_build_array(jsonb_build_object('service_id', :'lavado'), jsonb_build_object('service_id', :'pulido')), 'OC-1001')).id as os1 \gset
select pg_temp.assert(
  (select channel = 'b2b' and channel_reference = 'OC-1001' and b2b_account_id = :'acc' and b2b_agreement_id = :'ag'
          and client_id = :'flota' and total = 180 + 2520 and cost_total = 980 from public.service_orders where id = :'os1')
  and (select unit_price = 180 and list_unit_price = 250 and price_source = 'convenio' from pg_temp.line(:'os1', :'lavado'))
  and (select unit_price = 2520 and list_unit_price = 2800 and price_source = 'convenio' from pg_temp.line(:'os1', :'pulido')),
  'OS a cuenta B2B: precio fijo del servicio sobre el descuento general, precio de lista guardado');
select pg_temp.assert(
  (public.create_b2b_service_order(:'A', '30000000-0000-4000-8000-000000000001', :'acc', :'car1', '[]')).id = :'os1',
  'crear la OS B2B es idempotente por request_id');
select pg_temp.assert_fails($$update public.service_order_items set unit_price = 1
  where service_order_id = '$$ || :'os1' || $$'$$, '22023', 'la tarifa de la línea queda congelada');
select pg_temp.assert_fails($$select public.add_service_order_discount('$$ || :'os1' || $$', pg_temp.v('$$ || :'os1' || $$'), null,
  'percent', 5, 'Cortesía')$$, '42501', 'el operador no ajusta la tarifa del convenio con descuentos');
select pg_temp.assert_fails($$select public.update_service_order_details('$$ || :'os1' || $$', pg_temp.v('$$ || :'os1' || $$'), 'b2c',
  null, null, null, null, null, null, null, null, null, null, null)$$, '22023', 'una OS a cuenta B2B conserva el canal');
do $$ begin perform set_config('app.change_reason', 'Intento', true); end $$;
select pg_temp.assert_fails($$update public.service_orders set b2b_account_id = null, b2b_agreement_id = null
  where id = '$$ || :'os1' || $$'$$, '42501', 'la cuenta de la OS sólo cambia por las RPC B2B');
do $$ begin perform set_config('app.change_reason', '', true); end $$;
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select from public.add_service_order_discount(:'os1', pg_temp.v(:'os1'), null, 'amount', 20, 'Ajuste autorizado');
select pg_temp.assert((select total = 2680 from public.service_orders where id = :'os1'),
  'el encargado sí autoriza un ajuste sobre la tarifa (con motivo)');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert_fails($$select public.create_b2b_service_order('$$ || :'B' || $$', gen_random_uuid(), '$$ || :'acc' || $$',
  '$$ || :'car1' || $$', '[{"service_id":"$$ || :'lavado' || $$"}]')$$, '42501', 'centro no habilitado: la cuenta no opera ahí');
select pg_temp.assert(pg_temp.n('select 1 from public.b2b_accounts') = 0, 'el operador de un centro no habilitado no ve la cuenta');
reset role;

-- Varios centros: habilitar B.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select from public.upsert_b2b_agreement(:'acc', :'ag', null, 'Convenio 2026', 'por_vehiculo', :'today'::date - 10,
  :'today'::date + 30, 'activo', 'lista', 30::smallint, 6000, null, null, array[:'A'::uuid, :'B'::uuid], null, 'Abre Monterrey');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select (public.create_b2b_service_order(:'B', gen_random_uuid(), :'acc', :'car1',
  jsonb_build_array(jsonb_build_object('service_id', :'lavado')), 'OC-2001')).id as osb \gset
select pg_temp.assert(
  (select detail_center_id = :'B' and total = 180 from public.service_orders where id = :'osb'),
  'la cuenta opera en varios centros autorizados con la misma tarifa');
select pg_temp.assert_fails($$select public.create_b2b_service_order('$$ || :'B' || $$', gen_random_uuid(), '$$ || :'acc' || $$',
  '$$ || :'car1' || $$', '[{"service_id":"$$ || :'pulido' || $$","quantity":2}]')$$, 'MG002',
  'límite de crédito: la exposición no supera el límite');
select from public.set_service_order_status(:'osb', pg_temp.v(:'osb'), 'cancelada', 'Prueba');
reset role;

-- OS desde otro flujo (abierta) + aplicar la cuenta después.
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_service_order(:'A', gen_random_uuid(), :'flota', :'car1',
  jsonb_build_array(jsonb_build_object('service_id', :'lavado'), jsonb_build_object('service_id', :'aroma')))).id as os2 \gset
select pg_temp.assert((select total = 340 and channel = 'b2c' from public.service_orders where id = :'os2'),
  'una OS normal de la empresa tiene precio de lista');
select from public.apply_b2b_account(:'os2', pg_temp.v(:'os2'), :'acc', 'OC-1002');
select pg_temp.assert(
  (select channel = 'b2b' and b2b_agreement_id = :'ag' and total = 180 + 81 from public.service_orders where id = :'os2'),
  'aplicar la cuenta a una OS abierta re-precia sus líneas con el convenio');
select pg_temp.assert_fails($$select public.apply_b2b_account('$$ || :'os2' || $$', pg_temp.v('$$ || :'os2' || $$'), '$$ || :'acc' || $$')$$,
  'MG002', 'no se aplica dos veces');
select from public.set_service_order_status(:'os2', pg_temp.v(:'os2'), 'cancelada', 'Duplicada');
reset role;

-- ---------------------------------------------------------------------------
-- Convenio vencido: no se aplica automáticamente
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_b2b_service_order(:'A', gen_random_uuid(), :'acc', :'car1',
  jsonb_build_array(jsonb_build_object('service_id', :'lavado')), 'OC-1003')).id as os3 \gset
reset role;
set session_replication_role = replica;
update public.b2b_agreements set starts_on = :'today'::date - 60, ends_on = :'today'::date - 1 where id = :'ag';
set session_replication_role = origin;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select from public.set_service_order_item(:'os3', pg_temp.v(:'os3'), :'aroma', 1, null);
select pg_temp.assert(
  (select unit_price = 90 and price_source <> 'convenio' and b2b_price_rule_id is null from pg_temp.line(:'os3', :'aroma'))
  and (select unit_price = 180 from pg_temp.line(:'os3', :'lavado')),
  'convenio vencido: las líneas nuevas van a precio de lista; las ya vendidas conservan su tarifa');
select pg_temp.assert_fails($$select public.create_b2b_service_order('$$ || :'A' || $$', gen_random_uuid(), '$$ || :'acc' || $$',
  '$$ || :'car1' || $$', '[{"service_id":"$$ || :'lavado' || $$"}]')$$, 'MG002', 'con el convenio vencido no se abre OS a cuenta');
select pg_temp.assert(pg_temp.n($$select 1 from public.b2b_accounts_for_center('$$ || :'A' || $$')$$) = 0,
  'la cuenta vencida no aparece para abrir OS');
reset role;
set session_replication_role = replica;
update public.b2b_agreements set starts_on = :'today'::date - 10, ends_on = :'today'::date + 30 where id = :'ag';
set session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- Volumen mensual, paquete e iguala
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select (public.upsert_b2b_account(null, gen_random_uuid(), :'A', :'rutas', 'Rutas del Centro', null, null, null, null, null,
  'activa', null, 'Alta')).id as acc2 \gset
select (public.upsert_b2b_agreement(:'acc2', null, gen_random_uuid(), 'Volumen', 'volumen_mensual', :'today'::date - 5,
  :'today'::date + 60, 'activo', 'cualquiera', 15::smallint, null, null, null, array[:'A'::uuid], null, 'Alta')).id as ag2 \gset
select from public.set_b2b_price_rule(:'ag2', null, :'lavado', 'precio_fijo', 200, 0, true, null, 'Base');
select from public.set_b2b_price_rule(:'ag2', null, :'lavado', 'precio_fijo', 150, 2, true, null, 'Desde 2 OS al mes');
select (public.upsert_b2b_account(null, gen_random_uuid(), :'A', :'hotel', 'Hotel Sol', null, null, null, null, null,
  'activa', null, 'Alta')).id as acc3 \gset
select (public.upsert_b2b_agreement(:'acc3', null, gen_random_uuid(), 'Iguala', 'iguala', :'today'::date - 40,
  :'today'::date + 300, 'activo', 'cualquiera', 30::smallint, null, 1000, 2, array[:'A'::uuid], null, 'Alta')).id as ag3 \gset
select from public.set_b2b_price_rule(:'ag3', null, :'lavado', 'incluido', null, 0, true, null, 'Incluido en la iguala');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_b2b_service_order(:'A', gen_random_uuid(), :'acc2', :'rcar',
  jsonb_build_array(jsonb_build_object('service_id', :'lavado')), 'R-1')).id as v1 \gset
select (public.create_b2b_service_order(:'A', gen_random_uuid(), :'acc2', :'rcar',
  jsonb_build_array(jsonb_build_object('service_id', :'lavado')), 'R-2')).id as v2 \gset
select pg_temp.assert(
  (select unit_price = 200 from pg_temp.line(:'v1', :'lavado')) and (select unit_price = 150 from pg_temp.line(:'v2', :'lavado')),
  'volumen mensual: el escalón aplica al alcanzar 2 OS en el mes');

select (public.create_b2b_service_order(:'A', gen_random_uuid(), :'acc3', :'hcar',
  jsonb_build_array(jsonb_build_object('service_id', :'lavado', 'quantity', 2)), 'H-1')).id as h1 \gset
select (public.create_b2b_service_order(:'A', gen_random_uuid(), :'acc3', :'hcar',
  jsonb_build_array(jsonb_build_object('service_id', :'lavado')), 'H-2')).id as h2 \gset
select pg_temp.assert(
  (select unit_price = 0 and price_source = 'convenio' from pg_temp.line(:'h1', :'lavado'))
  and (select unit_price = 250 and price_source <> 'convenio' from pg_temp.line(:'h2', :'lavado')),
  'iguala: incluido hasta agotar las unidades del mes; después, precio de lista');
select pg_temp.assert_fails($$select public.set_service_order_item('$$ || :'h1' || $$', pg_temp.v('$$ || :'h1' || $$'),
  '$$ || :'lavado' || $$', 3, null)$$, 'MG002', 'una línea incluida no supera las unidades del periodo');
reset role;

-- Paquete: las unidades incluidas cuentan en toda la vigencia (no por mes).
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000005', 'Taxis Unidos', '5599990000', null, 'company',
  null, '{}', 'web', '[{"make":"Nissan","model":"Versa","year":2024,"plate":"TAX0001"}]'::jsonb)).id as taxis \gset
select id as tcar from public.vehicles where plate = 'TAX0001' \gset
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select (public.upsert_b2b_account(null, gen_random_uuid(), :'A', :'taxis', 'Taxis Unidos', null, null, null, null, null,
  'activa', null, 'Alta')).id as acc4 \gset
select (public.upsert_b2b_agreement(:'acc4', null, gen_random_uuid(), 'Paquete 10', 'paquete', :'today'::date - 70,
  :'today'::date + 30, 'activo', 'cualquiera', 30::smallint, null, 1800, 3, array[:'A'::uuid], null, 'Alta')).id as ag4 \gset
select from public.set_b2b_price_rule(:'ag4', null, :'lavado', 'incluido', null, 0, true, null, 'Incluido');
select from public.set_b2b_price_rule(:'ag4', null, :'lavado', 'precio_fijo', 199, 0, true, null, 'Excedente');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_b2b_service_order(:'A', gen_random_uuid(), :'acc4', :'tcar',
  jsonb_build_array(jsonb_build_object('service_id', :'lavado', 'quantity', 2)), 'T-1')).id as p1 \gset
reset role;
-- Una OS de hace dos meses también consumió su paquete.
set session_replication_role = replica;
update public.service_orders set created_at = now() - interval '60 days' where id = :'p1';
set session_replication_role = origin;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_b2b_service_order(:'A', gen_random_uuid(), :'acc4', :'tcar',
  jsonb_build_array(jsonb_build_object('service_id', :'lavado', 'quantity', 2)), 'T-2')).id as p2 \gset
select pg_temp.assert(
  (select unit_price = 0 from pg_temp.line(:'p1', :'lavado'))
  and (select unit_price = 199 and price_source = 'convenio' from pg_temp.line(:'p2', :'lavado')),
  'paquete: las unidades incluidas se agotan en la vigencia; el excedente toma la tarifa del convenio');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert((select fees_accrued = 1800 from public.b2b_account_statement(:'acc4')),
  'paquete: la cuota se devenga una vez');
reset role;

-- ---------------------------------------------------------------------------
-- Consumo, saldo por facturar / cobrar y pagos
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.deliver(:'os1');
select pg_temp.assert_fails($$select * from public.b2b_account_statement('$$ || :'acc' || $$')$$, '42501',
  'el operador no ve el estado de cuenta');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert_fails($$select public.create_b2b_invoice('$$ || :'acc' || $$', gen_random_uuid(), 'X-1', current_date,
  array['$$ || :'os1' || $$'::uuid], 0, null)$$, '42501', 'el contador consulta, pero no factura (rol de sólo lectura)');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert(
  (select consumption = 2680 and orders_to_invoice = 2680 and to_invoice = 2680 and receivable = 0
          and open_orders = 180 + 90 and exposure = 2680 + 270 and credit_limit = 6000 and credit_available = 6000 - 2950
     from public.b2b_account_statement(:'acc')),
  'estado de cuenta: consumo entregado, por facturar, comprometido y crédito disponible');
select (public.create_b2b_invoice(:'acc', '40000000-0000-4000-8000-000000000001', 'A-123', :'today'::date,
  array[:'os1'::uuid], 0, null)).id as inv \gset
select pg_temp.assert(
  (select amount = 2680 and due_on = :'today'::date + 30 from public.b2b_invoices where id = :'inv')
  and (select invoice_id = :'inv' and invoice_reference = 'CXC-000001 · A-123'
         from public.b2b_account_orders(:'acc', :'today'::date - 1, :'today'::date + 1) where id = :'os1')
  and (select to_invoice = 0 and invoiced = 2680 and receivable = 2680 from public.b2b_account_statement(:'acc')),
  'corte de facturación: agrupa las OS entregadas, vence según la condición de pago');
select pg_temp.assert_fails($$select public.create_b2b_invoice('$$ || :'acc' || $$', gen_random_uuid(), 'A-124', current_date,
  array['$$ || :'os3' || $$'::uuid], 0, null)$$, 'MG002', 'sólo OS entregadas y sin corte');
select pg_temp.assert_fails($$select public.record_b2b_payment('$$ || :'acc' || $$', gen_random_uuid(), 5000, 'transferencia',
  'SPEI', current_date)$$, 'MG002', 'el pago no supera el saldo por cobrar');
select (public.record_b2b_payment(:'acc', gen_random_uuid(), 1000, 'transferencia', 'SPEI 1', :'today'::date, :'inv')).id as pay \gset
select pg_temp.assert((select receivable = 1680 and paid = 1000 from public.b2b_account_statement(:'acc')),
  'pago parcial: baja el saldo por cobrar');
select pg_temp.assert_fails($$select public.void_b2b_invoice('$$ || :'inv' || $$', 'Error')$$, 'MG002',
  'no se anula un corte con pagos');
select from public.void_b2b_payment(:'pay', 'Pago rebotado');
select from public.void_b2b_invoice(:'inv', 'Se refactura');
select pg_temp.assert(
  (select invoice_id is null from public.b2b_account_orders(:'acc', :'today'::date - 1, :'today'::date + 1) where id = :'os1')
  and (select to_invoice = 2680 and receivable = 0 from public.b2b_account_statement(:'acc')),
  'anular el corte libera sus OS para facturarlas de nuevo');
select pg_temp.assert(
  (select fees_accrued = 2000 and to_invoice = 2000 + 0 from public.b2b_account_statement(:'acc3')),
  'iguala: cuotas devengadas por mes iniciado quedan por facturar');
select pg_temp.assert_fails($$select public.create_b2b_invoice('$$ || :'acc3' || $$', gen_random_uuid(), 'H-1', current_date,
  '{}', 3000, null)$$, 'MG002', 'no se factura más cuota que la devengada');
select pg_temp.assert(
  (select * from pg_temp.n($$select 1 from public.b2b_account_orders('$$ || :'acc' || $$', current_date - 1, current_date + 1)$$)) = 3
  and (select folio is not null and evidence_count = 0 and purchase_order = 'OC-1001'
         from public.b2b_account_orders(:'acc', :'today'::date - 1, :'today'::date + 1) where id = :'os1'),
  'OS de la cuenta con orden de compra y evidencias, sólo de los centros del usuario (no la de Monterrey)');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(
  (select to_invoice = 2680 from public.b2b_account_statement(:'acc'))
  and pg_temp.n('select 1 from public.b2b_invoices') = 1
  and pg_temp.n($$select 1 from public.b2b_profitability_facts(array['$$ || :'A' || $$'::uuid], current_date - 30, current_date)$$) > 0,
  'el contador consulta estado de cuenta, cortes y rentabilidad');
reset role;

-- ---------------------------------------------------------------------------
-- Rentabilidad por cuenta y centro
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(
  (select orders = 1 and revenue = 2680 and cost = 980 and fee_revenue = 0
     from public.b2b_profitability_facts(array[:'A'::uuid, :'B'::uuid], :'today'::date - 30, :'today'::date)
    where account_id = :'acc' and detail_center_id = :'A')
  and (select fee_revenue = 2000 and orders = 0
     from public.b2b_profitability_facts(array[:'A'::uuid], :'today'::date - 60, :'today'::date)
    where account_id = :'acc3'),
  'rentabilidad: ingreso y costo de OS terminadas por cuenta y centro; cuotas en el centro gestor');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.b2b_profitability_facts(array['$$ || :'A' || $$'::uuid], current_date - 30, current_date)$$) = 0,
  'el operador no ve la rentabilidad B2B');
reset role;

select pg_temp.assert(
  exists (select 1 from public.audit_log where table_name = 'public.b2b_price_rules' and reason = 'Tarifa lavado')
  and exists (select 1 from public.audit_log where table_name = 'public.b2b_agreement_centers' and reason = 'Abre Monterrey')
  and exists (select 1 from public.audit_log where table_name = 'public.b2b_invoices' and reason = 'Se refactura'),
  'auditoría de tarifas, centros habilitados y facturación con motivo');

rollback;
