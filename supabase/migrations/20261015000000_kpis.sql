-- D2 — Dirección / KPIs de rentabilidad y gestión.
--
-- Registro inicial de KPIs financieros, operativos, comerciales y de cliente
-- sobre el registro de métricas de D1 (una fórmula por métrica; un KPI es una
-- vista de una métrica: valor, por centro, por motor o con canal fijo).
--
-- * Fuentes nuevas en public.dashboard_facts (misma llamada única):
--   - orders: OS entregadas por centro, periodo y canal (vehículos, ventas,
--     productos, minutos estándar y reales, OS con incidencia/retrabajo);
--   - centers: recursos y configuración por centro (bahías y técnicos activos,
--     horas y días operativos, años de vida del LTV);
--   - upsell: public.upsell_metric_facts;
--   - customers: por centro, cliente (llave anónima) y canal: visitas, ventas,
--     costo estándar y si ya tenía visitas antes del periodo.
-- * public.kpi_settings: parámetros gerenciales por organización (vida esperada
--   del cliente para el LTV, horas y días operativos para la capacidad).
--   Los cambia el admin corporativo con motivo y auditoría.
-- * Permisos: orders = pnl.read (misma información que el P&L); upsell =
--   upsell.read; customers = customers.metrics.read (admin, encargado,
--   contador, comercial B2B; sin datos personales).

-- ---------------------------------------------------------------------------
-- 1. Parámetros de los KPIs
-- ---------------------------------------------------------------------------

create table public.kpi_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  -- Vida esperada del cliente para el LTV gerencial (no es una predicción).
  ltv_lifetime_years numeric(4, 2) not null default 3 check (ltv_lifetime_years between 0.5 and 10),
  -- Capacidad: horas operativas por día y días operativos por semana.
  operating_hours_per_day numeric(4, 2) not null default 10 check (operating_hours_per_day between 1 and 24),
  operating_days_per_week smallint not null default 6 check (operating_days_per_week between 1 and 7),
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

create trigger kpi_settings_updated_at before update on public.kpi_settings
  for each row execute function private.set_updated_at();
create trigger kpi_settings_require_reason before insert or update or delete on public.kpi_settings
  for each row execute function private.require_change_reason();
create trigger kpi_settings_audit after insert or update or delete on public.kpi_settings
  for each row execute function private.audit_row();

alter table public.kpi_settings enable row level security;
create policy kpi_settings_select on public.kpi_settings
  for select to authenticated using (private.is_org_member(organization_id));
revoke all on public.kpi_settings from anon;
revoke insert, update, delete, truncate on public.kpi_settings from authenticated;

do $$
begin
  perform set_config('app.change_reason', 'Parámetros iniciales de KPIs', true);
  insert into public.kpi_settings (organization_id) select id from public.organizations on conflict do nothing;
end $$;

-- Parámetros efectivos (valores por defecto si la organización no tiene fila).
create function private.kpi_settings_of(p_organization_id uuid) returns public.kpi_settings
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select s from public.kpi_settings s where s.organization_id = p_organization_id),
    row(p_organization_id, 3, 10, 6, 1, now())::public.kpi_settings);
$$;

-- Admin corporativo: cambia los parámetros con versión y motivo.
create function public.set_kpi_settings(
  p_organization_id uuid,
  p_version integer,
  p_ltv_lifetime_years numeric,
  p_operating_hours_per_day numeric,
  p_operating_days_per_week smallint,
  p_reason text
) returns public.kpi_settings
language plpgsql security definer set search_path = '' as $$
declare
  result public.kpi_settings;
begin
  perform private.set_change_reason(p_reason);
  if not private.has_org_role(p_organization_id, array['admin_socio']::public.app_role[]) then
    raise exception 'Sólo el admin corporativo cambia los parámetros de los KPIs' using errcode = '42501';
  end if;
  insert into public.kpi_settings (organization_id) values (p_organization_id) on conflict do nothing;
  select * into result from public.kpi_settings where organization_id = p_organization_id for update;
  if p_version is null or result.version <> p_version then
    raise exception 'Otro usuario cambió los parámetros; recarga e intenta de nuevo' using errcode = '40001';
  end if;
  update public.kpi_settings
     set ltv_lifetime_years = p_ltv_lifetime_years, operating_hours_per_day = p_operating_hours_per_day,
         operating_days_per_week = p_operating_days_per_week, version = version + 1
   where organization_id = p_organization_id
  returning * into result;
  return result;
