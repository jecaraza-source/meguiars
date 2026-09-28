import type { KpiUnit } from "../kpi";
import {
  membershipActiveCount,
  membershipMrr,
  membershipNewCount,
  type MembershipFact,
} from "../memberships";
import { paymentsCashIn, paymentsCollected, type PaymentFactInput } from "../payments";
import {
  pipelineConversionRate,
  pipelineCreated,
  pipelineFunnel,
  pipelineWonValue,
  type PipelineFact,
  type PipelineStageRef,
} from "../pipeline";
import {
  expensesCashOut,
  pnlDirectCost,
  pnlEbitda,
  pnlEbitdaMargin,
  pnlGrossMargin,
  pnlGrossProfit,
  pnlNetBeforeTax,
  pnlPersonnelRatio,
  pnlRevenue,
  pnlStatement,
  type PnlLineFact,
} from "../pnl";

/**
 * Catálogo de métricas de los tableros ejecutivos (D1). ÚNICO lugar donde se
 * agrega una métrica: su definición, unidad, fórmula, fuente, permiso, widgets
 * y filtros que admite, y cómo se calcula a partir de los hechos de
 * public.dashboard_facts. Las pantallas (web y móvil) no cambian al agregar una
 * métrica. public.metric_registry es el espejo en la base (migración con
 * private.register_metric); metric-registry.test.ts exige que coincidan.
 *
 * Ver docs/modules/tableros.md → "Agregar una métrica".
 */

export const WIDGET_TYPES = ["kpi", "timeseries", "bars", "ranking", "funnel", "distribution"] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const METRIC_SOURCES = ["pnl", "payments", "pipeline", "memberships"] as const;
export type MetricSource = (typeof METRIC_SOURCES)[number];

/** Filtros globales que una métrica puede respetar (además de centros y periodo). */
export const METRIC_FILTERS = ["canal", "motor"] as const;
export type MetricFilter = (typeof METRIC_FILTERS)[number];

export const METRIC_BREAKDOWNS = ["motor", "canal", "forma_pago"] as const;
export type MetricBreakdown = (typeof METRIC_BREAKDOWNS)[number];

/** Canal comercial del filtro global. */
export const DASHBOARD_CHANNELS = ["b2c", "membresia", "b2b"] as const;
export type DashboardChannel = (typeof DASHBOARD_CHANNELS)[number];

/** Motor de ingreso del filtro global (los del catálogo + cuotas B2B). */
export const DASHBOARD_ENGINES = [
  "recurrente",
  "valor_medio",
  "premium",
  "producto_complemento",
  "membresia",
  "cuota_b2b",
] as const;
export type DashboardEngine = (typeof DASHBOARD_ENGINES)[number];

export const CHANNEL_LABELS: Record<DashboardChannel, string> = {
  b2c: "B2C",
  membresia: "Membresía",
  b2b: "B2B",
};

export const ENGINE_LABELS: Record<string, string> = {
  recurrente: "Recurrente",
  valor_medio: "Valor medio",
  premium: "Premium",
  producto_complemento: "Producto / complemento",
  membresia: "Membresía",
  cuota_b2b: "Cuota B2B",
  descuento_os: "Descuento general de OS",
  "-": "Sin clasificar",
};

// ---------------------------------------------------------------------------
// Hechos (contrato de public.dashboard_facts)
// ---------------------------------------------------------------------------

/** Fila del P&L por centro y periodo de la serie (bucket = inicio del periodo). */
export interface PnlBucketFact extends PnlLineFact {
  bucket: string;
}

/** Cobranza por centro, periodo y forma de pago (`day` = bucket). */
export interface PaymentBucketFact extends PaymentFactInput {
  detailCenterId: string;
  bucket: string;
}

/** Membresía al corte, con su centro. */
export interface MembershipCenterFact extends MembershipFact {
  detailCenterId: string;
}

export type FactsGrain = "total" | "dia" | "semana" | "mes";

export interface DashboardFacts {
  from: string;
  to: string;
  grain: FactsGrain;
  pnl?: readonly PnlBucketFact[];
  payments?: readonly PaymentBucketFact[];
  pipeline?: readonly PipelineFact[];
  pipelineStages?: readonly PipelineStageRef[];
  memberships?: readonly MembershipCenterFact[];
}

