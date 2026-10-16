-- Búsqueda de clientes por nombre o apellido en cualquier orden (agenda y Clientes).
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

create function pg_temp.names(q text) returns text language sql as $$
  select coalesce(string_agg(full_name, ' | ' order by ord), '-')
  from (select full_name, row_number() over () as ord
          from public.search_clients('aaaaaaaa-0000-0000-0000-000000000000', q)) s
$$;

grant execute on all functions in schema pg_temp to authenticated;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'operador@a');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion');

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select from public.create_client('aaaaaaaa-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001',
  'Juan Pérez Gómez', '5511110001', null, 'person', null, '{}', 'web', '[]'::jsonb);
select from public.create_client('aaaaaaaa-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000002',
  'Ana Juanes', '5511110002', null, 'person', null, '{}', 'web', '[]'::jsonb);
select from public.create_client('aaaaaaaa-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000003',
  'María López', '5511110003', null, 'person', null, '{}', 'web', '[]'::jsonb);

select pg_temp.assert(pg_temp.names('perez juan') = 'Juan Pérez Gómez',
  'nombre y apellido en cualquier orden y sin acentos');
select pg_temp.assert(pg_temp.names('gom jua') = 'Juan Pérez Gómez', 'pedazos de cada palabra');
select pg_temp.assert(pg_temp.names('lópez') = 'María López', 'sólo el apellido');
select pg_temp.assert(pg_temp.names('juan') = 'Juan Pérez Gómez | Ana Juanes',
  'primero los que empiezan con lo escrito');
select pg_temp.assert(pg_temp.names('juan lopez') = '-', 'todas las palabras deben coincidir');
select pg_temp.assert(pg_temp.names('5511110003') = 'María López', 'el teléfono sigue funcionando');
reset role;

rollback;
