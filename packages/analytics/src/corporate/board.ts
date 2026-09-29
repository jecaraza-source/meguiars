import { ENGINE_LABELS, metricById, type DashboardFacts, type PnlBucketFact } from "../dashboards/catalog";
import { resolveWidget, type ResolveContext, type WidgetConfig } from "../dashboards/resolve";
import { pnlStatement } from "../pnl";
import { serviceKeyOf } from "../services";
import { CORPORATE_CARDS, type CorporateCard } from "./cards";
import { trendOf, type Trend } from "./period";

/**
 * Tablero corporativo (D3): cada tarjeta por centro y consolidada, con la
 * tendencia contra el periodo anterior y las alertas de umbral; ranking de
 * motores y servicios por ingreso y margen. Todo se calcula con el servicio de
 * métricas de D1 (resolveWidget) sobre una lectura de hechos por periodo, así
 * que el consolidado es la misma cifra que el P&L y que los tableros.
 */

/** Umbral de alerta (public.kpi_thresholds). */
export interface ThresholdLike {
  metricId: string;
  channel: string | null;
  /** null = toda la organización (cada centro y el consolidado). */
  detailCenterId: string | null;
  minValue: number | null;
  maxValue: number | null;
}

export interface CardAlert {
  kind: "bajo" | "alto";
  limit: number;
  /** El umbral es del centro o general de la organización. */
  scope: "centro" | "organizacion";
}

export interface CardCell {
  /** Id del centro o "consolidado". */
  key: string;
  label: string;
  value: number;
  trend: Trend;
  alert: CardAlert | null;
}

export interface CorporateCardResult {
  card: CorporateCard;
  status: "ok" | "forbidden";
  consolidated: CardCell | null;
  /** Centros elegidos con permiso para la métrica, en el orden del filtro. */
  centers: CardCell[];
  /** Centros elegidos sin permiso (no suman). */
  centersWithoutAccess: string[];
}

export interface CorporateContext {
  from: string;
  to: string;
  /** Periodo anterior equivalente (null = sin comparativo). */
  previous: { from: string; to: string } | null;
  /** Centros elegidos en el filtro (1..N), con nombre. */
  centers: readonly { id: string; name: string }[];
  /** Centros donde el usuario tiene la capacidad (espejo de la base). */
  allowedCenters: (capability: string) => readonly string[];
  thresholds: readonly ThresholdLike[];
}

export const CONSOLIDATED_KEY = "consolidado";

/** Umbral que aplica: el del centro pisa al general; el consolidado sólo usa el general. */
export function thresholdFor(
  thresholds: readonly ThresholdLike[],
  metricId: string,
  channel: string | null,
  centerId: string | null,
): ThresholdLike | null {
  const same = thresholds.filter((t) => t.metricId === metricId && (t.channel ?? null) === channel);
  return (
    (centerId ? same.find((t) => t.detailCenterId === centerId) : undefined) ??
    same.find((t) => t.detailCenterId === null) ??
    null
  );
}

/** ¿El valor cruza el umbral? (por debajo del mínimo o por encima del máximo). */
export function alertOf(value: number, t: ThresholdLike | null): CardAlert | null {
  if (!t) return null;
  const scope = t.detailCenterId ? "centro" : "organizacion";
  if (t.minValue !== null && value < t.minValue) return { kind: "bajo", limit: t.minValue, scope };
  if (t.maxValue !== null && value > t.maxValue) return { kind: "alto", limit: t.maxValue, scope };
  return null;
}

export const cardWidget = (card: CorporateCard, type: WidgetConfig["type"]): WidgetConfig => ({
  id: card.id,
  metricId: card.metricId,
  type,
  options: card.channel ? { channel: card.channel } : {},
});

const resolveCtx = (
  ctx: Pick<CorporateContext, "centers" | "allowedCenters">,
  from: string,
  to: string,
): ResolveContext => ({
  from,
  to,
  filters: { channel: null, engine: null },
  centers: ctx.centers,
  allowedCenters: ctx.allowedCenters,
});

/** Valor de la tarjeta (consolidado de los centros dados) o null sin permiso. */
export function cardValue(
  card: CorporateCard,
  facts: DashboardFacts,
  ctx: Pick<CorporateContext, "centers" | "allowedCenters">,
  from: string,
  to: string,
): number | null {
  const r = resolveWidget(cardWidget(card, "kpi"), facts, resolveCtx(ctx, from, to));
  return r.status === "ok" && r.data.kind === "kpi" ? r.data.value : null;
}

