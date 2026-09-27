import { describe, expect, it } from "vitest";
import { can, isReadOnlyRole } from "../roles";
import { PNL_SOURCE_TARGETS, pnlMovementsTotal, pnlPeriod, pnlPeriodError, type PnlMovement } from "./pnl";
import {
  parsePnlDrill,
  pnlDrillParams,
  pnlDrillTitle,
  pnlMovementsCsv,
  pnlStatementCsv,
  presentPnlMovement,
} from "./presenter";

describe("periodos del P&L (calendario del centro)", () => {
  it("hoy, semana (lunes a hoy), mes, año y personalizado", () => {
    // 2026-09-27 es domingo.
    expect(pnlPeriod("hoy", "2026-09-27")).toEqual({ from: "2026-09-27", to: "2026-09-27" });
    expect(pnlPeriod("semana", "2026-09-27")).toEqual({ from: "2026-09-21", to: "2026-09-27" });
    expect(pnlPeriod("semana", "2026-09-21")).toEqual({ from: "2026-09-21", to: "2026-09-21" });
    expect(pnlPeriod("mes", "2026-09-27")).toEqual({ from: "2026-09-01", to: "2026-09-27" });
    expect(pnlPeriod("anio", "2026-09-27")).toEqual({ from: "2026-01-01", to: "2026-09-27" });
    expect(pnlPeriod("personalizado", "2026-09-27", { from: "2026-08-01", to: "2026-08-31" })).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });

  it("errores del periodo (mismo criterio que la base)", () => {
    expect(pnlPeriodError("2026-09-01", "2026-09-27")).toBeNull();
    expect(pnlPeriodError("2026-09-27", "2026-09-01")).toMatch(/igual o posterior/);
    expect(pnlPeriodError("2026-13-01", "2026-13-02")).toMatch(/fechas válidas/);
    expect(pnlPeriodError("2023-01-01", "2026-09-27")).toMatch(/3 años/);
  });
});

const m = (o: Partial<PnlMovement>): PnlMovement => ({
  detailCenterId: "a",
  section: "ingreso",
  line: "b2c",
  dimension: "valor_medio",
  source: "service_orders",
  sourceId: "o1",
  reference: "A-01-000001",
  occurredOn: "2026-09-27",
  description: "Pulido × 1",
  amount: 2800,
  ...o,
});

describe("drill-down", () => {
  it("título, parámetros de URL de ida y vuelta", () => {
    expect(pnlDrillTitle({ section: "ingreso", line: "b2c", dimension: "descuento_os" })).toBe(
      "Ventas · Ventas B2C (OS) · Descuento general de la OS",
    );
    const qs = pnlDrillParams(
      { section: "gasto", line: "personal" },
      { from: "2026-09-01", to: "2026-09-27", all: true },
    );
    expect(parsePnlDrill(Object.fromEntries(new URLSearchParams(qs)))).toEqual({
      section: "gasto",
      line: "personal",
      dimension: undefined,
      from: "2026-09-01",
      to: "2026-09-27",
      all: true,
    });
    expect(parsePnlDrill({ seccion: "caja" })).toBeNull();
  });

  it("la suma de los movimientos es exacta en centavos", () => {
    expect(pnlMovementsTotal([m({ amount: 0.1 }), m({ amount: 0.2 }), m({ amount: -300 })])).toBe(-299.7);
  });

  it("enlaces al origen según el permiso", () => {
    expect(PNL_SOURCE_TARGETS.service_orders.href("o1")).toBe("/ordenes/o1");
    expect(PNL_SOURCE_TARGETS.expenses.capability).toBe("expenses.read");
    expect(presentPnlMovement(m({}), "Centro A", null)).toMatchObject({
      source: "OS",
      item: "Valor medio",
      amount: "$2,800.00",
      href: null,
    });
  });

  it("el contador lee el P&L y sigue de sólo lectura; recepción y comercial no lo ven", () => {
    expect(can(["contador"], "pnl.read")).toBe(true);
    expect(isReadOnlyRole("contador")).toBe(true);
    expect(can(["encargado"], "pnl.read")).toBe(true);
    expect(can(["operador_recepcion"], "pnl.read")).toBe(false);
    expect(can(["comercial_b2b"], "pnl.read")).toBe(false);
  });
});

describe("exportación CSV (Excel-friendly)", () => {
  it("estado de resultados por centro y consolidado", () => {
    const lines = [
      { key: "revenue", label: "Ventas", amount: 9699, percent: 100 },
      { key: "ebitda", label: "EBITDA gerencial", amount: 5249, percent: 54.12 },
    ];
    const out = pnlStatementCsv(
      [
        { name: "Centro A", lines },
        { name: "Consolidado", lines },
      ],
      { from: "2026-09-27", to: "2026-09-27" },
    ).split("\n");
    expect(out[0]).toBe("Estado de resultados 2026-09-27 a 2026-09-27");
    expect(out[1]).toBe(
      "concepto,clave,Centro A importe,Centro A % ventas,Consolidado importe,Consolidado % ventas",
    );
    expect(out[3]).toBe("EBITDA gerencial,ebitda,5249.00,54.12,5249.00,54.12");
  });

  it("movimientos con importes sin formato de moneda", () => {
    const out = pnlMovementsCsv(
      [m({ description: 'Pulido "premium", × 1' })],
      () => "Centro A",
      "Ventas",
    ).split("\n");
    expect(out[1]).toBe("fecha,centro,origen,referencia,detalle,seccion,linea,dimension,importe");
    expect(out[2]).toBe(
      '2026-09-27,Centro A,OS,A-01-000001,"Pulido ""premium"", × 1",ingreso,b2c,valor_medio,2800.00',
    );
  });
});
