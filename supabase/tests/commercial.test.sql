-- Pruebas de CR2 (fase 1): prospecto → cotización → reserva → OS → venta, con
-- embudo configurable, descuentos autorizados, precio cotizado respetado,
-- duplicados con fusión supervisada, segmentación y métricas sin datos personales.
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

-- Entrega directa (sin recorrer ejecución y cobro), con el trigger de venta del prospecto activo.
create function pg_temp.deliver(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('session_replication_role', 'replica', true);
  update public.service_orders set status = 'entregada', delivered_at = now() where id = p_id;
  perform set_config('session_replication_role', 'origin', true);
end $$;

grant execute on all functions in schema pg_temp to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'corp@o1'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a'),
  ('00000000-0000-0000-0000-0000000000b1', 'comercial@a'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@a'),
  ('00000000-0000-0000-0000-0000000000f2', 'operador@b'),
  ('00000000-0000-0000-0000-0000000000a2', 'corp@o2');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Org uno'),
  ('0e000000-0000-0000-0000-000000000002', 'org-dos', 'Org dos');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio'),
  ('0e000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a2', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'comercial_b2b'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'contador'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f2', 'operador_recepcion');
insert into public.profiles (id, full_name) values
  ('00000000-0000-0000-0000-0000000000e1', 'Elena Encargada'),
  ('00000000-0000-0000-0000-0000000000f1', 'Fer Recepción'),
  ('00000000-0000-0000-0000-0000000000b1', 'Beto Comercial')
on conflict (id) do update set full_name = excluded.full_name;
insert into public.technicians (id, organization_id, detail_center_id, full_name, active) values
  ('7e000000-0000-0000-0000-000000000001', '0e000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'Toño Lavador', true);

\set O1 '0e000000-0000-0000-0000-000000000001'
\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set B 'bbbbbbbb-0000-0000-0000-000000000000'
select private.center_today(:'A') as today \gset

-- ---------------------------------------------------------------------------
-- Embudo inicial y configuración.
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select string_agg(code || ':' || kind || ':' || coalesce(milestone, '-'), ',' order by position)
     from public.lead_stages where organization_id = :'O1')
  = 'nuevo:abierta:-,contactado:abierta:contactado,cotizado:abierta:cotizado,pendiente_reserva:abierta:-,reservado:abierta:reservado,ganado:ganada:-,perdido:perdida:-',
  'cada organización nace con el embudo: nuevo, contactado, cotizado, pendiente de reserva, reservado, ganado, perdido');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service(:'O1', 'LAV-MAN', 'Lavado manual detallado', 'Lavado a mano', 'valor_medio', 90,
  400, 40, 'Alta de servicio', 30)).id as lmd \gset
select (public.create_service(:'O1', 'CERA', 'Encerado', null, 'premium', 60, 600, 120)).id as cera \gset
select (public.upsert_lead_stage(:'O1', null, 'visita_agendada', 'Visita agendada', 6::smallint, null, true,
  'Etapa propia')).id as extra \gset
select pg_temp.assert((select name from public.lead_stages where id = :'extra') = 'Visita agendada',
  'el admin corporativo agrega etapas al embudo');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails(format($$select public.upsert_lead_stage(%L, null, 'otra', 'Otra', 7::smallint, null, true, 'x')$$, :'O1'),
  '42501', 'el encargado no configura el embudo');
reset role;

-- ---------------------------------------------------------------------------
-- Prospecto desde Instagram, con coincidencias por teléfono (nunca por nombre).
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000001', 'Ana Ruiz', '5511112222', 'ana@x.mx', 'person', null,
  '{}', 'web', '[{"make":"Kia","model":"Rio","year":2022,"plate":"ANA0001"}]'::jsonb)).id as ana \gset
