import { daysBetween } from "../memberships/membership";
import type { Result } from "../result";

/**
 * CRM de recurrencia (C2). Reglas espejo de la migración 20261003000000_crm.sql;
 * schema-parity.test.ts compara listas y umbrales. La plataforma no envía
 * mensajes: las tareas son la cola accionable.
 */

export const CUSTOMER_SEGMENTS = ["nuevo", "recurrente", "miembro", "inactivo", "b2b_contacto"] as const;
export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number];

export const CONTACT_CHANNELS = ["llamada", "whatsapp", "sms", "email"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const TASK_KINDS = ["llamar", "whatsapp", "email", "renovar", "ofrecer_mantenimiento"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const TASK_CHANNELS = ["llamada", "whatsapp", "email", "presencial"] as const;
export type TaskChannel = (typeof TASK_CHANNELS)[number];

export const TASK_STATUSES = ["pendiente", "hecha", "cancelada"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_SOURCES = ["manual", "os_terminada", "proxima_visita", "membresia"] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

export const TASK_OUTCOMES = [
  "contactado",
  "sin_respuesta",
  "agendo_cita",
  "renovo",
  "no_interesado",
] as const;
export type TaskOutcome = (typeof TASK_OUTCOMES)[number];

export const NEXT_VISIT_STATES = ["vencida", "proxima", "programada"] as const;
export type NextVisitState = (typeof NEXT_VISIT_STATES)[number];

/** Umbrales (espejo de private.crm_rule). */
export const CRM_RULES = {
  inactiveDays: 180,
  dueSoonDays: 14,
  recurrentReturnDays: 30,
  taskLeadDays: 3,
} as const;

/** Segmento (espejo de private.customer_segment). Prioridad: B2B > miembro > inactivo > recurrente > nuevo. */
export function customerSegment(input: {
  kind: string;
  b2bOrders: number;
  membershipStatus: string | null;
  visits: number;
  lastVisit: string | null;
  today: string;
}): CustomerSegment {
  if (input.kind === "company" || input.b2bOrders > 0) return "b2b_contacto";
  if (input.membershipStatus === "activa" || input.membershipStatus === "proxima_a_vencer") return "miembro";
  if (input.lastVisit && daysBetween(input.lastVisit, input.today) > CRM_RULES.inactiveDays)
    return "inactivo";
  if (input.visits >= 2) return "recurrente";
  return "nuevo";
}

/** Estado de la próxima visita (espejo de private.next_visit_state). */
export function nextVisitState(nextVisit: string | null, today: string): NextVisitState | null {
  if (!nextVisit) return null;
  if (nextVisit < today) return "vencida";
  if (daysBetween(today, nextVisit) <= CRM_RULES.dueSoonDays) return "proxima";
  return "programada";
}

/** Canal que exige cada tipo de contacto; renovar y ofrecer mantenimiento eligen canal. */
export function channelForKind(kind: TaskKind, chosen?: TaskChannel): TaskChannel {
  if (kind === "llamar") return "llamada";
  if (kind === "whatsapp" || kind === "email") return kind;
  return chosen ?? "presencial";
}

/** Canales utilizables para una tarea según el consentimiento (presencial siempre). */
export function allowedTaskChannels(optedIn: readonly string[]): TaskChannel[] {
  return TASK_CHANNELS.filter((c) => c === "presencial" || optedIn.includes(c));
}

/** Tipos de tarea que el consentimiento permite crear. */
export function allowedTaskKinds(optedIn: readonly string[]): TaskKind[] {
  return TASK_KINDS.filter((k) => {
    const channel = channelForKind(k);
    return channel === "presencial" || optedIn.includes(channel);
  });
}

// ---------------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------------

export interface CrmCustomer {
  clientId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  kind: string;
  segment: CustomerSegment;
  visits: number;
  lastVisitAt: string | null;
  servicesValue: number;
  membershipValue: number;
  lifetimeValue: number;
  membershipId: string | null;
  membershipNumber: string | null;
  membershipPlan: string | null;
  membershipStatus: string | null;
  membershipEndsOn: string | null;
  nextVisitOn: string | null;
  nextVisitState: NextVisitState | null;
  nextVisitService: string | null;
  nextVisitOrderId: string | null;
  nextVisitFolio: string | null;
  openTasks: number;
  optedInChannels: ContactChannel[];
}

export interface CrmTask {
  id: string;
  detailCenterId: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  kind: TaskKind;
  channel: TaskChannel;
  status: TaskStatus;
  dueOn: string;
  notes: string | null;
  source: TaskSource;
  serviceOrderId: string | null;
  membershipId: string | null;
  outcome: TaskOutcome | null;
  outcomeNotes: string | null;
  completedAt: string | null;
  cancelReason: string | null;
  createdAt: string;
}

export interface ContactPreference {
  channel: ContactChannel;
  optedIn: boolean;
  source: string;
  updatedAt: string;
}

export interface CrmCustomerFilter {
  segment?: CustomerSegment | undefined;
  due?: NextVisitState | undefined;
  query?: string | undefined;
}

export type TaskDueFilter = "vencidas" | "hoy" | "proximas";

export interface CrmTaskFilter {
  status?: TaskStatus | undefined;
  due?: TaskDueFilter | undefined;
  clientId?: string | undefined;
  /** Fecha de hoy del centro (YYYY-MM-DD) para los filtros por vencimiento. */
  today: string;
}

export interface CreateTaskCommand {
  detailCenterId: string;
  requestId: string;
  clientId: string;
  kind: TaskKind;
  channel?: TaskChannel | undefined;
  dueOn: string;
  notes?: string | undefined;
  vehicleId?: string | undefined;
}

export interface CompleteTaskCommand {
  taskId: string;
  outcome: TaskOutcome;
  notes?: string | undefined;
}

export interface SetPreferenceCommand {
  clientId: string;
  channel: ContactChannel;
  optedIn: boolean;
  source: "web" | "mobile";
  reason: string;
}

export interface CrmRepository {
  listCustomers(detailCenterIds: string[], filter?: CrmCustomerFilter): Promise<Result<CrmCustomer[]>>;
  getCustomer(clientId: string, detailCenterIds: string[]): Promise<Result<CrmCustomer>>;
  listTasks(detailCenterIds: string[], filter: CrmTaskFilter): Promise<Result<CrmTask[]>>;
  preferences(clientId: string): Promise<Result<ContactPreference[]>>;
  createTask(command: CreateTaskCommand): Promise<Result<{ id: string }>>;
  completeTask(command: CompleteTaskCommand): Promise<Result<void>>;
  cancelTask(taskId: string, reason: string): Promise<Result<void>>;
  rescheduleTask(taskId: string, dueOn: string, reason: string): Promise<Result<void>>;
  generateTasks(detailCenterId: string): Promise<Result<number>>;
  setPreference(command: SetPreferenceCommand): Promise<Result<void>>;
}
