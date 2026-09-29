import "server-only";
import {
  alertLinks,
  METRIC_CATALOG,
  metricById,
  repositoryAlertPort,
  runAlertEvaluation,
  type AlertRunSummary,
} from "@meguiars/analytics";
import {
  activeCenterAccess,
  alertsErrorMessage,
  filterAlertInbox,
  guardScreen,
  openAlertCounts,
  parseAlertInboxFilters,
  presentAlert,
  presentAlertEvent,
  presentAlertRule,
  todayIn,
  usableCenters,
  type AlertInstance,
  type AlertsRepository,
  type DashboardRepository,
  type SignedInState,
} from "@meguiars/domain";
import { centersWith } from "./dashboards";

type Params = Record<string, string | string[] | undefined>;

/**
 * Alcance de Alertas: organización del centro activo, sus centros con acceso a
 * la bandeja y qué puede hacer el usuario (la base vuelve a validarlo: RLS por
 * centro y RPC).
 */
export function alertsScope(state: SignedInState) {
  const active = activeCenterAccess(state)!.center;
  const org = usableCenters(state.access).filter((a) => a.center.organizationId === active.organizationId);
  const readable = new Set(centersWith(state, "alerts.read"));
  const manageable = new Set(centersWith(state, "alerts.manage"));
  const kpiCenterIds = centersWith(state, "dashboards.read").filter((id) =>
    org.some((a) => a.center.id === id),
  );
  const centers = org
    .filter((a) => readable.has(a.center.id))
    .map((a) => ({ id: a.center.id, name: a.center.name }));
  return {
    organizationId: active.organizationId,
    timezone: active.timezone,
    centers,
    centerNames: Object.fromEntries(org.map((a) => [a.center.id, a.center.name])),
    /** Centros para los enlaces a KPIs y drill-down. */
    kpiCenterIds,
    canManage: (a: Pick<AlertInstance, "detailCenterIds">) =>
      a.detailCenterIds.every((id) => manageable.has(id)),
    /** Enlaces sólo a pantallas que el usuario puede abrir. */
    links: (a: AlertInstance) => {
      const l = alertLinks(a, kpiCenterIds);
      return {
        kpis: guardScreen(state, "kpis").allow ? l.kpis : null,
        drill: guardScreen(state, "direccionDetalle").allow ? l.drill : null,
      };
    },
    /** Reglas y "Evaluar ahora": admin corporativo de la organización. */
    isAdmin: org.some((a) => a.corporateRoles.includes("admin_socio")),
    orgCenterIds: org.map((a) => a.center.id),
  };
}

const metricInfo = (id: string) => {
  const m = metricById(id);
  return { metricName: m?.name ?? id, unit: m?.unit ?? "number" };
};

/** Bandeja: alertas visibles con filtros, conteo de abiertas y enlaces al dato que las originó. */
export async function loadAlertsInbox(state: SignedInState, repo: AlertsRepository, params: Params) {
  const scope = alertsScope(state);
  const filters = parseAlertInboxFilters(
    params,
    scope.centers.map((c) => c.id),
  );
  const includeResolved = filters.status === "resuelta" || filters.status === "todas";
  const [list, open] = await Promise.all([
    repo.instances(scope.organizationId, { includeResolved }),
    includeResolved ? repo.instances(scope.organizationId) : null,
  ]);
  const all = list.ok ? list.data : [];
  const openList = open ? (open.ok ? open.data : []) : all;
  return {
    scope,
    filters,
    counts: openAlertCounts(openList),
    error: list.ok ? null : alertsErrorMessage(list.error),
    alerts: filterAlertInbox(all, filters).map((a) => ({
      view: presentAlert(a, { ...metricInfo(a.metricId), centerNames: scope.centerNames }),
      links: scope.links(a),
      canManage: scope.canManage(a),
    })),
  };
}

/** Detalle: la alerta, su historial completo y enlaces. */
export async function loadAlertDetail(state: SignedInState, repo: AlertsRepository, id: string) {
  const scope = alertsScope(state);
  const alert = await repo.instance(id);
  if (!alert.ok) return { scope, alert: null, error: alertsErrorMessage(alert.error), events: [] };
  const info = metricInfo(alert.data.metricId);
  const events = await repo.events(id);
  return {
    scope,
    error: events.ok ? null : alertsErrorMessage(events.error),
    alert: {
      raw: alert.data,
      view: presentAlert(alert.data, { ...info, centerNames: scope.centerNames }),
      links: scope.links(alert.data),
      canManage: scope.canManage(alert.data),
    },
    events: events.ok ? events.data.map((e) => presentAlertEvent(e, info.unit)) : [],
  };
}

/** Reglas (admin corporativo): lista, KPIs elegibles y últimas evaluaciones. */
export async function loadAlertRules(state: SignedInState, repo: AlertsRepository) {
  const scope = alertsScope(state);
  const [rules, runs] = await Promise.all([
    repo.rules(scope.organizationId),
    repo.runs(scope.organizationId, 5),
  ]);
  return {
    scope,
    error: rules.ok ? null : alertsErrorMessage(rules.error),
    rules: rules.ok
      ? rules.data.map((r) => ({
          raw: r,
          view: presentAlertRule(r, { ...metricInfo(r.metricId), centerNames: scope.centerNames }),
        }))
      : [],
    runs: runs.ok ? runs.data : [],
    metrics: METRIC_CATALOG.map((m) => ({
      id: m.id,
      name: m.name,
      unit: m.unit,
      channel: m.filters.includes("canal"),
    })),
    centers: scope.orgCenterIds.map((id) => ({ id, name: scope.centerNames[id] ?? id })),
  };
}

/**
 * "Evaluar ahora" (admin corporativo): el MISMO runner que el cron, con la
 * sesión del usuario (hechos con sus permisos; la base registra y deduplica).
 */
export async function evaluateAlertsNow(
  state: SignedInState,
  alerts: AlertsRepository,
  dashboards: DashboardRepository,
): Promise<{ ok: true; summary: AlertRunSummary } | { ok: false; error: string }> {
  const scope = alertsScope(state);
  if (!scope.isAdmin) return { ok: false, error: "Sólo el administrador corporativo evalúa las reglas." };
  const rules = await alerts.rules(scope.organizationId);
  if (!rules.ok) return { ok: false, error: alertsErrorMessage(rules.error) };
  try {
    const summary = await runAlertEvaluation({
      organizationId: scope.organizationId,
      source: "manual",
      today: todayIn(scope.timezone),
      orgCenterIds: scope.orgCenterIds,
      rules: rules.data,
      port: repositoryAlertPort({
        organizationId: scope.organizationId,
        alerts,
        readFacts: (_rule, q) => dashboards.facts({ ...q, grain: "total" }),
      }),
    });
    return { ok: true, summary };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
