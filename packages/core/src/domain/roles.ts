/**
 * Roles por centro. Debe coincidir con el enum `public.app_role`
 * en supabase/migrations. La base de datos (RLS) es la fuente de verdad;
 * estos conjuntos sólo sirven para decidir qué mostrar en la UI.
 */
export const APP_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
  "technician",
  "viewer",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

/** Roles que pueden administrar el centro y sus membresías. */
export const CENTER_ADMIN_ROLES: readonly AppRole[] = ["owner", "admin"];

/** Roles que pueden consultar la bitácora de auditoría. */
export const AUDIT_READER_ROLES: readonly AppRole[] = ["owner", "admin", "manager"];

export function hasAnyRole(role: AppRole | null | undefined, allowed: readonly AppRole[]): boolean {
  return role != null && allowed.includes(role);
}
