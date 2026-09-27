-- Pruebas de C5: pipeline comercial. Etapas mínimas y configurables, permisos
-- por rol y centro, historial de etapa inmutable y auditado, notas y tareas
-- (cola del CRM), conversión a cuenta/convenio sin duplicar la empresa y
-- métricas reproducibles sólo desde los eventos.
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

create function pg_temp.v(p_id uuid) returns integer language sql security definer as $$
  select version from public.sales_opportunities where id = p_id
$$;

create function pg_temp.stage(p_code text) returns uuid language sql security definer as $$
  select s.id from public.pipeline_stages s
   where s.organization_id = '0e000000-0000-0000-0000-000000000001' and s.code = p_code
$$;

grant execute on all functions in schema pg_temp to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000b1', 'comercial@a'),
  ('00000000-0000-0000-0000-0000000000b2', 'comercial@b'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@a'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'comercial_b2b'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b2', 'comercial_b2b'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'contador'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion');

select private.center_today('aaaaaaaa-0000-0000-0000-000000000000') as today \gset
\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set B 'bbbbbbbb-0000-0000-0000-000000000000'
\set ORG '0e000000-0000-0000-0000-000000000001'
\set COM '00000000-0000-0000-0000-0000000000b1'

-- ---------------------------------------------------------------------------
-- Etapas mínimas
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select string_agg(code || ':' || kind, ',' order by position) from public.pipeline_stages where organization_id = :'ORG')
    = 'prospecto:abierta,contactado:abierta,propuesta:abierta,negociacion:abierta,ganado:ganada,perdido:perdida',
  'una organización nueva recibe las etapas mínimas (4 abiertas, ganado y perdido)');

-- Clientes: una empresa ya registrada (sin cuenta) y una persona de alto valor.
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000001', 'Rutas del Centro', '5533334444',
  'compras@rutas.mx', 'company', null, '{}', 'web', '[]'::jsonb)).id as rutas \gset
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000002', 'Ana Ruiz', '5577778888', null, 'person',
  null, '{whatsapp}', 'web', '[]'::jsonb)).id as ana \gset
reset role;

-- ---------------------------------------------------------------------------
-- Permisos por rol y centro
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails($$select public.create_opportunity('$$ || :'A' || $$', gen_random_uuid(), 'b2c_premium',
  'Cerámico', 12000, '$$ || :'ana' || $$')$$, '42501', 'el operador no registra oportunidades');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.create_opportunity('$$ || :'A' || $$', gen_random_uuid(), 'b2b',
  'Flotilla', 50000, null, null, '{"company_name":"X SA","contact_name":"Eva","contact_phone":"5512341234"}')$$,
  '42501', 'el encargado no registra oportunidades B2B');
select (public.create_opportunity(:'A', '20000000-0000-4000-8000-000000000001', 'b2c_premium', 'Cerámico Ana', 12000,
  :'ana', null, '{}', '{}', null, null, 'Llamar para agendar', :'today'::date + 2)).id as opp_ana \gset
select pg_temp.assert(
  (select owner_id = '00000000-0000-0000-0000-0000000000e1' and status = 'abierta' and version = 1
     from public.sales_opportunities where id = :'opp_ana')
  and (select stage_id = pg_temp.stage('prospecto') from public.sales_opportunities where id = :'opp_ana'),
  'el encargado registra B2C premium; entra en la primera etapa y queda como responsable');
select pg_temp.assert(
  (public.create_opportunity(:'A', '20000000-0000-4000-8000-000000000001', 'b2c_premium', 'Otro', 1, :'ana')).id
    = :'opp_ana',
  'alta idempotente por solicitud');
select pg_temp.assert_fails($$select public.create_opportunity('$$ || :'A' || $$', gen_random_uuid(), 'b2c_premium',
  'Sin cliente', 5000)$$, '22023', 'B2C premium exige un cliente registrado');
reset role;

