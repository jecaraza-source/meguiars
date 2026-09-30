import type { Screen } from "../auth/guards";
import { formatMoney } from "../catalog/presenter";
import type { Result } from "../result";

/**
 * Piloto y rollout (F5.2): checklist de datos maestros de un centro, línea base
 * y métricas de adopción. Todo se decide con datos del centro (sin código por
 * centro): un centro nuevo usa los mismos cálculos que el Centro 1.
 */

export const READINESS_KEYS = [
  "centro",
  "equipo",
  "catalogo",
  "bahias",
  "tecnicos",
  "cobro",
  "categorias",
  "membresias",
  "b2b",
  "linea_base",
] as const;
export type ReadinessKey = (typeof READINESS_KEYS)[number];
export type ReadinessStatus = "ok" | "warning" | "missing";

export interface ReadinessItem {
  key: ReadinessKey;
  required: boolean;
  status: ReadinessStatus;
  count: number;
  detail: string;
}

export interface CenterReadiness {
  center: {
    id: string;
    organizationId: string;
    code: string;
    name: string;
    timezone: string;
    active: boolean;
  };
  items: ReadinessItem[];
  ready: boolean;
}

/** Indicadores comparables contra la línea base (mismos valores que el CHECK de center_baselines). */
export const BASELINE_METRICS = [
  "ordenes_dia",
  "ticket_promedio",
  "ingreso_mensual",
  "margen_bruto_pct",
  "membresias_mes",
  "tiempo_ciclo_min",
  "entregas_a_tiempo_pct",
  "diferencia_caja_promedio",
] as const;
export type BaselineMetric = (typeof BASELINE_METRICS)[number];

type MetricUnit = "count" | "money" | "minutes" | "percent";

export const BASELINE_METRIC_INFO: Record<
  BaselineMetric,
  { label: string; unit: MetricUnit; higherIsBetter: boolean; help: string }
> = {
  ordenes_dia: {
    label: "OS entregadas por día",
    unit: "count",
    higherIsBetter: true,
    help: "Órdenes entregadas en el periodo ÷ días del periodo.",
  },
  ticket_promedio: {
    label: "Ticket promedio",
    unit: "money",
    higherIsBetter: true,
    help: "Ingreso de OS entregadas ÷ OS entregadas.",
  },
  ingreso_mensual: {
    label: "Ingreso mensual (OS)",
    unit: "money",
    higherIsBetter: true,
    help: "Ingreso de OS entregadas llevado a 30 días.",
  },
  margen_bruto_pct: {
    label: "Margen bruto",
    unit: "percent",
    higherIsBetter: true,
    help: "Utilidad bruta ÷ ventas del P&L del periodo.",
  },
  membresias_mes: {
    label: "Membresías vendidas al mes",
    unit: "count",
    higherIsBetter: true,
    help: "Altas y renovaciones llevadas a 30 días.",
  },
  tiempo_ciclo_min: {
    label: "Tiempo de ciclo (min)",
    unit: "minutes",
    higherIsBetter: false,
    help: "Minutos promedio de la apertura de la OS a la entrega.",
  },
  entregas_a_tiempo_pct: {
    label: "Entregas a tiempo",
    unit: "percent",
    higherIsBetter: true,
    help: "Entregadas a la hora prometida o antes ÷ entregadas con hora prometida.",
  },
  diferencia_caja_promedio: {
    label: "Diferencia de caja por corte",
    unit: "money",
    higherIsBetter: false,
    help: "Promedio del faltante o sobrante absoluto por corte cerrado.",
  },
};

export interface CenterBaseline {
  id: string;
  detailCenterId: string;
  metric: BaselineMetric;
  value: number;
  periodFrom: string | null;
  periodTo: string | null;
  source: string;
  version: number;
  updatedAt: string;
}

export interface PilotDayMetrics {
  detailCenterId: string;
  day: string;
  activeUsers: number;
  ordersCreated: number;
  ordersDelivered: number;
  ordersCancelled: number;
  revenue: number;
  cycleMinutesAvg: number | null;
  promisedDelivered: number;
  onTimeDelivered: number;
  appointments: number;
  cashClosings: number;
  cashDifference: number;
  cashDifferenceAbs: number;
  membershipsSold: number;
  membershipRevenue: number;
  errors: number;
}

