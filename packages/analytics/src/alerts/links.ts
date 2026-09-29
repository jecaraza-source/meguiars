import {
  corporateDrillHref,
  dashboardFilterParams,
  type AlertInstance,
  type DashboardChannelKey,
  type DashboardFilters,
} from "@meguiars/domain";
import { CORPORATE_CARDS } from "../corporate/cards";

/**
 * Enlaces de una alerta al dato que la originó: Dirección → KPIs con el mismo
 * periodo y centros, y —si el KPI es una tarjeta del tablero corporativo— su
 * drill-down (centro → canal/motor → servicio → OS).
 */
export function alertLinks(
  a: Pick<AlertInstance, "metricId" | "channel" | "scopeKey" | "detailCenterIds" | "periodFrom" | "periodTo">,
  allowedCenterIds: readonly string[],
): { kpis: string; drill: string | null } {
  const centerIds = a.detailCenterIds.filter((id) => allowedCenterIds.includes(id));
  const filters: DashboardFilters = {
    centerIds: centerIds.length ? centerIds : [...allowedCenterIds],
    period: "personalizado",
    from: a.periodFrom,
    to: a.periodTo,
    channel: (a.channel as DashboardChannelKey | null) ?? null,
    engine: null,
  };
  const qs = new URLSearchParams(dashboardFilterParams(filters, allowedCenterIds)).toString();
  const card = CORPORATE_CARDS.find((c) => c.metricId === a.metricId && c.channel === (a.channel ?? null));
  const isCenter = a.scopeKey !== "conjunto" && a.scopeKey !== "corporativo";
  return {
    kpis: `/direccion/kpis?${qs}`,
    drill: card
      ? corporateDrillHref(
          { cardId: card.id, ...(isCenter ? { center: a.scopeKey } : {}) },
          { ...filters, channel: null },
          allowedCenterIds,
        )
      : null,
  };
}
