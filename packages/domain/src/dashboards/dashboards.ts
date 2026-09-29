import type { AppRole } from "../roles";
import type { Result } from "../result";
import { pnlPeriod, pnlPeriodError, type PnlDrillQuery, type PnlPeriodKey } from "../pnl/pnl";
import { pnlDrillParams } from "../pnl/presenter";
import type {
  CorporateOrderLine,
  CorporateOrderLinesQuery,
  KpiThreshold,
  KpiThresholdInput,
} from "../corporate/corporate";

/**
 * Dirección / Generador de tableros (D1). Espejo de la migración
 * 20261013000000_dashboards.sql. Las métricas (definición, fórmula, cálculo)
 * viven en @meguiars/analytics (METRIC_CATALOG); aquí están el tablero, sus
 * widgets, los filtros globales, la vista personal y el drill-down, iguales en
 * web y móvil.
 */

export const DASHBOARD_WIDGET_TYPES = [
  "kpi",
  "timeseries",
  "bars",
  "ranking",
  "funnel",
  "distribution",
] as const;
export type DashboardWidgetType = (typeof DASHBOARD_WIDGET_TYPES)[number];

/** Periodo por defecto del tablero (los de la URL añaden "personalizado"). */
export const DASHBOARD_RANGES = ["hoy", "semana", "mes", "anio"] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export const DASHBOARD_CHANNEL_KEYS = ["b2c", "membresia", "b2b"] as const;
export type DashboardChannelKey = (typeof DASHBOARD_CHANNEL_KEYS)[number];

export const DASHBOARD_ENGINE_KEYS = [
  "recurrente",
  "valor_medio",
  "premium",
  "producto_complemento",
  "membresia",
  "cuota_b2b",
] as const;
export type DashboardEngineKey = (typeof DASHBOARD_ENGINE_KEYS)[number];

export const WIDGET_GRAINS = ["auto", "dia", "semana", "mes"] as const;
export type WidgetGrain = (typeof WIDGET_GRAINS)[number];
export const WIDGET_BREAKDOWNS = ["motor", "canal", "forma_pago"] as const;
export type WidgetBreakdown = (typeof WIDGET_BREAKDOWNS)[number];

/** Rejilla: 4 columnas en escritorio; alto de 1 o 2 filas. Máximo de widgets por tablero. */
export const GRID_COLUMNS = 4;
export const MAX_ROW_SPAN = 2;
export const MAX_WIDGETS = 24;

export interface WidgetOptionsValue {
  grain?: WidgetGrain | undefined;
  limit?: number | undefined;
  breakdown?: WidgetBreakdown | undefined;
  /** Canal fijo (vistas de KPI como "Ventas B2C"; no se guarda en tableros). */
  channel?: DashboardChannelKey | undefined;
}

export interface DashboardWidget {
  id: string;
  metricId: string;
  type: DashboardWidgetType;
  title: string | null;
  position: number;
  colSpan: number;
  rowSpan: number;
  options: WidgetOptionsValue;
}

export interface DashboardDefinition {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  /** null = todos los roles con dashboards.read. */
  audienceRole: AppRole | null;
  /** null = todos los centros de la organización. */
  centerIds: string[] | null;
  defaultRange: DashboardRange;
  isDefault: boolean;
  version: number;
  archivedAt: string | null;
  widgets: DashboardWidget[];
}

/** Filtros guardados (mismas claves que la URL). */
export interface SavedDashboardFilters {
  centros?: string[] | undefined;
  periodo?: PnlPeriodKey | undefined;
  desde?: string | undefined;
  hasta?: string | undefined;
  canal?: DashboardChannelKey | undefined;
  motor?: DashboardEngineKey | undefined;
}

export interface DashboardPreferences {
  dashboardId: string;
  widgetOrder: string[];
  hiddenWidgetIds: string[];
  filters: SavedDashboardFilters;
  isFavorite: boolean;
}

/** Fila de public.metric_registry (para validar y listar sin depender de analytics). */
export interface MetricRegistryEntry {
  id: string;
  version: number;
  name: string;
  description: string;
  unit: string;
  formula: string;
  source: string;
  sourceTables: string[];
  capability: string;
  widgetTypes: DashboardWidgetType[];
  filters: string[];
  breakdowns: WidgetBreakdown[];
  drill: boolean;
}

// ---------------------------------------------------------------------------
// Filtros globales
// ---------------------------------------------------------------------------

export interface DashboardFilters {
  /** Centros elegidos (siempre dentro de los permitidos). */
  centerIds: string[];
  period: PnlPeriodKey;
  from: string;
  to: string;
  channel: DashboardChannelKey | null;
  engine: DashboardEngineKey | null;
}

