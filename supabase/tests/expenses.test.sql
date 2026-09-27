-- Pruebas de AF2: egresos y costos. Categorías mapeadas al P&L, proveedores,
-- umbral de aprobación, captura, edición y anulación con auditoría,
-- comprobantes en Storage privado con permisos, filtros y hechos del P&L sin
-- doble conteo (insumos fuera del P&L; costo directo desde la OS).
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

create function pg_temp.ev(p_id uuid) returns integer language sql security definer as $$
  select version from public.expenses where id = p_id
$$;
create function pg_temp.ov(p_id uuid) returns integer language sql security definer as $$
  select version from public.service_orders where id = p_id
$$;
create function pg_temp.cat(p_code text) returns uuid language sql security definer as $$
  select id from public.expense_categories where organization_id = '0e000000-0000-0000-0000-000000000001' and code = p_code
$$;
create function pg_temp.events(p_id uuid) returns text language sql security definer as $$
  select string_agg(kind, ',' order by id) from public.approval_events where expense_id = p_id
$$;

grant execute on all functions in schema pg_temp to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@org'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@a'),
  ('00000000-0000-0000-0000-0000000000b1', 'comercial@a'),
  ('00000000-0000-0000-0000-0000000000c1', 'contador@a'),
  ('00000000-0000-0000-0000-0000000000e1', 'encargado@a'),
  ('00000000-0000-0000-0000-0000000000e2', 'encargado@b'),
  ('00000000-0000-0000-0000-0000000000f1', 'operador@a');
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-0000-0000-000000000001', 'org-uno', 'Organización Uno'),
  ('0e000000-0000-0000-0000-000000000002', 'org-dos', 'Organización Dos');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'A-01', 'Centro A', 'America/Mexico_City'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '0e000000-0000-0000-0000-000000000001', 'B-01', 'Centro B', 'America/Mexico_City');
insert into public.role_assignments (organization_id, user_id, role) values
  ('0e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin_socio');
insert into public.user_detail_centers (detail_center_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', 'admin_socio'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'comercial_b2b'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'contador'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e1', 'encargado'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000e2', 'encargado'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'operador_recepcion');

select private.center_today('aaaaaaaa-0000-0000-0000-000000000000') as today \gset
\set A 'aaaaaaaa-0000-0000-0000-000000000000'
\set B 'bbbbbbbb-0000-0000-0000-000000000000'
\set ORG '0e000000-0000-0000-0000-000000000001'

-- ---------------------------------------------------------------------------
-- Categorías mapeadas al P&L
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select string_agg(code || ':' || pnl_group, ',' order by position) from public.expense_categories
    where organization_id = :'ORG')
    = 'insumos:insumos,subcontratos:costo_directo,nomina:personal,renta:operativo,servicios:operativo,'
      'mantenimiento:operativo,administracion:administrativo,marketing:marketing,'
      'comisiones_bancarias:financiero,otros:otros'
  and pg_temp.n($$select 1 from public.expense_categories where organization_id = '0e000000-0000-0000-0000-000000000002'$$) = 10,
  'cada organización nace con las categorías mínimas mapeadas a grupos del P&L');

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.upsert_expense_category('0e000000-0000-0000-0000-000000000001', null,
  'fletes', 'Fletes', 'costo_directo', null, 25::smallint, true, 'Nueva categoría')$$, '42501',
  'el encargado no edita el catálogo de categorías');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.upsert_expense_category(:'ORG', null, 'Fletes', 'Fletes y mensajería', 'costo_directo', null,
  25::smallint, true, 'Nueva categoría')).id as fletes \gset
select pg_temp.assert_fails($$select public.upsert_expense_category('0e000000-0000-0000-0000-000000000001', null,
  'raro', 'Raro', 'impuestos', null, 26::smallint, true, 'Nueva categoría')$$, '23514',
  'el grupo del P&L es uno de los definidos');
select from public.upsert_expense_category(:'ORG', pg_temp.cat('otros'), 'otros', 'Otros egresos', 'otros', null,
  90::smallint, false, 'Se desactiva');
reset role;
select pg_temp.assert(
  (select code = 'fletes' and pnl_group = 'costo_directo' from public.expense_categories where id = :'fletes'),
  'el admin corporativo agrega categorías (clave normalizada) y desactiva otras');