select id as car from public.vehicles where plate = 'ANA0001' \gset
select pg_temp.assert(
  (select kind = 'cliente' and matched_on = array['telefono'] from public.lead_matches(:'A', '+52 1 55 1111 2222')),
  'lead_matches encuentra al cliente por los últimos 10 dígitos del teléfono (+52 / +521)');
select pg_temp.assert(not exists (select 1 from public.lead_matches(:'A', null, null)),
  'sin teléfono ni email no hay coincidencias (el nombre no cuenta)');
select pg_temp.assert_fails(format($$select public.create_lead(%L, gen_random_uuid(), 'Sin contacto', 'instagram')$$, :'A'),
  '23514', 'un prospecto necesita teléfono, email o usuario de redes');
select pg_temp.assert_fails(format($$select public.create_lead(%L, gen_random_uuid(), 'Rec', 'recomendacion', '5500000000')$$, :'A'),
  '22023', 'una recomendación indica quién recomendó');
select (public.create_lead(:'A', '20000000-0000-4000-8000-000000000001', 'Ana R.', 'instagram', null, null, '@anaruiz',
  'Anuncio lavado manual', null, null, array[:'lmd']::uuid[], 'Kia Rio 2022', null, array['whatsapp'], 500,
  '00000000-0000-0000-0000-0000000000f1', 'Enviar precio', :'today'::date)).id as lead \gset
select pg_temp.assert(
  (select s.code = 'nuevo' and l.status = 'abierta' and l.consent_at is not null and l.client_id is null
     from public.leads l join public.lead_stages s on s.id = l.stage_id where l.id = :'lead'),
  'el prospecto entra en la primera etapa, con consentimiento fechado y sin ligarse solo a un cliente');
select pg_temp.assert(
  (select (public.create_lead(:'A', '20000000-0000-4000-8000-000000000001', 'Otro', 'facebook', '5599999999')).id = :'lead'),
  'el alta es idempotente por request_id');
select pg_temp.assert(
  (select interest_service_names = array['Lavado manual detallado'] and source_channel = 'instagram'
          and owner_name = 'Fer Recepción'
     from public.list_leads(array[:'A']::uuid[], null, null, null, null, null, :'lead')),
  'la ficha trae canal de origen, servicios de interés y responsable');
select pg_temp.assert_fails(format($$select public.create_lead(%L, gen_random_uuid(), 'X', 'instagram', null, null, '@x',
  null, null, null, '{}', null, null, '{}', null, '00000000-0000-0000-0000-0000000000c1')$$, :'A'),
  'MG002', 'el responsable debe trabajar prospectos en el centro (no el contador)');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert(not exists (select 1 from public.list_leads(array[:'A', :'B']::uuid[])),
  'otro centro no ve los prospectos');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(not exists (select 1 from public.leads), 'el contador no ve datos personales de prospectos');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select pg_temp.assert(not exists (select 1 from public.leads) and not exists (select 1 from public.lead_stages where organization_id = :'O1'),
  'otra organización no ve prospectos ni etapas');
reset role;

-- Primer contacto: tiempo de respuesta y avance al hito "contactado".
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select from public.log_lead_contact(:'lead', (select version from public.leads where id = :'lead'), 'redes', 'Respondí por DM');
select pg_temp.assert(
  (select first_contact_at is not null and s.code = 'contactado'
     from public.leads l join public.lead_stages s on s.id = l.stage_id where l.id = :'lead'),
  'el primer contacto registra la hora y avanza a "contactado"');
select pg_temp.assert_fails(format($$select public.move_lead_stage(%L, 1, (select id from public.lead_stages where code = 'nuevo' and organization_id = %L))$$, :'lead', :'O1'),
  '40001', 'una versión vieja se rechaza (otro dispositivo)');
select (public.create_lead_task(:'lead', gen_random_uuid(), 'whatsapp', :'today'::date, 'Mandar fotos')).id as task \gset
select pg_temp.assert(
  (select source = 'prospecto' and client_id is null and channel = 'whatsapp' from public.crm_tasks where id = :'task'),
  'la tarea del prospecto vive en la cola del CRM, ligada al prospecto');

