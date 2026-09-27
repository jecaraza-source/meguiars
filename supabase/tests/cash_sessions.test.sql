-- Pruebas de AF3: corte de caja. Apertura y cierre por centro y turno,
-- efectivo esperado reproducible desde los pagos (con reversos), diferencia,
-- resumen de tarjeta y transferencia, bloqueo del corte cerrado, reapertura
-- sólo del admin con motivo y auditoría, versiones del cierre, aislamiento
-- entre centros e idempotencia.
--
-- Todo corre en una transacción (now() fijo): para simular el paso del tiempo
-- se recorren marcas de tiempo como superusuario (pg_temp.ago), sin triggers.
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

create function pg_temp.v(p_id uuid) returns integer language sql security definer as $$
  select version from public.service_orders where id = p_id
$$;

create function pg_temp.sv(p_id uuid) returns integer language sql security definer as $$
  select version from public.cash_sessions where id = p_id
$$;

create function pg_temp.pay(p_id uuid, p_tenders text, p_cash numeric default null)
returns public.payments language sql as $$
  select public.register_payment(p_id, pg_temp.v(p_id), gen_random_uuid(), p_tenders::jsonb, p_cash)
$$;

-- Recorre hacia atrás una marca de tiempo (simula que ocurrió hace N minutos).
create function pg_temp.ago(p_table text, p_col text, p_where text, p_minutes integer) returns void
language plpgsql as $$
begin
  perform set_config('session_replication_role', 'replica', true);
  execute format('update %s set %I = %I - make_interval(mins => %s) where %s', p_table, p_col, p_col, p_minutes, p_where);
  perform set_config('session_replication_role', 'origin', true);
end $$;

-- Esperado recalculado desde los pagos sobre la ventana del corte.
create function pg_temp.recomputed(p_session uuid) returns numeric language sql security definer as $$
  select (private.cash_window_totals(s.detail_center_id, s.opened_at, s.window_end, s.opening_float) ->> 'expected_cash')::numeric
    from public.cash_sessions s where s.id = p_session
$$;

grant execute on all functions in schema pg_temp to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@o1'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@a'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000e2', 'encargado@b'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'contador'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e2', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion');

\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set B 'bbbbbbbb-0000-0000-0000-000000000000'
\set ORG '0e000000-0000-0000-0000-000000000001'
select private.center_today(:'A') as today \gset

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service(:'ORG', 'POL', 'Pulido', null, 'valor_medio', 120, 5000, 900)).id as pol \gset
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000001', 'Ana Ruiz', '5511112222', null, 'person', null,
  '{}', 'web', '[{"make":"Kia","model":"Rio","year":2022,"plate":"ANA0001"}]'::jsonb)).id as ana \gset
select id as ana_car from public.vehicles where plate = 'ANA0001' \gset
select (public.create_service_order(:'A', '30000000-0000-4000-8000-000000000001', :'ana', :'ana_car',
  jsonb_build_array(jsonb_build_object('service_id', :'pol')))).id as o1 \gset
select from public.set_service_order_status(:'o1', pg_temp.v(:'o1'), 'autorizada');
reset role;

-- ---------------------------------------------------------------------------
-- Apertura: permisos, centro, una abierta por centro, idempotencia
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails($$select public.open_cash_session('$$ || :'A' || $$', gen_random_uuid(), 'unico', 500)$$,
  '42501', 'recepción no abre la caja');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert_fails($$select public.open_cash_session('$$ || :'A' || $$', gen_random_uuid(), 'unico', 500)$$,
  '42501', 'el contador (sólo lectura) no abre la caja');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select pg_temp.assert_fails($$select public.open_cash_session('$$ || :'A' || $$', gen_random_uuid(), 'unico', 500)$$,
  '42501', 'el encargado del centro B no abre la caja del centro A');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.open_cash_session('$$ || :'A' || $$', gen_random_uuid(), 'unico', -1)$$,
  '22023', 'el fondo inicial no es negativo');
