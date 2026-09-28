-- Pruebas de C4: reglas de recomendación (vigencia, etapa, centros, canal,
-- total mínimo), ranking, registro de ofertas, aceptación que agrega la línea
-- por el camino normal (precio y autorización), rechazo, membresía sugerida,
-- indicadores de conversión e ingreso incremental, y permisos.
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

create function pg_temp.targets(p_order uuid) returns text language sql as $$
  select coalesce(string_agg(target_name, ',' order by priority desc, target_name), '')
    from public.upsell_suggestions(p_order, 10)
$$;

grant execute on all functions in schema pg_temp to authenticated, anon;

-- Reglas puras (espejo de upsellStage / acceptanceScore).
select pg_temp.assert(
  private.upsell_stage('abierta') = 'diagnostico' and private.upsell_stage('autorizada') = 'diagnostico'
  and private.upsell_stage('en_proceso') = 'cierre' and private.upsell_stage('pausada') = 'cierre'
  and private.upsell_stage('terminada') = 'cierre'
  and private.upsell_stage('entregada') is null and private.upsell_stage('cancelada') is null,
  'etapa: diagnóstico antes de trabajar, cierre hasta entregar; nada después');
select pg_temp.assert(
  private.upsell_score(0, 0) = 0.5 and private.upsell_score(3, 4) = round(4::numeric / 6, 4)
  and private.upsell_score(0, 8) = 0.1,
  'tasa de aceptación suavizada: (aceptadas + 1) ÷ (ofrecidas + 2)');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@a'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
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
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'contador');

select private.center_today('aaaaaaaa-0000-0000-0000-000000000000') as today \gset
\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set B 'bbbbbbbb-0000-0000-0000-000000000000'
\set ORG '0e000000-0000-0000-0000-000000000001'

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service(:'ORG', 'LAV', 'Lavado', null, 'recurrente', 40, 250, 80)).id as lav \gset
select (public.create_service(:'ORG', 'DESC', 'Descontaminación', null, 'valor_medio', 60, 650, 180)).id as desc_ \gset
select (public.create_service(:'ORG', 'POL', 'Pulido', null, 'valor_medio', 120, 2800, 900)).id as pol \gset
select (public.create_service(:'ORG', 'CER', 'Cerámico', null, 'premium', 480, 12000, 4200)).id as cer \gset
select (public.create_service(:'ORG', 'ARO', 'Aromatizante', null, 'producto_complemento', 5, 90, 30)).id as aro \gset
select (public.upsert_membership_plan(:'ORG', null, 'CARE', 'care', 'Care', null, 449, 1::smallint, 'centro_origen', null,
  7::smallint, null, null, true, 'Alta del plan')).id as care \gset
select from public.set_membership_benefit(:'care', :'lav', 2::smallint, null, 'Beneficio');

-- Reglas: cadena lavado -> descontaminación -> pulido; producto y membresía al cierre.
select (public.upsert_upsell_rule(:'ORG', null, 'Lavado → descontaminación', :'lav', :'desc_', null, 'diagnostico', 90::smallint,
  'Deja la pintura lista para pulir y proteger', null, null, null, null, null, true, 'Alta')).id as r1 \gset
select (public.upsert_upsell_rule(:'ORG', null, 'Descontaminación → pulido', :'desc_', :'pol', null, 'diagnostico', 80::smallint,
  'Corrige micro rayones tras descontaminar', null, null, null, null, null, true, 'Alta')).id as r2 \gset
select (public.upsert_upsell_rule(:'ORG', null, 'Aromatizante al cierre', null, :'aro', null, 'cierre', 40::smallint,
  'Un detalle para entregar el auto', null, null, null, null, null, true, 'Alta')).id as r3 \gset
select (public.upsert_upsell_rule(:'ORG', null, 'Lavado → membresía', :'lav', null, :'care', 'cierre', 60::smallint,
  'Con la membresía, dos lavados al mes', '{b2c,membresia}', null, null, null, null, true, 'Alta')).id as r4 \gset
select (public.upsert_upsell_rule(:'ORG', null, 'Inactiva', :'lav', :'cer', null, 'diagnostico', 100::smallint,
  'No debe aparecer', null, null, null, null, null, false, 'Alta')).id as r5 \gset
select (public.upsert_upsell_rule(:'ORG', null, 'Vencida', :'lav', :'cer', null, 'ambos', 95::smallint,
  'No debe aparecer', null, null, null, (:'today'::date - 10), (:'today'::date - 1), true, 'Alta')).id as r6 \gset
select pg_temp.assert(
  (select starts_on = private.org_today(:'ORG') from public.upsell_rules where id = :'r1'),
  'una regla sin fecha de inicio arranca en el hoy local de la organización, no en la fecha UTC');
select (public.upsert_upsell_rule(:'ORG', null, 'Sólo centro B', :'lav', :'pol', null, 'diagnostico', 70::smallint,
  'Sólo en B', null, array[:'B'::uuid], null, null, null, true, 'Alta')).id as r7 \gset
