import { describe, expect, it } from "vitest";
import {
  changeReasonSchema,
  detailCenterInputSchema,
  setMembershipSchema,
  updateDetailCenterSchema,
} from "./centers";

const CENTER_ID = "5f0c8f0e-6f7a-4d3b-9a8e-1f2d3c4b5a69";
const USER_ID = "0b7a4c2e-3d1f-4e5a-8b9c-7d6e5f4a3b21";

describe("validaciones de centro", () => {
  it("acepta un centro válido y normaliza espacios", () => {
    const parsed = detailCenterInputSchema.parse({
      code: "MTY-01",
      name: "  Meguiar's Detail Center Monterrey ",
      timezone: "America/Monterrey",
    });
    expect(parsed.name).toBe("Meguiar's Detail Center Monterrey");
  });

  it("rechaza código y zona horaria inválidos", () => {
    const result = detailCenterInputSchema.safeParse({ code: "mty 01", name: "X Y", timezone: "Foo/Bar" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0]).sort()).toEqual(["code", "timezone"]);
  });

  it("exige motivo en la actualización de centro", () => {
    const base = { id: CENTER_ID, name: "Centro", timezone: "UTC" };
    expect(updateDetailCenterSchema.safeParse({ ...base, reason: " " }).success).toBe(false);
    expect(updateDetailCenterSchema.safeParse({ ...base, reason: "Cambio de horario" }).success).toBe(true);
  });

  it("rechaza roles desconocidos en membresías", () => {
    const input = { detailCenterId: CENTER_ID, userId: USER_ID, active: true, reason: "Alta" };
    expect(setMembershipSchema.safeParse({ ...input, role: "superuser" }).success).toBe(false);
    expect(setMembershipSchema.safeParse({ ...input, role: "technician" }).success).toBe(true);
  });

  it("limita el motivo a 3–500 caracteres", () => {
    expect(changeReasonSchema.safeParse("ok").success).toBe(false);
    expect(changeReasonSchema.safeParse("x".repeat(501)).success).toBe(false);
  });
});
