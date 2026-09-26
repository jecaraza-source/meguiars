-- Pruebas de O1: clientes y vehículos (normalización, RLS por centro,
-- duplicados, idempotencia, historial y auditoría).
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

grant execute on all functions in schema pg_temp to authenticated, anon;

-- Org O1: centros A y B.   Org O2: centro C.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@o1'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000f2', 'operador@b'),
  ('00000000-0000-0000-0000-0000000000b1', 'b2b@b'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@o2');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno'),
  ('0e000000-0000-0000-0000-000000000002', 'org-dos', 'Organización Dos');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Monterrey'),
  ('cccccccc-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000002', 'C-01', 'Centro C', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio'),
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'contador'),
  ('0e000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a2', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'comercial_b2b');

-- ---------------------------------------------------------------------------
-- Normalización (mismos casos que packages/domain/src/clients/normalize.test.ts)
-- ---------------------------------------------------------------------------
select pg_temp.assert(private.normalize_phone('55 1234 5678') = '+525512345678', 'teléfono de 10 dígitos → +52');
select pg_temp.assert(private.normalize_phone('+52 (55) 1234-5678') = '+525512345678', 'teléfono con +52 y formato');
select pg_temp.assert(private.normalize_phone('521 55 1234 5678') = '+525512345678', 'prefijo móvil 521 anterior');
select pg_temp.assert(private.normalize_phone('+1 415 555 0100') = '+14155550100', 'teléfono internacional con +');
select pg_temp.assert(private.normalize_phone('12345') is null, 'teléfono corto es inválido');
select pg_temp.assert(private.normalize_phone('abc') is null, 'teléfono sin dígitos es inválido');
select pg_temp.assert(private.normalize_plate(' abc-12-34 ') = 'ABC1234', 'placa en mayúsculas sin separadores');
select pg_temp.assert(private.normalize_email('  Ana@Correo.MX ') = 'ana@correo.mx', 'email en minúsculas');
select pg_temp.assert(private.normalize_text('  José   Pérez ') = 'jose perez', 'nombre sin acentos ni espacios dobles');

-- ---------------------------------------------------------------------------
-- Alta (operador de A) e idempotencia web/móvil
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client(
  'aaaaaaaa-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001',
  '  José   Pérez ', '55 1234 5678', 'Jose@Correo.MX', 'person', null, '{whatsapp}', 'web',
  '[{"make":"Mazda","model":"3","year":2021,"plate":"abc-12-34"}]'::jsonb
)).id as client_id \gset
select pg_temp.assert(
  pg_temp.n($$select 1 from public.clients where full_name = 'José Pérez' and phone = '+525512345678'
      and email = 'jose@correo.mx' and home_detail_center_id = 'aaaaaaaa-0000-0000-0000-000000000000'
      and marketing_opt_in and marketing_opt_in_source = 'web' and marketing_opt_in_at is not null$$) = 1,
  'alta normaliza nombre, teléfono, email y registra el consentimiento');
select pg_temp.assert(pg_temp.n($$select 1 from public.vehicles where plate = 'ABC1234' and year = 2021$$) = 1,
  'alta crea el vehículo con la placa normalizada');
select pg_temp.assert(pg_temp.n($$select 1 from public.client_centers where detail_center_id = 'aaaaaaaa-0000-0000-0000-000000000000'$$) = 1,
  'alta vincula al cliente con el centro');
-- El mismo formulario reenviado desde móvil (mismo request_id, teléfono con otro formato).
select pg_temp.assert(
  (public.create_client(
    'aaaaaaaa-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001',
    'José Pérez', '+52 55-1234-5678', null, 'person', null, '{}', 'mobile', '[]'::jsonb)).id = :'client_id',
  'reenvío con el mismo request_id devuelve el mismo cliente');
select pg_temp.assert(pg_temp.n('select 1 from public.clients') = 1 and pg_temp.n('select 1 from public.vehicles') = 1,
  'reintentos no duplican cliente ni vehículos');

-- ---------------------------------------------------------------------------
-- Duplicados: aviso, confirmación con motivo y datos enmascarados
-- ---------------------------------------------------------------------------
select pg_temp.assert_fails($$select public.create_client(
    'aaaaaaaa-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000002',
    'Pepe Pérez', '5512345678', null, 'person', null, '{}', 'mobile', '[]'::jsonb)$$,
  'MG001', 'otro alta con el mismo teléfono se detiene como posible duplicado');
