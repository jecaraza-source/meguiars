import { describe, expect, it } from "vitest";
import type { CenterAccess } from "./access/access";
import type { AuthState } from "./auth/session";
import { NAV_SECTIONS, sectionOfPath, sectionOfScreen, visibleNavigation } from "./navigation";
import { APP_ROLES, type AppRole } from "./roles";

const stateFor = (roles: AppRole[]): AuthState => ({
  status: "signed_in",
  user: { id: "u", email: "u@x.mx", fullName: null, active: true, lastDetailCenterId: "A" },
  access: [
    {
      center: {
        id: "A",
        organizationId: "o",
        code: "A",
        name: "A",
        timezone: "UTC",
        active: true,
        createdAt: "",
        updatedAt: "",
      },
      organizationName: "O",
      roles,
      corporateRoles: [],
    } satisfies CenterAccess,
  ],
  activeCenterId: "A",
});

const sectionsOf = (roles: AppRole[]) => visibleNavigation(stateFor(roles)).map((s) => s.id);
const itemsOf = (roles: AppRole[]) =>
  visibleNavigation(stateFor(roles)).flatMap((s) => s.items.map((i) => i.screen));

describe("navegación por rol", () => {
  it("define los cuatro dominios más Inicio", () => {
    expect(NAV_SECTIONS.map((s) => s.label)).toEqual([
      "Inicio",
      "Operación",
      "Comercial",
      "Administración y Finanzas",
      "Dirección",
    ]);
  });

  it.each<[AppRole, string[]]>([
    ["admin_socio", ["inicio", "operacion", "comercial", "finanzas", "direccion"]],
    ["encargado", ["inicio", "operacion", "comercial", "finanzas"]],
    ["operador_recepcion", ["inicio", "operacion"]],
    ["contador", ["inicio", "finanzas"]],
    ["comercial_b2b", ["inicio", "comercial"]],
  ])("%s ve %j", (role, expected) => {
    expect(sectionsOf([role])).toEqual(expected);
  });

  it("filtra ítems dentro de una sección: el encargado ve Equipo pero no el resumen financiero", () => {
    expect(itemsOf(["encargado"])).toContain("team");
    expect(itemsOf(["encargado"])).not.toContain("finanzas");
    expect(itemsOf(["contador"])).toEqual(expect.arrayContaining(["finanzas", "team"]));
  });

  it("varios roles en el centro suman secciones", () => {
    expect(sectionsOf(["operador_recepcion", "comercial_b2b"])).toEqual(["inicio", "operacion", "comercial"]);
  });

  it("sin sesión o sin centro activo no hay navegación privada", () => {
    expect(visibleNavigation({ status: "signed_out" })).toEqual([]);
    const noCenter = {
      ...(stateFor(["admin_socio"]) as Extract<AuthState, { status: "signed_in" }>),
      activeCenterId: null,
    };
    expect(visibleNavigation(noCenter)).toEqual([]);
  });

  it("todo rol tiene al menos una sección de negocio además de Inicio", () => {
    for (const role of APP_ROLES) expect(sectionsOf([role]).length).toBeGreaterThan(1);
  });

  it("resuelve la sección activa por pantalla y por ruta", () => {
    expect(sectionOfScreen("team")).toBe("finanzas");
    expect(sectionOfPath("/")).toBe("inicio");
    expect(sectionOfPath("/equipo")).toBe("finanzas");
    expect(sectionOfPath("/direccion/detalle")).toBe("direccion");
    expect(sectionOfPath("/login")).toBeNull();
  });
});
