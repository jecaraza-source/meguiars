import type { Result } from "../result";
import { APP_ROLES, ROLE_LABELS, type AppRole } from "../roles";

/**
 * Administración / Usuarios (A1). Espejo de 20261019000000_user_admin.sql.
 * El admin corporativo da de alta cuentas con correo y contraseña (el servidor
 * web usa la Auth Admin API con la llave de servicio; nunca en móvil ni en el
 * navegador), cambia contraseñas, asigna roles y desactiva/reactiva cuentas.
 */

export interface OrgUserCenterRole {
  detailCenterId: string;
  centerName: string;
  role: AppRole;
  active: boolean;
}

export interface OrgUser {
  userId: string;
  email: string | null;
  fullName: string | null;
  active: boolean;
  lastSignInAt: string | null;
  createdAt: string | null;
  /** Roles corporativos activos (toda la organización). */
  corporateRoles: AppRole[];
  centerRoles: OrgUserCenterRole[];
  /** También tiene roles en otra organización: su cuenta no se administra desde aquí. */
  otherOrg: boolean;
}

/** Acceso inicial al dar de alta: admin corporativo o un rol en uno o más centros. */
export type NewUserAccess = { kind: "corporativo" } | { kind: "centro"; role: AppRole; centerIds: string[] };

export interface NewUserInput {
  organizationId: string;
  fullName: string;
  email: string;
  password: string;
  access: NewUserAccess;
  reason: string;
}

/** Longitud mínima de contraseña (Supabase Auth acepta desde 6; pedimos 8). */
export const MIN_PASSWORD_LENGTH = 8;

/** Roles que se asignan por centro (el corporativo es admin_socio en role_assignments). */
export const CENTER_ROLES: readonly AppRole[] = APP_ROLES;

export const roleLabel = (r: AppRole) => ROLE_LABELS[r];

/** Puerto con la sesión del admin (RLS/RPC). */
export interface UsersRepository {
  list(organizationId: string): Promise<Result<OrgUser[]>>;
  /** ¿Puede administrar esta cuenta? (null = alta nueva). */
  canAdmin(organizationId: string, userId: string | null): Promise<Result<boolean>>;
  setDisabled(
    organizationId: string,
    userId: string,
    disabled: boolean,
    reason: string,
  ): Promise<Result<void>>;
}

/**
 * Puerto de cuentas (Auth Admin API). SÓLO servidor web con la llave de
 * servicio; se usa después de comprobar `UsersRepository.canAdmin` con la
 * sesión del admin.
 */
export interface UserAccountsAdmin {
  create(input: { email: string; password: string; fullName: string }): Promise<Result<{ userId: string }>>;
  setPassword(userId: string, password: string): Promise<Result<void>>;
  /** Deshace un alta cuyo acceso no se pudo asignar. */
  remove(userId: string): Promise<Result<void>>;
}
