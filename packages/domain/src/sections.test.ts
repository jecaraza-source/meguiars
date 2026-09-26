import { describe, expect, it } from "vitest";
import type { CenterAccess } from "./access/access";
import { executiveKpis } from "./sections";

const access = (id: string, active: boolean, corporate: boolean): CenterAccess => ({
  center: {
    id,
    organizationId: "o1",
    code: id,
    name: id,
    timezone: "UTC",
    active,
    createdAt: "",
    updatedAt: "",
  },
  organizationName: "O",
  roles: ["admin_socio"],
  corporateRoles: corporate ? ["admin_socio"] : [],
});

describe("executiveKpis", () => {
  it("resume centros activos, deshabilitados, organizaciones y alcance", () => {
    const kpis = executiveKpis([access("A", true, true), access("B", true, true), access("X", false, true)]);
    expect(kpis.map((k) => [k.label, k.value])).toEqual([
      ["Centros activos", "2"],
      ["Centros deshabilitados", "1"],
      ["Organizaciones", "1"],
      ["Alcance corporativo", "3"],
    ]);
    expect(kpis[0]!.caption).toBe("de 3 en total");
  });
});
