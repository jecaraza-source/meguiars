-- Lotes de insumos con caducidad (20261114000000_supply_lots).
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

grant execute on all functions in schema pg_temp to authenticated, anon;

\set O1 '0e000000-0000-0000-0000-000000000001'
\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set B 'bbbbbbbb-0000-0000-0000-000000000000'
\set CORP '00000000-0000-0000-0000-0000000000a1'
\set REC '00000000-0000-0000-0000-0000000000f1'
\set TEC '00000000-0000-0000-0000-0000000000c1'
\set CONT '00000000-0000-0000-0000-0000000000d1'

insert into auth.users (id, email) values
  (:'CORP', 'corp@o1'), (:'REC', 'recepcion@a'), (:'TEC', 'tecnico@a'), (:'CONT', 'contador@a');
insert into public.organizations (id, slug, name) values (:'O1', 'org-uno', 'Org uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  (:'A', :'O1', 'A-01', 'Centro Polanco', 'America/Mexico_City'),
  (:'B', :'O1', 'B-01', 'Centro Monterrey', 'America/Monterrey');
insert into public.role_assignments (organization_id, user_id, role) values (:'O1', :'CORP', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  (:'A', :'REC', 'operador_recepcion'), (:'A', :'TEC', 'tecnico'), (:'A', :'CONT', 'contador');
insert into public.inventory_items (id, organization_id, code, name, unit, unit_cost) values
  ('11111111-0000-0000-0000-000000000001', :'O1', 'SHAMPOO', 'Shampoo', 'l', 80),
  ('11111111-0000-0000-0000-000000000002', :'O1', 'CERA', 'Cera', 'ml', 1.5);

select pg_temp.assert(
  private.supply_lot_state(date '2026-10-29', date '2026-10-30') = 'caducado'
  and private.supply_lot_state(date '2026-11-29', date '2026-10-30') = 'por_caducar'
  and private.supply_lot_state(date '2026-11-30', date '2026-10-30') = 'vigente'
  and private.supply_lot_state(date '2026-10-30', date '2026-10-30') = 'por_caducar',
  'estado: caducado antes de hoy; por caducar hasta 30 días; vigente después');

-- Recepción registra lotes en su centro.
select pg_temp.login(:'REC');
select (now() at time zone 'America/Mexico_City')::date as today \gset
select public.register_supply_lot(:'A', 'cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
  ' l-2024a ', (:'today'::date - 3), null, 5, 'Caja 1') as lot_old \gset
select pg_temp.assert(
  public.register_supply_lot(:'A', 'cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
    'otro', (:'today'::date + 400), null, null, null) = :'lot_old'::uuid,
  'mismo request_id, mismo lote');
select public.register_supply_lot(:'A', gen_random_uuid(), '11111111-0000-0000-0000-000000000002',
  'C-77', (:'today'::date + 10), (:'today'::date - 1), null, null) as lot_soon \gset
select public.register_supply_lot(:'A', gen_random_uuid(), '11111111-0000-0000-0000-000000000002',
  'C-78', (:'today'::date + 200), null, null, null) as lot_ok \gset
select pg_temp.assert(
  (select array_agg(lot_code || ':' || state || ':' || days_left order by expires_on) from public.supply_lots_for_center(:'A'))
    = array['L-2024A:caducado:-3', 'C-77:por_caducar:10', 'C-78:vigente:200'],
  'lista con el estado del día del centro, la próxima a caducar primero');
select pg_temp.assert_fails(format($$select public.register_supply_lot(%L, gen_random_uuid(), %L, 'X', %L, %L, null, null)$$,
  :'A', '11111111-0000-0000-0000-000000000001', :'today'::date + 5, :'today'::date + 1),
  '22023', 'la recepción no es futura');
select pg_temp.assert_fails(format($$select public.register_supply_lot(%L, gen_random_uuid(), %L, 'X', %L, null, null, null)$$,
  :'B', '11111111-0000-0000-0000-000000000001', :'today'::date + 5),
  '42501', 'no registra lotes en otro centro');
select pg_temp.assert_fails(format($$update public.supply_lots set expires_on = expires_on + 100 where id = %L$$, :'lot_old'),
  '42501', 'la caducidad no se edita a mano');

-- Retirar el caducado, con versión y motivo.
select pg_temp.assert_fails(format($$select public.close_supply_lot(%L, 9, 'retirado', 'Caducó')$$, :'lot_old'),
  '40001', 'versión vieja');
select pg_temp.assert(public.close_supply_lot(:'lot_old', 1, 'retirado', 'Caducó, se tiró') = 2, 'retira el caducado');
select pg_temp.assert_fails(format($$select public.close_supply_lot(%L, 2, 'agotado', 'otra vez')$$, :'lot_old'),
  'MG002', 'un lote cerrado no se vuelve a cerrar');
select pg_temp.assert(
  (select count(*) = 2 from public.supply_lots_for_center(:'A'))
  and (select status || ':' || coalesce(state, '-') from public.supply_lots_for_center(:'A', true) where id = :'lot_old') = 'retirado:-',
  'los cerrados salen de la lista activa y se ven en el historial');
reset role;
select pg_temp.assert(
  exists (select 1 from public.audit_log where table_name = 'public.supply_lots' and reason = 'Caducó, se tiró'),
  'el cierre queda auditado');

-- Técnico y contador no ven lotes; el corporativo sí.
select pg_temp.login(:'TEC');
select pg_temp.assert(not exists (select 1 from public.supply_lots), 'el técnico no ve lotes');
reset role;
select pg_temp.login(:'CONT');
select pg_temp.assert(not exists (select 1 from public.supply_lots_for_center(:'A')), 'el contador no ve lotes');
reset role;
select pg_temp.login(:'CORP');
select pg_temp.assert((select count(*) = 3 from public.supply_lots), 'el admin corporativo ve los lotes');
reset role;

rollback;
