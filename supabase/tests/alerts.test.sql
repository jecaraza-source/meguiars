-- Pruebas de D4: alertas y gestión por excepción. Reglas (sólo admin
-- corporativo, validadas), bandeja con permisos por centro, antispam
-- (una alerta abierta por regla y ámbito; cooldown tras resolver), resolver
-- conserva el historial, trazabilidad al KPI y periodo, y la evaluación
-- programada con la llave de servicio (hechos con los permisos del autor).
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

create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
end $$;

-- Resultado de un ámbito para record_alert_results.
create function pg_temp.res(p_scope text, p_centers uuid[], p_triggered boolean, p_value numeric)
returns jsonb language sql as $$
  select jsonb_build_object('scope_key', p_scope, 'center_ids', to_jsonb(p_centers), 'triggered', p_triggered,
    'value', p_value, 'previous_value', null, 'change_pct', null,
    'period_from', current_date - 1, 'period_to', current_date - 1, 'previous_from', null, 'previous_to', null)
$$;

grant execute on all functions in schema pg_temp to authenticated, anon, service_role;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000e2', 'encargado@b'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno'),
  ('0e000000-0000-0000-0000-000000000002', 'org-dos', 'Organización Dos');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Mexico_City'),
  ('cccccccc-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000002', 'C-01', 'Centro C', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e2', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'contador'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion');

\set O1 '0e000000-0000-0000-0000-000000000001'
\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set B 'bbbbbbbb-0000-0000-0000-000000000000'
\set C 'cccccccc-0000-0000-0000-000000000000'

-- Reglas: sólo el admin corporativo, validadas.
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.save_alert_rule('0e000000-0000-0000-0000-000000000001', null, null, 'Venta baja',
  null, 'pnl.revenue', null, 'below', 1000, 'dia', 'centro', array['aaaaaaaa-0000-0000-0000-000000000000']::uuid[],
  'critica', 60, true, 'Alta')$$, '42501', 'un encargado no configura reglas');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.save_alert_rule(:'O1', null, null, 'Venta diaria baja', 'Menos de $1,000 al día', 'pnl.revenue', null,
  'below', 1000, 'dia', 'centro', array[:'A', :'B']::uuid[], 'critica', 60, true, 'Alta de regla')).id as r1 \gset
select (public.save_alert_rule(:'O1', null, null, 'Caída de EBITDA', null, 'pnl.ebitda', null,
  'drop_pct', 20, 'mes_en_curso', 'conjunto', array[:'A', :'B']::uuid[], 'atencion', 1440, true, 'Alta de regla')).id as r2 \gset
select (public.save_alert_rule(:'O1', null, null, 'Sin ventas B2B', null, 'pnl.revenue', 'b2b',
  'no_data', null, 'semana', 'corporativo', null, 'informativa', 1440, true, 'Alta de regla')).id as r3 \gset
select pg_temp.assert((select count(*) from public.alert_rules) = 3
  and (select center_ids from public.alert_rules where id = :'r3') is null,
  'el admin corporativo crea reglas por centro, conjunto y corporativo');
select pg_temp.assert_fails($$select public.save_alert_rule('0e000000-0000-0000-0000-000000000001', null, null, 'Sin datos',
  null, 'pnl.revenue', null, 'no_data', 5, 'dia', 'corporativo', null, 'informativa', 60, true, 'Alta')$$, '22023',
  'ausencia de dato no lleva umbral');
select pg_temp.assert_fails($$select public.save_alert_rule('0e000000-0000-0000-0000-000000000001', null, null, 'Variación',
  null, 'pnl.revenue', null, 'drop_pct', 0, 'dia', 'corporativo', null, 'informativa', 60, true, 'Alta')$$, '22023',
  'una variación exige umbral positivo');
select pg_temp.assert_fails($$select public.save_alert_rule('0e000000-0000-0000-0000-000000000001', null, null, 'Conjunto',
  null, 'pnl.revenue', null, 'below', 5, 'dia', 'conjunto', array['aaaaaaaa-0000-0000-0000-000000000000']::uuid[],
  'informativa', 60, true, 'Alta')$$, '22023', 'un conjunto tiene al menos dos centros');
select pg_temp.assert_fails($$select public.save_alert_rule('0e000000-0000-0000-0000-000000000001', null, null, 'Ajeno',
  null, 'pnl.revenue', null, 'below', 5, 'dia', 'centro', array['cccccccc-0000-0000-0000-000000000000']::uuid[],
  'informativa', 60, true, 'Alta')$$, '22023', 'los centros deben ser de la organización');
select pg_temp.assert_fails($$select public.save_alert_rule('0e000000-0000-0000-0000-000000000001', null, null, 'Canal',
  null, 'membership.mrr', 'b2b', 'below', 5, 'dia', 'corporativo', null, 'informativa', 60, true, 'Alta')$$, '22023',
  'el canal fijo sólo en métricas que lo admiten');
