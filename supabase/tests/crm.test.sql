-- Pruebas de C2: consentimiento por canal (sincronizado con clients), tareas y
-- seguimientos, OS terminada → recomendación y tarea, métricas derivadas que
-- coinciden con el histórico, segmentos, filtros por centro y permisos.
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

-- Lleva una OS hasta "terminada" (y opcionalmente cobrada y entregada).
create function pg_temp.finish(p_id uuid, p_deliver boolean) returns void language plpgsql as $$
begin
  perform public.set_service_order_status(p_id, pg_temp.v(p_id), 'autorizada');
  perform public.set_service_order_status(p_id, pg_temp.v(p_id), 'en_proceso');
  perform public.set_service_order_status(p_id, pg_temp.v(p_id), 'terminada');
  if p_deliver then
    perform public.record_service_order_payment(p_id, pg_temp.v(p_id),
      (select total from public.service_orders where id = p_id), 'efectivo', null);
    perform public.set_service_order_status(p_id, pg_temp.v(p_id), 'entregada');
  end if;
end $$;

grant execute on all functions in schema pg_temp to authenticated, anon;

-- Reglas puras (espejo de customerSegment / nextVisitState).
select pg_temp.assert(
  private.customer_segment('company', 0, null, 0, null, '2026-10-01') = 'b2b_contacto'
  and private.customer_segment('person', 1, null, 1, '2026-09-01', '2026-10-01') = 'b2b_contacto'
  and private.customer_segment('person', 0, 'activa', 0, null, '2026-10-01') = 'miembro'
  and private.customer_segment('person', 0, 'vencida', 5, '2026-03-01', '2026-10-01') = 'inactivo'
  and private.customer_segment('person', 0, null, 2, '2026-09-01', '2026-10-01') = 'recurrente'
  and private.customer_segment('person', 0, null, 1, '2026-09-01', '2026-10-01') = 'nuevo'
  and private.customer_segment('person', 0, null, 0, null, '2026-10-01') = 'nuevo',
  'segmentos: B2B > miembro > inactivo (>180 días) > recurrente (≥2 visitas) > nuevo');
select pg_temp.assert(
  private.next_visit_state('2026-09-30', '2026-10-01') = 'vencida'
  and private.next_visit_state('2026-10-15', '2026-10-01') = 'proxima'
  and private.next_visit_state('2026-10-16', '2026-10-01') = 'programada'
  and private.next_visit_state(null, '2026-10-01') is null,
  'próxima visita: vencida, próxima (≤ 14 días) o programada');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@o1'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000f2', 'operador@b'),
  ('00000000-0000-0000-0000-0000000000b1', 'comercial@a');
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
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'comercial_b2b');

select private.center_today('aaaaaaaa-0000-0000-0000-000000000000') as today \gset
\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set B 'bbbbbbbb-0000-0000-0000-000000000000'

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'LAV', 'Lavado', null, 'recurrente', 40, 250, 80)).id as lavado \gset
select (public.create_service('0e000000-0000-0000-0000-000000000001', 'POL', 'Pulido', null, 'valor_medio', 120, 2800, 900)).id as pulido \gset
reset role;

-- ---------------------------------------------------------------------------
-- Consentimiento
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000001', 'José Pérez', '5512345678', 'jose@example.com',
  'person', null, '{whatsapp,email}', 'web', '[{"make":"Mazda","model":"3","year":2021,"plate":"ABC1234"}]'::jsonb)).id as jose \gset
select id as jose_car from public.vehicles where plate = 'ABC1234' \gset
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000002', 'Ana Ruiz', '5598765432', null,
  'person', null, '{}', 'web', '[{"make":"Kia","model":"Rio","year":2022,"plate":"XYZ9876"}]'::jsonb)).id as ana \gset
select id as ana_car from public.vehicles where plate = 'XYZ9876' \gset
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000003', 'Flotillas SA', '5511112222', null,
  'company', null, '{}', 'web', '[{"make":"Nissan","model":"NP300","year":2020,"plate":"FLT0001"}]'::jsonb)).id as flota \gset
