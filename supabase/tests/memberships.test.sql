-- Pruebas de C1: planes, alta de membresía con condiciones congeladas, estados,
-- redención idempotente con control de usos por periodo, renovación manual,
-- visibilidad por centro, KPIs sin datos personales y auditoría.
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

grant execute on all functions in schema pg_temp to authenticated, anon;

-- Reglas puras (espejo del dominio: membershipStatus y membershipPeriod).
select pg_temp.assert(
  private.membership_status('activa', '2026-10-31', 7::smallint, '2026-10-20') = 'activa'
  and private.membership_status('activa', '2026-10-31', 7::smallint, '2026-10-24') = 'proxima_a_vencer'
  and private.membership_status('activa', '2026-10-31', 7::smallint, '2026-10-31') = 'proxima_a_vencer'
  and private.membership_status('activa', '2026-10-31', 7::smallint, '2026-11-01') = 'vencida'
  and private.membership_status('suspendida', '2026-10-31', 7::smallint, '2026-11-05') = 'suspendida'
  and private.membership_status('cancelada', '2026-10-31', 7::smallint, '2026-10-01') = 'cancelada',
  'estado efectivo: activa, próxima a vencer (≤ 7 días), vencida, suspendida y cancelada');
select pg_temp.assert(
  (select (period_start, period_end) = ('2026-01-31'::date, '2026-02-27'::date)
     from private.membership_period('2026-01-31', 1::smallint, '2026-02-27'))
  and (select (period_start, period_end) = ('2026-02-28'::date, '2026-03-30'::date)
     from private.membership_period('2026-01-31', 1::smallint, '2026-02-28'))
  and (select (period_start, period_end) = ('2026-04-15'::date, '2026-07-14'::date)
     from private.membership_period('2026-01-15', 3::smallint, '2026-06-01'))
  and (select period_start is null from private.membership_period('2026-05-01', 1::smallint, '2026-04-30')),
  'periodos de uso: bloques desde el ancla con recorte de fin de mes; antes del ancla no hay periodo');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@o1'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000f2', 'operador@b'),
  ('00000000-0000-0000-0000-0000000000b1', 'comercial@a');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Monterrey');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio'),
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'contador');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'comercial_b2b');

select private.center_today('aaaaaaaa-0000-0000-0000-000000000000') as today \gset

-- ---------------------------------------------------------------------------
-- Planes (admin corporativo)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'LAV', 'Lavado', null, 'recurrente', 40, 250, 80)).id as lavado \gset
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'POL', 'Pulido', null, 'valor_medio', 120, 2800, 900)).id as pulido \gset
select (public.upsert_membership_plan('0e000000-0000-0000-0000-000000000001', null, 'care', 'care', 'Care  mensual',
  'Lavados del mes', 499, 1::smallint, 'centro_origen', 'Sólo autos particulares', 7::smallint, null, null, true,
  'Alta del plan')).id as care \gset
select (public.upsert_membership_plan('0e000000-0000-0000-0000-000000000001', null, 'PLUS', 'plus', 'Plus',
  null, 899, 1::smallint, 'cualquier_centro', null, 7::smallint, null, null, true, 'Alta del plan')).id as plus \gset
select from public.set_membership_benefit(:'care', :'lavado', 2::smallint, null, 'Beneficio del plan');
select from public.set_membership_benefit(:'plus', :'lavado', 2::smallint, null, 'Beneficio del plan');
select from public.set_membership_benefit(:'plus', :'pulido', 1::smallint, null, 'Beneficio del plan');
select pg_temp.assert(
  (select code = 'CARE' and name = 'Care mensual' from public.membership_plans where id = :'care')
  and pg_temp.n($$select 1 from public.membership_benefits$$) = 3,
  'el admin corporativo crea planes (clave y nombre normalizados) y sus servicios incluidos');
select pg_temp.assert_fails($$select public.upsert_membership_plan('0e000000-0000-0000-0000-000000000001', null, 'X-1', 'gold',
  'X', null, 10, 1::smallint, 'centro_origen', null, 7::smallint, null, null, true, 'Intento')$$,
  '23514', 'el nivel del plan es care, plus o premium');
select pg_temp.assert_fails($$select public.upsert_membership_plan('0e000000-0000-0000-0000-000000000001', null, 'X-2', 'care',
  'X', null, 10, 2::smallint, 'centro_origen', null, 7::smallint, null, null, true, 'Intento')$$,
  '23514', 'la periodicidad es mensual, trimestral, semestral o anual');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.upsert_membership_plan('0e000000-0000-0000-0000-000000000001', null, 'X-3', 'care',
  'X', null, 10, 1::smallint, 'centro_origen', null, 7::smallint, null, null, true, 'Intento')$$,
  '42501', 'el encargado no crea planes');