-- ---------------------------------------------------------------------------
-- Proveedores y umbral
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select (public.upsert_vendor(:'A', null, 'Químicos del Centro', 'qce010101ab1', '+525511112222', 'ventas@qce.mx')).id
  as qce \gset
select (public.upsert_vendor(:'A', null, 'Inmobiliaria Sur')).id as landlord \gset
select pg_temp.assert_fails($$select public.upsert_vendor('aaaaaaaa-0000-0000-0000-000000000000', null, ' químicos del centro ')$$,
  '23505', 'sin proveedores duplicados por nombre');
select pg_temp.assert_fails($$select public.set_expense_approval_threshold('aaaaaaaa-0000-0000-0000-000000000000', 5000, 'Política')$$,
  '42501', 'el encargado no fija el umbral de aprobación');
reset role;
select pg_temp.assert((select rfc = 'QCE010101AB1' from public.vendors where id = :'qce'), 'proveedor con RFC normalizado');
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert_fails($$select public.upsert_vendor('aaaaaaaa-0000-0000-0000-000000000000', null, 'Otro')$$,
  '42501', 'el contador no da de alta proveedores');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select from public.set_expense_approval_threshold(:'A', 5000, 'Política de aprobación');
reset role;

-- ---------------------------------------------------------------------------
-- Captura, aprobación, rechazo, edición y anulación
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select (public.create_expense(:'A', '50000000-0000-4000-8000-000000000001', pg_temp.cat('renta'), :'landlord',
  'Renta de septiembre', 4000, 'transferencia', :'today'::date, 'SPEI-1')).id as rent \gset
select pg_temp.assert(
  (select folio = 'A-01-E-000001' and status = 'aprobado' and pnl_group = 'operativo' and not requires_approval
          and approved_by = '00000000-0000-0000-0000-0000000000e1' from public.expenses where id = :'rent')
  and pg_temp.events(:'rent') is null,
  'bajo el umbral: folio del centro, aprobado sin flujo y clasificado como operativo');
select pg_temp.assert(
  (public.create_expense(:'A', '50000000-0000-4000-8000-000000000001', pg_temp.cat('renta'), :'landlord',
     'Renta de septiembre', 4000, 'transferencia', :'today'::date)).id = :'rent',
  'idempotente: el reintento devuelve el mismo egreso');
select pg_temp.assert_fails($$select public.create_expense('aaaaaaaa-0000-0000-0000-000000000000', gen_random_uuid(),
  pg_temp.cat('renta'), null, 'Renta', 100, 'efectivo', current_date + 30)$$, '22023', 'sin fechas futuras');
select pg_temp.assert_fails($$select public.create_expense('aaaaaaaa-0000-0000-0000-000000000000', gen_random_uuid(),
  pg_temp.cat('renta'), null, 'Renta', 0, 'efectivo', current_date - 1)$$, '22023', 'importe mayor que cero');
select pg_temp.assert_fails($$select public.create_expense('aaaaaaaa-0000-0000-0000-000000000000', gen_random_uuid(),
  pg_temp.cat('otros'), null, 'Varios', 10, 'efectivo', current_date - 1)$$, '22023', 'categoría inactiva no se usa');
select pg_temp.assert_fails($$select public.create_expense('aaaaaaaa-0000-0000-0000-000000000000', gen_random_uuid(),
  (select id from public.expense_categories where organization_id = '0e000000-0000-0000-0000-000000000002' limit 1),
  null, 'Otra org', 10, 'efectivo', current_date - 1)$$, '22023', 'categoría de otra organización no se usa');
select pg_temp.assert_fails($$select public.create_expense('aaaaaaaa-0000-0000-0000-000000000000', gen_random_uuid(),
  pg_temp.cat('renta'), null, 'Renta', 10, 'bitcoin', current_date - 1)$$, '22023', 'forma de pago válida');

-- Sobre el umbral: pendiente; sólo el admin aprueba.
select (public.create_expense(:'A', gen_random_uuid(), pg_temp.cat('nomina'), null, 'Nómina quincena 1',
  8000, 'transferencia', :'today'::date)).id as payroll \gset
select pg_temp.assert(
  (select status = 'pendiente' and requires_approval and approved_at is null from public.expenses where id = :'payroll')
  and pg_temp.events(:'payroll') = 'solicitada',
  'sobre el umbral ($5,000): queda pendiente de aprobación');
