import { guardScreen, type Screen } from "./auth/guards";
import type { AuthState } from "./auth/session";

/**
 * Navegación principal compartida por web y móvil: cinco dominios de negocio
 * más Inicio (Operación, Comercial, Marketing, Finanzas, Dirección). Una sección se muestra si el rol del centro activo puede ver al
 * menos una de sus pantallas (mismos guards que protegen las rutas).
 */
export type NavSectionId = "inicio" | "operacion" | "comercial" | "marketing" | "finanzas" | "direccion";

/** Iconos que usa la navegación (existen en @meguiars/ui-tokens → icons; el typecheck de web y móvil lo verifica). */
export const NAV_ICON_NAMES = [
  "badgeCheck",
  "banknote",
  "bell",
  "bookOpen",
  "building2",
  "calculator",
  "calendar",
  "calendarDays",
  "car",
  "chartColumn",
  "chartLine",
  "chartPie",
  "clipboardCheck",
  "clipboardList",
  "copy",
  "creditCard",
  "fileChartColumn",
  "fileText",
  "filter",
  "gauge",
  "handCoins",
  "handshake",
  "house",
  "inbox",
  "layoutDashboard",
  "layoutGrid",
  "lightbulb",
  "listChecks",
  "megaphone",
  "plug",
  "receipt",
  "rocket",
  "squareKanban",
  "store",
  "target",
  "ticketPercent",
  "trendingUp",
  "userCog",
  "userPlus",
  "users",
  "usersRound",
  "wallet",
  "wrench",
  "zap",
] as const;
export type NavIconName = (typeof NAV_ICON_NAMES)[number];

export interface NavItem {
  screen: Screen;
  label: string;
  /** Ruta web (móvil usa `screen`). */
  href: string;
  /** Icono del set compartido (@meguiars/ui-tokens → icons). */
  icon: NavIconName;
}

export interface NavSection {
  id: NavSectionId;
  label: string;
  /** Etiqueta corta para barras de pestañas. */
  shortLabel: string;
  icon: NavIconName;
  items: readonly NavItem[];
}

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: "inicio",
    label: "Inicio",
    shortLabel: "Inicio",
    icon: "house",
    items: [{ screen: "home", label: "Mi centro", href: "/", icon: "house" }],
  },
  {
    id: "operacion",
    label: "Operación",
    shortLabel: "Operación",
    icon: "wrench",
    items: [
      { screen: "operacion", label: "Operación del día", href: "/operacion", icon: "clipboardList" },
      { screen: "agenda", label: "Agenda", href: "/agenda", icon: "calendarDays" },
      { screen: "orders", label: "Órdenes de servicio", href: "/ordenes", icon: "clipboardCheck" },
      { screen: "clients", label: "Clientes y vehículos", href: "/clientes", icon: "car" },
      { screen: "catalog", label: "Catálogo", href: "/catalogo", icon: "bookOpen" },
    ],
  },
  {
    id: "comercial",
    label: "Comercial",
    shortLabel: "Comercial",
    icon: "handshake",
    items: [
      { screen: "comercial", label: "Resumen comercial", href: "/comercial", icon: "layoutDashboard" },
      { screen: "inbox", label: "Bandeja", href: "/comercial/bandeja", icon: "inbox" },
      { screen: "leads", label: "Prospectos", href: "/comercial/prospectos", icon: "userPlus" },
      { screen: "quotes", label: "Cotizaciones", href: "/comercial/cotizaciones", icon: "fileText" },
      { screen: "memberships", label: "Membresías", href: "/comercial/membresias", icon: "badgeCheck" },
      { screen: "crmCustomers", label: "Clientes (CRM)", href: "/comercial/clientes", icon: "users" },
      { screen: "crmTasks", label: "Seguimientos", href: "/comercial/seguimientos", icon: "listChecks" },
      { screen: "b2bAccounts", label: "Cuentas B2B", href: "/comercial/b2b", icon: "building2" },
      {
        screen: "b2bProfitability",
        label: "Rentabilidad B2B",
        href: "/comercial/b2b/rentabilidad",
        icon: "trendingUp",
      },
      { screen: "upsell", label: "Recomendaciones", href: "/comercial/recomendaciones", icon: "lightbulb" },
      { screen: "pipeline", label: "Pipeline", href: "/comercial/pipeline", icon: "squareKanban" },
      {
        screen: "pipelineMetrics",
        label: "Indicadores del pipeline",
        href: "/comercial/pipeline/indicadores",
        icon: "chartLine",
      },
      { screen: "duplicates", label: "Duplicados", href: "/comercial/duplicados", icon: "copy" },
      { screen: "commercialPanel", label: "Panel comercial", href: "/comercial/panel", icon: "gauge" },
      {
        screen: "commercialReports",
        label: "Reportes comerciales",
        href: "/comercial/reportes",
        icon: "fileChartColumn",
      },
    ],
  },
  {
    // Las rutas siguen bajo /comercial (enlaces y permisos sin cambios); el menú las agrupa aquí.
    id: "marketing",
    label: "Marketing",
    shortLabel: "Marketing",
    icon: "megaphone",
    items: [
      { screen: "campaigns", label: "Campañas", href: "/comercial/campanas", icon: "megaphone" },
      { screen: "contentCalendar", label: "Calendario", href: "/comercial/calendario", icon: "calendar" },
      { screen: "promotions", label: "Promociones", href: "/comercial/promociones", icon: "ticketPercent" },
      { screen: "segments", label: "Segmentos", href: "/comercial/segmentos", icon: "filter" },
      { screen: "automations", label: "Automatizaciones", href: "/comercial/automatizaciones", icon: "zap" },
      {
        screen: "integrations",
        label: "Integraciones (redes)",
        href: "/comercial/integraciones",
        icon: "plug",
      },
    ],
  },
  {
    id: "finanzas",
    label: "Finanzas",
    shortLabel: "Finanzas",
    icon: "wallet",
    items: [
      { screen: "finanzas", label: "Resumen financiero", href: "/finanzas", icon: "chartPie" },
      { screen: "payments", label: "Cobranza", href: "/finanzas/cobranza", icon: "creditCard" },
      { screen: "cash", label: "Corte de caja", href: "/finanzas/caja", icon: "banknote" },
      { screen: "expenses", label: "Egresos", href: "/finanzas/egresos", icon: "receipt" },
      { screen: "pnl", label: "Estado de resultados", href: "/finanzas/resultados", icon: "calculator" },
      { screen: "receivables", label: "Cuentas por cobrar B2B", href: "/finanzas/cxc", icon: "handCoins" },
      { screen: "team", label: "Equipo del centro", href: "/equipo", icon: "usersRound" },
      { screen: "users", label: "Usuarios", href: "/equipo/usuarios", icon: "userCog" },
      { screen: "centers", label: "Centros", href: "/equipo/centros", icon: "store" },
    ],
  },
  {
    id: "direccion",
    label: "Dirección",
    shortLabel: "Dirección",
    icon: "chartColumn",
    items: [
      { screen: "direccion", label: "Tablero corporativo", href: "/direccion", icon: "chartColumn" },
      { screen: "dashboards", label: "Tableros", href: "/direccion/tableros", icon: "layoutGrid" },
      { screen: "kpis", label: "KPIs", href: "/direccion/kpis", icon: "target" },
      { screen: "alerts", label: "Alertas", href: "/direccion/alertas", icon: "bell" },
      { screen: "pilot", label: "Piloto", href: "/direccion/piloto", icon: "rocket" },
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