select (public.upsert_upsell_rule(:'ORG', null, 'Ticket alto', :'lav', :'cer', null, 'diagnostico', 50::smallint,
  'Sólo con ticket alto', null, null, 5000, null, null, true, 'Alta')).id as r8 \gset
select pg_temp.assert_fails($$select public.upsert_upsell_rule('$$ || :'ORG' || $$', null, 'Doble destino', null, '$$ || :'aro' || $$',
  '$$ || :'care' || $$', 'cierre', 10::smallint, 'x x x', null, null, null, null, null, true, 'Alta')$$, '22023',
  'una regla tiene un solo destino (servicio o plan)');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.upsert_upsell_rule('$$ || :'ORG' || $$', null, 'X', null, '$$ || :'aro' || $$', null,
  'cierre', 10::smallint, 'x x x', null, null, null, null, null, true, 'Alta')$$, '42501', 'el encargado no configura reglas');
reset role;

-- ---------------------------------------------------------------------------
-- Diagnóstico: sólo reglas activas, vigentes, del centro y elegibles
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(pg_temp.n('select 1 from public.upsell_rules') = 8, 'el operador lee las reglas de su organización');
select pg_temp.assert_fails($$select public.upsert_upsell_rule('$$ || :'ORG' || $$', '$$ || :'r5' || $$', 'X', '$$ || :'lav' || $$',
  '$$ || :'cer' || $$', null, 'diagnostico', 100::smallint, 'x x x', null, null, null, null, null, true, 'Activar')$$, '42501',
  'el operador no activa reglas');
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000001', 'José Pérez', '5512345678', null, 'person', null,
  '{}', 'web', '[{"make":"Mazda","model":"3","year":2021,"plate":"ABC1234"}]'::jsonb)).id as jose \gset
select id as jose_car from public.vehicles where plate = 'ABC1234' \gset
select (public.create_service_order(:'A', '30000000-0000-4000-8000-000000000001', :'jose', :'jose_car',
  jsonb_build_array(jsonb_build_object('service_id', :'lav')))).id as os1 \gset
select pg_temp.assert(pg_temp.targets(:'os1') = 'Descontaminación',
  'regla inactiva, vencida, de otro centro o sin el total mínimo no aparece');
select pg_temp.assert(
  (select pitch = 'Deja la pintura lista para pulir y proteger' and source_service_name = 'Lavado' and price = 650
          and stage = 'diagnostico' and acceptance_rate = 0.5
     from public.upsell_suggestions(:'os1')),
  'sugerencia explicable: argumento, servicio origen, precio y tasa de aceptación');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.upsell_offers where service_order_id = '$$ || :'os1' || $$' and status = 'ofrecida'$$) = 1,
  'la sugerencia mostrada queda registrada como ofrecida, una sola vez por regla y OS');

-- Aceptar en OS abierta: agrega la línea con el precio del centro.
select from public.accept_upsell(:'os1', pg_temp.v(:'os1'), :'r1');
select pg_temp.assert(
  (select total = 900 and status = 'abierta' from public.service_orders where id = :'os1')
  and (select unit_price = 650 and price_source = 'base' from public.service_order_items
        where service_order_id = :'os1' and service_id = :'desc_')
  and (select status = 'aceptada' and accepted_value = 650 and accepted_item_id is not null and decided_by is not null
         from public.upsell_offers where service_order_id = :'os1' and rule_id = :'r1'),
  'aceptar agrega la línea con su precio congelado y registra el valor incremental');
select from public.accept_upsell(:'os1', pg_temp.v(:'os1'), :'r1');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.service_order_items where service_order_id = '$$ || :'os1' || $$'$$) = 2,
  'aceptar dos veces no duplica la línea');
select pg_temp.assert(pg_temp.targets(:'os1') = 'Pulido', 'la cadena sigue: tras la descontaminación se sugiere el pulido');
select from public.reject_upsell(:'os1', :'r2', 'precio');
select pg_temp.assert(pg_temp.targets(:'os1') = '', 'una sugerencia rechazada no vuelve a aparecer en la OS');
select pg_temp.assert_fails($$select public.accept_upsell('$$ || :'os1' || $$', pg_temp.v('$$ || :'os1' || $$'), '$$ || :'r2' || $$')$$,
  'MG002', 'no se acepta una sugerencia rechazada');
select pg_temp.assert_fails($$select public.reject_upsell('$$ || :'os1' || $$', '$$ || :'r2' || $$', 'caro')$$, '22023',
  'motivo de rechazo de una lista cerrada');

-- OS autorizada: el adicional se agrega con motivo y actualiza el total autorizado.
select (public.create_service_order(:'A', '30000000-0000-4000-8000-000000000002', :'jose', :'jose_car',
  jsonb_build_array(jsonb_build_object('service_id', :'lav')))).id as os2 \gset
