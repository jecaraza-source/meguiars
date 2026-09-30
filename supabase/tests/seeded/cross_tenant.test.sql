-- Barrido de aislamiento (F5.1) sobre el seed: para CADA tabla de public y CADA
-- función de public ejecutable por `authenticated`, un usuario de otro centro
-- (cada rol de centro, en ambas direcciones CDMX <-> MTY) y un usuario de otra
-- organización intentan leer y modificar datos ajenos. Se exige:
--   * tablas: 0 filas ajenas visibles; UPDATE/DELETE directos no tocan nada;
--     INSERT con el centro/organización ajena falla;
--   * funciones: ninguna fila ajena cambia (huella por tabla antes/después) y el
--     resultado no contiene identificadores ni folios ajenos.
-- Las funciones nuevas entran solas al barrido: no hay lista que mantener,
-- salvo los parámetros que se mapean por nombre (pg_temp.arg_value).
-- Se ejecuta después del seed (scripts/test-db.sh) y todo termina en rollback.
\set ON_ERROR_STOP on
begin;
set local client_min_messages = notice;

create function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLÓ: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- ---------------------------------------------------------------------------
-- Actores. Org demo: CDMX (1111…) y MTY (2222…). Org ajena: centro Z.
-- ---------------------------------------------------------------------------
insert into public.organizations (id, slug, name) values
  ('0e000000-0000-4000-8000-0000000000f5', 'org-ajena', 'Organización ajena');
insert into public.detail_centers (id, organization_id, code, name, timezone) values
  ('33333333-3333-4333-8333-333333333333', '0e000000-0000-4000-8000-0000000000f5', 'GDL-01', 'Centro Z', 'America/Mexico_City');

create temp table actors (uid uuid primary key, label text, org uuid, center uuid, role public.app_role, corporate boolean);
insert into actors
select md5(c.code || r::text)::uuid, c.code || ':' || r::text, c.organization_id, c.id, r, false
  from public.detail_centers c, unnest(enum_range(null::public.app_role)) r
 where c.id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333')
union all
select md5('corp-z-' || r::text)::uuid, 'Z:corporativo:' || r::text, '0e000000-0000-4000-8000-0000000000f5', null, r, true
  from unnest(array['admin_socio', 'contador']::public.app_role[]) r;
insert into auth.users (id, email) select uid, label || '@f51.test' from actors;
insert into public.user_detail_centers (detail_center_id, user_id, role) select center, uid, role from actors where not corporate;
insert into public.role_assignments (organization_id, user_id, role) select org, uid, role from actors where corporate;

-- ---------------------------------------------------------------------------
-- Tenencia de cada tabla: expresión SQL que dice si la fila `x` pertenece al
-- centro %1$L o a la organización %2$L. Se deriva del catálogo: columna propia,
-- o la del padre por la llave foránea a su `id` (las llaves son compuestas con la organización).
-- ---------------------------------------------------------------------------
create temp table tenancy (tbl text primary key, center_cond text, org_cond text);
do $$
declare
  t record;
  fk record;
  cc text;
  oc text;
  cols text[];
  i int;
