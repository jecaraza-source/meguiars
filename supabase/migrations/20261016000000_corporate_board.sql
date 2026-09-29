-- D3 — Dirección / Tablero corporativo multicentro y drill-down.
--
-- El tablero predeterminado de Dirección compara centros (1..N) y el
-- consolidado con las métricas registradas de D1/D2 (una sola fórmula por
-- métrica, calculada en @meguiars/analytics). Esta migración agrega sólo lo
-- que el tablero necesita y no existía:
--
-- * private.order_line_facts: líneas de las OS entregadas (servicio o
--   producto, motor, canal, venta neta y costo estándar congelado) más el
--   descuento general de cada OS. Es el mismo criterio que las líneas
--   "ingreso" y "costo estándar" de private.pnl_movements, así que la suma por
--   servicio cuadra con el P&L sin diferencias.
-- * public.dashboard_facts: fuente nueva "services" (ranking de servicios por
--   ingreso y margen, drill-down canal/motor → servicio) y, en los recursos por
--   centro, la fecha de inicio de operación (para decidir si la tendencia contra
--   el periodo anterior es válida).
-- * public.corporate_order_lines: último nivel del drill-down (servicio → OS),
--   con el mismo permiso que el P&L (pnl.read).
-- * public.kpi_thresholds: umbrales de alerta visual por métrica (y canal fijo),
--   para toda la organización o para un centro. Los cambia el admin corporativo
--   con motivo y auditoría; sin notificaciones externas.

-- ---------------------------------------------------------------------------
-- 1. Líneas de las OS entregadas (fuente única para servicios y drill-down)
-- ---------------------------------------------------------------------------

create function private.order_line_facts(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  detail_center_id uuid,
  service_order_id uuid,
  folio text,
  delivered_on date,
  channel text,
  engine text,
  service_id uuid,
  service_name text,
  kind text,
  quantity integer,
  revenue numeric,
  standard_cost numeric
)
language sql stable security definer set search_path = '' as $$
  with centers as (
    select c.id, c.timezone from public.detail_centers c
     where c.id = any (p_detail_center_ids) and private.can_read_pnl(c.id)
  ), delivered as (
    select o.id, o.detail_center_id, o.folio, o.channel::text as channel, o.total,
           (o.delivered_at at time zone c.timezone)::date as day
      from public.service_orders o join centers c on c.id = o.detail_center_id
     where o.status = 'entregada' and (o.delivered_at at time zone c.timezone)::date between p_from and p_to
  )
  -- Cada línea: neto (subtotal − descuento de la línea) y costo estándar congelado.
  select d.detail_center_id, d.id, d.folio, d.day, d.channel, i.revenue_engine::text, i.service_id,
         i.service_name, i.kind, i.quantity, i.line_subtotal - i.line_discount,
         round(i.quantity * i.unit_direct_cost, 2)
    from delivered d join public.service_order_items i on i.service_order_id = d.id
  union all
  -- Descuento general de la OS (no ligado a una línea), igual que en el P&L.
  select d.detail_center_id, d.id, d.folio, d.day, d.channel, 'descuento_os', null,
         'Descuento general de la OS', 'descuento', 0, d.total - x.net, 0
    from delivered d
    cross join lateral (select coalesce(sum(i.line_subtotal - i.line_discount), 0) as net
                          from public.service_order_items i where i.service_order_id = d.id) x
   where d.total <> x.net;
$$;

-- Primer día con actividad del centro (OS entregada, membresía o egreso
-- aprobado), en su zona horaria. null = sin actividad todavía.
create function private.center_first_activity(p_detail_center_id uuid) returns date
language sql stable security definer set search_path = '' as $$
  select least(
    (select min((o.delivered_at at time zone c.timezone)::date) from public.service_orders o
      where o.detail_center_id = c.id and o.status = 'entregada'),
    (select min((e.occurred_at at time zone c.timezone)::date) from public.membership_events e
      where e.detail_center_id = c.id),
    (select min(x.paid_on) from public.expenses x
      where x.detail_center_id = c.id and x.status = 'aprobado'))
    from public.detail_centers c
   where c.id = p_detail_center_id;
$$;

-- ---------------------------------------------------------------------------
-- 2. Último nivel del drill-down: líneas de OS de un servicio / canal / motor
-- ---------------------------------------------------------------------------

