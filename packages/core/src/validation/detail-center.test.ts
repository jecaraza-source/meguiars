import { describe, expect, it } from "vitest";
import { changeReasonSchema, detailCenterInputSchema, membershipInputSchema } from "./detail-center";

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

  it("rechaza roles desconocidos en membresías", () => {
    const result = membershipInputSchema.safeParse({
      detailCenterId: "5f0c8f0e-6f7a-4d3b-9a8e-1f2d3c4b5a69",
      userId: "0b7a4c2e-3d1f-4e5a-8b9c-7d6e5f4a3b21",
      role: "superuser",
    });
    expect(result.success).toBe(false);
  });

  it("exige motivo para cambios sensibles", () => {
    expect(changeReasonSchema.safeParse("  ").success).toBe(false);
    expect(changeReasonSchema.safeParse("Corrección de captura").success).toBe(true);
  });
});