/** Filtros globales ya resueltos. */
export interface MetricFilters {
  channel: DashboardChannel | null;
  engine: DashboardEngine | null;
}

/** Entrada del cálculo de una métrica sobre un subconjunto de hechos. */
export interface MetricInput<F> {
  facts: readonly F[];
  from: string;
  to: string;
  stages: readonly PipelineStageRef[];
}

export interface BreakdownRow {
  key: string;
  label: string;
  value: number;
}

/** Destino del drill-down (lo traduce @meguiars/domain a ruta web / pantalla móvil). */
export type MetricDrill =
  | { kind: "pnl"; section: "ingreso" | "costo_directo" | "gasto"; line?: string }
  | { kind: "payments" }
  | { kind: "pipeline" };

// ---------------------------------------------------------------------------
// Fuentes: cómo se leen, se agrupan y se filtran sus hechos
// ---------------------------------------------------------------------------

interface SourceSpec<F> {
  pick: (facts: DashboardFacts) => readonly F[];
  centerOf: (f: F) => string;
  /** Periodo del hecho; null = la métrica recibe el rango del periodo (pipeline) o no admite series. */
  bucketOf: ((f: F) => string) | null;
  /** ¿El hecho pasa los filtros que la métrica declara? */
  matches: (f: F, filters: MetricFilters, declared: readonly MetricFilter[]) => boolean;
}

/** Canal comercial de una línea de ingreso del P&L. */
export function pnlChannelOf(line: string): DashboardChannel | null {
  if (line === "b2c") return "b2c";
  if (line === "membresia" || line === "membresias") return "membresia";
  if (line === "b2b" || line === "cuotas_b2b") return "b2b";
  return null;
}

const pnlSource: SourceSpec<PnlBucketFact> = {
  pick: (f) => f.pnl ?? [],
  centerOf: (f) => f.detailCenterId,
  bucketOf: (f) => f.bucket,
  // Los filtros de canal y motor sólo recortan el ingreso.
  matches: (f, filters, declared) =>
    f.section !== "ingreso" ||
    ((!declared.includes("canal") || !filters.channel || pnlChannelOf(f.line) === filters.channel) &&
      (!declared.includes("motor") || !filters.engine || f.dimension === filters.engine)),
};

const paymentsSource: SourceSpec<PaymentBucketFact> = {
  pick: (f) => f.payments ?? [],
  centerOf: (f) => f.detailCenterId,
  bucketOf: (f) => f.bucket,
  matches: () => true,
};

const PIPELINE_KIND: Record<DashboardChannel, PipelineFact["kind"] | null> = {
  b2b: "b2b",
  b2c: "b2c_premium",
  membresia: null,
};

const pipelineSource: SourceSpec<PipelineFact> = {
  pick: (f) => f.pipeline ?? [],
  centerOf: (f) => f.detailCenterId,
  bucketOf: null,
  matches: (f, filters, declared) =>
    !declared.includes("canal") || !filters.channel || PIPELINE_KIND[filters.channel] === f.kind,
};

const membershipsSource: SourceSpec<MembershipCenterFact> = {
  pick: (f) => f.memberships ?? [],
  centerOf: (f) => f.detailCenterId,
  bucketOf: null,
  matches: () => true,
};

// ---------------------------------------------------------------------------
// Definición de métricas
// ---------------------------------------------------------------------------

/** Métrica registrada (forma sin tipos de hecho: la usan el resolvedor y las pantallas). */
export interface MetricDefinition {
  id: string;
  /** Sube cuando cambia la definición, la fórmula o lo que admite (se refleja en metric_registry). */
  version: number;
  name: string;
  description: string;
  unit: KpiUnit;
  formula: string;
  source: MetricSource;
  sourceTables: readonly string[];
  /** Capacidad requerida en cada centro (ROLE_CAPABILITIES de @meguiars/domain). */
  capability: string;
  widgets: readonly WidgetType[];
  filters: readonly MetricFilter[];
  breakdowns: readonly MetricBreakdown[];
  drill: MetricDrill | null;
  /** Serie: por periodo de los hechos ("bucket"), por rango ("range") o sin serie. */
  series: "bucket" | "range" | null;
  /** @internal Acceso tipado a la fuente y al cálculo. */
  readonly impl: MetricImpl;
}

