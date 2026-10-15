-- «Convertir en cliente» desde el prospecto: alta o liga sin duplicar, consentimiento e idempotencia.
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
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@a');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'contador');

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_lead('aaaaaaaa-0000-0000-0000-000000000000', '40000000-0000-4000-8000-000000000001',
  'Laura Ríos', 'whatsapp', '5522223333', 'laura@correo.mx', null, null, null, null, '{}', 'Jetta 2019',
  null, array['whatsapp'])) .id as lead1 \gset
select (public.create_lead('aaaaaaaa-0000-0000-0000-000000000000', '40000000-0000-4000-8000-000000000002',
  'Pedro Sin Teléfono', 'instagram', null, null, '@pedro')).id as lead2 \gset
select (public.create_client('aaaaaaaa-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000009',
  'Mario Existente', '5544445555')).id as existing \gset
select (public.create_lead('aaaaaaaa-0000-0000-0000-000000000000', '40000000-0000-4000-8000-000000000003',
  'Mario E.', 'google', '55 4444 5555')).id as lead3 \gset
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert_fails($$select public.convert_lead_to_client('$$ || :'lead1' || $$', 1)$$,
  '42501', 'el contador no convierte prospectos');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.convert_lead_to_client(:'lead1', (select version from public.leads where id = :'lead1'))).client_id as c1 \gset
select pg_temp.assert(
  (select full_name = 'Laura Ríos' and phone = '+525522223333' and email = 'laura@correo.mx'
          and marketing_channels = array['whatsapp'] from public.clients where id = :'c1'),
  'crea el cliente con nombre, teléfono, correo y el consentimiento de WhatsApp del prospecto');
select pg_temp.assert(
  (select client_id from public.convert_lead_to_client(:'lead1', (select version from public.leads where id = :'lead1'))) = :'c1'
  and (select count(*) = 1 from public.clients where full_name = 'Laura Ríos'),
  'convertir otra vez no duplica');
select pg_temp.assert(
  (select client_id from public.convert_lead_to_client(:'lead3', (select version from public.leads where id = :'lead3'))) = :'existing'
  and (select count(*) = 1 from public.clients where phone = '+525544445555'),
  'si ya existe un cliente con ese teléfono, lo liga en lugar de duplicar');
select pg_temp.assert_fails($$select public.convert_lead_to_client('$$ || :'lead2' || $$', 1)$$,
  '22023', 'sin teléfono pide capturarlo primero');
reset role;
select pg_temp.assert(
  exists (select 1 from public.lead_events where lead_id = :'lead1' and kind = 'cliente'),
  'queda en la bitácora del prospecto');

rollback;