begin
  for t in select c.oid, c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1 loop
    select array_agg(attname::text) into cols from pg_attribute where attrelid = t.oid and attnum > 0 and not attisdropped;
    cc := case when 'detail_center_id' = any (cols) then 'x.detail_center_id = %1$L'
               when 'home_detail_center_id' = any (cols) then 'x.home_detail_center_id = %1$L' end;
    oc := case when 'organization_id' = any (cols) then 'x.organization_id = %2$L'
               when t.relname = 'organizations' then 'x.id = %2$L' end;
    for fk in
      select a.attname as col, p.relname as parent,
             (select string_agg(pa.attname, ',') from pg_attribute pa where pa.attrelid = p.oid and pa.attname in ('detail_center_id', 'home_detail_center_id', 'organization_id')) as pcols
        from pg_constraint k
        cross join lateral unnest(k.conkey, k.confkey) as u(child_att, parent_att)
        join pg_attribute pa_id on pa_id.attrelid = k.confrelid and pa_id.attnum = u.parent_att and pa_id.attname = 'id'
        join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.child_att
        join pg_class p on p.oid = k.confrelid
       where k.conrelid = t.oid and k.contype = 'f'
         and p.relnamespace = 'public'::regnamespace and p.oid <> t.oid
       order by coalesce(array_position(array['service_orders', 'payments', 'b2b_accounts', 'expenses', 'cash_sessions', 'appointments', 'memberships', 'clients'], p.relname::text), 99), 1
    loop
      if cc is null and fk.pcols like '%detail_center_id%' then
        cc := format('exists (select 1 from public.%I p where p.id = x.%I and p.%s = %%1$L)', fk.parent, fk.col,
                     case when fk.pcols like '%home_detail_center_id%' then 'home_detail_center_id' else 'detail_center_id' end);
      end if;
      if oc is null and fk.pcols like '%organization_id%' then
        oc := format('exists (select 1 from public.%I p where p.id = x.%I and p.organization_id = %%2$L)', fk.parent, fk.col);
      end if;
    end loop;
    if t.relname = 'profiles' then
      oc := 'exists (select 1 from public.user_detail_centers u join public.detail_centers d on d.id = u.detail_center_id where u.user_id = x.id and d.organization_id = %2$L)';
    end if;
    insert into tenancy values (t.relname, cc, oc);
  end loop;
  -- Segundo nivel: hijo de un hijo (asignaciones de pago B2B, reglas de precio del convenio).
  for i in 1..2 loop
    update tenancy tn set center_cond = format('exists (select 1 from public.%I q where q.id = x.%I and (%s))',
                                              d.parent, d.col, replace(pt.center_cond, 'x.', 'q.'))
      from (select c.relname as child, p.relname as parent, a.attname as col
              from pg_constraint k
              cross join lateral unnest(k.conkey, k.confkey) as u(child_att, parent_att)
              join pg_attribute pa_id on pa_id.attrelid = k.confrelid and pa_id.attnum = u.parent_att and pa_id.attname = 'id'
              join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.child_att
              join pg_class c on c.oid = k.conrelid
              join pg_class p on p.oid = k.confrelid
             where k.contype = 'f' and c.relnamespace = 'public'::regnamespace and p.relnamespace = 'public'::regnamespace and p.oid <> c.oid) d
      join tenancy pt on pt.tbl = d.parent and pt.center_cond is not null
     where tn.tbl = d.child and tn.center_cond is null
       and d.parent in ('b2b_payments', 'b2b_invoices', 'b2b_agreements');
  end loop;
end $$;

select pg_temp.assert(not exists (select 1 from tenancy where org_cond is null and tbl not in ('payment_methods', 'metric_registry')),
  'toda tabla de public tiene tenencia (organización o centro), salvo catálogos globales: ' ||
  coalesce((select string_agg(tbl, ', ') from tenancy where org_cond is null and tbl not in ('payment_methods', 'metric_registry')), '-'));

-- Tablas compartidas por diseño dentro de la organización (ADR 0008: el cliente
-- y su vehículo son de la organización; la cuenta B2B, su convenio, contactos,
-- flotilla y tarifas se comparten con los centros del convenio para operar,
-- ADR 0015 (su cartera NO: es del centro gestor, ADR 0022); los umbrales de alerta son configuración corporativa
-- legible en la organización). Para ellas sólo aplica el aislamiento entre organizaciones.
create temp table org_shared (tbl text primary key);
insert into org_shared values ('clients'), ('vehicles'), ('client_centers'), ('b2b_accounts'), ('b2b_agreement_centers'), ('b2b_agreements'), ('b2b_contacts'), ('b2b_vehicles'), ('b2b_price_rules'),
  ('contact_preferences'), ('detail_centers'), ('user_detail_centers'), ('kpi_thresholds');

