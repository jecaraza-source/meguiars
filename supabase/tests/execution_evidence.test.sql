-- Pruebas de O5: ejecución por línea, tiempos no negativos, personal,
-- evidencias en Storage (acceso por centro), consumos estándar vs real,
-- incidencias y bitácora auditable.
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

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@o1'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000f2', 'operador@b');
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
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion');

-- Catálogo e insumos (admin corporativo): el lavado usa 50 ml de shampoo por unidad.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'LAV', 'Lavado', null, 'recurrente', 40, 250, 80)).id as lavado \gset
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'POL', 'Pulido', null, 'valor_medio', 120, 2800, 900)).id as pulido \gset
select (public.upsert_inventory_item('0e000000-0000-0000-0000-000000000001', null, 'shp-01', 'Shampoo  neutro', 'ml', 0.05, true, 'Alta de insumo')).id as shampoo \gset
select (public.upsert_inventory_item('0e000000-0000-0000-0000-000000000001', null, 'CER-01', 'Cera', 'g', 0.2, true, 'Alta de insumo')).id as cera \gset
select from public.set_service_supply_standard(:'lavado', :'shampoo', 50, 'Estándar del lavado');
select pg_temp.assert(
  (select code = 'SHP-01' and name = 'Shampoo neutro' from public.inventory_items where id = :'shampoo')
  and pg_temp.n($$select 1 from public.service_supply_standards$$) = 1,
  'admin corporativo da de alta insumos (clave y nombre normalizados) y el estándar del servicio');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.set_service_supply_standard('$$ || :'pulido' || $$', '$$ || :'cera' || $$', 30, 'Intento')$$,
  '42501', 'el encargado no configura estándares de insumos');
select (public.upsert_technician('aaaaaaaa-0000-0000-0000-000000000000', null, 'Toño Ruiz', true, 'Alta de técnico')).id as tech1 \gset
select (public.upsert_technician('aaaaaaaa-0000-0000-0000-000000000000', null, 'Luis Gómez', true, 'Alta de técnico')).id as tech2 \gset
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.upsert_technician('bbbbbbbb-0000-0000-0000-000000000000', null, 'Beto Garza', true, 'Alta de técnico')).id as techb \gset
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails($$select public.upsert_inventory_item('0e000000-0000-0000-0000-000000000001', null, 'X-1', 'X', 'ml', 1, true, 'Intento')$$,
  '42501', 'el operador no da de alta insumos');
select (public.create_client('aaaaaaaa-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001',
  'José Pérez', '5512345678', null, 'person', null, '{}', 'web',
  '[{"make":"Mazda","model":"3","year":2021,"plate":"ABC1234"}]'::jsonb)).id as client \gset
select id as vehicle from public.vehicles where plate = 'ABC1234' \gset
select (public.create_service_order('aaaaaaaa-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000001',
  :'client', :'vehicle',
  jsonb_build_array(jsonb_build_object('service_id', :'lavado', 'quantity', 2), jsonb_build_object('service_id', :'pulido')),
  'b2c', null, null, :'tech1')).id as os \gset
select id as lav_line from public.service_order_items where service_order_id = :'os' and service_code = 'LAV' \gset
select id as pol_line from public.service_order_items where service_order_id = :'os' and service_code = 'POL' \gset
select organization_id || '/' || detail_center_id || '/' || id as prefix from public.service_orders where id = :'os' \gset

-- ---------------------------------------------------------------------------
-- Ejecución por línea y tiempos
-- ---------------------------------------------------------------------------
select pg_temp.assert_fails($$select public.set_service_order_item_work('$$ || :'lav_line' || $$', 'en_proceso')$$,
  '22023', 'las líneas se trabajan con la OS en proceso');
select from public.set_service_order_status(:'os', pg_temp.v(:'os'), 'autorizada');
select from public.set_service_order_status(:'os', pg_temp.v(:'os'), 'en_proceso');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.service_order_events where kind = 'os_inicio'$$) = 1,
  'iniciar la OS queda en la bitácora de ejecución');
select pg_temp.assert(
  (select work_status = 'en_proceso' and started_at is not null and technician_id = :'tech2'
     from public.set_service_order_item_work(:'lav_line', 'en_proceso', :'tech2')),
  'iniciar la línea con un técnico');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.service_order_staff$$) = 1,
  'el técnico que inicia una línea queda como participante');
select pg_temp.assert_fails($$select public.set_service_order_item_work('$$ || :'pol_line' || $$', 'terminada')$$,
  '22023', 'una línea pendiente no se termina sin iniciarse');
reset role;
update public.service_order_items set work_started_at = now() - interval '20 minutes' where id = :'lav_line';
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  (select work_status = 'pausada' and worked_minutes = 20 and work_started_at is null
     from public.set_service_order_item_work(:'lav_line', 'pausada', null, 'Espera de secado')),
  'pausar la línea acumula el tiempo real (20 min)');
