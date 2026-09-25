import { activeCenterAccess, canInActiveCenter, type AuthState } from "../auth/session";

/**
 * Crear o editar servicios homologados: admin_socio corporativo de la
 * organización del centro activo (espejo de la política services_update).
 */
export function canManageServices(state: AuthState): boolean {
  return activeCenterAccess(state)?.corporateRoles.includes("admin_socio") ?? false;
}

/** Disponibilidad y precio propio del centro activo: admin_socio del centro o corporativo. */
export function canConfigureCenterCatalog(state: AuthState): boolean {
  return canInActiveCenter(state, "catalog.manage");
}
