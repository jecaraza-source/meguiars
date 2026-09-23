/**
 * Roles por centro. Debe coincidir con el enum `public.app_role`.
 * La base de datos (RLS) es la fuente de verdad de la autorización;
 * estos conjuntos sólo deciden qué se muestra en la UI.
 */
export const APP_ROLES = ["owner", "admin", "manager", "advisor", "technician", "viewer"] as const;

export type AppRole = (typeof APP_ROLES)[number];

/** Pueden editar el centro y administrar membresías. */
export const CENTER_ADMIN_ROLES: readonly AppRole[] = ["owner", "admin"];

/** Pueden consultar la bitácora de auditoría. */
export const AUDIT_READER_ROLES: readonly AppRole[] = ["owner", "admin", "manager"];

export function hasAnyRole(role: AppRole | null | undefined, allowed: readonly AppRole[]): boolean {
  return role != null && allowed.includes(role);
}

/** Sólo un owner puede otorgar, modificar o retirar el rol owner. */
export function canAssignRole(actor: AppRole | null | undefined, target: AppRole): boolean {
  if (!hasAnyRole(actor, CENTER_ADMIN_ROLES)) return false;
  return target !== "owner" || actor === "owner";
}