select from public.set_service_order_item_work(:'lav_line', 'en_proceso');
reset role;
-- Reloj adelantado (inicio en el futuro): el tramo cuenta 0, nunca negativo.
update public.service_order_items set work_started_at = now() + interval '10 minutes' where id = :'lav_line';
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  (select work_status = 'terminada' and worked_minutes = 20 and finished_at >= started_at
     from public.set_service_order_item_work(:'lav_line', 'terminada')),
  'el tiempo real nunca es negativo aunque el tramo empiece en el futuro');
reset role;
select pg_temp.assert_fails($$update public.service_order_items set worked_minutes = -5 where id = '$$ || :'lav_line' || $$'$$,
  '23514', 'la base rechaza minutos negativos');
select pg_temp.assert_fails($$update public.service_orders set worked_minutes = -1 where id = '$$ || :'os' || $$'$$,
  '23514', 'también en la OS');

-- Pausar la OS pausa las líneas en curso.
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select from public.set_service_order_item_work(:'pol_line', 'en_proceso', :'tech1');
select from public.set_service_order_status(:'os', pg_temp.v(:'os'), 'pausada', 'Falta pieza');
select pg_temp.assert(
  (select work_status = 'pausada' from public.service_order_items where id = :'pol_line')
  and pg_temp.n($$select 1 from public.service_order_events where kind in ('os_pausa', 'linea_pausa') and note = 'Falta pieza'$$) = 2,
  'pausar la OS pausa las líneas en curso, con el motivo en la bitácora');
select pg_temp.assert_fails($$select public.set_service_order_item_work('$$ || :'pol_line' || $$', 'en_proceso')$$,
  '22023', 'con la OS pausada no se reanuda una línea');
select from public.set_service_order_status(:'os', pg_temp.v(:'os'), 'en_proceso');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.service_order_events where kind = 'os_reanudacion'$$) = 1,
  'reanudar la OS queda en la bitácora');

-- ---------------------------------------------------------------------------
-- Personal participante
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  pg_temp.n($$select 1 from public.set_service_order_staff('$$ || :'os' || $$', array['$$ || :'tech2' || $$']::uuid[])$$) = 2,
  'personal: el técnico principal siempre participa (principal + apoyo)');
select pg_temp.assert_fails($$select public.set_service_order_staff('$$ || :'os' || $$', array['$$ || :'techb' || $$']::uuid[])$$,
  '22023', 'no se asignan técnicos de otro centro');

-- ---------------------------------------------------------------------------
-- Consumos estándar vs real
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select standard_quantity = 100 and actual_quantity = 120 and unit = 'ml' and unit_cost = 0.05
       and detail_center_id = 'aaaaaaaa-0000-0000-0000-000000000000' and service_order_id = :'os'
     from public.record_service_order_consumption(:'lav_line', :'shampoo', 120, 'Carrocería muy sucia')),
  'consumo real vs estándar (50 ml × 2 lavados = 100), con costo congelado, ligado a OS y centro');
select pg_temp.assert(
  (select actual_quantity = 110 from public.record_service_order_consumption(:'lav_line', :'shampoo', 110))
  and pg_temp.n($$select 1 from public.service_order_consumptions$$) = 1,
  'volver a registrar corrige el real sin duplicar');
select pg_temp.assert_fails($$select public.record_service_order_consumption('$$ || :'pol_line' || $$', '$$ || :'shampoo' || $$', 10)$$,
  '22023', 'sólo se registran insumos configurados para el servicio');
select pg_temp.assert_fails($$select public.record_service_order_consumption('$$ || :'lav_line' || $$', '$$ || :'shampoo' || $$', -1)$$,
  '22023', 'el consumo no es negativo');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select from public.upsert_inventory_item('0e000000-0000-0000-0000-000000000001', :'shampoo', 'SHP-01', 'Shampoo neutro', 'ml', 0.08, true, 'Aumento de proveedor');
reset role;
select pg_temp.assert(
  (select unit_cost = 0.05 from public.service_order_consumptions where item_id = :'lav_line'),
  'el costo del insumo queda congelado en el consumo');

-- ---------------------------------------------------------------------------
-- Incidencias y retrabajos
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.report_service_order_incident(:'os', 'retrabajo', 'Quedaron hologramas en el cofre', :'pol_line')).id as incident \gset
select pg_temp.assert_fails($$select public.resolve_service_order_incident('$$ || :'incident' || $$', '')$$,
  '22023', 'resolver una incidencia exige describir la solución');
select pg_temp.assert(
  (select status = 'resuelta' and resolved_by = '00000000-0000-0000-0000-0000000000f1'
     from public.resolve_service_order_incident(:'incident', 'Se repasó con pulidor fino')),
  'retrabajo reportado y resuelto con responsable');

-- ---------------------------------------------------------------------------
-- Evidencias: Storage privado por centro
-- ---------------------------------------------------------------------------
select :'prefix' || '/aaaaaaaa-1111-4111-8111-000000000001.jpg' as photo \gset
insert into storage.objects (bucket_id, name) values ('service-order-evidence', :'photo');
select pg_temp.assert(
  (select kind = 'antes' and size_bytes = 245000 and width = 1600
     from public.register_service_order_evidence(:'os', :'photo', 'antes', 'image/jpeg', 245000, 1600, 1200, :'lav_line', null, 'Rayón puerta')),
  'operador de A sube y registra evidencia de su OS');
