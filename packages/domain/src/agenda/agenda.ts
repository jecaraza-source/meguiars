import type { FrozenServiceLine } from "../catalog/catalog";
import type { Result } from "../result";

/** Estatus de una cita. Coincide con `public.appointment_status`. */
export const APPOINTMENT_STATUSES = [
  "programada",
  "recibida",
  "en_servicio",
  "terminada",
  "entregada",
  "cancelada",
  "no_show",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/**
 * Transiciones válidas (espejo de private.appointment_transition_allowed;
 * schema-parity.test.ts compara ambas definiciones).
 */
export const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  programada: ["recibida", "cancelada", "no_show"],
  recibida: ["en_servicio", "cancelada"],
  en_servicio: ["terminada"],
  terminada: ["entregada"],
  entregada: [],
  cancelada: [],
  no_show: [],
};

/** Estatus que ocupan bahía y técnico (reglas de conflicto). */
export const OCCUPYING_STATUSES: readonly AppointmentStatus[] = ["programada", "recibida", "en_servicio"];

/** Estatus que requieren motivo al aplicarse. */
export const STATUS_NEEDS_REASON: readonly AppointmentStatus[] = ["cancelada", "no_show"];

export const canTransition = (from: AppointmentStatus, to: AppointmentStatus): boolean =>
  APPOINTMENT_TRANSITIONS[from].includes(to);

/** Una cita sólo se reprograma o reasigna antes de empezar el servicio. */
export const canReschedule = (status: AppointmentStatus): boolean =>
  status === "programada" || status === "recibida";

export interface Bay {
  id: string;
  detailCenterId: string;
  name: string;
  active: boolean;
}

export interface Technician {
  id: string;
  detailCenterId: string;
  fullName: string;
  active: boolean;
}

/** Cita tal como la muestra la agenda del día. Horas en UTC. */
export interface AppointmentListItem {
  id: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  isWalkIn: boolean;
  conflictOverride: boolean;
  clientId: string;
  clientName: string | null;
  clientPhone: string | null;
  vehicleId: string;
  vehicleLabel: string | null;
  bayId: string | null;
  bayName: string | null;
  technicianId: string | null;
  technicianName: string | null;
  services: string[];
  notes: string | null;
  serviceOrderId: string | null;
}

export interface AppointmentDetail extends AppointmentListItem {
  serviceIds: string[];
  receivedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
}

/** Borrador de Orden de Servicio a partir de la cita (sin recapturar cliente ni vehículo). */
export interface ServiceOrderDraft {
  appointmentId: string;
  detailCenterId: string;
  clientId: string;
  vehicleId: string;
  lines: FrozenServiceLine[];
}

export interface AgendaFilter {
  status?: AppointmentStatus | undefined;
  bayId?: string | undefined;
  technicianId?: string | undefined;
}

export interface CreateAppointmentCommand {
  detailCenterId: string;
  requestId: string;
  clientId: string;
  vehicleId: string;
  serviceIds: string[];
  /** UTC ISO. En walk-in puede omitirse (ahora). */
  startsAt?: string | undefined;
  /** Sin valor: suma de las duraciones estándar del catálogo. */
  durationMinutes?: number | undefined;
  bayId?: string | undefined;
  technicianId?: string | undefined;
  notes?: string | undefined;
  walkIn: boolean;
  /** Autoriza encimar bahía/técnico (sólo encargado/admin). */
  overrideReason?: string | undefined;
}

export interface UpdateAppointmentCommand {
  id: string;
  serviceIds: string[];
  startsAt: string;
  durationMinutes: number;
  bayId?: string | undefined;
  technicianId?: string | undefined;
  notes?: string | undefined;
  reason: string;
  overrideReason?: string | undefined;
}

export interface SetStatusCommand {
  id: string;
  status: AppointmentStatus;
  reason?: string | undefined;
}

export interface UpsertResourceCommand {
  detailCenterId: string;
  /** Sin id: alta. */
  id?: string | undefined;
  name: string;
  active: boolean;
  reason: string;
}

/** Puerto de agenda. Web y móvil usan el mismo adaptador (`@meguiars/supabase`). */
export interface AgendaRepository {
  listDay(detailCenterId: string, day: string, filter?: AgendaFilter): Promise<Result<AppointmentListItem[]>>;
  get(id: string): Promise<Result<AppointmentDetail>>;
  create(command: CreateAppointmentCommand): Promise<Result<{ id: string }>>;
  update(command: UpdateAppointmentCommand): Promise<Result<{ id: string }>>;
  setStatus(command: SetStatusCommand): Promise<Result<{ id: string; status: AppointmentStatus }>>;
  orderDraft(id: string): Promise<Result<ServiceOrderDraft>>;
  listBays(detailCenterId: string): Promise<Result<Bay[]>>;
  listTechnicians(detailCenterId: string): Promise<Result<Technician[]>>;
  upsertBay(command: UpsertResourceCommand): Promise<Result<Bay>>;
  upsertTechnician(command: UpsertResourceCommand): Promise<Result<Technician>>;
}