-- Filas de un centro que otros centros de la organización ven por diseño:
-- la membresía redimible en cualquier centro, con su historial y redenciones (ADR 0013).
create temp table center_shared (tbl text primary key, cond text);
insert into center_shared values
  ('memberships', 'x.redeem_scope = ''cualquier_centro'''),
  ('membership_events', 'exists (select 1 from public.memberships m where m.id = x.membership_id and m.redeem_scope = ''cualquier_centro'')'),
  ('membership_redemptions', 'exists (select 1 from public.memberships m where m.id = x.membership_id and m.redeem_scope = ''cualquier_centro'')');
update tenancy t set center_cond = '(' || t.center_cond || ') and not (' || s.cond || ')' from center_shared s where s.tbl = t.tbl;

-- Huella de las filas de la víctima (centro o, si center es null, organización).
create function pg_temp.fingerprint(center uuid, org uuid) returns table (tbl text, h text) language plpgsql as $$
declare t record;
begin
  for t in select * from tenancy order by 1 loop
    if center is not null and (t.center_cond is null or t.tbl in (select o.tbl from org_shared o)) then continue; end if;
    if center is null and t.org_cond is null then continue; end if;
    tbl := t.tbl;
    execute format('select md5(coalesce(string_agg(x::text, %L order by x::text), %L)) from public.%I x where ',
                   '|', '', t.tbl) || format(coalesce(case when center is null then t.org_cond else t.center_cond end, 'false'), center, org)
      into h;
    return next;
  end loop;
end $$;

-- Identificadores y folios de la víctima que no deben aparecer en ningún resultado.
create function pg_temp.victim_markers(center uuid, org uuid) returns table (marker text) language plpgsql as $$
declare t record; cols text[];
begin
  for t in select * from tenancy order by 1 loop
    if center is not null and (t.center_cond is null or t.tbl in (select o.tbl from org_shared o)) then continue; end if;
    if center is null and t.org_cond is null then continue; end if;
    select array_agg(attname::text) into cols from pg_attribute where attrelid = ('public.' || t.tbl)::regclass and attnum > 0 and not attisdropped;
    if t.tbl not in ('organizations', 'detail_centers') and exists (
         select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = t.tbl and c.column_name = 'id' and c.data_type = 'uuid') then
      return query execute format('select x.id::text from public.%I x where ', t.tbl) || format(case when center is null then t.org_cond else t.center_cond end, center, org);
    end if;
    if 'folio' = any (cols) then
      return query execute format('select x.folio::text from public.%I x where length(x.folio::text) >= 8 and ', t.tbl) || format(case when center is null then t.org_cond else t.center_cond end, center, org);
    end if;
  end loop;
end $$;

-- Valor de prueba para cada parámetro: ids de la víctima mapeados por nombre.
create function pg_temp.victim_id(tbl text, center uuid, org uuid) returns uuid language plpgsql as $$
declare v uuid; t tenancy;
begin
  select * into t from tenancy where tenancy.tbl = victim_id.tbl;
  if t.tbl is null then return gen_random_uuid(); end if;
  execute format('select x.id from public.%I x where ', t.tbl)
       || format(coalesce(case when center is null or t.center_cond is null then t.org_cond else t.center_cond end, 'true'), center, org)
       || ' order by x.id limit 1' into v;
  return coalesce(v, gen_random_uuid());
end $$;

