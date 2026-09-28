import { defineKpi, kpiRegistry } from "./kpi";

/**
 * KPIs de OS entregadas y operación (D2). Fuente: public.dashboard_facts,
 * fuente `orders` (OS entregadas por centro, periodo y canal) y `centers`
 * (recursos y parámetros del centro). Las fórmulas viven sólo aquí.
 */
export interface OrderFact {
  detailCenterId: string;
  bucket: string;
  channel: "b2c" | "membresia" | "b2b";
  /** OS entregadas (una OS = un vehículo atendido en una visita). */
  orders: number;
  /** Σ total de las OS. */
  sales: number;
  /** Σ neto de las líneas de tipo producto. */
  productSales: number;
  /** Σ minutos estándar (duración del catálogo) de las OS. */
  standardMinutes: number;
  /** OS con inicio y fin de trabajo registrados. */
  timedOrders: number;
  /** Σ minutos reales de trabajo de esas OS. */
  actualMinutes: number;
  /** OS con al menos una incidencia o retrabajo. */
  reworkOrders: number;
}

/** Recursos y parámetros del centro (public.kpi_settings de su organización). */
export interface CenterResourceFact {
  detailCenterId: string;
  bays: number;
  technicians: number;
  operatingHoursPerDay: number;
  operatingDaysPerWeek: number;
  ltvLifetimeYears: number;
}

export interface OrdersKpiInput {
  facts: readonly OrderFact[];
  /** Rango inclusive (AAAA-MM-DD). */
  from: string;
  to: string;
  /** Recursos de los centros evaluados. */
  centers: readonly CenterResourceFact[];
}

const SOURCES = ["public.service_orders"] as const;
const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = <T>(rows: readonly T[], pick: (r: T) => number) => rows.reduce((t, r) => t + pick(r), 0);
const ratio = (num: number, den: number, scale = 1) => (den > 0 ? round2((num * scale) / den) : 0);

/** Días del rango, inclusive. */
export const periodDays = (from: string, to: string) =>
  Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1);

const kpi = (
  id: string,
  name: string,
  formula: string,
  unit: "count" | "currency" | "percent" | "minutes" | "ratio",
  sources: readonly string[],
  compute: (i: OrdersKpiInput) => number,
) =>
  kpiRegistry.register(
    defineKpi<OrdersKpiInput>({ id, name, formula, sources, unit, scopes: ["center", "corporate"], compute }),
  );

export const ordersVehiclesServed = kpi(
  "orders.vehicles_served",
  "Vehículos atendidos",
  "OS entregadas en el periodo (una OS = un vehículo atendido en una visita)",
  "count",
  SOURCES,
  ({ facts }) => sum(facts, (f) => f.orders),
);

export const ordersAvgTicket = kpi(
  "orders.avg_ticket",
  "Ticket promedio",
  "Σ total de las OS entregadas ÷ OS entregadas (0 sin OS)",
  "currency",
  SOURCES,
  ({ facts }) =>
    ratio(
      sum(facts, (f) => f.sales),
      sum(facts, (f) => f.orders),
    ),
);

export const ordersProductSales = kpi(
  "orders.product_sales",
  "Venta de productos",
  "Σ (subtotal − descuento de línea) de las líneas de tipo producto de las OS entregadas",
  "currency",
  ["public.service_orders", "public.service_order_items"],
  ({ facts }) => round2(sum(facts, (f) => f.productSales)),
);

/** Minutos disponibles: bahías × horas × 60 × días del rango × días operativos ÷ 7. */
export function capacityMinutes(centers: readonly CenterResourceFact[], from: string, to: string): number {
  const days = periodDays(from, to);
  return sum(centers, (c) => c.bays * c.operatingHoursPerDay * 60 * days * (c.operatingDaysPerWeek / 7));
}

export const opsOccupancy = kpi(
  "ops.occupancy",
  "Ocupación",
  "Minutos estándar de las OS entregadas ÷ (bahías activas × horas operativas por día × 60 × días del periodo × días operativos por semana ÷ 7) × 100",
  "percent",
  ["public.service_orders", "public.bays", "public.kpi_settings"],
  (i) =>
    ratio(
      sum(i.facts, (f) => f.standardMinutes),
      capacityMinutes(i.centers, i.from, i.to),
      100,
    ),
);

export const opsAvgDuration = kpi(
  "ops.avg_duration",
  "Duración promedio",
  "Σ minutos entre inicio y fin de trabajo ÷ OS entregadas con ambas marcas (0 sin marcas)",
  "minutes",
  SOURCES,
  ({ facts }) =>
    ratio(
      sum(facts, (f) => f.actualMinutes),
      sum(facts, (f) => f.timedOrders),
    ),
);

export const opsProductivity = kpi(
  "ops.productivity",
  "Productividad por técnico",
  "OS entregadas ÷ técnicos activos de los centros (0 sin técnicos)",
  "ratio",
  ["public.service_orders", "public.technicians"],
  (i) =>
    ratio(
      sum(i.facts, (f) => f.orders),
      sum(i.centers, (c) => c.technicians),
    ),
);

export const opsReworkRate = kpi(
  "ops.rework_rate",
  "Retrabajos e incidencias",
  "OS entregadas con al menos una incidencia o retrabajo registrado ÷ OS entregadas × 100 (0 sin OS)",
  "percent",
  ["public.service_orders", "public.service_order_incidents"],
  ({ facts }) =>
    ratio(
      sum(facts, (f) => f.reworkOrders),
      sum(facts, (f) => f.orders),
      100,
    ),
);
