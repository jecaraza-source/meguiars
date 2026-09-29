-- Pruebas de O6: resumen de la operación del día (center_day_summary). Cuenta
-- órdenes activas por estado, entregas y cobros de HOY (fecha del centro) y
-- citas del día; cada bloque respeta su permiso y no mezcla centros.
\set ON_ERROR_STOP on
begin;

create function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

create function pg_temp.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

grant execute on all functions in schema pg_temp to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@a'),
  ('00000000-0000-0000-0000-0000000000f2', 'operador@b');
insert into public.organizations (id, slug, name) values ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Org');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Mexico_City');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'contador'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion');
insert into public.clients (id, organization_id, home_detail_center_id, kind, full_name, phone, request_id, created_in_detail_center_id)
values ('c1000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000',
        'person', 'Cliente Uno', '+525500000001', 'c1000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000000');
insert into public.vehicles (id, organization_id, client_id, make, model, year, plate, created_in_detail_center_id)
values ('c2000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
        'Mazda', '3', 2021, 'ABC1234', 'aaaaaaaa-0000-0000-0000-000000000000');

-- Órdenes: 1 abierta y 1 en proceso hoy; 1 entregada hoy ($500, cobrada $300); 1 entregada ayer; 1 en el otro centro.
insert into public.service_orders (id, organization_id, detail_center_id, folio, folio_number, client_id, vehicle_id, channel, status,
  client_name, vehicle_make, vehicle_model, vehicle_year, vehicle_plate, subtotal, total, delivered_at, created_at, request_id)
select x.id, '0e000000-0000-0000-0000-000000000001', x.center, x.folio, x.n, 'c1000000-0000-0000-0000-000000000001',
       'c2000000-0000-0000-0000-000000000001', 'b2c', x.status::public.service_order_status, 'Cliente Uno', 'Mazda', '3', 2021, 'ABC1234',
       x.total, x.total, x.delivered, now(), x.id
  from (values
    ('0d000000-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000000'::uuid, 'A-01-000001', 1, 'abierta', 0, null::timestamptz),
    ('0d000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000000', 'A-01-000002', 2, 'en_proceso', 800, null),
    ('0d000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000000', 'A-01-000003', 3, 'entregada', 500, now()),
    ('0d000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000000', 'A-01-000004', 4, 'entregada', 900, now() - interval '2 days'),
    ('0d000000-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000000', 'B-01-000001', 1, 'en_proceso', 400, null)
  ) as x(id, center, folio, n, status, total, delivered);
select from (select private.create_order_payment(o, '0e300000-0000-0000-0000-000000000001', '[{"method":"efectivo","amount":300}]'::jsonb, 300, 'Anticipo')
  from public.service_orders o where o.id = '0d000000-0000-0000-0000-000000000003') x;

insert into public.appointments (organization_id, detail_center_id, client_id, vehicle_id, starts_at, duration_minutes, ends_at, status, request_id)
values ('0e000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000001',
        'c2000000-0000-0000-0000-000000000001', (private.center_today('aaaaaaaa-0000-0000-0000-000000000000') + time '23:00') at time zone 'America/Mexico_City',
        40, now(), 'programada', gen_random_uuid()),
       ('0e000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000001',
        'c2000000-0000-0000-0000-000000000001', (private.center_today('aaaaaaaa-0000-0000-0000-000000000000') + time '00:30') at time zone 'America/Mexico_City',
        40, now(), 'entregada', gen_random_uuid());

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
create temp table s on commit drop as select public.center_day_summary('aaaaaaaa-0000-0000-0000-000000000000') as j;
select pg_temp.assert((select j -> 'orders' -> 'by_status' = '{"abierta": 1, "en_proceso": 1}'::jsonb from s), 'activas por estado, sólo del centro');
select pg_temp.assert((select jsonb_array_length(j -> 'orders' -> 'active') = 2
                          and j -> 'orders' -> 'active' -> 0 ->> 'status' = 'en_proceso'
                          and j -> 'orders' -> 'active' -> 0 ->> 'vehicle' = 'Mazda 3 · ABC1234' from s),
  'lista activa: en proceso primero, con vehículo');
select pg_temp.assert((select j -> 'orders' -> 'delivered_today' = '{"count": 1, "total": 500, "pending": 200}'::jsonb from s),
  'entregadas hoy (no la de hace 2 días), con saldo por cobrar');
select pg_temp.assert((select (j -> 'payments' ->> 'total')::numeric = 300 and (j -> 'payments' ->> 'count')::int = 1 from s), 'cobrado hoy');
select pg_temp.assert((select j -> 'agenda' -> 'by_status' = '{"entregada": 1, "programada": 1}'::jsonb
                          and jsonb_array_length(j -> 'agenda' -> 'upcoming') = 1 from s), 'citas del día y pendientes');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert((select j -> 'orders' = 'null'::jsonb and j -> 'agenda' = 'null'::jsonb
                          and (j -> 'payments' ->> 'total')::numeric = 300
                         from (select public.center_day_summary('aaaaaaaa-0000-0000-0000-000000000000') as j) x),
  'contador: sólo el bloque de cobros');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
do $$ begin
  perform public.center_day_summary('aaaaaaaa-0000-0000-0000-000000000000');
  raise exception 'FALLÓ: otro centro no debe leer el resumen';
exception when sqlstate '42501' then raise notice 'ok - usuario de otro centro no lee el resumen';
end $$;
reset role;

rollback;