create function pg_temp.param_table(fn text, arg text) returns text language sql immutable as $$
  select case
    when arg in ('p_order_id', 'p_order_ids') then 'service_orders'
    when arg in ('p_client_id', 'p_keep_client_id', 'p_merge_client_id', 'p_referred_by_client_id') then 'clients'
    when arg in ('p_lead_id', 'p_exclude_lead_id') then 'leads'
    when arg = 'p_quote_id' then 'quotes'
    when arg = 'p_conversation_id' then 'conversations'
    when arg = 'p_campaign_id' then 'campaigns'
    when arg = 'p_spend_id' then 'campaign_spend'
    when arg = 'p_channel_account_id' then 'channel_accounts'
    when arg in ('p_account_id', 'p_b2b_account_id') then 'b2b_accounts'
    when arg in ('p_technician_id', 'p_technician_ids') then 'technicians'
    when arg = 'p_expense_id' then 'expenses'
    when arg = 'p_vehicle_id' then 'vehicles'
    when arg = 'p_item_id' then 'service_order_items'
    when arg in ('p_service_id', 'p_service_ids', 'p_source_service_id', 'p_target_service_id', 'p_next_visit_service_id') then 'services'
    when arg = 'p_bay_id' then 'bays'
    when arg = 'p_payment_id' then case when fn like '%b2b%' then 'b2b_payments' else 'payments' end
    when arg = 'p_invoice_id' then 'b2b_invoices'
    when arg = 'p_category_id' then 'expense_categories'
    when arg = 'p_membership_id' then 'memberships'
    when arg = 'p_vendor_id' then 'vendors'
    when arg = 'p_task_id' then 'crm_tasks'
    when arg = 'p_stage_id' then 'pipeline_stages'
    when arg = 'p_rule_id' then case when fn like '%upsell%' then 'upsell_rules' else 'alert_rules' end
    when arg = 'p_session_id' then 'cash_sessions'
    when arg in ('p_plan_id', 'p_target_plan_id') then 'membership_plans'
    when arg = 'p_incident_id' then 'service_order_incidents'
    when arg = 'p_run_id' then 'alert_evaluation_runs'
    when arg = 'p_inventory_item_id' then 'inventory_items'
    when arg = 'p_dashboard_id' then 'dashboard_definitions'
    when arg in ('p_hidden_widget_ids', 'p_widget_order') then 'dashboard_widgets'
    when arg = 'p_appointment_id' then 'appointments'
    when arg = 'p_evidence_id' then 'service_order_evidence'
    when arg = 'p_agreement_id' then 'b2b_agreements'
    when arg = 'p_redemption_id' then 'membership_redemptions'
    when arg = 'p_discount_id' then case when fn like '%quote%' then 'quote_discounts' else 'service_order_discounts' end
    when arg = 'p_opportunity_id' then 'sales_opportunities'
    when arg = 'p_attachment_id' then 'expense_attachments'
    when arg = 'p_id' then case
      when fn like '%opportunit%' then 'sales_opportunities'
      when fn like '%lead_stage%' then 'lead_stages'
      when fn like '%lead%' then 'leads'
      when fn like '%content_post%' then 'content_posts'
      when fn like '%promotion%' then 'promotions'
      when fn like '%campaign%' then 'campaigns'
      when fn like '%quote%' then 'quotes'
      when fn like '%dashboard%' then 'dashboard_definitions'
      when fn like '%kpi_threshold%' then 'kpi_thresholds'
      when fn like '%alert_rule%' then 'alert_rules'
      when fn like '%alert%' then 'alert_instances'
      when fn like '%appointment%' then 'appointments'
      when fn like '%price_rule%' then 'b2b_price_rules'
      when fn like '%b2b_agreement%' then 'b2b_agreements'
      when fn like '%b2b_contact%' then 'b2b_contacts'
      when fn like '%b2b_account%' then 'b2b_accounts'
      when fn like '%client%' then 'clients'
      when fn like '%detail_center%' then 'detail_centers'
      when fn like '%vehicle%' then 'vehicles'
      when fn like '%bay%' then 'bays'
      when fn like '%inventory%' then 'inventory_items'
      when fn like '%membership_plan%' then 'membership_plans'
      when fn like '%pipeline_stage%' then 'pipeline_stages'
      when fn like '%technician%' then 'technicians'
      when fn like '%upsell_rule%' then 'upsell_rules'
      when fn like '%service%' then 'services' end
  end;
$$;

create function pg_temp.arg_value(fn text, arg text, typ regtype, center uuid, org uuid, victim_user uuid) returns text language plpgsql as $$
declare
  tbl text := pg_temp.param_table(fn, arg);
  v text;
