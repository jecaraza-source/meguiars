import { formatMoney } from "../catalog/presenter";
import { formatDateOnly } from "../memberships/presenter";
import { formatPercent } from "../pnl/presenter";
import {
  DASHBOARD_CHANNEL_LABELS,
  DASHBOARD_ENGINE_LABELS,
  dashboardsCopy,
  KPI_FILTER_LABELS,
  KPI_PERIOD_LABELS,
  kpisCopy,
  METRIC_SOURCE_LABELS,
  METRIC_UNIT_LABELS,
} from "./copy";
import {
  dashboardDrill,
  type DashboardDrillTarget,
  type DashboardFilters,
  type DashboardWidget,
  type DashboardWidgetType,
  type MetricDrillRef,
} from "./dashboards";

/** Resultado de un widget (mismo contrato que WidgetResult de @meguiars/analytics). */
export interface WidgetResultLike {
  status: "ok" | "forbidden" | "unknown_metric" | "unsupported";
  metric?: {
    id: string;
    name: string;
    description: string;
    unit: string;
    formula: string;
    source: string;
    sourceTables: readonly string[];
    drill: MetricDrillRef | null;
  };
  data?:
    | { kind: "kpi"; value: number }
    | {
        kind: "timeseries";
        grain: "dia" | "semana" | "mes";
        points: { from: string; to: string; value: number }[];
      }
    | {
        kind: "bars" | "ranking" | "distribution" | "funnel";
        rows: { key: string; label: string; value: number; share: number | null }[];
      };
  ignoredFilters?: readonly string[];
  centersWithoutAccess?: readonly string[];
}

const intFmt = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