select pg_temp.assert_fails($$select public.set_membership_benefit('$$ || :'care' || $$', '$$ || :'pulido' || $$', 1::smallint, null, 'Intento')$$,
  '42501', 'el encargado no cambia los beneficios de un plan');
reset role;

-- ---------------------------------------------------------------------------
-- Alta de membresía
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client('aaaaaaaa-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001',
  'José Pérez', '5512345678', null, 'person', null, '{}', 'web',
  '[{"make":"Mazda","model":"3","year":2021,"plate":"ABC1234"}]'::jsonb)).id as client \gset
select id as vehicle from public.vehicles where plate = 'ABC1234' \gset
select (public.create_client('aaaaaaaa-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000002',
  'Ana Ruiz', '5598765432', null, 'person', null, '{}', 'web',
  '[{"make":"Kia","model":"Rio","year":2022,"plate":"XYZ9876"}]'::jsonb)).id as client2 \gset
select id as vehicle2 from public.vehicles where plate = 'XYZ9876' \gset

select (public.create_membership('aaaaaaaa-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000001',
  :'care', :'client', :'vehicle', null, 'Efectivo #881')).id as mem \gset
select pg_temp.assert(
  (select number = 'MEM-000001' and state = 'activa' and price = 499 and period_anchor = :'today'::date
     and ends_on = (:'today'::date + interval '1 month')::date - 1 and jsonb_array_length(benefits) = 1
     from public.memberships where id = :'mem')
  and (select kind = 'alta' and amount = 499 and data->>'payment_reference' = 'Efectivo #881'
         from public.membership_events where membership_id = :'mem'),
  'alta por cliente y vehículo: número MEM-000001, periodo de un mes, beneficios congelados y evento con el cobro');
select pg_temp.assert(
  (public.create_membership('aaaaaaaa-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000001',
     :'care', :'client', :'vehicle')).id = :'mem'
  and pg_temp.n($$select 1 from public.memberships$$) = 1,
  'el alta es idempotente por request_id (doble envío, web y móvil)');
select pg_temp.assert_fails($$select public.create_membership('aaaaaaaa-0000-0000-0000-000000000000',
  '20000000-0000-4000-8000-000000000009', '$$ || :'plus' || $$', '$$ || :'client' || $$', '$$ || :'vehicle' || $$')$$,
  'MG002', 'un vehículo tiene a lo sumo una membresía abierta');
select pg_temp.assert_fails($$select public.create_membership('aaaaaaaa-0000-0000-0000-000000000000',
  '20000000-0000-4000-8000-000000000008', '$$ || :'care' || $$', '$$ || :'client' || $$', '$$ || :'vehicle2' || $$')$$,
  '22023', 'el vehículo debe ser del cliente');
select pg_temp.assert_fails($$select public.create_membership('aaaaaaaa-0000-0000-0000-000000000000',
  '20000000-0000-4000-8000-000000000007', '$$ || :'care' || $$', '$$ || :'client2' || $$', '$$ || :'vehicle2' || $$',
  current_date - 5)$$,
  '22023', 'no se da de alta con fecha pasada');
reset role;

-- Cambiar el plan no altera las membresías vendidas.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select from public.upsert_membership_plan('0e000000-0000-0000-0000-000000000001', :'care', 'CARE', 'care', 'Care mensual',
  'Lavados del mes', 599, 1::smallint, 'centro_origen', 'Sólo autos particulares', 7::smallint, null, null, true,
  'Ajuste de precio 2027');
select from public.set_membership_benefit(:'care', :'lavado', 5::smallint, null, 'Más lavados');
select pg_temp.assert(
  (select price = 499 and (benefits->0->>'quantity_per_period')::int = 2 from public.memberships where id = :'mem'),
  'la membresía conserva precio y beneficios del plan adquirido');
