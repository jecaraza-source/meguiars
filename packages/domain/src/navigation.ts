import { guardScreen, type Screen } from "./auth/guards";
import type { AuthState } from "./auth/session";

/**
 * Navegación principal compartida por web y móvil: cinco dominios de negocio
 * más Inicio (Operación, Comercial, Marketing, Administración y Finanzas, Dirección). Una sección se muestra si el rol del centro activo puede ver al
 * menos una de sus pantallas (mismos guards que protegen las rutas).
 */
export type NavSectionId = "inicio" | "operacion" | "comercial" | "marketing" | "finanzas" | "direccion";

export interface NavItem {
  screen: Screen;
  label: string;
  /** Ruta web (móvil usa `screen`). */
  href: string;
}

export interface NavSection {
  id: NavSectionId;
  label: string;
  /** Etiqueta corta para barras de pestañas. */
  shortLabel: string;
  items: readonly NavItem[];
}

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: "inicio",
    label: "Inicio",
    shortLabel: "Inicio",
    items: [{ screen: "home", label: "Mi centro", href: "/" }],
  },
  {
    id: "operacion",
    label: "Operación",
    shortLabel: "Operación",
    items: [
      { screen: "operacion", label: "Operación del día", href: "/operacion" },
      { screen: "agenda", label: "Agenda", href: "/agenda" },
      { screen: "orders", label: "Órdenes de servicio", href: "/ordenes" },
      { screen: "clients", label: "Clientes y vehículos", href: "/clientes" },
      { screen: "catalog", label: "Catálogo", href: "/catalogo" },
    ],
  },
  {
    id: "comercial",
    label: "Comercial",
    shortLabel: "Comercial",
    items: [
      { screen: "comercial", label: "Resumen comercial", href: "/comercial" },
      { screen: "inbox", label: "Bandeja", href: "/comercial/bandeja" },
      { screen: "leads", label: "Prospectos", href: "/comercial/prospectos" },
      { screen: "quotes", label: "Cotizaciones", href: "/comercial/cotizaciones" },
      { screen: "memberships", label: "Membresías", href: "/comercial/membresias" },
      { screen: "crmCustomers", label: "Clientes (CRM)", href: "/comercial/clientes" },
      { screen: "crmTasks", label: "Seguimientos", href: "/comercial/seguimientos" },
      { screen: "b2bAccounts", label: "Cuentas B2B", href: "/comercial/b2b" },
      { screen: "b2bProfitability", label: "Rentabilidad B2B", href: "/comercial/b2b/rentabilidad" },
      { screen: "upsell", label: "Recomendaciones", href: "/comercial/recomendaciones" },
      { screen: "pipeline", label: "Pipeline", href: "/comercial/pipeline" },
      {
        screen: "pipelineMetrics",
        label: "Indicadores del pipeline",
        href: "/comercial/pipeline/indicadores",
      },
      { screen: "duplicates", label: "Duplicados", href: "/comercial/duplicados" },
      { screen: "commercialPanel", label: "Panel comercial", href: "/comercial/panel" },
      { screen: "commercialReports", label: "Reportes comerciales", href: "/comercial/reportes" },
    ],
  },
  {
    // Las rutas siguen bajo /comercial (enlaces y permisos sin cambios); el menú las agrupa aquí.
    id: "marketing",
    label: "Marketing",
    shortLabel: "Marketing",
    items: [
      { screen: "campaigns", label: "Campañas", href: "/comercial/campanas" },
      { screen: "contentCalendar", label: "Calendario", href: "/comercial/calendario" },
      { screen: "promotions", label: "Promociones", href: "/comercial/promociones" },
      { screen: "segments", label: "Segmentos", href: "/comercial/segmentos" },
      { screen: "automations", label: "Automatizaciones", href: "/comercial/automatizaciones" },
      { screen: "integrations", label: "Integraciones (redes)", href: "/comercial/integraciones" },
    ],
  },
  {
    id: "finanzas",
    label: "Administración y Finanzas",
    shortLabel: "AyF",
    items: [
      { screen: "finanzas", label: "Resumen financiero", href: "/finanzas" },
      { screen: "payments", label: "Cobranza", href: "/finanzas/cobranza" },
      { screen: "cash", label: "Corte de caja", href: "/finanzas/caja" },
      { screen: "expenses", label: "Egresos", href: "/finanzas/egresos" },
      { screen: "pnl", label: "Estado de resultados", href: "/finanzas/resultados" },
      { screen: "receivables", label: "Cuentas por cobrar B2B", href: "/finanzas/cxc" },
      { screen: "team", label: "Equipo del centro", href: "/equipo" },
      { screen: "users", label: "Usuarios", href: "/equipo/usuarios" },
      { screen: "centers", label: "Centros", href: "/equipo/centros" },
    ],
  },
  {
    id: "direccion",
    label: "Dirección",
    shortLabel: "Dirección",
    items: [
      { screen: "direccion", label: "Tablero corporativo", href: "/direccion" },
      { screen: "dashboards", label: "Tableros", href: "/direccion/tableros" },
      { screen: "kpis", label: "KPIs", href: "/direccion/kpis" },
      { screen: "alerts", label: "Alertas", href: "/direccion/alertas" },
      { screen: "pilot", label: "Piloto", href: "/direccion/piloto" },
    ],
  },
];

