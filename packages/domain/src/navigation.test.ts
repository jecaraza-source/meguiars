import { describe, expect, it } from "vitest";
import type { CenterAccess } from "./access/access";
import type { AuthState } from "./auth/session";
import { NAV_SECTIONS, navScreenOf, sectionOfPath, sectionOfScreen, visibleNavigation } from "./navigation";
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
    // Consulta el catálogo (precios y costos) sin ver la operación del día.
    ["contador", ["inicio", "operacion", "finanzas"]],
    // Consulta clientes (Operación → Clientes y vehículos) sin ver la operación del día.
    ["comercial_b2b", ["inicio", "operacion", "comercial"]],
  ])("%s ve %j", (role, expected) => {
    expect(sectionsOf([role])).toEqual(expected);
  });

  it("Órdenes de servicio: operación del centro (no contador ni comercial B2B)", () => {
    expect(itemsOf(["operador_recepcion"])).toContain("orders");
    expect(itemsOf(["encargado"])).toContain("orders");
    expect(itemsOf(["contador"])).not.toContain("orders");
    expect(itemsOf(["comercial_b2b"])).not.toContain("orders");
  });

  it("filtra ítems dentro de una sección: el encargado ve Equipo pero no el resumen financiero", () => {
    expect(itemsOf(["encargado"])).toContain("team");
    expect(itemsOf(["encargado"])).not.toContain("finanzas");
    expect(itemsOf(["contador"])).toEqual(expect.arrayContaining(["finanzas", "team"]));
  });

  it("comercial_b2b ve Clientes y Catálogo dentro de Operación; el contador, sólo Catálogo", () => {
    expect(itemsOf(["comercial_b2b"])).toEqual(expect.arrayContaining(["clients", "catalog"]));
    expect(itemsOf(["comercial_b2b"])).not.toContain("operacion");
    expect(itemsOf(["contador"])).toContain("catalog");
    expect(itemsOf(["contador"])).not.toContain("clients");
  });

  it("las pantallas de detalle y alta pertenecen a Clientes (pestaña y sub-navegación)", () => {
    expect(navScreenOf("clientDetail")).toBe("clients");
    expect(navScreenOf("clientNew")).toBe("clients");
    expect(navScreenOf("catalogDetail")).toBe("catalog");
    expect(navScreenOf("appointmentNew")).toBe("agenda");
    expect(sectionOfPath("/agenda/nueva")).toBe("operacion");
    expect(sectionOfPath("/catalogo/abc")).toBe("operacion");
    expect(sectionOfScreen("clientDetail")).toBe("operacion");
    expect(sectionOfPath("/clientes/123")).toBe("operacion");
    expect(navScreenOf("orderDetail")).toBe("orders");
    expect(sectionOfPath("/ordenes/abc")).toBe("operacion");
    expect(navScreenOf("orderExecution")).toBe("orders");
    expect(sectionOfPath("/ordenes/abc/ejecucion")).toBe("operacion");
    expect(navScreenOf("supplies")).toBe("catalog");
    expect(sectionOfPath("/catalogo/insumos")).toBe("operacion");
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
