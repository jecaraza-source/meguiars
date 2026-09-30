import { defineKpi, kpiRegistry } from "./kpi";

/**
 * Panel comercial y de marketing (CR2 fase 4). Fuentes:
 * - public.commercial_funnel_facts: prospectos REGISTRADOS en el periodo (cohorte).
 * - public.commercial_sales_facts: OS entregadas (no B2B) en el periodo.
 * - public.campaign_spend_facts: inversión registrada (ligada a egreso o capturada).
 *
 * Modelo de atribución: un toque. El prospecto tiene a lo más una campaña (a
 * mano o por la promoción de la campaña) y una OS gana a lo más un prospecto
 * (índice único), así que una venta nunca se atribuye dos veces. «Atribuido» =
 * OS entregada en el periodo cuyo prospecto ganador tiene campaña.
 *
 * Origen del dato: «interno» (prospectos y OS de la plataforma), «manual»
 * (inversión registrada por el equipo) o «proveedor» (API de anuncios: no hay
 * ninguna conectada). Sin denominador el KPI es null («sin datos»), nunca 0.
 * El ROAS es ventas ÷ inversión: NO es rentabilidad neta.
 */

export type PanelOrigin = "interno" | "manual" | "proveedor";

export interface PanelLeadFact {
  leadId: string;
  source: string;
  ownerId: string | null;
  campaignId: string | null;
  interestServiceIds: readonly string[];
  stageName: string;
  stagePosition: number;
  firstContactMinutes: number | null;
  bookedAt: string | null;
  wonAt: string | null;
  status: "abierta" | "ganada" | "perdida";
}

export interface PanelSaleFact {
  orderId: string;
  clientId: string;
  total: number;
  cost: number;
  margin: number;
  firstPurchase: boolean;
  leadId: string | null;
  source: string | null;
  ownerId: string | null;
  campaignId: string | null;
  serviceIds: readonly string[];
}

export interface PanelSpendFact {
  campaignId: string;
  channel: string;
  amount: number;
  origin: "egreso" | "manual";
}

export interface PanelFilter {
  channel?: string | undefined;
  campaignId?: string | undefined;
  serviceId?: string | undefined;
  ownerId?: string | undefined;
}

export interface PanelInput {
  leads: readonly PanelLeadFact[];
  sales: readonly PanelSaleFact[];
  /** null: la inversión no se puede separar con el filtro elegido (servicio o responsable). */
  spend: readonly PanelSpendFact[] | null;
}

/** Aplica los filtros a los hechos. La inversión sólo se separa por canal y campaña. */
export function filterPanel(input: PanelInput, f: PanelFilter): PanelInput {
  const leads = input.leads.filter(
    (l) =>
      (!f.channel || l.source === f.channel) &&
      (!f.campaignId || l.campaignId === f.campaignId) &&
      (!f.serviceId || l.interestServiceIds.includes(f.serviceId)) &&
      (!f.ownerId || l.ownerId === f.ownerId),
  );
  const sales = input.sales.filter(
    (s) =>
      (!f.channel || s.source === f.channel) &&
      (!f.campaignId || s.campaignId === f.campaignId) &&
      (!f.serviceId || s.serviceIds.includes(f.serviceId)) &&
      (!f.ownerId || s.ownerId === f.ownerId),
  );
  const spend =
    input.spend && !f.serviceId && !f.ownerId
      ? input.spend.filter(
          (s) => (!f.channel || s.channel === f.channel) && (!f.campaignId || s.campaignId === f.campaignId),
        )
      : null;
  return { leads, sales, spend };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: readonly number[]) => round2(xs.reduce((a, b) => a + b, 0));
const LEAD_SOURCES = ["public.leads", "public.lead_events"] as const;
const SALE_SOURCES = ["public.service_orders", "public.leads"] as const;
const SPEND_SOURCES = ["public.campaign_spend"] as const;
const attributed = (i: PanelInput) => i.sales.filter((s) => s.campaignId != null);
const spendTotal = (i: PanelInput) => (i.spend ? sum(i.spend.map((s) => s.amount)) : null);

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : round1((s[m - 1]! + s[m]!) / 2);
}

export const panelLeads = kpiRegistry.register(
  defineKpi<PanelInput>({
    id: "panel.leads",
    name: "Prospectos",
    formula: "Prospectos registrados en el periodo (con los filtros)",
    sources: LEAD_SOURCES,
    unit: "count",
    scopes: ["center", "corporate"],
    compute: (i) => i.leads.length,
  }),
);

export const panelLeadToBooking = kpiRegistry.register(
  defineKpi<PanelInput, number | null>({
    id: "panel.lead_to_booking",
    name: "Prospecto → reserva",
    formula: "Prospectos que reservaron ÷ prospectos × 100",
    sources: LEAD_SOURCES,
    unit: "percent",
    scopes: ["center", "corporate"],
    compute: (i) =>
      i.leads.length ? round1((i.leads.filter((l) => l.bookedAt).length / i.leads.length) * 100) : null,
  }),
);

