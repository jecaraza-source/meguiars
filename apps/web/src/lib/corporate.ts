import "server-only";
import {
  cardWidget,
  CORPORATE_CARDS,
  corporateBoard,
  corporateDrill,
  corporateMix,
  orderLinesLevel,
  previousPeriod,
  requiredSources,
  type DashboardFacts,
  type DrillLevel,
} from "@meguiars/analytics";
import {
  activeCenterAccess,
  corporateBoardHref,
  corporateDrillHref,
  corporateFilters,
  dashboardsErrorMessage,
  parseCorporateDrill,
  presentCorporateCard,
  presentDrillLevel,
  todayIn,
  usableCenters,
  corporateCopy,
  type DashboardRepository,
  type KpiThreshold,
  type SignedInState,
} from "@meguiars/domain";
import { centersWith } from "./dashboards";

type Params = Record<string, string | string[] | undefined>;

/** Fuentes del tablero corporativo: las de sus tarjetas + ventas por servicio (una lectura por periodo). */
export const CORPORATE_SOURCES = [
  ...new Set([...requiredSources(CORPORATE_CARDS.map((c) => cardWidget(c, "kpi"))), "pnl", "services"]),
].sort();

/**
 * Contexto común del tablero y su drill-down: centros de la organización del
 * centro activo con acceso a Dirección (1..N), filtros (centros y periodo) y
 * permisos por centro.
 */
export function corporateScope(state: SignedInState, rawParams: Params) {
  const params: Params = {
    ...rawParams,
    centros: Array.isArray(rawParams.centros) ? rawParams.centros.join(",") : rawParams.centros,
  };
  const active = activeCenterAccess(state)!.center;
  const executive = new Set(centersWith(state, "executive.read"));
  const centers = usableCenters(state.access)
    .filter((a) => executive.has(a.center.id) && a.center.organizationId === active.organizationId)
    .map((a) => ({ id: a.center.id, name: a.center.name }));
  const allowedCenterIds = centers.map((c) => c.id);
  const { filters, periodError } = corporateFilters({
    params,
    allowedCenterIds,
    today: todayIn(active.timezone),
  });
  const chosen = centers.filter((c) => filters.centerIds.includes(c.id));
  const centerName = (id: string) => centers.find((c) => c.id === id)?.name ?? id;
  return {
    organizationId: active.organizationId,
    params,
    centers,
    chosen,
    allowedCenterIds,
    filters,
    periodError,
    centerName,
    allowedCenters: (capability: string) => centersWith(state, capability),
  };
}

/** Tablero corporativo: tarjetas por centro y consolidado, tendencia, alertas y ranking. */
export async function loadCorporateView(state: SignedInState, repo: DashboardRepository, rawParams: Params) {
  const scope = corporateScope(state, rawParams);
  const { filters } = scope;
  const previous = previousPeriod(filters.period, filters.from, filters.to);
  let error: string | null = scope.periodError;
  let facts: DashboardFacts | null = null;
  let previousFacts: DashboardFacts | null = null;
  let thresholds: KpiThreshold[] = [];
  if (!error && filters.centerIds.length > 0) {
    const read = (from: string, to: string) =>
      repo.facts({
        sources: CORPORATE_SOURCES,
        detailCenterIds: filters.centerIds,
        from,
        to,
        grain: "total",
      });
    const [current, prior, limits] = await Promise.all([
      read(filters.from, filters.to),
      read(previous.from, previous.to),
      repo.kpiThresholds(scope.organizationId),
    ]);
    if (current.ok) facts = current.data;
    else error = dashboardsErrorMessage(current.error);
    if (prior.ok) previousFacts = prior.data;
    if (limits.ok) thresholds = limits.data;
  }
  const ctx = {
    from: filters.from,
    to: filters.to,
    previous: previousFacts ? previous : null,
    centers: scope.chosen,
    allowedCenters: scope.allowedCenters,
    thresholds,
  };
  const board = facts ? corporateBoard(facts, previousFacts, ctx) : [];
  return {
    ...scope,
    error,
    previous,
    thresholds,
    board,
    cards: board.map((r) => presentCorporateCard(r, filters, scope.allowedCenterIds)),
    mix: facts ? corporateMix(facts, ctx) : null,
  };
}

/** Drill-down de una tarjeta: nivel actual con conciliación; el último nivel trae las OS. */
export async function loadCorporateDrill(state: SignedInState, repo: DashboardRepository, rawParams: Params) {
  const scope = corporateScope(state, rawParams);
  const { filters } = scope;
  const path = parseCorporateDrill(scope.params);
  const backHref = corporateBoardHref(filters, scope.allowedCenterIds);
  let error: string | null = scope.periodError ?? (path ? null : corporateCopy.unknownCard);
  let facts: DashboardFacts | null = null;
  if (!error && path && filters.centerIds.length > 0) {
    const r = await repo.facts({
      sources: CORPORATE_SOURCES,
      detailCenterIds: filters.centerIds,
      from: filters.from,
      to: filters.to,
      grain: "total",
    });
    if (r.ok) facts = r.data;
    else error = dashboardsErrorMessage(r.error);
  }
  const view =
    facts && path
      ? corporateDrill(path, facts, {
          from: filters.from,
          to: filters.to,
          centers: scope.chosen,
          allowedCenters: scope.allowedCenters,
        })
      : null;
  if (view?.status === "unknown") error = corporateCopy.unknownCard;
  if (view?.status === "forbidden") error = corporateCopy.forbidden;
  const ok = view?.status === "ok" ? view : null;
  const levels: DrillLevel[] = ok ? [...ok.levels] : [];
  if (ok?.orderLines) {
    const q = ok.orderLines;
    const lines = await repo.orderLines({
      detailCenterIds: q.detailCenterIds,
      from: filters.from,
      to: filters.to,
      channel: q.channel,
      engine: q.engine,
      serviceId: q.serviceId,
    });
    if (lines.ok) levels.push(orderLinesLevel(lines.data, q, scope.centerName));
    else error = dashboardsErrorMessage(lines.error);
  }
  return {
    ...scope,
    error,
    backHref,
    card: ok?.card ?? null,
    note: ok?.note ?? null,
    breadcrumbs: (ok?.breadcrumbs ?? []).map((b) => ({
      label: b.label,
      path: b.path,
      href: corporateDrillHref(b.path, filters, scope.allowedCenterIds),
    })),
    levels: levels.map((l) => presentDrillLevel(l, filters, scope.allowedCenterIds)),
  };
}
