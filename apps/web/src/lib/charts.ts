import "server-only";
import {
  factsGrain,
  resolveGrain,
  resolveWidget,
  type CorporateMix,
  type DashboardFacts,
  type WidgetConfig,
} from "@meguiars/analytics";
import {
  activeCenterAccess,
  formatMoney,
  seriesLabel,
  todayIn,
  type DashboardRepository,
  type SignedInState,
} from "@meguiars/domain";
import type { BarDatum, ChartData, ChartSeries } from "@/components/charts";
import { centersWith } from "./dashboards";

/**
 * Datos de las gráficas de Finanzas y Dirección. Usan el mismo motor de
 * métricas que los tableros (resolveWidget sobre public.dashboard_facts), así
 * que cada valor cuadra con los KPIs y respeta los permisos por centro.
 */

const DAY_MS = 86_400_000;
const addDays = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const NO_FILTERS = { channel: null, engine: null };
const dayFmt = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });
const longLabel = (from: string, to: string) =>
  from === to
    ? dayFmt.format(new Date(`${from}T00:00:00Z`))
    : `${dayFmt.format(new Date(`${from}T00:00:00Z`))} – ${dayFmt.format(new Date(`${to}T00:00:00Z`))}`;

type Series = { from: string; to: string; value: number }[];

function timeseries(
  state: SignedInState,
  facts: DashboardFacts,
  metricId: string,
  grain: "dia" | "semana" | "mes",
  centers: readonly { id: string; name: string }[],
  from: string,
  to: string,
): Series | null {
  const r = resolveWidget({ id: metricId, metricId, type: "timeseries", options: { grain } }, facts, {
    from,
    to,
    filters: NO_FILTERS,
    centers,
    allowedCenters: (cap) => centersWith(state, cap),
  });
  return r.status === "ok" && r.data.kind === "timeseries" ? r.data.points : null;
}

function chartOf(
  points: Series,
  grain: "dia" | "semana" | "mes",
  series: { name: string; values: (Series | null)[] }[],
): ChartData {
  return {
    categories: points.map((p) => ({
      key: p.from,
      label: grain === "mes" ? seriesLabel(p.from, grain).split(" ")[0]! : seriesLabel(p.from, grain),
      long: grain === "mes" ? seriesLabel(p.from, grain) : longLabel(p.from, p.to),
    })),
    series: series.flatMap((s, i) => {
      const values = s.values[0];
      if (!values) return [];
      return [
        {
          name: s.name,
          color: (i + 1) as ChartSeries["color"],
          values: values.map((p) => p.value),
          display: values.map((p) => formatMoney(p.value)),
        },
      ];
    }),
  };
}

export interface FinanceCharts {
  daily: ChartData | null;
  monthly: ChartData | null;
  methods: BarDatum[] | null;
}

