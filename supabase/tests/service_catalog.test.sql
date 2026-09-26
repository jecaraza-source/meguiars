-- Pruebas de O2: catálogo de servicios, precios, disponibilidad por centro,
-- historial de precios y permisos.
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
  ('00000000-0000-0000-0000-0000000000d1', 'socio@a'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000f2', 'operador@b'),
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
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000d1', 'admin_socio'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion');

-- ---------------------------------------------------------------------------
-- Alta de servicios (admin_socio corporativo)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service('0e000000-0000-0000-0000-000000000001', ' lav-exp ', 'Lavado  exprés',
  'Exterior e interior básico', 'recurrente', 40, 250, 80)).id as lavado \gset
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'CER-9H', 'Recubrimiento cerámico',
  null, 'premium', 480, 12000, 4200)).id as ceramico \gset
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'AROM', 'Aromatizante',
  null, 'producto_complemento', 5, 90, 30)).id as aroma \gset
select pg_temp.assert(
  pg_temp.n($$select 1 from public.services where code = 'LAV-EXP' and name = 'Lavado exprés'$$) = 1,
  'alta normaliza la clave (mayúsculas) y el nombre');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.service_price_history where detail_center_id is null and reason = 'Alta de servicio'$$) = 3,
  'el alta registra el precio y costo base en el historial');
select pg_temp.assert_fails($$select public.create_service('0e000000-0000-0000-0000-000000000001', 'LAV-EXP',
    'Otro', null, 'recurrente', 30, 100, 10)$$, '23505', 'la clave es única en la organización');
select pg_temp.assert_fails($$select public.create_service('0e000000-0000-0000-0000-000000000001', 'SIN-MOTOR',
    'Sin motor', null, null, 30, 100, 10)$$, '23502', 'la clasificación por motor es obligatoria');
select pg_temp.assert_fails($$select public.create_service('0e000000-0000-0000-0000-000000000001', 'NEG',
    'Negativo', null, 'recurrente', 30, -1, 10)$$, '23514', 'el precio no puede ser negativo');
select pg_temp.assert_fails($$select public.create_service('0e000000-0000-0000-0000-000000000001', 'DUR',
    'Duración', null, 'recurrente', 0, 100, 10)$$, '23514', 'la duración estándar es obligatoria (≥ 5 min)');
reset role;

-- Roles sin permiso de catálogo
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select pg_temp.assert_fails($$select public.create_service('0e000000-0000-0000-0000-000000000001', 'X-1',
    'Intento', null, 'recurrente', 30, 100, 10)$$, '42501', 'admin_socio de centro no crea servicios homologados');
select pg_temp.assert_fails($$select public.update_service('$$ || :'lavado' || $$', 'Lavado', null, 'recurrente',
    40, 1, 1, true, 'Intento')$$, '42501', 'admin_socio de centro no edita el precio base');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.set_service_center_config('aaaaaaaa-0000-0000-0000-000000000000',
    '$$ || :'lavado' || $$', false, null, null, 'Intento')$$, '42501', 'encargado no configura el catálogo del centro');
select pg_temp.assert(pg_temp.n($$select 1 from public.center_catalog('aaaaaaaa-0000-0000-0000-000000000000')$$) = 3,
  'encargado consulta el catálogo de su centro');
reset role;

-- ---------------------------------------------------------------------------
-- Disponibilidad y precio por centro (admin_socio del centro A)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select pg_temp.assert_fails($$select public.set_service_center_config('aaaaaaaa-0000-0000-0000-000000000000',
    '$$ || :'lavado' || $$', true, 280, null, null)$$, '22023', 'configurar un centro exige motivo');
select (public.set_service_center_config('aaaaaaaa-0000-0000-0000-000000000000', :'lavado', true, 280, 90,
  'Costo de mano de obra más alto en CDMX')).id is not null as configured;
select (public.set_service_center_config('aaaaaaaa-0000-0000-0000-000000000000', :'ceramico', false, null, null,
  'Sin cabina de curado')).id is not null as configured;