select from public.set_service_order_status(:'os2', pg_temp.v(:'os2'), 'autorizada');
select pg_temp.assert(pg_temp.targets(:'os2') = 'Descontaminación', 'en OS autorizada también se sugiere (diagnóstico)');
select from public.accept_upsell(:'os2', pg_temp.v(:'os2'), :'r1');
select pg_temp.assert(
  (select status = 'autorizada' and total = 900 and authorized_total = 900 from public.service_orders where id = :'os2'),
  'aceptación en OS autorizada: sigue autorizada y el total autorizado incluye el adicional');
reset role;
select pg_temp.assert(
  exists (select 1 from public.audit_log where table_name = 'public.service_order_items'
            and reason = 'Adicional sugerido aceptado por el cliente: Lavado → descontaminación'),
  'la línea adicional queda auditada con motivo');

-- ---------------------------------------------------------------------------
-- Cierre: producto y membresía
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select from public.set_service_order_status(:'os2', pg_temp.v(:'os2'), 'en_proceso');
select pg_temp.assert(pg_temp.targets(:'os2') = 'Care,Aromatizante',
  'al cierre: membresía (prioridad 60) antes que el producto (40); lo aceptado no se repite');
select from public.set_service_order_status(:'os2', pg_temp.v(:'os2'), 'terminada');
select pg_temp.assert(pg_temp.targets(:'os2') = 'Care', 'OS terminada: sólo sugerencias que no agregan líneas');
select from public.accept_upsell(:'os2', pg_temp.v(:'os2'), :'r4');
select pg_temp.assert(
  (select status = 'aceptada' and accepted_value = 449 and accepted_item_id is null
     from public.upsell_offers where service_order_id = :'os2' and rule_id = :'r4')
  and (select total = 900 from public.service_orders where id = :'os2'),
  'membresía aceptada: registra la intención y su valor sin tocar la OS');
select (public.create_membership(:'A', gen_random_uuid(), :'care', :'jose', :'jose_car')).id as mem \gset
select (public.create_service_order(:'A', gen_random_uuid(), :'jose', :'jose_car',
  jsonb_build_array(jsonb_build_object('service_id', :'lav')))).id as os3 \gset
select from public.set_service_order_status(:'os3', pg_temp.v(:'os3'), 'autorizada');
select from public.set_service_order_status(:'os3', pg_temp.v(:'os3'), 'en_proceso');
select pg_temp.assert(pg_temp.targets(:'os3') = 'Aromatizante', 'con membresía vigente no se sugiere la membresía');
reset role;

-- ---------------------------------------------------------------------------
-- Permisos y nunca bloquear
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert(pg_temp.targets(:'os1') = '' and pg_temp.n('select 1 from public.upsell_offers') = 0,
  'otro centro: sin sugerencias ni ofertas visibles (vacío, sin error)');
select pg_temp.assert_fails($$select public.accept_upsell('$$ || :'os3' || $$', 1, '$$ || :'r3' || $$')$$, 'MG002',
  'otro centro no acepta sugerencias de una OS ajena');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails($$insert into public.upsell_offers (organization_id, detail_center_id, service_order_id, rule_id, stage,
  suggested_price) values ('$$ || :'ORG' || $$', '$$ || :'A' || $$', '$$ || :'os1' || $$', '$$ || :'r3' || $$', 'cierre', 1)$$,
  '42501', 'nadie escribe ofertas directamente');
-- Quitar la línea aceptada: el ingreso realizado deja de contar.
select from public.set_service_order_item(:'os1', pg_temp.v(:'os1'), :'desc_', 0, 'Cliente cambió de opinión');
reset role;

-- ---------------------------------------------------------------------------
-- Indicadores: tasa de aceptación e ingreso incremental
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert(
  (select offered = 2 and accepted = 2 and rejected = 0 and incremental_revenue = 650
     from public.upsell_metric_facts(array[:'A'::uuid], :'today'::date - 1, :'today'::date) where rule_id = :'r1')
  and (select offered = 1 and accepted = 0 and rejected = 1
     from public.upsell_metric_facts(array[:'A'::uuid], :'today'::date - 1, :'today'::date) where rule_id = :'r2')
  and (select accepted = 1 and membership_value = 449 and target_kind = 'membresia'
     from public.upsell_metric_facts(array[:'A'::uuid], :'today'::date - 1, :'today'::date) where rule_id = :'r4'),
  'indicadores por regla: ofrecidas, aceptadas, rechazadas, ingreso realizado (línea quitada = 0) y membresías');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.upsell_metric_facts(array['$$ || :'A' || $$'::uuid], current_date - 1, current_date)$$) > 0,
  'el contador consulta los indicadores (sin datos personales)');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.upsell_metric_facts(array['$$ || :'A' || $$'::uuid], current_date - 1, current_date)$$) = 0,
  'el operador no ve los indicadores');
reset role;

select pg_temp.assert(
  exists (select 1 from public.audit_log where table_name = 'public.upsell_rules' and reason = 'Alta')
  and exists (select 1 from public.audit_log where table_name = 'public.upsell_offers' and reason = 'Sugerencia rechazada'),
  'auditoría de reglas y decisiones');

rollback;