select pg_temp.assert_fails($$insert into storage.objects (bucket_id, name) values ('service-order-evidence',
    '0e000000-0000-0000-0000-000000000001/bbbbbbbb-0000-0000-0000-000000000000/$$ || :'os' || $$/aaaaaaaa-1111-4111-8111-000000000002.jpg')$$,
  '42501', 'no se sube a una ruta que no corresponde al centro de la OS');
select pg_temp.assert_fails($$insert into storage.objects (bucket_id, name) values ('service-order-evidence', '$$ || :'prefix' || $$/../x.jpg')$$,
  '42501', 'rutas arbitrarias rechazadas');
select pg_temp.assert_fails($$select public.register_service_order_evidence('$$ || :'os' || $$',
    '$$ || :'prefix' || $$/aaaaaaaa-1111-4111-8111-000000000009.jpg', 'despues', 'image/jpeg', 1000)$$,
  '22023', 'no se registra evidencia sin archivo subido');
select pg_temp.assert_fails($$select public.register_service_order_evidence('$$ || :'os' || $$', '$$ || :'photo' || $$x', 'despues', 'image/gif', 1000)$$,
  '22023', 'la ruta debe existir y corresponder a la OS');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert(
  pg_temp.n($$select 1 from storage.objects where bucket_id = 'service-order-evidence'$$) = 0
  and pg_temp.n($$select 1 from public.service_order_evidence$$) = 0
  and pg_temp.n($$select 1 from public.service_order_events$$) = 0
  and pg_temp.n($$select 1 from public.service_order_consumptions$$) = 0,
  'la evidencia de A no es accesible para un usuario de B (Storage, metadatos, bitácora y consumos)');
select pg_temp.assert_fails($$insert into storage.objects (bucket_id, name) values ('service-order-evidence',
    '$$ || :'prefix' || $$/aaaaaaaa-1111-4111-8111-000000000003.jpg')$$,
  '42501', 'un usuario de B no sube evidencia a una OS de A');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(
  pg_temp.n($$select 1 from storage.objects where bucket_id = 'service-order-evidence'$$) = 0,
  'el contador tampoco accede a las fotos');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select id as evidence from public.service_order_evidence where storage_path = :'photo' \gset
select pg_temp.assert_fails($$select public.remove_service_order_evidence('$$ || :'evidence' || $$', '')$$,
  '22023', 'retirar evidencia exige motivo');
select pg_temp.assert(
  (select deleted_at is not null and delete_reason = 'Foto borrosa' from public.remove_service_order_evidence(:'evidence', 'Foto borrosa'))
  and pg_temp.n($$select 1 from storage.objects where name = '$$ || :'photo' || $$'$$) = 1,
  'retirar evidencia la oculta con motivo; el archivo se conserva para auditoría');
select pg_temp.assert_fails($$delete from public.service_order_evidence$$, '42501', 'no hay borrado físico de evidencias');
select pg_temp.assert_fails($$insert into public.service_order_events (organization_id, detail_center_id, service_order_id, kind)
    values ('0e000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', '$$ || :'os' || $$', 'os_fin')$$,
  '42501', 'la bitácora no se escribe directamente');

-- Terminar la OS cierra las líneas iniciadas.
select from public.set_service_order_item_work(:'pol_line', 'en_proceso');
select from public.set_service_order_status(:'os', pg_temp.v(:'os'), 'terminada');
select pg_temp.assert(
  (select work_status = 'terminada' and finished_at is not null from public.service_order_items where id = :'pol_line'),
  'terminar la OS cierra las líneas en curso');
select from public.record_service_order_payment(:'os', pg_temp.v(:'os'),
  (select total from public.service_orders where id = :'os'), 'efectivo');
select from public.set_service_order_status(:'os', pg_temp.v(:'os'), 'entregada');
select pg_temp.assert_fails($$insert into storage.objects (bucket_id, name) values ('service-order-evidence',
    '$$ || :'prefix' || $$/aaaaaaaa-1111-4111-8111-000000000004.jpg')$$,
  '42501', 'una OS entregada ya no recibe evidencias');
reset role;

select pg_temp.assert(
  (select array_agg(kind order by occurred_at, id) from public.service_order_events where service_order_id = :'os')
    @> '{os_inicio,linea_inicio,linea_pausa,linea_reanudacion,linea_fin,os_pausa,os_reanudacion,personal,consumo,incidencia,incidencia_resuelta,evidencia,evidencia_eliminada,os_fin}'
  and (select bool_and(actor_id is not null and occurred_at is not null) from public.service_order_events where service_order_id = :'os'),
  'bitácora de ejecución completa, con actor y hora del servidor');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.audit_log where table_name = 'public.service_order_consumptions' and reason = 'Carrocería muy sucia'$$) = 1
  and pg_temp.n($$select 1 from public.audit_log where table_name = 'public.service_order_evidence' and action = 'UPDATE' and reason = 'Foto borrosa'$$) = 1,
  'consumos y evidencias auditados con motivo');

rollback;
