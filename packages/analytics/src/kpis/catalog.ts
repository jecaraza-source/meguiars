import {
  metricById,
  type DashboardChannel,
  type MetricBreakdown,
  type MetricDefinition,
} from "../dashboards/catalog";
import type { WidgetConfig } from "../dashboards/resolve";

/**
 * Registro de KPIs de Dirección (D2). Un KPI NO tiene fórmula propia: es una
 * vista de una métrica registrada (METRIC_CATALOG) — su valor, su reparto por
 * centro, su desglose por motor o la métrica con un canal fijo. Así cada
 * cálculo existe una sola vez y el KPI sólo agrega su ficha de negocio
 * (definición, numerador, denominador, periodo y notas de interpretación).
 * Unidad, fórmula, fuente, permiso y filtros válidos salen de la métrica.
 */

export const KPI_CATEGORIES = ["financieros", "operativos", "comerciales", "clientes"] as const;
export type KpiCategory = (typeof KPI_CATEGORIES)[number];

export const KPI_CATEGORY_LABELS: Record<KpiCategory, string> = {
  financieros: "Financieros",
  operativos: "Operativos",
  comerciales: "Comerciales",
  clientes: "Membresías y clientes",
};

/** Cómo se muestra la métrica en el KPI. */
export type KpiView = "kpi" | "bars" | "distribution";

export interface KpiEntry {
  id: string;
  category: KpiCategory;
  name: string;
  metricId: string;
  view: KpiView;
  /** Canal fijo (p. ej. "Ventas B2C") o desglose de la distribución. */
  channel: DashboardChannel | null;
  breakdown: MetricBreakdown | null;
  /** Definición empresarial legible. */
  definition: string;
  numerator: string;
  /** null = no es un cociente. */
  denominator: string | null;
  /** "rango" = suma el periodo elegido; "corte" = foto al último día del periodo. */
  period: "rango" | "corte";
  notes: string;
  /** Derivados de la métrica (una sola fuente de verdad). */
  metric: MetricDefinition;
}

type KpiSpec = Omit<KpiEntry, "metric" | "channel" | "breakdown" | "view"> & {
  view?: KpiView;
  channel?: DashboardChannel;
  breakdown?: MetricBreakdown;
};

function kpi(spec: KpiSpec): KpiEntry {
  const metric = metricById(spec.metricId);
  if (!metric) throw new Error(`El KPI ${spec.id} usa una métrica no registrada: ${spec.metricId}`);
  const view = spec.view ?? "kpi";
  if (!metric.widgets.includes(view))
    throw new Error(`La métrica ${metric.id} no admite la vista ${view} (${spec.id})`);
  if (spec.channel && !metric.filters.includes("canal"))
    throw new Error(`La métrica ${metric.id} no admite canal fijo (${spec.id})`);
  if (spec.breakdown && !metric.breakdowns.includes(spec.breakdown))
    throw new Error(`La métrica ${metric.id} no admite el desglose ${spec.breakdown} (${spec.id})`);
  return { ...spec, view, channel: spec.channel ?? null, breakdown: spec.breakdown ?? null, metric };
}