begin
  if arg = 'p_request_id' then return quote_literal(gen_random_uuid()) || '::uuid'; end if;
  if arg in ('p_detail_center_id', 'p_home_detail_center_id') then return quote_literal(coalesce(center, (select id from public.detail_centers where organization_id = org order by code limit 1))) || '::uuid'; end if;
  if arg in ('p_detail_center_ids', 'p_center_ids') then
    return 'array[' || (select string_agg(quote_literal(id), ',') from public.detail_centers where id = center or (center is null and organization_id = org)) || ']::uuid[]';
  end if;
  if arg = 'p_organization_id' then return quote_literal(org) || '::uuid'; end if;
  if arg in ('p_user_id', 'p_assigned_to', 'p_owner_id') then return quote_literal(victim_user) || '::uuid'; end if;
  if typ = 'uuid'::regtype then return quote_literal(pg_temp.victim_id(coalesce(tbl, '-'), center, org)) || '::uuid'; end if;
  if typ = 'uuid[]'::regtype then return 'array[' || quote_literal(pg_temp.victim_id(coalesce(tbl, '-'), center, org)) || ']::uuid[]'; end if;
  if arg = 'p_version' then
    -- La versión real de la fila objetivo: así el rechazo viene del permiso, no del control de versiones.
    return coalesce((
      select format('(select coalesce(max(version), 1) from public.%I where id = %L)', pt, pg_temp.victim_id(pt, center, org))
        from (select pg_temp.param_table(fn, a) pt, i from unnest((select proargnames from pg_proc where proname = fn and pronamespace = 'public'::regnamespace limit 1)) with ordinality u(a, i)) s
       where pt is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = pt and column_name = 'version')
       order by i limit 1), '1');
  end if;
  if arg = 'p_items' then
    return quote_literal(jsonb_build_array(jsonb_build_object('service_id', pg_temp.victim_id('services', center, org)))::text) || '::jsonb';
  end if;
  v := case
    when typ in ('integer'::regtype, 'smallint'::regtype, 'bigint'::regtype) then '1'
    when typ = 'numeric'::regtype then '100'
    when typ = 'text'::regtype then quote_literal('auditoría F5.1')
    when typ = 'boolean'::regtype then 'true'
    when typ = 'date'::regtype then 'current_date'
    when typ = 'timestamptz'::regtype then 'now()'
    when typ = 'time without time zone'::regtype then '''10:00''::time'
    when typ = 'jsonb'::regtype then '''{}''::jsonb'
    when typ = 'text[]'::regtype then '''{}''::text[]'
    when typ = 'integer[]'::regtype then '''{}''::integer[]'
    when exists (select 1 from pg_type where oid = typ and typtype = 'e') then
      quote_literal((select enumlabel from pg_enum where enumtypid = typ order by enumsortorder limit 1)) || '::' || typ::text
    else 'null::' || typ::text end;
  return v;
end $$;

-- Violaciones: se acumulan para ver todas en una corrida; la prueba falla al final si hay alguna.
create temp table violations (scenario text, what text);
grant insert on violations to authenticated;
create function pg_temp.violation(scenario text, what text) returns void language plpgsql as $$
begin
  insert into violations values (scenario, what);
  raise notice 'VIOLACIÓN [%] %', scenario, what;
end $$;

-- Ejecuta todas las funciones como `attacker` contra la víctima y valida huellas y resultados.
create temp table sweep_log (scenario text, attacker text, fn text, outcome text);
create function pg_temp.sweep(scenario text, attacker uuid, center uuid, org uuid, victim_user uuid) returns void language plpgsql as $$
declare
  f record;
  base_fp text;
  after_fp text;
  call_args text;
  stmt text;
  res text;
  leaked text;
  changed text;
