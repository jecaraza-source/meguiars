-- Pruebas de D1: tableros ejecutivos. Registro de métricas (sin SQL libre),
-- alta y edición de tableros con widgets validados contra el registro,
-- idempotencia y versión, tablero corporativo por defecto, visibilidad por rol
-- y centro (RLS), vista personal (orden, ocultos, filtros, favorito) y hechos
-- en una sola llamada consistentes con el P&L y con los permisos por centro.
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

create function pg_temp.dv(p_id uuid) returns integer language sql security definer as $$
  select version from public.dashboard_definitions where id = p_id
$$;

-- Entrega (fixture): la ejecución y el cobro no son parte de esta prueba.
create function pg_temp.deliver(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('session_replication_role', 'replica', true);
  update public.service_orders
     set status = 'entregada', started_at = now() - interval '2 hours', finished_at = now() - interval '1 hour',
         delivered_at = now()
   where id = p_id;
  perform set_config('session_replication_role', 'origin', true);
end $$;

grant execute on all functions in schema pg_temp to authenticated, anon;

-- Registro de métricas: catálogo inicial coherente y sin escritura directa.
select pg_temp.assert((select count(*) from public.metric_registry) >= 16, 'el catálogo inicial registra 16 métricas');
select pg_temp.assert(not exists (
  select 1 from public.metric_registry
   where length(formula) < 5 or length(description) < 10 or cardinality(source_tables) = 0 or capability = ''),
  'cada métrica tiene definición, fórmula, fuente, unidad y permiso');
select pg_temp.assert(
  (select filters from public.metric_registry where id = 'pnl.revenue') = '{canal,motor}'
  and (select filters from public.metric_registry where id = 'pnl.ebitda') = '{}',
  'sólo las métricas compatibles declaran los filtros de canal y motor');
select private.register_metric('test.demo', 2, 'Demo v2', 'Métrica de prueba v2', 'count', 'Fórmula v2', 'pnl',
  '{x}', 'pnl.read', '{kpi}', '{}', '{}', false);
select private.register_metric('test.demo', 1, 'Demo v1', 'Métrica de prueba v1', 'count', 'Fórmula v1', 'pnl',
  '{x}', 'pnl.read', '{kpi}', '{}', '{}', false);
select pg_temp.assert((select name from public.metric_registry where id = 'test.demo') = 'Demo v2',
  'una versión anterior no pisa la métrica registrada');
select pg_temp.assert_fails($$select private.register_metric('test.otra', 1, 'Otra', 'Métrica de prueba', 'count',
  'Fórmula', 'pnl', '{x}', 'pnl.read', '{distribution}', '{}', '{}', false)$$, '23514',
  'una distribución exige declarar sus desgloses');
select pg_temp.assert(private.valid_widget_options('{"grain":"semana","limit":5}')
  and not private.valid_widget_options('{"sql":"select 1"}')
  and not private.valid_widget_options('{"limit":50}')
  and not private.valid_widget_options('[]'),
  'opciones de widget: sólo claves conocidas y valores acotados');
select pg_temp.assert(private.valid_dashboard_filters('{"centros":["aaaaaaaa-0000-0000-0000-000000000000"],"canal":"b2b","periodo":"mes"}')
  and not private.valid_dashboard_filters('{"canal":"x"}')
  and not private.valid_dashboard_filters('{"centros":["no-uuid"]}')
  and not private.valid_dashboard_filters('{"where":"1=1"}'),
  'filtros guardados: sólo claves y valores permitidos');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin-centro@a'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@a'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000e2', 'encargado@b'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000b1', 'comercial@a'),
  ('00000000-0000-0000-0000-0000000000d1', 'admin@o2');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno'),
  ('0e000000-0000-0000-0000-000000000002', 'org-dos', 'Organización Dos');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Monterrey'),
  ('cccccccc-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000002', 'C-01', 'Centro C', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio'),
  ('0e000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d1', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', 'admin_socio'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e2', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'comercial_b2b'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'contador');

\set O1 '0e000000-0000-0000-0000-000000000001'
\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set B 'bbbbbbbb-0000-0000-0000-000000000000'
select private.center_today(:'A') as today \gset

-- Tablero corporativo por defecto (la migración lo crea para organizaciones existentes).
select private.seed_default_dashboard(:'O1');
select private.seed_default_dashboard(:'O1');
select id as corp from public.dashboard_definitions where organization_id = :'O1' and is_default \gset
select pg_temp.assert((select count(*) from public.dashboard_widgets where dashboard_id = :'corp') = 12,
  'el tablero corporativo por defecto trae 12 widgets y no se duplica');

-- Alta: sólo el admin corporativo, widgets validados contra el registro.
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select pg_temp.assert_fails($$select public.save_dashboard('0e000000-0000-0000-0000-000000000001', null,
  gen_random_uuid(), null, 'Mío', null, null, null, 'mes', false,
  '[{"metric_id":"pnl.revenue","widget_type":"kpi"}]', null)$$, '42501',
  'un admin de centro no configura tableros');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.save_dashboard('0e000000-0000-0000-0000-000000000001', null,
  gen_random_uuid(), null, 'Mío', null, null, null, 'mes', false,
  '[{"metric_id":"pnl.revenue","widget_type":"kpi"}]', null)$$, '42501',
  'un encargado no configura tableros');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert_fails($$select public.save_dashboard('0e000000-0000-0000-0000-000000000001', null,
  gen_random_uuid(), null, 'Libre', null, null, null, 'mes', false,
  '[{"metric_id":"select sum(total) from service_orders","widget_type":"kpi"}]', null)$$, '22023',
  'no hay SQL libre: la métrica debe estar registrada');