select pg_temp.assert(
  pg_temp.n($$select 1 from public.contact_preferences where client_id = '$$ || :'jose' || $$' and opted_in$$) = 2,
  'el alta de cliente con canales crea su consentimiento por canal (whatsapp y email)');
select from public.update_client(:'jose', 'José Pérez', '5512345678', 'jose@example.com', 'person', null, :'A',
  '{whatsapp}', 'web', 'Ya no quiere emails');
select pg_temp.assert(
  (select not opted_in from public.contact_preferences where client_id = :'jose' and channel = 'email')
  and (select opted_in from public.contact_preferences where client_id = :'jose' and channel = 'whatsapp'),
  'editar el cliente sincroniza el opt-out por canal');
select from public.set_contact_preference(:'jose', 'llamada', true, 'mobile', 'Acepta llamadas');
select from public.set_contact_preference(:'jose', 'email', true, 'web', 'Vuelve a aceptar emails');
select pg_temp.assert(
  (select marketing_channels = '{email,whatsapp}' and marketing_opt_in from public.clients where id = :'jose')
  and pg_temp.n($$select 1 from public.contact_preferences where client_id = '$$ || :'jose' || $$' and opted_in$$) = 3,
  'set_contact_preference: llamada propia; email también en clients.marketing_* (una sola verdad)');
select pg_temp.assert_fails($$insert into public.contact_preferences (organization_id, client_id, channel, opted_in, source)
  values ('0e000000-0000-0000-0000-000000000001', '$$ || :'ana' || $$', 'whatsapp', true, 'web')$$,
  '42501', 'nadie escribe el consentimiento directamente');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert_fails($$select public.set_contact_preference('$$ || :'ana' || $$', 'whatsapp', true, 'web', 'Intento')$$,
  '42501', 'comercial B2B (sin edición de clientes) no cambia consentimientos');
reset role;

-- ---------------------------------------------------------------------------
-- Tareas manuales
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails($$select public.create_crm_task('$$ || :'A' || $$', gen_random_uuid(), '$$ || :'ana' || $$',
  'whatsapp', null, current_date + 1)$$, 'MG002', 'sin consentimiento no hay tarea por WhatsApp');
select pg_temp.assert(
  (select channel = 'presencial' from public.create_crm_task(:'A', gen_random_uuid(), :'ana', 'ofrecer_mantenimiento',
     'presencial', :'today'::date + 5, 'Ofrecer pulido en su próxima visita')),
  'sin consentimiento sí se agenda una acción presencial');
select (public.create_crm_task(:'A', '20000000-0000-4000-8000-000000000001', :'jose', 'whatsapp', null,
  :'today'::date + 1, 'Recordar lavado')).id as t_wa \gset
select pg_temp.assert(
  (public.create_crm_task(:'A', '20000000-0000-4000-8000-000000000001', :'jose', 'whatsapp', null,
     :'today'::date + 1)).id = :'t_wa'
  and (select channel = 'whatsapp' and status = 'pendiente' and source = 'manual' from public.crm_tasks where id = :'t_wa'),
  'tarea por WhatsApp con consentimiento; idempotente por request_id');
select pg_temp.assert_fails($$select public.create_crm_task('$$ || :'A' || $$', gen_random_uuid(), '$$ || :'jose' || $$',
  'llamar', null, current_date - 3)$$, '22023', 'no se agenda en el pasado');
select pg_temp.assert_fails($$select public.create_crm_task('$$ || :'A' || $$', gen_random_uuid(), '$$ || :'jose' || $$',
  'renovar', 'sms', current_date + 1)$$, '22023', 'canal válido: llamada, whatsapp, email o presencial');
select (public.create_crm_task(:'A', gen_random_uuid(), :'jose', 'email', null, :'today'::date + 2)).id as t_mail \gset
select from public.set_contact_preference(:'jose', 'email', false, 'web', 'Pidió no recibir emails');
select pg_temp.assert(
  (select status = 'cancelada' and cancel_reason = 'El cliente retiró el consentimiento' from public.crm_tasks where id = :'t_mail')
  and (select status = 'pendiente' from public.crm_tasks where id = :'t_wa'),
  'retirar el consentimiento cancela sólo las tareas pendientes de ese canal');
