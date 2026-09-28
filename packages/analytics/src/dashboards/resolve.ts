import {
  metricById,
  type DashboardChannel,
  type DashboardFacts,
  type FactsGrain,
  type MetricBreakdown,
  type MetricDefinition,
  type MetricFilter,
  type MetricFilters,
  type MetricInput,
  type MetricSource,
  type WidgetType,
} from "./catalog";

/**
 * Servicio de métricas de los tableros: resuelve cada widget por el id de su
 * métrica con parámetros acotados (centros, periodo, canal, motor y opciones
 * validadas). Web y móvil llaman a lo mismo con los mismos hechos, así el
 * valor es idéntico. Los hechos se piden una sola vez por tablero
 * (requiredSources + factsGrain → public.dashboard_facts): sin N+1.
 */

export const SERIES_GRAINS = ["dia", "semana", "mes"] as const;
export type SeriesGrain = (typeof SERIES_GRAINS)[number];
export type GrainOption = "auto" | SeriesGrain;

/** Máximo de días de una serie diaria (igual que public.dashboard_facts). */
export const DAILY_MAX_DAYS = 93;

export interface WidgetOptions {
  grain?: GrainOption | undefined;
  /** Canal fijo del widget (vista de un KPI como "Ventas B2C"); pisa el filtro global. */
  channel?: DashboardChannel | undefined;
  limit?: number | undefined;
  breakdown?: MetricBreakdown | undefined;
}

export interface WidgetConfig {
  id: string;
  metricId: string;
  type: WidgetType;
  options: WidgetOptions;
}

export interface ResolveContext {
  from: string;
  to: string;
  filters: MetricFilters;
  /** Centros elegidos en el filtro global (id y nombre). */
  centers: readonly { id: string; name: string }[];
  /** Centros donde el usuario tiene la capacidad (espejo de la base; la base filtra igual). */
  allowedCenters: (capability: string) => readonly string[];
}

export interface WidgetRow {
  key: string;
  label: string;
  value: number;
  /** % del total (distribución, ranking) o de la primera etapa (embudo); null si no aplica. */
  share: number | null;
}

export interface SeriesPoint {
  /** Inicio y fin del periodo (AAAA-MM-DD). */
  from: string;
  to: string;
  value: number;
}

export type WidgetData =
  | { kind: "kpi"; value: number }
  | { kind: "timeseries"; grain: SeriesGrain; points: SeriesPoint[] }
  | { kind: "bars" | "ranking" | "distribution" | "funnel"; rows: WidgetRow[] };

export type WidgetResult =
  | { status: "unknown_metric" | "unsupported"; widgetId: string }
  | { status: "forbidden"; widgetId: string; metric: MetricDefinition }
  | {
      status: "ok";
      widgetId: string;
      metric: MetricDefinition;
      data: WidgetData;
      /** Filtros activos que la métrica no respeta (se avisa en el widget). */
      ignoredFilters: MetricFilter[];
      /** Centros elegidos sin permiso para la métrica (no suman). */
      centersWithoutAccess: string[];
    };

const DAY_MS = 86_400_000;
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fromTime = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => fromTime(toTime(d) + n * DAY_MS);
const daysBetween = (from: string, to: string) => Math.round((toTime(to) - toTime(from)) / DAY_MS);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Inicio del periodo de la serie al que pertenece un día (espejo de private.dashboard_bucket). */
export function bucketStart(day: string, from: string, grain: FactsGrain): string {
  if (grain === "total") return from;
  if (grain === "dia") return day;
  if (grain === "mes") {
    const start = `${day.slice(0, 7)}-01`;
    return start < from ? from : start;
  }
  const weekday = new Date(toTime(day)).getUTCDay(); // 0 = domingo
  const monday = addDays(day, -((weekday + 6) % 7));
  return monday < from ? from : monday;
}

/** Periodos de la serie en el rango (el primero y el último se recortan). */
export function seriesBuckets(from: string, to: string, grain: SeriesGrain): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  let start = from;
  while (start <= to && out.length < 400) {
    let next: string;
    if (grain === "dia") next = addDays(start, 1);
    else if (grain === "semana") {
      const weekday = new Date(toTime(start)).getUTCDay();
      next = addDays(start, 7 - ((weekday + 6) % 7));
    } else {
      const d = new Date(toTime(start));
      next = fromTime(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    }
    const end = addDays(next, -1);
    out.push({ from: start, to: end > to ? to : end });
    start = next;
  }
  return out;
}

const GRAIN_RANK: Record<SeriesGrain, number> = { dia: 0, semana: 1, mes: 2 };

/** Periodicidad de un widget: automática por largo del rango; la diaria se acota. */
export function resolveGrain(option: GrainOption | undefined, from: string, to: string): SeriesGrain {
  const days = daysBetween(from, to) + 1;
  if (!option || option === "auto") return days <= 31 ? "dia" : days <= 184 ? "semana" : "mes";
  if (option === "dia" && days > DAILY_MAX_DAYS) return "semana";
  return option;
}

/** Periodicidad con que se piden los hechos: la más fina que necesite alguna serie ("total" si no hay series). */
export function factsGrain(widgets: readonly WidgetConfig[], from: string, to: string): FactsGrain {
  const grains = widgets
    .filter((w) => w.type === "timeseries" && metricById(w.metricId)?.series === "bucket")
    .map((w) => resolveGrain(w.options.grain, from, to));
  if (grains.length === 0) return "total";
  return grains.reduce((a, b) => (GRAIN_RANK[a] <= GRAIN_RANK[b] ? a : b));
}

