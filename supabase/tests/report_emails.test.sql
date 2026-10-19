-- Pruebas de Dirección → Reportes por correo: programaciones (sólo admin
-- corporativo, correos validados, versión y auditoría), bitácora de envíos
-- (automático sólo con la llave de servicio, sin duplicar un periodo) y hechos
-- con los permisos del autor.
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

grant execute on all functions in schema pg_temp to authenticated, anon, service_role;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin2@o1'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000d1', 'admin@o2');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno'),
  ('0e000000-0000-0000-0000-000000000002', 'org-dos', 'Organización Dos');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Mexico_City'),
  ('cccccccc-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000002', 'C-01', 'Centro C', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio'),
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'admin_socio'),
  ('0e000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d1', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado');

\set O1 '0e000000-0000-0000-0000-000000000001'
\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set B 'bbbbbbbb-0000-0000-0000-000000000000'
\set C 'cccccccc-0000-0000-0000-000000000000'

-- Programaciones: sólo el admin corporativo, validadas.
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.save_report_subscription('0e000000-0000-0000-0000-000000000001', null, null,
  'Diario', 'diario', null, array['dir@meguiars.mx'], true, 'Alta')$$, '42501',
  'un encargado no programa reportes por correo');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert_fails($$select public.save_report_subscription('0e000000-0000-0000-0000-000000000001', null, null,
  'Diario', 'diario', null, array['no-es-correo'], true, 'Alta')$$, '22023', 'rechaza un correo sin formato');
select pg_temp.assert_fails($$select public.save_report_subscription('0e000000-0000-0000-0000-000000000001', null, null,
  'Diario', 'diario', null, array[]::text[], true, 'Alta')$$, '22023', 'pide al menos un destinatario');
select pg_temp.assert_fails($$select public.save_report_subscription('0e000000-0000-0000-0000-000000000001', null, null,
  'Diario', 'cada_hora', null, array['dir@meguiars.mx'], true, 'Alta')$$, '22023', 'rechaza una frecuencia desconocida');
select pg_temp.assert_fails($$select public.save_report_subscription('0e000000-0000-0000-0000-000000000001', null, null,
  'Diario', 'diario', array['cccccccc-0000-0000-0000-000000000000']::uuid[], array['dir@meguiars.mx'], true, 'Alta')$$,
  '22023', 'no acepta centros de otra organización');
select pg_temp.assert_fails($$select public.save_report_subscription('0e000000-0000-0000-0000-000000000001', null, null,
  'Diario', 'diario', null, array['dir@meguiars.mx'], true, '')$$, '22023', 'pide motivo del cambio');
select id as s1 from public.save_report_subscription(:'O1', null, null, '  Resumen diario ', 'diario', null,
  array[' Dir@Meguiars.mx', 'dir@meguiars.mx', 'socio@correo.com', ''], true, 'Alta') \gset
select pg_temp.assert(
  (select (name, recipients, center_ids is null, version, created_by)
     from public.report_subscriptions where id = :'s1')
  = ('Resumen diario'::text, array['dir@meguiars.mx', 'socio@correo.com']::text[], true, 1,
     '00000000-0000-0000-0000-0000000000a1'::uuid),
  'guarda la programación con correos en minúsculas, sin repetidos ni vacíos, y su autor');
select id as s2 from public.save_report_subscription(:'O1', null, null, 'Mensual Centro A', 'mensual',
  array[:'A']::uuid[], array['dir@meguiars.mx'], true, 'Alta') \gset
select pg_temp.assert_fails(format($$select public.save_report_subscription(%L, %L, 9, 'Mensual', 'mensual', null,
  array['dir@meguiars.mx'], true, 'Cambio')$$, :'O1', :'s2'), '40001', 'detecta cambios simultáneos por versión');
select pg_temp.assert_fails($$insert into public.report_subscriptions (organization_id, name, frequency, recipients)
  values ('0e000000-0000-0000-0000-000000000001', 'Directo', 'diario', array['x@y.mx'])$$, '42501',
  'sin escritura directa en las programaciones');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert((select count(*) from public.report_subscriptions) = 0,
  'un encargado no ve las programaciones ni sus correos');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select pg_temp.assert((select count(*) from public.report_subscriptions) = 0,
  'el admin de otra organización no las ve');
reset role;

