import { describe, expect, it } from "vitest";
import { expensesCashOut, pnlGrossMargin, pnlNetBeforeTax, pnlStatement, type PnlFactInput } from "./pnl";

// Mismo escenario que supabase/tests/expenses.test.sql.
const facts: PnlFactInput[] = [
  { section: "ingreso", item: "b2c", amount: 500 },
  { section: "ingreso", item: "membresias", amount: 449 },
  { section: "costo_os", item: "estandar", amount: 160 },
  { section: "costo_os", item: "variacion_insumos", amount: 10 },
  { section: "egreso", item: "costo_directo", amount: 9000 },
  { section: "egreso", item: "insumos", amount: 2500 },
  { section: "egreso", item: "operativo", amount: 11500 },
  { section: "egreso", item: "personal", amount: 8000 },
  { section: "egreso_pendiente", item: "personal", amount: 8000 },
];

describe("estado de resultados", () => {
  it("clasifica ventas, costo directo, gastos y otros", () => {
    const s = pnlStatement({ facts });
    expect(s).toMatchObject({
      revenue: 949,
      directCost: 9170,
      grossProfit: -8221,
      operatingExpenses: 19500,
      operatingProfit: -27721,
      otherExpenses: 0,
      netBeforeTax: -27721,
      cashOut: 31000,
      pending: 8000,
    });
    expect(s.lines.find((l) => l.key === "revenue.membresias")?.amount).toBe(449);
    expect(s.lines.find((l) => l.key === "direct_cost.variance")?.amount).toBe(10);
  });

  it("la compra de insumos es salida de caja pero no gasto (sin doble conteo)", () => {
    const without = pnlStatement({ facts: facts.filter((f) => f.item !== "insumos") });
    const withIt = pnlStatement({ facts });
    expect(withIt.netBeforeTax).toBe(without.netBeforeTax);
    expect(withIt.cashOut - without.cashOut).toBe(2500);
    expect(expensesCashOut.compute({ facts })).toBe(31000);
  });

  it("los pendientes no cuentan; márgenes con y sin ventas", () => {
    const s = pnlStatement({ facts: [{ section: "egreso_pendiente", item: "operativo", amount: 100 }] });
    expect(s.netBeforeTax).toBe(0);
    expect(s.lines[0]!.percent).toBeNull();
    expect(pnlGrossMargin.compute({ facts: [] })).toBe(0);
    expect(
      pnlGrossMargin.compute({
        facts: [
          { section: "ingreso", item: "b2c", amount: 1000 },
          { section: "costo_os", item: "estandar", amount: 300 },
        ],
      }),
    ).toBe(70);
    expect(
      pnlNetBeforeTax.compute({
        facts: [
          { section: "ingreso", item: "b2b", amount: 1000 },
          { section: "egreso", item: "financiero", amount: 50 },
          { section: "egreso", item: "otros", amount: 25 },
        ],
      }),
    ).toBe(925);
  });
});
