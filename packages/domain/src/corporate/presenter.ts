import { formatMoney } from "../catalog/presenter";
import { formatDateOnly } from "../memberships/presenter";
import { formatMetricValue } from "../dashboards/presenter";
import { dashboardDrill, type DashboardDrillTarget, type DashboardFilters } from "../dashboards/dashboards";
import { corporateCopy } from "./copy";
import { corporateDrillHref, type CorporateDrillPath, type KpiThreshold } from "./corporate";

/**
 * Presentación del tablero corporativo (D3): recibe los resultados de
 * @meguiars/analytics (corporateBoard / corporateMix / corporateDrill) y los
 * deja listos para dibujar igual en web y móvil.
 */

/** Tendencia (mismo contrato que Trend de @meguiars/analytics). */
export interface TrendLike {
  status: "ok" | "invalid";
  previous: number | null;
  delta?: number;
  mode?: "percent" | "points";
  direction?: "up" | "down" | "flat";
  favorable?: boolean | null;
  reason?: string;
}

export interface CardCellLike {
  key: string;
  label: string;
  value: number;
  trend: TrendLike;
  alert: { kind: "bajo" | "alto"; limit: number; scope: string } | null;
}

export interface CorporateCardLike {
  card: {
    id: string;
    name: string;
    metricId: string;
    channel: string | null;
    drill: string;
    metric: { unit: string; name: string; description: string; formula: string };
  };
  status: "ok" | "forbidden";
  consolidated: CardCellLike | null;
  centers: readonly CardCellLike[];
  centersWithoutAccess: readonly string[];
}

export type TrendTone = "good" | "bad" | "neutral" | "none";

export interface PresentedTrend {
  /** "▲ 20.0 %", "▼ 6.2 pts", "= 0.0 %" o "—". */
  text: string;
  tone: TrendTone;
  /** Explicación (valor anterior o por qué no hay comparativo). */
  hint: string;
}

export interface PresentedCell {
  key: string;
  label: string;
  value: string;
  raw: number;
  trend: PresentedTrend;
  alert: { text: string; kind: "bajo" | "alto" } | null;
  href: string;
  path: CorporateDrillPath;
}

export interface PresentedCard {
  id: string;
  name: string;
  unit: string;
  definition: string;
  formula: string;
  status: "ok" | "forbidden";
  message: string | null;
  consolidated: PresentedCell | null;
  centers: PresentedCell[];
  alerts: number;
  notes: string[];
  href: string;
  path: CorporateDrillPath;
}

const decFmt = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function presentTrend(t: TrendLike, unit: string): PresentedTrend {
  if (t.status !== "ok" || t.delta === undefined) {
    return {
      text: "—",
      tone: "none",
      hint: corporateCopy.trendInvalid[t.reason ?? "sin_periodo"] ?? corporateCopy.noComparison,
    };
  }
  const arrow = t.direction === "up" ? "▲" : t.direction === "down" ? "▼" : "=";
  const magnitude = decFmt.format(Math.abs(t.delta));
  const text = `${arrow} ${magnitude} ${t.mode === "points" ? "pts" : "%"}`;
  const tone: TrendTone =
    t.favorable === null || t.favorable === undefined ? "neutral" : t.favorable ? "good" : "bad";
  return {
    text,
    tone,
    hint: `${corporateCopy.previous}: ${formatMetricValue(unit, t.previous ?? 0)}`,
  };
}

function presentCell(
  c: CardCellLike,
  unit: string,
  path: CorporateDrillPath,
  filters: DashboardFilters,
  allowedCenterIds: readonly string[],
): PresentedCell {
  return {
    key: c.key,
    label: c.label,
    value: formatMetricValue(unit, c.value),
    raw: c.value,
    trend: presentTrend(c.trend, unit),
    alert: c.alert
      ? {
          kind: c.alert.kind,
          text: `${(c.alert.kind === "bajo" ? corporateCopy.alertLow : corporateCopy.alertHigh)(
            formatMetricValue(unit, c.alert.limit),
          )} · ${corporateCopy.alertScope[c.alert.scope] ?? c.alert.scope}`,
        }
      : null,
    href: corporateDrillHref(path, filters, allowedCenterIds),
    path,
  };
}

