-- Aviso por WhatsApp a clientes con membresía sin usar (20261111000000_membership_reminders).
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
  perform set_config('app.change_reason', '', true);
  execute 'set local role service_role';
end $$;

grant execute on all functions in schema pg_temp to authenticated, anon, service_role;

\set O1 '0e000000-0000-0000-0000-000000000001'
\set A 'aaaaaaaa-0000-0000-0000-000000000000'

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'corp@o1'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a');
insert into public.organizations (id, slug, name) values (:'O1', 'org-uno', 'Org uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  (:'A', :'O1', 'A-01', 'Centro Polanco', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  (:'O1', '00000000-0000-0000-0000-0000000000a1', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  (:'A', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion');

-- Plan con 2 lavados por mes; cuenta de WhatsApp verificada y plantillas.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service(:'O1', 'LAV', 'Lavado', null, 'recurrente', 40, 250, 80)).id as lavado \gset
select (public.upsert_membership_plan(:'O1', null, 'CARE', 'care', 'Care',
  null, 499, 1::smallint, 'centro_origen', null, 7::smallint, null, null, true, 'Alta del plan')).id as care \gset
select from public.set_membership_benefit(:'care', :'lavado', 2::smallint, null, 'Beneficio del plan');
select (public.upsert_channel_account(:'O1', null, :'A', 'whatsapp', '1234567890', 'WhatsApp central', true, 'Número central')).id as wa \gset
reset role;
select pg_temp.as_service();
select from public.record_channel_verification(:'wa', true, '+52 55 0000 0000', null);
select from public.record_whatsapp_templates(:'O1', '1000000001', '[
  {"name": "aviso_membresia", "language": "es_MX", "category": "MARKETING", "status": "APPROVED",
   "body": "Hola {{1}}, su membresía incluye {{2}} este mes. ¿Le agendamos?", "param_count": 2, "quick_replies": 0},
  {"name": "con_botones", "language": "es_MX", "category": "UTILITY", "status": "APPROVED",
   "body": "Hola {{1}} {{2}}", "param_count": 2, "quick_replies": 2}]');
reset role;
select id as tpl from public.whatsapp_templates where name = 'aviso_membresia' \gset
select id as tpl_btn from public.whatsapp_templates where name = 'con_botones' \gset

-- Clientes: Laura (acepta WhatsApp), Pedro (no acepta), Ana (acepta, visitó ayer).
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client(:'A', gen_random_uuid(), 'Laura Pérez', '5512345678', null, 'person', null, '{whatsapp}', 'web',
  '[{"make":"Mazda","model":"3","year":2021,"plate":"ABC1234"}]'::jsonb)).id as laura \gset
select id as v_laura from public.vehicles where plate = 'ABC1234' \gset
select (public.create_client(:'A', gen_random_uuid(), 'Pedro Ruiz', '5598765432', null, 'person', null, '{}', 'web',
  '[{"make":"Kia","model":"Rio","year":2022,"plate":"XYZ9876"}]'::jsonb)).id as pedro \gset
select id as v_pedro from public.vehicles where plate = 'XYZ9876' \gset
select (public.create_client(:'A', gen_random_uuid(), 'Ana Gómez', '5511112222', null, 'person', null, '{whatsapp}', 'web',
  '[{"make":"VW","model":"Jetta","year":2020,"plate":"LMN4567"}]'::jsonb)).id as ana \gset
select id as v_ana from public.vehicles where plate = 'LMN4567' \gset
select (public.create_membership(:'A', gen_random_uuid(), :'care', :'laura', :'v_laura')).id as m_laura \gset
select (public.create_membership(:'A', gen_random_uuid(), :'care', :'pedro', :'v_pedro')).id as m_pedro \gset
select (public.create_membership(:'A', gen_random_uuid(), :'care', :'ana', :'v_ana')).id as m_ana \gset
reset role;
-- Las membresías se vendieron hace 20 días; Ana vino ayer.
select set_config('app.change_reason', 'Datos de prueba', true);
update public.memberships set created_at = now() - interval '20 days' where id in (:'m_laura', :'m_pedro', :'m_ana');
update public.clients set last_visit_at = now() - interval '1 day' where id = :'ana';
-- Las pruebas no dependen de la hora en que corren: la ventana 10:00–19:00 se prueba aparte.
select pg_temp.assert(
  private.membership_reminder_in_hours('UTC') = (extract(hour from now() at time zone 'UTC') between 10 and 18),
  'la ventana de envío es de 10:00 a 19:00 en la zona del centro');