select pg_temp.assert_fails($$select public.open_cash_session('$$ || :'A' || $$', gen_random_uuid(), 'madrugada', 500)$$,
  '22023', 'turno válido');
select (public.open_cash_session(:'A', '50000000-0000-4000-8000-000000000001', 'matutino', 500)).id as s1 \gset
select pg_temp.assert(
  (select folio = 'A-01-C-000001' and status = 'abierta' and business_date = :'today'::date and opening_float = 500
          and opened_by = '00000000-0000-0000-0000-0000000000e1' and window_end is null
     from public.cash_sessions where id = :'s1'),
  'el encargado abre la caja del turno: folio A-01-C-000001, fondo $500, día del centro');
select pg_temp.assert(
  (public.open_cash_session(:'A', '50000000-0000-4000-8000-000000000001', 'matutino', 500)).id = :'s1',
  'apertura idempotente: la misma solicitud devuelve la misma caja');
select pg_temp.assert_fails($$select public.open_cash_session('$$ || :'A' || $$', gen_random_uuid(), 'vespertino', 0)$$,
  'MG002', 'una sola caja abierta por centro');
reset role;
-- La caja se abrió hace 6 horas.
select pg_temp.ago('public.cash_sessions', 'opened_at', format('id = %L', :'s1'), 360);

-- ---------------------------------------------------------------------------
-- Cobros del turno (recepción): efectivo con cambio, tarjeta, transferencia,
-- efectivo revertido en el mismo turno y otro efectivo.
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (pg_temp.pay(:'o1', '[{"method":"efectivo","amount":1000}]', 1200)).id as p_cash1 \gset
select (pg_temp.pay(:'o1', '[{"method":"tarjeta","amount":500,"reference":"AUT-1"}]')).id as p_card \gset
select (pg_temp.pay(:'o1', '[{"method":"transferencia","amount":300,"reference":"SPEI-1"}]')).id as p_tr \gset
select (pg_temp.pay(:'o1', '[{"method":"efectivo","amount":200}]')).id as p_cash2 \gset
select (pg_temp.pay(:'o1', '[{"method":"efectivo","amount":250}]')).id as p_cash3 \gset
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select from public.reverse_payment(:'p_cash2', 'Cobro duplicado');
reset role;
select pg_temp.ago('public.payments', 'received_at', format('detail_center_id = %L', :'A'), 300);
select pg_temp.ago('public.payment_reversals', 'reversed_at', format('payment_id = %L', :'p_cash2'), 290);

select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  (select (d -> 'live' ->> 'expected_cash')::numeric = 1750 and (d -> 'live' ->> 'cash_collected')::numeric = 1450
          and (d -> 'live' ->> 'cash_refunded')::numeric = 200 and (d -> 'live' ->> 'card_total')::numeric = 500
          and (d -> 'live' ->> 'transfer_total')::numeric = 300 and (d -> 'live' ->> 'payments_count')::integer = 5
          and (d -> 'live' ->> 'reversals_count')::integer = 1 and jsonb_array_length(d -> 'payments') = 6
     from public.cash_session_detail(:'s1') d),
  'esperado al momento = fondo 500 + efectivo 1,450 (el cambio no cuenta) − reverso 200 = $1,750; tarjeta y transferencia aparte');
select pg_temp.assert(
  (select expected_cash = 1750 and counted_cash is null and status = 'abierta'
     from public.list_cash_sessions(array[:'A'::uuid], :'today', :'today') where id = :'s1'),
  'el listado muestra la caja abierta con su esperado');
reset role;

-- ---------------------------------------------------------------------------
-- Cierre: permisos, centro, diferencia con nota, idempotencia
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert_fails($$select public.close_cash_session('$$ || :'s1' || $$', pg_temp.sv('$$ || :'s1' || $$'),
  gen_random_uuid(), 1750)$$, '42501', 'recepción no cierra la caja');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select pg_temp.assert_fails($$select public.close_cash_session('$$ || :'s1' || $$', pg_temp.sv('$$ || :'s1' || $$'),
  gen_random_uuid(), 1750)$$, '42501', 'el centro B no puede cerrar la caja del centro A');