select pg_temp.assert_fails($$select public.set_service_center_config('bbbbbbbb-0000-0000-0000-000000000000',
    '$$ || :'lavado' || $$', false, null, null, 'Intento en otro centro')$$,
  '42501', 'admin_socio de A no configura el centro B');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  (select price = 280 and direct_cost = 90 and price_source = 'center' and base_price = 250
     from public.center_catalog('aaaaaaaa-0000-0000-0000-000000000000') where code = 'LAV-EXP'),
  'el centro A ve su precio y costo propios, conservando la referencia base');
select pg_temp.assert(pg_temp.n($$select 1 from public.center_catalog('aaaaaaaa-0000-0000-0000-000000000000')$$) = 2,
  'un servicio no disponible en el centro no aparece en su catálogo');
select pg_temp.assert(
  (select not available from public.center_catalog('aaaaaaaa-0000-0000-0000-000000000000', null, true)
    where code = 'CER-9H'),
  'con inactivos incluidos se ve la no disponibilidad');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.center_catalog('aaaaaaaa-0000-0000-0000-000000000000', 'recurrente')$$) = 1,
  'catálogo filtrable por motor');
select pg_temp.assert_fails($$select public.create_service('0e000000-0000-0000-0000-000000000001', 'OP-1',
    'Intento', null, 'recurrente', 30, 100, 10)$$, '42501', 'operador no crea servicios');
with u as (update public.services set base_price = 1 returning 1)
select pg_temp.assert((select count(*) = 0 from u), 'operador no puede actualizar servicios (RLS)');
select pg_temp.assert_fails($$delete from public.services$$, '42501', 'no hay borrado físico de servicios');
select pg_temp.assert_fails($$insert into public.service_price_history (organization_id, service_id, price, direct_cost)
    values ('0e000000-0000-0000-0000-000000000001', '$$ || :'lavado' || $$', 1, 1)$$,
  '42501', 'el historial de precios no se escribe directamente');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert(
  (select price = 250 and price_source = 'base' from public.center_catalog('bbbbbbbb-0000-0000-0000-000000000000')
    where code = 'LAV-EXP'),
  'el centro B conserva el precio base');
select pg_temp.assert(pg_temp.n($$select 1 from public.center_catalog('bbbbbbbb-0000-0000-0000-000000000000')$$) = 3,
  'en B el cerámico sigue disponible');
select pg_temp.assert(pg_temp.n($$select 1 from public.center_catalog('aaaaaaaa-0000-0000-0000-000000000000')$$) = 0,
  'un operador de B no consulta el catálogo del centro A');
select pg_temp.assert(pg_temp.n($$select 1 from public.service_price_history where detail_center_id is not null$$) = 0,
  'el historial de precios propios de A no es visible desde B');
reset role;

-- ---------------------------------------------------------------------------
-- Cambio de precio: historial y precio congelado de OS pasadas
-- ---------------------------------------------------------------------------
-- Una "línea de OS" de prueba congela precio/costo del catálogo al momento de venderse.
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
create temp table os_lines as
  select id as service_id, price as unit_price, direct_cost as unit_cost, clock_timestamp() as sold_at
  from public.center_catalog('aaaaaaaa-0000-0000-0000-000000000000') where code = 'LAV-EXP';
select pg_temp.assert((select count(*) = 1 and min(unit_price) = 280 from os_lines), 'la OS congela el precio del centro');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert_fails($$select public.update_service('$$ || :'lavado' || $$', 'Lavado exprés', null,
    'recurrente', 40, 300, 95, true, null)$$, '22023', 'cambiar precio exige motivo');
select pg_temp.assert_fails($$update public.services set base_price = 1$$, '23514',
  'escritura directa sin motivo se bloquea, incluso para el admin');