type Params = Record<string, string | string[] | undefined>;
const one = (p: Params, k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined);
const PERIODS: readonly PnlPeriodKey[] = ["hoy", "semana", "mes", "anio", "personalizado"];
const FILTER_KEYS = ["centros", "periodo", "desde", "hasta", "canal", "motor"] as const;
const isIn = <T extends string>(list: readonly T[], v: string | undefined): v is T =>
  v !== undefined && (list as readonly string[]).includes(v);

/**
 * Filtros efectivos: URL > filtros guardados del usuario > periodo por defecto
 * del tablero. Los centros se recortan a los permitidos (tablero ∩ usuario); si
 * no queda ninguno se usan todos los permitidos.
 */
export function resolveDashboardFilters(input: {
  params: Params;
  saved?: SavedDashboardFilters | null | undefined;
  defaultRange: DashboardRange;
  allowedCenterIds: readonly string[];
  today: string;
}): { filters: DashboardFilters; periodError: string | null } {
  const { params, saved, allowedCenterIds } = input;
  // La URL (siempre lleva el periodo) manda; si no trae filtros, la vista guardada.
  const fromUrl = FILTER_KEYS.some((k) => one(params, k) !== undefined);
  const src: SavedDashboardFilters = fromUrl
    ? {
        centros: one(params, "centros")?.split(",").filter(Boolean),
        periodo: one(params, "periodo") as PnlPeriodKey,
        desde: one(params, "desde"),
        hasta: one(params, "hasta"),
        canal: one(params, "canal") as DashboardChannelKey,
        motor: one(params, "motor") as DashboardEngineKey,
      }
    : (saved ?? {});
  const period = isIn(PERIODS, src.periodo) ? src.periodo : input.defaultRange;
  const range = pnlPeriod(period, input.today, { from: src.desde, to: src.hasta });
  const requested = (src.centros ?? []).filter((id) => allowedCenterIds.includes(id));
  const filters: DashboardFilters = {
    centerIds: requested.length > 0 ? requested : [...allowedCenterIds],
    period,
    from: range.from,
    to: range.to,
    channel: isIn(DASHBOARD_CHANNEL_KEYS, src.canal) ? src.canal : null,
    engine: isIn(DASHBOARD_ENGINE_KEYS, src.motor) ? src.motor : null,
  };
  return { filters, periodError: pnlPeriodError(filters.from, filters.to) };
}

/** Filtros → parámetros de URL (web) y filtros guardados (vista personal). */
export function dashboardFilterParams(
  f: DashboardFilters,
  allowedCenterIds: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = { periodo: f.period };
  if (f.period === "personalizado") {
    out.desde = f.from;
    out.hasta = f.to;
  }
  const all =
    allowedCenterIds.length === f.centerIds.length &&
    allowedCenterIds.every((id) => f.centerIds.includes(id));
  if (!all) out.centros = f.centerIds.join(",");
  if (f.channel) out.canal = f.channel;
  if (f.engine) out.motor = f.engine;
  return out;
}

export function savedFiltersOf(
  f: DashboardFilters,
  allowedCenterIds: readonly string[],
): SavedDashboardFilters {
  const p = dashboardFilterParams(f, allowedCenterIds);
  return {
    periodo: f.period,
    ...(p.desde ? { desde: p.desde, hasta: p.hasta } : {}),
    ...(p.centros ? { centros: f.centerIds } : {}),
    ...(f.channel ? { canal: f.channel } : {}),
    ...(f.engine ? { motor: f.engine } : {}),
  };
}

/** Centros donde se puede ver el tablero: los del usuario ∩ los permitidos del tablero. */
export function dashboardCenters<T extends { id: string }>(
  userCenters: readonly T[],
  dashboard: Pick<DashboardDefinition, "centerIds">,
): T[] {
  return dashboard.centerIds
    ? userCenters.filter((c) => dashboard.centerIds!.includes(c.id))
    : [...userCenters];
}

// ---------------------------------------------------------------------------
// Vista personal: orden y visibilidad
// ---------------------------------------------------------------------------

/**
 * Widgets en el orden de la vista personal (los nuevos del tablero van al
 * final, en su posición) y separados en visibles y ocultos.
 */
