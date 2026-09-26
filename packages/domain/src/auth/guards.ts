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
  supplies: { center: true, capability: "catalog.read" },
  comercial: { center: true, capability: "commercial.read" },
  memberships: { center: true, capability: "memberships.read" },
  membershipDetail: { center: true, capability: "memberships.read" },
  membershipNew: { center: true, capability: "memberships.write" },
  membershipPlans: { center: true, capability: "memberships.read" },
  membershipPlanDetail: { center: true, capability: "memberships.read" },
  finanzas: { center: true, capability: "finance.read" },
  direccion: { center: true, capability: "executive.read" },
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