export const KPI_CATALOG: readonly KpiEntry[] = [
  // Financieros
  kpi({
    id: "kpi.ventas",
    category: "financieros",
    name: "Ventas",
    metricId: "pnl.revenue",
    definition:
      "Lo que el negocio vendió en el periodo: servicios entregados, membresías y cuotas B2B, aunque no se hayan cobrado.",
    numerator: "Total de OS entregadas + altas y renovaciones de membresía + cuotas B2B devengadas",
    denominator: null,
    period: "rango",
    notes:
      "Es venta devengada, no cobranza: para el dinero recibido usa Cobrado. Una OS cuenta el día que se entrega.",
  }),
  kpi({
    id: "kpi.utilidad_bruta",
    category: "financieros",
    name: "Utilidad bruta",
    metricId: "pnl.gross_profit",
    definition: "Lo que queda de las ventas después de todo el costo directo del servicio.",
    numerator: "Ventas − costo directo (estándar, variación de insumos y egresos de costo directo)",
    denominator: null,
    period: "rango",
    notes:
      "Si baja con ventas estables, revisa costos estándar, consumo de insumos o egresos de costo directo.",
  }),
  kpi({
    id: "kpi.margen_contribucion",
    category: "financieros",
    name: "Margen de contribución",
    metricId: "pnl.contribution_margin",
    definition: "Lo que aporta cada venta de OS después de sus costos variables, antes de gastos fijos.",
    numerator: "Ventas − costo estándar de las OS − pago a operadores − variación real de insumos",
    denominator: null,
    period: "rango",
    notes:
      "No resta egresos de costo directo que no pasan por una OS (esos sí están en la utilidad bruta). Admite filtro por motor para comparar su aporte.",
  }),
  kpi({
    id: "kpi.ebitda",
    category: "financieros",
    name: "EBITDA gerencial",
    metricId: "pnl.ebitda",
    definition: "Resultado de la operación antes de depreciación, intereses e impuestos.",
    numerator: "Utilidad bruta − gastos de personal − gastos operativos aprobados",
    denominator: null,
    period: "rango",
    notes:
      "Gerencial: sin depreciación (no hay activos fijos modelados). Egresos pendientes de aprobar no cuentan.",
  }),
  kpi({
    id: "kpi.ticket_promedio",
    category: "financieros",
    name: "Ticket promedio",
    metricId: "orders.avg_ticket",
    definition: "Cuánto se vende en promedio por cada visita (OS entregada).",
    numerator: "Σ total de las OS entregadas",
    denominator: "OS entregadas",
    period: "rango",
    notes: "Sólo OS (no membresías ni cuotas B2B). Sube con upselling y servicios de mayor valor.",
  }),
  kpi({
    id: "kpi.ingreso_por_centro",
    category: "financieros",
    name: "Ingreso por centro",
    metricId: "pnl.revenue",
    view: "bars",
    definition: "Ventas de cada centro de costos en el periodo, para compararlos.",
    numerator: "Ventas del centro",
    denominator: null,
    period: "rango",
    notes: "El consolidado es la suma de los centros autorizados.",
  }),
  // Operativos
  kpi({
    id: "kpi.vehiculos",
    category: "operativos",
    name: "Vehículos atendidos",
    metricId: "orders.vehicles_served",
    definition: "Visitas terminadas: vehículos entregados al cliente en el periodo.",
    numerator: "OS entregadas",
    denominator: null,
    period: "rango",
    notes: "Un mismo vehículo que viene dos veces cuenta dos visitas.",
  }),
  kpi({
    id: "kpi.ocupacion",
    category: "operativos",
    name: "Ocupación",
    metricId: "ops.occupancy",
    definition: "Qué parte de la capacidad instalada de bahías se usó en servicios entregados.",
    numerator: "Minutos estándar de las OS entregadas",
    denominator: "Bahías activas × horas operativas × 60 × días operativos del periodo",
    period: "rango",
    notes:
      "Usa tiempos estándar del catálogo y los parámetros de horas y días operativos de la organización. Capacidad con las bahías activas hoy.",
  }),
  kpi({
    id: "kpi.duracion",
    category: "operativos",
    name: "Duración promedio",
    metricId: "ops.avg_duration",
    definition: "Tiempo real de trabajo por vehículo, del inicio al fin de la ejecución.",
    numerator: "Σ minutos entre inicio y fin de trabajo",
    denominator: "OS entregadas con inicio y fin registrados",
    period: "rango",
    notes: "OS sin marcas de trabajo no cuentan. Compárala con la duración estándar del catálogo.",
  }),
  kpi({
    id: "kpi.productividad",
    category: "operativos",
    name: "Productividad por técnico",
    metricId: "ops.productivity",
    definition: "Vehículos entregados por cada técnico activo.",
    numerator: "OS entregadas",
    denominator: "Técnicos activos de los centros",
    period: "rango",
    notes: "Básica: no pondera la complejidad del servicio ni turnos. Usa los técnicos activos hoy.",
  }),
  kpi({
    id: "kpi.retrabajos",
    category: "operativos",
    name: "Retrabajos e incidencias",
    metricId: "ops.rework_rate",
    definition: "Porcentaje de vehículos entregados que tuvieron una incidencia o un retrabajo.",
    numerator: "OS entregadas con al menos una incidencia o retrabajo",
    denominator: "OS entregadas",
    period: "rango",
    notes: "Menor es mejor. Depende de que la operación registre las incidencias.",
  }),
  // Comerciales
  kpi({
    id: "kpi.ventas_por_motor",
    category: "comerciales",
    name: "Ventas por motor",
    metricId: "pnl.revenue",
    view: "distribution",
    breakdown: "motor",
    definition:
      "Cómo se reparte la venta entre los motores de ingreso (recurrente, valor medio, premium, productos, membresía, cuota B2B).",
    numerator: "Ventas de cada motor",
    denominator: "Ventas totales (para la participación)",
    period: "rango",
    notes: "El descuento general de las OS aparece aparte porque no pertenece a una línea.",
  }),
  kpi({
    id: "kpi.ventas_b2c",
    category: "comerciales",
    name: "Ventas B2C",
    metricId: "pnl.revenue",
    channel: "b2c",
    definition: "Ventas de OS a clientes particulares.",
    numerator: "Total de OS entregadas del canal B2C",
    denominator: null,
    period: "rango",
    notes: "Canal fijo: no cambia con el filtro de canal.",
  }),
  kpi({
    id: "kpi.venta_b2b",
    category: "comerciales",
    name: "Venta B2B",
    metricId: "pnl.revenue",
    channel: "b2b",
    definition: "Ventas a cuentas empresariales: OS del canal B2B y cuotas devengadas.",
    numerator: "OS entregadas del canal B2B + cuotas B2B devengadas",
    denominator: null,
    period: "rango",
    notes: "Canal fijo. La cobranza B2B se ve en Cuentas por cobrar.",
  }),
  kpi({
    id: "kpi.venta_productos",
    category: "comerciales",
    name: "Venta de productos",
    metricId: "orders.product_sales",
    definition: "Productos vendidos dentro de las OS (no servicios).",
    numerator: "Σ neto de las líneas de producto de las OS entregadas",
    denominator: null,
    period: "rango",
    notes: "Neto de descuentos de línea; el descuento general de la OS no se reparte.",
  }),
  kpi({
    id: "kpi.upselling",
    category: "comerciales",
    name: "Tasa de upselling",
    metricId: "upsell.acceptance_rate",
    definition: "Qué porcentaje de las sugerencias de venta adicional acepta el cliente.",
    numerator: "Sugerencias aceptadas",
    denominator: "Sugerencias ofrecidas",
    period: "rango",
    notes: "Una sugerencia se cuenta una vez por regla y OS, por la fecha en que se mostró.",
  }),
  kpi({
    id: "kpi.conversion",
    category: "comerciales",
    name: "Conversión de oportunidades",
    metricId: "pipeline.conversion_rate",
    definition: "De las oportunidades que se cerraron en el periodo, cuántas se ganaron.",
    numerator: "Oportunidades ganadas en el periodo",
    denominator: "Oportunidades ganadas + perdidas en el periodo",
    period: "rango",
    notes: "Las abiertas no cuentan. Filtro de canal: B2B o B2C premium.",
  }),
  // Membresías y clientes
  kpi({
    id: "kpi.membresias_activas",
    category: "clientes",
    name: "Membresías activas",
    metricId: "membership.active_count",
    definition: "Membresías vigentes (activas o por vencer) al último día del periodo.",
    numerator: "Membresías activas o próximas a vencer al corte",
    denominator: null,
    period: "corte",
    notes: "Foto al cierre del periodo: suspendidas, vencidas y canceladas no cuentan.",
  }),
  kpi({
    id: "kpi.mrr",
    category: "clientes",
    name: "MRR",
    metricId: "membership.mrr",
    definition: "Ingreso mensual recurrente de las membresías vigentes.",
    numerator: "Σ precio del periodo ÷ meses del periodo de cada membresía vigente al corte",
    denominator: null,
    period: "corte",
    notes:
      "Sólo ingresos recurrentes elegibles: membresías activas o por vencer. No incluye cuotas B2B (contratos, se reportan en Venta B2B), ventas únicas ni membresías suspendidas.",
  }),
  kpi({
    id: "kpi.altas",
    category: "clientes",
    name: "Altas de membresía",
    metricId: "membership.new_count",
    definition: "Membresías nuevas vendidas en el periodo.",
    numerator: "Membresías con alta en el periodo",
    denominator: null,
    period: "rango",
    notes: "Las renovaciones se cuentan aparte.",
  }),
  kpi({
    id: "kpi.renovaciones",
    category: "clientes",
    name: "Renovaciones",
    metricId: "membership.renewal_count",
    definition: "Renovaciones de membresía registradas en el periodo.",
    numerator: "Eventos de renovación en el periodo",
    denominator: null,
    period: "rango",
    notes: "Una membresía puede renovarse más de una vez en periodos largos.",
  }),
  kpi({
    id: "kpi.cancelaciones",
    category: "clientes",
    name: "Cancelaciones",
    metricId: "membership.cancellation_count",
    definition: "Membresías que el cliente canceló en el periodo.",
    numerator: "Membresías canceladas en el periodo",
    denominator: null,
    period: "rango",
    notes: "Las vencidas sin renovar no son cancelaciones (se ven en Bajas del módulo de membresías).",
  }),
  kpi({
    id: "kpi.recurrencia",
    category: "clientes",
    name: "Recurrencia",
    metricId: "customers.recurrence_rate",
    definition: "Porcentaje de los clientes atendidos en el periodo que ya habían venido antes al centro.",
    numerator: "Clientes atendidos en el periodo con una visita previa al centro",
    denominator: "Clientes únicos atendidos en el periodo",
    period: "rango",
    notes: "Un cliente atendido en dos centros cuenta una vez en el consolidado.",
  }),
  kpi({
    id: "kpi.frecuencia",
    category: "clientes",
    name: "Frecuencia de visita",
    metricId: "customers.visit_frequency",
    definition: "Cuántas veces vino en promedio cada cliente atendido en el periodo.",
    numerator: "Visitas (OS entregadas)",
    denominator: "Clientes únicos atendidos",
    period: "rango",
    notes: "Periodos cortos tienden a 1; compárala en periodos iguales.",
  }),
  kpi({
    id: "kpi.ltv",
    category: "clientes",
    name: "LTV gerencial inicial",
    metricId: "customers.ltv",
    definition:
      "Valor de vida estimado de un cliente con una regla de gestión explícita: gasto anual por cliente × margen de las OS × años de vida esperados.",
    numerator: "Ventas de OS del periodo × margen de las OS × años de vida × (365 ÷ días del periodo)",
    denominator: "Clientes únicos atendidos en el periodo",
    period: "rango",
    notes:
      "No es una predicción científica. Los años de vida son un parámetro de la organización (3 por defecto) que el admin corporativo ajusta; el margen usa el costo estándar de las OS.",
  }),
];

const BY_ID = new Map(KPI_CATALOG.map((k) => [k.id, k]));
if (BY_ID.size !== KPI_CATALOG.length) throw new Error("KPI duplicado en KPI_CATALOG");

export const kpiById = (id: string) => BY_ID.get(id);

/** Widgets del servicio de métricas para calcular los KPIs (una sola lectura de hechos). */
export function kpiWidgets(entries: readonly KpiEntry[] = KPI_CATALOG): WidgetConfig[] {
  return entries.map((k) => ({
    id: k.id,
    metricId: k.metricId,
    type: k.view,
    options: {
      ...(k.channel ? { channel: k.channel } : {}),
      ...(k.breakdown ? { breakdown: k.breakdown } : {}),
    },
  }));
}

/** Filtros globales que aplican al KPI (además de centros y periodo). */
export function kpiValidFilters(k: KpiEntry): ("centros" | "periodo" | "canal" | "motor")[] {
  return ["centros", "periodo", ...k.metric.filters.filter((f) => !(f === "canal" && k.channel))];
}
