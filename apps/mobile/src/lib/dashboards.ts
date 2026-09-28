import {
  factsGrain,
  KPI_CATALOG,
  requiredSources,
  resolveDashboard,
  type DashboardFacts,
  type WidgetConfig,
} from "@meguiars/analytics";
import {
  activeCenterAccess,
  applyPreferences,
  can,
  dashboardCenters,
  dashboardsErrorMessage,
  kpisCopy,
  presentWidget,
  resolveDashboardFilters,
  todayIn,
  usableCenters,
  type Capability,
  type DashboardDefinition,
  type DashboardPreferences,
  type DashboardRepository,
  type DashboardWidget,
  type SignedInState,
} from "@meguiars/domain";

type Params = Record<string, string | string[] | undefined>;

/**
 * Vista del tablero en móvil: MISMO flujo que apps/web/src/lib/dashboards.ts
 * (una lectura de hechos y el servicio de métricas de @meguiars/analytics), así
 * cada KPI vale lo mismo en web y móvil.
 */

/** Widget del tablero → configuración del servicio de métricas. */
export const widgetConfig = (w: DashboardWidget): WidgetConfig => ({
  id: w.id,
  metricId: w.metricId,
  type: w.type,
  options: w.options,
});

/** Centros del usuario con una capacidad (espejo de la base, que filtra igual). */
export function centersWith(state: SignedInState, capability: string): string[] {
  return usableCenters(state.access)
    .filter((a) => can([...a.roles, ...a.corporateRoles], capability as Capability))
    .map((a) => a.center.id);
}

/** Admin corporativo: configura tableros (la base vuelve a validarlo). */
export const canManageDashboards = (state: SignedInState) =>
  usableCenters(state.access).some((a) => a.corporateRoles.includes("admin_socio"));

/**
 * Vista del tablero: filtros efectivos, widgets en el orden de la vista
 * personal y resultados de TODOS los widgets con una sola lectura de hechos.
 */
export async function loadDashboardView(
  state: SignedInState,
  repo: DashboardRepository,
  dashboard: DashboardDefinition,
  prefs: DashboardPreferences | null,
  rawParams: Params,
) {
  // Las casillas de centros llegan como lista; la URL compartible usa "a,b".
  const params: Params = {
    ...rawParams,
    centros: Array.isArray(rawParams.centros) ? rawParams.centros.join(",") : rawParams.centros,
  };
  const center = activeCenterAccess(state)!.center;
  const readable = new Set(centersWith(state, "dashboards.read"));
  const centers = dashboardCenters(
    usableCenters(state.access)
      .filter((a) => readable.has(a.center.id))
      .map((a) => ({ id: a.center.id, name: a.center.name })),
    dashboard,
  );
  const { filters, periodError } = resolveDashboardFilters({
    params,
    saved: prefs?.filters,
    defaultRange: dashboard.defaultRange,
    allowedCenterIds: centers.map((c) => c.id),
    today: todayIn(center.timezone),
  });
  const { visible, hidden } = applyPreferences(dashboard.widgets, prefs);
  const configs = visible.map(widgetConfig);
  const sources = requiredSources(configs);
  let error: string | null = periodError;
  let facts: DashboardFacts | null = null;
  if (!error && sources.length > 0 && filters.centerIds.length > 0) {
    const result = await repo.facts({
      sources,
      detailCenterIds: filters.centerIds,
      from: filters.from,
      to: filters.to,
      grain: factsGrain(configs, filters.from, filters.to),
    });
    if (result.ok) facts = result.data;
    else error = dashboardsErrorMessage(result.error);
  }
  const chosen = centers.filter((c) => filters.centerIds.includes(c.id));
  const results = facts
    ? resolveDashboard(configs, facts, {
        from: filters.from,
        to: filters.to,
        filters: { channel: filters.channel, engine: filters.engine },
        centers: chosen,
        allowedCenters: (cap) => centersWith(state, cap),
      })
    : [];
  const widgets = facts ? visible.map((w, i) => presentWidget(w, results[i]!, filters)) : [];
  const centerName = (id: string) => centers.find((c) => c.id === id)?.name ?? id;
  return { centers, filters, error, visible, hidden, widgets, centerName };
}

/** Tablero virtual de Dirección → KPIs: un widget por KPI del registro (una sola lectura de hechos). */
export function kpiDefinition(organizationId: string): DashboardDefinition {
  return {
    id: "kpis",
    organizationId,
    name: kpisCopy.title,
    description: null,
    audienceRole: null,
    centerIds: null,
    defaultRange: "mes",
    isDefault: false,
    version: 1,
    archivedAt: null,
    widgets: KPI_CATALOG.map((k, i) => ({
      id: k.id,
      metricId: k.metricId,
      type: k.view,
      title: k.name,
      position: i + 1,
      colSpan: k.view === "kpi" ? 1 : 2,
      rowSpan: 1,
      options: {
        ...(k.channel ? { channel: k.channel } : {}),
        ...(k.breakdown ? { breakdown: k.breakdown } : {}),
      },
    })),
  };
}