select pg_temp.assert_fails($$select public.save_dashboard('0e000000-0000-0000-0000-000000000001', null,
  gen_random_uuid(), null, 'Embudo', null, null, null, 'mes', false,
  '[{"metric_id":"pnl.revenue","widget_type":"funnel"}]', null)$$, '22023',
  'el tipo de widget debe ser uno de los que admite la métrica');
select pg_temp.assert_fails($$select public.save_dashboard('0e000000-0000-0000-0000-000000000001', null,
  gen_random_uuid(), null, 'Desglose', null, null, null, 'mes', false,
  '[{"metric_id":"pnl.revenue","widget_type":"distribution","options":{"breakdown":"forma_pago"}}]', null)$$, '22023',
  'el desglose debe ser uno de los de la métrica');
select pg_temp.assert_fails($$select public.save_dashboard('0e000000-0000-0000-0000-000000000001', null,
  gen_random_uuid(), null, 'Grande', null, null, null, 'mes', false,
  '[{"metric_id":"pnl.revenue","widget_type":"kpi","col_span":5}]', null)$$, '22023',
  'el tamaño del widget está acotado a la rejilla');
select pg_temp.assert_fails($$select public.save_dashboard('0e000000-0000-0000-0000-000000000001', null,
  gen_random_uuid(), null, 'Vacío', null, null, null, 'mes', false, '[]', null)$$, '22023',
  'un tablero lleva al menos un widget');
select pg_temp.assert_fails($$select public.save_dashboard('0e000000-0000-0000-0000-000000000001', null,
  gen_random_uuid(), null, 'Ajeno', null, null, array['cccccccc-0000-0000-0000-000000000000'::uuid], 'mes', false,
  '[{"metric_id":"pnl.revenue","widget_type":"kpi"}]', null)$$, '22023',
  'los centros permitidos son de la organización');
select pg_temp.assert_fails($$select public.save_dashboard('0e000000-0000-0000-0000-000000000001', null,
  gen_random_uuid(), null, 'Defecto', null, 'encargado', null, 'mes', true,
  '[{"metric_id":"pnl.revenue","widget_type":"kpi"}]', null)$$, 'MG002',
  'el tablero por defecto es para todos los roles y centros');

