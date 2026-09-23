import type { Result } from "../result";

/** Centro de costos y resultados independiente dentro de una organización. */
export interface DetailCenter {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  /** Zona horaria IANA en la que se presentan las fechas del centro. */
  timezone: string;
  /** Soft-disable: un centro inactivo no otorga acceso operativo. */
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateDetailCenterCommand {
  id: string;
  name: string;
  timezone: string;
  /** Motivo obligatorio: queda en la bitácora de auditoría. */
  reason: string;
}

/**
 * Puerto de acceso a centros. Las apps dependen de esta interfaz;
 * `@meguiars/supabase` provee el adaptador. Las mutaciones van por RPC.
 */
export interface DetailCenterRepository {
  /** Centros visibles para el usuario actual (RLS filtra por acceso). */
  listVisible(): Promise<Result<DetailCenter[]>>;
  update(command: UpdateDetailCenterCommand): Promise<Result<DetailCenter>>;
}