select pg_temp.assert_fails($$select public.complete_crm_task('$$ || :'t_wa' || $$', 'gritó')$$,
  '23514', 'el resultado del seguimiento es de una lista cerrada');
select pg_temp.assert(
  (select status = 'hecha' and outcome = 'agendo_cita' and completed_by = '00000000-0000-0000-0000-0000000000f1'
     from public.complete_crm_task(:'t_wa', 'agendo_cita', 'Viene el sábado')),
  'completar con resultado, nota, quién y cuándo');
select pg_temp.assert_fails($$select public.complete_crm_task('$$ || :'t_wa' || $$', 'contactado')$$,
  '22023', 'un seguimiento cerrado no se vuelve a cerrar');
select pg_temp.assert_fails($$delete from public.crm_tasks where id = '$$ || :'t_wa' || $$'$$,
  '42501', 'los seguimientos no se borran');
select set_config('app.change_reason', '', true);
select pg_temp.assert_fails($$update public.crm_tasks set due_on = due_on + 1 where id = '$$ || :'t_wa' || $$'$$,
  '23514', 'sin RPC (sin motivo) no se edita un seguimiento');
reset role;

-- ---------------------------------------------------------------------------
-- OS terminada → próxima recomendación y tarea
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_service_order(:'A', '30000000-0000-4000-8000-000000000001', :'jose', :'jose_car',
  jsonb_build_array(jsonb_build_object('service_id', :'lavado')), 'b2c', null)).id as os1 \gset
select pg_temp.finish(:'os1', true);
select pg_temp.assert(
  (select next_visit_on = :'today'::date + 30 and next_visit_service_id = :'lavado' from public.service_orders where id = :'os1'),
  'OS terminada sin recomendación y con servicio recurrente: regresar en 30 días al mismo servicio');
select pg_temp.assert(
  (select kind = 'ofrecer_mantenimiento' and source = 'os_terminada' and channel = 'whatsapp'
          and due_on = :'today'::date + 27 and recommended_service_id = :'lavado' and service_order_id = :'os1'
     from public.crm_tasks where dedupe_key = 'os:' || :'os1'),
  'y genera la tarea "ofrecer mantenimiento" 3 días antes por el canal con consentimiento');
select (public.create_service_order(:'A', '30000000-0000-4000-8000-000000000002', :'jose', :'jose_car',
  jsonb_build_array(jsonb_build_object('service_id', :'pulido')), 'b2c', null)).id as os2 \gset
select from public.update_service_order_details(:'os2', pg_temp.v(:'os2'), 'b2c', null, null, null, null, null,
  'Aplicar cerámico', (:'today'::date + 90), :'pulido', 'Recomendado por el técnico', null, null, null);
select pg_temp.finish(:'os2', false);
select pg_temp.assert(
  (select due_on = :'today'::date + 87 and notes = 'Recomendado por el técnico' from public.crm_tasks where dedupe_key = 'os:' || :'os2'),
  'con recomendación del técnico la tarea usa su fecha y nota');
select pg_temp.assert(
  (select status = 'cancelada' and cancel_reason = 'Reemplazada por una recomendación más reciente'
     from public.crm_tasks where dedupe_key = 'os:' || :'os1'),
  'la recomendación más reciente reemplaza la tarea de mantenimiento pendiente anterior');
select (public.create_service_order(:'A', '30000000-0000-4000-8000-000000000003', :'jose', :'jose_car',
  jsonb_build_array(jsonb_build_object('service_id', :'lavado')), 'b2c', null)).id as os3 \gset
select from public.set_service_order_status(:'os3', pg_temp.v(:'os3'), 'cancelada', 'Cliente no llegó');
select (public.create_service_order(:'A', '30000000-0000-4000-8000-000000000004', :'ana', :'ana_car',
  jsonb_build_array(jsonb_build_object('service_id', :'pulido')), 'b2c', null)).id as os4 \gset
select pg_temp.finish(:'os4', true);
select pg_temp.assert(
  (select next_visit_on is null from public.service_orders where id = :'os4')
  and pg_temp.n($$select 1 from public.crm_tasks where dedupe_key = 'os:$$ || :'os4' || $$'$$) = 0,
  'sin servicio recurrente ni recomendación no se inventa una próxima visita');
