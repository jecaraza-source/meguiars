import { describe, expect, it } from "vitest";
import type { CenterAccess } from "./access";
import { corporateSummaryText, presentCenterAccess } from "./presenter";

const base: CenterAccess = {
  center: {
    id: "a",
    organizationId: "o1",
    code: "CDMX-01",
    name: "Centro CDMX",
    timezone: "America/Mexico_City",
    active: true,
    createdAt: "",
    updatedAt: "",
  },
  organizationName: "Demo",
  roles: ["encargado"],
  corporateRoles: [],
};

describe("presentCenterAccess", () => {
  it("muestra roles con etiqueta y sin insignias para acceso de centro", () => {
    expect(presentCenterAccess(base)).toEqual({
      id: "a",
      title: "Centro CDMX",
      subtitle: "CDMX-01 · Demo",
      timezone: "America/Mexico_City",
      rolesText: "Encargado",
      badges: [],
    });
  });

  it("marca corporativo, deshabilitado y sólo lectura", () => {
    const item = presentCenterAccess({
      ...base,
      center: { ...base.center, active: false },
      roles: ["contador"],
      corporateRoles: ["contador"],
    });
    expect(item.badges.map((b) => b.kind)).toEqual(["corporate", "inactive", "readOnly"]);
    expect(item.rolesText).toBe("Contador");
  });

  it("no marca sólo lectura si algún rol escribe", () => {
    const item = presentCenterAccess({ ...base, roles: ["contador", "operador_recepcion"] });
    expect(item.badges).toEqual([]);
  });
});

describe("corporateSummaryText", () => {
  it("resume la vista consolidada sólo si hay rol corporativo", () => {
    expect(corporateSummaryText([base])).toBeNull();
    const corp = { ...base, corporateRoles: ["admin_socio" as const], roles: ["admin_socio" as const] };
    expect(corporateSummaryText([corp, { ...corp, center: { ...corp.center, id: "b" } }])).toBe(
      "Vista corporativa: 2 centros en 1 organización.",
    );
  });
});
