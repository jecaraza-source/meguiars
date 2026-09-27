-- AF4 — Administración y Finanzas / Centros de costos y P&L multicentro.
--
-- Estado de resultados gerencial por Detail Center y consolidado, rastreable a
-- sus movimientos fuente. Sin tablas nuevas ni vistas materializadas: una sola
-- función (private.pnl_movements) devuelve cada movimiento que explica una
-- cifra, y todo lo demás la agrega:
--   * pnl_lines: el P&L por centro (líneas y motor de ingreso).
--   * pnl_drilldown: los movimientos de una línea (suman exactamente la línea).
--   * pnl_facts (AF2): se redefine sobre los mismos movimientos (mismo contrato).
--
-- Diccionario (ver docs/modules/pnl.md y ADR 0021):
-- * Venta: se reconoce con la OS ENTREGADA (fecha de entrega en el calendario del
--   centro), por su total (con descuentos autorizados). Los cobros NO son venta.
--   Se desglosa por línea (neto de la línea, por motor de ingreso) más el
--   descuento general de la OS; por canal suma el total de las OS.
-- * Venta de membresías: altas y renovaciones cobradas (fecha del evento).
-- * Cuotas B2B: devengadas (paquete al iniciar; iguala por mes iniciado dentro
--   de la vigencia y hasta hoy), en el centro gestor de la cuenta.
-- * Costo directo: costo estándar congelado de las líneas de esas OS + variación
--   real de insumos + egresos aprobados del grupo costo_directo.
-- * Gastos: egresos aprobados por grupo (fecha del pago). La compra de insumos y
--   los egresos pendientes quedan fuera del P&L (se reportan aparte).

-- ---------------------------------------------------------------------------
-- 1. Permisos
-- ---------------------------------------------------------------------------