select pg_temp.assert(
  (select count(*) from public.cash_sessions where detail_center_id = :'A') = 0
  and (select count(*) from public.list_cash_sessions(array[:'A'::uuid], :'today', :'today')) = 0
  and public.cash_session_detail(:'s1') is null,
  'el encargado del centro B no ve los cortes del centro A');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.close_cash_session('$$ || :'s1' || $$', pg_temp.sv('$$ || :'s1' || $$'),
  gen_random_uuid(), 1700)$$, '22023', 'un faltante exige explicar la diferencia');
select pg_temp.assert_fails($$select public.close_cash_session('$$ || :'s1' || $$', pg_temp.sv('$$ || :'s1' || $$'),
  gen_random_uuid(), 1700.555, 'Nota')$$, '22023', 'efectivo contado con dos decimales');
select pg_temp.assert_fails($$select public.close_cash_session('$$ || :'s1' || $$', 99, gen_random_uuid(), 1700,
  'Nota')$$, '40001', 'versión vieja de la caja');
select (public.close_cash_session(:'s1', pg_temp.sv(:'s1'), '51000000-0000-4000-8000-000000000001', 1700,
  'Faltan $50: cambio mal entregado')).id as c1 \gset
select pg_temp.assert(
  (select sequence = 1 and expected_cash = 1750 and counted_cash = 1700 and difference = -50
          and cash_collected = 1450 and cash_refunded = 200 and card_total = 500 and transfer_total = 300
          and payments_count = 5 and reversals_count = 1
          and closed_by = '00000000-0000-0000-0000-0000000000e1'
     from public.cash_closings where id = :'c1')
  and (select status = 'cerrada' and window_end = now() and closings_count = 1 and closed_at is not null
         from public.cash_sessions where id = :'s1'),
  'cierre: esperado $1,750, contado $1,700, diferencia −$50 (faltante) calculada por la base; caja cerrada');
select pg_temp.assert(
  (public.close_cash_session(:'s1', 1, '51000000-0000-4000-8000-000000000001', 1700, 'otra')).id = :'c1'
  and (select count(*) from public.cash_closings where session_id = :'s1') = 1,
  'cierre idempotente: reintentar (web y móvil) devuelve el mismo cierre');
select pg_temp.assert_fails($$select public.close_cash_session('$$ || :'s1' || $$', pg_temp.sv('$$ || :'s1' || $$'),
  gen_random_uuid(), 1750)$$, '22023', 'un corte cerrado no se vuelve a cerrar');
select pg_temp.assert_fails($$update public.cash_sessions set notes = 'x' where id = '$$ || :'s1' || $$'$$,
  '42501', 'los cortes no se editan desde la API');
reset role;
select pg_temp.assert(
  exists (select 1 from public.audit_log where table_name = 'public.cash_closings' and action = 'INSERT'
            and actor_id = '00000000-0000-0000-0000-0000000000e1' and reason = 'Faltan $50: cambio mal entregado'
            and (new_data ->> 'difference')::numeric = -50)
  and exists (select 1 from public.audit_log where event = 'cash_session.closed' and record_id = :'s1'),
  'el cierre queda auditado (actor, motivo y valores) con su evento');
set local app.change_reason = 'Prueba';
select pg_temp.assert_fails($$update public.cash_sessions set notes = 'x' where id = '$$ || :'s1' || $$'$$,
  '22023', 'corte cerrado bloqueado: ni el dueño de la base lo cambia sin reapertura');
select pg_temp.assert_fails($$update public.cash_closings set counted_cash = 1750 where id = '$$ || :'c1' || $$'$$,
  '42501', 'la versión del cierre es inmutable');