select pg_temp.assert(
  (select matched_on = '{phone}' and visible and display_name = 'José Pérez'
     from public.find_client_matches('aaaaaaaa-0000-0000-0000-000000000000', '5512345678')),
  'find_client_matches devuelve el cliente visible con el motivo de coincidencia');
select pg_temp.assert(
  (select matched_on = '{plate}'
     from public.find_client_matches('aaaaaaaa-0000-0000-0000-000000000000', '5599999999', null, '{ABC 1234}')),
  'coincidencia por placa');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert(pg_temp.n('select 1 from public.clients') = 0, 'operador de B no ve clientes de A');
select pg_temp.assert(pg_temp.n($$select 1 from public.search_clients('bbbbbbbb-0000-0000-0000-000000000000', 'José')$$) = 0,
  'la búsqueda respeta los permisos de centro');
select pg_temp.assert(
  (select not visible and display_name = 'José P.' and phone_hint = '•••• 5678' and home_center_name = 'Centro A'
     from public.find_client_matches('bbbbbbbb-0000-0000-0000-000000000000', '+525512345678')),
  'desde otro centro el duplicado se muestra enmascarado');
select pg_temp.assert_fails($$select public.link_client_to_center(
    '$$ || :'client_id' || $$', 'bbbbbbbb-0000-0000-0000-000000000000', null)$$,
  '22023', 'vincular exige motivo');
select public.link_client_to_center(:'client_id', 'bbbbbbbb-0000-0000-0000-000000000000', 'Cliente de A atendido en B') is not null as linked;
select pg_temp.assert(pg_temp.n('select 1 from public.clients') = 1, 'vinculado, el operador de B ve el expediente');
select pg_temp.assert(pg_temp.n('select 1 from public.vehicles') = 1, 'y sus vehículos');
-- Historial: sólo entradas de centros que el usuario puede leer (B).
select pg_temp.assert(
  (select array_agg(kind order by kind) = '{center_linked}' from public.client_history(:'client_id')),
  'historial desde B no muestra las entradas del centro A');
-- Alta confirmada: otro cliente real con el mismo teléfono (familia), con motivo.
select (public.create_client(
  'bbbbbbbb-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000003',
  'María Pérez', '5512345678', null, 'person', null, '{}', 'mobile', '[]'::jsonb,
  'Esposa del titular; comparten teléfono')).id as second_id \gset
reset role;
select pg_temp.assert(
  pg_temp.n($$select 1 from public.audit_log where event = 'client.duplicate_confirmed'
      and reason = 'Esposa del titular; comparten teléfono' and actor_id = '00000000-0000-0000-0000-0000000000f2'$$) = 1,
  'confirmar un duplicado queda en la auditoría con motivo y actor');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.audit_log where table_name = 'public.clients' and action = 'INSERT'
      and reason = 'Alta de cliente' and actor_id = '00000000-0000-0000-0000-0000000000f1'$$) = 1,
  'el alta queda auditada con actor y motivo');

-- ---------------------------------------------------------------------------
-- Placa única entre vehículos activos
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails($$select public.create_client(
    'aaaaaaaa-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000004',
    'Luis Soto', '5511112222', null, 'person', null, '{}', 'web',
    '[{"make":"VW","model":"Jetta","year":2019,"plate":"ABC1234"}]'::jsonb, 'Compró el auto')$$,
  '23505', 'una placa activa no puede registrarse en otro vehículo');
select pg_temp.assert_fails($$select public.add_vehicle(
    '$$ || :'client_id' || $$', 'aaaaaaaa-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000001',
    'VW', 'Jetta', 1900, 'XYZ999')$$,
  '23514', 'el año del vehículo se valida');
select (public.add_vehicle(:'client_id', 'aaaaaaaa-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000002',
  'VW', 'Jetta', 2019, 'xyz 999', 'vin-123')).id as vehicle_id \gset
select pg_temp.assert(
  (public.add_vehicle(:'client_id', 'aaaaaaaa-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000002',
    'VW', 'Jetta', 2019, 'XYZ999')).id = :'vehicle_id',
  'add_vehicle es idempotente por request_id');