select (public.save_dashboard(:'O1', null, '40000000-0000-4000-8000-000000000001', null, 'Operación centro A',
  'Para encargados', 'encargado', array[:'A'::uuid], 'semana', false,
  '[{"metric_id":"pnl.revenue","widget_type":"kpi","title":"Ventas del centro"},
    {"metric_id":"pnl.revenue","widget_type":"distribution","col_span":2,"row_span":2},
    {"metric_id":"payments.collected","widget_type":"timeseries","col_span":2,"options":{"grain":"dia"}}]',
  null)).id as enc \gset
select pg_temp.assert(
  (select id from public.save_dashboard(:'O1', null, '40000000-0000-4000-8000-000000000001', null, 'Duplicado', null,
     null, null, 'mes', false, '[{"metric_id":"pnl.ebitda","widget_type":"kpi"}]', null)) = :'enc'
  and (select count(*) from public.dashboard_definitions where request_id = '40000000-0000-4000-8000-000000000001') = 1,
  'el alta es idempotente por request_id');
select pg_temp.assert(
  (select options from public.dashboard_widgets where dashboard_id = :'enc' and position = 2) = '{"breakdown": "motor"}',
  'la distribución sin desglose toma el primero de la métrica');
reset role;
select pg_temp.assert((select count(*) from public.audit_log where table_name = 'public.dashboard_widgets'
  and record_id::text in (select id::text from public.dashboard_widgets where dashboard_id = :'enc')) = 3,
  'los widgets quedan auditados');

-- Visibilidad: rol de la audiencia y centro permitido.
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert(pg_temp.n($$select 1 from public.dashboard_definitions$$) = 2
  and pg_temp.n($$select 1 from public.dashboard_widgets$$) = 15,
  'el encargado del centro A ve el corporativo y el suyo, con sus widgets');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select pg_temp.assert(pg_temp.n($$select 1 from public.dashboard_definitions$$) = 1,
  'el encargado del centro B no ve el tablero del centro A');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(pg_temp.n($$select 1 from public.dashboard_definitions$$) = 1,
  'el contador no ve un tablero dirigido a encargados');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(pg_temp.n($$select 1 from public.dashboard_definitions$$) = 0
  and pg_temp.n($$select 1 from public.dashboard_widgets$$) = 0,
  'el operador de recepción no ve tableros');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select pg_temp.assert(pg_temp.n($$select 1 from public.dashboard_definitions where organization_id = '0e000000-0000-0000-0000-000000000001'$$) = 0,
  'otra organización no ve los tableros');
reset role;

-- Edición: conserva widgets por id, versión y motivo.
select id as w1 from public.dashboard_widgets where dashboard_id = :'enc' and position = 1 \gset
select id as w3 from public.dashboard_widgets where dashboard_id = :'enc' and position = 3 \gset
select pg_temp.dv(:'enc') as enc_v \gset
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert_fails(format($$select public.save_dashboard('0e000000-0000-0000-0000-000000000001', %L, null, %s,
  'Operación centro A', null, 'encargado', array['aaaaaaaa-0000-0000-0000-000000000000'::uuid], 'semana', false,
  '[{"metric_id":"pnl.revenue","widget_type":"kpi"}]', null)$$, :'enc', :'enc_v'), '22023',
  'editar exige motivo');
select pg_temp.assert_fails(format($$select public.save_dashboard('0e000000-0000-0000-0000-000000000001', %L, null, %s,
  'Operación centro A', null, 'encargado', array['aaaaaaaa-0000-0000-0000-000000000000'::uuid], 'semana', false,
  '[{"metric_id":"pnl.revenue","widget_type":"kpi"}]', 'Cambio')$$, :'enc', :'enc_v'::integer - 1), '40001',
  'una versión vieja se rechaza (40001)');
select from public.save_dashboard(:'O1', :'enc', null, :'enc_v', 'Operación centro A', null, 'encargado',
  array[:'A'::uuid], 'semana', false,
  jsonb_build_array(
    jsonb_build_object('id', :'w3', 'metric_id', 'payments.collected', 'widget_type', 'bars', 'col_span', 2),
    jsonb_build_object('id', :'w1', 'metric_id', 'pnl.revenue', 'widget_type', 'kpi'),
    jsonb_build_object('metric_id', 'pnl.ebitda_margin', 'widget_type', 'kpi')),
  'Reordenar y cambiar la serie por barras');
