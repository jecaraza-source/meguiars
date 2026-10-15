import type { StatusTone } from "../agenda/copy";
import type { EvidenceKind, EvidenceMimeType, ItemWorkStatus } from "../execution/execution";
import type { Result } from "../result";
import type { AppRole } from "../roles";
import type { ServiceOrderStatus } from "../orders/order";
import { formatTimeInCenterTimeZone } from "../time";

/**
 * «Mi día» del técnico / lavador: sus asignaciones con botones grandes
 * (Empezar, Trabajo realizado, Foto, Comentario, Problema). La base decide qué
 * le toca (public.my_work) y valida cada acción (public.my_work_*).
 */

export interface MyWorkVehicle {
  make: string;
  model: string;
  year: number;
  plate: string;
}

export interface MyWorkItem {
  id: string;
  name: string;
  quantity: number;
  status: ItemWorkStatus;
  /** El técnico de la sesión es quien lo trabaja (o lo trabajó). */
  mine: boolean;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface MyWorkPhoto {
  id: string;
  kind: EvidenceKind;
  path: string;
  itemId: string | null;
  at: string;
  /** URL firmada temporal (la llena el repositorio). */
  url: string | null;
}

export interface MyWorkComment {
  note: string;
  itemId: string | null;
  at: string;
  by: string | null;
}

export interface MyWorkOrder {
  id: string;
  organizationId: string;
  detailCenterId: string;
  folio: string;
  status: ServiceOrderStatus;
  scheduledAt: string;
  promisedAt: string | null;
  bay: string | null;
  vehicle: MyWorkVehicle;
  /** Indicaciones de recepción para el técnico. */
  observations: string | null;
  items: MyWorkItem[];
  photos: MyWorkPhoto[];
  comments: MyWorkComment[];
  openProblems: number;
}

/** Cita asignada todavía sin OS (el auto no ha llegado o no se ha recibido). */
export interface MyWorkAppointment {
  id: string;
  startsAt: string;
  endsAt: string;
  bay: string | null;
  vehicle: MyWorkVehicle;
  services: string[];
  notes: string | null;
}

export interface MyWorkDay {
  /** Día mostrado y hoy en la zona del centro (YYYY-MM-DD). */
  day: string;
  today: string;
  technicianId: string;
  orders: MyWorkOrder[];
  appointments: MyWorkAppointment[];
}

export interface MyWorkPhotoCommand {
  order: Pick<MyWorkOrder, "id" | "organizationId" | "detailCenterId">;
  /** uuid del archivo (lo genera el cliente: un reintento no duplica). */
  fileId: string;
  file: Blob | ArrayBuffer;
  contentType: EvidenceMimeType;
  sizeBytes: number;
  width?: number | undefined;
  height?: number | undefined;
  kind: EvidenceKind;
  itemId?: string | undefined;
  incidentId?: string | undefined;
  note?: string | undefined;
}

export interface MyWorkActionResult {
  itemStatus: ItemWorkStatus;
  orderStatus: ServiceOrderStatus;
  /** La OS quedó terminada (era el último servicio). */
  orderFinished: boolean;
}

/** Usuario del centro que se puede ligar a un técnico de la agenda. */
export interface TechnicianUser {
  userId: string;
  fullName: string | null;
  role: AppRole;
  /** Técnico al que ya está ligado (null si ninguno). */
  technicianId: string | null;
}

/** Puerto de «Mi día». Web y móvil usan el mismo adaptador (`@meguiars/supabase`). */
export interface MyWorkRepository {
  get(detailCenterId: string, day?: string): Promise<Result<MyWorkDay>>;
  start(itemId: string): Promise<Result<MyWorkActionResult>>;
  done(itemId: string, note?: string): Promise<Result<MyWorkActionResult>>;
  comment(orderId: string, note: string, itemId?: string): Promise<Result<void>>;
  uploadPhoto(command: MyWorkPhotoCommand): Promise<Result<{ id: string }>>;
  reportProblem(orderId: string, description: string, itemId?: string): Promise<Result<{ id: string }>>;
  listTechnicianUsers(detailCenterId: string): Promise<Result<TechnicianUser[]>>;
  linkTechnicianUser(technicianId: string, userId: string | null, reason: string): Promise<Result<void>>;
}

// ---------------------------------------------------------------------------
// Presentación (misma en web y móvil)
// ---------------------------------------------------------------------------

export const MY_WORK_COPY = {
  title: "Mi día",
  today: "Hoy",
  tomorrow: "Mañana",
  refresh: "Actualizar",
  start: "Empezar",
  done: "Trabajo realizado",
  photoBefore: "Foto antes",
  photoAfter: "Foto después",
  comment: "Comentario",
  problem: "Reportar problema",
  emptyDay: "No tienes trabajos asignados para este día.",
  notLinked:
    "Tu usuario todavía no está ligado a un técnico de este centro. Pide al encargado que lo ligue en Agenda → Técnicos.",
  finished: "¡Listo! La orden quedó terminada; recepción la entrega al cliente.",
  waitingCar: "Cita: el auto aún no se recibe",
  instructions: "Indicaciones",
  photos: "Fotos",
  comments: "Comentarios",
  openProblems: "Problemas abiertos",
} as const;

export type MyWorkAction = "start" | "done";

/** Botón principal de un servicio: empezar, terminar o ninguno (ya terminado). */
export function nextActionOf(item: Pick<MyWorkItem, "status">): MyWorkAction | null {
  if (item.status === "terminada") return null;
  return item.status === "en_proceso" ? "done" : "start";
}

export function orderProgress(order: Pick<MyWorkOrder, "items">): { done: number; total: number } {
  return {
    done: order.items.filter((i) => i.status === "terminada").length,
    total: order.items.length,
  };
}

export type MyWorkOrderState = "por_empezar" | "trabajando" | "pausada" | "terminada";

export function orderStateOf(order: Pick<MyWorkOrder, "status">): MyWorkOrderState {
  switch (order.status) {
    case "en_proceso":
      return "trabajando";
    case "pausada":
      return "pausada";
    case "terminada":
    case "entregada":
      return "terminada";
    default:
      return "por_empezar";
  }
}

export const MY_WORK_STATE_LABELS: Record<MyWorkOrderState, string> = {
  por_empezar: "Por empezar",
  trabajando: "Trabajando",
  pausada: "Pausada",
  terminada: "Terminada",
};

export const MY_WORK_STATE_TONES: Record<MyWorkOrderState, StatusTone> = {
  por_empezar: "neutral",
  trabajando: "warning",
  pausada: "danger",
  terminada: "success",
};

/** Lo pendiente primero (trabajando, pausadas, por empezar) y lo terminado al final. */
export function sortOrders(orders: readonly MyWorkOrder[]): MyWorkOrder[] {
  const rank: Record<MyWorkOrderState, number> = { trabajando: 0, pausada: 1, por_empezar: 2, terminada: 3 };
  return [...orders].sort(
    (a, b) =>
      rank[orderStateOf(a)] - rank[orderStateOf(b)] ||
      a.scheduledAt.localeCompare(b.scheduledAt) ||
      a.folio.localeCompare(b.folio),
  );
}

/** Resumen del día para el encabezado: «3 por hacer · 1 terminada · 2 citas». */
export function myWorkSummary(day: Pick<MyWorkDay, "orders" | "appointments">): string {
  const finished = day.orders.filter((o) => orderStateOf(o) === "terminada").length;
  const pending = day.orders.length - finished;
  const parts = [`${pending} por hacer`, `${finished} ${finished === 1 ? "terminada" : "terminadas"}`];
  if (day.appointments.length > 0) {
    parts.push(`${day.appointments.length} ${day.appointments.length === 1 ? "cita" : "citas"}`);
  }
  return parts.join(" · ");
}

/** Hora a mostrar en la tarjeta: la prometida si hay, si no la programada. */
export function orderTimeLabel(
  order: Pick<MyWorkOrder, "scheduledAt" | "promisedAt">,
  timeZone: string,
): string {
  return order.promisedAt
    ? `Entrega ${formatTimeInCenterTimeZone(order.promisedAt, timeZone)}`
    : formatTimeInCenterTimeZone(order.scheduledAt, timeZone);
}

export function photosOf(order: Pick<MyWorkOrder, "photos">, kind: EvidenceKind): MyWorkPhoto[] {
  return order.photos.filter((p) => p.kind === kind);
}