select from public.set_membership_benefit(:'care', :'lavado', 2::smallint, null, 'Regreso a 2 lavados');
select from public.upsert_membership_plan('0e000000-0000-0000-0000-000000000001', :'plus', 'PLUS', 'plus', 'Plus',
  null, 899, 1::smallint, 'cualquier_centro', null, 7::smallint, null, null, false, 'Pausa de ventas');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails($$select public.create_membership('aaaaaaaa-0000-0000-0000-000000000000',
  '20000000-0000-4000-8000-000000000006', '$$ || :'plus' || $$', '$$ || :'client2' || $$', '$$ || :'vehicle2' || $$')$$,
  'MG002', 'un plan inactivo o fuera de vigencia no se vende');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select from public.upsert_membership_plan('0e000000-0000-0000-0000-000000000001', :'plus', 'PLUS', 'plus', 'Plus',
  null, 899, 1::smallint, 'cualquier_centro', null, 7::smallint, null, null, true, 'Reactivar ventas');
reset role;

-- ---------------------------------------------------------------------------
-- Redención desde la OS
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  (select quantity_per_period = 2 and used = 0 and remaining = 2 and period_start = :'today'::date
     from public.membership_balance(:'mem')),
  'saldo del periodo: 2 lavados disponibles');
select (public.create_service_order('aaaaaaaa-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000001',
  :'client', :'vehicle',
  jsonb_build_array(jsonb_build_object('service_id', :'lavado', 'quantity', 2), jsonb_build_object('service_id', :'pulido')),
  'b2c', null)).id as os \gset
select id as lav_line from public.service_order_items where service_order_id = :'os' and service_code = 'LAV' \gset
select id as pol_line from public.service_order_items where service_order_id = :'os' and service_code = 'POL' \gset

select pg_temp.assert_fails($$select public.redeem_membership_benefit('$$ || :'os' || $$', $$ || pg_temp.v(:'os') || $$,
  '$$ || :'pol_line' || $$', '$$ || :'mem' || $$', 1::smallint, '40000000-0000-4000-8000-000000000009')$$,
  'MG002', 'no se redime un servicio que el plan no incluye');
select pg_temp.assert_fails($$select public.redeem_membership_benefit('$$ || :'os' || $$', $$ || pg_temp.v(:'os') - 1 || $$,
  '$$ || :'lav_line' || $$', '$$ || :'mem' || $$', 2::smallint, '40000000-0000-4000-8000-000000000008')$$,
  '40001', 'la redención respeta la versión de la OS (concurrencia)');
select (public.redeem_membership_benefit(:'os', pg_temp.v(:'os'), :'lav_line', :'mem', 2::smallint,
  '40000000-0000-4000-8000-000000000001')).id as red \gset
select pg_temp.assert(
  (select total = 2800 and discount_total = 500 and channel = 'membresia' and channel_reference = 'MEM-000001'
     from public.service_orders where id = :'os')
  and (select source = 'membresia' and amount = 500 and item_id = :'lav_line'
         from public.service_order_discounts where service_order_id = :'os')
  and (select used = 2 and remaining = 0 from public.membership_balance(:'mem')),
  'redimir 2 lavados: descuento de membresía de $500, la OS queda en canal membresía y el saldo en 0');
select pg_temp.assert(
  (public.redeem_membership_benefit(:'os', pg_temp.v(:'os'), :'lav_line', :'mem', 2::smallint,
     '40000000-0000-4000-8000-000000000001')).id = :'red'
  and pg_temp.n($$select 1 from public.membership_redemptions$$) = 1
  and pg_temp.n($$select 1 from public.service_order_discounts where source = 'membresia'$$) = 1,
  'la redención es idempotente por request_id');
select pg_temp.assert(
  (select kind = 'redencion' and detail_center_id = 'aaaaaaaa-0000-0000-0000-000000000000'
     and data->>'service_code' = 'LAV' and (data->>'quantity')::int = 2 and actor_id = '00000000-0000-0000-0000-0000000000f1'
     from public.membership_events where membership_id = :'mem' and kind = 'redencion'),
  'la redención queda trazada: OS, servicio, cantidad, centro y actor');

select (public.create_service_order('aaaaaaaa-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000002',
  :'client', :'vehicle', jsonb_build_array(jsonb_build_object('service_id', :'lavado')), 'b2c', null)).id as os2 \gset
select id as lav2 from public.service_order_items where service_order_id = :'os2' \gset
select pg_temp.assert_fails($$select public.redeem_membership_benefit('$$ || :'os2' || $$', $$ || pg_temp.v(:'os2') || $$,
  '$$ || :'lav2' || $$', '$$ || :'mem' || $$', 1::smallint, '40000000-0000-4000-8000-000000000002')$$,
  'MG002', 'sin saldo en el periodo no se redime (control de usos)');