/** Fuentes que hay que pedir para estos widgets (una vez cada una). */
export function requiredSources(widgets: readonly WidgetConfig[]): MetricSource[] {
  const set = new Set<MetricSource>();
  for (const w of widgets) {
    const m = metricById(w.metricId);
    if (m) set.add(m.source);
  }
  return [...set].sort();
}

/** Periodicidad efectiva: la pedida si los hechos la permiten (sólo se re-agrupa desde días). */
function effectiveGrain(wanted: SeriesGrain, fetched: FactsGrain): SeriesGrain {
  if (fetched === "total" || fetched === "dia") return wanted;
  return GRAIN_RANK[wanted] < GRAIN_RANK[fetched] || fetched === "semana" ? fetched : wanted;
}

const ACTIVE_FILTERS = (f: MetricFilters): MetricFilter[] =>
  [f.channel ? ("canal" as const) : null, f.engine ? ("motor" as const) : null].filter(
    (x): x is MetricFilter => x !== null,
  );

const withShare = (rows: { key: string; label: string; value: number }[], base: number | null) =>
  rows.map((r) => ({ ...r, share: base ? round2((r.value * 100) / base) : null }));

export function resolveWidget(
  widget: WidgetConfig,
  facts: DashboardFacts,
  ctx: ResolveContext,
): WidgetResult {
  const metric = metricById(widget.metricId);
  if (!metric) return { status: "unknown_metric", widgetId: widget.id };
  if (!metric.widgets.includes(widget.type)) return { status: "unsupported", widgetId: widget.id };
  const permitted = new Set(ctx.allowedCenters(metric.capability));
  const centers = ctx.centers.filter((c) => permitted.has(c.id));
  if (centers.length === 0) return { status: "forbidden", widgetId: widget.id, metric };
  const ids = new Set(centers.map((c) => c.id));
  const { impl } = metric;
  const filters: MetricFilters = widget.options.channel
    ? { ...ctx.filters, channel: widget.options.channel }
    : ctx.filters;
  const all = impl.pick(facts).filter((f) => ids.has(impl.centerOf(f)) && impl.matches(f, filters));
  const resources = facts.centers ?? [];
  const input = (
    sub: readonly unknown[],
    from = ctx.from,
    to = ctx.to,
    scope: ReadonlySet<string> = ids,
  ): MetricInput<unknown> => ({
    facts: sub,
    from,
    to,
    stages: facts.pipelineStages ?? [],
    centers: resources.filter((r) => scope.has(r.detailCenterId)),
  });
  const perCenter = () =>
    centers.map((c) => ({
      key: c.id,
      label: c.name,
      value: impl.value(
        input(
          all.filter((f) => impl.centerOf(f) === c.id),
          ctx.from,
          ctx.to,
          new Set([c.id]),
        ),
      ),
    }));
  const additive = metric.unit !== "percent" && metric.unit !== "ratio";

  let data: WidgetData;
  switch (widget.type) {
    case "kpi":
      data = { kind: "kpi", value: impl.value(input(all)) };
      break;
    case "timeseries": {
      const grain = effectiveGrain(resolveGrain(widget.options.grain, ctx.from, ctx.to), facts.grain);
      const buckets = seriesBuckets(ctx.from, ctx.to, grain);
      if (impl.bucketOf) {
        const bucketOf = impl.bucketOf;
        const groups = new Map<string, unknown[]>();
        for (const f of all) {
          const b = bucketStart(bucketOf(f), ctx.from, grain);
          groups.set(b, [...(groups.get(b) ?? []), f]);
        }
        data = {
          kind: "timeseries",
          grain,
          points: buckets.map((b) => ({
            ...b,
            value: impl.value(input(groups.get(b.from) ?? [], b.from, b.to)),
          })),
        };
      } else {
        data = {
          kind: "timeseries",
          grain,
          points: buckets.map((b) => ({ ...b, value: impl.value(input(all, b.from, b.to)) })),
        };
      }
      break;
    }
    case "bars":
      data = { kind: "bars", rows: withShare(perCenter(), null) };
      break;
    case "ranking": {
      const rows = perCenter().sort((a, b) => b.value - a.value);
      const total = rows.reduce((t, r) => t + r.value, 0);
      data = {
        kind: "ranking",
        rows: withShare(rows, additive && total > 0 ? total : null).slice(0, widget.options.limit ?? 10),
      };
      break;
    }
    case "distribution": {
      const by = widget.options.breakdown ?? metric.breakdowns[0]!;
      const rows = (impl.breakdown?.(input(all), by) ?? []).filter((r) => r.value !== 0);
      const total = rows.reduce((t, r) => t + r.value, 0);
      data = { kind: "distribution", rows: withShare(rows, total > 0 ? total : null) };
      break;
    }
    case "funnel": {
      const rows = impl.funnel?.(input(all)) ?? [];
      data = { kind: "funnel", rows: withShare(rows, rows[0]?.value || null) };
      break;
    }
  }
  return {
    status: "ok",
    widgetId: widget.id,
    metric,
    data,
    ignoredFilters: ACTIVE_FILTERS(filters).filter((f) => !metric.filters.includes(f)),
    centersWithoutAccess: ctx.centers.filter((c) => !permitted.has(c.id)).map((c) => c.name),
  };
}

/** Resuelve todos los widgets con los mismos hechos (una sola lectura por tablero). */
export function resolveDashboard(
  widgets: readonly WidgetConfig[],
  facts: DashboardFacts,
  ctx: ResolveContext,
): WidgetResult[] {
  return widgets.map((w) => resolveWidget(w, facts, ctx));
}
