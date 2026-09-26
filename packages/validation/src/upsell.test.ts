import { describe, expect, it } from "vitest";
import { upsellRuleSchema } from "./upsell";

const U = "00000000-0000-4000-8000-000000000001";
const V = "00000000-0000-4000-8000-000000000002";
const base = {
  organizationId: U,
  name: " Lavado  →  descontaminación ",
  sourceServiceId: U,
  targetServiceId: V,
  targetPlanId: "",
  stage: "diagnostico",
  priority: "90",
  pitch: "Deja la pintura lista",
  channels: ["b2c"],
  centerIds: [],
  minOrderTotal: "",
  startsOn: "2026-10-01",
  endsOn: "",
  active: true,
  reason: "Alta",
};

describe("validación de reglas de recomendación", () => {
  it("normaliza y acepta una regla válida", () => {
    expect(upsellRuleSchema.parse(base)).toMatchObject({
      name: "Lavado → descontaminación",
      priority: 90,
      centerIds: undefined,
      targetPlanId: undefined,
      minOrderTotal: undefined,
    });
  });

  it("exactamente un destino, distinto del origen, y vigencia coherente", () => {
    expect(upsellRuleSchema.safeParse({ ...base, targetPlanId: U }).success).toBe(false);
    expect(upsellRuleSchema.safeParse({ ...base, targetServiceId: "" }).success).toBe(false);
    expect(upsellRuleSchema.safeParse({ ...base, targetServiceId: U }).success).toBe(false);
    expect(upsellRuleSchema.safeParse({ ...base, endsOn: "2026-09-01" }).success).toBe(false);
    expect(upsellRuleSchema.safeParse({ ...base, channels: [] }).success).toBe(false);
  });
});