select pg_temp.assert_fails($$select public.approve_expense('$$ || :'payroll' || $$', 1)$$, '42501',
  'el encargado no aprueba');
select (public.create_expense(:'A', gen_random_uuid(), pg_temp.cat('mantenimiento'), null, 'Compresor nuevo',
  6000, 'tarjeta', :'today'::date)).id as compressor \gset
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select from public.approve_expense(:'payroll', pg_temp.ev(:'payroll'), 'Nómina validada');
select pg_temp.assert_fails($$select public.reject_expense('$$ || :'compressor' || $$', 1, '')$$, '22023',
  'rechazar exige motivo');
select from public.reject_expense(:'compressor', pg_temp.ev(:'compressor'), 'Pedir otra cotización');
select pg_temp.assert_fails($$select public.approve_expense('$$ || :'compressor' || $$', pg_temp.ev('$$ || :'compressor' || $$'))$$,
  '22023', 'sólo se aprueba un pendiente');
select (public.create_expense(:'A', gen_random_uuid(), pg_temp.cat('subcontratos'), null, 'Pintura subcontratada',
  9000, 'transferencia', :'today'::date)).id as subcontract \gset
reset role;
select pg_temp.assert(
  (select status = 'aprobado' and approved_by = '00000000-0000-0000-0000-0000000000a2' from public.expenses where id = :'payroll')
  and pg_temp.events(:'payroll') = 'solicitada,aprobada'
  and (select status = 'rechazado' from public.expenses where id = :'compressor')
  and pg_temp.events(:'compressor') = 'solicitada,rechazada'
  and (select status = 'aprobado' from public.expenses where id = :'subcontract')
  and pg_temp.events(:'subcontract') = 'solicitada,autoaprobada',
  'el admin aprueba y rechaza con historial; lo que captura el admin queda autoaprobado y registrado');

-- Edición con motivo y reevaluación.
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.update_expense('$$ || :'compressor' || $$', pg_temp.ev('$$ || :'compressor' || $$'),
  pg_temp.cat('mantenimiento'), null, 'Compresor usado', 4500, 'tarjeta', current_date - 1, null, null, '')$$,
  '22023', 'editar exige motivo');
select pg_temp.assert_fails($$select public.update_expense('$$ || :'compressor' || $$', 1,
  pg_temp.cat('mantenimiento'), null, 'Compresor usado', 4500, 'tarjeta', current_date - 1, null, null, 'Otra cotización')$$,
  '40001', 'versión vieja: no se pisa otra edición');
select from public.update_expense(:'compressor', pg_temp.ev(:'compressor'), pg_temp.cat('mantenimiento'), :'qce',
  'Compresor usado', 4500, 'tarjeta', :'today'::date, null, null, 'Otra cotización más barata');
select from public.update_expense(:'rent', pg_temp.ev(:'rent'), pg_temp.cat('renta'), :'landlord',
  'Renta de septiembre y octubre', 7000, 'transferencia', :'today'::date, 'SPEI-1', null, 'Se pagaron dos meses');
select pg_temp.assert_fails($$select public.void_expense('$$ || :'payroll' || $$', pg_temp.ev('$$ || :'payroll' || $$'), 'Duplicado')$$,
  '42501', 'el encargado no anula un egreso aprobado');
reset role;
select pg_temp.assert(
  (select status = 'aprobado' and amount = 4500 and vendor_id = :'qce' from public.expenses where id = :'compressor')
  and pg_temp.events(:'compressor') = 'solicitada,rechazada,editada'
  and (select status = 'pendiente' and amount = 7000 from public.expenses where id = :'rent')
  and pg_temp.events(:'rent') = 'editada,solicitada',
  'un rechazado corregido bajo el umbral se aprueba; subir un aprobado sobre el umbral lo regresa a pendiente');
select pg_temp.assert(
  exists (select 1 from public.audit_log where table_name = 'public.expenses' and action = 'UPDATE'
            and reason = 'Se pagaron dos meses' and (old_data ->> 'amount')::numeric = 4000
            and (new_data ->> 'amount')::numeric = 7000 and actor_id = '00000000-0000-0000-0000-0000000000e1'),
  'la edición queda auditada: actor, valores anterior y nuevo, y motivo');

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select from public.approve_expense(:'rent', pg_temp.ev(:'rent'));
select (public.create_expense(:'A', gen_random_uuid(), pg_temp.cat('marketing'), null, 'Volantes',
  800, 'efectivo', :'today'::date)).id as flyers \gset