/** Valor por centro de la tarjeta (sólo centros con permiso). */
function perCenter(
  card: CorporateCard,
  facts: DashboardFacts,
  ctx: Pick<CorporateContext, "centers" | "allowedCenters">,
  from: string,
  to: string,
): Map<string, number> {
  const r = resolveWidget(cardWidget(card, "bars"), facts, resolveCtx(ctx, from, to));
  return r.status === "ok" && r.data.kind === "bars"
    ? new Map(r.data.rows.map((row) => [row.key, row.value]))
    : new Map();
}

export function corporateBoard(
  facts: DashboardFacts,
  previousFacts: DashboardFacts | null,
  ctx: CorporateContext,
  cards: readonly CorporateCard[] = CORPORATE_CARDS,
): CorporateCardResult[] {
  const firstActivity = new Map(
    (facts.centers ?? []).map((c) => [c.detailCenterId, c.firstActivityOn ?? null]),
  );
  const prev = previousFacts && ctx.previous ? { facts: previousFacts, ...ctx.previous } : null;
  return cards.map((card) => {
    const permitted = new Set(ctx.allowedCenters(card.metric.capability));
    const allowed = ctx.centers.filter((c) => permitted.has(c.id));
    const centersWithoutAccess = ctx.centers.filter((c) => !permitted.has(c.id)).map((c) => c.name);
    const consolidated = cardValue(card, facts, ctx, ctx.from, ctx.to);
    if (consolidated === null || allowed.length === 0)
      return { card, status: "forbidden", consolidated: null, centers: [], centersWithoutAccess };
    const byCenter = perCenter(card, facts, ctx, ctx.from, ctx.to);
    const prevByCenter = prev
      ? perCenter(card, prev.facts, ctx, prev.from, prev.to)
      : new Map<string, number>();
    const prevConsolidated = prev ? cardValue(card, prev.facts, ctx, prev.from, prev.to) : null;
    const cell = (
      key: string,
      label: string,
      value: number,
      previous: number | null,
      centerIds: string[],
    ) => ({
      key,
      label,
      value,
      trend: trendOf({
        unit: card.metric.unit,
        higherIsBetter: card.higherIsBetter,
        current: value,
        previous,
        firstActivity: centerIds.map((id) => firstActivity.get(id) ?? null),
        previousFrom: prev?.from ?? null,
      }),
      alert: alertOf(
        value,
        thresholdFor(ctx.thresholds, card.metricId, card.channel, key === CONSOLIDATED_KEY ? null : key),
      ),
    });
    return {
      card,
      status: "ok",
      consolidated: cell(
        CONSOLIDATED_KEY,
        "Consolidado",
        consolidated,
        prevConsolidated,
        allowed.map((c) => c.id),
      ),
      centers: allowed.map((c) =>
        cell(c.id, c.name, byCenter.get(c.id) ?? 0, prev ? (prevByCenter.get(c.id) ?? 0) : null, [c.id]),
      ),
      centersWithoutAccess,
    };
  });
}

// ---------------------------------------------------------------------------
// Ranking de motores y servicios por ingreso y margen
// ---------------------------------------------------------------------------

export interface MixRow {
  key: string;
  label: string;
  revenue: number;
  /** Margen de contribución: ingreso − costo estándar − pago al operador (− variación de insumos, sin motor). */
  margin: number;
  /** Margen ÷ ingreso × 100 (null sin ingreso). */
  marginPct: number | null;
  /** % del ingreso total (null si el total no es positivo). */
  share: number | null;
  quantity: number | null;
}

export interface ReconciliationLine {
  label: string;
  amount: number;
  /** Renglón de total (lo que se concilia). */
  total?: boolean;
}

export interface CorporateMix {
  status: "ok" | "forbidden";
  byEngine: MixRow[];
  byService: MixRow[];
  /** Ventas: servicios + membresías + cuotas B2B = ventas del P&L. */
  revenueReconciliation: ReconciliationLine[];
  /** Margen: servicios + membresías + cuotas − variación de insumos = margen de contribución. */
  marginReconciliation: ReconciliationLine[];
  /** Diferencias de la conciliación (0 = cuadra). */
  revenueDifference: number;
  marginDifference: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number, base: number) => (base > 0 ? round2((n * 100) / base) : null);
export type MixSort = "revenue" | "margin";

const ENGINE_MIX_LABELS: Record<string, string> = {
  ...ENGINE_LABELS,
  "-": "Variación de insumos (sin motor)",
};

/** Ordena por ingreso o por margen (desc.; empates por nombre). */
export function sortMix(rows: readonly MixRow[], by: MixSort): MixRow[] {
  return [...rows].sort((a, b) => b[by] - a[by] || a.label.localeCompare(b.label));
}

