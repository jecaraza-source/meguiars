import { describe, expect, it } from "vitest";
import { baselineSchema, createCenterSchema } from "./pilot";

const ORG = "0e000000-0000-4000-8000-000000000001";
const CENTER = "11111111-1111-4111-8111-111111111111";

describe("alta de centro", () => {
  it("normaliza el código y exige motivo y zona horaria válida", () => {
    const ok = createCenterSchema.parse({
      organizationId: ORG,
      code: " gdl-01 ",
      name: "Centro GDL",
      timezone: "America/Mexico_City",
      reason: "Rollout",
    });
    expect(ok.code).toBe("GDL-01");
    const bad = createCenterSchema.safeParse({
      organizationId: ORG,
      code: "gdl 01",
      name: "G",
      timezone: "Luna/Base",
      reason: "",
    });
    expect(bad.error?.issues.map((i) => i.path[0]).sort()).toEqual(["code", "name", "reason", "timezone"]);
  });
});

describe("línea base", () => {
  const base = {
    detailCenterId: CENTER,
    metric: "ticket_promedio",
    periodFrom: "",
    periodTo: "",
    reason: "Línea base",
  };

  it("acepta montos con formato y exige fuente", () => {
    expect(baselineSchema.parse({ ...base, value: "$1,250.50", source: "Excel 2025" }).value).toBe(1250.5);
    const noSource = baselineSchema.safeParse({ ...base, value: "450", source: "" });
    expect(noSource.error?.issues[0]?.path).toEqual(["source"]);
  });

  it("valor vacío = borrar (sin fuente); rechaza negativos, indicadores desconocidos y periodos al revés", () => {
    expect(baselineSchema.parse({ ...base, value: "", source: "" }).value).toBeNull();
    expect(baselineSchema.safeParse({ ...base, value: "-1", source: "Excel" }).success).toBe(false);
    expect(baselineSchema.safeParse({ ...base, metric: "otro", value: "1", source: "Excel" }).success).toBe(
      false,
    );
    const reversed = baselineSchema.safeParse({
      ...base,
      value: "1",
      source: "Excel",
      periodFrom: "2025-12-31",
      periodTo: "2025-01-01",
    });
    expect(reversed.error?.issues[0]?.path).toEqual(["periodTo"]);
  });
});
