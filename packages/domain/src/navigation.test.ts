import { describe, expect, it } from "vitest";
import type { CenterAccess } from "./access/access";
import type { AuthState } from "./auth/session";
import {
  landingScreen,
  NAV_SECTIONS,
  navScreenOf,
  sectionOfPath,
  sectionOfScreen,
  visibleNavigation,
} from "./navigation";
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
  it("define los cinco dominios más Inicio y Configuración", () => {
    expect(NAV_SECTIONS.map((s) => s.label)).toEqual([
      "Inicio",
      "Operación",
      "Comercial",
      "Marketing",
      "Finanzas",
      "Dirección",
      "Configuración",
    ]);
  });

  it.each<[AppRole, string[]]>([
    [
      "admin_socio",
      ["inicio", "operacion", "comercial", "marketing", "finanzas", "direccion", "configuracion"],
    ],
    // Dirección es sólo del admin / socio.
    ["encargado", ["inicio", "operacion", "comercial", "marketing", "finanzas", "configuracion"]],
    // Vende y renueva membresías en recepción (Comercial → Membresías) y hace el
    // corte de caja (Finanzas → Cobranza).
    ["operador_recepcion", ["inicio", "operacion", "comercial", "marketing", "finanzas", "configuracion"]],
    // Consulta el catálogo (precios y costos) sin ver la operación del día.
    // Y consulta el estado de cuenta y la rentabilidad B2B (Comercial → Cuentas B2B).
    ["contador", ["inicio", "operacion", "comercial", "marketing", "finanzas", "configuracion"]],
    // Consulta clientes (Operación → Clientes y vehículos) sin ver la operación del día;
    // en Finanzas sólo ve Cuentas por cobrar B2B (factura y cobra a las cuentas).
    ["comercial_b2b", ["inicio", "operacion", "comercial", "marketing", "finanzas", "configuracion"]],
    // Sólo «Mi día» (sus asignaciones).
    ["tecnico", ["inicio"]],
  ])("%s ve %j", (role, expected) => {
    expect(sectionsOf([role])).toEqual(expected);
  });

  it("toda opción del menú tiene una descripción breve (se muestra al pasar el cursor)", () => {
    const items = NAV_SECTIONS.flatMap((s) => s.items);
    expect(items.filter((i) => !i.description).map((i) => i.screen)).toEqual([]);
    for (const i of items) expect(i.description!.length).toBeLessThanOrEqual(120);
  });

  it("el técnico entra directo a «Mi día» y no ve «Mi centro»", () => {
    expect(itemsOf(["tecnico"])).toEqual(["myWork"]);
    expect(landingScreen(stateFor(["tecnico"]))).toBe("myWork");
    expect(landingScreen(stateFor(["encargado"]))).toBe("home");
    expect(itemsOf(["encargado"])).not.toContain("myWork");
    expect(sectionOfPath("/mi-dia")).toBe("inicio");
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
    expect(navScreenOf("membershipDetail")).toBe("memberships");
    expect(navScreenOf("membershipPlans")).toBe("memberships");
    expect(sectionOfPath("/comercial/membresias/abc")).toBe("comercial");
    expect(sectionOfPath("/comercial/planes")).toBe("comercial");
    expect(navScreenOf("crmCustomerDetail")).toBe("crmCustomers");
    expect(sectionOfPath("/comercial/clientes/abc")).toBe("comercial");
  });

  it("Membresías: recepción y comercial las venden; el contador sólo ve KPIs agregados", () => {
    expect(itemsOf(["operador_recepcion"])).toContain("memberships");
    expect(itemsOf(["operador_recepcion"])).not.toContain("comercial");
    expect(itemsOf(["comercial_b2b"])).toEqual(expect.arrayContaining(["comercial", "memberships"]));
    expect(itemsOf(["contador"])).not.toContain("memberships");
  });

  it("Cuentas por cobrar B2B: admin, comercial B2B, encargado y contador; recepción no", () => {
    expect(itemsOf(["comercial_b2b"])).toContain("receivables");
    expect(itemsOf(["comercial_b2b"])).not.toContain("payments");
    expect(itemsOf(["contador"])).toContain("receivables");
    expect(itemsOf(["encargado"])).toContain("receivables");
    expect(itemsOf(["operador_recepcion"])).not.toContain("receivables");
    expect(navScreenOf("receivableAccount")).toBe("receivables");
    expect(navScreenOf("receivableDocument")).toBe("receivables");
    expect(sectionOfScreen("receivableDocument")).toBe("finanzas");
  });

  it("B2B: comercial administra; encargado y contador consultan; recepción no ve tarifas", () => {
    expect(itemsOf(["comercial_b2b"])).toEqual(expect.arrayContaining(["b2bAccounts", "b2bProfitability"]));
    expect(itemsOf(["contador"])).toEqual(expect.arrayContaining(["b2bAccounts", "b2bProfitability"]));
    expect(itemsOf(["contador"])).not.toContain("crmCustomers");
    expect(itemsOf(["encargado"])).toContain("b2bAccounts");
    expect(itemsOf(["operador_recepcion"])).not.toContain("b2bAccounts");
    expect(navScreenOf("b2bAgreementDetail")).toBe("b2bAccounts");
  });

  it("CRM: recepción y comercial lo usan; el contador no (datos personales)", () => {
    expect(itemsOf(["operador_recepcion"])).toEqual(expect.arrayContaining(["crmCustomers", "crmTasks"]));
    expect(itemsOf(["comercial_b2b"])).toEqual(expect.arrayContaining(["crmCustomers", "crmTasks"]));
    expect(itemsOf(["contador"])).not.toContain("crmCustomers");
  });

  it("varios roles en el centro suman secciones", () => {
    expect(sectionsOf(["operador_recepcion", "comercial_b2b"])).toEqual([
      "inicio",
      "operacion",
      "comercial",
      "marketing",
      "finanzas",
      "configuracion",
    ]);
  });

  it("Dirección (tablero, tableros, KPIs, alertas, reportes y piloto): sólo el admin / socio", () => {
    const direccion = ["direccion", "dashboards", "kpis", "alerts", "reportEmails", "pilot"];
    expect(itemsOf(["admin_socio"])).toEqual(expect.arrayContaining(direccion));
    for (const role of ["encargado", "operador_recepcion", "contador", "comercial_b2b", "tecnico"] as const)
      for (const screen of direccion) expect(itemsOf([role])).not.toContain(screen);
    expect(sectionOfScreen("dashboardEdit")).toBe("direccion");
  });

  it("Egresos y estado de resultados: admin, encargado y contador; recepción y comercial no", () => {
    expect(itemsOf(["contador"])).toEqual(expect.arrayContaining(["expenses", "pnl"]));
    expect(itemsOf(["encargado"])).toEqual(expect.arrayContaining(["expenses", "pnl"]));
    expect(itemsOf(["operador_recepcion"])).not.toContain("expenses");
    expect(itemsOf(["comercial_b2b"])).not.toContain("pnl");
    expect(navScreenOf("expenseDetail")).toBe("expenses");
    expect(sectionOfPath("/finanzas/egresos/nuevo")).toBe("finanzas");
    expect(sectionOfPath("/finanzas/resultados")).toBe("finanzas");
  });

  it("Corte de caja (en Operación): admin, encargado, recepción y contador; comercial no", () => {
    expect(itemsOf(["operador_recepcion"])).toContain("cash");
    expect(itemsOf(["contador"])).toContain("cash");
    expect(itemsOf(["comercial_b2b"])).not.toContain("cash");
    expect(navScreenOf("cashSession")).toBe("cash");
    expect(sectionOfScreen("cash")).toBe("operacion");
    expect(sectionOfPath("/finanzas/caja")).toBe("operacion");
    expect(sectionOfPath("/finanzas/caja/123")).toBe("operacion");
  });

  it("Panel comercial: exclusivo del admin", () => {
    expect(itemsOf(["admin_socio"])).toContain("commercialPanel");
    for (const role of ["encargado", "contador", "comercial_b2b", "operador_recepcion"] as const) {
      expect(itemsOf([role])).not.toContain("commercialPanel");
    }
  });

  it("Cobranza: recepción, encargado, admin y contador; comercial no", () => {
    expect(itemsOf(["operador_recepcion"])).toContain("payments");
    expect(itemsOf(["operador_recepcion"])).not.toContain("finanzas");
    expect(itemsOf(["contador"])).toContain("payments");
    expect(itemsOf(["comercial_b2b"])).not.toContain("payments");
    expect(navScreenOf("paymentReceipt")).toBe("payments");
    expect(sectionOfPath("/finanzas/cobranza/recibos/abc")).toBe("finanzas");
  });

  it("sin sesión o sin centro activo no hay navegación privada", () => {
    expect(visibleNavigation({ status: "signed_out" })).toEqual([]);
    const noCenter = {
      ...(stateFor(["admin_socio"]) as Extract<AuthState, { status: "signed_in" }>),
      activeCenterId: null,
    };
    expect(visibleNavigation(noCenter)).toEqual([]);
  });

  it("todo rol de oficina tiene al menos una sección de negocio además de Inicio", () => {
    // El técnico / lavador sólo usa «Mi día» (Inicio).
    for (const role of APP_ROLES.filter((r) => r !== "tecnico")) {
      expect(sectionsOf([role]).length).toBeGreaterThan(1);
    }
  });

  it("resuelve la sección activa por pantalla y por ruta", () => {
    expect(sectionOfScreen("team")).toBe("configuracion");
    expect(sectionOfPath("/")).toBe("inicio");
    expect(sectionOfPath("/equipo")).toBe("configuracion");
    expect(sectionOfPath("/direccion/detalle")).toBe("direccion");
    expect(sectionOfPath("/login")).toBeNull();
  });

  it("Marketing agrupa campañas, calendario, promociones, segmentos y automatizaciones", () => {
    expect(NAV_SECTIONS.find((s) => s.id === "marketing")!.items.map((i) => i.screen)).toEqual([
      "campaigns",
      "contentCalendar",
      "promotions",
      "segments",
      "automations",
    ]);
    // Comercial conserva la venta: bandeja, prospectos, cotizaciones, CRM, B2B, pipeline y reportes.
    const comercial = NAV_SECTIONS.find((s) => s.id === "comercial")!.items.map((i) => i.screen);
    expect(comercial).toEqual(
      expect.arrayContaining(["inbox", "leads", "quotes", "pipeline", "commercialReports"]),
    );
    expect(comercial).not.toContain("campaigns");
    // Las rutas siguen bajo /comercial: la más específica decide la sección.
    expect(sectionOfPath("/comercial/campanas/abc")).toBe("marketing");
    expect(sectionOfPath("/comercial/calendario")).toBe("marketing");
    expect(sectionOfPath("/comercial/integraciones")).toBe("configuracion");
    expect(sectionOfPath("/comercial/bandeja/abc")).toBe("comercial");
    expect(sectionOfPath("/comercial")).toBe("comercial");
    expect(sectionOfScreen("campaignDetail")).toBe("marketing");
    // El contador sólo consulta (sin segmentos con datos personales ni automatizaciones).
    const contador = visibleNavigation(stateFor(["contador"])).find((s) => s.id === "marketing")!;
    expect(contador.items.map((i) => i.screen)).toEqual(["campaigns", "contentCalendar", "promotions"]);
  });

  it("Configuración reúne lo configurable: datos del centro, centros, equipo, usuarios, asistente e integraciones", () => {
    expect(NAV_SECTIONS.find((s) => s.id === "configuracion")!.items.map((i) => i.screen)).toEqual([
      "editCenter",
      "centers",
      "team",
      "users",
      "assistant",
      "integrations",
    ]);
    // «Editar centro» ya no está en Inicio.
    expect(NAV_SECTIONS.find((s) => s.id === "inicio")!.items.map((i) => i.screen)).toEqual([
      "home",
      "myWork",
    ]);
    expect(sectionOfPath("/configuracion/centro")).toBe("configuracion");
    expect(sectionOfPath("/comercial/asistente")).toBe("configuracion");
    expect(sectionOfPath("/equipo/usuarios")).toBe("configuracion");
    // Sólo quien administra el centro cambia sus datos.
    expect(itemsOf(["admin_socio"])).toContain("editCenter");
    expect(itemsOf(["encargado"])).not.toContain("editCenter");
  });
});
