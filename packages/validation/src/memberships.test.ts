import { describe, expect, it } from "vitest";
import {
  createMembershipSchema,
  membershipBenefitSchema,
  membershipPlanSchema,
  redeemBenefitSchema,
  voidRedemptionSchema,
} from "./memberships";

const org = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";

describe("planes", () => {
  const base = {
    organizationId: org,
    code: " care ",
    tier: "care",
    name: "Care  mensual",
    price: "$449",
    periodMonths: "1",
    redeemScope: "centro_origen",
    renewalNoticeDays: "7",
    active: true,
    reason: "Alta del plan",
  };

  it("normaliza clave, nombre, precio y periodicidad", () => {
    expect(membershipPlanSchema.parse(base)).toMatchObject({
      code: "CARE",
      name: "Care mensual",
      price: 449,
      periodMonths: 1,
    });
  });

  it("rechaza periodicidad inválida, precio 0 y vigencia invertida", () => {
    expect(membershipPlanSchema.safeParse({ ...base, periodMonths: "2" }).success).toBe(false);
    expect(membershipPlanSchema.safeParse({ ...base, price: "0" }).success).toBe(false);
    const r = membershipPlanSchema.safeParse({
      ...base,
      availableFrom: "2026-10-10",
      availableUntil: "2026-10-01",
    });
    expect(r.success).toBe(false);
  });

  it("beneficio: unidades vacías = quitar el servicio", () => {
    expect(
      membershipBenefitSchema.parse({ planId: id, serviceId: id, quantityPerPeriod: "", reason: "Quitar" })
        .quantityPerPeriod,
    ).toBeUndefined();
    expect(
      membershipBenefitSchema.safeParse({ planId: id, serviceId: id, quantityPerPeriod: "0", reason: "x" })
        .success,
    ).toBe(false);
  });
});

describe("membresías y redención", () => {
  it("el alta exige plan y vehículo", () => {
    const r = createMembershipSchema.safeParse({
      detailCenterId: id,
      requestId: id,
      planId: "",
      clientId: id,
      vehicleId: "",
    });
    expect(r.success).toBe(false);
  });

  it("redimir exige cantidad 1–99 y versión; anular exige motivo", () => {
    expect(
      redeemBenefitSchema.safeParse({
        orderId: id,
        version: "3",
        itemId: id,
        membershipId: id,
        quantity: "0",
        requestId: id,
      }).success,
    ).toBe(false);
    expect(
      redeemBenefitSchema.parse({
        orderId: id,
        version: "3",
        itemId: id,
        membershipId: id,
        quantity: "2",
        requestId: id,
      }),
    ).toMatchObject({ version: 3, quantity: 2 });
    expect(voidRedemptionSchema.safeParse({ redemptionId: id, version: 1, reason: "" }).success).toBe(false);
  });
});