-- ---------------------------------------------------------------------------
-- Cotización con Lavado manual detallado: costo del operador y margen.
-- ---------------------------------------------------------------------------
select (public.create_quote(:'A', '30000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object('service_id', :'lmd'), jsonb_build_object('service_id', :'cera')),
  :'lead')).id as q \gset
select pg_temp.assert(
  (select folio = 'A-01-COT-00001' and status = 'borrador' and valid_until = :'today'::date + 15 and client_id is null
          and contact_name = 'Ana R.'
     from public.quotes where id = :'q'),
  'folio por centro, vigencia de 15 días y contacto del prospecto');
select pg_temp.assert(
  (select (subtotal, total, standard_cost_total, operator_pay_total, contribution_margin)
          = (1000::numeric, 1000::numeric, 160::numeric, 120::numeric, 720::numeric) from public.quotes where id = :'q'),
  'costo del operador = 400 × 30 / 100 = 120; margen de contribución = 1000 − (40 + 120) − 120 = 720');
select pg_temp.assert(
  (select s.code from public.leads l join public.lead_stages s on s.id = l.stage_id where l.id = :'lead') = 'cotizado',
  'cotizar avanza al prospecto a "cotizado"');
select id as qi_lmd from public.quote_items where quote_id = :'q' and service_id = :'lmd' \gset
select from public.add_quote_discount(:'q', (select version from public.quotes where id = :'q'), :'qi_lmd', 'percent', 10,
  'Promoción de bienvenida');
select pg_temp.assert(
  (select (total, operator_pay_total, contribution_margin) = (960::numeric, 108::numeric, 692::numeric)
     from public.quotes where id = :'q'),
  'descuento de línea: la base del operador baja (360 × 30 % = 108) y el margen refleja el descuento');
select pg_temp.assert_fails(format($$select public.add_quote_discount(%L, (select version from public.quotes where id = %L),
  null, 'amount', 200, 'Descuento grande')$$, :'q', :'q'),
  '42501', 'la recepción no autoriza un descuento acumulado de más de 10 %');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select from public.add_quote_discount(:'q', (select version from public.quotes where id = :'q'), null, 'amount', 100,
  'Cliente recomendado');
select pg_temp.assert(
  (select (total, discount_total) = (860::numeric, 140::numeric) from public.quotes where id = :'q')
  and (select authorization_level = 'encargado' from public.quote_discounts where quote_id = :'q' and item_id is null),
  'el encargado autoriza el descuento general (14 %) y queda su nivel');
reset role;

-- ---------------------------------------------------------------------------
-- Reserva: exige cliente y vehículo; convierte sin recapturar.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails(format($$select public.book_quote(%L, (select version from public.quotes where id = %L),
  gen_random_uuid(), now() + interval '1 day')$$, :'q', :'q'),
  'MG002', 'sin cliente no se reserva: primero se liga o registra');
select from public.link_lead_client(:'lead', (select version from public.leads where id = :'lead'), :'ana',
  'Es la misma persona (teléfono confirmado)');
select pg_temp.assert(
  (select client_id = :'ana' from public.quotes where id = :'q')
  and (select opted_in from public.contact_preferences where client_id = :'ana' and channel = 'whatsapp'),
  'ligar al cliente pasa a sus cotizaciones abiertas y el consentimiento que dio el prospecto');
select pg_temp.assert_fails(format($$select public.book_quote(%L, (select version from public.quotes where id = %L),
  gen_random_uuid(), now() + interval '1 day')$$, :'q', :'q'),
  '22023', 'la reserva pide el vehículo');
select (public.book_quote(:'q', (select version from public.quotes where id = :'q'), '40000000-0000-4000-8000-000000000001',
  now() + interval '1 day', :'car')).id as appt \gset