select pg_temp.login(:'COM');
select pg_temp.assert_fails($$select public.create_opportunity('$$ || :'A' || $$', gen_random_uuid(), 'b2b',
  'Sin contacto', 50000, null, null, '{"company_name":"X SA"}')$$, '22023',
  'un prospecto necesita empresa, contacto y teléfono o email');
select pg_temp.assert_fails($$select public.create_opportunity('$$ || :'A' || $$', gen_random_uuid(), 'b2b',
  'RFC malo', 50000, null, null, '{"company_name":"X SA","contact_name":"Eva","contact_phone":"5512341234","rfc":"malo"}')$$,
  '22023', 'RFC con formato válido');
select pg_temp.assert_fails($$select public.create_opportunity('$$ || :'A' || $$', gen_random_uuid(), 'b2b',
  'Dueño', 50000, null, null, '{"company_name":"X SA","contact_name":"Eva","contact_phone":"5512341234"}', '{}', null,
  '00000000-0000-0000-0000-0000000000f1')$$, 'MG002', 'el responsable debe tener rol comercial en el centro');
select pg_temp.assert_fails($$select public.create_opportunity('$$ || :'A' || $$', gen_random_uuid(), 'b2b',
  'Iguala', 50000, null, null, '{"company_name":"X SA","contact_name":"Eva","contact_phone":"5512341234"}',
  '{"billing_model":"iguala"}')$$, '22023', 'la propuesta de iguala exige cuota e incluidos');

-- Prospecto B2B nuevo con propuesta de iguala.
select (public.create_opportunity(:'A', '20000000-0000-4000-8000-000000000002', 'b2b', 'Flotilla Logística Sur', 96000,
  null, null,
  '{"company_name":"Logística Sur","legal_name":"Logística Sur SA de CV","rfc":"LSU010203AB1","contact_name":"Carla Mena","contact_title":"Compras","contact_phone":"5522223333","contact_email":"Compras@LogSur.mx"}',
  '{"billing_model":"iguala","months":12,"vehicle_rule":"cualquiera","payment_terms_days":15,"credit_limit":30000,"fee_amount":8000,"included_units":20}',
  pg_temp.stage('contactado'), null, 'Enviar propuesta', :'today'::date, :'today'::date + 30, 'referido')).id as opp_sur \gset
select pg_temp.assert(
  (select contact_phone = '+525522223333' and contact_email = 'compras@logsur.mx' and client_id is null
          and b2b_account_id is null and proposed_fee_amount = 8000 and owner_id = :'COM'
     from public.sales_opportunities where id = :'opp_sur'),
  'prospecto B2B: contacto normalizado, sin cliente todavía y con la propuesta de convenio');

-- Prospecto cuya empresa ya existe (mismo email): se liga al cliente, no se duplica.
select (public.create_opportunity(:'A', '20000000-0000-4000-8000-000000000003', 'b2b', 'Rutas: lavado semanal', 40000,
  null, null, '{"company_name":"Rutas del Centro SA","contact_name":"Hugo","contact_email":"compras@rutas.mx"}',
  '{"billing_model":"por_vehiculo","months":6}')).id as opp_rutas \gset
select pg_temp.assert(
  (select client_id = :'rutas' and b2b_account_id is null from public.sales_opportunities where id = :'opp_rutas'),
  'un prospecto que coincide con una empresa registrada (email) se liga a ella');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000b2');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.list_opportunities(array['$$ || :'A' || $$'::uuid], null)$$) = 0
  and pg_temp.n('select 1 from public.sales_opportunities') = 0,
  'el comercial de otro centro no ve las oportunidades');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  pg_temp.n('select 1 from public.sales_opportunities') = 0
  and pg_temp.n('select 1 from public.opportunity_events') = 0,
  'el operador no ve el pipeline');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(
  pg_temp.n('select 1 from public.sales_opportunities') = 0
  and pg_temp.n($$select 1 from public.pipeline_metric_facts(array['$$ || :'A' || $$'::uuid], current_date - 1, current_date + 1)$$) = 3,
  'el contador no ve oportunidades ni contactos, pero sí los indicadores');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.list_opportunities(array['$$ || :'A' || $$'::uuid], 'abierta')$$) = 3,
  'el encargado ve todas las oportunidades de su centro (B2B incluidas)');
