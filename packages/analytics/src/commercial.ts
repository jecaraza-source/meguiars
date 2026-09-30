import { defineKpi, kpiRegistry } from "./kpi";

/**
 * Recorrido comercial (CR2 fase 1). Fuentes: public.commercial_funnel_facts
 * (un hecho por prospecto, derivado de lead_events, sin datos personales) y
 * public.commercial_quote_facts (un hecho por cotización).
 *
 * Modelo de atribución: cohorte de prospectos CREADOS en el periodo. Una venta
 * es la OS entregada que ganó al prospecto: automática cuando la OS se abrió
 * desde la reserva de su cotización, o manual eligiendo una OS del cliente.
 * Cada OS se atribuye a un solo prospecto (índice único en la base), así que
 * una venta nunca cuenta dos veces. Ventas sin prospecto (walk-in, clientes
 * recurrentes) no entran aquí: están en el P&L.
 *
 * Sin denominador el KPI es null ("sin datos"), nunca 0.
 */
export interface FunnelFactInput {
  leadId: string;
  detailCenterId: string;
  source: string;
  ownerId: string | null;
  createdAt: string;
  firstContactMinutes: number | null;
  quotedAt: string | null;
  bookedAt: string | null;
  wonAt: string | null;
  lostAt: string | null;
  lossReason: string | null;
  status: "abierta" | "ganada" | "perdida";
  saleTotal: number | null;
  saleCost: number | null;
  saleMargin: number | null;
}

export interface QuoteFactInput {
  quoteId: string;
  status: string;
  expired: boolean;
  total: number;
  discountTotal: number;
  contributionMargin: number;
  booked: boolean;
}

export interface CommercialKpiInput {
  facts: readonly FunnelFactInput[];
  quotes?: readonly QuoteFactInput[];
}

const SOURCES = ["public.lead_events", "public.leads", "public.service_orders"] as const;
const QUOTE_SOURCES = [
  "public.quotes",
  "public.quote_items",
  "public.appointments",
  "public.service_orders",
] as const;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (num: number, den: number): number | null => (den > 0 ? round1((num / den) * 100) : null);
const sum = (xs: readonly number[]) => round2(xs.reduce((a, b) => a + b, 0));
const won = (i: CommercialKpiInput) => i.facts.filter((f) => f.status === "ganada" && f.saleTotal != null);

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : round1((s[m - 1]! + s[m]!) / 2);
}

export const commercialLeads = kpiRegistry.register(
  defineKpi<CommercialKpiInput>({
    id: "commercial.leads",
    name: "Prospectos",
    formula: "Prospectos registrados en el periodo (fecha del centro)",
    sources: SOURCES,
    unit: "count",
    scopes: ["center", "corporate"],
    compute: (i) => i.facts.length,
  }),
);

export const commercialLeadToQuote = kpiRegistry.register(
  defineKpi<CommercialKpiInput, number | null>({
    id: "commercial.lead_to_quote",
    name: "Prospecto → cotización",
    formula: "Prospectos del periodo con al menos una cotización ÷ prospectos del periodo × 100",
    sources: SOURCES,
    unit: "percent",
    scopes: ["center", "corporate"],
    compute: (i) => pct(i.facts.filter((f) => f.quotedAt).length, i.facts.length),
  }),
);

export const commercialLeadToBooking = kpiRegistry.register(
  defineKpi<CommercialKpiInput, number | null>({
    id: "commercial.lead_to_booking",
    name: "Prospecto → reserva",
    formula: "Prospectos del periodo con una reserva ÷ prospectos del periodo × 100",
    sources: SOURCES,
    unit: "percent",
    scopes: ["center", "corporate"],
    compute: (i) => pct(i.facts.filter((f) => f.bookedAt).length, i.facts.length),
  }),
);

export const commercialBookingToSale = kpiRegistry.register(
  defineKpi<CommercialKpiInput, number | null>({
    id: "commercial.booking_to_sale",
    name: "Reserva → venta",
    formula: "Prospectos con reserva que ya compraron (OS entregada) ÷ prospectos con reserva × 100",
    sources: SOURCES,
    unit: "percent",
    scopes: ["center", "corporate"],
    compute: (i) => {
      const booked = i.facts.filter((f) => f.bookedAt);
      return pct(booked.filter((f) => f.status === "ganada").length, booked.length);
    },
  }),
);

export const commercialFirstResponse = kpiRegistry.register(
  defineKpi<CommercialKpiInput, number | null>({
    id: "commercial.first_response_minutes",
    name: "Tiempo de primera respuesta (mediana)",
    formula: "Mediana de (primer contacto − alta) en minutos, de los prospectos ya contactados",
    sources: SOURCES,
    unit: "minutes",
    scopes: ["center", "corporate"],
    compute: (i) => median(i.facts.map((f) => f.firstContactMinutes).filter((m): m is number => m != null)),
  }),
);

export const commercialUncontacted = kpiRegistry.register(
  defineKpi<CommercialKpiInput>({
    id: "commercial.uncontacted",
    name: "Prospectos sin contactar",
    formula: "Prospectos abiertos del periodo sin ningún contacto registrado",
    sources: SOURCES,
    unit: "count",
    scopes: ["center", "corporate"],
    compute: (i) => i.facts.filter((f) => f.status === "abierta" && f.firstContactMinutes == null).length,
  }),
);