export interface ClientErrorReport {
  id: number;
  detailCenterId: string | null;
  source: "web" | "mobile";
  name: string;
  message: string;
  digest: string | null;
  route: string | null;
  occurredAt: string;
}

export interface CreateCenterCommand {
  organizationId: string;
  code: string;
  name: string;
  timezone: string;
  reason: string;
}

export interface SetBaselineCommand {
  detailCenterId: string;
  metric: BaselineMetric;
  /** null borra el indicador. */
  value: number | null;
  periodFrom: string | null;
  periodTo: string | null;
  source: string | null;
  reason: string;
}

export interface PilotRepository {
  readiness(centerId: string): Promise<Result<CenterReadiness>>;
  createCenter(command: CreateCenterCommand): Promise<Result<{ id: string; code: string; name: string }>>;
  baselines(centerIds: string[]): Promise<Result<CenterBaseline[]>>;
  setBaseline(command: SetBaselineCommand): Promise<Result<null>>;
  metrics(centerIds: string[], from: string, to: string): Promise<Result<PilotDayMetrics[]>>;
  errors(centerIds: string[], limit: number): Promise<Result<ClientErrorReport[]>>;
  reportError(
    report: { source: "web" | "mobile"; name: string; message: string; digest?: string; route?: string },
    centerId: string | null,
  ): Promise<Result<null>>;
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

export const PILOT_COPY = {
  centersTitle: "Centros",
  centersDescription: "Alta de centros y checklist de datos maestros para operar (piloto y rollout).",
  newCenter: "Nuevo centro",
  newCenterHelp:
    "Un centro nuevo usa el catálogo, las categorías y los planes de la organización. Después carga su equipo, bahías, técnicos y, si aplica, precios propios.",
  onlyCorporate: "Sólo el admin corporativo da de alta centros.",
  ready: "Listo para operar",
  notReady: "Faltan datos obligatorios",
  setupTitle: "Activación del centro",
  checklist: "Checklist de datos maestros",
  required: "Obligatorio",
  optional: "Recomendado",
  switchTo: "Cambiar a este centro para completarlo",
  importer: "Importar datos maestros",
  baselineTitle: "Línea base",
  baselineHelp:
    "Valores de referencia antes del piloto (bitácoras, Excel, sistema anterior). El piloto se compara contra ellos.",
  baselineSource: "Fuente",
  baselineEmpty: "Sin línea base. Carga al menos tres indicadores para comparar el piloto.",
  errorsTitle: "Errores recientes de la app",
  errorsEmpty: "Sin errores reportados.",
  pilotTitle: "Piloto y adopción",
  pilotDescription: "Adopción diaria y resultados del periodo contra la línea base de cada centro.",
  period: "Periodo",
  comparison: "Resultado vs línea base",
  adoption: "Adopción por día",
  noBaseline: "Sin línea base",
  noData: "Sin datos",
} as const;

export const READINESS_COPY: Record<
  ReadinessKey,
  { label: string; fix: string; href: string | null; screen: Screen | null }
> = {
  centro: {
    label: "Centro: código, nombre y zona horaria",
    fix: "Edita el nombre y la zona horaria en Equipo del centro.",
    href: "/equipo",
    screen: "team",
  },
  equipo: {
    label: "Equipo: encargado y recepción",
    fix: "Da de alta usuarios con su rol en este centro.",
    href: "/equipo/usuarios",
    screen: "users",
  },
  catalogo: {
    label: "Catálogo con precio y costo directo",
    fix: "Completa precios y costos (o impórtalos); el P&L y los márgenes los necesitan.",
    href: "/catalogo",
    screen: "catalog",
  },
  bahias: {
    label: "Bahías",
    fix: "Agrégalas en Agenda → recursos.",
    href: "/agenda",
    screen: "agenda",
  },
  tecnicos: {
    label: "Técnicos",
    fix: "Agrégalos en Agenda → recursos.",
    href: "/agenda",
    screen: "agenda",
  },
  cobro: {
    label: "Métodos de cobro",
    fix: "Son globales; si faltan, revisa la migración de cobranza.",
    href: null,
    screen: null,
  },
  categorias: {
    label: "Categorías de egreso",
    fix: "Configúralas en Egresos → configuración.",
    href: "/finanzas/egresos/configuracion",
    screen: "expenseSettings",
  },
  membresias: {
    label: "Planes de membresía con beneficios",
    fix: "Crea o revisa los planes en Comercial → planes.",
    href: "/comercial/planes",
    screen: "membershipPlans",
  },
  b2b: {
    label: "Cuentas B2B que operan aquí",
    fix: "Da de alta la cuenta o agrega este centro a su convenio.",
    href: "/comercial/b2b",
    screen: "b2bAccounts",
  },
  linea_base: {
    label: "Línea base del piloto",
    fix: "Captura los indicadores de referencia en esta pantalla.",
    href: null,
    screen: null,
  },
};

const STATUS_VIEW: Record<ReadinessStatus, { label: string; tone: "success" | "warning" | "danger" }> = {
  ok: { label: "Completo", tone: "success" },
  warning: { label: "Revisar", tone: "warning" },
  missing: { label: "Falta", tone: "danger" },
};

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------

export function presentReadiness(r: CenterReadiness) {
  const required = r.items.filter((i) => i.required);
  const done = required.filter((i) => i.status !== "missing").length;
  return {
    ready: r.ready,
    readyLabel: r.ready ? PILOT_COPY.ready : PILOT_COPY.notReady,
    readyTone: r.ready ? ("success" as const) : ("danger" as const),
    progress: `${done} de ${required.length} obligatorios`,
    rows: r.items.map((i) => ({
      key: i.key,
      label: READINESS_COPY[i.key].label,
      required: i.required,
      requiredLabel: i.required ? PILOT_COPY.required : PILOT_COPY.optional,
      status: STATUS_VIEW[i.status].label,
      tone: STATUS_VIEW[i.status].tone,
      detail: i.detail,
      fix: i.status === "ok" ? null : READINESS_COPY[i.key].fix,
      href: READINESS_COPY[i.key].href,
      screen: READINESS_COPY[i.key].screen,
    })),
  };
}

// ---------------------------------------------------------------------------
// Resultados del periodo y comparación contra la línea base
// ---------------------------------------------------------------------------

export type PilotActuals = Record<BaselineMetric, number | null>;

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Indicadores del periodo a partir de las filas diarias (y el margen bruto del P&L, en %). */
export function summarizePilot(rows: PilotDayMetrics[], grossMarginPct: number | null): PilotActuals {
  const days = new Set(rows.map((r) => r.day)).size;
  const sum = (f: (r: PilotDayMetrics) => number) => rows.reduce((a, r) => a + f(r), 0);
  const delivered = sum((r) => r.ordersDelivered);
  const revenue = sum((r) => r.revenue);
  const promised = sum((r) => r.promisedDelivered);
  const closings = sum((r) => r.cashClosings);
  const withCycle = rows.filter((r) => r.cycleMinutesAvg !== null && r.ordersDelivered > 0);
  const cycleOrders = withCycle.reduce((a, r) => a + r.ordersDelivered, 0);
  return {
    ordenes_dia: days ? round(delivered / days) : null,
    ticket_promedio: delivered ? round(revenue / delivered) : null,
    ingreso_mensual: days ? round((revenue / days) * 30) : null,
    margen_bruto_pct: grossMarginPct === null ? null : round(grossMarginPct),
    membresias_mes: days ? round((sum((r) => r.membershipsSold) / days) * 30) : null,
    tiempo_ciclo_min: cycleOrders
      ? round(
          withCycle.reduce((a, r) => a + (r.cycleMinutesAvg ?? 0) * r.ordersDelivered, 0) / cycleOrders,
          1,
        )
      : null,
    entregas_a_tiempo_pct: promised ? round((sum((r) => r.onTimeDelivered) / promised) * 100) : null,
    diferencia_caja_promedio: closings ? round(sum((r) => r.cashDifferenceAbs) / closings) : null,
  };
}

export function formatPilotMetric(metric: BaselineMetric, value: number | null): string {
  if (value === null) return "—";
  switch (BASELINE_METRIC_INFO[metric].unit) {
    case "money":
      return formatMoney(value);
    case "percent":
      return `${value.toFixed(1)} %`;
    case "minutes":
      return `${value.toFixed(0)} min`;
    default:
      return value.toFixed(value % 1 === 0 ? 0 : 1);
  }
}

export type ComparisonStatus = "mejor" | "peor" | "igual" | "sin_base" | "sin_dato";

/**
 * Compara el periodo contra la línea base. "igual" = dentro de ±2 %;
 * mejor/peor según si el indicador sube o baja para bien.
 */
export function comparePilot(
  actual: PilotActuals,
  baselines: Pick<CenterBaseline, "metric" | "value" | "source">[],
) {
  return BASELINE_METRICS.map((metric) => {
    const info = BASELINE_METRIC_INFO[metric];
    const base = baselines.find((b) => b.metric === metric) ?? null;
    const value = actual[metric];
    let status: ComparisonStatus;
    let deltaPct: number | null = null;
    if (!base) status = "sin_base";
    else if (value === null) status = "sin_dato";
    else {
      deltaPct =
        base.value === 0 ? (value === 0 ? 0 : null) : round(((value - base.value) / base.value) * 100, 1);
      if (deltaPct !== null && Math.abs(deltaPct) <= 2) status = "igual";
      else status = value > base.value === info.higherIsBetter ? "mejor" : "peor";
    }
    return {
      metric,
      label: info.label,
      help: info.help,
      baseline: base ? formatPilotMetric(metric, base.value) : "—",
      baselineSource: base?.source ?? null,
      actual: formatPilotMetric(metric, value),
      delta: deltaPct === null ? "—" : `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)} %`,
      status,
      statusLabel: {
        mejor: "Mejor",
        peor: "Peor",
        igual: "Igual",
        sin_base: PILOT_COPY.noBaseline,
        sin_dato: PILOT_COPY.noData,
      }[status],
      tone: (
        {
          mejor: "success",
          peor: "danger",
          igual: "neutral",
          sin_base: "neutral",
          sin_dato: "neutral",
        } as const
      )[status],
    };
  });
}

/** Adopción por día (todos los centros del alcance sumados) y totales del periodo. */
export function presentAdoption(rows: PilotDayMetrics[]) {
  const byDay = new Map<string, PilotDayMetrics[]>();
  for (const r of rows) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r]);
  const days = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, list]) => {
      const s = (f: (r: PilotDayMetrics) => number) => list.reduce((a, r) => a + f(r), 0);
      return {
        day,
        activeUsers: s((r) => r.activeUsers),
        ordersCreated: s((r) => r.ordersCreated),
        ordersDelivered: s((r) => r.ordersDelivered),
        ordersCancelled: s((r) => r.ordersCancelled),
        cashDifference: formatMoney(s((r) => r.cashDifference)),
        cashClosings: s((r) => r.cashClosings),
        errors: s((r) => r.errors),
      };
    });
  const active = days.map((d) => d.activeUsers);
  const total = (f: (d: (typeof days)[number]) => number) => days.reduce((a, d) => a + f(d), 0);
  return {
    days,
    totals: {
      avgActiveUsers: active.length ? round(total((d) => d.activeUsers) / active.length, 1) : 0,
      maxActiveUsers: active.length ? Math.max(...active) : 0,
      ordersCreated: total((d) => d.ordersCreated),
      ordersDelivered: total((d) => d.ordersDelivered),
      ordersCancelled: total((d) => d.ordersCancelled),
      errors: total((d) => d.errors),
      cashClosings: total((d) => d.cashClosings),
    },
  };
}

/** Periodos del piloto: últimos N días hasta hoy (fecha del centro). */
export const PILOT_PERIODS = [
  { id: "7", label: "Últimos 7 días", days: 7 },
  { id: "30", label: "Últimos 30 días", days: 30 },
  { id: "90", label: "Últimos 90 días", days: 90 },
] as const;
export type PilotPeriodId = (typeof PILOT_PERIODS)[number]["id"];

export function pilotPeriod(id: string | null | undefined, today: string) {
  const p = PILOT_PERIODS.find((x) => x.id === id) ?? PILOT_PERIODS[1];
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (p.days - 1));
  return { id: p.id, label: p.label, from: d.toISOString().slice(0, 10), to: today };
}

export function pilotErrorMessage(error: { kind: string; message: string }): string {
  if (error.kind === "permission_denied") return error.message || "No tienes permiso para esta acción.";
  if (error.kind === "unavailable") return "Sin conexión: intenta de nuevo.";
  return error.message;
}