export function corporateMix(
  facts: DashboardFacts,
  ctx: Pick<CorporateContext, "centers" | "allowedCenters" | "from" | "to">,
): CorporateMix {
  const revenueMetric = metricById("pnl.revenue")!;
  const permitted = new Set(ctx.allowedCenters(revenueMetric.capability));
  const ids = new Set(ctx.centers.filter((c) => permitted.has(c.id)).map((c) => c.id));
  const empty: CorporateMix = {
    status: "forbidden",
    byEngine: [],
    byService: [],
    revenueReconciliation: [],
    marginReconciliation: [],
    revenueDifference: 0,
    marginDifference: 0,
  };
  if (ids.size === 0) return empty;
  const rctx = resolveCtx(ctx, ctx.from, ctx.to);
  const breakdown = (metricId: string) => {
    const r = resolveWidget(
      { id: metricId, metricId, type: "distribution", options: { breakdown: "motor" } },
      facts,
      rctx,
    );
    return r.status === "ok" && r.data.kind === "distribution" ? r.data.rows : [];
  };
  const revenueByEngine = breakdown("pnl.revenue");
  const marginByEngine = breakdown("pnl.contribution_margin");
  const pnl: readonly PnlBucketFact[] = (facts.pnl ?? []).filter((f) => ids.has(f.detailCenterId));
  const statement = pnlStatement({ facts: pnl });
  const totalRevenue = statement.revenue;
  const engineKeys = [...new Set([...revenueByEngine, ...marginByEngine].map((r) => r.key))];
  const byEngine = engineKeys.map((key) => {
    const revenue = revenueByEngine.find((r) => r.key === key)?.value ?? 0;
    const margin = marginByEngine.find((r) => r.key === key)?.value ?? 0;
    return {
      key,
      label: ENGINE_MIX_LABELS[key] ?? key,
      revenue,
      margin,
      marginPct: pct(margin, revenue),
      share: pct(revenue, totalRevenue),
      quantity: null,
    };
  });

  const services = new Map<string, MixRow & { cost: number }>();
  for (const f of facts.services ?? []) {
    if (!ids.has(f.detailCenterId)) continue;
    const key = serviceKeyOf(f);
    const row = services.get(key) ?? {
      key,
      label: f.serviceName,
      revenue: 0,
      margin: 0,
      marginPct: null,
      share: null,
      quantity: 0,
      cost: 0,
    };
    row.revenue = round2(row.revenue + f.revenue);
    row.cost = round2(row.cost + f.standardCost + (f.operatorPay ?? 0));
    row.quantity = (row.quantity ?? 0) + f.quantity;
    services.set(key, row);
  }
  const byService: MixRow[] = [...services.values()].map(({ cost, ...r }) => {
    const margin = round2(r.revenue - cost);
    return {
      ...r,
      margin,
      marginPct: pct(margin, r.revenue),
      share: pct(r.revenue, totalRevenue),
      quantity: r.key === "descuento_os" ? null : r.quantity,
    };
  });

  const lineOf = (line: string) =>
    round2(pnl.filter((f) => f.section === "ingreso" && f.line === line).reduce((t, f) => t + f.amount, 0));
  const servicesRevenue = round2(byService.reduce((t, r) => t + r.revenue, 0));
  const servicesMargin = round2(byService.reduce((t, r) => t + r.margin, 0));
  const memberships = lineOf("membresias");
  const fees = lineOf("cuotas_b2b");
  const variance = round2(
    pnl
      .filter((f) => f.section === "costo_directo" && f.line === "variacion_insumos")
      .reduce((t, f) => t + f.amount, 0),
  );
  const contribution = round2(marginByEngine.reduce((t, r) => t + r.value, 0));
  const revenueDifference = round2(totalRevenue - (servicesRevenue + memberships + fees));
  const marginDifference = round2(contribution - (servicesMargin + memberships + fees - variance));
  return {
    status: "ok",
    byEngine: sortMix(byEngine, "revenue"),
    byService: sortMix(byService, "revenue"),
    revenueReconciliation: [
      { label: "Ventas de OS por servicio", amount: servicesRevenue },
      { label: "Venta de membresías", amount: memberships },
      { label: "Cuotas B2B", amount: fees },
      { label: "Ventas (estado de resultados)", amount: totalRevenue, total: true },
    ],
    marginReconciliation: [
      { label: "Margen de servicios (venta − costo estándar − pago a operadores)", amount: servicesMargin },
      { label: "Venta de membresías y cuotas B2B", amount: round2(memberships + fees) },
      { label: "Variación real de insumos", amount: round2(0 - variance) },
      { label: "Margen de contribución", amount: contribution, total: true },
    ],
    revenueDifference,
    marginDifference,
  };
}