create function public.corporate_order_lines(
  p_detail_center_ids uuid[],
  p_from date,
  p_to date,
  p_channel text default null,
  p_engine text default null,
  p_service_id uuid default null
) returns table (
  detail_center_id uuid,
  service_order_id uuid,
  folio text,
  delivered_on date,
  channel text,
  engine text,
  service_id uuid,
  service_name text,
  kind text,
  quantity integer,
  revenue numeric,
  standard_cost numeric
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.check_pnl_range(p_from, p_to);
  if p_detail_center_ids is null or cardinality(p_detail_center_ids) not between 1 and 50 then
    raise exception 'Elige de 1 a 50 centros' using errcode = '22023';
  end if;
  return query
    select l.*
      from private.order_line_facts(p_detail_center_ids, p_from, p_to) l
     where (p_channel is null or l.channel = p_channel)
       and (p_engine is null or l.engine = p_engine)
       and (p_service_id is null or l.service_id = p_service_id)
     order by l.delivered_on, l.folio, l.service_name
     limit 5000;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Fuente "services" y fecha de inicio de operación en la lectura única
-- ---------------------------------------------------------------------------

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
     or not (p_sources <@ array['pnl', 'payments', 'pipeline', 'memberships', 'orders', 'upsell', 'customers',
                                 'services']) then
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
  if 'orders' = any (p_sources) or 'customers' = any (p_sources) or 'services' = any (p_sources) then
    result := result || jsonb_build_object('centers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'detail_center_id', c.id,
               'bays', (select count(*) from public.bays b where b.detail_center_id = c.id and b.active),
               'technicians', (select count(*) from public.technicians t where t.detail_center_id = c.id and t.active),
               'operating_hours_per_day', s.operating_hours_per_day,
               'operating_days_per_week', s.operating_days_per_week,
               'ltv_lifetime_years', s.ltv_lifetime_years,
               'first_activity_on', private.center_first_activity(c.id)) order by c.id)
        from public.detail_centers c
        cross join lateral private.kpi_settings_of(c.organization_id) s
       where c.id = any (p_detail_center_ids) and private.has_center_role(c.id)), '[]'::jsonb));
  end if;
  if 'services' = any (p_sources) then
    result := result || jsonb_build_object('services', coalesce((
      select jsonb_agg(jsonb_build_object(
               'detail_center_id', x.detail_center_id, 'bucket', x.bucket, 'channel', x.channel,
               'engine', x.engine, 'service_id', x.service_id, 'service_name', x.service_name, 'kind', x.kind,
               'quantity', x.quantity, 'orders', x.orders, 'revenue', x.revenue, 'standard_cost', x.standard_cost)
             order by x.bucket, x.detail_center_id, x.channel, x.engine, x.service_name)
        from (select l.detail_center_id, private.dashboard_bucket(l.delivered_on, p_from, p_grain) as bucket,
                     l.channel, l.engine, l.service_id, l.service_name, l.kind,
                     sum(l.quantity)::integer as quantity, count(distinct l.service_order_id)::integer as orders,
                     sum(l.revenue) as revenue, sum(l.standard_cost) as standard_cost
                from private.order_line_facts(p_detail_center_ids, p_from, p_to) l
               group by 1, 2, 3, 4, 5, 6, 7) x), '[]'::jsonb));
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
-- 4. Umbrales de alerta visual
-- ---------------------------------------------------------------------------

create table public.kpi_thresholds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  metric_id text not null references public.metric_registry (id) on delete restrict,
  -- Canal fijo de la tarjeta (p. ej. "Venta B2B" = ventas con canal b2b); null = sin canal.
  channel text check (channel in ('b2c', 'membresia', 'b2b')),
  -- null = aplica a cada centro y al consolidado; un centro = sólo ese centro (pisa al general).
  detail_center_id uuid,
  -- Alerta cuando el valor queda por debajo del mínimo o por encima del máximo.
  min_value numeric(14, 2),
  max_value numeric(14, 2),
  version integer not null default 1 check (version >= 1),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_value is not null or max_value is not null),
  check (min_value is null or max_value is null or min_value < max_value),
  foreign key (organization_id, detail_center_id) references public.detail_centers (organization_id, id)
    on delete cascade,
  constraint kpi_thresholds_scope_key unique nulls not distinct (organization_id, metric_id, channel, detail_center_id)
);
create index kpi_thresholds_metric_idx on public.kpi_thresholds (metric_id);
create index kpi_thresholds_center_idx on public.kpi_thresholds (organization_id, detail_center_id)
  where detail_center_id is not null;