/** Valor de una métrica según su unidad (igual en web, móvil y exportación). */
export function formatMetricValue(unit: string, value: number): string {
  switch (unit) {
    case "currency":
      return formatMoney(value);
    case "percent":
      return formatPercent(value);
    case "count":
      return intFmt.format(value);
    case "minutes":
      return `${intFmt.format(value)} min`;
    case "hours":
      return `${decFmt.format(value)} h`;
    default:
      return decFmt.format(value);
  }
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** Etiqueta del periodo de una serie: "14 sep", "Sem. 14 sep", "sep 2026". */
export function seriesLabel(from: string, grain: "dia" | "semana" | "mes"): string {
  const [y, m, d] = from.split("-");
  const month = MONTHS[Number(m) - 1] ?? m;
  if (grain === "mes") return `${month} ${y}`;
  const day = `${Number(d)} ${month}`;
  return grain === "semana" ? `Sem. ${day}` : day;
}

export interface PresentedRow {
  key: string;
  label: string;
  value: string;
  raw: number;
  share: string | null;
  /** Largo de la barra (0–100) relativo al mayor valor absoluto. */
  pct: number;
}

export interface PresentedWidget {
  id: string;
  type: DashboardWidgetType;
  title: string;
  /** Nombre de la métrica cuando el widget tiene título propio. */
  subtitle: string | null;
  status: WidgetResultLike["status"];
  /** Mensaje en lugar de datos (sin permiso, sin datos…). */
  message: string | null;
  /** KPI. */
  value: string | null;
  raw: number | null;
  rows: PresentedRow[];
  notes: string[];
  unit: string;
  definition: string;
  formula: string;
  source: string;
  drill: DashboardDrillTarget | null;
  colSpan: number;
  rowSpan: number;
}

const pctOf = (v: number, max: number) =>
  max > 0 ? Math.max(0, Math.min(100, Math.round((Math.abs(v) * 100) / max))) : 0;

/** Widget listo para dibujar (tarjeta, lista con barras, serie o embudo). */
export function presentWidget(
  widget: DashboardWidget,
  result: WidgetResultLike,
  filters: DashboardFilters,
): PresentedWidget {
  const m = result.metric;
  const base: PresentedWidget = {
    id: widget.id,
    type: widget.type,
    title: widget.title ?? m?.name ?? widget.metricId,
    subtitle: widget.title && m ? m.name : null,
    status: result.status,
    message: null,
    value: null,
    raw: null,
    rows: [],
    notes: [],
    unit: m?.unit ?? "",
    definition: m?.description ?? "",
    formula: m?.formula ?? "",
    source: m ? `${METRIC_SOURCE_LABELS[m.source] ?? m.source} · ${m.sourceTables.join(", ")}` : "",
    drill: null,
    colSpan: widget.colSpan,
    rowSpan: widget.rowSpan,
  };
  if (result.status === "unknown_metric") return { ...base, message: dashboardsCopy.unknownMetric };
  if (result.status === "unsupported") return { ...base, message: dashboardsCopy.unsupported };
  if (result.status === "forbidden" || !m || !result.data)
    return { ...base, message: dashboardsCopy.forbidden };

  const fmt = (v: number) => formatMetricValue(m.unit, v);
  const notes: string[] = [];
  const ignored = (result.ignoredFilters ?? []).map((f) => (f === "canal" ? "canal" : "motor"));
  if (ignored.length > 0) notes.push(dashboardsCopy.ignoredFilter(ignored.join(" y ")));
  if ((result.centersWithoutAccess ?? []).length > 0)
    notes.push(dashboardsCopy.withoutAccess(result.centersWithoutAccess!.join(", ")));
  const drill = m.drill ? dashboardDrill(m.drill, filters) : null;
  const d = result.data;
  if (d.kind === "kpi") return { ...base, notes, drill, value: fmt(d.value), raw: d.value };
  const list =
    d.kind === "timeseries"
      ? d.points.map((p) => ({
          key: p.from,
          label: seriesLabel(p.from, d.grain),
          value: p.value,
          share: null,
        }))
      : d.rows;
  const max = Math.max(0, ...list.map((r) => Math.abs(r.value)));
  const rows = list.map((r) => ({
    key: r.key,
    label: r.label,
    value: fmt(r.value),
    raw: r.value,
    share: r.share === null ? null : formatPercent(r.share),
    pct: pctOf(r.value, max),
  }));
  const empty = list.length === 0 || list.every((r) => r.value === 0);
  return { ...base, notes, drill, rows, message: empty ? dashboardsCopy.noData : null };
}

/** Resumen de filtros para encabezados y exportación. */
export function dashboardFiltersLabel(f: DashboardFilters, centerName: (id: string) => string): string {
  return [
    f.from === f.to ? formatDateOnly(f.from) : `${formatDateOnly(f.from)} – ${formatDateOnly(f.to)}`,
    f.centerIds.map(centerName).join(", "),
    f.channel ? `${dashboardsCopy.channel}: ${DASHBOARD_CHANNEL_LABELS[f.channel]}` : null,
    f.engine ? `${dashboardsCopy.engine}: ${DASHBOARD_ENGINE_LABELS[f.engine]}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const csvCell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Snapshot del tablero en CSV (web lo descarga con BOM; móvil lo comparte): una
 * fila por valor de cada widget, con los filtros aplicados. Valores con punto
 * decimal y sin símbolo.
 */
export function dashboardSnapshotCsv(
  dashboardName: string,
  filters: DashboardFilters,
  centerName: (id: string) => string,
  widgets: readonly PresentedWidget[],
): string {
  const header = [
    "tablero",
    "periodo_desde",
    "periodo_hasta",
    "centros",
    "canal",
    "motor",
    "widget",
    "tipo",
    "unidad",
    "clave",
    "etiqueta",
    "valor",
    "participacion",
  ];
  const common = [
    dashboardName,
    filters.from,
    filters.to,
    filters.centerIds.map(centerName).join(" | "),
    filters.channel ?? "",
    filters.engine ?? "",
  ];
  const lines: (string | number | null)[][] = [];
  for (const w of widgets) {
    if (w.status !== "ok") continue;
    const head = [...common, w.title, w.type, w.unit];
    if (w.raw !== null) lines.push([...head, "total", "Total", Number(w.raw.toFixed(2)), null]);
    for (const r of w.rows)
      lines.push([
        ...head,
        r.key,
        r.label,
        Number(r.raw.toFixed(2)),
        r.share === null ? null : r.share.replace(" %", ""),
      ]);
  }
  return [header, ...lines].map((r) => r.map(csvCell).join(",")).join("\n");
}

/** Mensaje de error de tableros para la UI. */
export function dashboardsErrorMessage(error: { kind: string; message: string }): string {
  if (error.kind === "unavailable") return dashboardsCopy.onlineOnly;
  if (error.kind === "permission_denied" && !error.message) return dashboardsCopy.forbiddenDashboard;
  if (error.kind === "not_found" && !error.message) return dashboardsCopy.notFound;
  return error.message;
}

/** KPI del registro (mismo contrato que KpiEntry de @meguiars/analytics). */
export interface KpiSheetInput {
  definition: string;
  numerator: string;
  denominator: string | null;
  period: "rango" | "corte";
  notes: string;
  channel: string | null;
  validFilters: readonly string[];
  metric: {
    unit: string;
    formula: string;
    source: string;
    sourceTables: readonly string[];
    capability: string;
  };
}

/** Ficha del KPI para mostrarla igual en web y móvil. */
export function kpiSheet(k: KpiSheetInput): { label: string; value: string }[] {
  return [
    { label: kpisCopy.definition, value: k.definition },
    { label: kpisCopy.numerator, value: k.numerator },
    { label: kpisCopy.denominator, value: k.denominator ?? "—" },
    {
      label: kpisCopy.validFilters,
      value: [
        ...k.validFilters.map((f) => KPI_FILTER_LABELS[f] ?? f),
        ...(k.channel
          ? [kpisCopy.fixedChannel(DASHBOARD_CHANNEL_LABELS[k.channel as "b2c"] ?? k.channel)]
          : []),
      ].join(", "),
    },
    { label: kpisCopy.period, value: KPI_PERIOD_LABELS[k.period] },
    { label: kpisCopy.unit, value: METRIC_UNIT_LABELS[k.metric.unit] ?? k.metric.unit },
    { label: kpisCopy.formula, value: k.metric.formula },
    {
      label: kpisCopy.source,
      value: `${METRIC_SOURCE_LABELS[k.metric.source] ?? k.metric.source} · ${k.metric.sourceTables.join(", ")}`,
    },
    { label: kpisCopy.permission, value: k.metric.capability },
    { label: kpisCopy.notes, value: k.notes },
  ];
}
