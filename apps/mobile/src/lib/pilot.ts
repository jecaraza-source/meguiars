import { pnlByCenter } from "@meguiars/analytics";
import {
  activeCenterAccess,
  canInCenter,
  comparePilot,
  pilotErrorMessage,
  pilotPeriod,
  presentAdoption,
  presentReadiness,
  summarizePilot,
  todayIn,
  usableCenters,
  type PilotRepository,
  type PnlRepository,
  type SignedInState,
} from "@meguiars/domain";

/** Centros de la organización activa que el usuario puede configurar, y si puede dar de alta centros. */
export function centersScope(state: SignedInState) {
  const active = activeCenterAccess(state)!;
  const organizationId = active.center.organizationId;
  return {
    organizationId,
    activeCenterId: active.center.id,
    canCreate: active.corporateRoles.includes("admin_socio"),
    centers: usableCenters(state.access)
      .filter(
        (a) => a.center.organizationId === organizationId && canInCenter(state, a.center.id, "centers.setup"),
      )
      .map((a) => a.center),
  };
}

/** Administración → Centros: checklist resumido de cada centro (una lectura por centro, en paralelo). */
export async function loadCenters(state: SignedInState, repo: PilotRepository) {
  const scope = centersScope(state);
  const results = await Promise.all(scope.centers.map((c) => repo.readiness(c.id)));
  return {
    scope,
    rows: scope.centers.map((c, i) => {
      const r = results[i]!;
      return {
        id: c.id,
        code: c.code,
        name: c.name,
        timezone: c.timezone,
        isActive: c.id === scope.activeCenterId,
        view: r.ok ? presentReadiness(r.data) : null,
        error: r.ok ? null : pilotErrorMessage(r.error),
      };
    }),
  };
}

/** Activación de un centro: checklist, línea base y errores recientes de la app. */
export async function loadCenterSetup(state: SignedInState, repo: PilotRepository, centerId: string) {
  const scope = centersScope(state);
  const center = scope.centers.find((c) => c.id === centerId) ?? null;
  if (!center) return { scope, center: null, error: null, readiness: null, baselines: [], errors: [] };
  const [readiness, baselines, errors] = await Promise.all([
    repo.readiness(center.id),
    repo.baselines([center.id]),
    repo.errors([center.id], 10),
  ]);
  const failed = [readiness, baselines, errors].find((r) => !r.ok);
  return {
    scope,
    center,
    isActive: center.id === scope.activeCenterId,
    error: failed && !failed.ok ? pilotErrorMessage(failed.error) : null,
    readiness: readiness.ok ? presentReadiness(readiness.data) : null,
    baselines: baselines.ok ? baselines.data : [],
    errors: errors.ok ? errors.data : [],
  };
}

/**
 * Dirección → Piloto: adopción diaria y resultado del periodo contra la línea
 * base de cada centro (centro activo o todos los centros que el usuario lee).
 */
export async function loadPilot(
  state: SignedInState,
  repos: { pilot: PilotRepository; pnl: PnlRepository },
  params: { period?: string | null; scope?: string | null },
) {
  const active = activeCenterAccess(state)!.center;
  const readable = usableCenters(state.access)
    .filter((a) => canInCenter(state, a.center.id, "pnl.read"))
    .map((a) => a.center);
  const scopeAll = params.scope === "todos" && readable.length > 1;
  const centers = scopeAll ? readable : readable.filter((c) => c.id === active.id);
  const period = pilotPeriod(params.period, todayIn(active.timezone));
  const ids = centers.map((c) => c.id);
  const [metrics, baselines, lines] = await Promise.all([
    repos.pilot.metrics(ids, period.from, period.to),
    repos.pilot.baselines(ids),
    repos.pnl.lines(ids, period.from, period.to),
  ]);
  const failed = [metrics, baselines, lines].find((r) => !r.ok);
  const rows = metrics.ok ? metrics.data : [];
  const pnl = lines.ok ? pnlByCenter(lines.data, ids) : null;
  return {
    period,
    scopeAll,
    canScopeAll: readable.length > 1,
    error: failed && !failed.ok ? pilotErrorMessage(failed.error) : null,
    adoption: presentAdoption(rows),
    centers: centers.map((c) => ({
      id: c.id,
      name: c.name,
      comparison: comparePilot(
        summarizePilot(
          rows.filter((r) => r.detailCenterId === c.id),
          pnl?.centers.find((b) => b.detailCenterId === c.id)?.statement.grossMargin ?? null,
        ),
        baselines.ok ? baselines.data.filter((b) => b.detailCenterId === c.id) : [],
      ),
    })),
  };
}