-- pnl.read: P&L del centro y su drill-down (admin, encargado, contador).
create function private.can_read_pnl(p_detail_center_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_read_expenses(p_detail_center_id);
$$;

-- Periodo válido: hasta ~3 años (evita consultas desbocadas).
create function private.check_pnl_range(p_from date, p_to date) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Periodo inválido: la fecha final debe ser igual o posterior a la inicial' using errcode = '22023';
  end if;
  if p_to - p_from > 1100 then
    raise exception 'El periodo no puede exceder 3 años' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Movimientos fuente
-- ---------------------------------------------------------------------------

-- Cada fila explica una parte de una cifra del P&L.
-- * section: ingreso | costo_directo | gasto | fuera_pnl
-- * line: ingreso → b2c, membresia, b2b (OS por canal), membresias, cuotas_b2b;
--         costo_directo → estandar, variacion_insumos, egresos_costo_directo;
--         gasto → personal, operativo, administrativo, marketing, otros, financiero;
--         fuera_pnl → insumos (compra, salida de caja), pendiente (por aprobar).
-- * dimension: motor de ingreso de la línea de la OS (o descuento_os, membresia,
--   cuota_b2b); grupo del egreso pendiente; null en lo demás.
-- * source / source_id: tabla y registro de origen (OS, membresía, convenio, egreso).
create function private.pnl_movements(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (
  detail_center_id uuid,
  section text,
  line text,
  dimension text,
  source text,
  source_id uuid,
  reference text,
  occurred_on date,
  description text,
  amount numeric
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
  -- Ventas de OS: neto de cada línea (subtotal − descuentos de la línea), por motor.
  select d.detail_center_id, 'ingreso', d.channel, i.revenue_engine::text, 'service_orders', d.id, d.folio, d.day,
         i.service_name || ' × ' || i.quantity, i.line_subtotal - i.line_discount
    from delivered d join public.service_order_items i on i.service_order_id = d.id
  union all
  -- Descuento general de la OS (no ligado a una línea): cuadra el canal con el total.
  select d.detail_center_id, 'ingreso', d.channel, 'descuento_os', 'service_orders', d.id, d.folio, d.day,
         'Descuento general de la OS', d.total - x.net
    from delivered d
    cross join lateral (select coalesce(sum(i.line_subtotal - i.line_discount), 0) as net
                          from public.service_order_items i where i.service_order_id = d.id) x
   where d.total <> x.net
  union all
  -- Venta de membresías: altas y renovaciones cobradas.
  select m.detail_center_id, 'ingreso', 'membresias', 'membresia', 'memberships', m.membership_id, ms.number,
         (m.occurred_at at time zone c.timezone)::date,
         case m.kind when 'alta' then 'Alta' else 'Renovación' end || coalesce(' · ' || m.plan_code, ''), m.amount
    from public.membership_events m
    join centers c on c.id = m.detail_center_id
    join public.memberships ms on ms.id = m.membership_id
   where m.kind in ('alta', 'renovacion') and coalesce(m.amount, 0) > 0
     and (m.occurred_at at time zone c.timezone)::date between p_from and p_to
  union all
  -- Cuotas B2B devengadas (mismo criterio que private.b2b_fee_accrued), en el centro gestor.
  select a.home_detail_center_id, 'ingreso', 'cuotas_b2b', 'cuota_b2b', 'b2b_agreements', g.id, a.name, f.day,
         g.name || case g.billing_model when 'paquete' then ' · paquete' else ' · iguala mensual' end, g.fee_amount
    from public.b2b_agreements g
    join public.b2b_accounts a on a.id = g.account_id
    join centers c on c.id = a.home_detail_center_id
    cross join lateral (
      select private.add_months(g.starts_on, k) as day
        from generate_series(0, case g.billing_model when 'iguala' then 1200 else 0 end) k
    ) f
   where g.billing_model in ('paquete', 'iguala') and g.fee_amount is not null
     and f.day between p_from and least(p_to, private.center_today(c.id))
     and (g.billing_model = 'paquete' or f.day <= g.ends_on)
  union all
  -- Costo estándar congelado de las líneas de las OS entregadas.
  select d.detail_center_id, 'costo_directo', 'estandar', i.revenue_engine::text, 'service_orders', d.id, d.folio,
         d.day, i.service_name || ' × ' || i.quantity, round(i.quantity * i.unit_direct_cost, 2)
    from delivered d join public.service_order_items i on i.service_order_id = d.id
   where i.unit_direct_cost > 0
  union all
  -- Variación real de insumos registrada en la ejecución de esas OS.
  select d.detail_center_id, 'costo_directo', 'variacion_insumos', null, 'service_orders', d.id, d.folio, d.day,
         inv.name || ' ' || k.actual_quantity || ' vs ' || k.standard_quantity || ' ' || k.unit,
         round((k.actual_quantity - k.standard_quantity) * k.unit_cost, 2)
    from delivered d
    join public.service_order_consumptions k on k.service_order_id = d.id
    join public.inventory_items inv on inv.id = k.inventory_item_id
   where k.actual_quantity <> k.standard_quantity
  union all
  -- Egresos aprobados (por grupo del P&L congelado) y pendientes (fuera del P&L).
  select e.detail_center_id,
         case when e.status = 'pendiente' or e.pnl_group = 'insumos' then 'fuera_pnl'
              when e.pnl_group = 'costo_directo' then 'costo_directo' else 'gasto' end,
         case when e.status = 'pendiente' then 'pendiente'
              when e.pnl_group = 'costo_directo' then 'egresos_costo_directo' else e.pnl_group end,
         case when e.status = 'pendiente' then e.pnl_group end,
         'expenses', e.id, e.folio, e.paid_on,
         e.concept || coalesce(' · ' || v.name, ''), e.amount
    from public.expenses e
    join centers c on c.id = e.detail_center_id
    left join public.vendors v on v.id = e.vendor_id
   where e.status in ('aprobado', 'pendiente') and e.paid_on between p_from and p_to;
$$;

-- ---------------------------------------------------------------------------
-- 3. RPC de lectura
-- ---------------------------------------------------------------------------

-- P&L por centro: montos por sección, línea y dimensión (motor o grupo).
-- El consolidado es la suma de los centros autorizados (lo arma el cliente con
-- las mismas filas). Sin datos personales.
create function public.pnl_lines(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (detail_center_id uuid, section text, line text, dimension text, amount numeric, movements integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.check_pnl_range(p_from, p_to);
  return query
    select m.detail_center_id, m.section, m.line, m.dimension, sum(m.amount), count(*)::integer
      from private.pnl_movements(p_detail_center_ids, p_from, p_to) m
     group by m.detail_center_id, m.section, m.line, m.dimension
     order by 1, 2, 3, 4;
end;
$$;

-- Drill-down: los movimientos que explican una línea (su suma es la línea).
-- p_line o p_dimension null = toda la sección o toda la línea.
create function public.pnl_drilldown(
  p_detail_center_ids uuid[],
  p_from date,
  p_to date,
  p_section text,
  p_line text default null,
  p_dimension text default null
) returns table (
  detail_center_id uuid,
  section text,
  line text,
  dimension text,
  source text,
  source_id uuid,
  reference text,
  occurred_on date,
  description text,
  amount numeric
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.check_pnl_range(p_from, p_to);
  if p_section is null or p_section not in ('ingreso', 'costo_directo', 'gasto', 'fuera_pnl') then
    raise exception 'Sección del P&L inválida' using errcode = '22023';
  end if;
  return query
    select m.*
      from private.pnl_movements(p_detail_center_ids, p_from, p_to) m
     where m.section = p_section
       and (p_line is null or m.line = p_line)
       and (p_dimension is null or m.dimension is not distinct from nullif(p_dimension, '-'))
     order by m.occurred_on, m.reference, m.description
     limit 5000;
end;
$$;

-- Hechos del P&L de AF2 (mismo contrato), ahora desde los mismos movimientos:
-- una sola fuente para el P&L, el drill-down y Dirección.
create or replace function public.pnl_facts(p_detail_center_ids uuid[], p_from date, p_to date)
returns table (detail_center_id uuid, section text, item text, amount numeric, count integer)
language sql stable security definer set search_path = '' as $$
  select m.detail_center_id,
         case when m.section = 'ingreso' then 'ingreso'
              when m.line in ('estandar', 'variacion_insumos') then 'costo_os'
              when m.line = 'pendiente' then 'egreso_pendiente'
              else 'egreso' end,
         case when m.line = 'egresos_costo_directo' then 'costo_directo'
              when m.line = 'pendiente' then m.dimension
              else m.line end,
         sum(m.amount), count(distinct m.source_id)::integer
    from private.pnl_movements(p_detail_center_ids, p_from, p_to) m
   group by 1, 2, 3
   order by 1, 2, 3;
$$;

-- ---------------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------------

revoke all on function private.can_read_pnl(uuid) from public;
grant execute on function private.can_read_pnl(uuid) to authenticated;
revoke all on function private.check_pnl_range(date, date) from public, anon, authenticated;
revoke all on function private.pnl_movements(uuid[], date, date) from public, anon, authenticated;
revoke all on function public.pnl_lines(uuid[], date, date) from public, anon;
grant execute on function public.pnl_lines(uuid[], date, date) to authenticated;
revoke all on function public.pnl_drilldown(uuid[], date, date, text, text, text) from public, anon;
grant execute on function public.pnl_drilldown(uuid[], date, date, text, text, text) to authenticated;
revoke all on function public.pnl_facts(uuid[], date, date) from public, anon;
grant execute on function public.pnl_facts(uuid[], date, date) to authenticated;