export const commercialSales = kpiRegistry.register(
  defineKpi<CommercialKpiInput, number | null>({
    id: "commercial.attributed_sales",
    name: "Ventas atribuidas",
    formula: "Σ total de las OS que ganaron a los prospectos del periodo (una OS, un prospecto)",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => {
      const w = won(i);
      return w.length ? sum(w.map((f) => f.saleTotal!)) : null;
    },
  }),
);

export const commercialAvgTicket = kpiRegistry.register(
  defineKpi<CommercialKpiInput, number | null>({
    id: "commercial.avg_ticket",
    name: "Ticket promedio atribuido",
    formula: "Ventas atribuidas ÷ prospectos ganados",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => {
      const w = won(i);
      return w.length ? round2(sum(w.map((f) => f.saleTotal!)) / w.length) : null;
    },
  }),
);

export const commercialSalesMargin = kpiRegistry.register(
  defineKpi<CommercialKpiInput, number | null>({
    id: "commercial.attributed_margin",
    name: "Margen de contribución atribuido",
    formula:
      "Σ (total − costo directo) de las OS atribuidas; el costo incluye el pago al operador. No es utilidad neta",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => {
      const w = won(i).filter((f) => f.saleMargin != null);
      return w.length ? sum(w.map((f) => f.saleMargin!)) : null;
    },
  }),
);

export const commercialQuotesValue = kpiRegistry.register(
  defineKpi<CommercialKpiInput, number | null>({
    id: "commercial.quotes_value",
    name: "Valor cotizado",
    formula: "Σ total de las cotizaciones creadas en el periodo (sin canceladas)",
    sources: QUOTE_SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => {
      const q = (i.quotes ?? []).filter((x) => x.status !== "cancelada");
      return q.length ? sum(q.map((x) => x.total)) : null;
    },
  }),
);

export const commercialQuoteToBooking = kpiRegistry.register(
  defineKpi<CommercialKpiInput, number | null>({
    id: "commercial.quote_to_booking",
    name: "Cotización → reserva",
    formula: "Cotizaciones del periodo reservadas ÷ cotizaciones del periodo sin canceladas × 100",
    sources: QUOTE_SOURCES,
    unit: "percent",
    scopes: ["center", "corporate"],
    compute: (i) => {
      const q = (i.quotes ?? []).filter((x) => x.status !== "cancelada");
      return pct(q.filter((x) => x.booked).length, q.length);
    },
  }),
);

export const commercialQuoteDiscount = kpiRegistry.register(
  defineKpi<CommercialKpiInput, number | null>({
    id: "commercial.quote_discount_pct",
    name: "Descuento sobre lo cotizado",
    formula: "Σ descuentos ÷ Σ (total + descuentos) de las cotizaciones del periodo × 100",
    sources: QUOTE_SOURCES,
    unit: "percent",
    scopes: ["center", "corporate"],
    compute: (i) => {
      const q = (i.quotes ?? []).filter((x) => x.status !== "cancelada");
      const disc = sum(q.map((x) => x.discountTotal));
      return pct(disc, sum(q.map((x) => x.total)) + disc);
    },
  }),
);

export const COMMERCIAL_KPIS = [
  commercialLeads,
  commercialLeadToQuote,
  commercialLeadToBooking,
  commercialBookingToSale,
  commercialFirstResponse,
  commercialUncontacted,
  commercialSales,
  commercialAvgTicket,
  commercialSalesMargin,
  commercialQuotesValue,
  commercialQuoteToBooking,
  commercialQuoteDiscount,
] as const;

export interface FunnelBreakdownRow {
  key: string;
  leads: number;
  quoted: number;
  booked: number;
  won: number;
  lost: number;
  leadToBooking: number | null;
  sales: number | null;
  margin: number | null;
  medianFirstResponse: number | null;
}

/** Desglose por canal de origen o por responsable (misma cohorte y fórmulas). */
export function funnelBreakdown(
  facts: readonly FunnelFactInput[],
  by: "source" | "owner" | "center",
): FunnelBreakdownRow[] {
  const groups = new Map<string, FunnelFactInput[]>();
  for (const f of facts) {
    const key = by === "source" ? f.source : by === "owner" ? (f.ownerId ?? "") : f.detailCenterId;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  return [...groups.entries()]
    .map(([key, g]) => {
      const w = g.filter((f) => f.status === "ganada" && f.saleTotal != null);
      return {
        key,
        leads: g.length,
        quoted: g.filter((f) => f.quotedAt).length,
        booked: g.filter((f) => f.bookedAt).length,
        won: g.filter((f) => f.status === "ganada").length,
        lost: g.filter((f) => f.status === "perdida").length,
        leadToBooking: pct(g.filter((f) => f.bookedAt).length, g.length),
        sales: w.length ? sum(w.map((f) => f.saleTotal!)) : null,
        margin: w.some((f) => f.saleMargin != null)
          ? sum(w.filter((f) => f.saleMargin != null).map((f) => f.saleMargin!))
          : null,
        medianFirstResponse: median(
          g.map((f) => f.firstContactMinutes).filter((m): m is number => m != null),
        ),
      };
    })
    .sort((a, b) => b.leads - a.leads || a.key.localeCompare(b.key));
}

/** Motivos de pérdida del periodo, de más a menos frecuente. */
export function lossReasons(facts: readonly FunnelFactInput[]) {
  const counts = new Map<string, number>();
  for (const f of facts)
    if (f.status === "perdida" && f.lossReason) counts.set(f.lossReason, (counts.get(f.lossReason) ?? 0) + 1);
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}