select from public.void_expense(:'flyers', pg_temp.ev(:'flyers'), 'Capturado en el centro equivocado');
select pg_temp.assert_fails($$select public.update_expense('$$ || :'flyers' || $$', pg_temp.ev('$$ || :'flyers' || $$'),
  pg_temp.cat('marketing'), null, 'Volantes', 900, 'efectivo', current_date - 1, null, null, 'Corrige')$$,
  '22023', 'un egreso anulado ya no se edita');
reset role;
select pg_temp.assert(
  (select status = 'anulado' and void_reason = 'Capturado en el centro equivocado' and voided_by = '00000000-0000-0000-0000-0000000000a2'
     from public.expenses where id = :'flyers')
  and pg_temp.events(:'flyers') = 'anulada'
  and exists (select 1 from public.audit_log where table_name = 'public.expenses' and record_id = :'flyers'
                and reason = 'Capturado en el centro equivocado'),
  'anulación con motivo, actor y fecha; auditada');

-- Insumos: salida de caja, fuera del P&L.
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select (public.create_expense(:'A', gen_random_uuid(), pg_temp.cat('insumos'), :'qce', 'Shampoo y cera (galones)',
  2500, 'efectivo', :'today'::date)).id as supplies \gset
select from public.create_expense(:'A', gen_random_uuid(), pg_temp.cat('nomina'), null, 'Nómina quincena 2',
  8000, 'transferencia', :'today'::date);
select pg_temp.assert_fails($$update public.expenses set amount = 1 where id = '$$ || :'rent' || $$'$$, '42501',
  'los egresos no se editan desde la API');
select pg_temp.assert_fails($$delete from public.approval_events$$, '42501', 'el historial no se borra desde la API');
reset role;
select pg_temp.assert_fails($$delete from public.expenses where id = '$$ || :'rent' || $$'$$, '42501',
  'un egreso no se borra ni siquiera por el dueño de la base');
select pg_temp.assert_fails($$update public.approval_events set note = 'x'$$, '42501',
  'el historial de aprobación es inmutable');

-- Reclasificar la categoría no reescribe la historia.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select from public.upsert_expense_category(:'ORG', pg_temp.cat('renta'), 'renta', 'Renta', 'administrativo', null,
  40::smallint, true, 'Se reclasifica la renta');
reset role;
select pg_temp.assert((select pnl_group = 'operativo' from public.expenses where id = :'rent'),
  'reclasificar una categoría no cambia el grupo congelado de los egresos existentes');

-- ---------------------------------------------------------------------------
-- Comprobantes en Storage privado
-- ---------------------------------------------------------------------------
select :'ORG' || '/' || :'A' || '/' || :'supplies' as prefix \gset
select :'prefix' || '/aaaaaaaa-2222-4222-8222-000000000001.pdf' as pdf \gset
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
insert into storage.objects (bucket_id, name) values ('expense-receipts', :'pdf');
select (public.register_expense_attachment(:'supplies', :'pdf', 'application/pdf', 350000, 'factura.pdf')).id as att \gset
select pg_temp.assert(
  (select content_type = 'application/pdf' and file_name = 'factura.pdf' from public.expense_attachments where id = :'att')
  and (public.register_expense_attachment(:'supplies', :'pdf', 'application/pdf', 350000)).id = :'att',
  'el encargado sube y registra el comprobante PDF (idempotente por ruta)');
select pg_temp.assert_fails($$insert into storage.objects (bucket_id, name) values ('expense-receipts', '$$ || :'prefix' || $$/../x.pdf')$$,
  '42501', 'rutas arbitrarias rechazadas');
select pg_temp.assert_fails($$insert into storage.objects (bucket_id, name) values ('expense-receipts',
  '0e000000-0000-0000-0000-000000000001/bbbbbbbb-0000-0000-0000-000000000000/$$ || :'supplies' || $$/aaaaaaaa-2222-4222-8222-000000000002.jpg')$$,
  '42501', 'no se sube a una ruta que no corresponde al centro del egreso');
select pg_temp.assert_fails($$insert into storage.objects (bucket_id, name) values ('expense-receipts',
  '$$ || :'ORG' || '/' || :'A' || '/' || :'flyers' || $$/aaaaaaaa-2222-4222-8222-000000000003.jpg')$$,
  '42501', 'no se suben comprobantes a un egreso anulado');