reset role;
select pg_temp.assert(
  (select string_agg(coalesce(id::text, '') || ':' || widget_type, ',' order by position)
     from public.dashboard_widgets where dashboard_id = :'enc')
  = :'w3' || ':bars,' || :'w1' || ':kpi,' || (select id from public.dashboard_widgets where dashboard_id = :'enc' and position = 3) || ':kpi'
  and pg_temp.dv(:'enc') = :'enc_v'::integer + 1,
  'la edición conserva los widgets por id, reordena, quita los que faltan y sube la versión');

-- Tablero por defecto: se mueve, no se archiva ni se desmarca.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert_fails(format($$select public.archive_dashboard(%L, %s, 'Ya no se usa')$$, :'corp', pg_temp.dv(:'corp')),
  'MG002', 'el tablero corporativo por defecto no se archiva');
select pg_temp.assert_fails(format($$select public.save_dashboard('0e000000-0000-0000-0000-000000000001', %L, null, %s,
  'Tablero corporativo', null, null, null, 'mes', false, '[{"metric_id":"pnl.revenue","widget_type":"kpi"}]', 'Quitar')$$,
  :'corp', pg_temp.dv(:'corp')), 'MG002', 'no se le quita la marca de defecto sin marcar otro');
select (public.save_dashboard(:'O1', null, gen_random_uuid(), null, 'Nuevo corporativo', null, null, null, 'anio', true,
  '[{"metric_id":"pnl.ebitda","widget_type":"kpi"}]', null)).id as corp2 \gset
select pg_temp.assert(
  (select count(*) from public.dashboard_definitions where organization_id = :'O1' and is_default) = 1
  and (select is_default from public.dashboard_definitions where id = :'corp2'),
  'marcar otro como defecto le quita la marca al anterior');
select from public.archive_dashboard(:'enc', pg_temp.dv(:'enc'), 'Tablero de prueba');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert(pg_temp.n($$select 1 from public.dashboard_definitions where archived_at is not null$$) = 0,
  'un tablero archivado deja de verse');
select pg_temp.assert_fails(format($$select public.save_dashboard_preferences(%L, null, null, null, false)$$, :'enc'),
  '42501', 'no se guarda vista personal de un tablero archivado');

-- Vista personal: sólo del propio usuario, ids ajenos descartados.
select id as cw1 from public.dashboard_widgets where dashboard_id = :'corp' and position = 1 \gset
select id as cw2 from public.dashboard_widgets where dashboard_id = :'corp' and position = 2 \gset
select from public.save_dashboard_preferences(:'corp', array[:'cw2'::uuid, :'cw1'::uuid, :'w1'::uuid],
  array[:'cw1'::uuid, :'w3'::uuid], '{"canal":"b2c","periodo":"semana"}', true);
select pg_temp.assert(
  (select widget_order = array[:'cw2'::uuid, :'cw1'::uuid] and hidden_widget_ids = array[:'cw1'::uuid]
          and filters = '{"canal": "b2c", "periodo": "semana"}' and is_favorite
     from public.user_dashboard_preferences where dashboard_id = :'corp'),
  'la vista personal guarda orden, ocultos, filtros y favorito (sin ids de otros tableros)');
select pg_temp.assert_fails(format($$select public.save_dashboard_preferences(%L, null, null, '{"motor":"x"}', false)$$, :'corp'),
  '22023', 'filtros inválidos se rechazan');
select pg_temp.assert_fails($$insert into public.user_dashboard_preferences (user_id, dashboard_id)
  values ('00000000-0000-0000-0000-0000000000e1', gen_random_uuid())$$, '42501',
  'no hay escritura directa en las preferencias');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(pg_temp.n($$select 1 from public.user_dashboard_preferences$$) = 0,
  'la vista personal de otro usuario no se ve');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select public.reset_dashboard_preferences(:'corp');
