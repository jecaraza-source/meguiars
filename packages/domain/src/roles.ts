/**
 * Roles de la plataforma. Deben coincidir con el enum `public.app_role`
 * (ver schema-parity.test.ts). Un rol se asigna en un centro
 * (user_detail_centers) o en la organización completa (role_assignments,
 * "corporativo"). La base de datos (RLS) es la fuente de verdad; esta matriz
 * es su espejo para decidir qué mostrar en la UI.
 */
export const APP_ROLES = [
  "admin_socio",
  "encargado",
  "operador_recepcion",
  "contador",
  "comercial_b2b",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin_socio: "Admin / socio",
  encargado: "Encargado",
  operador_recepcion: "Operador de recepción",
  contador: "Contador",
  comercial_b2b: "Comercial B2B",
};

export const CAPABILITIES = [
  "center.read",
  "operations.read",
  "commercial.read",
  "finance.read",
  "executive.read",
  "center.manage",
  "members.read",
  "members.manage",
  "audit.read",
  "operations.write",
  "b2b.write",
  "clients.read",
  "clients.write",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * Matriz rol → capacidades. `center.*`, `members.*` y `audit.read` están
 * aplicadas por RLS en la migración 20260923000000; `clients.*`, en
 * 20260927000000 (private.can_read_clients / private.can_write_clients). `operations.*`,
 * `commercial.read`, `finance.read`, `executive.read` y `b2b.write` definen la
 * navegación por dominio y son el contrato para las tablas de negocio futuras.
 */
export const ROLE_CAPABILITIES: Record<AppRole, readonly Capability[]> = {
  admin_socio: [
    "center.read",
    "operations.read",
    "commercial.read",
    "finance.read",
    "executive.read",
    "center.manage",
    "members.read",
    "members.manage",
    "audit.read",
    "operations.write",
    "b2b.write",
    "clients.read",
    "clients.write",
  ],
  encargado: [
    "center.read",
    "operations.read",
    "commercial.read",
    "members.read",
    "operations.write",
    "clients.read",
    "clients.write",
  ],
  operador_recepcion: ["center.read", "operations.read", "operations.write", "clients.read", "clients.write"],
  // El contador no ve datos personales de clientes.
  contador: ["center.read", "finance.read", "members.read", "audit.read"],
  comercial_b2b: ["center.read", "commercial.read", "b2b.write", "clients.read"],
};

export function can(roles: readonly AppRole[], capability: Capability): boolean {
  return roles.some((role) => ROLE_CAPABILITIES[role].includes(capability));
}

export function hasAnyRole(
  roles: readonly AppRole[] | null | undefined,
  allowed: readonly AppRole[],
): boolean {
  return roles != null && roles.some((role) => allowed.includes(role));
}

/** Un rol es de sólo lectura si no tiene ninguna capacidad de escritura. */
export function isReadOnlyRole(role: AppRole): boolean {
  return ROLE_CAPABILITIES[role].every((c) => c.endsWith(".read"));
}

export interface ActorRoles {
  /** Roles del actor en el centro (user_detail_centers). */
  centerRoles: readonly AppRole[];
  /** Roles del actor en la organización del centro (role_assignments). */
  corporateRoles: readonly AppRole[];
}

/**
 * Espejo de `private.can_manage_center_member`: el admin_socio corporativo
 * asigna cualquier rol en los centros de su organización; el admin_socio de
 * un centro, cualquiera salvo admin_socio.
 */
export function canManageCenterMember(actor: ActorRoles, target: AppRole): boolean {
  if (actor.corporateRoles.includes("admin_socio")) return true;
  return target !== "admin_socio" && actor.centerRoles.includes("admin_socio");
}

/** Sólo el admin_socio corporativo asigna roles a nivel organización. */
export function canManageRoleAssignments(corporateRoles: readonly AppRole[]): boolean {
  return corporateRoles.includes("admin_socio");
}