/** Tarjeta lista para dibujar: consolidado, celdas por centro, tendencia y alertas. */
export function presentCorporateCard(
  r: CorporateCardLike,
  filters: DashboardFilters,
  allowedCenterIds: readonly string[],
): PresentedCard {
  const unit = r.card.metric.unit;
  const path: CorporateDrillPath = { cardId: r.card.id };
  const base = {
    id: r.card.id,
    name: r.card.name,
    unit,
    definition: r.card.metric.description,
    formula: r.card.metric.formula,
    href: corporateDrillHref(path, filters, allowedCenterIds),
    path,
  };
  if (r.status !== "ok" || !r.consolidated)
    return {
      ...base,
      status: "forbidden",
      message: corporateCopy.forbidden,
      consolidated: null,
      centers: [],
      alerts: 0,
      notes: [],
    };
  const centerPath = (key: string): CorporateDrillPath =>
    r.card.drill === "none" ? path : { cardId: r.card.id, center: key };
  const consolidated = presentCell(r.consolidated, unit, path, filters, allowedCenterIds);
  const centers = r.centers.map((c) => presentCell(c, unit, centerPath(c.key), filters, allowedCenterIds));
  return {
    ...base,
    status: "ok",
    message: null,
    consolidated,
    centers,
    alerts: [consolidated, ...centers].filter((c) => c.alert).length,
    notes:
      r.centersWithoutAccess.length > 0
        ? [corporateCopy.withoutAccess(r.centersWithoutAccess.join(", "))]
        : [],
  };
}

// ---------------------------------------------------------------------------
// Ranking de motores y servicios
// ---------------------------------------------------------------------------

export interface MixRowLike {
  key: string;
  label: string;
  revenue: number;
  margin: number;
  marginPct: number | null;
  share: number | null;
  quantity: number | null;
}

const pctText = (p: number | null) => (p === null ? "—" : `${p.toFixed(2)} %`);

export function presentMixRow(r: MixRowLike, maxAbs: number) {
  return {
    key: r.key,
    label: r.label,
    revenue: formatMoney(r.revenue),
    margin: formatMoney(r.margin),
    marginPct: pctText(r.marginPct),
    share: pctText(r.share),
    quantity: r.quantity === null ? "—" : String(r.quantity),
    /** Largo de la barra (0–100) por ingreso. */
    pct: maxAbs > 0 ? Math.round((Math.abs(r.revenue) * 100) / maxAbs) : 0,
    negative: r.revenue < 0 || r.margin < 0,
  };
}

export function presentMixRows(rows: readonly MixRowLike[]) {
  const max = Math.max(0, ...rows.map((r) => Math.abs(r.revenue)));
  return rows.map((r) => presentMixRow(r, max));
}

export function presentReconciliation(
  lines: readonly { label: string; amount: number; total?: boolean }[],
  difference: number,
) {
  return {
    lines: lines.map((l) => ({ label: l.label, amount: formatMoney(l.amount), total: l.total === true })),
    status:
      difference === 0 ? corporateCopy.reconciled : corporateCopy.notReconciled(formatMoney(difference)),
    ok: difference === 0,
  };
}

// ---------------------------------------------------------------------------
// Drill-down
// ---------------------------------------------------------------------------

export interface DrillRowLike {
  key: string;
  label: string;
  value: number;
  share: number | null;
  next: CorporateDrillPath | null;
  pnl: {
    section: string;
    line?: string | undefined;
    dimension?: string | undefined;
    detailCenterIds: string[];
  } | null;
  detail: string | null;
  level: 0 | 1;
}

export interface DrillLevelLike {
  kind: string;
  title: string;
  unit: string;
  parent: { label: string; value: number };
  rows: readonly DrillRowLike[];
  additive: boolean;
  sum: number | null;
  difference: number | null;
  note: string | null;
}

export type CorporateDrillTarget =
  { kind: "drill"; path: CorporateDrillPath; href: string } | { kind: "pnl"; target: DashboardDrillTarget };

export interface PresentedDrillRow {
  key: string;
  label: string;
  value: string;
  raw: number;
  share: string | null;
  detail: string | null;
  level: 0 | 1;
  target: CorporateDrillTarget | null;
  pct: number;
}

