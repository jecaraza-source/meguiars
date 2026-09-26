import { describe, expect, it } from "vitest";
import {
  upsellAcceptanceRate,
  upsellByRule,
  upsellIncrementalRevenue,
  upsellIncrementPerOrder,
  upsellOffered,
  type UpsellFact,
} from "./upsell";

const fact = (f: Partial<UpsellFact>): UpsellFact => ({
  ruleId: "r1",
  ruleName: "Lavado → descontaminación",
  detailCenterId: "A",
  targetKind: "servicio",
  offered: 0,
  accepted: 0,
  rejected: 0,
  orders: 0,
  incrementalRevenue: 0,
  membershipValue: 0,
  ...f,
});

describe("conversión de recomendaciones", () => {
  it("tasa de aceptación, ingreso incremental e incremento por OS", () => {
    const facts = [
      fact({ offered: 4, accepted: 2, rejected: 1, orders: 4, incrementalRevenue: 1300 }),
      fact({ detailCenterId: "B", offered: 1, accepted: 0, orders: 1 }),
      fact({
        ruleId: "r4",
        ruleName: "Membresía",
        targetKind: "membresia",
        offered: 3,
        accepted: 1,
        orders: 3,
        membershipValue: 449,
      }),
    ];
    expect(upsellOffered.compute({ facts })).toBe(8);
    expect(upsellAcceptanceRate.compute({ facts })).toBe(37.5);
    expect(upsellIncrementalRevenue.compute({ facts })).toBe(1300);
    expect(upsellIncrementPerOrder.compute({ facts })).toBe(162.5);
    expect(upsellAcceptanceRate.compute({ facts: [] })).toBe(0);
  });

  it("por regla, sumando centros y ordenado por valor", () => {
    const rows = upsellByRule([
      fact({ offered: 4, accepted: 2, incrementalRevenue: 1300 }),
      fact({ detailCenterId: "B", offered: 1, accepted: 1, incrementalRevenue: 650 }),
      fact({ ruleId: "r3", ruleName: "Aromatizante", offered: 5, accepted: 1, incrementalRevenue: 90 }),
    ]);
    expect(rows.map((r) => r.ruleId)).toEqual(["r1", "r3"]);
    expect(rows[0]).toMatchObject({ offered: 5, accepted: 3, acceptanceRate: 60, incrementalRevenue: 1950 });
  });
});
