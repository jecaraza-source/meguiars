import type { Capability } from "../roles";
import { canInActiveCenter, usableCenters, type AuthState } from "./session";

/** Requisito de acceso de una ruta (web) o pantalla (móvil). */
export interface GuardRequirement {
  /** Requiere un centro activo elegido. */
  center?: boolean;
  /** Capacidad requerida en el centro activo. */
  capability?: Capability;
}

export type GuardResult =
  | { allow: true }
  | { allow: false; redirect: "login" | "disabled" | "select_center" | "no_centers" | "forbidden" };

/** Rutas/pantallas de la app y sus requisitos. Web y móvil usan la misma tabla. */
export const SCREEN_GUARDS = {
  home: { center: true },
  selectCenter: {},
  team: { center: true, capability: "members.read" },
  editCenter: { center: true, capability: "center.manage" },
  users: { center: true, capability: "users.manage" },
  userDetail: { center: true, capability: "users.manage" },
  centers: { center: true, capability: "centers.setup" },
  centerSetup: { center: true, capability: "centers.setup" },
  centerImport: { center: true, capability: "centers.setup" },
  operacion: { center: true, capability: "operations.read" },
  clients: { center: true, capability: "clients.read" },
  clientDetail: { center: true, capability: "clients.read" },
  clientNew: { center: true, capability: "clients.write" },
  catalog: { center: true, capability: "catalog.read" },
  catalogDetail: { center: true, capability: "catalog.read" },
  catalogNew: { center: true, capability: "catalog.manage" },
  agenda: { center: true, capability: "agenda.read" },
  appointmentDetail: { center: true, capability: "agenda.read" },
  appointmentNew: { center: true, capability: "agenda.write" },
  orders: { center: true, capability: "orders.read" },
  orderDetail: { center: true, capability: "orders.read" },
  orderNew: { center: true, capability: "orders.write" },
  orderExecution: { center: true, capability: "orders.read" },
  myWork: { center: true, capability: "work.mine" },
  supplies: { center: true, capability: "catalog.read" },
  // Lotes de insumos con caducidad (ADR 0052): private.can_use_supply_lots.
  supplyLots: { center: true, capability: "operations.write" },
  comercial: { center: true, capability: "commercial.read" },
  // Menú Comercial y Ajustes del asistente: no para recepción (vende membresías desde la OS:
  // membershipNew y membershipDetail siguen con memberships.*).
  memberships: { center: true, capability: "commercial.workspace.read" },
  membershipDetail: { center: true, capability: "memberships.read" },
  membershipNew: { center: true, capability: "memberships.write" },
  membershipPlans: { center: true, capability: "commercial.workspace.read" },
  membershipPlanDetail: { center: true, capability: "commercial.workspace.read" },
  crmCustomers: { center: true, capability: "commercial.workspace.read" },
  crmCustomerDetail: { center: true, capability: "commercial.workspace.read" },
  crmTasks: { center: true, capability: "commercial.workspace.read" },
  b2bAccounts: { center: true, capability: "b2b.read" },
  b2bAccountDetail: { center: true, capability: "b2b.read" },
  b2bAccountNew: { center: true, capability: "b2b.write" },
  b2bAgreementDetail: { center: true, capability: "b2b.read" },
  b2bProfitability: { center: true, capability: "b2b.read" },
  upsell: { center: true, capability: "upsell.read" },
  pipeline: { center: true, capability: "pipeline.read" },
  opportunityDetail: { center: true, capability: "pipeline.read" },
  opportunityNew: { center: true, capability: "pipeline.write" },
  pipelineMetrics: { center: true, capability: "pipeline.metrics.read" },
  leads: { center: true, capability: "commercial.workspace.read" },
  leadNew: { center: true, capability: "commercial.workspace.read" },
  leadDetail: { center: true, capability: "commercial.workspace.read" },
  quotes: { center: true, capability: "commercial.workspace.read" },
  quoteNew: { center: true, capability: "commercial.workspace.read" },
  quoteDetail: { center: true, capability: "commercial.workspace.read" },
  segments: { center: true, capability: "marketing.manage" },
  duplicates: { center: true, capability: "clients.merge" },
  commercialReports: { center: true, capability: "commercial.metrics.read" },
  integrations: { center: true, capability: "commercial.workspace.read" },
  inbox: { center: true, capability: "commercial.workspace.read" },
  conversationHistory: { center: true, capability: "commercial.workspace.read" },
  assistant: { center: true, capability: "commercial.workspace.read" },
  conversation: { center: true, capability: "commercial.workspace.read" },
  contentCalendar: { center: true, capability: "marketing.planning.read" },
  campaigns: { center: true, capability: "marketing.read" },
  campaignDetail: { center: true, capability: "marketing.read" },
  promotions: { center: true, capability: "marketing.planning.read" },
  automations: { center: true, capability: "automations.read" },
  commercialPanel: { center: true, capability: "commercial.panel" },
  finanzas: { center: true, capability: "finance.read" },
  payments: { center: true, capability: "payments.ledger.read" },
  paymentReceipt: { center: true, capability: "payments.read" },
  expenses: { center: true, capability: "expenses.read" },
  expenseDetail: { center: true, capability: "expenses.read" },
  expenseNew: { center: true, capability: "expenses.write" },
  expenseSettings: { center: true, capability: "expenses.read" },
  pnl: { center: true, capability: "pnl.read" },
  pnlDrilldown: { center: true, capability: "pnl.read" },
  cash: { center: true, capability: "cash.read" },
  cashSession: { center: true, capability: "cash.read" },
  receivables: { center: true, capability: "b2b.read" },
  receivableAccount: { center: true, capability: "b2b.read" },
  receivableDocument: { center: true, capability: "b2b.read" },
  direccion: { center: true, capability: "executive.read" },
  direccionDetalle: { center: true, capability: "executive.read" },
  // Toda la sección Dirección es sólo del admin / socio (executive.read); las
  // capacidades propias (dashboards.*, alerts.*, pnl.read) siguen aplicando dentro.
  dashboards: { center: true, capability: "executive.read" },
  kpis: { center: true, capability: "executive.read" },
  dashboardDetail: { center: true, capability: "executive.read" },
  dashboardNew: { center: true, capability: "dashboards.manage" },
  dashboardEdit: { center: true, capability: "dashboards.manage" },
  alerts: { center: true, capability: "executive.read" },
  alertDetail: { center: true, capability: "executive.read" },
  alertRules: { center: true, capability: "alerts.rules" },
  reportEmails: { center: true, capability: "executive.read" },
  pilot: { center: true, capability: "executive.read" },
  designSystem: {},
  account: {},
} as const satisfies Record<string, GuardRequirement>;

export type Screen = keyof typeof SCREEN_GUARDS;

export function evaluateGuard(state: AuthState, requirement: GuardRequirement): GuardResult {
  if (state.status === "loading" || state.status === "signed_out") return { allow: false, redirect: "login" };
  if (state.status === "disabled") return { allow: false, redirect: "disabled" };
  if (requirement.center || requirement.capability) {
    if (usableCenters(state.access).length === 0) return { allow: false, redirect: "no_centers" };
    if (!state.activeCenterId) return { allow: false, redirect: "select_center" };
  }
  if (requirement.capability && !canInActiveCenter(state, requirement.capability)) {
    return { allow: false, redirect: "forbidden" };
  }
  return { allow: true };
}

export function guardScreen(state: AuthState, screen: Screen): GuardResult {
  return evaluateGuard(state, SCREEN_GUARDS[screen]);
}