export const panelBookingToSale = kpiRegistry.register(
  defineKpi<PanelInput, number | null>({
    id: "panel.booking_to_sale",
    name: "Reserva → venta",
    formula: "Prospectos que reservaron y compraron (OS entregada) ÷ prospectos que reservaron × 100",
    sources: LEAD_SOURCES,
    unit: "percent",
    scopes: ["center", "corporate"],
    compute: (i) => {
      const booked = i.leads.filter((l) => l.bookedAt);
      return booked.length
        ? round1((booked.filter((l) => l.status === "ganada").length / booked.length) * 100)
        : null;
    },
  }),
);

export const panelFirstResponse = kpiRegistry.register(
  defineKpi<PanelInput, number | null>({
    id: "panel.first_response_minutes",
    name: "Tiempo de primera respuesta",
    formula: "Mediana de (primer contacto − alta del prospecto) en minutos, de los ya contactados",
    sources: LEAD_SOURCES,
    unit: "minutes",
    scopes: ["center", "corporate"],
    compute: (i) => median(i.leads.map((l) => l.firstContactMinutes).filter((m): m is number => m != null)),
  }),
);

export const panelSales = kpiRegistry.register(
  defineKpi<PanelInput, number | null>({
    id: "panel.sales",
    name: "Ventas",
    formula: "Σ total de las OS entregadas en el periodo (sin B2B)",
    sources: SALE_SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => (i.sales.length ? sum(i.sales.map((s) => s.total)) : null),
  }),
);

export const panelAvgTicket = kpiRegistry.register(
  defineKpi<PanelInput, number | null>({
    id: "panel.avg_ticket",
    name: "Ticket promedio",
    formula: "Ventas ÷ OS entregadas",
    sources: SALE_SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => (i.sales.length ? round2(sum(i.sales.map((s) => s.total)) / i.sales.length) : null),
  }),
);

export const panelNewCustomers = kpiRegistry.register(
  defineKpi<PanelInput>({
    id: "panel.new_customers",
    name: "Clientes nuevos",
    formula: "Clientes cuya primera OS entregada (en la organización) cae en el periodo",
    sources: SALE_SOURCES,
    unit: "count",
    scopes: ["center", "corporate"],
    compute: (i) => new Set(i.sales.filter((s) => s.firstPurchase).map((s) => s.clientId)).size,
  }),
);

export const panelReturningCustomers = kpiRegistry.register(
  defineKpi<PanelInput>({
    id: "panel.returning_customers",
    name: "Clientes recurrentes",
    formula: "Clientes con OS entregada en el periodo que ya habían comprado antes",
    sources: SALE_SOURCES,
    unit: "count",
    scopes: ["center", "corporate"],
    compute: (i) => {
      const fresh = new Set(i.sales.filter((s) => s.firstPurchase).map((s) => s.clientId));
      return new Set(i.sales.filter((s) => !s.firstPurchase && !fresh.has(s.clientId)).map((s) => s.clientId))
        .size;
    },
  }),
);

export const panelSpend = kpiRegistry.register(
  defineKpi<PanelInput, number | null>({
    id: "panel.spend",
    name: "Inversión publicitaria",
    formula: "Σ gasto de campañas registrado en el periodo (ligado a egreso o capturado; sin anulados)",
    sources: SPEND_SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => (i.spend && i.spend.length ? spendTotal(i) : null),
  }),
);

export const panelCostPerLead = kpiRegistry.register(
  defineKpi<PanelInput, number | null>({
    id: "panel.cost_per_lead",
    name: "Costo por prospecto",
    formula: "Inversión ÷ prospectos atribuidos a una campaña",
    sources: [...SPEND_SOURCES, ...LEAD_SOURCES],
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => {
      const spend = spendTotal(i);
      const n = i.leads.filter((l) => l.campaignId).length;
      return spend && n ? round2(spend / n) : null;
    },
  }),
);

export const panelCostPerCustomer = kpiRegistry.register(
  defineKpi<PanelInput, number | null>({
    id: "panel.cost_per_customer",
    name: "Costo por cliente adquirido",
    formula: "Inversión ÷ clientes nuevos cuya primera compra se atribuye a una campaña",
    sources: [...SPEND_SOURCES, ...SALE_SOURCES],
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => {
      const spend = spendTotal(i);
      const n = new Set(
        attributed(i)
          .filter((s) => s.firstPurchase)
          .map((s) => s.clientId),
      ).size;
      return spend && n ? round2(spend / n) : null;
    },
  }),
);

export const panelAttributedRevenue = kpiRegistry.register(
  defineKpi<PanelInput, number | null>({
    id: "panel.attributed_revenue",
    name: "Ingresos atribuidos",
    formula:
      "Σ total de las OS entregadas en el periodo que ganaron a un prospecto con campaña (cada OS una vez)",
    sources: SALE_SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    // Con inversión, «ninguna venta atribuida» es un 0 real; sin ventas ni inversión, sin datos.
    compute: (i) => (attributed(i).length || spendTotal(i) ? sum(attributed(i).map((s) => s.total)) : null),
  }),
);