-- Los descuentos manuales no cuentan la membresía para su nivel de autorización.
select pg_temp.assert(
  (select discount_total = 780 from public.add_service_order_discount(:'os', pg_temp.v(:'os'), null, 'percent', 10, 'Cliente frecuente')),
  'el operador aplica 10 % manual: el % acumulado excluye el descuento de membresía');
select id as mdisc from public.service_order_discounts where source = 'membresia' \gset
select pg_temp.assert_fails($$select public.void_service_order_discount('$$ || :'mdisc' || $$', $$ || pg_temp.v(:'os') || $$, 'Intento')$$,
  'MG002', 'el descuento de membresía sólo se anula desde la redención');
select pg_temp.assert_fails($$select public.set_service_order_item('$$ || :'os' || $$', $$ || pg_temp.v(:'os') || $$,
  '$$ || :'lavado' || $$', 0, 'Quitar')$$,
  'MG002', 'una línea redimida no se quita sin anular la redención');
select pg_temp.assert_fails($$select public.void_membership_redemption('$$ || :'red' || $$', $$ || pg_temp.v(:'os') || $$, '')$$,
  '22023', 'anular una redención exige motivo');
select from public.void_membership_redemption(:'red', pg_temp.v(:'os'), 'Cliente pagó el lavado');
select pg_temp.assert(
  (select voided_at is not null and void_reason = 'Cliente pagó el lavado' from public.membership_redemptions where id = :'red')
  and (select voided_at is not null from public.service_order_discounts where id = :'mdisc')
  and (select used = 0 and remaining = 2 from public.membership_balance(:'mem'))
  and pg_temp.n($$select 1 from public.membership_events where kind = 'redencion_anulada'$$) = 1,
  'anular la redención anula su descuento, libera el uso y queda en el historial');
select from public.set_service_order_item(:'os', pg_temp.v(:'os'), :'lavado', 0, 'Quitar');
select pg_temp.assert(
  (select item_id is null and service_code = 'LAV' from public.membership_redemptions where id = :'red'),
  'quitar la línea después conserva la redención anulada (trazabilidad)');
select (public.redeem_membership_benefit(:'os2', pg_temp.v(:'os2'), :'lav2', :'mem', 1::smallint,
  '40000000-0000-4000-8000-000000000003')).id as red2 \gset
reset role;

-- ---------------------------------------------------------------------------
-- Estados: vencida, suspendida, cancelada; renovación
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails($$select public.set_membership_state('$$ || :'mem' || $$', 'suspendida', 'Falta de pago')$$,
  '42501', 'el operador no suspende membresías');
select pg_temp.assert_fails($$select public.renew_membership('$$ || :'mem' || $$', '50000000-0000-4000-8000-000000000001')$$,
  'MG002', 'una membresía activa lejos del vencimiento no se renueva todavía');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert(
  (select state = 'suspendida' and suspended_at is not null from public.set_membership_state(:'mem', 'suspendida', 'Pago rechazado')),
  'el encargado suspende con motivo');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_service_order('aaaaaaaa-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000003',
  :'client', :'vehicle', jsonb_build_array(jsonb_build_object('service_id', :'lavado')), 'b2c', null)).id as os3 \gset
select id as lav3 from public.service_order_items where service_order_id = :'os3' \gset
select pg_temp.assert_fails($$select public.redeem_membership_benefit('$$ || :'os3' || $$', $$ || pg_temp.v(:'os3') || $$,
  '$$ || :'lav3' || $$', '$$ || :'mem' || $$', 1::smallint, '40000000-0000-4000-8000-000000000004')$$,
  'MG002', 'una membresía suspendida no redime');
select pg_temp.assert(
  (select status = 'suspendida' from public.list_memberships('aaaaaaaa-0000-0000-0000-000000000000') where id = :'mem'),
  'el listado muestra el estado efectivo');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select from public.set_membership_state(:'mem', 'activa', 'Pago aclarado');
reset role;

-- Próxima a vencer (faltan 3 días): se renueva con las MISMAS condiciones adquiridas.
set session_replication_role = replica;
select (:'today'::date + 4 - interval '1 month')::date as anchor \gset
update public.memberships
   set started_on = :'anchor', period_anchor = :'anchor', ends_on = (:'anchor'::date + interval '1 month')::date - 1
 where id = :'mem';
set session_replication_role = origin;
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert(
  (select status = 'proxima_a_vencer' from public.list_memberships('aaaaaaaa-0000-0000-0000-000000000000') where id = :'mem'),
  'a días del vencimiento (aviso de 7) la membresía está próxima a vencer');
