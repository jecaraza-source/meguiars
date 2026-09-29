import { metricById, type DashboardChannel, type MetricDefinition } from "../dashboards/catalog";

/**
 * Tarjetas del tablero corporativo de Dirección (D3). Cada tarjeta es una
 * vista de una métrica registrada (D1/D2): el valor, la comparación por
 * centro, la tendencia y el drill-down usan la misma fórmula del registro.
 * Aquí sólo se declara qué métrica, con qué canal fijo y cómo se explica.
 */

/**
 * Cómo se explica la cifra después del centro:
 * - revenue: canal / motor → servicio → OS (ventas del P&L);
 * - products: canal → producto → OS (venta de productos);
 * - pnl: renglones del estado de resultados → movimientos del P&L;
 * - channel: por canal (misma fórmula sobre el subconjunto);
 * - none: sólo por centro (se detalla en su módulo).
 */
export type CardDrillKind = "revenue" | "products" | "pnl" | "channel" | "none";

export interface CorporateCard {
  id: string;
  name: string;
  metricId: string;
  /** Canal fijo (Venta B2B = ventas con canal b2b). */
  channel: DashboardChannel | null;
  /** KPI de Dirección → KPIs (D2) con su ficha, si existe. */
  kpiId: string | null;
  /** ¿Subir es bueno? (color de la tendencia). */
  higherIsBetter: boolean;
  drill: CardDrillKind;
  /** ¿La cifra del consolidado es la suma de sus partes? (promedios y tasas no). */
  additive: boolean;
  metric: MetricDefinition;
}

type CardSpec = Omit<CorporateCard, "metric" | "channel" | "kpiId" | "higherIsBetter" | "additive"> & {
  channel?: DashboardChannel;
  kpiId?: string;
  higherIsBetter?: boolean;
  /** Por defecto: aditiva salvo porcentajes, razones y minutos promedio. */
  additive?: boolean;
};

function card(spec: CardSpec): CorporateCard {
  const metric = metricById(spec.metricId);
  if (!metric) throw new Error(`La tarjeta ${spec.id} usa una métrica no registrada: ${spec.metricId}`);
  for (const w of ["kpi", "bars"] as const)
    if (!metric.widgets.includes(w)) throw new Error(`La métrica ${metric.id} no admite ${w} (${spec.id})`);
  if (spec.channel && !metric.filters.includes("canal"))
    throw new Error(`La métrica ${metric.id} no admite canal fijo (${spec.id})`);
  if (spec.drill === "revenue" && !metric.breakdowns.includes("motor"))
    throw new Error(`La tarjeta ${spec.id} se explica por motor y su métrica no lo desglosa`);
  if ((spec.drill === "channel" || spec.drill === "products") && !metric.filters.includes("canal"))
    throw new Error(`La tarjeta ${spec.id} se explica por canal y su métrica no lo filtra`);
  if (spec.drill === "pnl" && metric.source !== "pnl")
    throw new Error(`La tarjeta ${spec.id} se explica con el P&L y su métrica no es del P&L`);
  return {
    ...spec,
    channel: spec.channel ?? null,
    kpiId: spec.kpiId ?? null,
    higherIsBetter: spec.higherIsBetter ?? true,
    additive: spec.additive ?? !["percent", "ratio", "minutes"].includes(metric.unit),
    metric,
  };
}

/** Tarjetas del tablero, en su orden (móvil: las primeras forman el resumen ejecutivo). */
export const CORPORATE_CARDS: readonly CorporateCard[] = [
  card({ id: "ventas", name: "Ventas", metricId: "pnl.revenue", kpiId: "kpi.ventas", drill: "revenue" }),
  card({ id: "ebitda", name: "EBITDA", metricId: "pnl.ebitda", kpiId: "kpi.ebitda", drill: "pnl" }),
  card({ id: "margen", name: "Margen bruto", metricId: "pnl.gross_margin", drill: "pnl" }),
  card({
    id: "vehiculos",
    name: "Vehículos",
    metricId: "orders.vehicles_served",
    kpiId: "kpi.vehiculos",
    drill: "channel",
  }),
  card({
    id: "ticket",
    name: "Ticket promedio",
    metricId: "orders.avg_ticket",
    kpiId: "kpi.ticket_promedio",
    drill: "channel",
    additive: false,
  }),
  card({
    id: "membresias",
    name: "Membresías activas",
    metricId: "membership.active_count",
    kpiId: "kpi.membresias_activas",
    drill: "none",
  }),
  card({ id: "mrr", name: "MRR", metricId: "membership.mrr", kpiId: "kpi.mrr", drill: "none" }),
  card({
    id: "recurrencia",
    name: "Recurrencia",
    metricId: "customers.recurrence_rate",
    kpiId: "kpi.recurrencia",
    drill: "channel",
  }),
  card({
    id: "venta_b2b",
    name: "Venta B2B",
    metricId: "pnl.revenue",
    channel: "b2b",
    kpiId: "kpi.venta_b2b",
    drill: "revenue",
  }),
  card({
    id: "venta_productos",
    name: "Venta de productos",
    metricId: "orders.product_sales",
    kpiId: "kpi.venta_productos",
    drill: "products",
  }),
];

/** Tarjetas del resumen ejecutivo del móvil (las primeras del tablero). */
export const EXECUTIVE_SUMMARY_SIZE = 4;

const BY_ID = new Map(CORPORATE_CARDS.map((c) => [c.id, c]));
if (BY_ID.size !== CORPORATE_CARDS.length) throw new Error("Tarjeta duplicada en CORPORATE_CARDS");

export const corporateCardById = (id: string): CorporateCard | undefined => BY_ID.get(id);