select pg_temp.assert(
  (select quote_id = :'q' and client_id = :'ana' and vehicle_id = :'car' and status = 'programada'
     from public.appointments where id = :'appt')
  and (select string_agg(service_id::text, ',' order by position) from public.appointment_services where appointment_id = :'appt')
      = :'lmd' || ',' || :'cera',
  'la cita lleva cliente, vehículo y servicios de la cotización');
select pg_temp.assert(
  (select status = 'convertida' and appointment_id = :'appt' from public.quotes where id = :'q')
  and (select s.code from public.leads l join public.lead_stages s on s.id = l.stage_id where l.id = :'lead') = 'reservado',
  'la cotización queda convertida y el prospecto "reservado"');
select pg_temp.assert(
  (select (public.book_quote(:'q', null, gen_random_uuid(), now())).id = :'appt'),
  'reservar dos veces devuelve la misma cita (sin duplicar)');
select pg_temp.assert_fails(format($$select public.set_quote_item(%L, (select version from public.quotes where id = %L), %L, 2)$$,
  :'q', :'q', :'cera'), 'MG002', 'una cotización convertida ya no se edita');
reset role;

-- El catálogo cambia después de cotizar: la OS respeta el precio cotizado.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select from public.update_service(:'lmd', 'Lavado manual detallado', 'Lavado a mano', 'valor_medio', 90, 450, 45, true,
  'Nuevo precio', 35);
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select from public.set_appointment_status(:'appt', 'recibida');
select (public.create_service_order_from_appointment(:'appt', gen_random_uuid())).id as os \gset
select pg_temp.assert(
  (select (unit_price, price_source, list_unit_price, unit_direct_cost, operator_commission_pct)
          = (400::numeric, 'cotizacion', 450::numeric, 45::numeric, 35::numeric)
     from public.service_order_items where service_order_id = :'os' and service_id = :'lmd'),
  'la OS congela el precio cotizado ($400) y guarda el de lista ($450); costo y % del operador son los vigentes');
select pg_temp.assert(
  (select total from public.service_orders where id = :'os') = (select total from public.quotes where id = :'q'),
  'el total de la OS coincide con el de la cotización (mismos descuentos)');
select pg_temp.assert(
  (select count(*) = 2 and bool_and(authorization_level::text = case when item_id is null then 'encargado' else 'operador' end)
          and bool_or(authorized_by = '00000000-0000-0000-0000-0000000000e1')
     from public.service_order_discounts where service_order_id = :'os'),
  'los descuentos pasan a la OS con el nivel y la persona que los autorizó al cotizar');
reset role;

-- La entrega de esa OS gana el prospecto (una sola vez).
alter table public.service_orders enable always trigger service_orders_win_lead;
select pg_temp.deliver(:'os');
select pg_temp.assert(
  (select l.status = 'ganada' and l.service_order_id = :'os' and l.won_value = o.total and s.kind = 'ganada'
     from public.leads l join public.service_orders o on o.id = l.service_order_id
     join public.lead_stages s on s.id = l.stage_id where l.id = :'lead'),
  'al entregar la OS, el prospecto queda ganado con el valor real de la venta');
select pg_temp.assert(
  (select status from public.crm_tasks where id = :'task') = 'cancelada',
  'sus tareas pendientes se cancelan al comprar');
select pg_temp.assert(
  (select string_agg(kind, ',' order by seq) from public.lead_events where lead_id = :'lead')
  = 'creado,contacto,etapa,cotizacion,etapa,cliente,reserva,etapa,ganado',
  'el historial del prospecto registra cada paso del recorrido');

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_lead(:'A', gen_random_uuid(), 'Ana otra vez', 'whatsapp', '5511112222', null, null, null, null,
  :'ana')).id as lead2 \gset
select pg_temp.assert_fails(format($$select public.win_lead(%L, (select version from public.leads where id = %L), %L)$$,
  :'lead2', :'lead2', :'os'), 'MG002', 'una venta no se atribuye a dos prospectos');
