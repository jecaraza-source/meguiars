import type { Result } from "../result";
import type { ServiceOrderStatus } from "../orders/order";

/** Estatus de ejecución de una línea. Coincide con `public.item_work_status`. */
export const ITEM_WORK_STATUSES = ["pendiente", "en_proceso", "pausada", "terminada"] as const;
export type ItemWorkStatus = (typeof ITEM_WORK_STATUSES)[number];

/**
 * Transiciones de una línea (espejo de private.item_work_transition_allowed;
 * schema-parity.test.ts compara ambas definiciones).
 */
export const ITEM_WORK_TRANSITIONS: Record<ItemWorkStatus, readonly ItemWorkStatus[]> = {
  pendiente: ["en_proceso"],
  en_proceso: ["pausada", "terminada"],
  pausada: ["en_proceso", "terminada"],
  terminada: [],
};

export const canTransitionItemWork = (from: ItemWorkStatus, to: ItemWorkStatus): boolean =>
  ITEM_WORK_TRANSITIONS[from].includes(to);

/** Las líneas se trabajan sólo con la OS en proceso. */
export const canWorkItems = (orderStatus: ServiceOrderStatus): boolean => orderStatus === "en_proceso";

/** Evidencia, incidencias y personal: mientras la OS no esté cerrada. */
export const canAddEvidence = (orderStatus: ServiceOrderStatus): boolean =>
  orderStatus !== "cancelada" && orderStatus !== "entregada";

/** Consumos: durante o al terminar el servicio. */
export const canRecordConsumption = (orderStatus: ServiceOrderStatus): boolean =>
  orderStatus === "en_proceso" || orderStatus === "pausada" || orderStatus === "terminada";

export const EVIDENCE_KINDS = ["antes", "durante", "despues", "incidencia"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const INCIDENT_KINDS = ["incidencia", "retrabajo"] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];

/** Unidades de insumo (espejo del check de inventory_items.unit). */
export const INVENTORY_UNITS = ["ml", "l", "g", "kg", "pza"] as const;
export type InventoryUnit = (typeof INVENTORY_UNITS)[number];

export const EXECUTION_EVENT_KINDS = [
  "os_inicio",
  "os_pausa",
  "os_reanudacion",
  "os_fin",
  "linea_inicio",
  "linea_pausa",
  "linea_reanudacion",
  "linea_fin",
  "personal",
  "evidencia",
  "evidencia_eliminada",
  "consumo",
  "incidencia",
  "incidencia_resuelta",
] as const;
export type ExecutionEventKind = (typeof EXECUTION_EVENT_KINDS)[number];

// ---------------------------------------------------------------------------
// Fotos: límites y redimensionado (mismas reglas en web y móvil)
// ---------------------------------------------------------------------------

export const EVIDENCE_BUCKET = "service-order-evidence";
/** Límite del bucket (5 MiB). */
export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export const EVIDENCE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type EvidenceMimeType = (typeof EVIDENCE_MIME_TYPES)[number];
/** Lado mayor tras redimensionar: suficiente para ver detalle de pintura. */
export const EVIDENCE_MAX_DIMENSION = 1600;
/** Calidad JPEG al comprimir (0–1). */
export const EVIDENCE_JPEG_QUALITY = 0.7;

/** Tamaño destino conservando la proporción; nunca amplía. */
export function targetImageSize(
  width: number,
  height: number,
  max: number = EVIDENCE_MAX_DIMENSION,
): { width: number; height: number; resized: boolean } {
  if (width <= 0 || height <= 0) return { width, height, resized: false };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale), resized: scale < 1 };
}

const EXTENSIONS: Record<EvidenceMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Ruta privada de la foto en Storage: <org>/<centro>/<OS>/<uuid>.<ext>. Las
 * políticas de Storage leen la organización, el centro y la OS de esta ruta.
 */
export function evidencePath(
  order: { organizationId: string; detailCenterId: string; id: string },
  fileId: string,
  contentType: EvidenceMimeType,
): string {
  return `${order.organizationId}/${order.detailCenterId}/${order.id}/${fileId}.${EXTENSIONS[contentType]}`;
}

// ---------------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------------

export interface SupplyStandard {
  inventoryItemId: string;
  code: string;
  name: string;
  unit: InventoryUnit;
  /** Cantidad estándar por unidad del servicio. */
  quantity: number;
}

export interface ExecutionLine {
  id: string;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  quantity: number;
  workStatus: ItemWorkStatus;
  startedAt: string | null;
  finishedAt: string | null;
  workStartedAt: string | null;
  workedMinutes: number;
  technicianId: string | null;
  /** Insumos configurados para el servicio (vacío = sin control de consumo). */
  standards: SupplyStandard[];
}