select pg_temp.assert(
  (public.update_vehicle(:'vehicle_id', 'VW', 'Jetta', 2019, 'XYZ999', 'VIN123', 'Vendido', false, 'Lo vendió')).active = false,
  'un vehículo se desactiva con motivo');
select pg_temp.assert_fails($$select public.add_vehicle(
    '$$ || :'second_id' || $$', 'aaaaaaaa-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000003',
    'VW', 'Jetta', 2019, 'XYZ999')$$,
  '42501', 'no se editan clientes que no están vinculados a un centro propio');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert(
  (public.add_vehicle(:'second_id', 'bbbbbbbb-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000003',
    'VW', 'Jetta', 2019, 'XYZ999')).plate = 'XYZ999',
  'la placa de un vehículo inactivo puede registrarse de nuevo');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');

-- ---------------------------------------------------------------------------
-- Búsqueda
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select matched_on = 'plate' from public.search_clients('aaaaaaaa-0000-0000-0000-000000000000', 'abc 12') limit 1),
  'búsqueda por placa parcial y con formato');
select pg_temp.assert(pg_temp.n($$select 1 from public.search_clients('aaaaaaaa-0000-0000-0000-000000000000', '5678')$$) = 1,
  'búsqueda por últimos dígitos del teléfono (sólo clientes visibles desde A)');
select pg_temp.assert(
  (select full_name = 'José Pérez' and matched_on = 'name'
     from public.search_clients('aaaaaaaa-0000-0000-0000-000000000000', 'jose per')),
  'búsqueda por nombre sin acentos');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(
  (select array_agg(full_name) = '{"José Pérez","María Pérez"}'
     from public.search_clients('aaaaaaaa-0000-0000-0000-000000000000', 'Pérez')),
  'los clientes del centro activo aparecen primero');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(pg_temp.n($$select 1 from public.search_clients('aaaaaaaa-0000-0000-0000-000000000000', '%')$$) = 0,
  'los comodines de LIKE no devuelven todo');

-- ---------------------------------------------------------------------------
-- Edición controlada y consentimiento
-- ---------------------------------------------------------------------------
select pg_temp.assert_fails($$select public.update_client(
    '$$ || :'client_id' || $$', 'José Pérez', '5512345678', null, 'person', null,
    'aaaaaaaa-0000-0000-0000-000000000000', '{}', 'web', null)$$,
  '22023', 'editar exige motivo');
select pg_temp.assert_fails($$select public.update_client(
    '$$ || :'client_id' || $$', 'José Pérez', 'no-es-tel', null, 'person', null,
    'aaaaaaaa-0000-0000-0000-000000000000', '{}', 'web', 'Corrige teléfono')$$,
  '22023', 'teléfono inválido se rechaza');
select pg_temp.assert_fails($$select public.update_client(
    '$$ || :'client_id' || $$', 'José Pérez', '5512345678', 'no-es-email', 'person', null,
    'aaaaaaaa-0000-0000-0000-000000000000', '{}', 'web', 'Corrige email')$$,
  '22023', 'email inválido se rechaza');
select pg_temp.assert_fails($$select public.update_client(
    '$$ || :'client_id' || $$', 'J', '5512345678', null, 'person', null,
    'aaaaaaaa-0000-0000-0000-000000000000', '{}', 'web', 'Corrige nombre')$$,
  '23514', 'nombre requerido (mínimo 2 caracteres)');
select pg_temp.assert(
  (select not marketing_opt_in and marketing_channels = '{}' and marketing_opt_in_source = 'mobile'
     from public.update_client(:'client_id', 'José Pérez', '5512345678', 'jose@correo.mx', 'person', 'Cliente frecuente',
       'aaaaaaaa-0000-0000-0000-000000000000', '{}', 'mobile', 'Retira consentimiento')),
  'retirar el consentimiento registra el cambio y su origen');
reset role;
select pg_temp.assert(
  pg_temp.n($$select 1 from public.audit_log where table_name = 'public.clients' and action = 'UPDATE'
      and reason = 'Retira consentimiento' and old_data ->> 'marketing_opt_in' = 'true'
      and new_data ->> 'marketing_opt_in' = 'false'$$) = 1,
  'la edición queda auditada con valores anteriores, nuevos y motivo');

