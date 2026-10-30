-- Catálogo completo de clientes (20261109000000_client_catalog): lista paginada
-- sin búsqueda, sólo con los clientes visibles por RLS, los del centro activo primero.
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
  perform set_config('app.change_reason', '', true);
  execute 'set local role authenticated';
end $$;

grant execute on all functions in schema pg_temp to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'recepcion@a'),
  ('00000000-0000-0000-0000-0000000000f2', 'recepcion@otra');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Uno'),
  ('0e000000-0000-0000-0000-000000000002', 'org-dos', 'Dos');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Mexico_City'),
  ('cccccccc-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000002', 'C-01', 'Centro C', 'America/Mexico_City');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('cccccccc-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion');

-- 3 clientes en A, 2 en B y 1 en la otra organización.
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select count(*) from (select public.create_client('aaaaaaaa-0000-0000-0000-000000000000', gen_random_uuid(), n, p, null, 'person', null, '{}', 'web', '[]'::jsonb)
  from (values ('Zoe Ruiz', '5511110001'), ('Ana Pérez', '5511110002'), ('Luis Mora', '5511110003')) v(n, p)) s;
select count(*) from (select public.create_client('bbbbbbbb-0000-0000-0000-000000000000', gen_random_uuid(), n, p, null, 'person', null, '{}', 'web', '[]'::jsonb)
  from (values ('Bruno Díaz', '5511110004'), ('Carla Soto', '5511110005')) v(n, p)) s;
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select from public.create_client('cccccccc-0000-0000-0000-000000000000', gen_random_uuid(), 'Otra Org', '5511110006', null, 'person', null, '{}', 'web', '[]'::jsonb);
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  (select string_agg(full_name, ', ' order by ord) || ' | total ' || max(total_count)
     from (select *, row_number() over () as ord
             from public.list_clients('aaaaaaaa-0000-0000-0000-000000000000')) x)
  = 'Ana Pérez, Luis Mora, Zoe Ruiz, Bruno Díaz, Carla Soto | total 5',
  'catálogo: los del centro activo primero (por nombre), luego los demás de la organización; no los de otra');
select pg_temp.assert(
  (select string_agg(full_name, ', ') from public.list_clients('aaaaaaaa-0000-0000-0000-000000000000', 2, 2))
  = 'Zoe Ruiz, Bruno Díaz'
  and (select max(total_count) = 5 from public.list_clients('aaaaaaaa-0000-0000-0000-000000000000', 2, 2)),
  'paginación con desplazamiento y total');
reset role;

rollback;
