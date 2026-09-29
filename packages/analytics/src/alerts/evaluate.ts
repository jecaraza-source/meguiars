import {
  metricById,
  pnlChannelOf,
  type DashboardChannel,
  type DashboardFacts,
  type MetricDefinition,
  type MetricSource,
} from "../dashboards/catalog";
import { resolveWidget } from "../dashboards/resolve";
export { isVariationCondition as isVariation } from "@meguiars/domain";
import {
  isVariationCondition as isVariation,
  type AlertCondition,
  type AlertPeriod,
  type AlertScopeKind,
} from "@meguiars/domain";

/**
 * Alertas de Dirección (D4): evaluación pura de una regla sobre los hechos de
 * public.dashboard_facts. El valor del KPI sale del servicio de métricas de D1
 * (una sola fórmula); aquí sólo se decide si la condición se cumple, por
 * ámbito, con los datos del periodo para rastrear la alerta.
 */

/** Regla (mismo contrato que public.alert_rules). */
export interface AlertRuleLike {
  id: string;
  organizationId: string;
  metricId: string;
  channel: DashboardChannel | null;
  condition: AlertCondition;
  threshold: number | null;
  period: AlertPeriod;
  scopeKind: AlertScopeKind;
  centerIds: readonly string[] | null;
  active: boolean;
}

export interface AlertWindow {
  from: string;
  to: string;
  /** Periodo anterior equivalente (variaciones). */
  previousFrom: string;
  previousTo: string;
}