exception
  when check_violation or not_null_violation then
    raise exception 'Parámetros inválidos: vida de 0.5 a 10 años, 1 a 24 horas por día y 1 a 7 días por semana'
      using errcode = '22023';
end;
$$;

-- customers.metrics.read: indicadores de clientes sin datos personales.
create function private.can_read_customer_metrics(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_center_role(
    p_detail_center_id, array['admin_socio', 'encargado', 'contador', 'comercial_b2b']::public.app_role[]);
$$;

-- ---------------------------------------------------------------------------
-- 2. Fuentes nuevas en la lectura única de hechos
-- ---------------------------------------------------------------------------

alter table public.metric_registry drop constraint metric_registry_source_check;
alter table public.metric_registry add constraint metric_registry_source_check
  check (source in ('pnl', 'payments', 'pipeline', 'memberships', 'orders', 'upsell', 'customers'));

create or replace function public.dashboard_facts(
  p_sources text[],
  p_detail_center_ids uuid[],
  p_from date,
  p_to date,
  p_grain text
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  perform private.check_pnl_range(p_from, p_to);
  if p_grain is null or p_grain not in ('total', 'dia', 'semana', 'mes') then
    raise exception 'Periodicidad inválida' using errcode = '22023';
  end if;
  if p_grain = 'dia' and p_to - p_from > 92 then
    raise exception 'La serie diaria admite hasta 93 días; usa semanas o meses' using errcode = '22023';
  end if;
  if p_sources is null or cardinality(p_sources) = 0
     or not (p_sources <@ array['pnl', 'payments', 'pipeline', 'memberships', 'orders', 'upsell', 'customers']) then
    raise exception 'Fuente de métricas inválida' using errcode = '22023';
  end if;
  if p_detail_center_ids is null or cardinality(p_detail_center_ids) not between 1 and 50 then
    raise exception 'Elige de 1 a 50 centros' using errcode = '22023';
  end if;

  result := jsonb_build_object('from', p_from, 'to', p_to, 'grain', p_grain);
  if 'pnl' = any (p_sources) then
    result := result || jsonb_build_object('pnl', coalesce((
      select jsonb_agg(jsonb_build_object(
               'detail_center_id', x.detail_center_id, 'bucket', x.bucket, 'section', x.section, 'line', x.line,
               'dimension', x.dimension, 'amount', x.amount, 'movements', x.movements)
             order by x.bucket, x.detail_center_id, x.section, x.line, x.dimension)
        from (select m.detail_center_id, private.dashboard_bucket(m.occurred_on, p_from, p_grain) as bucket,
                     m.section, m.line, m.dimension, sum(m.amount) as amount, count(*)::integer as movements
                from private.pnl_movements(p_detail_center_ids, p_from, p_to) m
               group by 1, 2, 3, 4, 5) x), '[]'::jsonb));
  end if;
  if 'payments' = any (p_sources) then
    result := result || jsonb_build_object('payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'detail_center_id', x.detail_center_id, 'bucket', x.bucket, 'method', x.method,
               'method_name', x.method_name, 'collects_cash', x.collects_cash, 'valid_amount', x.valid_amount,
               'valid_count', x.valid_count, 'reversed_amount', x.reversed_amount,
               'reversed_count', x.reversed_count, 'change_amount', x.change_amount)
             order by x.bucket, x.detail_center_id, x.method)
        from (select f.detail_center_id, private.dashboard_bucket(f.day, p_from, p_grain) as bucket, f.method,
                     f.method_name, f.collects_cash, sum(f.valid_amount) as valid_amount,
                     sum(f.valid_count)::integer as valid_count, sum(f.reversed_amount) as reversed_amount,
                     sum(f.reversed_count)::integer as reversed_count, sum(f.change_amount) as change_amount
                from public.payment_facts(p_detail_center_ids, p_from, p_to) f
               group by 1, 2, 3, 4, 5) x), '[]'::jsonb));
  end if;
  if 'pipeline' = any (p_sources) then
    result := result || jsonb_build_object(
      'pipeline', coalesce((select jsonb_agg(to_jsonb(f)) from public.pipeline_metric_facts(p_detail_center_ids, p_from, p_to) f), '[]'::jsonb),
      'pipeline_stages', coalesce((
        select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind, 'position', s.position,
                                            'probability', s.probability) order by s.position)
          from public.pipeline_stages s
         where s.active
           and s.organization_id in (select c.organization_id from public.detail_centers c
                                      where c.id = any (p_detail_center_ids)
                                        and private.can_read_pipeline_metrics(c.id))), '[]'::jsonb));
  end if;
  if 'memberships' = any (p_sources) then
    result := result || jsonb_build_object('memberships', coalesce((
      select jsonb_agg(to_jsonb(f) - 'membership_id')
        from public.membership_metric_facts(p_detail_center_ids, p_from, p_to) f), '[]'::jsonb));
  end if;
  if 'orders' = any (p_sources) then
    result := result || jsonb_build_object('orders', coalesce((
      with centers as (
        select c.id, c.timezone from public.detail_centers c
         where c.id = any (p_detail_center_ids) and private.can_read_pnl(c.id)
      ), d as (
        select o.id, o.detail_center_id, o.channel::text as channel, o.total, o.estimated_minutes,
               case when o.started_at is not null and o.finished_at > o.started_at
                    then extract(epoch from o.finished_at - o.started_at) / 60 end as actual_minutes,
               private.dashboard_bucket((o.delivered_at at time zone c.timezone)::date, p_from, p_grain) as bucket
          from public.service_orders o join centers c on c.id = o.detail_center_id
         where o.status = 'entregada' and (o.delivered_at at time zone c.timezone)::date between p_from and p_to
      )
      select jsonb_agg(jsonb_build_object(
               'detail_center_id', x.detail_center_id, 'bucket', x.bucket, 'channel', x.channel,
               'orders', x.orders, 'sales', x.sales, 'product_sales', x.product_sales,
               'standard_minutes', x.standard_minutes, 'timed_orders', x.timed_orders,
               'actual_minutes', x.actual_minutes, 'rework_orders', x.rework_orders)
             order by x.bucket, x.detail_center_id, x.channel)
        from (select d.detail_center_id, d.bucket, d.channel, count(*)::integer as orders, sum(d.total) as sales,
                     coalesce(sum((select sum(i.line_subtotal - i.line_discount) from public.service_order_items i
                                    where i.service_order_id = d.id and i.kind = 'producto')), 0) as product_sales,
                     sum(d.estimated_minutes)::integer as standard_minutes,
                     count(d.actual_minutes)::integer as timed_orders,
                     round(coalesce(sum(d.actual_minutes), 0), 2) as actual_minutes,
                     count(*) filter (where exists (select 1 from public.service_order_incidents k
                                                     where k.service_order_id = d.id))::integer as rework_orders
                from d group by 1, 2, 3) x), '[]'::jsonb));
  end if;
  if 'orders' = any (p_sources) or 'customers' = any (p_sources) then
    result := result || jsonb_build_object('centers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'detail_center_id', c.id,
               'bays', (select count(*) from public.bays b where b.detail_center_id = c.id and b.active),
               'technicians', (select count(*) from public.technicians t where t.detail_center_id = c.id and t.active),
               'operating_hours_per_day', s.operating_hours_per_day,
               'operating_days_per_week', s.operating_days_per_week,
               'ltv_lifetime_years', s.ltv_lifetime_years) order by c.id)
        from public.detail_centers c
        cross join lateral private.kpi_settings_of(c.organization_id) s
       where c.id = any (p_detail_center_ids) and private.has_center_role(c.id)), '[]'::jsonb));
  end if;
  if 'upsell' = any (p_sources) then
    result := result || jsonb_build_object('upsell', coalesce((
      select jsonb_agg(to_jsonb(f)) from public.upsell_metric_facts(p_detail_center_ids, p_from, p_to) f), '[]'::jsonb));
  end if;
  if 'customers' = any (p_sources) then
    result := result || jsonb_build_object('customers', coalesce((
      with centers as (
        select c.id, c.timezone from public.detail_centers c
         where c.id = any (p_detail_center_ids) and private.can_read_customer_metrics(c.id)
      ), d as (
        select o.detail_center_id, o.client_id, o.channel::text as channel, o.total, o.cost_total
          from public.service_orders o join centers c on c.id = o.detail_center_id
         where o.status = 'entregada' and (o.delivered_at at time zone c.timezone)::date between p_from and p_to
      )
      select jsonb_agg(jsonb_build_object(
               'detail_center_id', x.detail_center_id, 'client_key', x.client_key, 'channel', x.channel,
               'visits', x.visits, 'sales', x.sales, 'cost', x.cost, 'prior_visit', x.prior_visit)
             order by x.detail_center_id, x.client_key, x.channel)
        from (select d.detail_center_id, md5(d.client_id::text) as client_key, d.channel,
                     count(*)::integer as visits, sum(d.total) as sales, sum(d.cost_total) as cost,
                     exists (select 1 from public.service_orders p join centers c on c.id = p.detail_center_id
                              where p.client_id = d.client_id and p.detail_center_id = d.detail_center_id
                                and p.status = 'entregada'
                                and (p.delivered_at at time zone c.timezone)::date < p_from) as prior_visit
                from d group by d.detail_center_id, d.client_id, d.channel) x), '[]'::jsonb));
  end if;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Métricas nuevas (mismo texto que METRIC_CATALOG de @meguiars/analytics)
