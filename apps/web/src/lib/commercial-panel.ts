import "server-only";
import {
  PANEL_KPIS,
  PANEL_KPI_ORIGIN,
  filterPanel,
  leadsByStage,
  panelByChannel,
  spendByOrigin,
  type PanelFilter,
  type PanelInput,
} from "@meguiars/analytics";
import {
  commercialErrorMessage,
  formatCommercialKpi,
  formatMoney,
  pilotPeriod,
  type CommercialRepository,
  type MarketingRepository,
} from "@meguiars/domain";

/** Valor de un KPI del panel (el ROAS como razón). */
function panelDisplay(unit: string, value: number | null): string {
  if (value == null) return "Sin datos";
  if (unit === "ratio") return `${formatMoney(value)} por peso`;
  return formatCommercialKpi(unit as "count" | "percent" | "currency" | "minutes", value);
}

/**
 * Panel comercial y de marketing: prospectos, conversiones, ventas, clientes,
 * inversión, costo por prospecto y por cliente, ingresos atribuidos, ROAS y
 * margen, con filtros por canal, campaña, servicio y responsable. Cada KPI
 * lleva fórmula y origen del dato; sin denominador dice «Sin datos».
 * Espejo exacto en la otra app (web ↔ móvil).
 */
export async function loadCommercialPanel(
  commercial: CommercialRepository,
  marketing: MarketingRepository,
  organizationId: string,
  centerIds: string[],
  periodId: string,
  today: string,
  filter: PanelFilter,
) {
  const period = pilotPeriod(periodId, today);
  const [leads, sales, spend] = await Promise.all([
    commercial.funnelFacts(centerIds, period.from, period.to),
    commercial.salesFacts(centerIds, period.from, period.to),
    marketing.spendFacts(organizationId, centerIds, period.from, period.to),
  ]);
  const failed = [leads, sales].find((r) => !r.ok);
  if (failed && !failed.ok) {
    return {
      period,
      error: commercialErrorMessage(failed.error),
      kpis: [],
      stages: [],
      channels: [],
      spend: null,
    };
  }
  const all: PanelInput = {
    leads: leads.ok
      ? leads.data.map((l) => ({
          leadId: l.leadId,
          source: l.source,
          ownerId: l.ownerId,
          campaignId: l.campaignId,
          interestServiceIds: l.interestServiceIds,
          stageName: l.stageName,
          stagePosition: l.stagePosition,
          firstContactMinutes: l.firstContactMinutes,
          bookedAt: l.bookedAt,
          wonAt: l.wonAt,
          status: l.status,
        }))
      : [],
    sales: sales.ok
      ? sales.data.map((s) => ({
          orderId: s.orderId,
          clientId: s.clientId,
          total: s.total,
          cost: s.cost,
          margin: s.margin,
          firstPurchase: s.firstPurchase,
          leadId: s.leadId,
          source: s.source,
          ownerId: s.ownerId,
          campaignId: s.campaignId,
          serviceIds: s.serviceIds,
        }))
      : [],
    // Sin permiso para ver campañas la inversión no se muestra (no es 0).
    spend: spend.ok
      ? spend.data.map((s) => ({
          campaignId: s.campaignId,
          channel: s.channel,
          amount: s.amount,
          origin: s.origin,
        }))
      : null,
  };
  const input = filterPanel(all, filter);
  return {
    period,
    error: null,
    kpis: PANEL_KPIS.map((k) => {
      const value = k.compute(input) as number | null;
      return {
        id: k.id,
        name: k.name,
        formula: k.formula,
        unit: k.unit,
        origin: PANEL_KPI_ORIGIN[k.id] ?? ("interno" as const),
        value,
        display: panelDisplay(k.unit, value),
      };
    }),
    stages: leadsByStage(input),
    channels: panelByChannel(input).map((r) => ({
      ...r,
      revenueLabel: r.attributedRevenue ? formatMoney(r.attributedRevenue) : "—",
      spendLabel: r.spend == null ? "Sin datos" : r.spend ? formatMoney(r.spend) : "—",
    })),
    spend: spendByOrigin(input),
  };
}