select from public.lose_lead(:'lead2', (select version from public.leads where id = :'lead2'), 'sin_respuesta', 'No contestó');
select pg_temp.assert(
  (select status = 'perdida' and loss_reason = 'sin_respuesta' and closed_at is not null from public.leads where id = :'lead2'),
  'perder exige motivo y cierra el prospecto');
select from public.reopen_lead(:'lead2', (select version from public.leads where id = :'lead2'),
  (select id from public.lead_stages where organization_id = :'O1' and code = 'contactado'), 'Volvió a escribir');
select pg_temp.assert((select status from public.leads where id = :'lead2') = 'abierta', 'un perdido se reabre con motivo');
reset role;

-- Vencida: no se reserva ni se edita.
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_quote(:'A', gen_random_uuid(), jsonb_build_array(jsonb_build_object('service_id', :'cera')),
  null, :'ana', :'car', 1)).id as q2 \gset
reset role;
select from set_config('app.change_reason', 'Prueba de vencimiento', true);
update public.quotes set valid_until = :'today'::date - 1 where id = :'q2';
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert((select expired from public.list_quotes(array[:'A']::uuid[], null, null, null, :'q2')),
  'la cotización con la vigencia pasada se presenta como vencida');
select pg_temp.assert_fails(format($$select public.book_quote(%L, null, gen_random_uuid(), now() + interval '1 day')$$, :'q2'),
  'MG002', 'una cotización vencida no se reserva');
reset role;

-- ---------------------------------------------------------------------------
-- Métricas del recorrido: sin datos personales (el contador sí las lee).
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(
  (select quoted_at is not null and booked_at is not null and won_at is not null and first_contact_minutes >= 0
          and sale_total = 860 and sale_margin = sale_total - sale_cost and source_channel = 'instagram'
     from public.commercial_funnel_facts(array[:'A']::uuid[], :'today'::date, :'today'::date) where lead_id = :'lead'),
  'hechos del embudo: cotizó, reservó y compró; venta y margen de la OS real');
select pg_temp.assert(
  (select count(*) from public.commercial_quote_facts(array[:'A']::uuid[], :'today'::date, :'today'::date)) = 2
  and (select booked and order_status = 'entregada' from public.commercial_quote_facts(array[:'A']::uuid[], :'today'::date, :'today'::date)
        where quote_id = :'q'),
  'hechos de cotizaciones con su conversión a reserva y venta');
select pg_temp.assert_fails(format($$select public.commercial_funnel_facts(array[%L]::uuid[], current_date - 400, current_date)$$, :'A'),
  '22023', 'periodo máximo de 366 días');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
select pg_temp.assert(not exists (select 1 from public.commercial_funnel_facts(array[:'A']::uuid[], :'today'::date, :'today'::date)),
  'otro centro no lee las métricas');
reset role;

-- ---------------------------------------------------------------------------
-- Duplicados y fusión supervisada.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client(:'A', gen_random_uuid(), 'Ana Ruiz Pérez', '+521 55 1111 2222', null, 'person', null,
  array['email'], 'web', '[{"make":"VW","model":"Jetta","year":2019,"plate":"ANA0002"}]'::jsonb, 'Registrada dos veces')).id as ana2 \gset
select (public.create_client(:'A', gen_random_uuid(), 'Ana Ruiz', '5533334444', null, 'person')).id as homonima \gset
select (public.create_service_order(:'A', gen_random_uuid(), :'ana2',
  (select id from public.vehicles where plate = 'ANA0002'), jsonb_build_array(jsonb_build_object('service_id', :'cera')))).id as os2 \gset
reset role;
select pg_temp.deliver(:'os2');
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(not exists (select 1 from public.client_duplicate_candidates(array[:'A']::uuid[])),
  'la recepción no revisa duplicados (sólo encargado o admin)');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert(
  (select count(*) = 1 and bool_and(matched_on @> array['telefono'])
     from public.client_duplicate_candidates(array[:'A']::uuid[])
    where :'ana' in (client_a_id, client_b_id)),
  'se propone el par con el mismo teléfono');