-- ---------------------------------------------------------------------------

select private.register_metric('pnl.contribution_margin', 1, 'Margen de contribución',
  'Lo que aportan las OS después de sus costos variables (costo estándar e insumos reales).',
  'currency',
  'Ventas − costo estándar de las OS entregadas − variación real de insumos (sin egresos de costo directo fuera de la OS)',
  'pnl', '{public.service_orders,public.service_order_items,public.service_order_consumptions,public.membership_events,public.b2b_agreements,public.expenses}',
  'pnl.read', '{kpi,timeseries,bars,ranking,distribution}', '{motor}', '{motor}', false);
select private.register_metric('orders.vehicles_served', 1, 'Vehículos atendidos',
  'Visitas terminadas: OS entregadas en el periodo.',
  'count', 'OS entregadas en el periodo (una OS = un vehículo atendido en una visita)',
  'orders', '{public.service_orders}',
  'pnl.read', '{kpi,timeseries,bars,ranking}', '{canal}', '{}', false);
select private.register_metric('orders.avg_ticket', 1, 'Ticket promedio',
  'Venta promedio por OS entregada.',
  'currency', 'Σ total de las OS entregadas ÷ OS entregadas (0 sin OS)',
  'orders', '{public.service_orders}',
  'pnl.read', '{kpi,timeseries,bars,ranking}', '{canal}', '{}', false);
