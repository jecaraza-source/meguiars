import type { AppRole } from "../roles";
import type { Result } from "../result";

/** Centro de costos y resultados independiente. */
export interface DetailCenter {
  id: string;
  code: string;
  name: string;
  /** Zona horaria IANA en la que se presentan las fechas del centro. */
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface CenterMembership {
  detailCenterId: string;
  userId: string;
  role: AppRole;
  active: boolean;
}

export interface UpdateDetailCenterCommand {
  id: string;
  name: string;
  timezone: string;
  /** Motivo obligatorio: queda en la bitácora de auditoría. */
  reason: string;
}

export interface SetMembershipCommand {
  detailCenterId: string;
  userId: string;
  role: AppRole;
  active: boolean;
  reason: string;
}

/**
 * Puerto de acceso a centros. Las apps dependen de esta interfaz;
 * `@meguiars/supabase` provee el adaptador. Las mutaciones van por RPC.
 */
export interface DetailCenterRepository {
  /** Centros visibles para el usuario actual (RLS filtra por membresía). */
  listVisible(): Promise<Result<DetailCenter[]>>;
  update(command: UpdateDetailCenterCommand): Promise<Result<DetailCenter>>;
  setMembership(command: SetMembershipCommand): Promise<Result<CenterMembership>>;
}
