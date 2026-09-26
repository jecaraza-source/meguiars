import { describe, expect, it } from "vitest";
import { kpiRegistry } from "./kpi";
import { membershipKpis, type MembershipFact } from "./memberships";

const fact = (patch: Partial<MembershipFact>): MembershipFact => ({
  status: "activa",
  price: 849,
  periodMonths: 1,
  entitledUnits: 3,
  usedUnits: 0,
  newInRange: false,
  renewalsInRange: 0,
  cancelledInRange: false,
  expiredInRange: false,
  revenueInRange: 0,
  ...patch,
});

describe("KPIs de membresías", () => {
  // Rango de 30 días ≈ 0.986 meses.
  const facts = [
    fact({ newInRange: true, usedUnits: 2, revenueInRange: 849 }),
    fact({
      status: "proxima_a_vencer",
      price: 449,
      entitledUnits: 2,
      usedUnits: 1,
      renewalsInRange: 1,
      revenueInRange: 449,
    }),
    fact({
      price: 3900,
      periodMonths: 3,
      entitledUnits: 4,
      usedUnits: 1,
      newInRange: true,
      revenueInRange: 3900,
    }),
    fact({ status: "suspendida", price: 849, usedUnits: 0 }),
    fact({ status: "cancelada", cancelledInRange: true }),
    fact({ status: "vencida", price: 449, expiredInRange: true }),
  ];
  const k = membershipKpis({ facts, from: "2026-09-01", to: "2026-09-30" });

  it("activas, altas, bajas y renovaciones", () => {
    expect(k.active).toBe(3);
    expect(k.newCount).toBe(2);
    expect(k.churn).toBe(2);
    expect(k.renewals).toBe(1);
  });

  it("MRR: precio mensualizado de activas y próximas a vencer (trimestral $3,900 → $1,300)", () => {
    expect(k.mrr).toBe(849 + 449 + 1300);
    expect(k.arpm).toBe(Math.round(((849 + 449 + 1300) / 3) * 100) / 100);
  });

  it("uso, tasa de uso e ingreso cobrado", () => {
    expect(k.redeemedUnits).toBe(4);
    // Incluidas en ~0.986 meses: 3 + 2 + 4/3 = 6.33 × 0.986 ≈ 6.24 → 4 / 6.24 = 64.1 %.
    expect(k.usageRate).toBeCloseTo(64.1, 1);
    expect(k.revenue).toBe(849 + 449 + 3900);
  });

  it("sin datos todo es 0 y cada KPI está registrado con fórmula y fuente", () => {
    expect(membershipKpis({ facts: [], from: "2026-09-01", to: "2026-09-30" })).toMatchObject({
      active: 0,
      mrr: 0,
      arpm: 0,
      usageRate: 0,
    });
    const ids = kpiRegistry.list().map((d) => d.id);
    expect(ids).toEqual(
      expect.arrayContaining(["membership.mrr", "membership.usage_rate", "membership.arpm"]),
    );
    expect(kpiRegistry.get("membership.mrr")?.formula).toMatch(/precio congelado/);
  });
});