export interface MetricImpl {
  pick: (facts: DashboardFacts) => readonly unknown[];
  centerOf: (f: unknown) => string;
  bucketOf: ((f: unknown) => string) | null;
  matches: (f: unknown, filters: MetricFilters) => boolean;
  value: (input: MetricInput<unknown>) => number;
  breakdown?: (input: MetricInput<unknown>, by: MetricBreakdown) => BreakdownRow[];
  funnel?: (input: MetricInput<unknown>) => BreakdownRow[];
}

interface MetricSpec<F> {
  id: string;
  version: number;
  /** Nombre, fórmula y unidad salen del KPI de @meguiars/analytics (una sola fórmula). */
  kpi: { id: string; name: string; formula: string; unit: KpiUnit; sources: readonly string[] };
  name?: string;
  description: string;
  capability: string;
  widgets: readonly WidgetType[];
  filters?: readonly MetricFilter[];
  breakdowns?: readonly MetricBreakdown[];
  drill?: MetricDrill;
  value: (input: MetricInput<F>) => number;
  breakdown?: (input: MetricInput<F>, by: MetricBreakdown) => BreakdownRow[];
  funnel?: (input: MetricInput<F>) => BreakdownRow[];
}

const METRIC_ID = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;

export function defineMetric<F>(
  source: MetricSource,
  spec: SourceSpec<F>,
  m: MetricSpec<F>,
): MetricDefinition {
  if (!METRIC_ID.test(m.id)) throw new Error(`Id de métrica inválido: ${m.id}`);
  if (m.id !== m.kpi.id) throw new Error(`La métrica ${m.id} debe usar el KPI con el mismo id (${m.kpi.id})`);
  if (!Number.isInteger(m.version) || m.version < 1) throw new Error(`Versión inválida en ${m.id}`);
  if (m.widgets.length === 0) throw new Error(`La métrica ${m.id} no declara widgets`);
  const breakdowns = m.breakdowns ?? [];
  if (m.widgets.includes("distribution") !== breakdowns.length > 0)
    throw new Error(`La distribución de ${m.id} exige declarar sus desgloses (y viceversa)`);
  if (breakdowns.length > 0 && !m.breakdown) throw new Error(`La métrica ${m.id} no calcula su desglose`);
  if (m.widgets.includes("funnel") && !m.funnel) throw new Error(`La métrica ${m.id} no calcula su embudo`);
  const series = spec.bucketOf ? "bucket" : source === "pipeline" ? "range" : null;
  if (m.widgets.includes("timeseries") && !series)
    throw new Error(`La fuente de ${m.id} no admite series de tiempo`);
  const filters = m.filters ?? [];
  const cast = <T>(input: MetricInput<unknown>) => input as MetricInput<T>;
  return {
    id: m.id,
    version: m.version,
    name: m.name ?? m.kpi.name,
    description: m.description,
    unit: m.kpi.unit,
    formula: m.kpi.formula,
    source,
    sourceTables: m.kpi.sources,
    capability: m.capability,
    widgets: m.widgets,
    filters,
    breakdowns,
    drill: m.drill ?? null,
    series,
    impl: {
      pick: spec.pick,
      centerOf: spec.centerOf as (f: unknown) => string,
      bucketOf: spec.bucketOf as ((f: unknown) => string) | null,
      matches: (f, fl) => spec.matches(f as F, fl, filters),
      value: (i) => m.value(cast<F>(i)),
      ...(m.breakdown ? { breakdown: (i, by) => m.breakdown!(cast<F>(i), by) } : {}),
      ...(m.funnel ? { funnel: (i) => m.funnel!(cast<F>(i)) } : {}),
    },
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function groupSum<F>(
  facts: readonly F[],
  key: (f: F) => string,
  label: (k: string, f: F) => string,
  value: (f: F) => number,
) {
  const map = new Map<string, BreakdownRow>();
  for (const f of facts) {
    const k = key(f);
    const row = map.get(k) ?? { key: k, label: label(k, f), value: 0 };
    row.value = round2(row.value + value(f));
    map.set(k, row);
  }
  return [...map.values()];
}

const pnl = (m: Omit<MetricSpec<PnlBucketFact>, "capability">) =>
  defineMetric("pnl", pnlSource, { capability: "pnl.read", ...m });
const pnlValue =
  (kpi: { compute: (i: { facts: readonly PnlLineFact[] }) => number }) => (i: MetricInput<PnlBucketFact>) =>
    kpi.compute({ facts: i.facts });

const ENGINE_RANK = [...DASHBOARD_ENGINES, "descuento_os", "-"] as string[];
const CHANNEL_RANK = [...DASHBOARD_CHANNELS] as string[];
const byRank = (rank: string[]) => (a: BreakdownRow, b: BreakdownRow) =>
  (rank.indexOf(a.key) + 1 || 99) - (rank.indexOf(b.key) + 1 || 99);

/** Métricas registradas, en el orden del selector del constructor. */
export const METRIC_CATALOG: readonly MetricDefinition[] = [
  pnl({
    id: "pnl.revenue",
    version: 1,
    kpi: pnlRevenue,
    description: "Venta devengada del periodo: OS entregadas (no cobros), venta de membresías y cuotas B2B.",
    widgets: ["kpi", "timeseries", "bars", "ranking", "distribution"],
    filters: ["canal", "motor"],
    breakdowns: ["motor", "canal"],
    drill: { kind: "pnl", section: "ingreso" },
    value: pnlValue(pnlRevenue),
    breakdown: ({ facts }, by) => {
      const revenue = facts.filter((f) => f.section === "ingreso");
      return by === "canal"
        ? groupSum(
            revenue,
            (f) => pnlChannelOf(f.line) ?? "-",
            (k) => CHANNEL_LABELS[k as DashboardChannel] ?? "Sin clasificar",
            (f) => f.amount,
          ).sort(byRank(CHANNEL_RANK))
        : groupSum(
            revenue,
            (f) => f.dimension ?? "-",
            (k) => ENGINE_LABELS[k] ?? k,
            (f) => f.amount,
          ).sort(byRank(ENGINE_RANK));
    },
  }),
  pnl({
    id: "pnl.direct_cost",
    version: 1,
    kpi: pnlDirectCost,
    description:
      "Costo de lo vendido: costo estándar de las OS, variación de insumos y egresos de costo directo.",
    widgets: ["kpi", "timeseries", "bars", "ranking"],
    drill: { kind: "pnl", section: "costo_directo" },
    value: pnlValue(pnlDirectCost),
  }),
  pnl({
    id: "pnl.gross_profit",
    version: 1,
    kpi: pnlGrossProfit,
    description: "Lo que queda de las ventas después del costo directo.",
    widgets: ["kpi", "timeseries", "bars", "ranking"],
    value: pnlValue(pnlGrossProfit),
  }),
  pnl({
    id: "pnl.gross_margin",
    version: 1,
    kpi: pnlGrossMargin,
    description: "Utilidad bruta como porcentaje de las ventas.",
    widgets: ["kpi", "timeseries", "bars", "ranking"],
    value: pnlValue(pnlGrossMargin),
  }),
  pnl({
    id: "pnl.ebitda",
    version: 1,
    kpi: pnlEbitda,
    description: "Resultado operativo antes de depreciación, intereses e impuestos.",
    widgets: ["kpi", "timeseries", "bars", "ranking"],
    value: pnlValue(pnlEbitda),
  }),
  pnl({
    id: "pnl.ebitda_margin",
    version: 1,
    kpi: pnlEbitdaMargin,
    description: "EBITDA gerencial como porcentaje de las ventas.",
    widgets: ["kpi", "timeseries", "bars", "ranking"],
    value: pnlValue(pnlEbitdaMargin),
  }),
  pnl({
    id: "pnl.net_before_tax",
    version: 1,
    kpi: pnlNetBeforeTax,
    description: "EBITDA gerencial menos gastos financieros.",
    widgets: ["kpi", "bars", "ranking"],
    value: pnlValue(pnlNetBeforeTax),
  }),
  pnl({
    id: "pnl.personnel_ratio",
    version: 1,
    kpi: pnlPersonnelRatio,
    description: "Cuánto de cada peso vendido se va en nómina y prestaciones.",
    widgets: ["kpi", "timeseries", "bars", "ranking"],
    drill: { kind: "pnl", section: "gasto", line: "personal" },
    value: pnlValue(pnlPersonnelRatio),
  }),
  pnl({
    id: "expenses.cash_out",
    version: 1,
    kpi: { ...expensesCashOut, sources: ["public.expenses"] },
    description: "Egresos aprobados del periodo, incluida la compra de insumos.",
    widgets: ["kpi", "timeseries", "bars"],
    value: ({ facts }) => pnlStatement({ facts }).cashOut,
  }),
  defineMetric("payments", paymentsSource, {
    id: "payments.collected",
    version: 1,
    kpi: paymentsCollected,
    description: "Cobranza del periodo en recibos válidos, por la fecha del recibo.",
    capability: "payments.read",
    widgets: ["kpi", "timeseries", "bars", "ranking", "distribution"],
    breakdowns: ["forma_pago"],
    drill: { kind: "payments" },
    value: ({ facts }) => paymentsCollected.compute({ facts }),
    breakdown: ({ facts }) =>
      groupSum(
        facts,
        (f) => f.method,
        (_, f) => f.methodName,
        (f) => f.validAmount,
      ).sort((a, b) => b.value - a.value),
  }),
  defineMetric("payments", paymentsSource, {
    id: "payments.cash_in",
    version: 1,
    kpi: paymentsCashIn,
    description: "Cobranza que entra a caja o banco (efectivo, tarjeta y transferencia).",
    capability: "payments.read",
    widgets: ["kpi", "timeseries", "bars"],
    drill: { kind: "payments" },
    value: ({ facts }) => paymentsCashIn.compute({ facts }),
  }),
  defineMetric("pipeline", pipelineSource, {
    id: "pipeline.created",
    version: 1,
    kpi: pipelineCreated,
    description: "Oportunidades comerciales dadas de alta en el periodo (B2B y B2C premium).",
    capability: "pipeline.metrics.read",
    widgets: ["kpi", "timeseries", "bars", "funnel"],
    filters: ["canal"],
    drill: { kind: "pipeline" },
    value: (i) => pipelineCreated.compute(i),
    funnel: (i) => pipelineFunnel(i).map((r) => ({ key: r.stageId, label: r.name, value: r.reached })),
  }),
  defineMetric("pipeline", pipelineSource, {
    id: "pipeline.won_value",
    version: 1,
    kpi: pipelineWonValue,
    description: "Valor de las oportunidades ganadas en el periodo.",
    capability: "pipeline.metrics.read",
    widgets: ["kpi", "timeseries", "bars", "ranking"],
    filters: ["canal"],
    drill: { kind: "pipeline" },
    value: (i) => pipelineWonValue.compute(i),
  }),
  defineMetric("pipeline", pipelineSource, {
    id: "pipeline.conversion_rate",
    version: 1,
    kpi: pipelineConversionRate,
    description: "Porcentaje de oportunidades cerradas en el periodo que se ganaron.",
    capability: "pipeline.metrics.read",
    widgets: ["kpi", "bars"],
    filters: ["canal"],
    drill: { kind: "pipeline" },
    value: (i) => pipelineConversionRate.compute(i),
  }),
  defineMetric("memberships", membershipsSource, {
    id: "membership.active_count",
    version: 1,
    kpi: membershipActiveCount,
    description: "Membresías vigentes al cierre del periodo.",
    capability: "memberships.metrics.read",
    widgets: ["kpi", "bars", "ranking"],
    value: (i) => membershipActiveCount.compute(i),
  }),
  defineMetric("memberships", membershipsSource, {
    id: "membership.new_count",
    version: 1,
    kpi: membershipNewCount,
    name: "Altas de membresía",
    description: "Membresías nuevas en el periodo.",
    capability: "memberships.metrics.read",
    widgets: ["kpi", "bars"],
    value: (i) => membershipNewCount.compute(i),
  }),
  defineMetric("memberships", membershipsSource, {
    id: "membership.mrr",
    version: 1,
    kpi: membershipMrr,
    description: "Ingreso mensual recurrente de las membresías vigentes al cierre del periodo.",
    capability: "memberships.metrics.read",
    widgets: ["kpi", "bars", "ranking"],
    value: (i) => membershipMrr.compute(i),
  }),
];

const BY_ID = new Map(METRIC_CATALOG.map((m) => [m.id, m]));
if (BY_ID.size !== METRIC_CATALOG.length) throw new Error("Métrica duplicada en METRIC_CATALOG");

/** Métrica registrada por id (undefined si no existe: nunca se ejecuta nada fuera del catálogo). */
export const metricById = (id: string): MetricDefinition | undefined => BY_ID.get(id);