select pg_temp.assert(
  (select price = 499 and renewals = 1 and period_anchor = :'anchor'::date
     and ends_on = (:'anchor'::date + interval '2 months')::date - 1
     from public.renew_membership(:'mem', '50000000-0000-4000-8000-000000000002', null, 'Transferencia 1234')),
  'renovar antes de vencer agrega un periodo con el precio adquirido ($499, no $599)');
select pg_temp.assert(
  (public.renew_membership(:'mem', '50000000-0000-4000-8000-000000000002')).renewals = 1
  and pg_temp.n($$select 1 from public.membership_events where kind = 'renovacion'$$) = 1,
  'la renovación es idempotente por request_id');
select pg_temp.assert(
  (select amount = 499 and from_state = 'proxima_a_vencer' and data->>'payment_reference' = 'Transferencia 1234'
     from public.membership_events where kind = 'renovacion'),
  'la renovación registra estado previo, monto y referencia de pago');
reset role;

-- Vencida: no redime; al renovar se reinicia hoy con otro plan (cambio de plan).
set session_replication_role = replica;
update public.memberships
   set started_on = :'today'::date - 40, period_anchor = :'today'::date - 40, ends_on = :'today'::date - 10
 where id = :'mem';
update public.membership_redemptions set period_start = period_start - 40, period_end = period_end - 40
 where membership_id = :'mem';
set session_replication_role = origin;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails($$select public.redeem_membership_benefit('$$ || :'os3' || $$', $$ || pg_temp.v(:'os3') || $$,
  '$$ || :'lav3' || $$', '$$ || :'mem' || $$', 1::smallint, '40000000-0000-4000-8000-000000000005')$$,
  'MG002', 'una membresía vencida no redime (fuera de vigencia)');
select pg_temp.assert(
  (select plan_code = 'PLUS' and price = 899 and period_anchor = :'today'::date and redeem_scope = 'cualquier_centro'
     and jsonb_array_length(benefits) = 2 and renewals = 2
     from public.renew_membership(:'mem', '50000000-0000-4000-8000-000000000003', :'plus')),
  'renovar vencida reinicia el periodo hoy con las condiciones vigentes del nuevo plan');
select pg_temp.assert(
  (select used = 0 and remaining = 2 from public.membership_balance(:'mem') where service_code = 'LAV'),
  'el nuevo periodo empieza con el saldo completo');
reset role;

-- ---------------------------------------------------------------------------
-- Multicentro
-- ---------------------------------------------------------------------------
-- Operador de B: PLUS se redime en cualquier centro si puede ver al cliente.
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.memberships$$) = 0,
  'el operador de B no ve membresías de A de clientes que no atiende');
select from public.link_client_to_center(:'client', 'bbbbbbbb-0000-0000-0000-000000000000', 'Visita en Monterrey');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.memberships$$) = 1,
  'con el cliente ligado a B ve la membresía PLUS (redimible en cualquier centro)');
select (public.create_service_order('bbbbbbbb-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000004',
  :'client', :'vehicle', jsonb_build_array(jsonb_build_object('service_id', :'pulido')), 'b2c', null)).id as osb \gset
select id as polb from public.service_order_items where service_order_id = :'osb' \gset
select pg_temp.assert(
  (select detail_center_id = 'bbbbbbbb-0000-0000-0000-000000000000' and membership_center_id = 'aaaaaaaa-0000-0000-0000-000000000000'
     from public.redeem_membership_benefit(:'osb', pg_temp.v(:'osb'), :'polb', :'mem', 1::smallint,
                                           '40000000-0000-4000-8000-000000000006')),
  'el operador de B redime el pulido de la membresía PLUS en su centro');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.membership_events where kind = 'alta'$$) = 1
  and pg_temp.n($$select 1 from public.membership_redemptions where detail_center_id = 'aaaaaaaa-0000-0000-0000-000000000000'$$) >= 1,
  'desde B se ven el historial y las redenciones hechas en A (el saldo cuenta todos los centros)');
select pg_temp.assert_fails($$select public.renew_membership('$$ || :'mem' || $$', '50000000-0000-4000-8000-000000000004')$$,
  '42501', 'la renovación es del centro de origen');
-- Cancelar la OS libera el uso.
select from public.set_service_order_status(:'osb', pg_temp.v(:'osb'), 'cancelada', 'Cliente no llegó');
select pg_temp.assert(
  (select void_reason = 'OS cancelada' from public.membership_redemptions where service_order_id = :'osb')
  and (select remaining = 1 from public.membership_balance(:'mem') where service_code = 'POL'),
  'cancelar la OS anula sus redenciones y libera el uso');