create index kpi_thresholds_created_by_idx on public.kpi_thresholds (created_by);

create trigger kpi_thresholds_updated_at before update on public.kpi_thresholds
  for each row execute function private.set_updated_at();
create trigger kpi_thresholds_require_reason before insert or update or delete on public.kpi_thresholds
  for each row execute function private.require_change_reason();
create trigger kpi_thresholds_audit after insert or update or delete on public.kpi_thresholds
  for each row execute function private.audit_row();

alter table public.kpi_thresholds enable row level security;
create policy kpi_thresholds_select on public.kpi_thresholds
  for select to authenticated using (private.is_org_member(organization_id));
revoke all on public.kpi_thresholds from anon;
revoke insert, update, delete, truncate on public.kpi_thresholds from authenticated;

-- Admin corporativo: crea (p_id null) o cambia un umbral con versión y motivo.
create function public.set_kpi_threshold(
  p_organization_id uuid,
  p_id uuid,
  p_version integer,
  p_metric_id text,
  p_channel text,
  p_detail_center_id uuid,
  p_min_value numeric,
  p_max_value numeric,
  p_reason text
) returns public.kpi_thresholds
language plpgsql security definer set search_path = '' as $$
declare
  result public.kpi_thresholds;
  m public.metric_registry;
begin
  perform private.set_change_reason(p_reason);
  if not private.has_org_role(p_organization_id, array['admin_socio']::public.app_role[]) then
    raise exception 'Sólo el admin corporativo configura los umbrales de alerta' using errcode = '42501';
  end if;
  select * into m from public.metric_registry where id = p_metric_id and active;
  if not found then
    raise exception 'Métrica no registrada' using errcode = '22023';
  end if;
  if p_channel is not null and not ('canal' = any (m.filters)) then
    raise exception 'La métrica % no admite canal fijo', p_metric_id using errcode = '22023';
  end if;
  if p_detail_center_id is not null and not exists (
       select 1 from public.detail_centers c where c.id = p_detail_center_id and c.organization_id = p_organization_id) then
    raise exception 'El centro no pertenece a la organización' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.kpi_thresholds (organization_id, metric_id, channel, detail_center_id, min_value, max_value)
    values (p_organization_id, p_metric_id, p_channel, p_detail_center_id, p_min_value, p_max_value)
    returning * into result;
    return result;
  end if;
  select * into result from public.kpi_thresholds where id = p_id and organization_id = p_organization_id for update;
  if not found then
    raise exception 'El umbral no existe' using errcode = 'P0002';
  end if;
  if p_version is null or result.version <> p_version then
    raise exception 'Otro usuario cambió el umbral; recarga e intenta de nuevo' using errcode = '40001';
  end if;
  update public.kpi_thresholds
     set metric_id = p_metric_id, channel = p_channel, detail_center_id = p_detail_center_id,
         min_value = p_min_value, max_value = p_max_value, version = version + 1
   where id = p_id
  returning * into result;
  return result;
exception
  when unique_violation then
    raise exception 'Ya hay un umbral para esa métrica, canal y centro; edítalo' using errcode = '23505';
  when check_violation or not_null_violation then
    raise exception 'Umbral inválido: indica un mínimo, un máximo o ambos (mínimo menor que máximo)'
      using errcode = '22023';
end;
$$;

create function public.delete_kpi_threshold(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
begin
  perform private.set_change_reason(p_reason);
  select organization_id into org from public.kpi_thresholds where id = p_id;
  if org is null or not private.has_org_role(org, array['admin_socio']::public.app_role[]) then
    raise exception 'Sólo el admin corporativo configura los umbrales de alerta' using errcode = '42501';
  end if;
  delete from public.kpi_thresholds where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.order_line_facts(uuid[], date, date)',
    'private.center_first_activity(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.corporate_order_lines(uuid[], date, date, text, text, uuid)',
    'public.set_kpi_threshold(uuid, uuid, integer, text, text, uuid, numeric, numeric, text)',
    'public.delete_kpi_threshold(uuid, text)',
    'public.dashboard_facts(text[], uuid[], date, date, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