/** Finanzas del centro activo: ventas por día (30 días), resultado por mes (6 meses) y cobranza por forma de pago. */
export async function loadFinanceCharts(
  state: SignedInState,
  repo: DashboardRepository,
): Promise<FinanceCharts> {
  const center = activeCenterAccess(state)!.center;
  const scope = [{ id: center.id, name: center.name }];
  const today = todayIn(center.timezone);
  const from30 = addDays(today, -29);
  const [y, m] = today.split("-").map(Number) as [number, number];
  const start = new Date(Date.UTC(y, m - 1 - 5, 1)).toISOString().slice(0, 10);
  const [daily, monthly] = await Promise.all([
    repo.facts({
      sources: ["pnl", "payments"],
      detailCenterIds: [center.id],
      from: from30,
      to: today,
      grain: "dia",
    }),
    repo.facts({ sources: ["pnl"], detailCenterIds: [center.id], from: start, to: today, grain: "mes" }),
  ]);
  const result: FinanceCharts = { daily: null, monthly: null, methods: null };
  if (daily.ok) {
    const facts = daily.data as DashboardFacts;
    const revenue = timeseries(state, facts, "pnl.revenue", "dia", scope, from30, today);
    if (revenue) result.daily = chartOf(revenue, "dia", [{ name: "Ventas", values: [revenue] }]);
    const r = resolveWidget(
      {
        id: "pay",
        metricId: "payments.collected",
        type: "distribution",
        options: { breakdown: "forma_pago" },
      },
      facts,
      {
        from: from30,
        to: today,
        filters: NO_FILTERS,
        centers: scope,
        allowedCenters: (cap) => centersWith(state, cap),
      },
    );
    if (r.status === "ok" && r.data.kind !== "kpi" && r.data.kind !== "timeseries")
      result.methods = r.data.rows.map((row) => ({
        key: row.key,
        label: row.label,
        value: row.value,
        display: formatMoney(row.value),
        note: row.share === null ? null : `${Math.round(row.share)} % del total`,
      }));
  }
  if (monthly.ok) {
    const facts = monthly.data as DashboardFacts;
    const s = (id: string) => timeseries(state, facts, id, "mes", scope, start, today);
    const revenue = s("pnl.revenue");
    if (revenue)
      result.monthly = chartOf(revenue, "mes", [
        { name: "Ventas", values: [revenue] },
        { name: "Utilidad bruta", values: [s("pnl.gross_profit")] },
        { name: "EBITDA", values: [s("pnl.ebitda")] },
      ]);
  }
  return result;
}

export interface CorporateCharts {
  trend: ChartData | null;
  /** Una línea por centro (hasta 3) o el consolidado. */
  trendNote: string;
  engines: BarDatum[];
  services: BarDatum[];
}

/** Dirección: tendencia de ventas por centro en el periodo filtrado y mezcla por motor y servicio. */
export async function loadCorporateCharts(
  state: SignedInState,
  repo: DashboardRepository,
  view: {
    filters: { from: string; to: string; centerIds: string[] };
    chosen: readonly { id: string; name: string }[];
    mix: CorporateMix | null;
    error: string | null;
  },
): Promise<CorporateCharts> {
  const { from, to, centerIds } = view.filters;
  const empty: CorporateCharts = { trend: null, trendNote: "", engines: [], services: [] };
  if (view.error || centerIds.length === 0) return empty;
  const grain = resolveGrain("auto", from, to);
  const widget: WidgetConfig = { id: "t", metricId: "pnl.revenue", type: "timeseries", options: { grain } };
  const facts = await repo.facts({
    sources: ["pnl"],
    detailCenterIds: centerIds,
    from,
    to,
    grain: factsGrain([widget], from, to),
  });
  let trend: ChartData | null = null;
  let trendNote = "";
  if (facts.ok) {
    const f = facts.data as DashboardFacts;
    const perCenter = view.chosen.length <= 3;
    const groups = perCenter ? view.chosen.map((c) => [c]) : [view.chosen];
    const lines = groups.map((g) => ({
      name: perCenter ? g[0]!.name : "Todos los centros",
      values: [timeseries(state, f, "pnl.revenue", grain, g, from, to)],
    }));
    const first = lines.find((l) => l.values[0])?.values[0];
    if (first) trend = chartOf(first, grain, lines);
    trendNote = perCenter
      ? "Una línea por centro."
      : "Más de tres centros: se muestra el consolidado (compáralos en la tabla).";
  }
  const bars = (rows: CorporateMix["byEngine"], limit: number): BarDatum[] =>
    [...rows]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit)
      .map((r) => ({
        key: r.key,
        label: r.label,
        value: r.revenue,
        display: formatMoney(r.revenue),
        note: `Margen ${formatMoney(r.margin)}${r.share === null ? "" : ` · ${Math.round(r.share)} % del ingreso`}`,
      }));
  const mix = view.mix?.status === "ok" ? view.mix : null;
  return {
    trend,
    trendNote,
    engines: mix ? bars(mix.byEngine, 8) : [],
    services: mix ? bars(mix.byService, 8) : [],
  };
}