select pg_temp.assert_fails($$select public.register_expense_attachment('$$ || :'supplies' || $$',
  '$$ || :'prefix' || $$/aaaaaaaa-2222-4222-8222-000000000009.jpg', 'image/jpeg', 1000)$$,
  '22023', 'no se registra un comprobante sin archivo subido');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(
  pg_temp.n($$select 1 from storage.objects where bucket_id = 'expense-receipts'$$) = 1
  and pg_temp.n($$select 1 from public.expense_attachments$$) = 1
  and pg_temp.n($$select 1 from public.expenses$$) = 7
  and (public.expense_detail(:'supplies') -> 'attachments' -> 0 ->> 'file_name') = 'factura.pdf',
  'el contador consulta egresos y comprobantes de su centro');
select pg_temp.assert_fails($$insert into storage.objects (bucket_id, name) values ('expense-receipts',
  '$$ || :'prefix' || $$/aaaaaaaa-2222-4222-8222-000000000004.jpg')$$, '42501', 'el contador no sube comprobantes');
select pg_temp.assert_fails($$select public.create_expense('aaaaaaaa-0000-0000-0000-000000000000', gen_random_uuid(),
  pg_temp.cat('marketing'), null, 'Algo', 10, 'efectivo', current_date - 1)$$, '42501', 'el contador no captura egresos');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select pg_temp.assert(
  pg_temp.n($$select 1 from storage.objects where bucket_id = 'expense-receipts'$$) = 0
  and pg_temp.n($$select 1 from public.expenses$$) = 0
  and pg_temp.n($$select 1 from public.expense_attachments$$) = 0
  and pg_temp.n($$select 1 from public.approval_events$$) = 0
  and public.expense_detail(:'supplies') is null
  and pg_temp.n($$select 1 from public.pnl_facts(array['aaaaaaaa-0000-0000-0000-000000000000'::uuid], current_date - 30, current_date)$$) = 0,
  'el encargado de B no ve egresos, comprobantes, historial ni P&L de A');
select pg_temp.assert(pg_temp.n($$select 1 from public.vendors$$) = 2,
  'los proveedores son de la organización: el encargado de B los reutiliza');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.expenses$$) = 0 and pg_temp.n($$select 1 from storage.objects where bucket_id = 'expense-receipts'$$) = 0,
  'recepción no ve egresos ni comprobantes');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert(pg_temp.n($$select 1 from public.expenses$$) = 0 and pg_temp.n($$select 1 from public.vendors$$) = 0,
  'el comercial no ve egresos ni proveedores');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert_fails($$select public.remove_expense_attachment('$$ || :'att' || $$', '')$$, '22023',
  'retirar un comprobante exige motivo');
select from public.remove_expense_attachment(:'att', 'Se subió la factura de otro egreso');
select pg_temp.assert(
  (public.expense_detail(:'supplies') -> 'attachments') = '[]'::jsonb
  and pg_temp.n($$select 1 from storage.objects where bucket_id = 'expense-receipts'$$) = 1,
  'retirar oculta el comprobante del egreso y conserva el archivo para auditoría');
reset role;

-- ---------------------------------------------------------------------------
-- Filtros
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select pg_temp.assert(
  pg_temp.n($$select 1 from public.list_expenses(array['aaaaaaaa-0000-0000-0000-000000000000'::uuid], current_date - 30, current_date + 1)$$) = 7
  and (select string_agg(folio, ',' order by folio) from public.list_expenses(array[:'A'::uuid], :'today'::date - 30, :'today'::date,
         pg_temp.cat('nomina'))) = 'A-01-E-000002,A-01-E-000007'
  and (select string_agg(concept, ',') from public.list_expenses(array[:'A'::uuid], :'today'::date - 30, :'today'::date,
         null, :'qce')) is not null
  and pg_temp.n($$select 1 from public.list_expenses(array['aaaaaaaa-0000-0000-0000-000000000000'::uuid], current_date - 30, current_date + 1,
         null, '$$ || :'qce' || $$')$$) = 2
  and pg_temp.n($$select 1 from public.list_expenses(array['aaaaaaaa-0000-0000-0000-000000000000'::uuid], current_date - 30, current_date + 1,
         null, null, 'anulado')$$) = 1
  and pg_temp.n($$select 1 from public.list_expenses(array['aaaaaaaa-0000-0000-0000-000000000000'::uuid], current_date - 30, current_date + 1,
         null, null, null, 'insumos')$$) = 1
  and pg_temp.n($$select 1 from public.list_expenses(array['aaaaaaaa-0000-0000-0000-000000000000'::uuid], current_date - 60, current_date - 31)$$) = 0
  and pg_temp.n($$select 1 from public.list_expenses(array['bbbbbbbb-0000-0000-0000-000000000000'::uuid], current_date - 30, current_date + 1)$$) = 0,
  'filtros por centro, fecha, categoría, proveedor, estado y grupo del P&L');