begin
  if to_regclass('pg_temp.markers') is null then create temp table markers (marker text); end if;
  truncate markers;
  insert into markers select * from pg_temp.victim_markers(center, org);
  if to_regclass('pg_temp.fp_base') is null then create temp table fp_base (tbl text primary key, h text); end if;
  truncate fp_base;
  insert into fp_base select * from pg_temp.fingerprint(center, org);
  base_fp := (select md5(string_agg(tbl || h, '' order by tbl)) from fp_base);

  for f in
    select p.oid, p.proname, p.prorettype, p.proretset,
           coalesce(p.proargnames, '{}') as names,
           (select array_agg(u.t order by u.o) from unnest(p.proargtypes::oid[]) with ordinality u(t, o)) as types, p.pronargs, p.pronargdefaults, p.proargmodes
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
       and p.prorettype <> 'trigger'::regtype
       and has_function_privilege('authenticated', p.oid, 'execute')
     order by p.proname
  loop
    -- Posicional: los argumentos de entrada van primero en proargnames.
    select string_agg(pg_temp.arg_value(f.proname, coalesce(f.names[i], ''), f.types[i]::regtype, center, org, victim_user), ', ' order by i)
      into call_args
      from generate_series(1, f.pronargs) i;
    stmt := case when f.prorettype = 'void'::regtype
                 then format('select null::text from (select public.%I(%s)) s', f.proname, coalesce(call_args, ''))
                 else format('select coalesce(jsonb_agg(to_jsonb(r))::text, %L) from public.%I(%s) r', '[]', f.proname, coalesce(call_args, '')) end;
    res := null;
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', attacker, 'role', 'authenticated')::text, true);
      perform set_config('app.change_reason', '', true);
      execute 'set local role authenticated';
      execute stmt into res;
      execute 'reset role';
      insert into sweep_log values (scenario, attacker::text, f.proname, 'ok');
    exception when others then
      execute 'reset role';
      insert into sweep_log values (scenario, attacker::text, f.proname, sqlstate);
    end;

    select string_agg(m.marker, ', ') into leaked from markers m where res is not null and position(m.marker in res) > 0
       and position(m.marker in stmt) = 0;
    if leaked is not null then
      perform pg_temp.violation(scenario, format('%s expone datos ajenos (%s): %s', f.proname, leaked, left(res, 200)));
    end if;
    select string_agg(n.tbl, ', ') into changed from pg_temp.fingerprint(center, org) n join fp_base b using (tbl) where n.h is distinct from b.h;
    if changed is not null then
      perform pg_temp.violation(scenario, format('%s modificó datos ajenos en %s', f.proname, changed));
      truncate fp_base;
      insert into fp_base select * from pg_temp.fingerprint(center, org);
    end if;
  end loop;
  raise notice '[%] % funciones ejecutadas (% con resultado, % rechazadas)', scenario,
    (select count(*) from sweep_log s where s.scenario = sweep.scenario),
    (select count(*) from sweep_log s where s.scenario = sweep.scenario and s.outcome = 'ok'),
    (select count(*) from sweep_log s where s.scenario = sweep.scenario and s.outcome <> 'ok');
end $$;

-- Lectura y escritura directa sobre tablas (PostgREST) como `attacker`.
create function pg_temp.table_sweep(scenario text, attacker uuid, center uuid, org uuid) returns void language plpgsql as $$
declare
  t record;
  cond text;
  n bigint;
  sample jsonb;
  cols text;
  blocked int := 0;
  tables int := 0;
