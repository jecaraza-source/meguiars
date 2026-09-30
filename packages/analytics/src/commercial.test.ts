import { describe, expect, it } from "vitest";
import {
  commercialAvgTicket,
  commercialBookingToSale,
  commercialFirstResponse,
  commercialLeadToBooking,
  commercialLeadToQuote,
  commercialLeads,
  commercialQuoteDiscount,
  commercialQuoteToBooking,
  commercialQuotesValue,
  commercialSales,
  commercialSalesMargin,
  commercialUncontacted,
  funnelBreakdown,
  lossReasons,
  type FunnelFactInput,
} from "./commercial";

const fact = (over: Partial<FunnelFactInput>): FunnelFactInput => ({
  leadId: "l",
  detailCenterId: "c1",
  source: "instagram",
  ownerId: "u1",
  createdAt: "2026-09-01T10:00:00Z",
  firstContactMinutes: null,
  quotedAt: null,
  bookedAt: null,
  wonAt: null,
  lostAt: null,
  lossReason: null,
  status: "abierta",
  saleTotal: null,
  saleCost: null,
  saleMargin: null,
  ...over,
});

const facts = [
  fact({
    leadId: "a",
    firstContactMinutes: 10,
    quotedAt: "x",
    bookedAt: "x",
    status: "ganada",
    saleTotal: 860,
    saleCost: 250,
    saleMargin: 610,
  }),
  fact({ leadId: "b", firstContactMinutes: 30, quotedAt: "x", bookedAt: "x" }),
  fact({
    leadId: "c",
    source: "whatsapp",
    firstContactMinutes: 5,
    quotedAt: "x",
    status: "perdida",
    lossReason: "precio",
  }),
  fact({ leadId: "d", source: "whatsapp", ownerId: null }),
];

describe("indicadores del recorrido comercial", () => {
  const input = { facts };
  it("embudo: prospectos, conversiones y primera respuesta (mediana)", () => {
    expect(commercialLeads.compute(input)).toBe(4);
    expect(commercialLeadToQuote.compute(input)).toBe(75);
    expect(commercialLeadToBooking.compute(input)).toBe(50);
    expect(commercialBookingToSale.compute(input)).toBe(50);
    expect(commercialFirstResponse.compute(input)).toBe(10);
    expect(commercialUncontacted.compute(input)).toBe(1);
  });
  it("ventas atribuidas, ticket y margen de contribución (no utilidad neta)", () => {
    expect(commercialSales.compute(input)).toBe(860);
    expect(commercialAvgTicket.compute(input)).toBe(860);
    expect(commercialSalesMargin.compute(input)).toBe(610);
    expect(commercialSalesMargin.formula).toMatch(/No es utilidad neta/);
  });
  it("sin datos es null, nunca cero", () => {
    const empty = { facts: [], quotes: [] };
    expect(commercialLeads.compute(empty)).toBe(0);
    expect(commercialLeadToQuote.compute(empty)).toBeNull();
    expect(commercialBookingToSale.compute({ facts: [fact({})] })).toBeNull();
    expect(commercialFirstResponse.compute(empty)).toBeNull();
    expect(commercialSales.compute(empty)).toBeNull();
    expect(commercialQuotesValue.compute(empty)).toBeNull();
    expect(commercialQuoteToBooking.compute(empty)).toBeNull();
  });
  it("cotizaciones: valor, conversión a reserva y descuento (sin canceladas)", () => {
    const quotes = [
      {
        quoteId: "1",
        status: "convertida",
        expired: false,
        total: 860,
        discountTotal: 140,
        contributionMargin: 592,
        booked: true,
      },
      {
        quoteId: "2",
        status: "enviada",
        expired: true,
        total: 600,
        discountTotal: 0,
        contributionMargin: 480,
        booked: false,
      },
      {
        quoteId: "3",
        status: "cancelada",
        expired: false,
        total: 999,
        discountTotal: 0,
        contributionMargin: 0,
        booked: false,
      },
    ];
    expect(commercialQuotesValue.compute({ facts: [], quotes })).toBe(1460);
    expect(commercialQuoteToBooking.compute({ facts: [], quotes })).toBe(50);
    expect(commercialQuoteDiscount.compute({ facts: [], quotes })).toBe(8.8);
  });
  it("desglose por canal y motivos de pérdida", () => {
    const bySource = funnelBreakdown(facts, "source");
    expect(bySource.map((r) => [r.key, r.leads, r.booked, r.won, r.sales])).toEqual([
      ["instagram", 2, 2, 1, 860],
      ["whatsapp", 2, 0, 0, null],
    ]);
    expect(funnelBreakdown(facts, "owner").find((r) => r.key === "")?.leads).toBe(1);
    expect(lossReasons(facts)).toEqual([{ reason: "precio", count: 1 }]);
  });
});
