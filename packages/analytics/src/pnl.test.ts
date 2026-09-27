import { describe, expect, it } from "vitest";
import { kpiRegistry } from "./kpi";
import {
  expensesCashOut,
  pnlByCenter,
  pnlEbitda,
  pnlEbitdaMargin,
  pnlGrossMargin,
  pnlNetBeforeTax,
  pnlStatement,
  type PnlLineFact,
} from "./pnl";

const A = "aaaaaaaa-0000-0000-0000-000000000000";
const B = "bbbbbbbb-0000-0000-0000-000000000000";
const f = (
  detailCenterId: string,
  section: PnlLineFact["section"],
  line: string,
  amount: number,
  dimension: string | null = null,
): PnlLineFact => ({ detailCenterId, section, line, dimension, amount, movements: 1 });

// Mismo dataset que supabase/tests/pnl.test.sql (hoy).
const facts: PnlLineFact[] = [
  f(A, "ingreso", "b2c", 2800, "valor_medio"),
  f(A, "ingreso", "b2c", 750, "recurrente"),
  f(A, "ingreso", "b2c", -300, "descuento_os"),
  f(A, "ingreso", "b2b", 5000, "premium"),
  f(A, "ingreso", "membresias", 449, "membresia"),
  f(A, "ingreso", "cuotas_b2b", 1000, "cuota_b2b"),
  f(A, "costo_directo", "estandar", 900, "valor_medio"),
  f(A, "costo_directo", "estandar", 240, "recurrente"),
  f(A, "costo_directo", "estandar", 1500, "premium"),
  f(A, "costo_directo", "variacion_insumos", 10),
  f(A, "costo_directo", "egresos_costo_directo", 100),
  f(A, "gasto", "personal", 1000),
  f(A, "gasto", "operativo", 500),
  f(A, "gasto", "marketing", 200),
  f(A, "gasto", "financiero", 50),
  f(A, "fuera_pnl", "insumos", 700),
  f(A, "fuera_pnl", "pendiente", 6000, "personal"),
  f(B, "ingreso", "b2c", 2800, "valor_medio"),
  f(B, "costo_directo", "estandar", 900, "valor_medio"),
  f(B, "gasto", "operativo", 300),
];

describe("estado de resultados gerencial (dataset conocido)", () => {
  const a = pnlStatement({ facts: facts.filter((x) => x.detailCenterId === A) });

  it("ventas, costo directo, utilidad bruta, EBITDA y utilidad antes de impuestos", () => {
    expect(a).toMatchObject({
      revenue: 9699,
      directCost: 2750,
      grossProfit: 6949,
      grossMargin: 71.65,
      personnel: 1000,
      operatingExpenses: 700,
      ebitda: 5249,
      ebitdaMargin: 54.12,
      financial: 50,
      netBeforeTax: 5199,
      suppliesPurchases: 700,
      pending: 6000,
      cashOut: 2550,
    });
  });

  it("líneas por canal con su drill-down y subtotales sin drill-down", () => {
    const byKey = new Map(a.lines.map((l) => [l.key, l]));
    expect(byKey.get("revenue.b2c")).toMatchObject({
      amount: 3250,
      drill: { section: "ingreso", line: "b2c" },
    });
    expect(byKey.get("revenue.cuotas_b2b")?.amount).toBe(1000);
    expect(byKey.has("revenue.membresia")).toBe(false);
    expect(byKey.get("gross_profit")?.drill).toBeNull();
    expect(byKey.get("operating.marketing")).toMatchObject({
      amount: 200,
      drill: { section: "gasto", line: "marketing" },
    });
    expect(byKey.get("ebitda")).toMatchObject({ amount: 5249, percent: 54.12 });
  });

  it("ventas por motor (con descuento general) suman las ventas", () => {
    expect(a.revenueByEngine.map((e) => [e.engine, e.amount])).toEqual([
      ["recurrente", 750],
      ["valor_medio", 2800],
      ["premium", 5000],
      ["membresia", 449],
      ["cuota_b2b", 1000],
      ["descuento_os", -300],
    ]);
    expect(a.revenueByEngine.reduce((t, e) => t + e.amount, 0)).toBe(a.revenue);
  });

  it("consolidado = suma coherente de los centros autorizados", () => {
    const { centers, consolidated } = pnlByCenter(facts, [A, B]);
    expect(centers.map((c) => c.statement.ebitda)).toEqual([5249, 1600]);
    expect(consolidated.revenue).toBe(12499);
    expect(consolidated.ebitda).toBe(6849);
    const keys = [
      "revenue",
      "directCost",
      "grossProfit",
      "personnel",
      "operatingExpenses",
      "ebitda",
      "netBeforeTax",
    ] as const;
    for (const key of keys) expect(consolidated[key]).toBe(centers.reduce((t, c) => t + c.statement[key], 0));
    // Un centro no autorizado no entra aunque haya filas.
    expect(pnlByCenter(facts, [B]).consolidated.revenue).toBe(2800);
  });

  it("la compra de insumos y los pendientes no cambian el resultado", () => {
    const without = pnlStatement({
      facts: facts.filter((x) => x.detailCenterId === A && x.section !== "fuera_pnl"),
    });
    expect(without.netBeforeTax).toBe(a.netBeforeTax);
    expect(a.cashOut - without.cashOut).toBe(700);
  });

  it("KPIs registrados con fórmula y fuentes; márgenes sin ventas", () => {
    const input = { facts: facts.filter((x) => x.detailCenterId === A) };
    expect(pnlEbitda.compute(input)).toBe(5249);
    expect(pnlEbitdaMargin.compute(input)).toBe(54.12);
    expect(pnlGrossMargin.compute(input)).toBe(71.65);
    expect(pnlNetBeforeTax.compute(input)).toBe(5199);
    expect(expensesCashOut.compute(input)).toBe(2550);
    expect(pnlGrossMargin.compute({ facts: [] })).toBe(0);
    expect(pnlStatement({ facts: [] }).lines[0]!.percent).toBeNull();
    const ids = kpiRegistry.list().map((k) => k.id);
    expect(ids).toEqual(
      expect.arrayContaining(["pnl.revenue", "pnl.direct_cost", "pnl.ebitda", "pnl.ebitda_margin"]),
    );
    expect(ids).not.toContain("pnl.operating_profit");
  });
});
