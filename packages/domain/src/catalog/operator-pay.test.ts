import { describe, expect, it } from "vitest";
import { operatorPayOf, presentCatalogItem, presentCostBreakdown, serviceCostBreakdown } from "./presenter";
import type { CatalogItem } from "./catalog";

/**
 * CR1 — Lavado manual detallado: pago al operador como % del precio. Mismos
 * números que supabase/tests/operator_commission.test.sql. Los valores son de
 * prueba, no predeterminados.
 */
describe("pago al operador y margen de contribución", () => {
  it("ejemplo del prompt: 200, 30 %, 20 → pago 60, costo 80, margen 120 (60 %)", () => {
    expect(serviceCostBreakdown(200, 30, 20)).toEqual({
      price: 200,
      operatorPct: 30,
      operatorPay: 60,
      otherDirectCost: 20,
      totalCost: 80,
      margin: 120,
      marginPct: 60,
    });
  });

  it("precio 0: pago 0 y sin margen porcentual (no divide entre 0)", () => {
    expect(serviceCostBreakdown(0, 30, 5)).toMatchObject({
      operatorPay: 0,
      totalCost: 5,
      margin: -5,
      marginPct: null,
    });
  });

  it("sin porcentaje no hay pago; 0 % y 100 % son válidos", () => {
    expect(operatorPayOf(450, null)).toBe(0);
    expect(operatorPayOf(450, 0)).toBe(0);
    expect(operatorPayOf(450, 100)).toBe(450);
  });

  it("precisión monetaria: redondeo a centavos igual que la base (mitad hacia arriba)", () => {
    expect(operatorPayOf(99.99, 33.33)).toBe(33.33);
    expect(operatorPayOf(0.05, 50)).toBe(0.03);
    expect(operatorPayOf(333.33, 12.5)).toBe(41.67);
    expect(serviceCostBreakdown(333.33, 12.5, 0.1)).toMatchObject({
      totalCost: 41.77,
      margin: 291.56,
      marginPct: 87.47,
    });
  });

  it("base: precio aplicado de la línea después de su descuento", () => {
    expect(operatorPayOf(2 * 300 - 100, 40)).toBe(200);
  });

  it("se muestra precio, %, pago, otros costos y margen", () => {
    expect(presentCostBreakdown(serviceCostBreakdown(200, 30, 20)).map((r) => [r.label, r.value])).toEqual([
      ["Precio de venta", "$200.00"],
      ["% del operador", "30.00 %"],
      ["Pago al operador", "$60.00"],
      ["Otros costos directos", "$20.00"],
      ["Costo total del servicio", "$80.00"],
      ["Margen de contribución", "$120.00"],
      ["Margen de contribución %", "60.00 %"],
    ]);
    const item: CatalogItem = {
      id: "s",
      code: "LAV-MAN",
      name: "Lavado manual detallado",
      description: null,
      revenueEngine: "recurrente",
      standardDurationMinutes: 90,
      basePrice: 200,
      standardDirectCost: 20,
      price: 200,
      directCost: 20,
      baseOperatorCommissionPct: 30,
      operatorCommissionPct: 30,
      priceSource: "base",
      available: true,
      active: true,
    };
    expect(presentCatalogItem(item)).toMatchObject({
      cost: "$20.00",
      operatorPay: "$60.00 (30.00 %)",
      margin: "$120.00 · 60%",
    });
  });
});

describe("pago al operador en la línea de la OS", () => {
  it("texto con %, base aplicada y pago; nada si el servicio no paga %", async () => {
    const { operatorPayText } = await import("../orders/totals");
    expect(
      operatorPayText({
        lineSubtotal: 600,
        lineDiscount: 100,
        operatorCommissionPct: 40,
        operatorCommissionAmount: 200,
      }),
    ).toBe("Pago al operador: 40.00 % de $500.00 = $200.00");
    expect(
      operatorPayText({
        lineSubtotal: 250,
        lineDiscount: 0,
        operatorCommissionPct: null,
        operatorCommissionAmount: 0,
      }),
    ).toBeNull();
  });
});
