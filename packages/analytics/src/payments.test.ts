import { describe, expect, it } from "vitest";
import { kpiRegistry } from "./kpi";
import {
  consolidateReconciliation,
  paymentsByMethod,
  paymentsCashIn,
  paymentsChangeGiven,
  paymentsCollected,
  paymentsCollectionRate,
  paymentsNonCash,
  paymentsReversed,
  type PaymentFactInput,
} from "./payments";

// Mismo escenario que supabase/tests/payments.test.sql (corte del día).
const f = (
  method: string,
  collectsCash: boolean,
  valid: number,
  reversed: number,
  change = 0,
): PaymentFactInput => ({
  day: "2026-09-27",
  method,
  methodName: method,
  collectsCash,
  validAmount: valid,
  validCount: valid > 0 ? 1 : 0,
  reversedAmount: reversed,
  reversedCount: reversed > 0 ? 1 : 0,
  changeAmount: change,
});
const facts = [
  f("efectivo", true, 1500, 100, 500),
  f("tarjeta", true, 1300, 1300),
  f("transferencia", true, 0, 800),
  f("membresia", false, 0, 200),
  f("credito_b2b", false, 250, 0),
];

describe("KPIs de cobranza", () => {
  it("cobrado = en caja + liquidado sin efectivo; reversos aparte", () => {
    expect(paymentsCollected.compute({ facts })).toBe(3050);
    expect(paymentsCashIn.compute({ facts })).toBe(2800);
    expect(paymentsNonCash.compute({ facts })).toBe(250);
    expect(paymentsReversed.compute({ facts })).toBe(2400);
    expect(paymentsChangeGiven.compute({ facts })).toBe(500);
    expect(paymentsCollected.compute({ facts: [] })).toBe(0);
  });

  it("desglose por forma de pago con participación", () => {
    const rows = paymentsByMethod({ facts });
    expect(rows.find((r) => r.method === "efectivo")).toMatchObject({
      amount: 1500,
      reversed: 100,
      share: 49.18,
    });
    expect(rows.reduce((a, r) => a + r.amount, 0)).toBe(3050);
  });

  it("conciliación consolidada y % de ventas cobradas", () => {
    const rows = [
      {
        deliveredOrders: 1,
        salesTotal: 2800,
        collectedForSales: 2800,
        pendingForSales: 0,
        collectedInRange: 3050,
        cashInRange: 2800,
        reversedInRange: 2400,
      },
      {
        deliveredOrders: 2,
        salesTotal: 1000,
        collectedForSales: 500,
        pendingForSales: 500,
        collectedInRange: 500,
        cashInRange: 500,
        reversedInRange: 0,
      },
    ];
    expect(consolidateReconciliation(rows)).toMatchObject({
      deliveredOrders: 3,
      salesTotal: 3800,
      pendingForSales: 500,
    });
    expect(paymentsCollectionRate.compute({ rows })).toBe(86.84);
    expect(paymentsCollectionRate.compute({ rows: [] })).toBe(0);
  });

  it("registrados con fuente de datos", () => {
    expect(kpiRegistry.get("payments.collected")?.sources).toContain("public.payments");
  });
});
