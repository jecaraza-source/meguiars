import { describe, expect, it } from "vitest";
import { pnlDrillSchema, pnlRangeSchema } from "./pnl";

const ID = "00000000-0000-4000-8000-000000000001";

describe("filtros del P&L", () => {
  it("periodo válido, invertido, inexistente o de más de 3 años", () => {
    expect(
      pnlRangeSchema.safeParse({ detailCenterIds: [ID], from: "2026-09-01", to: "2026-09-27" }).success,
    ).toBe(true);
    expect(
      pnlRangeSchema.safeParse({ detailCenterIds: [ID], from: "2026-09-27", to: "2026-09-01" }).success,
    ).toBe(false);
    expect(
      pnlRangeSchema.safeParse({ detailCenterIds: [ID], from: "2026-02-30", to: "2026-03-01" }).success,
    ).toBe(false);
    expect(
      pnlRangeSchema.safeParse({ detailCenterIds: [ID], from: "2022-01-01", to: "2026-01-01" }).success,
    ).toBe(false);
    expect(
      pnlRangeSchema.safeParse({ detailCenterIds: [], from: "2026-09-01", to: "2026-09-01" }).success,
    ).toBe(false);
  });

  it("drill-down: sección conocida y filtros acotados", () => {
    expect(
      pnlDrillSchema.parse({
        detailCenterIds: [ID],
        from: "2026-09-01",
        to: "2026-09-27",
        section: "ingreso",
        line: "b2c",
        dimension: "",
      }),
    ).toMatchObject({ section: "ingreso", line: "b2c", dimension: undefined });
    expect(
      pnlDrillSchema.safeParse({
        detailCenterIds: [ID],
        from: "2026-09-01",
        to: "2026-09-27",
        section: "caja",
      }).success,
    ).toBe(false);
    expect(
      pnlDrillSchema.safeParse({
        detailCenterIds: [ID],
        from: "2026-09-01",
        to: "2026-09-27",
        section: "gasto",
        line: "x'; drop",
      }).success,
    ).toBe(false);
  });
});