select pg_temp.assert_fails($$select public.move_opportunity_stage('$$ || :'opp_sur' || $$', 1,
  pg_temp.stage('propuesta'))$$, '42501', 'el encargado no mueve oportunidades B2B');
reset role;

-- ---------------------------------------------------------------------------
-- Historial de etapa auditable
-- ---------------------------------------------------------------------------
select pg_temp.login(:'COM');
select from public.move_opportunity_stage(:'opp_sur', pg_temp.v(:'opp_sur'), pg_temp.stage('propuesta'), 'Propuesta enviada');
select pg_temp.assert_fails($$select public.move_opportunity_stage('$$ || :'opp_sur' || $$', 1,
  pg_temp.stage('negociacion'))$$, '40001', 'versión vieja: la oportunidad cambió en otro dispositivo');
select pg_temp.assert_fails($$select public.move_opportunity_stage('$$ || :'opp_sur' || $$', pg_temp.v('$$ || :'opp_sur'
  || $$'), pg_temp.stage('ganado'))$$, '22023', 'ganar o perder no se hace moviendo de etapa');
select from public.move_opportunity_stage(:'opp_sur', pg_temp.v(:'opp_sur'), pg_temp.stage('negociacion'));
select from public.add_opportunity_note(:'opp_sur', 'Piden 20 lavados al mes');
select from public.update_opportunity(:'opp_sur', pg_temp.v(:'opp_sur'), 'Flotilla Logística Sur', 90000, :'COM',
  'Cerrar negociación', :'today'::date + 1, :'today'::date + 20, 'referido',
  '{"company_name":"Logística Sur","legal_name":"Logística Sur SA de CV","rfc":"LSU010203AB1","contact_name":"Carla Mena","contact_title":"Compras","contact_phone":"5522223333","contact_email":"compras@logsur.mx"}',
  '{"billing_model":"iguala","months":12,"vehicle_rule":"cualquiera","payment_terms_days":15,"credit_limit":30000,"fee_amount":7500,"included_units":20}',
  null, 'Ajuste de precio');
select pg_temp.assert(
  (select string_agg(e.kind || coalesce(':' || fs.code, '') || coalesce('>' || ts.code, '') || coalesce('=' || e.value, ''),
                     ',' order by e.seq)
     from public.opportunity_events e
     left join public.pipeline_stages fs on fs.id = e.from_stage_id
     left join public.pipeline_stages ts on ts.id = e.to_stage_id
    where e.opportunity_id = :'opp_sur')
    = 'creada>contactado=96000.00,etapa:contactado>propuesta=96000.00,etapa:propuesta>negociacion=96000.00,nota,valor=90000.00',
  'historial: alta, cada cambio de etapa (de → a), nota y cambio de valor, en orden');
select pg_temp.assert(
  (select actor_id = :'COM' and note = 'Propuesta enviada' from public.opportunity_events
    where opportunity_id = :'opp_sur' and kind = 'etapa' order by seq limit 1),
  'cada evento registra quién y el comentario');
select pg_temp.assert(
  (select count(*) = 3 from public.opportunity_timeline(:'opp_sur') where kind in ('etapa', 'creada'))
  and (select to_stage_name = 'Negociación' from public.opportunity_timeline(:'opp_sur') where kind = 'etapa' limit 1),
  'la línea de tiempo muestra nombres de etapa');
select pg_temp.assert_fails($$update public.opportunity_events set note = 'x' where opportunity_id = '$$ || :'opp_sur'
  || $$'$$, '42501', 'el historial no se modifica desde la API');
reset role;
select pg_temp.assert_fails($$update public.opportunity_events set note = 'x' where opportunity_id = '$$ || :'opp_sur'
  || $$'$$, '42501', 'el historial es inmutable incluso para el dueño de la base');
select pg_temp.assert(
  exists (select 1 from public.audit_log where table_name = 'public.sales_opportunities' and reason = 'Propuesta enviada'
            and old_data ->> 'stage_id' = pg_temp.stage('contactado')::text
            and new_data ->> 'stage_id' = pg_temp.stage('propuesta')::text)
  and exists (select 1 from public.audit_log where table_name = 'public.sales_opportunities' and reason = 'Ajuste de precio'),
  'auditoría: actor, fecha, valores anterior y nuevo y motivo');

-- ---------------------------------------------------------------------------
-- Tareas (cola del CRM) de un prospecto sin cliente
-- ---------------------------------------------------------------------------
select pg_temp.login(:'COM');
select (public.create_opportunity_task(:'opp_sur', '30000000-0000-4000-8000-000000000001', 'reunion', 'presencial',
  :'today'::date + 1, 'Presentar propuesta')).id as task1 \gset
select pg_temp.assert(
  (select client_id is null and source = 'oportunidad' and assigned_to = :'COM' and kind = 'reunion'
     from public.crm_tasks where id = :'task1')
  and (select open_tasks = 1 from public.list_opportunities(array[:'A'::uuid], 'abierta') where id = :'opp_sur'),
  'la tarea de un prospecto entra a la cola del CRM ligada a la oportunidad');
select from public.complete_crm_task(:'task1', 'contactado', 'Aceptan en principio');
select pg_temp.assert(
  (select status = 'hecha' from public.crm_tasks where id = :'task1'),
  'la tarea se completa con las RPC del CRM (sin cliente no aplica consentimiento)');
select (public.create_opportunity_task(:'opp_sur', '30000000-0000-4000-8000-000000000002', 'llamar', null,
  :'today'::date + 3)).id as task2 \gset
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.crm_tasks where opportunity_id is not null$$) = 0,
  'el operador no ve las tareas del pipeline en la cola del CRM');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.create_opportunity_task('$$ || :'opp_ana' || $$', gen_random_uuid(), 'email',
  null, current_date + 1)$$, 'MG002', 'con cliente registrado se respeta su consentimiento de contacto');
select (public.create_opportunity_task(:'opp_ana', gen_random_uuid(), 'whatsapp', null, :'today'::date + 1)).id as task3 \gset
reset role;

-- ---------------------------------------------------------------------------
-- Ganar B2B: cuenta y convenio sin recaptura
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.win_opportunity('$$ || :'opp_sur' || $$', pg_temp.v('$$ || :'opp_sur' || $$'))$$,
  '42501', 'sólo admin o comercial B2B ganan (convierten) una oportunidad B2B');
reset role;
select pg_temp.login(:'COM');
select from public.win_opportunity(:'opp_sur', pg_temp.v(:'opp_sur'), null, true, :'today'::date, 'Firmó');
select converted_account_id as acc_sur, converted_agreement_id as agr_sur, client_id as cli_sur
  from public.sales_opportunities where id = :'opp_sur' \gset
select pg_temp.assert(
  (select status = 'ganada' and won_value = 90000 and stage_id = pg_temp.stage('ganado') and closed_at is not null
          and b2b_account_id = :'acc_sur'
     from public.sales_opportunities where id = :'opp_sur'),
  'ganada con el valor estimado vigente, en la etapa de cierre');
select pg_temp.assert(
  (select kind = 'company' and full_name = 'Logística Sur' and phone = '+525522223333' and email = 'compras@logsur.mx'
     from public.clients where id = :'cli_sur')
  and (select rfc = 'LSU010203AB1' and legal_name = 'Logística Sur SA de CV' and home_detail_center_id = :'A'
          and client_id = :'cli_sur' and billing_email = 'compras@logsur.mx'
     from public.b2b_accounts where id = :'acc_sur')
  and (select full_name = 'Carla Mena' and title = 'Compras' and is_primary from public.b2b_contacts where account_id = :'acc_sur'),
  'la empresa, la cuenta y su contacto se crean con los datos del prospecto (sin recaptura)');
select pg_temp.assert(
  (select billing_model = 'iguala' and fee_amount = 7500 and included_units = 20 and payment_terms_days = 15
          and credit_limit = 30000 and vehicle_rule = 'cualquiera' and status = 'activo' and starts_on = :'today'::date
          and ends_on = private.add_months(:'today'::date, 12) - 1
     from public.b2b_agreements where id = :'agr_sur')
  and exists (select 1 from public.b2b_agreement_centers where agreement_id = :'agr_sur' and detail_center_id = :'A'),
  'el convenio toma la propuesta: modelo, cuota, incluidos, crédito, plazo y vigencia');
select pg_temp.assert(
  (select string_agg(kind, ',' order by seq) from public.opportunity_events where opportunity_id = :'opp_sur')
    like '%,ganada,convertida'
  and (select note like 'Cuenta creada: Logística Sur (empresa nueva); convenio%'
         from public.opportunity_events where opportunity_id = :'opp_sur' and kind = 'convertida'),
  'el historial registra la ganancia y la conversión');
select pg_temp.assert_fails($$select public.win_opportunity('$$ || :'opp_sur' || $$', pg_temp.v('$$ || :'opp_sur' || $$'))$$,
  'MG002', 'una oportunidad ganada no se gana dos veces');
select pg_temp.assert_fails($$select public.reopen_opportunity('$$ || :'opp_sur' || $$', pg_temp.v('$$ || :'opp_sur'
  || $$'), null, 'Reabrir')$$, 'MG002', 'una oportunidad ganada (ya es cuenta) no se reabre');

-- Otra oportunidad con el mismo RFC: se liga a la cuenta y no duplica la empresa.
select (public.create_opportunity(:'A', '20000000-0000-4000-8000-000000000004', 'b2b', 'Logística Sur: pulido', 30000,
  null, null, '{"company_name":"Logistica del Sur","rfc":"LSU010203AB1","contact_name":"Otro","contact_phone":"5599990000"}',
  '{"billing_model":"por_vehiculo","months":6}')).id as opp_sur2 \gset
select pg_temp.assert(
  (select b2b_account_id = :'acc_sur' and client_id = :'cli_sur' from public.sales_opportunities where id = :'opp_sur2'),
  'un prospecto con el RFC de una cuenta existente se liga a esa cuenta');
select pg_temp.assert_fails($$select public.win_opportunity('$$ || :'opp_sur2' || $$', pg_temp.v('$$ || :'opp_sur2' || $$'),
  null, true, current_date)$$, 'MG002', 'no se crea un segundo convenio activo traslapado');
select from public.win_opportunity(:'opp_sur2', pg_temp.v(:'opp_sur2'), 28000, false);
select pg_temp.assert(
  (select converted_account_id = :'acc_sur' and converted_agreement_id is null and won_value = 28000
     from public.sales_opportunities where id = :'opp_sur2')
  and (select count(*) = 1 from public.b2b_accounts where rfc = 'LSU010203AB1')
  and (select count(*) = 1 from public.clients where kind = 'company' and full_name ilike 'log%'),
  'conversión a cuenta no duplica empresa (mismo RFC → misma cuenta y cliente)');

-- Empresa registrada sin cuenta (ligada por email): la cuenta se crea para ese cliente.
select from public.win_opportunity(:'opp_rutas', pg_temp.v(:'opp_rutas'));
select pg_temp.assert(
  (select a.client_id = :'rutas' and o.converted_account_id = a.id and o.converted_agreement_id is not null
     from public.sales_opportunities o join public.b2b_accounts a on a.id = o.converted_account_id
    where o.id = :'opp_rutas')
  and (select count(*) = 1 from public.clients where phone = '+525533334444'),
  'la cuenta se crea para el cliente empresa existente, sin otro cliente');
select pg_temp.assert(
  (select billing_model = 'por_vehiculo' and fee_amount is null and ends_on = private.add_months(starts_on, 6) - 1
     from public.b2b_agreements g join public.sales_opportunities o on o.converted_agreement_id = g.id
    where o.id = :'opp_rutas'),
  'convenio por vehículo de 6 meses (las tarifas se configuran después)');
reset role;

-- ---------------------------------------------------------------------------
-- Perder, reabrir y ganar B2C premium
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.lose_opportunity('$$ || :'opp_ana' || $$', pg_temp.v('$$ || :'opp_ana'
  || $$'), null)$$, '22023', 'perder exige motivo');
select from public.lose_opportunity(:'opp_ana', pg_temp.v(:'opp_ana'), 'precio', 'Le pareció caro');
select pg_temp.assert(
  (select status = 'perdida' and stage_id = pg_temp.stage('perdido') and loss_reason = 'precio'
     from public.sales_opportunities where id = :'opp_ana')
  and (select status = 'cancelada' and cancel_reason = 'Oportunidad perdida' from public.crm_tasks where id = :'task3'),
  'perdida con motivo; sus tareas pendientes se cancelan');
select from public.reopen_opportunity(:'opp_ana', pg_temp.v(:'opp_ana'), pg_temp.stage('negociacion'), 'Volvió a llamar');
select from public.win_opportunity(:'opp_ana', pg_temp.v(:'opp_ana'), 11000);
select pg_temp.assert(
  (select status = 'ganada' and won_value = 11000 and converted_account_id is null and loss_reason is null
     from public.sales_opportunities where id = :'opp_ana')
  and (select string_agg(kind, ',' order by seq) from public.opportunity_events where opportunity_id = :'opp_ana')
    = 'creada,perdida,reabierta,ganada',
  'B2C premium: perder, reabrir con motivo y ganar sin conversión');
reset role;

-- ---------------------------------------------------------------------------
-- Métricas reproducibles desde eventos
-- ---------------------------------------------------------------------------
select pg_temp.login(:'COM');
select (public.create_opportunity(:'A', '20000000-0000-4000-8000-000000000005', 'b2b', 'Abierta', 15000, null, null,
  '{"company_name":"Abierta SA","contact_name":"Eli","contact_phone":"5544445555"}')).id as opp_open \gset
select (public.create_opportunity(:'A', '20000000-0000-4000-8000-000000000006', 'b2b', 'Perdida', 20000, null, null,
  '{"company_name":"Perdida SA","contact_name":"Leo","contact_email":"leo@perdida.mx"}')).id as opp_lost \gset
select from public.lose_opportunity(:'opp_lost', pg_temp.v(:'opp_lost'), 'competencia');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
create temp table facts as
  select * from public.pipeline_metric_facts(array[:'A'::uuid], :'today'::date, :'today'::date);
reset role;
select pg_temp.assert(
  (select count(*) from facts) = 6
  and (select count(*) filter (where outcome = 'ganada') from facts) = 4
  and (select count(*) filter (where outcome = 'perdida') from facts) = 1
  and (select sum(won_value) from facts) = 90000 + 28000 + 40000 + 11000
  and (select count(*) filter (where outcome is null) from facts) = 1
  and (select current_value from facts where opportunity_id = :'opp_sur') = 90000
  and (select created_value from facts where opportunity_id = :'opp_sur') = 96000
  and (select cycle_days >= 0 from facts where opportunity_id = :'opp_sur')
  and (select cardinality(stages_reached) = 4 from facts where opportunity_id = :'opp_sur'),
  'hechos: creadas, ganadas, perdidas, valor ganado, valor y etapas vigentes, ciclo');
select pg_temp.assert(
  not exists (
    select 1 from facts f join public.sales_opportunities o on o.id = f.opportunity_id
     where f.outcome is distinct from nullif(o.status, 'abierta')
        or f.won_value is distinct from o.won_value
        or (o.status = 'abierta' and (f.current_value <> o.estimated_value or f.current_stage_id <> o.stage_id))),
  'los hechos derivados de eventos coinciden con el estado de cada oportunidad');
-- Si alguien alterara la tabla de oportunidades por fuera de las RPC, las
-- métricas no cambian: se calculan sólo desde el historial.
update public.sales_opportunities set won_value = 1 where id = :'opp_sur';
update public.sales_opportunities set estimated_value = 1 where id = :'opp_open';
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(
  (select sum(won_value) from public.pipeline_metric_facts(array[:'A'::uuid], :'today'::date, :'today'::date))
    = (select sum(won_value) from facts)
  and (select current_value from public.pipeline_metric_facts(array[:'A'::uuid], :'today'::date, :'today'::date)
        where opportunity_id = :'opp_open') = 15000,
  'métricas reproducibles: sólo dependen de opportunity_events');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.pipeline_metric_facts(array['$$ || :'A' || $$'::uuid], current_date + 5, current_date + 9)$$) = 1,
  'un rango futuro sólo incluye lo que sigue abierto');
reset role;

-- ---------------------------------------------------------------------------
-- Etapas configurables (admin corporativo)
-- ---------------------------------------------------------------------------
select pg_temp.login(:'COM');
select pg_temp.assert_fails($$select public.upsert_pipeline_stage('$$ || :'ORG' || $$', null, 'Demo', 3::smallint,
  40::smallint, true, 'Nueva etapa')$$, '42501', 'sólo el admin corporativo configura etapas');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.upsert_pipeline_stage(:'ORG', null, 'Demostración', 3::smallint, 40::smallint, true, 'Nueva etapa')).id
  as demo \gset
select pg_temp.assert(
  (select kind = 'abierta' and position = 3 and probability = 40 from public.pipeline_stages where id = :'demo'),
  'el admin agrega una etapa abierta intermedia');
select pg_temp.assert_fails($$select public.upsert_pipeline_stage('$$ || :'ORG' || $$', pg_temp.stage('prospecto'),
  'Prospecto', 1::smallint, 10::smallint, false, 'Desactivar')$$, 'MG002',
  'una etapa con oportunidades abiertas no se desactiva');
select from public.upsert_pipeline_stage(:'ORG', pg_temp.stage('ganado'), 'Cerrado ganado', 1::smallint, 0::smallint,
  false, 'Renombrar');
select pg_temp.assert(
  (select name = 'Cerrado ganado' and position = 90 and probability = 100 and active from public.pipeline_stages
    where id = pg_temp.stage('ganado')),
  'las etapas de cierre sólo cambian de nombre');
select from public.move_opportunity_stage(:'opp_open', pg_temp.v(:'opp_open'), :'demo');
select from public.upsert_pipeline_stage(:'ORG', pg_temp.stage('contactado'), 'Contactado', 2::smallint, 25::smallint,
  false, 'Ya no se usa');
select pg_temp.assert_fails($$select public.move_opportunity_stage('$$ || :'opp_open' || $$', pg_temp.v('$$ || :'opp_open'
  || $$'), pg_temp.stage('contactado'))$$, '22023', 'no se mueve a una etapa inactiva');
select pg_temp.assert(
  (select string_agg(user_id::text, ',' order by user_id) from public.pipeline_owners(:'A', 'b2b'))
    = '00000000-0000-0000-0000-0000000000a1,00000000-0000-0000-0000-0000000000b1'
  and (select count(*) from public.pipeline_owners(:'A', 'b2c_premium')) = 3,
  'responsables posibles: B2B admin y comercial; B2C premium también el encargado');
reset role;

rollback;
