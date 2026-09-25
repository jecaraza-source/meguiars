import type { DetailCenter } from "../centers/detail-center";
import type { Result } from "../result";
import type { AppRole } from "../roles";

/** Asignación de un usuario a un centro con un rol (user_detail_centers). */
export interface CenterMembership {
  detailCenterId: string;
  userId: string;
  role: AppRole;
  active: boolean;
}

/** Rol a nivel organización: aplica a todos sus centros (role_assignments). */
export interface RoleAssignment {
  id: string;
  organizationId: string;
  userId: string;
  role: AppRole;
  active: boolean;
}

/** Acceso del usuario actual a un centro. */
export interface CenterAccess {
  center: DetailCenter;
  organizationName: string;
  /** Roles efectivos en el centro (propios del centro ∪ corporativos). */
  roles: AppRole[];
  /** Roles corporativos en la organización del centro. */
  corporateRoles: AppRole[];
}

export interface AccessSummary {
  centers: number;
  activeCenters: number;
  organizations: number;
  /** Centros a los que el usuario accede con un rol corporativo (vista consolidada). */
  corporateCenters: number;
}

export function summarizeAccess(list: readonly CenterAccess[]): AccessSummary {
  return {
    centers: list.length,
    activeCenters: list.filter((a) => a.center.active).length,
    organizations: new Set(list.map((a) => a.center.organizationId)).size,
    corporateCenters: list.filter((a) => a.corporateRoles.length > 0).length,
  };
}

export interface SetCenterMembershipCommand {
  detailCenterId: string;
  userId: string;
  role: AppRole;
  active: boolean;
  reason: string;
}

export interface SetRoleAssignmentCommand {
  organizationId: string;
  userId: string;
  role: AppRole;
  active: boolean;
  reason: string;
}

/** Miembro de un centro visto por quien tiene `members.read`. */
export interface CenterMember {
  userId: string;
  fullName: string | null;
  role: AppRole;
  active: boolean;
}

/** Puerto de tenancy y permisos. Las mutaciones van por RPC con motivo. */
export interface AccessRepository {
  listMyAccess(): Promise<Result<CenterAccess[]>>;
  /** Miembros de un centro (RLS: admin_socio, encargado o contador de ese centro). */
  listCenterMembers(detailCenterId: string): Promise<Result<CenterMember[]>>;
  setCenterMembership(command: SetCenterMembershipCommand): Promise<Result<CenterMembership>>;
  setRoleAssignment(command: SetRoleAssignmentCommand): Promise<Result<RoleAssignment>>;
}
