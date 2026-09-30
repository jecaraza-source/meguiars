import "server-only";
import { CAMPAIGN_KPIS, type CampaignFactInput } from "@meguiars/analytics";
import {
  commercialErrorMessage,
  formatCommercialKpi,
  formatMoney,
  pilotPeriod,
  type MarketingRepository,
} from "@meguiars/domain";

/** Valor de un KPI de campaña (ventas por peso como razón; el resto como los comerciales). */
function display(unit: string, value: number | null): string {
  if (value == null) return "Sin datos";
  if (unit === "ratio") return `${formatMoney(value)} por peso`;
  return formatCommercialKpi(unit as "count" | "percent" | "currency", value);
}

/**
 * Reporte de campañas del periodo: KPIs con fórmula (sin datos en lugar de 0)
 * y una fila por campaña con su costo por prospecto, ventas y margen después
 * de la inversión. Espejo exacto en apps/mobile/src/lib/marketing.ts.
 */
export async function loadCampaignReport(
  repo: MarketingRepository,
  organizationId: string,
  centerIds: string[],
  periodId: string,
  today: string,
) {
  const period = pilotPeriod(periodId, today);
  const facts = await repo.facts(organizationId, centerIds, period.from, period.to);
  if (!facts.ok) return { period, error: commercialErrorMessage(facts.error), kpis: [], rows: [] };
  const input = { facts: facts.data as CampaignFactInput[] };
  const kpi = (id: string, f: CampaignFactInput) => {
    const k = CAMPAIGN_KPIS.find((x) => x.id === id)!;
    return display(k.unit, k.compute({ facts: [f] }) as number | null);
  };
  return {
    period,
    error: null,
    kpis: CAMPAIGN_KPIS.map((k) => {
      const value = k.compute(input) as number | null;
      return {
        id: k.id,
        name: k.name,
        formula: k.formula,
        unit: k.unit,
        value,
        display: display(k.unit, value),
      };
    }),
    rows: facts.data.map((f) => ({
      ...f,
      spendLabel: kpi("campaign.spend", f),
      costPerLeadLabel: kpi("campaign.cost_per_lead", f),
      salesLabel: kpi("campaign.sales", f),
      salesPerPesoLabel: kpi("campaign.sales_per_peso", f),
      marginAfterSpendLabel: kpi("campaign.margin_after_spend", f),
      leadToSaleLabel: kpi("campaign.lead_to_sale", f),
    })),
  };
}

/** Semana (lunes a domingo) que contiene la fecha; `offset` en semanas. */
export function calendarWeek(today: string, offset = 0) {
  const d = new Date(`${today}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d.getTime() - dow * 864e5 + offset * 7 * 864e5);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { from: iso(monday), to: iso(new Date(monday.getTime() + 6 * 864e5)) };
}