export const panelRoas = kpiRegistry.register(
  defineKpi<PanelInput, number | null>({
    id: "panel.roas",
    name: "ROAS (ingresos ÷ inversión)",
    formula:
      "Ingresos atribuidos ÷ inversión. No es rentabilidad neta: no descuenta costos, pago al operador ni la inversión",
    sources: [...SPEND_SOURCES, ...SALE_SOURCES],
    unit: "ratio",
    scopes: ["center", "corporate"],
    compute: (i) => {
      const spend = spendTotal(i);
      return spend ? round2(sum(attributed(i).map((s) => s.total)) / spend) : null;
    },
  }),
);

export const panelAttributedMargin = kpiRegistry.register(
  defineKpi<PanelInput, number | null>({
    id: "panel.attributed_margin",
    name: "Margen de contribución atribuido",
    formula: "Σ (total − costo directo, incluido el pago al operador) de las ventas atribuidas",
    sources: SALE_SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => (attributed(i).length || spendTotal(i) ? sum(attributed(i).map((s) => s.margin)) : null),
  }),
);

export const panelMarginAfterSpend = kpiRegistry.register(
  defineKpi<PanelInput, number | null>({
    id: "panel.margin_after_spend",
    name: "Margen atribuido después de la inversión",
    formula: "Margen de contribución atribuido − inversión. No incluye gastos de personal ni operativos",
    sources: [...SPEND_SOURCES, ...SALE_SOURCES],
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => {
      const spend = spendTotal(i);
      if (spend == null || (!spend && !attributed(i).length)) return null;
      return round2(sum(attributed(i).map((s) => s.margin)) - spend);
    },
  }),
);

export const PANEL_KPIS = [
  panelLeads,
  panelLeadToBooking,
  panelBookingToSale,
  panelFirstResponse,
  panelSales,
  panelAvgTicket,
  panelNewCustomers,
  panelReturningCustomers,
  panelSpend,
  panelCostPerLead,
  panelCostPerCustomer,
  panelAttributedRevenue,
  panelRoas,
  panelAttributedMargin,
  panelMarginAfterSpend,
] as const;

/** De dónde sale cada indicador (se muestra junto al valor). */
export const PANEL_KPI_ORIGIN: Record<(typeof PANEL_KPIS)[number]["id"], PanelOrigin> = {
  "panel.leads": "interno",
  "panel.lead_to_booking": "interno",
  "panel.booking_to_sale": "interno",
  "panel.first_response_minutes": "interno",
  "panel.sales": "interno",
  "panel.avg_ticket": "interno",
  "panel.new_customers": "interno",
  "panel.returning_customers": "interno",
  "panel.spend": "manual",
  "panel.cost_per_lead": "manual",
  "panel.cost_per_customer": "manual",
  "panel.attributed_revenue": "interno",
  "panel.roas": "manual",
  "panel.attributed_margin": "interno",
  "panel.margin_after_spend": "manual",
};

/** Prospectos por etapa actual, en el orden del embudo. */
export function leadsByStage(i: PanelInput): { stage: string; position: number; leads: number }[] {
  const m = new Map<string, { stage: string; position: number; leads: number }>();
  for (const l of i.leads) {
    const cur = m.get(l.stageName) ?? { stage: l.stageName, position: l.stagePosition, leads: 0 };
    cur.leads += 1;
    m.set(l.stageName, cur);
  }
  return [...m.values()].sort((a, b) => a.position - b.position);
}

export interface PanelChannelRow {
  channel: string;
  leads: number;
  booked: number;
  won: number;
  attributedRevenue: number;
  spend: number | null;
}

/** Desglose por canal de origen del prospecto (la inversión, por canal de la campaña). */
export function panelByChannel(i: PanelInput): PanelChannelRow[] {
  const channels = new Set<string>([
    ...i.leads.map((l) => l.source),
    ...attributed(i).map((s) => s.source ?? "sin_canal"),
    ...(i.spend ?? []).map((s) => s.channel),
  ]);
  return [...channels]
    .map((channel) => {
      const ls = i.leads.filter((l) => l.source === channel);
      return {
        channel,
        leads: ls.length,
        booked: ls.filter((l) => l.bookedAt).length,
        won: ls.filter((l) => l.status === "ganada").length,
        attributedRevenue: sum(
          attributed(i)
            .filter((s) => (s.source ?? "sin_canal") === channel)
            .map((s) => s.total),
        ),
        spend: i.spend ? sum(i.spend.filter((s) => s.channel === channel).map((s) => s.amount)) : null,
      };
    })
    .sort((a, b) => b.leads - a.leads || b.attributedRevenue - a.attributedRevenue);
}

/** Inversión por origen del registro. */
export function spendByOrigin(i: PanelInput): { egreso: number; manual: number } | null {
  if (!i.spend) return null;
  return {
    egreso: sum(i.spend.filter((s) => s.origin === "egreso").map((s) => s.amount)),
    manual: sum(i.spend.filter((s) => s.origin === "manual").map((s) => s.amount)),
  };
}