-- Escrituras directas (sin RPC) y borrado
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails($$update public.clients set notes = 'x'$$, '23514', 'update directo sin motivo se bloquea');
select pg_temp.assert_fails($$delete from public.vehicles$$, '42501', 'no hay borrado físico de vehículos');
select pg_temp.assert_fails($$delete from public.clients$$, '42501', 'no hay borrado físico de clientes');
reset role;
select from set_config('app.change_reason', 'Prueba de columnas inmutables', true);
select pg_temp.assert_fails(
  $$update public.clients set organization_id = '0e000000-0000-0000-0000-000000000002'$$,
  '23514', 'la organización de un cliente no se puede cambiar');
select pg_temp.assert_fails(
  $$insert into public.clients (organization_id, home_detail_center_id, full_name, phone, request_id, created_in_detail_center_id)
    values ('0e000000-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000000', 'Otra Org', '+525500000000',
            gen_random_uuid(), 'cccccccc-0000-0000-0000-000000000000')$$,
  '23503', 'un cliente no puede apuntar a un centro de otra organización');
select from set_config('app.change_reason', '', true);

-- ---------------------------------------------------------------------------
-- Permisos por rol
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert(pg_temp.n('select 1 from public.clients') = 2, 'comercial B2B de B lee clientes vinculados a B');
select pg_temp.assert_fails($$select public.update_client(
    '$$ || :'client_id' || $$', 'José Pérez', '5512345678', null, 'person', null,
    'aaaaaaaa-0000-0000-0000-000000000000', '{}', 'web', 'Intento')$$,
  '42501', 'comercial B2B no edita clientes');
select pg_temp.assert_fails($$select public.create_client(
    'bbbbbbbb-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000009',
    'Ana Ruiz', '5500001111', null, 'person', null, '{}', 'web', '[]'::jsonb)$$,
  '42501', 'comercial B2B no da de alta clientes');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(pg_temp.n('select 1 from public.clients') = 0, 'contador no ve datos personales de clientes');
select pg_temp.assert_fails($$select * from public.find_client_matches('aaaaaaaa-0000-0000-0000-000000000000', '5512345678')$$,
  '42501', 'contador no consulta duplicados');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(pg_temp.n('select 1 from public.clients') = 2, 'admin corporativo ve todos los clientes de la organización');
select pg_temp.assert(
  (select count(*) = 4 from public.client_history(:'client_id')),
  'admin corporativo ve el historial completo');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select pg_temp.assert(pg_temp.n('select 1 from public.clients') = 0, 'otra organización no ve los clientes');
select pg_temp.assert_fails($$select public.link_client_to_center(
    '$$ || :'client_id' || $$', 'cccccccc-0000-0000-0000-000000000000', 'Intento entre organizaciones')$$,
  '22023', 'no se vincula un cliente de otra organización');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.find_client_matches('cccccccc-0000-0000-0000-000000000000', '5512345678')$$) = 0,
  'los duplicados sólo se buscan dentro de la organización');
reset role;

-- ---------------------------------------------------------------------------
-- Visitas (interfaz para Órdenes de Servicio)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select private.register_client_visit(:'client_id', 'bbbbbbbb-0000-0000-0000-000000000000', '2026-09-20T15:00:00Z');
select pg_temp.assert(
  (select last_visit_at = '2026-09-20T15:00:00Z' and last_visit_detail_center_id = 'bbbbbbbb-0000-0000-0000-000000000000'
     from public.clients where id = :'client_id'),
  'registrar una visita actualiza la última visita del cliente');
select pg_temp.assert(
  (select count(*) = 1 from public.client_history(:'client_id') where kind = 'visit'),
  'la visita aparece en el historial');
select private.register_client_visit(:'client_id', 'bbbbbbbb-0000-0000-0000-000000000000', '2026-09-01T15:00:00Z');
select pg_temp.assert(
  (select last_visit_at = '2026-09-20T15:00:00Z' from public.clients where id = :'client_id'),
  'una visita anterior no retrocede la última visita');
select pg_temp.assert_fails($$select private.register_client_visit(
    '$$ || :'client_id' || $$', 'aaaaaaaa-0000-0000-0000-000000000000')$$,
  '42501', 'no se registran visitas en centros sin permiso');
reset role;

select pg_temp.assert(
  (select count(*) = 3 from pg_indexes where tablename in ('clients', 'vehicles') and indexdef like '%gin_trgm_ops%'),
  'índices de trigramas para nombre, teléfono y placa');

rollback;