select pg_temp.assert(pg_temp.n($$select 1 from public.user_dashboard_preferences$$) = 0,
  'restablecer borra la vista personal');
reset role;

-- Hechos: una llamada, mismos totales que el P&L y permisos por centro.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'LAV', 'Lavado', null, 'recurrente', 40, 250, 80)).id as lav \gset
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000001', 'Ana Ruiz', '5511112222', null, 'person', null,
  '{}', 'web', '[{"make":"Kia","model":"Rio","year":2022,"plate":"ANA0001"}]'::jsonb)).id as ana \gset
select id as ana_car from public.vehicles where plate = 'ANA0001' \gset
select (public.create_service_order(:'A', gen_random_uuid(), :'ana', :'ana_car',
  jsonb_build_array(jsonb_build_object('service_id', :'lav', 'quantity', 2)))).id as o1 \gset
reset role;
select pg_temp.deliver(:'o1');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select public.dashboard_facts(array['pnl', 'payments', 'pipeline', 'memberships'], array[:'A'::uuid, :'B'::uuid],
  :'today'::date - 6, :'today'::date, 'dia') as facts \gset
select pg_temp.assert(
  (select sum((f ->> 'amount')::numeric) from jsonb_array_elements(:'facts'::jsonb -> 'pnl') f where f ->> 'section' = 'ingreso')
  = (select sum(amount) from public.pnl_lines(array[:'A'::uuid, :'B'::uuid], :'today'::date - 6, :'today'::date)
      where section = 'ingreso')
  and (select sum((f ->> 'amount')::numeric) from jsonb_array_elements(:'facts'::jsonb -> 'pnl') f where f ->> 'section' = 'ingreso') = 500,
  'los hechos del tablero suman igual que el P&L');
select pg_temp.assert(
  (select bool_and(f ->> 'bucket' = :'today') from jsonb_array_elements(:'facts'::jsonb -> 'pnl') f)
  and :'facts'::jsonb ? 'payments' and :'facts'::jsonb ? 'pipeline' and :'facts'::jsonb ? 'pipeline_stages'
  and :'facts'::jsonb ? 'memberships',
  'una sola llamada trae todas las fuentes pedidas, agrupadas por día');
select pg_temp.assert(
  (public.dashboard_facts(array['pnl'], array[:'A'::uuid], :'today'::date - 40, :'today'::date, 'semana') -> 'pnl' -> 0 ->> 'bucket')::date
    >= :'today'::date - 40
  and not (public.dashboard_facts(array['pnl'], array[:'A'::uuid], :'today'::date, :'today'::date, 'total') ? 'payments'),
  'los periodos semanales se recortan al rango y sólo vienen las fuentes pedidas');
select pg_temp.assert_fails($$select public.dashboard_facts(array['pnl'], array['aaaaaaaa-0000-0000-0000-000000000000'::uuid],
  current_date - 200, current_date, 'dia')$$, '22023', 'la serie diaria está acotada');
select pg_temp.assert_fails($$select public.dashboard_facts(array['service_orders'], array['aaaaaaaa-0000-0000-0000-000000000000'::uuid],
  current_date, current_date, 'total')$$, '22023', 'la fuente debe ser una de las registradas');
select pg_temp.assert_fails($$select public.dashboard_facts(array['pnl'], array['aaaaaaaa-0000-0000-0000-000000000000'::uuid],
  current_date, current_date - 1, 'total')$$, '22023', 'el periodo debe ser válido');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert(
  jsonb_array_length(public.dashboard_facts(array['pnl'], array[:'A'::uuid], :'today'::date, :'today'::date, 'total') -> 'pnl') = 0,
  'el comercial B2B no recibe hechos del P&L (sin pnl.read)');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select pg_temp.assert(
  jsonb_array_length(public.dashboard_facts(array['pnl'], array[:'A'::uuid], :'today'::date, :'today'::date, 'total') -> 'pnl') = 0,
  'un encargado no recibe hechos de un centro ajeno');
reset role;

rollback;