select pg_temp.assert_fails($$select public.save_alert_rule('0e000000-0000-0000-0000-000000000001', null, null, 'Sin motivo',
  null, 'pnl.revenue', null, 'below', 5, 'dia', 'corporativo', null, 'informativa', 60, true, null)$$, '22023',
  'configurar una regla exige motivo');
select pg_temp.assert_fails(format($$select public.save_alert_rule(%L, %L, 9, 'Venta diaria baja', null, 'pnl.revenue',
  null, 'below', 900, 'dia', 'centro', array[%L, %L]::uuid[], 'critica', 60, true, 'Cambio')$$, :'O1', :'r1', :'A', :'B'),
  '40001', 'una versión vieja se rechaza');

-- Evaluación manual (admin corporativo): una alerta por ámbito.
select pg_temp.assert_fails($$select public.start_alert_run('0e000000-0000-0000-0000-000000000001', 'cron')$$, '22023',
  'sólo la llave de servicio evalúa como cron');
select public.start_alert_run(:'O1', 'manual') as run1 \gset
select public.record_alert_results(:'run1', :'r1', jsonb_build_array(
  pg_temp.res(:'A', array[:'A']::uuid[], true, 420), pg_temp.res(:'B', array[:'B']::uuid[], false, 1800))) as out1 \gset
select pg_temp.assert(jsonb_array_length(:'out1'::jsonb -> 'created') = 1
  and (select count(*) from public.alert_instances where rule_id = :'r1') = 1,
  'sólo el ámbito que cumple la condición genera alerta');
select pg_temp.assert(
  (select (metric_id, threshold, value, severity, scope_key, detail_center_ids, period_from, rule_name)
     = ('pnl.revenue', 1000.00, 420.0000, 'critica', :'A', array[:'A']::uuid[], current_date - 1, 'Venta diaria baja')
     from public.alert_instances where rule_id = :'r1'),
  'la alerta se rastrea al KPI, umbral, valor, centros y periodo que la originaron');
-- La misma condición otra vez: no se duplica.
select public.record_alert_results(:'run1', :'r1', jsonb_build_array(pg_temp.res(:'A', array[:'A']::uuid[], true, 380))) as out2 \gset
select public.record_alert_results(:'run1', :'r1', jsonb_build_array(pg_temp.res(:'A', array[:'A']::uuid[], true, 350))) as out3 \gset
select pg_temp.assert(
  (select count(*) from public.alert_instances where rule_id = :'r1') = 1
  and (select (occurrences, last_value, value) = (3, 350.0000, 420.0000) from public.alert_instances where rule_id = :'r1')
  and (:'out3'::jsonb ->> 'updated')::int = 1,
  'la misma condición no duplica: actualiza ocurrencias y último valor (conserva el original)');
select from public.record_alert_results(:'run1', :'r1', jsonb_build_array(pg_temp.res(:'B', array[:'B']::uuid[], true, 300)));
select from public.record_alert_results(:'run1', :'r2', jsonb_build_array(pg_temp.res('conjunto', array[:'A', :'B']::uuid[], true, -25)));
select pg_temp.assert_fails(format($$select public.record_alert_results(%L, %L, %L::jsonb)$$, :'run1', :'r1',
  jsonb_build_array(pg_temp.res(:'C', array[:'C']::uuid[], true, 1))), '22023', 'los centros deben ser de la regla');
select pg_temp.assert((select created from public.alert_evaluation_runs where id = :'run1') = 3,
  'la bitácora cuenta las alertas creadas');
reset role;

-- Permisos por centro: una alerta se ve con permiso en TODOS sus centros.
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert((select array_agg(scope_key) from public.alert_instances) = array[:'A'],
  'encargado de A: ve la alerta de A; no la de B ni la del conjunto A+B');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select pg_temp.assert((select array_agg(scope_key) from public.alert_instances) = array[:'B'], 'encargado de B: sólo la de B');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert((select count(*) from public.alert_instances) = 0, 'recepción: sin alertas');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select id as ia from public.alert_instances where scope_key = :'A' \gset
select pg_temp.assert((select count(*) from public.alert_instances) = 1, 'contador de A: consulta la alerta de A');
select pg_temp.assert_fails(format($$select public.review_alert(%L)$$, :'ia'), '42501', 'el contador no gestiona alertas');
select pg_temp.assert((select count(*) from public.alert_evaluation_runs) = 0, 'la bitácora de evaluaciones es del admin');
reset role;