select pg_temp.assert(
  not exists (select 1 from public.client_duplicate_candidates(array[:'A']::uuid[])
               where :'homonima' in (client_a_id, client_b_id)),
  'el mismo nombre con otro teléfono no se propone');
select pg_temp.assert_fails(format($$select public.merge_clients(%L, %L, 'Mismo nombre')$$, :'ana', :'homonima'),
  'MG002', 'no se fusionan clientes sólo por el nombre');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails(format($$select public.merge_clients(%L, %L, 'x')$$, :'ana', :'ana2'),
  '42501', 'la recepción no fusiona');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select from public.merge_clients(:'ana', :'ana2', 'Mismo teléfono y misma persona');
reset role;
select pg_temp.assert(
  (select not active and merged_into_id = :'ana' and merged_by = '00000000-0000-0000-0000-0000000000e1'
     from public.clients where id = :'ana2')
  and (select client_id = :'ana' from public.vehicles where plate = 'ANA0002')
  and (select client_id = :'ana2' from public.service_orders where id = :'os2'),
  'el duplicado queda inactivo; su vehículo pasa; la OS no se reescribe');
select pg_temp.assert(
  (select opted_in from public.contact_preferences where client_id = :'ana' and channel = 'email'),
  'el consentimiento más reciente del duplicado pasa al que se conserva');
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert(
  (select visits = 2 and services_value = 860 + 600
     from public.crm_customers(array[:'A']::uuid[], null, null, null, 50, :'ana')),
  'el CRM suma el historial del duplicado al cliente que se conservó');
select pg_temp.assert(
  exists (select 1 from public.client_history(:'ana') where kind = 'client_merged')
  and exists (select 1 from public.client_history(:'ana') where title like '%ANA0002%'),
  'la ficha muestra la fusión y los vehículos del duplicado');
select pg_temp.assert_fails(format($$select public.merge_clients(%L, %L, 'otra vez')$$, :'ana', :'ana2'),
  'MG002', 'un cliente fusionado no se vuelve a fusionar');
reset role;
select pg_temp.assert(exists (select 1 from public.audit_log where table_name = 'public.clients' and record_id = :'ana2'
                                and reason like 'Fusión de clientes%'),
  'la fusión queda auditada con su motivo');
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');

-- ---------------------------------------------------------------------------
-- Segmentación.
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select visits = 2 and total_spend = 1460 and service_names @> array['Lavado manual detallado', 'Encerado']
          and consent_channels @> array['whatsapp']
     from public.commercial_segment(array[:'A']::uuid[]) where client_id = :'ana'),
  'segmento: visitas, gasto acumulado, servicios contratados y consentimiento');
select pg_temp.assert(
  (select count(*) from public.commercial_segment(array[:'A']::uuid[], array[:'lmd']::uuid[])) = 1
  and (select count(*) from public.commercial_segment(array[:'A']::uuid[], null, null, null, 2000)) = 0
  and (select count(*) from public.commercial_segment(array[:'A']::uuid[], null, null, null, null, null, null, null, 'sms')) = 0,
  'filtros por servicio contratado, gasto mínimo y canal con consentimiento');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(not exists (select 1 from public.commercial_segment(array[:'A']::uuid[])),
  'el contador no segmenta clientes (datos personales)');
reset role;

-- Una etapa con prospectos abiertos no se desactiva.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert_fails(format($$select public.upsert_lead_stage(%L, (select id from public.lead_stages where organization_id = %L and code = 'contactado'),
  'contactado', 'Contactado', 2::smallint, 'contactado', false, 'Quitar')$$, :'O1', :'O1'),
  'MG002', 'no se desactiva una etapa con prospectos abiertos');
reset role;

rollback;
