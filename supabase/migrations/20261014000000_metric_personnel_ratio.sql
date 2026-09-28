-- D1 — Ejemplo de métrica nueva en los tableros: gasto de personal sobre ventas.
--
-- Agregar una métrica es: (1) su KPI y su entrada en METRIC_CATALOG de
-- @meguiars/analytics (fórmula y cálculo, una sola vez) y (2) esta línea en
-- una migración nueva. Ninguna pantalla cambia: el constructor la ofrece y web
-- y móvil la resuelven con el mismo servicio. La prueba de paridad
-- (metric-registry.test.ts) exige que ambos lados coincidan.

select private.register_metric('pnl.personnel_ratio', 1, 'Gasto de personal sobre ventas',
  'Cuánto de cada peso vendido se va en nómina y prestaciones.',
  'percent', 'Gastos de personal aprobados ÷ ventas × 100 (0 si no hay ventas)',
  'pnl', '{public.service_orders,public.service_order_items,public.service_order_consumptions,public.membership_events,public.b2b_agreements,public.expenses}',
  'pnl.read', '{kpi,timeseries,bars,ranking}', '{}', '{}', true);