const DAY_MS = 86_400_000;
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fromTime = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => fromTime(toTime(d) + n * DAY_MS);
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
function shiftMonth(day: string, months: number) {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(Math.min(d, lastDay(t.getUTCFullYear(), t.getUTCMonth())))}`;
}
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const monthEnd = (d: string) => {
  const [y, m] = d.split("-").map(Number) as [number, number];
  return `${d.slice(0, 7)}-${pad(lastDay(y, m - 1))}`;
};

/**
 * Ventana evaluada a partir de "hoy" del centro (la evaluación corre temprano,
 * así que se miran periodos cerrados o hasta ayer):
 * - dia: ayer (anterior: antier);
 * - semana: la semana completa anterior, lunes a domingo (anterior: la previa);
 * - mes_en_curso: del día 1 a ayer (anterior: mismo tramo del mes anterior);
 * - mes: el mes anterior completo (anterior: el mes previo).
 */
export function alertWindow(period: AlertPeriod, today: string): AlertWindow {
  const yesterday = addDays(today, -1);
  switch (period) {
    case "dia":
      return {
        from: yesterday,
        to: yesterday,
        previousFrom: addDays(today, -2),
        previousTo: addDays(today, -2),
      };
    case "semana": {
      const weekday = new Date(toTime(today)).getUTCDay();
      const thisMonday = addDays(today, -((weekday + 6) % 7));
      const from = addDays(thisMonday, -7);
      return { from, to: addDays(from, 6), previousFrom: addDays(from, -7), previousTo: addDays(from, -1) };
    }
    case "mes_en_curso": {
      // El día 1 todavía no hay mes en curso cerrado: se evalúa el mes anterior completo.
      const from = monthStart(yesterday);
      return {
        from,
        to: yesterday,
        previousFrom: shiftMonth(from, -1),
        previousTo: shiftMonth(yesterday, -1),
      };
    }
    case "mes": {
      const from = monthStart(shiftMonth(monthStart(today), -1));
      const previousFrom = monthStart(shiftMonth(from, -1));
      return { from, to: monthEnd(from), previousFrom, previousTo: monthEnd(previousFrom) };
    }
  }
}

export interface AlertScope {
  /** Id del centro, "conjunto" o "corporativo" (una alerta abierta por regla y ámbito). */
  key: string;
  centerIds: string[];
}

/** Ámbitos de una regla: cada centro, el conjunto consolidado o todo el corporativo. */
export function alertScopes(
  rule: Pick<AlertRuleLike, "scopeKind" | "centerIds">,
  orgCenterIds: readonly string[],
): AlertScope[] {
  if (rule.scopeKind === "corporativo")
    return orgCenterIds.length ? [{ key: "corporativo", centerIds: [...orgCenterIds] }] : [];
  const ids = (rule.centerIds ?? []).filter((id) => orgCenterIds.includes(id));
  if (rule.scopeKind === "conjunto") return ids.length ? [{ key: "conjunto", centerIds: ids }] : [];
  return ids.map((id) => ({ key: id, centerIds: [id] }));
}

/** Fuentes de hechos que necesita la regla. */
export function alertSources(rule: Pick<AlertRuleLike, "metricId">): MetricSource[] {
  const m = metricById(rule.metricId);
  return m ? [m.source] : [];
}

export interface AlertScopeResult {
  scopeKey: string;
  centerIds: string[];
  triggered: boolean;
  /** Valor del KPI en la ventana (null sin datos en una variación). */
  value: number | null;
  previousValue: number | null;
  /** Variación: % (o puntos para porcentajes) contra el periodo anterior. */
  changePct: number | null;
  hasData: boolean;
  /** Por qué no aplica (sin base para una variación, métrica no registrada). */
  note: string | null;
  periodFrom: string;
  periodTo: string;
  previousFrom: string | null;
  previousTo: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const pointsUnit = (unit: string) => unit === "percent" || unit === "ratio";

/**
 * ¿Hay hechos del KPI en el ámbito y la ventana? Para el P&L con canal fijo
 * cuentan sólo los ingresos de ese canal (los egresos no son "dato" de ventas
 * B2B); para las demás fuentes, cualquier hecho que pase los filtros.
 */
export function metricHasData(
  metric: MetricDefinition,
  facts: DashboardFacts,
  centerIds: readonly string[],
  channel: DashboardChannel | null,
): boolean {
  const ids = new Set(centerIds);
  const filters = { channel, engine: null };
  return metric.impl.pick(facts).some((f) => {
    if (!ids.has(metric.impl.centerOf(f)) || !metric.impl.matches(f, filters)) return false;
    if (metric.source === "pnl" && channel) {
      const row = f as { section: string; line: string };
      return row.section === "ingreso" && pnlChannelOf(row.line) === channel;
    }
    return true;
  });
}

function kpiValue(
  metric: MetricDefinition,
  facts: DashboardFacts,
  rule: AlertRuleLike,
  scope: AlertScope,
  from: string,
  to: string,
) {
  const r = resolveWidget(
    { id: rule.id, metricId: metric.id, type: "kpi", options: rule.channel ? { channel: rule.channel } : {} },
    facts,
    {
      from,
      to,
      filters: { channel: null, engine: null },
      centers: scope.centerIds.map((id) => ({ id, name: id })),
      // Los hechos ya vienen filtrados por permisos en la base.
      allowedCenters: () => scope.centerIds,
    },
  );
  return r.status === "ok" && r.data.kind === "kpi" ? r.data.value : 0;
}

/** Evalúa una regla en un ámbito (hechos del periodo y, para variaciones, del anterior). */
export function evaluateAlertScope(
  rule: AlertRuleLike,
  scope: AlertScope,
  window: AlertWindow,
  facts: DashboardFacts,
  previousFacts: DashboardFacts | null,
): AlertScopeResult {
  const base = {
    scopeKey: scope.key,
    centerIds: scope.centerIds,
    periodFrom: window.from,
    periodTo: window.to,
    previousFrom: isVariation(rule.condition) ? window.previousFrom : null,
    previousTo: isVariation(rule.condition) ? window.previousTo : null,
  };
  const metric = metricById(rule.metricId);
  if (!metric)
    return {
      ...base,
      triggered: false,
      value: null,
      previousValue: null,
      changePct: null,
      hasData: false,
      note: "Métrica no registrada",
    };
  const hasData = metricHasData(metric, facts, scope.centerIds, rule.channel);
  const value = kpiValue(metric, facts, rule, scope, window.from, window.to);
  const t = rule.threshold ?? 0;
  switch (rule.condition) {
    case "no_data":
      return {
        ...base,
        triggered: !hasData,
        value: hasData ? value : null,
        previousValue: null,
        changePct: null,
        hasData,
        note: null,
      };
    case "below":
    case "above":
      return {
        ...base,
        triggered: rule.condition === "below" ? value < t : value > t,
        value,
        previousValue: null,
        changePct: null,
        hasData,
        note: null,
      };
    case "drop_pct":
    case "rise_pct": {
      const previous = previousFacts
        ? kpiValue(metric, previousFacts, rule, scope, window.previousFrom, window.previousTo)
        : null;
      const points = pointsUnit(metric.unit);
      if (previous === null || (!points && previous === 0))
        return {
          ...base,
          triggered: false,
          value,
          previousValue: previous,
          changePct: null,
          hasData,
          note: "Sin base en el periodo anterior",
        };
      const change = points
        ? round2(value - previous)
        : round2(((value - previous) * 100) / Math.abs(previous));
      return {
        ...base,
        triggered: rule.condition === "drop_pct" ? change <= -t : change >= t,
        value,
        previousValue: previous,
        changePct: change,
        hasData,
        note: null,
      };
    }
  }
}
