-- Ajustes de seguridad pendientes (ADR 0046): el contador sólo ve la bitácora de
-- cobranza, caja, egresos y cuentas por cobrar B2B; los números de prueba del
-- asistente sólo salen por get_assistant_settings; y el límite de usos de las
-- promociones y las unidades incluidas B2B se cuentan con candado.
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

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@o1'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio'),
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'contador');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion');

-- ---------------------------------------------------------------------------
-- Bitácora del contador
-- ---------------------------------------------------------------------------
insert into public.audit_log (organization_id, detail_center_id, table_name, record_id, action, new_data) values
  ('0e000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'public.clients', 'x1', 'INSERT',
   '{"full_name": "José Pérez", "phone": "+525512345678"}'),
  ('0e000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'public.service_orders', 'x2', 'UPDATE',
   '{"client_name": "José Pérez"}'),
  ('0e000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'public.payments', 'x3', 'INSERT',
   '{"amount": 500}'),
  ('0e000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'public.expenses', 'x4', 'INSERT',
   '{"amount": 1200}');
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(
  (select string_agg(table_name, ',' order by table_name) from public.audit_log where record_id like 'x%')
    = 'public.expenses,public.payments'
  and not exists (select 1 from public.audit_log where table_name in ('public.clients', 'public.service_orders')),
  'el contador ve la bitácora de cobranza y egresos, no la de clientes ni la de OS (datos personales)');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert((select count(*) = 4 from public.audit_log where record_id like 'x%'), 'el admin sigue viendo toda la bitácora');
reset role;

-- ---------------------------------------------------------------------------
-- Números de prueba del asistente
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select from public.update_assistant_settings('0e000000-0000-0000-0000-000000000001', 1, 'prueba', 'claude-opus-5-5',
  'Asistente', 'Cordial', null, null, null, null, 'colonia', 14, 2, true, true, array['5215533334444'], 'Modo prueba');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  (select mode = 'prueba' from public.bot_settings where organization_id = '0e000000-0000-0000-0000-000000000001')
  and (select test_numbers = '{}' from public.get_assistant_settings('0e000000-0000-0000-0000-000000000001')),
  'recepción ve el modo del asistente, pero no los números de prueba');
select pg_temp.assert_fails($$select test_numbers from public.bot_settings$$, '42501',
  'recepción no lee los números de prueba directo de la tabla');
reset role;

-- ---------------------------------------------------------------------------
-- Candados de concurrencia
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select bool_and(p.provolatile = 'v' and pg_get_functiondef(p.oid) like '%pg_advisory_xact_lock%')
     from pg_proc p
    where p.oid in ('private.find_promotion(uuid, uuid, text)'::regprocedure,
                    'private.b2b_line_price(uuid, uuid, numeric, integer)'::regprocedure)),
  'el límite de usos de la promoción y las unidades incluidas B2B se cuentan con candado');

rollback;