-- Gestión: nueva → revisada → resuelta; resolver conserva el historial.
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select pg_temp.assert_fails(format($$select public.review_alert(%L)$$, :'ia'), '42501', 'no se gestiona la alerta de otro centro');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert((public.review_alert(:'ia', 'Lo veo con el equipo')).status = 'revisada', 'el encargado la marca revisada');
select pg_temp.assert_fails(format($$select public.resolve_alert(%L, '')$$, :'ia'), '22023', 'resolver exige nota');
select pg_temp.assert((public.resolve_alert(:'ia', 'Faltaba capturar las OS del turno')).status = 'resuelta', 'y la resuelve con nota');
select pg_temp.assert_fails(format($$select public.resolve_alert(%L, 'Otra vez')$$, :'ia'), '22023', 'una alerta resuelta no se resuelve de nuevo');
select pg_temp.assert(
  (select count(*) from public.alert_instances where id = :'ia') = 1
  and (select string_agg(kind, ',' order by id) from public.alert_events where instance_id = :'ia')
      = 'creada,repetida,repetida,revisada,resuelta',
  'resolver no elimina: la alerta y su historial completo se conservan');
reset role;

-- Cooldown tras resolver; condición superada no resuelve sola.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select public.record_alert_results(:'run1', :'r1', jsonb_build_array(
  pg_temp.res(:'A', array[:'A']::uuid[], true, 200), pg_temp.res(:'B', array[:'B']::uuid[], false, 1500))) as out4 \gset
select pg_temp.assert((:'out4'::jsonb ->> 'suppressed')::int = 1 and (:'out4'::jsonb ->> 'cleared')::int = 1
  and (select count(*) from public.alert_instances where rule_id = :'r1' and scope_key = :'A') = 1,
  'dentro del cooldown la misma condición no crea otra alerta');
select pg_temp.assert(
  (select (status, condition_cleared_at is not null) = ('nueva', true) from public.alert_instances where scope_key = :'B'),
  'si la condición deja de cumplirse se marca, pero no se resuelve sola');
select from public.save_alert_rule(:'O1', :'r1', 1, 'Venta diaria baja', null, 'pnl.revenue', null, 'below', 1000, 'dia',
  'centro', array[:'A', :'B']::uuid[], 'critica', 0, true, 'Sin cooldown para la prueba');
select public.record_alert_results(:'run1', :'r1', jsonb_build_array(pg_temp.res(:'A', array[:'A']::uuid[], true, 150))) as out5 \gset
select pg_temp.assert(jsonb_array_length(:'out5'::jsonb -> 'created') = 1
  and (select count(*) from public.alert_instances where rule_id = :'r1' and scope_key = :'A') = 2
  and (select count(*) from public.alert_instances where rule_id = :'r1' and scope_key = :'A' and status <> 'resuelta') = 1,
  'pasado el cooldown se abre una alerta nueva y la resuelta queda en el historial');
select from public.finish_alert_run(:'run1', 3);
select pg_temp.assert_fails(format($$select public.record_alert_results(%L, %L, '[]'::jsonb)$$, :'run1', :'r1'), '42501',
  'una evaluación cerrada no recibe resultados');
select pg_temp.assert_fails($$insert into public.alert_instances (organization_id, rule_id, rule_name, metric_id, condition,
  severity, scope_key, detail_center_ids, period_from, period_to, last_period_from, last_period_to)
  select organization_id, id, name, metric_id, condition, severity, 'x', array['aaaaaaaa-0000-0000-0000-000000000000']::uuid[],
  current_date, current_date, current_date, current_date from public.alert_rules limit 1$$, '42501',
  'sin escritura directa en la bandeja');
reset role;

-- Evaluación programada con la llave de servicio.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert_fails(format($$select public.alert_rule_facts(%L, array['pnl'], array[%L]::uuid[], current_date, current_date)$$,
  :'r1', :'A'), '42501', 'sólo la evaluación programada lee hechos por regla');
reset role;
select pg_temp.as_service();
select public.start_alert_run(:'O1', 'cron') as run2 \gset
select public.alert_rule_facts(:'r1', array['pnl', 'orders'], array[:'A', :'B']::uuid[], current_date - 1, current_date - 1) as f \gset
select pg_temp.assert(:'f'::jsonb ? 'pnl' and jsonb_array_length(:'f'::jsonb -> 'centers') = 2,
  'el cron lee los hechos con los permisos del autor de la regla (admin corporativo: ambos centros)');
select public.record_alert_results(:'run2', :'r3', jsonb_build_array(
  pg_temp.res('corporativo', array[:'A', :'B']::uuid[], true, null))) as out6 \gset
select pg_temp.assert(jsonb_array_length(:'out6'::jsonb -> 'created') = 1
  and (select (source, actor_id) from public.alert_evaluation_runs where id = :'run2') = ('cron'::text, null::uuid),
  'el cron registra alertas y su corrida (sin actor)');
select from public.finish_alert_run(:'run2', 1);
reset role;
select pg_temp.assert(
  (select count(*) from public.audit_log where table_name = 'public.alert_rules' and reason = 'Alta de regla') = 3,
  'los cambios de reglas quedan auditados');

rollback;
