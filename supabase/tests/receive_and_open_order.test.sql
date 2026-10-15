-- «Recibir auto y abrir OS» desde una cita programada en un solo paso.
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

grant execute on all functions in schema pg_temp to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000f2', 'operador@b');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'LAV', 'Lavado', null, 'recurrente', 40, 250, 80)).id as lavado \gset
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client('aaaaaaaa-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001',
  'José Pérez', '5512345678', null, 'person', null, '{}', 'web',
  '[{"make":"Mazda","model":"3","year":2021,"plate":"ABC1234"}]'::jsonb)).id as client \gset
select id as vehicle from public.vehicles where plate = 'ABC1234' \gset
select (public.create_appointment('aaaaaaaa-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000001',
  :'client', :'vehicle', array[:'lavado']::uuid[], now() + interval '1 hour')).id as appt \gset
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert_fails($$select public.receive_and_open_order('$$ || :'appt' || $$', gen_random_uuid())$$,
  '42501', 'otro centro no abre la OS de la cita');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.receive_and_open_order(:'appt', '30000000-0000-4000-8000-000000000001')).id as os \gset
select pg_temp.assert(
  (select status = 'recibida' and received_at is not null and service_order_id = :'os'
     from public.appointments where id = :'appt')
  and (select appointment_id = :'appt' and status = 'abierta' from public.service_orders where id = :'os')
  and (select count(*) = 1 from public.service_order_items where service_order_id = :'os' and service_code = 'LAV'),
  'una cita programada se recibe y abre su OS con los servicios agendados');
select pg_temp.assert(
  (select id from public.receive_and_open_order(:'appt', '30000000-0000-4000-8000-000000000002')) = :'os',
  'repetir devuelve la misma OS (una OS por cita)');
reset role;
select pg_temp.assert(
  exists (select 1 from public.audit_log where table_name = 'public.appointments' and reason = 'Recibida al abrir la OS'),
  'la recepción queda en auditoría con motivo');

rollback;