select private.register_metric('orders.product_sales', 1, 'Venta de productos',
  'Productos vendidos dentro de las OS entregadas (no servicios).',
  'currency', 'Σ (subtotal − descuento de línea) de las líneas de tipo producto de las OS entregadas',
  'orders', '{public.service_orders,public.service_order_items}',
  'pnl.read', '{kpi,timeseries,bars,ranking}', '{canal}', '{}', false);
select private.register_metric('ops.occupancy', 1, 'Ocupación',
  'Qué tanto de la capacidad instalada de bahías se usó en servicios entregados.',
  'percent',
  'Minutos estándar de las OS entregadas ÷ (bahías activas × horas operativas por día × 60 × días del periodo × días operativos por semana ÷ 7) × 100',
  'orders', '{public.service_orders,public.bays,public.kpi_settings}',
  'pnl.read', '{kpi,timeseries,bars,ranking}', '{}', '{}', false);
select private.register_metric('ops.avg_duration', 1, 'Duración promedio',
  'Tiempo real de trabajo por OS, del inicio al fin de la ejecución.',
  'minutes', 'Σ minutos entre inicio y fin de trabajo ÷ OS entregadas con ambas marcas (0 sin marcas)',
  'orders', '{public.service_orders}',
  'pnl.read', '{kpi,timeseries,bars}', '{canal}', '{}', false);
