import { describe, expect, it } from "vitest";
import { b2bIncome, b2bMargin, b2bMarginPercent, b2bProfitability, type B2bProfitabilityFact } from "./b2b";
import { kpiRegistry } from "./kpi";

const fact = (f: Partial<B2bProfitabilityFact>): B2bProfitabilityFact => ({
  accountId: "a",
  accountName: "Flotillas",
  detailCenterId: "A",
  orders: 0,
  revenue: 0,
  cost: 0,
  feeRevenue: 0,
  ...f,
});

describe("rentabilidad B2B", () => {
  it("ingreso = OS + cuotas; margen y % sobre el ingreso", () => {
    const facts = [
      fact({ orders: 1, revenue: 2680, cost: 980 }),
      fact({ accountId: "h", accountName: "Hotel", feeRevenue: 2000, cost: 160 }),
    ];
    expect(b2bIncome.compute({ facts })).toBe(4680);
    expect(b2bMargin.compute({ facts })).toBe(3540);
    expect(b2bMarginPercent.compute({ facts })).toBe(75.64);
    expect(b2bMarginPercent.compute({ facts: [] })).toBe(0);
  });

  it("por cuenta y centro, con consolidado de la cuenta multicentro", () => {
    const { rows, total } = b2bProfitability([
      fact({ orders: 2, revenue: 1000, cost: 300 }),
      fact({ detailCenterId: "B", orders: 1, revenue: 500, cost: 400 }),
      fact({ accountId: "h", accountName: "Hotel", feeRevenue: 2000, cost: 100 }),
    ]);
    expect(rows.map((r) => r.key)).toEqual(["h:A", "a:A", "a:B", "a:*"]);
    expect(rows.find((r) => r.key === "a:*")).toMatchObject({
      orders: 3,
      income: 1500,
      cost: 700,
      margin: 800,
    });
    expect(total).toMatchObject({ income: 3500, cost: 800, margin: 2700 });
  });

  it("los KPIs B2B están registrados con fuente", () => {
    expect(kpiRegistry.get("b2b.margin")?.sources).toContain("public.service_orders");
  });
});