export interface PresentedDrillLevel {
  kind: string;
  title: string;
  parentLabel: string;
  parentValue: string;
  rows: PresentedDrillRow[];
  sum: string | null;
  reconciliation: { ok: boolean; text: string } | null;
  note: string | null;
}

export function presentDrillLevel(
  l: DrillLevelLike,
  filters: DashboardFilters,
  allowedCenterIds: readonly string[],
): PresentedDrillLevel {
  const fmt = (v: number) => formatMetricValue(l.unit, v);
  const max = Math.max(0, ...l.rows.map((r) => Math.abs(r.value)));
  return {
    kind: l.kind,
    title: l.title,
    parentLabel: l.parent.label,
    parentValue: formatMetricValue(l.kind === "pnl" ? l.unit : l.unit, l.parent.value),
    rows: l.rows.map((r) => ({
      key: r.key,
      label: r.label,
      value: fmt(r.value),
      raw: r.value,
      share: r.share === null ? null : pctText(r.share),
      detail: r.detail,
      level: r.level,
      pct: max > 0 ? Math.round((Math.abs(r.value) * 100) / max) : 0,
      target: r.next
        ? { kind: "drill", path: r.next, href: corporateDrillHref(r.next, filters, allowedCenterIds) }
        : r.pnl && r.pnl.section !== "fuera_pnl"
          ? {
              kind: "pnl",
              target: dashboardDrill(
                { kind: "pnl", section: r.pnl.section as "ingreso", line: r.pnl.line },
                { ...filters, centerIds: r.pnl.detailCenterIds, channel: null, engine: null },
              ),
            }
          : null,
    })),
    sum: l.sum === null ? null : fmt(l.sum),
    reconciliation:
      l.difference === null
        ? null
        : {
            ok: l.difference === 0,
            text:
              l.difference === 0
                ? corporateCopy.drillReconciled
                : corporateCopy.drillDifference(fmt(l.difference)),
          },
    note: l.note,
  };
}

// ---------------------------------------------------------------------------
// Umbrales y exportación
// ---------------------------------------------------------------------------

/** Umbral legible: "Ventas · Todos los centros · mín. $3,000.00". */
export function presentThreshold(
  t: KpiThreshold,
  cardName: string,
  unit: string,
  centerName: (id: string) => string,
) {
  const limits = [
    t.minValue !== null ? `${corporateCopy.min}: ${formatMetricValue(unit, t.minValue)}` : null,
    t.maxValue !== null ? `${corporateCopy.max}: ${formatMetricValue(unit, t.maxValue)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    id: t.id,
    card: cardName,
    center: t.detailCenterId ? centerName(t.detailCenterId) : corporateCopy.allCentersOption,
    limits,
  };
}

const csvCell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Snapshot del tablero en CSV: una fila por KPI y centro (más el consolidado). */
export function corporateSnapshotCsv(
  filters: DashboardFilters,
  centerName: (id: string) => string,
  cards: readonly CorporateCardLike[],
): string {
  const header = [
    "kpi",
    "unidad",
    "periodo_desde",
    "periodo_hasta",
    "centro",
    "valor",
    "anterior",
    "cambio",
    "alerta",
  ];
  const lines: (string | number | null)[][] = [];
  for (const r of cards) {
    if (r.status !== "ok" || !r.consolidated) continue;
    for (const c of [...r.centers, r.consolidated])
      lines.push([
        r.card.name,
        r.card.metric.unit,
        filters.from,
        filters.to,
        c.key === "consolidado" ? corporateCopy.consolidated : centerName(c.key),
        Number(c.value.toFixed(2)),
        c.trend.previous === null ? null : Number(c.trend.previous.toFixed(2)),
        c.trend.status === "ok" && c.trend.delta !== undefined
          ? `${c.trend.delta}${c.trend.mode === "points" ? " pts" : " %"}`
          : null,
        c.alert ? `${c.alert.kind} ${c.alert.limit}` : null,
      ]);
  }
  return [header, ...lines].map((l) => l.map(csvCell).join(",")).join("\n");
}

/** Periodo legible "1 sep 2026 – 28 sep 2026". */
export const corporatePeriodLabel = (from: string, to: string) =>
  from === to ? formatDateOnly(from) : `${formatDateOnly(from)} – ${formatDateOnly(to)}`;