export interface ExecutionEvent {
  id: number;
  kind: ExecutionEventKind;
  itemId: string | null;
  technicianId: string | null;
  note: string | null;
  actorId: string | null;
  occurredAt: string;
}

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  itemId: string | null;
  incidentId: string | null;
  storagePath: string;
  contentType: EvidenceMimeType;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  note: string | null;
  createdAt: string;
  /** URL firmada de corta duración (nunca pública). */
  signedUrl: string | null;
}

export interface Consumption {
  id: string;
  itemId: string;
  inventoryItemId: string;
  inventoryName: string;
  unit: InventoryUnit;
  standardQuantity: number;
  actualQuantity: number;
  unitCost: number;
  note: string | null;
}

export interface Incident {
  id: string;
  kind: IncidentKind;
  itemId: string | null;
  description: string;
  status: "abierta" | "resuelta";
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface OrderExecution {
  orderId: string;
  lines: ExecutionLine[];
  staffIds: string[];
  events: ExecutionEvent[];
  evidence: Evidence[];
  consumptions: Consumption[];
  incidents: Incident[];
}

export interface InventoryItem {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  unit: InventoryUnit;
  unitCost: number;
  active: boolean;
}

export interface SetItemWorkCommand {
  itemId: string;
  status: Exclude<ItemWorkStatus, "pendiente">;
  technicianId?: string | undefined;
  note?: string | undefined;
}

export interface UploadEvidenceCommand {
  order: { organizationId: string; detailCenterId: string; id: string };
  /** uuid del archivo (el cliente lo genera: reintentos no duplican). */
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

export interface RecordConsumptionCommand {
  itemId: string;
  inventoryItemId: string;
  actualQuantity: number;
  note?: string | undefined;
}

export interface ReportIncidentCommand {
  orderId: string;
  kind: IncidentKind;
  description: string;
  itemId?: string | undefined;
}

export interface UpsertInventoryItemCommand {
  organizationId: string;
  id?: string | undefined;
  code: string;
  name: string;
  unit: InventoryUnit;
  unitCost: number;
  active: boolean;
  reason: string;
}

export interface SetSupplyStandardCommand {
  serviceId: string;
  inventoryItemId: string;
  /** undefined = quitar el insumo del servicio. */
  quantity?: number | undefined;
  reason: string;
}

/** Puerto de ejecución y evidencias. Web y móvil usan el mismo adaptador (`@meguiars/supabase`). */
export interface ExecutionRepository {
  get(orderId: string): Promise<Result<OrderExecution>>;
  setItemWork(command: SetItemWorkCommand): Promise<Result<{ id: string; workStatus: ItemWorkStatus }>>;
  setStaff(orderId: string, technicianIds: string[]): Promise<Result<string[]>>;
  uploadEvidence(command: UploadEvidenceCommand): Promise<Result<{ id: string }>>;
  removeEvidence(evidenceId: string, reason: string): Promise<Result<void>>;
  recordConsumption(command: RecordConsumptionCommand): Promise<Result<{ id: string }>>;
  reportIncident(command: ReportIncidentCommand): Promise<Result<{ id: string }>>;
  resolveIncident(incidentId: string, resolution: string): Promise<Result<void>>;
  listInventory(organizationId: string): Promise<Result<InventoryItem[]>>;
  upsertInventoryItem(command: UpsertInventoryItemCommand): Promise<Result<InventoryItem>>;
  listStandards(serviceId: string): Promise<Result<SupplyStandard[]>>;
  setSupplyStandard(command: SetSupplyStandardCommand): Promise<Result<void>>;
}

// ---------------------------------------------------------------------------
// Reglas y cálculos
// ---------------------------------------------------------------------------

/** Minutos trabajados de una línea, incluido el tramo en curso; nunca negativos. */
export function lineWorkedMinutes(
  line: Pick<ExecutionLine, "workedMinutes" | "workStartedAt">,
  now = new Date(),
): number {
  const running = line.workStartedAt
    ? Math.max(0, Math.floor((now.getTime() - new Date(line.workStartedAt).getTime()) / 60000))
    : 0;
  return Math.max(0, line.workedMinutes) + running;
}

/**
 * Variación de consumo (definición única): real − estándar, su % sobre el
 * estándar y su costo. Estándar 0 → porcentaje 0.
 */
export function consumptionVariance(
  c: Pick<Consumption, "standardQuantity" | "actualQuantity" | "unitCost">,
) {
  const quantity = Math.round((c.actualQuantity - c.standardQuantity) * 1000) / 1000;
  const percent = c.standardQuantity > 0 ? Math.round((quantity / c.standardQuantity) * 1000) / 10 : 0;
  const cost = Math.round(quantity * c.unitCost * 100) / 100;
  const actualCost = Math.round(c.actualQuantity * c.unitCost * 100) / 100;
  return { quantity, percent, cost, actualCost };
}

/** Estándar esperado de una línea: cantidad estándar × cantidad vendida. */
export const expectedQuantity = (standard: SupplyStandard, lineQuantity: number) =>
  Math.round(standard.quantity * lineQuantity * 1000) / 1000;