select (public.update_service(:'lavado', 'Lavado exprés', null, 'recurrente', 40, 300, 95, true,
  'Ajuste anual de precios')).base_price = 300 as updated;
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select (public.set_service_center_config('aaaaaaaa-0000-0000-0000-000000000000', :'lavado', true, 320, 100,
  'Ajuste anual CDMX')).id is not null as configured;
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert((select unit_price = 280 and unit_cost = 90 from os_lines),
  'el precio actual no altera la OS ya registrada (precio congelado)');
select pg_temp.assert(
  (select price = 280 and direct_cost = 90 and source = 'center'
     from public.service_price_at(:'lavado', 'aaaaaaaa-0000-0000-0000-000000000000', (select sold_at from os_lines))),
  'service_price_at devuelve el precio vigente al momento de la venta');
select pg_temp.assert(
  (select price = 320 and source = 'center'
     from public.service_price_at(:'lavado', 'aaaaaaaa-0000-0000-0000-000000000000')),
  'y el vigente hoy');
select pg_temp.assert(
  (select price = 300 and direct_cost = 95 and source = 'base'
     from public.service_price_at(:'lavado', 'bbbbbbbb-0000-0000-0000-000000000000')),
  'otro centro usa el nuevo precio base');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select (public.set_service_center_config('aaaaaaaa-0000-0000-0000-000000000000', :'lavado', true, null, null,
  'Vuelve al precio homologado')).id is not null as configured;
select pg_temp.assert(
  (select price = 300 and source = 'base'
     from public.service_price_at(:'lavado', 'aaaaaaaa-0000-0000-0000-000000000000')),
  'quitar el precio propio vuelve al precio base');
reset role;

select pg_temp.assert(
  (select array_agg(price order by id) = '{250,300}'
     from public.service_price_history where service_id = :'lavado' and detail_center_id is null),
  'historial base: 250 → 300');
select pg_temp.assert(
  (select count(*) = 3 and bool_and(reason is not null)
     from public.service_price_history where service_id = :'lavado' and detail_center_id is not null),
  'historial del centro: 280 → 320 → base, cada cambio con motivo');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.audit_log where table_name = 'public.services' and action = 'UPDATE'
      and reason = 'Ajuste anual de precios' and actor_id = '00000000-0000-0000-0000-0000000000a1'
      and (old_data ->> 'base_price')::numeric = 250 and (new_data ->> 'base_price')::numeric = 300$$) = 1,
  'el cambio de precio queda auditado con actor, valores y motivo');

-- ---------------------------------------------------------------------------
-- Desactivar en lugar de borrar; identidad inmutable; otras organizaciones
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.update_service(:'aroma', 'Aromatizante', null, 'producto_complemento', 5, 90, 30, false,
  'Se deja de vender')).active = false as deactivated;
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.center_catalog('bbbbbbbb-0000-0000-0000-000000000000') where code = 'AROM'$$) = 0,
  'un servicio desactivado sale del catálogo de venta');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.center_catalog('bbbbbbbb-0000-0000-0000-000000000000', null, true) where code = 'AROM' and not active$$) = 1,
  'pero sigue consultable (y su historial se conserva)');
reset role;

select from set_config('app.change_reason', 'Prueba de identidad', true);
select pg_temp.assert_fails($$update public.services set code = 'OTRO' where code = 'CER-9H'$$,
  '23514', 'la clave homologada no cambia');
select from set_config('app.change_reason', '', true);

select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(pg_temp.n('select 1 from public.services') = 3, 'contador corporativo consulta el catálogo');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select pg_temp.assert(pg_temp.n('select 1 from public.services') = 0, 'otra organización no ve el catálogo');
select pg_temp.assert_fails($$select public.set_service_center_config('cccccccc-0000-0000-0000-000000000000',
    '$$ || :'lavado' || $$', true, 1, 1, 'Cruce de organizaciones')$$,
  '22023', 'no se configura un servicio de otra organización');
reset role;

select pg_temp.assert(
  (select count(*) >= 3 from pg_indexes
    where indexname in ('services_org_active_engine_idx', 'service_center_config_center_idx', 'service_price_history_lookup_idx')),
  'índices por organización/activo/motor, centro y vigencia de precio');

rollback;
