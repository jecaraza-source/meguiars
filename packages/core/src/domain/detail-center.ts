import type { AppRole } from "./roles";

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