select pg_temp.assert_fails($$delete from public.cash_sessions where id = '$$ || :'s1' || $$'$$,
  '42501', 'los cortes no se borran');

-- El corte cerró hace 2 horas (se recorre toda su historia).
select pg_temp.ago('public.cash_sessions', 'opened_at', format('id = %L', :'s1'), 120);
select pg_temp.ago('public.cash_sessions', 'window_end', format('id = %L', :'s1'), 120);
select pg_temp.ago('public.cash_closings', 'window_from', format('id = %L', :'c1'), 120);
select pg_temp.ago('public.cash_closings', 'window_to', format('id = %L', :'c1'), 120);
select pg_temp.ago('public.payments', 'received_at', format('detail_center_id = %L', :'A'), 120);
select pg_temp.ago('public.payment_reversals', 'reversed_at', format('detail_center_id = %L', :'A'), 120);
select pg_temp.assert(pg_temp.recomputed(:'s1') = 1750, 'la diferencia es reproducible: recalcular desde los pagos da $1,750');

-- ---------------------------------------------------------------------------
-- Ningún cobro ni reverso cae dentro de un corte cerrado
-- ---------------------------------------------------------------------------
select pg_temp.assert_fails($$select private.create_order_payment(o, gen_random_uuid(),
  '[{"method":"efectivo","amount":10}]'::jsonb, null, null, false, now() - interval '3 hours')
  from public.service_orders o where o.id = '$$ || :'o1' || $$'$$,
  '40001', 'un cobro con hora dentro de un corte cerrado se rechaza (reintento en el siguiente turno)');
-- Cobro sin caja abierta (hace 90 minutos, entre turnos): queda "fuera de corte".
select (private.create_order_payment(o, '52000000-0000-4000-8000-000000000001', '[{"method":"efectivo","amount":100}]'::jsonb,
  null, 'Cobro sin caja', false, now() - interval '90 minutes')).id as p_out
  from public.service_orders o where o.id = :'o1' \gset
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert(
  (select cash_amount = 100 and payments_count = 1 from public.cash_uncovered(array[:'A'::uuid], :'today'::date - 1, :'today')),
  'el efectivo cobrado sin caja abierta se reporta aparte (fuera de corte)');

-- Segundo turno: se revierte un efectivo cobrado en el corte ya cerrado.
select pg_temp.assert_fails($$select public.open_cash_session('$$ || :'A' || $$', gen_random_uuid(), 'matutino', 300)$$,
  'MG002', 'un solo corte por día y turno');
select (public.open_cash_session(:'A', gen_random_uuid(), 'vespertino', 300)).id as s2 \gset
reset role;
select pg_temp.ago('public.cash_sessions', 'opened_at', format('id = %L', :'s2'), 60);
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select from public.reverse_payment(:'p_cash3', 'Reembolso al cliente');
reset role;
select pg_temp.ago('public.payment_reversals', 'reversed_at', format('payment_id = %L', :'p_cash3'), 30);
select pg_temp.assert(
  pg_temp.recomputed(:'s1') = 1750
  and (select expected_cash = 1750 from public.cash_closings where id = :'c1'),
  'revertir después un cobro de un corte cerrado no recalcula ese corte');
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert(
  (select (d -> 'live' ->> 'expected_cash')::numeric = 50 and (d -> 'live' ->> 'cash_refunded')::numeric = 250
          and (d -> 'live' ->> 'payments_count')::integer = 0 and (d -> 'live' ->> 'reversals_count')::integer = 1
     from public.cash_session_detail(:'s2') d),
  'el reembolso sale de la caja del turno en que se hace: fondo 300 − 250 = $50');
select (public.close_cash_session(:'s2', pg_temp.sv(:'s2'), gen_random_uuid(), 50)).id as c2 \gset
select pg_temp.assert(
  (select difference = 0 and expected_cash = 50 from public.cash_closings where id = :'c2'),
  'cierre cuadrado del segundo turno (sin nota)');
reset role;