reset role;

-- ---------------------------------------------------------------------------
-- Métricas derivadas = histórico transaccional
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  (select c.visits = (select count(*) from public.service_orders o where o.client_id = :'jose' and o.status <> 'cancelada')
      and c.visits = 2
      and c.services_value = (select sum(total) from public.service_orders o where o.client_id = :'jose' and o.status = 'entregada')
      and c.services_value = 250
      and c.last_visit_at = (select max(created_at) from public.service_orders o where o.client_id = :'jose' and o.status <> 'cancelada')
      and c.next_visit_on = :'today'::date + 90 and c.next_visit_folio = (select folio from public.service_orders where id = :'os2')
      and c.segment = 'recurrente'
      and c.opted_in_channels = '{llamada,whatsapp}'
     from public.crm_customers(array[:'A'::uuid], null, null, null, 100, :'jose') c),
  'ficha: visitas (sin canceladas), valor entregado, última visita y próxima recomendación = OS');
select pg_temp.assert(
  (select segment = 'nuevo' and visits = 1 and services_value = 2800 from public.crm_customers(array[:'A'::uuid]) where client_id = :'ana')
  and (select segment = 'b2b_contacto' from public.crm_customers(array[:'A'::uuid]) where client_id = :'flota'),
  'segmentos nuevo y B2B');
reset role;

-- Membresía: segmento miembro y valor acumulado (servicios + membresía, sin duplicar).
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.upsert_membership_plan('0e000000-0000-0000-0000-000000000001', null, 'CARE', 'care', 'Care', null, 449,
  1::smallint, 'centro_origen', null, 7::smallint, null, null, true, 'Alta del plan')).id as care \gset
select from public.set_membership_benefit(:'care', :'lavado', 2::smallint, null, 'Beneficio');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_membership(:'A', gen_random_uuid(), :'care', :'ana', :'ana_car')).id as mem \gset
select pg_temp.assert(
  (select segment = 'miembro' and membership_number = 'MEM-000001' and membership_status = 'activa'
          and membership_value = 449 and lifetime_value = 2800 + 449
     from public.crm_customers(array[:'A'::uuid]) where client_id = :'ana'),
  'miembro: membresía activa y valor acumulado = OS entregadas + cobros de membresía');
reset role;

-- Inactivo: la última visita fue hace más de 180 días.
set session_replication_role = replica;
update public.service_orders set created_at = now() - interval '200 days' where client_id = :'flota';
set session_replication_role = origin;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000004', 'Luis Mora', '5533334444', null,
  'person', null, '{}', 'web', '[{"make":"VW","model":"Jetta","year":2018,"plate":"JTT1818"}]'::jsonb)).id as luis \gset
select id as luis_car from public.vehicles where plate = 'JTT1818' \gset
select (public.create_service_order(:'A', '30000000-0000-4000-8000-000000000005', :'luis', :'luis_car',
  jsonb_build_array(jsonb_build_object('service_id', :'pulido')), 'b2c', null)).id as os5 \gset
reset role;
set session_replication_role = replica;
update public.service_orders set created_at = now() - interval '200 days', next_visit_on = :'today'::date - 5 where id = :'os5';
set session_replication_role = origin;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  (select segment = 'inactivo' and next_visit_state = 'vencida' from public.crm_customers(array[:'A'::uuid]) where client_id = :'luis'),
  'inactivo (más de 180 días sin visita) con próxima visita vencida');

-- Filtros por segmento y próxima visita.
select pg_temp.assert(
  pg_temp.n($$select 1 from public.crm_customers(array['$$ || :'A' || $$'::uuid], 'inactivo')$$) = 1
  and pg_temp.n($$select 1 from public.crm_customers(array['$$ || :'A' || $$'::uuid], null, 'vencida')$$) = 1
  and pg_temp.n($$select 1 from public.crm_customers(array['$$ || :'A' || $$'::uuid], null, null, 'José')$$) = 1
  and pg_temp.n($$select 1 from public.crm_customers(array['$$ || :'A' || $$'::uuid], null, null, '5598 7654')$$) = 1,
  'filtros: segmento, próxima visita vencida y búsqueda por nombre o teléfono');