/** Secciones e ítems visibles para el estado de sesión (filtrados por guard). */
export function visibleNavigation(state: AuthState): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => guardScreen(state, item.screen).allow),
  })).filter((section) => section.items.length > 0);
}

/** Pantallas que no están en el menú y se muestran bajo otra (detalle, alta). */
const NAV_PARENT: Partial<Record<Screen, Screen>> = {
  clientDetail: "clients",
  clientNew: "clients",
  catalogDetail: "catalog",
  catalogNew: "catalog",
  appointmentDetail: "agenda",
  appointmentNew: "agenda",
  orderDetail: "orders",
  orderNew: "orders",
  orderExecution: "orders",
  supplies: "catalog",
  membershipDetail: "memberships",
  membershipNew: "memberships",
  membershipPlans: "memberships",
  membershipPlanDetail: "memberships",
  crmCustomerDetail: "crmCustomers",
  b2bAccountDetail: "b2bAccounts",
  b2bAccountNew: "b2bAccounts",
  b2bAgreementDetail: "b2bAccounts",
  paymentReceipt: "payments",
  expenseDetail: "expenses",
  expenseNew: "expenses",
  expenseSettings: "expenses",
  cashSession: "cash",
  pnlDrilldown: "pnl",
  receivableAccount: "receivables",
  receivableDocument: "receivables",
  direccionDetalle: "direccion",
  dashboardDetail: "dashboards",
  dashboardNew: "dashboards",
  dashboardEdit: "dashboards",
  userDetail: "users",
  alertDetail: "alerts",
  alertRules: "alerts",
  centerSetup: "centers",
  centerImport: "centers",
  leadNew: "leads",
  leadDetail: "leads",
  quoteNew: "quotes",
  quoteDetail: "quotes",
  conversation: "inbox",
  campaignDetail: "campaigns",
};

/** Ítem de menú que representa a la pantalla. */
export function navScreenOf(screen: Screen): Screen {
  return NAV_PARENT[screen] ?? screen;
}

/** Sección a la que pertenece una pantalla (para marcar la pestaña activa). */
export function sectionOfScreen(screen: Screen): NavSectionId | null {
  const target = navScreenOf(screen);
  return NAV_SECTIONS.find((s) => s.items.some((i) => i.screen === target))?.id ?? null;
}

/** Sección activa a partir de la ruta web. */
export function sectionOfPath(pathname: string): NavSectionId | null {
  let best: { id: NavSectionId; length: number } | null = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      const match =
        item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (match && (!best || item.href.length > best.length))
        best = { id: section.id, length: item.href.length };
    }
  }
  return best?.id ?? null;
}
