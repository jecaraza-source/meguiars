import type { CenterAccess } from "../access/access";
import { can, type AppRole, type Capability } from "../roles";

/** Usuario autenticado con su perfil (profiles). */
export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
  /** Soft-disable del perfil: false = cuenta deshabilitada. */
  active: boolean;
  /** Último centro activo guardado (profiles.last_detail_center_id). */
  lastDetailCenterId: string | null;
}

export type AuthState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "disabled"; email: string }
  | {
      status: "signed_in";
      user: SessionUser;
      access: CenterAccess[];
      /** null cuando el usuario tiene varios centros y aún no elige uno. */
      activeCenterId: string | null;
    };

export type SignedInState = Extract<AuthState, { status: "signed_in" }>;

/** Un centro es utilizable si está activo y el usuario tiene algún rol en él. */
export function usableCenters(access: readonly CenterAccess[]): CenterAccess[] {
  return access.filter((a) => a.center.active && a.roles.length > 0);
}

/**
 * Centro activo: el primero de `preferred` que siga siendo utilizable (p. ej.
 * el recién elegido y luego el guardado en el perfil); si no hay, el único
 * centro utilizable; si hay varios, null (el usuario debe elegir).
 */
export function resolveActiveCenterId(
  access: readonly CenterAccess[],
  preferred: readonly (string | null | undefined)[],
): string | null {
  const usable = usableCenters(access);
  for (const id of preferred) {
    if (id && usable.some((a) => a.center.id === id)) return id;
  }
  return usable.length === 1 ? usable[0]!.center.id : null;
}

/** Construye el estado de sesión a partir del perfil y los accesos. */
export function buildAuthState(
  user: SessionUser | null,
  access: readonly CenterAccess[],
  preferredCenterId?: string | null,
): AuthState {
  if (!user) return { status: "signed_out" };
  if (!user.active) return { status: "disabled", email: user.email };
  return {
    status: "signed_in",
    user,
    access: [...access],
    activeCenterId: resolveActiveCenterId(access, [preferredCenterId, user.lastDetailCenterId]),
  };
}

export function activeCenterAccess(state: AuthState): CenterAccess | null {
  if (state.status !== "signed_in" || !state.activeCenterId) return null;
  return state.access.find((a) => a.center.id === state.activeCenterId) ?? null;
}

/** Roles efectivos en el centro activo (vacío si no hay centro activo). */
export function activeRoles(state: AuthState): AppRole[] {
  return activeCenterAccess(state)?.roles ?? [];
}

/** ¿Puede hacer `capability` en el centro activo? Sólo decide la UI: RLS lo vuelve a validar. */
export function canInActiveCenter(state: AuthState, capability: Capability): boolean {
  return can(activeRoles(state), capability);
}

/** Cambiar de centro: sólo a uno utilizable; devuelve el nuevo estado sin mezclar datos del anterior. */
export function switchActiveCenter(state: SignedInState, centerId: string): SignedInState {
  if (!usableCenters(state.access).some((a) => a.center.id === centerId)) {
    throw new Error("Centro no disponible para este usuario");
  }
  return { ...state, activeCenterId: centerId };
}