reset role;

-- ---------------------------------------------------------------------------
-- Centros y permisos
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.crm_customers(array['$$ || :'A' || $$'::uuid])$$) = 0
  and pg_temp.n($$select 1 from public.crm_customers(array['$$ || :'B' || $$'::uuid])$$) = 0
  and pg_temp.n($$select 1 from public.crm_tasks$$) = 0,
  'operador de B: no ve clientes ni tareas de A');
select from public.link_client_to_center(:'jose', :'B', 'Visita en Monterrey');
select pg_temp.assert(
  (select visits = 0 and services_value = 0 and segment = 'nuevo'
     from public.crm_customers(array[:'B'::uuid, :'A'::uuid]) where client_id = :'jose'),
  'con el cliente ligado a B lo ve, con métricas sólo de B (A no está autorizado)');
select pg_temp.assert_fails($$select public.create_crm_task('$$ || :'A' || $$', gen_random_uuid(), '$$ || :'jose' || $$',
  'llamar', null, current_date + 1)$$, '42501', 'no crea seguimientos en otro centro');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(
  (select visits = 2 from public.crm_customers(array[:'A'::uuid, :'B'::uuid]) where client_id = :'jose')
  and pg_temp.n($$select 1 from public.crm_customers(array['$$ || :'A' || $$'::uuid, '$$ || :'B' || $$'::uuid])$$) = 4,
  'corporativo: vista consolidada de ambos centros');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.crm_customers(array['$$ || :'A' || $$'::uuid])$$) = 0
  and pg_temp.n($$select 1 from public.crm_tasks$$) = 0,
  'el contador no ve el CRM (datos personales)');
select pg_temp.assert_fails($$select public.generate_crm_tasks('$$ || :'A' || $$')$$, '42501', 'el contador no genera seguimientos');
reset role;

-- ---------------------------------------------------------------------------
-- Generación de pendientes
-- ---------------------------------------------------------------------------
set session_replication_role = replica;
update public.memberships set started_on = :'today'::date - 27, period_anchor = :'today'::date - 27,
  ends_on = :'today'::date + 2 where id = :'mem';
set session_replication_role = origin;
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select public.generate_crm_tasks(:'A') as generate_first \gset
select pg_temp.assert(
  :generate_first = 2
  and (select kind = 'renovar' and source = 'membresia' and membership_id = :'mem' and channel = 'presencial'
         from public.crm_tasks where dedupe_key like 'mem:%')
  and (select kind = 'ofrecer_mantenimiento' and source = 'proxima_visita' and due_on = :'today'::date
         from public.crm_tasks where dedupe_key = 'os:' || :'os5'),
  'generar: renovar la membresía próxima a vencer y ofrecer la visita vencida (comercial B2B sin acceso a OS)');
select pg_temp.assert(public.generate_crm_tasks(:'A') = 0, 'generar otra vez no duplica (idempotente)');
select id as t_ren from public.crm_tasks where dedupe_key like 'mem:%' \gset
select pg_temp.assert_fails($$select public.cancel_crm_task('$$ || :'t_ren' || $$', '')$$, '22023', 'cancelar exige motivo');
select pg_temp.assert_fails($$select public.reschedule_crm_task('$$ || :'t_ren' || $$', current_date - 1, 'Atrás')$$,
  '22023', 'no se reprograma al pasado');
select pg_temp.assert(
  (select due_on = :'today'::date + 3 from public.reschedule_crm_task(:'t_ren', :'today'::date + 3, 'Cliente pidió el jueves')),
  'reprogramar con motivo');
reset role;

select pg_temp.assert(
  exists (select 1 from public.audit_log where table_name = 'public.crm_tasks' and reason = 'Cliente pidió el jueves')
  and exists (select 1 from public.audit_log where table_name = 'public.contact_preferences' and reason = 'Pidió no recibir emails'),
  'auditoría de seguimientos y consentimientos con motivo');

rollback;