-- ---------------------------------------------------------------------------
-- Reapertura: sólo admin, con motivo, auditada; nueva versión del cierre
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.reopen_cash_session('$$ || :'s1' || $$', pg_temp.sv('$$ || :'s1' || $$'),
  'Recontar')$$, '42501', 'el encargado no reabre un corte');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert_fails($$select public.reopen_cash_session('$$ || :'s1' || $$', pg_temp.sv('$$ || :'s1' || $$'),
  'Recontar')$$, '42501', 'el contador no reabre un corte');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert_fails($$select public.reopen_cash_session('$$ || :'s1' || $$', pg_temp.sv('$$ || :'s1' || $$'),
  '')$$, '22023', 'la reapertura exige motivo');
select from public.reopen_cash_session(:'s1', pg_temp.sv(:'s1'), 'Se encontraron $50 en el cajón de monedas');
select pg_temp.assert(
  (select status = 'reabierta' and closed_at is null and window_end is not null and closings_count = 1
     from public.cash_sessions where id = :'s1')
  and (select reason = 'Se encontraron $50 en el cajón de monedas' and closing_id = :'c1'
          and reopened_by = '00000000-0000-0000-0000-0000000000a1'
         from public.cash_reopenings where session_id = :'s1'),
  'el admin reabre con motivo: queda reabierta, conserva su ventana y la reapertura apunta al cierre');
select pg_temp.assert_fails($$select public.reopen_cash_session('$$ || :'s1' || $$', pg_temp.sv('$$ || :'s1' || $$'),
  'Otra vez')$$, '22023', 'sólo se reabre un corte cerrado');
select (public.close_cash_session(:'s1', pg_temp.sv(:'s1'), gen_random_uuid(), 1750, 'Recuento tras reapertura')).id as c1b \gset
select pg_temp.assert(
  (select sequence = 2 and expected_cash = 1750 and counted_cash = 1750 and difference = 0
     from public.cash_closings where id = :'c1b')
  and (select counted_cash = 1700 and difference = -50 from public.cash_closings where id = :'c1')
  and (select status = 'cerrada' and closings_count = 2 from public.cash_sessions where id = :'s1'),
  'volver a cerrar crea la versión 2 con el mismo esperado; la versión 1 se conserva');
select pg_temp.assert(
  (select jsonb_array_length(d -> 'closings') = 2 and jsonb_array_length(d -> 'reopenings') = 1
          and (d -> 'live' ->> 'expected_cash')::numeric = 1750
     from public.cash_session_detail(:'s1') d)
  and (select closings_count = 2 and reopenings_count = 1 and counted_cash = 1750 and difference = 0
         from public.list_cash_sessions(array[:'A'::uuid], :'today', :'today') where id = :'s1'),
  'la ficha muestra ambas versiones y la reapertura; el listado, la vigente');
reset role;
select pg_temp.assert(
  exists (select 1 from public.audit_log where table_name = 'public.cash_reopenings' and action = 'INSERT'
            and actor_id = '00000000-0000-0000-0000-0000000000a1'
            and reason = 'Se encontraron $50 en el cajón de monedas')
  and exists (select 1 from public.audit_log where event = 'cash_session.reopened' and record_id = :'s1'
                and actor_id = '00000000-0000-0000-0000-0000000000a1')
  and exists (select 1 from public.audit_log where table_name = 'public.cash_sessions' and action = 'UPDATE'
                and record_id = :'s1' and old_data ->> 'status' = 'cerrada' and new_data ->> 'status' = 'reabierta'),
  'la reapertura queda auditada: actor, fecha, motivo y valores anterior y nuevo');

-- El contador consulta pero no opera.
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(
  (select count(*) from public.list_cash_sessions(array[:'A'::uuid], :'today', :'today')) = 2
  and (select count(*) from public.cash_closings where detail_center_id = :'A') = 3,
  'el contador consulta los cortes y sus versiones');
reset role;

rollback;