-- Envío manual («Enviar ahora»): admin corporativo; automático sólo con la llave de servicio.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select id as d1 from public.record_report_delivery(:'s1', 'manual', current_date - 1, current_date - 1, 'enviado', 'msg-1', null) \gset
select pg_temp.assert(
  (select (source, status, requested_by, subscription_name, recipients) from public.report_deliveries where id = :'d1')
  = ('manual'::text, 'enviado'::text, '00000000-0000-0000-0000-0000000000a1'::uuid, 'Resumen diario'::text,
     array['dir@meguiars.mx', 'socio@correo.com']::text[]),
  'el envío manual queda en la bitácora con quién lo pidió y a quién se mandó');
select pg_temp.assert_fails(format($$select public.record_report_delivery(%L, 'cron', current_date - 1, current_date - 1,
  'enviado', 'x', null)$$, :'s1'), '42501', 'un usuario no registra envíos automáticos');
select pg_temp.assert_fails(format($$select public.report_subscription_facts(%L, array['pnl'], array[%L]::uuid[],
  current_date, current_date)$$, :'s1', :'A'), '42501', 'sólo el envío programado lee hechos por programación');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails(format($$select public.record_report_delivery(%L, 'manual', current_date - 1, current_date - 1,
  'enviado', 'x', null)$$, :'s1'), '42501', 'un encargado no envía reportes');
reset role;

select pg_temp.as_service();
select public.report_subscription_facts(:'s1', array['pnl', 'orders'], array[:'A', :'B']::uuid[],
  current_date - 1, current_date - 1) as f \gset
select pg_temp.assert(:'f'::jsonb ? 'pnl' and jsonb_array_length(:'f'::jsonb -> 'centers') = 2,
  'el cron lee los hechos con los permisos del autor (admin corporativo: ambos centros)');
-- Cada llamada del cron es una petición aparte: vuelve a ser la llave de servicio.
reset role;
select pg_temp.as_service();
select id as d2 from public.record_report_delivery(:'s1', 'cron', current_date - 7, current_date - 7, 'fallido', null,
  'Resend respondió 500') \gset
select id as d3 from public.record_report_delivery(:'s1', 'cron', current_date - 7, current_date - 7, 'enviado', 'msg-2', null) \gset
select coalesce(id::text, 'ninguno') as dup
  from public.record_report_delivery(:'s1', 'cron', current_date - 7, current_date - 7, 'enviado', 'msg-3', null) \gset
select pg_temp.assert(:'d2' <> '' and :'d3' <> '' and :'dup' = 'ninguno'
  and (select count(*) from public.report_deliveries where subscription_id = :'s1' and source = 'cron') = 2,
  'un fallo no impide reintentar, pero un periodo enviado no se vuelve a registrar');
select pg_temp.assert(
  (select error from public.record_report_delivery(:'s1', 'cron', current_date, current_date, 'fallido', null, '  '))
  = 'Error desconocido', 'un fallo siempre guarda un error');
reset role;

-- El autor deja de ser admin corporativo: el cron ya no lee con sus permisos.
delete from public.role_assignments where user_id = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.as_service();
select pg_temp.assert_fails(format($$select public.report_subscription_facts(%L, array['pnl'], array[%L]::uuid[],
  current_date, current_date)$$, :'s1', :'A'), '42501', 'si el autor ya no es admin corporativo, el cron no lee hechos');
reset role;

-- Otro admin la vuelve a guardar y queda como autor; al borrarla, la bitácora se conserva.
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select version as v1 from public.report_subscriptions where id = :'s1' \gset
select from public.save_report_subscription(:'O1', :'s1', :v1, 'Resumen diario', 'diario', null,
  array['dir@meguiars.mx'], false, 'Cambio de destinatarios');
select pg_temp.assert(
  (select (created_by, active, version) from public.report_subscriptions where id = :'s1')
  = ('00000000-0000-0000-0000-0000000000a2'::uuid, false, 2),
  'al guardarla otro admin queda como autor; se puede pausar');
select from public.delete_report_subscription(:'s1', 'Ya no se usa');
select pg_temp.assert(
  (select count(*) from public.report_deliveries where subscription_name = 'Resumen diario' and subscription_id is null) = 4,
  'al borrar la programación la bitácora de envíos se conserva');
reset role;
select pg_temp.assert(
  (select count(*) from public.audit_log where table_name = 'public.report_subscriptions') >= 4,
  'los cambios de programaciones quedan auditados');

rollback;