begin
  for t in select * from tenancy order by 1 loop
    if center is not null and (t.center_cond is null or t.tbl in (select o.tbl from org_shared o)) then continue; end if;
    if center is null and t.org_cond is null then continue; end if;
    cond := format(case when center is null then t.org_cond else t.center_cond end, center, org);
    execute format('select to_jsonb(x) from public.%I x where ', t.tbl) || cond || ' limit 1' into sample;
    tables := tables + 1;

    perform set_config('request.jwt.claims', json_build_object('sub', attacker, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    execute format('select count(*) from public.%I x where ', t.tbl) || cond into n;
    if n > 0 then perform pg_temp.violation(scenario, format('ve %s filas ajenas de %s', n, t.tbl)); end if;
    -- UPDATE y DELETE directos: RLS los deja sin filas (o el privilegio o un trigger los rechaza).
    select format('%1$I = %1$I', column_name) into cols from information_schema.columns
     where table_schema = 'public' and table_name = t.tbl and is_generated = 'NEVER' and identity_generation is null
     order by (column_name = 'id') desc, ordinal_position limit 1;
    begin
      execute format('update public.%I x set %s where ', t.tbl, cols) || cond;
      get diagnostics n = row_count;
    exception when others then n := 0;
    end;
    if n > 0 then perform pg_temp.violation(scenario, format('actualizó %s filas ajenas de %s', n, t.tbl)); end if;
    begin
      execute format('delete from public.%I x where ', t.tbl) || cond;
      get diagnostics n = row_count;
    exception when others then n := 0;
    end;
    if n > 0 then perform pg_temp.violation(scenario, format('borró %s filas ajenas de %s', n, t.tbl)); end if;
    -- INSERT de una copia (id nuevo) con el centro/organización ajena: debe fallar.
    if sample is not null then
      begin
        select string_agg(quote_ident(k), ',') into cols from jsonb_object_keys(sample) k
         where k in (select column_name from information_schema.columns where table_schema = 'public' and table_name = t.tbl and is_generated = 'NEVER' and identity_generation is null);
        if sample ? 'id' then sample := jsonb_set(sample, '{id}', to_jsonb(gen_random_uuid())); end if;
        execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, %L)', t.tbl, cols, cols, t.tbl, sample);
        perform pg_temp.violation(scenario, format('insertó una fila ajena en %s', t.tbl));
      exception when others then
        blocked := blocked + 1;
      end;
    end if;
    execute 'reset role';
  end loop;
  raise notice '[%] % tablas revisadas; % INSERT ajenos rechazados', scenario, tables, blocked;
end $$;

grant execute on all functions in schema pg_temp to authenticated;

-- Víctimas: usuarios sólo de MTY y sólo de CDMX (para parámetros p_user_id).
do $$
declare
  a record;
  demo constant uuid := '00000000-0000-4000-8000-00000000d3e0';
  cdmx constant uuid := '11111111-1111-4111-8111-111111111111';
  mty constant uuid := '22222222-2222-4222-8222-222222222222';
begin
  for a in select * from actors where center in (cdmx, mty) order by label loop
    perform pg_temp.table_sweep(a.label || ' -> otro centro', a.uid, case when a.center = cdmx then mty else cdmx end, demo);
    perform pg_temp.sweep(a.label || ' -> otro centro', a.uid, case when a.center = cdmx then mty else cdmx end, demo,
      (select uid from actors where center = case when a.center = cdmx then mty else cdmx end and role = 'encargado'));
  end loop;
  for a in select * from actors where org <> demo order by label loop
    perform pg_temp.table_sweep(a.label || ' -> otra organización', a.uid, null, demo);
    perform pg_temp.sweep(a.label || ' -> otra organización', a.uid, null, demo,
      (select uid from actors where center = mty and role = 'encargado'));
  end loop;
end $$;

-- Control positivo: el encargado de MTY contra su propio centro SÍ debe
-- disparar ambos detectores (si no, el barrido se volvió ciego).
create temp table control_violations as select * from violations where false;
do $$
declare u uuid := (select uid from actors where center = '22222222-2222-4222-8222-222222222222' and role = 'encargado');
begin
  perform pg_temp.table_sweep('control', u, '22222222-2222-4222-8222-222222222222', '00000000-0000-4000-8000-00000000d3e0');
  perform pg_temp.sweep('control', u, '22222222-2222-4222-8222-222222222222', '00000000-0000-4000-8000-00000000d3e0', u);
  insert into control_violations select * from violations where scenario = 'control';
  delete from violations where scenario = 'control';
  delete from sweep_log where scenario = 'control';
end $$;
select pg_temp.assert(exists (select 1 from control_violations where what like 've %')
                  and exists (select 1 from control_violations where what like '% expone datos ajenos%')
                  and exists (select 1 from control_violations where what like '% modificó datos ajenos%'),
  'control positivo: un usuario legítimo dispara los detectores de lectura, fuga y cambio');

select pg_temp.assert(not exists (select 1 from violations),
  format('%s escenarios x (tablas + funciones): sin filas ajenas visibles, sin cambios ni fugas de datos ajenos%s',
    (select count(distinct scenario) from sweep_log),
    coalesce(' — VIOLACIONES: ' || (select string_agg(distinct what, ' | ') from violations), '')));
select pg_temp.assert((select count(distinct fn) from sweep_log) >= 150,
  format('el barrido cubrió %s funciones públicas', (select count(distinct fn) from sweep_log)));

rollback;