export function applyPreferences(
  widgets: readonly DashboardWidget[],
  prefs: Pick<DashboardPreferences, "widgetOrder" | "hiddenWidgetIds"> | null | undefined,
): { visible: DashboardWidget[]; hidden: DashboardWidget[] } {
  const base = [...widgets].sort((a, b) => a.position - b.position);
  const order = prefs?.widgetOrder ?? [];
  const rank = (w: DashboardWidget) => {
    const i = order.indexOf(w.id);
    return i < 0 ? order.length + w.position : i;
  };
  const sorted = base.sort((a, b) => rank(a) - rank(b));
  const hidden = new Set(prefs?.hiddenWidgetIds ?? []);
  return { visible: sorted.filter((w) => !hidden.has(w.id)), hidden: sorted.filter((w) => hidden.has(w.id)) };
}

/** Sube o baja un id en una lista (sin salirse de los extremos). */
export function moveInOrder(order: readonly string[], id: string, delta: -1 | 1): string[] {
  const next = [...order];
  const i = next.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= next.length) return next;
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/** Mueve un elemento a la posición de otro (arrastrar y soltar). */
export function moveTo<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

// ---------------------------------------------------------------------------
// Drill-down (de un KPI al detalle que lo explica)
// ---------------------------------------------------------------------------

export type MetricDrillRef =
  | { kind: "pnl"; section: "ingreso" | "costo_directo" | "gasto"; line?: string | undefined }
  | { kind: "payments" }
  | { kind: "pipeline" };

export type DashboardDrillTarget =
  | { screen: "pnlDrilldown"; href: string; query: PnlDrillQuery }
  | { screen: "payments"; href: string }
  | { screen: "pipelineMetrics"; href: string };

/**
 * Destino del drill-down con los mismos filtros: movimientos del P&L (canal →
 * línea de OS, motor → dimensión), cobranza o indicadores del pipeline.
 */
export function dashboardDrill(drill: MetricDrillRef, f: DashboardFilters): DashboardDrillTarget {
  const all = f.centerIds.length > 1;
  if (drill.kind === "pnl") {
    const line = drill.line ?? (drill.section === "ingreso" && f.channel ? f.channel : undefined);
    const dimension = drill.section === "ingreso" && f.engine ? f.engine : undefined;
    const qs = new URLSearchParams(
      pnlDrillParams({ section: drill.section, line, dimension }, { from: f.from, to: f.to, all }),
    );
    if (!all && f.centerIds[0]) qs.set("centro", f.centerIds[0]);
    return {
      screen: "pnlDrilldown",
      href: `/finanzas/resultados/detalle?${qs.toString()}`,
      query: {
        detailCenterIds: f.centerIds,
        from: f.from,
        to: f.to,
        section: drill.section,
        line,
        dimension,
      },
    };
  }
  const suffix = all ? "?alcance=todos" : "";
  return drill.kind === "payments"
    ? { screen: "payments", href: `/finanzas/cobranza${suffix}` }
    : { screen: "pipelineMetrics", href: `/comercial/pipeline/indicadores${suffix}` };
}

// ---------------------------------------------------------------------------
// Puerto
// ---------------------------------------------------------------------------

/** Tablero para guardar (la rejilla completa; widgets con id se conservan). */
export interface DashboardInput {
  organizationId: string;
  id?: string | undefined;
  requestId?: string | undefined;
  version?: number | undefined;
  name: string;
  description?: string | undefined;
  audienceRole: AppRole | null;
  centerIds: string[] | null;
  defaultRange: DashboardRange;
  isDefault: boolean;
  widgets: {
    id?: string | undefined;
    metricId: string;
    type: DashboardWidgetType;
    title?: string | undefined;
    colSpan: number;
    rowSpan: number;
    options: WidgetOptionsValue;
  }[];
  reason?: string | undefined;
}

export interface DashboardFactsQuery {
  sources: string[];
  detailCenterIds: string[];
  from: string;
  to: string;
  grain: "total" | "dia" | "semana" | "mes";
}

