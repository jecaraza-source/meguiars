import { defineKpi, kpiRegistry } from "./kpi";

/**
 * Campañas (CR2 fase 3). Fuente: public.campaign_facts: una fila por campaña con
 * la cohorte de prospectos atribuidos que se registraron en el periodo (centros
 * visibles), la inversión registrada en el periodo y los usos de sus promociones.
 *
 * Atribución: el prospecto se liga a la campaña a mano o al aplicar una
 * promoción de la campaña en su cotización. Ventas = OS entregadas que ganaron
 * a esos prospectos (una OS, un prospecto). Sin denominador el KPI es null
 * ("sin datos"), nunca 0. «Ventas por peso invertido» NO es utilidad: la
 * utilidad descuenta costos directos, pago al operador y la propia inversión
 * (ver «Margen después de la inversión»).
 */
export interface CampaignFactInput {
  campaignId: string;
  name: string;
  budget: number | null;
  spend: number;
  leads: number;
  contacted: number;
  quoted: number;
  booked: number;
  won: number;
  sales: number;
  salesCost: number;
  salesMargin: number;
  promoUses: number;
  promoDiscount: number;
}

export interface CampaignKpiInput {
  facts: readonly CampaignFactInput[];
}

const SOURCES = [
  "public.campaigns",
  "public.campaign_spend",
  "public.leads",
  "public.service_orders",
] as const;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const total = (i: CampaignKpiInput, k: keyof Omit<CampaignFactInput, "campaignId" | "name" | "budget">) =>
  round2(i.facts.reduce((a, f) => a + f[k], 0));
const div = (num: number, den: number, digits = 2): number | null =>
  den > 0 ? (digits === 1 ? round1(num / den) : round2(num / den)) : null;

export const campaignSpend = kpiRegistry.register(
  defineKpi<CampaignKpiInput, number | null>({
    id: "campaign.spend",
    name: "Inversión",
    formula: "Σ gasto registrado de las campañas en el periodo (sin anulados)",
    sources: ["public.campaign_spend"],
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => (i.facts.length ? total(i, "spend") : null),
  }),
);

export const campaignLeads = kpiRegistry.register(
  defineKpi<CampaignKpiInput>({
    id: "campaign.leads",
    name: "Prospectos atribuidos",
    formula: "Prospectos del periodo ligados a una campaña",
    sources: SOURCES,
    unit: "count",
    scopes: ["center", "corporate"],
    compute: (i) => total(i, "leads"),
  }),
);

export const campaignCostPerLead = kpiRegistry.register(
  defineKpi<CampaignKpiInput, number | null>({
    id: "campaign.cost_per_lead",
    name: "Costo por prospecto",
    formula: "Inversión ÷ prospectos atribuidos",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => (total(i, "spend") > 0 ? div(total(i, "spend"), total(i, "leads")) : null),
  }),
);

export const campaignLeadToSale = kpiRegistry.register(
  defineKpi<CampaignKpiInput, number | null>({
    id: "campaign.lead_to_sale",
    name: "Prospecto → venta",
    formula: "Prospectos atribuidos que compraron (OS entregada) ÷ prospectos atribuidos × 100",
    sources: SOURCES,
    unit: "percent",
    scopes: ["center", "corporate"],
    compute: (i) => {
      const leads = total(i, "leads");
      return leads > 0 ? round1((total(i, "won") / leads) * 100) : null;
    },
  }),
);

export const campaignCostPerSale = kpiRegistry.register(
  defineKpi<CampaignKpiInput, number | null>({
    id: "campaign.cost_per_sale",
    name: "Costo por venta",
    formula: "Inversión ÷ prospectos atribuidos que compraron",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => (total(i, "spend") > 0 ? div(total(i, "spend"), total(i, "won")) : null),
  }),
);

export const campaignSales = kpiRegistry.register(
  defineKpi<CampaignKpiInput, number | null>({
    id: "campaign.sales",
    name: "Ventas atribuidas",
    formula: "Σ total de las OS entregadas que ganaron a los prospectos de la campaña",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => (total(i, "leads") > 0 || total(i, "won") > 0 ? total(i, "sales") : null),
  }),
);

export const campaignSalesPerPeso = kpiRegistry.register(
  defineKpi<CampaignKpiInput, number | null>({
    id: "campaign.sales_per_peso",
    name: "Ventas por peso invertido",
    formula:
      "Ventas atribuidas ÷ inversión. No es utilidad: no descuenta costos, pago al operador ni la inversión",
    sources: SOURCES,
    unit: "ratio",
    scopes: ["center", "corporate"],
    compute: (i) => div(total(i, "sales"), total(i, "spend")),
  }),
);

export const campaignMarginAfterSpend = kpiRegistry.register(
  defineKpi<CampaignKpiInput, number | null>({
    id: "campaign.margin_after_spend",
    name: "Margen después de la inversión",
    formula:
      "Σ (total − costo directo, incluido el pago al operador) de las ventas atribuidas − inversión. No incluye gastos de personal ni operativos",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) =>
      i.facts.length && (total(i, "won") > 0 || total(i, "spend") > 0)
        ? round2(total(i, "salesMargin") - total(i, "spend"))
        : null,
  }),
);

export const campaignBudgetUsed = kpiRegistry.register(
  defineKpi<CampaignKpiInput, number | null>({
    id: "campaign.budget_used",
    name: "Presupuesto ejercido",
    formula: "Inversión del periodo ÷ presupuesto de las campañas con presupuesto × 100",
    sources: ["public.campaigns", "public.campaign_spend"],
    unit: "percent",
    scopes: ["center", "corporate"],
    compute: (i) => {
      const withBudget = i.facts.filter((f) => f.budget != null && f.budget > 0);
      const budget = withBudget.reduce((a, f) => a + (f.budget ?? 0), 0);
      return budget > 0 ? round1((withBudget.reduce((a, f) => a + f.spend, 0) / budget) * 100) : null;
    },
  }),
);

export const campaignPromoUses = kpiRegistry.register(
  defineKpi<CampaignKpiInput>({
    id: "campaign.promo_uses",
    name: "Usos de promociones",
    formula: "Cotizaciones y OS con una promoción de la campaña (sin anuladas)",
    sources: ["public.promotions", "public.quote_discounts", "public.service_order_discounts"],
    unit: "count",
    scopes: ["center", "corporate"],
    compute: (i) => total(i, "promoUses"),
  }),
);

export const campaignPromoDiscount = kpiRegistry.register(
  defineKpi<CampaignKpiInput, number | null>({
    id: "campaign.promo_discount",
    name: "Descuento otorgado por promociones",
    formula: "Σ descuento de las promociones de la campaña en cotizaciones y OS",
    sources: ["public.promotions", "public.quote_discounts", "public.service_order_discounts"],
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => (total(i, "promoUses") > 0 ? total(i, "promoDiscount") : null),
  }),
);

export const CAMPAIGN_KPIS = [
  campaignSpend,
  campaignLeads,
  campaignCostPerLead,
  campaignLeadToSale,
  campaignCostPerSale,
  campaignSales,
  campaignSalesPerPeso,
  campaignMarginAfterSpend,
  campaignBudgetUsed,
  campaignPromoUses,
  campaignPromoDiscount,
] as const;