create or replace function private.membership_reminder_in_hours(p_timezone text) returns boolean
language sql stable set search_path = '' as $$ select true $$;

-- ---------------------------------------------------------------------------
-- Configuración (admin) con validación de la plantilla.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails(format($$select public.set_membership_reminders(%L, 1, true, %L, 14, 'Encender')$$, :'O1', :'tpl'),
  '42501', 'la recepción no configura los avisos');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert_fails(format($$select public.set_membership_reminders(%L, 1, true, %L, 14, 'Encender')$$, :'O1', :'tpl_btn'),
  'MG002', 'la plantilla no debe llevar botones');
select pg_temp.assert_fails(format($$select public.set_membership_reminders(%L, 1, true, %L, 5, 'Encender')$$, :'O1', :'tpl'),
  '22023', 'los días sin visita van de 7 a 60');
select from public.set_membership_reminders(:'O1', 1, true, :'tpl', 14, 'Avisos a 14 días');
select pg_temp.assert(
  (select enabled and template_id = :'tpl' and days = 14 and can_manage from public.get_membership_reminder_settings(:'O1'))
  and exists (select 1 from public.audit_log where table_name = 'public.bot_settings' and reason = 'Avisos a 14 días'),
  'el admin enciende los avisos con auditoría');
select pg_temp.assert_fails('select * from public.membership_reminders_due(10)', '42501',
  'una sesión de usuario no lista avisos');
reset role;

-- ---------------------------------------------------------------------------
-- A quién le toca y el mensaje.
-- ---------------------------------------------------------------------------
select pg_temp.as_service();
select pg_temp.assert(
  (select array_agg(membership_id) from public.membership_reminders_due(10)) = array[:'m_laura']::uuid[],
  'sólo Laura: aceptó WhatsApp, tiene lavados sin usar y no viene hace 14 días (Pedro no aceptó; Ana vino ayer)');
select * from public.prepare_membership_reminder(:'m_laura') \gset r_
select pg_temp.assert(
  :'r_template_name' = 'aviso_membresia' and :'r_template_params' = '{Laura,"2 Lavado"}'
  and :'r_body' = 'Hola Laura, su membresía incluye 2 Lavado este mes. ¿Le agendamos?'
  and :'r_contact_external_id' = '5215512345678' and :'r_button_payloads' = '{}',
  'plantilla con el nombre y los servicios disponibles, sin botones');
select pg_temp.assert(
  (select message_id from public.prepare_membership_reminder(:'m_laura')) = :'r_message_id'::uuid
  and not exists (select 1 from public.membership_reminders_due(10)),
  'un aviso cada 14 días: repetir devuelve el mismo y ya no aparece pendiente');
reset role;
select pg_temp.assert(
  (select count(*) = 1 and bool_and(sent) and min(benefits_text) = '2 Lavado' from public.membership_reminders
    where membership_id = :'m_laura')
  and (select message_type || ':' || sent_by_bot from public.messages where id = :'r_message_id') = 'template:true',
  'queda en la bitácora y en la conversación del cliente');

-- Ya usó sus lavados: no le toca aunque pasen los días.
select set_config('app.change_reason', 'Datos de prueba', true);
update public.membership_reminders set created_at = now() - interval '15 days' where membership_id = :'m_laura';
select pg_temp.as_service();
select pg_temp.assert((select array_agg(membership_id) from public.membership_reminders_due(10)) = array[:'m_laura']::uuid[],
  'pasados 14 días le vuelve a tocar');
reset role;
select set_config('app.change_reason', 'Datos de prueba', true);
-- (equivale a haberlos redimido: el saldo del periodo queda en 0)
update public.memberships
   set benefits = jsonb_build_array(benefits -> 0 || '{"quantity_per_period": 0}'::jsonb)
 where id = :'m_laura';
select pg_temp.as_service();
select pg_temp.assert(not exists (select 1 from public.membership_reminders_due(10)),
  'sin servicios disponibles no hay aviso');
reset role;

-- La recepción ve la bitácora de su centro.
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert((select count(*) = 1 from public.membership_reminders), 'recepción ve los avisos enviados de su centro');
reset role;

rollback;