/** Hechos de public.dashboard_facts (mismo contrato que DashboardFacts de @meguiars/analytics). */
export interface DashboardFactsRow {
  from: string;
  to: string;
  grain: DashboardFactsQuery["grain"];
  pnl?: {
    detailCenterId: string;
    bucket: string;
    section: "ingreso" | "costo_directo" | "gasto" | "fuera_pnl";
    line: string;
    dimension: string | null;
    amount: number;
    movements: number;
  }[];
  payments?: {
    detailCenterId: string;
    bucket: string;
    day: string;
    method: string;
    methodName: string;
    collectsCash: boolean;
    validAmount: number;
    validCount: number;
    reversedAmount: number;
    reversedCount: number;
    changeAmount: number;
  }[];
  pipeline?: {
    opportunityId: string;
    detailCenterId: string;
    kind: "b2b" | "b2c_premium";
    createdOn: string;
    createdValue: number;
    outcome: "ganada" | "perdida" | null;
    closedOn: string | null;
    wonValue: number | null;
    currentValue: number;
    currentStageId: string | null;
    stagesReached: string[];
    cycleDays: number | null;
  }[];
  pipelineStages?: {
    id: string;
    name: string;
    kind: "abierta" | "ganada" | "perdida";
    position: number;
    probability: number;
  }[];
  memberships?: {
    detailCenterId: string;
    status: "activa" | "proxima_a_vencer" | "vencida" | "suspendida" | "cancelada";
    price: number;
    periodMonths: number;
    entitledUnits: number;
    usedUnits: number;
    newInRange: boolean;
    renewalsInRange: number;
    cancelledInRange: boolean;
    expiredInRange: boolean;
    revenueInRange: number;
  }[];
  orders?: {
    detailCenterId: string;
    bucket: string;
    channel: DashboardChannelKey;
    orders: number;
    sales: number;
    productSales: number;
    standardMinutes: number;
    timedOrders: number;
    actualMinutes: number;
    reworkOrders: number;
  }[];
  centers?: {
    detailCenterId: string;
    bays: number;
    technicians: number;
    operatingHoursPerDay: number;
    operatingDaysPerWeek: number;
    ltvLifetimeYears: number;
    /** Primer día con actividad (null = sin actividad). */
    firstActivityOn: string | null;
  }[];
  services?: {
    detailCenterId: string;
    bucket: string;
    channel: DashboardChannelKey;
    engine: string;
    serviceId: string | null;
    serviceName: string;
    kind: "servicio" | "producto" | "descuento";
    quantity: number;
    orders: number;
    revenue: number;
    standardCost: number;
  }[];
  upsell?: {
    ruleId: string;
    ruleName: string;
    detailCenterId: string;
    targetKind: "servicio" | "membresia";
    offered: number;
    accepted: number;
    rejected: number;
    orders: number;
    incrementalRevenue: number;
    membershipValue: number;
  }[];
  customers?: {
    detailCenterId: string;
    clientKey: string;
    channel: DashboardChannelKey;
    visits: number;
    sales: number;
    cost: number;
    priorVisit: boolean;
  }[];
}

/** Parámetros gerenciales de los KPIs (public.kpi_settings). */
export interface KpiSettings {
  organizationId: string;
  ltvLifetimeYears: number;
  operatingHoursPerDay: number;
  operatingDaysPerWeek: number;
  version: number;
}

/** Valores por defecto (iguales a private.kpi_settings_of). */
export const DEFAULT_KPI_SETTINGS = {
  ltvLifetimeYears: 3,
  operatingHoursPerDay: 10,
  operatingDaysPerWeek: 6,
} as const;

/** Puerto de tableros. Web y móvil usan el mismo adaptador (`@meguiars/supabase`). */
export interface DashboardRepository {
  /** Tableros visibles (RLS), con sus widgets. */
  list(): Promise<Result<DashboardDefinition[]>>;
  get(id: string): Promise<Result<DashboardDefinition>>;
  metrics(): Promise<Result<MetricRegistryEntry[]>>;
  preferences(): Promise<Result<DashboardPreferences[]>>;
  save(input: DashboardInput): Promise<Result<DashboardDefinition>>;
  archive(id: string, version: number, reason: string): Promise<Result<void>>;
  savePreferences(prefs: DashboardPreferences): Promise<Result<DashboardPreferences>>;
  resetPreferences(dashboardId: string): Promise<Result<void>>;
  /** Una sola llamada por tablero y filtro (sin N+1). */
  facts(query: DashboardFactsQuery): Promise<Result<DashboardFactsRow>>;
  /** Parámetros de KPIs de la organización (valores por defecto si no tiene fila). */
  kpiSettings(organizationId: string): Promise<Result<KpiSettings>>;
  setKpiSettings(input: KpiSettings & { reason: string }): Promise<Result<KpiSettings>>;
  /** Umbrales de alerta de la organización (tablero corporativo). */
  kpiThresholds(organizationId: string): Promise<Result<KpiThreshold[]>>;
  setKpiThreshold(input: KpiThresholdInput): Promise<Result<KpiThreshold>>;
  deleteKpiThreshold(id: string, reason: string): Promise<Result<void>>;
  /** Último nivel del drill-down: líneas de OS (public.corporate_order_lines). */
  orderLines(query: CorporateOrderLinesQuery): Promise<Result<CorporateOrderLine[]>>;
}