reset role;

-- CARE sólo se redime en su centro de origen.
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_membership('aaaaaaaa-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000002',
  :'care', :'client2', :'vehicle2')).id as mem2 \gset
select pg_temp.assert(
  (select number = 'MEM-000002' from public.memberships where id = :'mem2'),
  'el consecutivo de membresías es por organización');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select from public.link_client_to_center(:'client2', 'bbbbbbbb-0000-0000-0000-000000000000', 'Visita en Monterrey');
select (public.create_service_order('bbbbbbbb-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000005',
  :'client2', :'vehicle2', jsonb_build_array(jsonb_build_object('service_id', :'lavado')), 'b2c', null)).id as osb2 \gset
select id as lavb2 from public.service_order_items where service_order_id = :'osb2' \gset
select pg_temp.assert_fails($$select public.redeem_membership_benefit('$$ || :'osb2' || $$', $$ || pg_temp.v(:'osb2') || $$,
  '$$ || :'lavb2' || $$', '$$ || :'mem2' || $$', 1::smallint, '40000000-0000-4000-8000-000000000007')$$,
  '42501', 'una membresía de centro de origen no se ve ni se redime en otro centro');
reset role;

-- ---------------------------------------------------------------------------
-- KPIs, permisos y auditoría
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.memberships$$) = 0
  and pg_temp.n($$select 1 from public.membership_redemptions$$) = 0,
  'el contador no ve membresías ni redenciones (datos personales)');
select pg_temp.assert(
  (select count(*) = 2 and sum(price) = 899 + 599 and bool_and(new_in_range) and sum(renewals_in_range) = 2
          and sum(revenue_in_range) = 499 + 499 + 899 + 599 and sum(used_units) = 1
     from public.membership_metric_facts(array['aaaaaaaa-0000-0000-0000-000000000000'::uuid,
                                               'bbbbbbbb-0000-0000-0000-000000000000'::uuid],
                                         current_date - 60, current_date + 1)),
  'el contador lee hechos de KPIs sin datos personales: activas (la 2.ª vendida al precio nuevo), altas, renovaciones, uso e ingreso');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  pg_temp.n($$select * from public.membership_metric_facts(array['aaaaaaaa-0000-0000-0000-000000000000'::uuid], current_date - 1, current_date)$$) = 0,
  'el operador no consulta KPIs de membresías');
select pg_temp.assert_fails($$insert into public.membership_events (organization_id, membership_id, membership_center_id,
  detail_center_id, kind) select organization_id, id, detail_center_id, detail_center_id, 'alta' from public.memberships limit 1$$,
  '42501', 'nadie escribe el historial directamente');
select pg_temp.assert_fails($$delete from public.memberships where id = '$$ || :'mem2' || $$'$$,
  '42501', 'las membresías no se borran');
select pg_temp.assert_fails($$update public.memberships set ends_on = ends_on + 30 where id = '$$ || :'mem2' || $$'$$,
  '23514', 'sin RPC (sin motivo) no se alarga una membresía');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert(
  (select state = 'cancelada' and cancel_reason = 'Cliente se mudó'
     from public.set_membership_state(:'mem2', 'cancelada', 'Cliente se mudó')),
  'el encargado cancela con motivo');
select pg_temp.assert_fails($$select public.set_membership_state('$$ || :'mem2' || $$', 'activa', 'Reabrir')$$,
  '22023', 'una membresía cancelada no se reactiva');
select pg_temp.assert(
  (select kind = 'cancelacion' and from_state = 'activa' and to_state = 'cancelada' and reason = 'Cliente se mudó'
     from public.membership_events where membership_id = :'mem2' and kind = 'cancelacion'),
  'la cancelación queda en el historial con motivo');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  (public.create_membership('aaaaaaaa-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000003',
     :'plus', :'client2', :'vehicle2')).number = 'MEM-000003',
  'cancelar libera el vehículo para una nueva membresía');
reset role;
select pg_temp.assert(
  (select count(*) >= 5 from public.audit_log where table_name = 'public.memberships')
  and exists (select 1 from public.audit_log where table_name = 'public.membership_redemptions' and reason = 'Cliente pagó el lavado')
  and exists (select 1 from public.audit_log where table_name = 'public.membership_plans' and reason = 'Ajuste de precio 2027'),
  'auditoría con actor, valores anteriores y nuevos y motivo');

rollback;