select private.register_metric('ops.productivity', 1, 'Productividad por técnico',
  'Vehículos entregados por cada técnico activo del centro.',
  'ratio', 'OS entregadas ÷ técnicos activos de los centros (0 sin técnicos)',
  'orders', '{public.service_orders,public.technicians}',
  'pnl.read', '{kpi,timeseries,bars,ranking}', '{}', '{}', false);
select private.register_metric('ops.rework_rate', 1, 'Retrabajos e incidencias',
  'Porcentaje de OS entregadas que tuvieron una incidencia o un retrabajo.',
  'percent', 'OS entregadas con al menos una incidencia o retrabajo registrado ÷ OS entregadas × 100 (0 sin OS)',
  'orders', '{public.service_orders,public.service_order_incidents}',
  'pnl.read', '{kpi,timeseries,bars,ranking}', '{canal}', '{}', false);
select private.register_metric('upsell.acceptance_rate', 1, 'Tasa de upselling',
  'Porcentaje de sugerencias de venta aceptadas en las OS.',
  'percent', 'Sugerencias aceptadas ÷ sugerencias ofrecidas × 100 (0 sin ofertas)',
  'upsell', '{public.upsell_offers,public.service_order_items,public.service_orders}',
  'upsell.read', '{kpi,bars,ranking}', '{}', '{}', false);
select private.register_metric('membership.renewal_count', 1, 'Renovaciones',
  'Renovaciones de membresía registradas en el periodo.',
  'count', 'Eventos de renovación dentro del rango',
  'memberships', '{public.memberships,public.membership_events,public.membership_redemptions}',
  'memberships.metrics.read', '{kpi,bars}', '{}', '{}', false);
select private.register_metric('membership.cancellation_count', 1, 'Cancelaciones',
  'Membresías canceladas en el periodo (las vencidas sin renovar se cuentan aparte en Bajas).',
  'count', 'Membresías canceladas dentro del rango',
  'memberships', '{public.memberships,public.membership_events,public.membership_redemptions}',
  'memberships.metrics.read', '{kpi,bars}', '{}', '{}', false);
select private.register_metric('customers.recurrence_rate', 1, 'Recurrencia',
  'Porcentaje de clientes atendidos en el periodo que ya habían venido antes al centro.',
  'percent',
  'Clientes con OS entregada en el periodo que ya tenían una OS entregada antes en el mismo centro ÷ clientes con OS entregada en el periodo × 100',
  'customers', '{public.service_orders}',
  'customers.metrics.read', '{kpi,bars,ranking}', '{canal}', '{}', false);
select private.register_metric('customers.visit_frequency', 1, 'Frecuencia de visita',
  'Visitas promedio por cliente atendido en el periodo.',
  'ratio', 'OS entregadas en el periodo ÷ clientes únicos atendidos en el periodo (0 sin clientes)',
  'customers', '{public.service_orders}',
  'customers.metrics.read', '{kpi,bars,ranking}', '{canal}', '{}', false);
select private.register_metric('customers.ltv', 1, 'LTV gerencial',
  'Valor de vida del cliente con una fórmula gerencial explícita y configurable; no es una predicción.',
  'currency',
  '(Σ ventas de OS del periodo ÷ clientes únicos) × (365 ÷ días del periodo) × (1 − costo estándar ÷ ventas) × años de vida esperados (parámetro de la organización; 3 por defecto)',
  'customers', '{public.service_orders,public.kpi_settings}',
  'customers.metrics.read', '{kpi,bars}', '{canal}', '{}', false);

-- ---------------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.kpi_settings_of(uuid)',
    'private.can_read_customer_metrics(uuid)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.set_kpi_settings(uuid, integer, numeric, numeric, smallint, text)',
    'public.dashboard_facts(text[], uuid[], date, date, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