reset role;

-- ---------------------------------------------------------------------------
-- P&L: una OS entregada, una membresía vendida y los egresos
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select (public.create_service(:'ORG', 'LAV', 'Lavado', null, 'recurrente', 40, 250, 80)).id as lav \gset
select (public.upsert_membership_plan(:'ORG', null, 'CARE', 'care', 'Care', null, 449, 1::smallint, 'centro_origen', null,
  7::smallint, null, null, true, 'Alta del plan')).id as care \gset
select from public.set_membership_benefit(:'care', :'lav', 2::smallint, null, 'Beneficio del plan');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select (public.create_client(:'A', '10000000-0000-4000-8000-000000000001', 'Ana Ruiz', '5511112222', null, 'person', null,
  '{}', 'web', '[{"make":"Kia","model":"Rio","year":2022,"plate":"ANA0001"}]'::jsonb)).id as ana \gset
select id as ana_car from public.vehicles where plate = 'ANA0001' \gset
select (public.create_service_order(:'A', gen_random_uuid(), :'ana', :'ana_car',
  jsonb_build_array(jsonb_build_object('service_id', :'lav', 'quantity', 2)))).id as os \gset
select from public.set_service_order_status(:'os', pg_temp.ov(:'os'), 'autorizada');
select from public.register_payment(:'os', pg_temp.ov(:'os'), gen_random_uuid(), '[{"method":"tarjeta","amount":500}]');
select from public.set_service_order_status(:'os', pg_temp.ov(:'os'), 'en_proceso');
select from public.set_service_order_status(:'os', pg_temp.ov(:'os'), 'terminada');
select from public.set_service_order_status(:'os', pg_temp.ov(:'os'), 'entregada');
select from public.create_membership(:'A', gen_random_uuid(), :'care', :'ana', :'ana_car', null, 'Efectivo');
reset role;
-- Consumo real de insumos por encima del estándar (variación +$10).
insert into public.inventory_items (id, organization_id, code, name, unit, unit_cost)
values ('11100000-0000-4000-8000-000000000001', :'ORG', 'SHAMPOO', 'Shampoo', 'ml', 0.02);
insert into public.service_order_consumptions (organization_id, detail_center_id, service_order_id, item_id, inventory_item_id,
  unit, standard_quantity, actual_quantity, unit_cost)
select :'ORG', :'A', :'os', i.id, '11100000-0000-4000-8000-000000000001', 'ml', 1000, 1500, 0.02
  from public.service_order_items i where i.service_order_id = :'os';

select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
create temp table pnl as select * from public.pnl_facts(array[:'A'::uuid], :'today'::date, :'today'::date);
select pg_temp.assert(
  (select string_agg(section || ':' || item || '=' || amount, ',' order by section, item) from pnl)
    = 'costo_os:estandar=160.00,costo_os:variacion_insumos=10.00,'
      'egreso:costo_directo=9000.00,egreso:insumos=2500.00,egreso:operativo=11500.00,egreso:personal=8000.00,'
      'egreso_pendiente:personal=8000.00,'
      'ingreso:b2c=500.00,ingreso:membresias=449.00',
  'P&L: ventas por canal y membresías; costo de la OS (estándar + variación); egresos aprobados por grupo; pendientes aparte; anulados y rechazados fuera');
select pg_temp.assert(
  (select sum(amount) from pnl where section = 'egreso' and item <> 'insumos')
    = (select sum(amount) from public.expenses where detail_center_id = :'A' and status = 'aprobado' and pnl_group <> 'insumos'),
  'sin doble conteo: la compra de insumos es salida de caja pero no gasto del P&L');
reset role;

rollback;
