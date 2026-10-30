import type { StatusTone } from "../agenda/copy";
import type { MembershipReminderSettings, SetMembershipRemindersCommand } from "./reminders";
import type { Result } from "../result";

/**
 * Asistente de WhatsApp (F0/F1). Espejo de la migración
 * 20261028000000_whatsapp_assistant.sql: un número central atendido por un
 * asistente con IA que SÓLO informa con datos de la plataforma (catálogo,
 * promociones preautorizadas, horarios del centro y disponibilidad real). No
 * agenda ni cotiza: cuando el cliente quiere una cita, pasa la conversación a
 * una persona con un resumen. La llave de la API vive sólo en el servidor.
 */

export const ASSISTANT_MODES = ["apagado", "prueba", "activo"] as const;
export type AssistantMode = (typeof ASSISTANT_MODES)[number];

/** Modelos permitidos (los elige el admin; el costo cambia por modelo). */
export const ASSISTANT_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"] as const;
export type AssistantModel = (typeof ASSISTANT_MODELS)[number];

/**
 * Precio público por millón de tokens (USD) para estimar el costo en pantalla.
 * Fuente: tabla de modelos de Anthropic (octubre 2026). Es una estimación: la
 * factura real es la de la consola de Anthropic.
 */
export const ASSISTANT_MODEL_INFO: Record<
  AssistantModel,
  { label: string; input: number; output: number; cacheRead: number; cacheWrite: number; note: string }
> = {
  "claude-opus-5-5": {
    label: "Claude Opus 5.5",
    input: 4,
    output: 20,
    cacheRead: 0.2,
    cacheWrite: 5,
    note: "El más capaz: el que mejor respeta las reglas. Recomendado para empezar.",
  },
  "claude-sonnet-5-5": {
    label: "Claude Sonnet 5.5",
    input: 2,
    output: 10,
    cacheRead: 0.2,
    cacheWrite: 2.5,
    note: "Más económico; úsalo si pasa las mismas pruebas.",
  },
  "claude-haiku-5-5": {
    label: "Claude Haiku 5.5",
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite: 0.125,
    note: "El más barato; sólo si las pruebas lo confirman.",
  },
};

export const CENTER_CHOICES = ["colonia", "lista"] as const;
export type CenterChoice = (typeof CENTER_CHOICES)[number];

/** Motivos para pasar la conversación a una persona. */
export const HANDOFF_CODES = [
  "pide_persona",
  "agendar",
  "queja",
  "descuento",
  "b2b",
  "fotos",
  "requiere_valoracion",
  "garantia",
  "no_entiende",
  "falla_tecnica",
] as const;
export type HandoffCode = (typeof HANDOFF_CODES)[number];

/** No se pueden desactivar: pedir una persona, confirmar citas (F1) y fallas técnicas. */
export const REQUIRED_HANDOFF_CODES: readonly HandoffCode[] = ["pide_persona", "agendar", "falla_tecnica"];

/** Motivos que el modelo puede elegir (la falla técnica la decide el servidor). */
export const MODEL_HANDOFF_CODES = HANDOFF_CODES.filter((c) => c !== "falla_tecnica");

export const TURN_STATUSES = ["procesando", "respondido", "escalado", "omitido", "error"] as const;
export type TurnStatus = (typeof TURN_STATUSES)[number];

export const BOT_STATUSES = ["activo", "pausado"] as const;
export type BotStatus = (typeof BOT_STATUSES)[number];

/** Límites (espejo de los CHECK de bot_settings). */
export const ASSISTANT_LIMITS = {
  maxDaysAhead: { min: 1, max: 60 },
  minHoursAhead: { min: 0, max: 72 },
  testNumbers: 20,
  /** Días de horarios libres que el asistente consulta a la vez. */
  slotDays: 5,
  /** Rondas de herramientas por mensaje antes de pasar a una persona. */
  toolRounds: 6,
} as const;

export const WEEKDAY_LABELS = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
] as const;

export interface AssistantSettings {
  mode: AssistantMode;
  model: AssistantModel;
  assistantName: string;
  tone: string;
  greeting: string | null;
  privacyUrl: string | null;
  humanHours: string | null;
  afterHoursMessage: string | null;
  centerChoice: CenterChoice;
  maxDaysAhead: number;
  minHoursAhead: number;
  mentionPromotions: boolean;
  mentionMemberships: boolean;
  /** El asistente agenda, reprograma y cancela citas con el botón de confirmación del cliente. */
  selfBooking: boolean;
  /** Recordatorio de cita por WhatsApp (plantilla con botones Confirmar/Reagendar). */
  remindersEnabled: boolean;
  reminderTemplateId: string | null;
  reminderHours: number;
  testNumbers: string[];
  version: number;
  updatedAt: string | null;
  canManage: boolean;
}

export interface AssistantFaq {
  id: string;
  detailCenterId: string | null;
  centerName: string | null;
  question: string;
  answer: string;
  position: number;
  active: boolean;
  version: number;
}

export interface HandoffRule {
  code: HandoffCode;
  label: string;
  active: boolean;
  required: boolean;
  assignTo: string | null;
  assignToName: string | null;
  message: string | null;
  defaultMessage: string;
  version: number;
}

export interface AssistantService {
  serviceId: string;
  code: string;
  name: string;
  revenueEngine: string;
  basePrice: number;
  durationMinutes: number;
  active: boolean;
  visible: boolean;
  bookable: boolean;
  priceVariesBySize: boolean;
}

export interface CenterHours {
  /** ISO: 1 = lunes … 7 = domingo. */
  weekday: number;
  opens: string;
  closes: string;
}

export interface CenterPublicInfo {
  detailCenterId: string;
  code: string;
  name: string;
  timezone: string;
  active: boolean;
  address: string | null;
  phone: string | null;
  mapsUrl: string | null;
  directions: string | null;
  nearbyZones: string[];
  handoffUserId: string | null;
  handoffUserName: string | null;
  hours: CenterHours[];
  /** null: el centro aún no tiene datos públicos guardados. */
  version: number | null;
  canEdit: boolean;
}

export interface ConversationAssistantState {
  botStatus: BotStatus;
  pausedReason: string | null;
  pausedAt: string | null;
  marketingOptOutAt: string | null;
  mode: AssistantMode;
  turns: number;
  lastTurnStatus: TurnStatus | null;
  lastTurnAt: string | null;
}

export interface AssistantCenterMetrics {
  detailCenterId: string;
  conversations: number;
  turns: number;
  answered: number;
  handedOff: number;
  skipped: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  handoffs: Partial<Record<HandoffCode, number>>;
}

export interface UpdateAssistantSettingsCommand {
  organizationId: string;
  version: number;
  mode: AssistantMode;
  model: AssistantModel;
  assistantName: string;
  tone: string;
  greeting: string | null;
  privacyUrl: string | null;
  humanHours: string | null;
  afterHoursMessage: string | null;
  centerChoice: CenterChoice;
  maxDaysAhead: number;
  minHoursAhead: number;
  mentionPromotions: boolean;
  mentionMemberships: boolean;
  selfBooking: boolean;
  testNumbers: string[];
  reason: string;
}

export interface SetAssistantRemindersCommand {
  organizationId: string;
  version: number;
  enabled: boolean;
  templateId: string | null;
  hours: number;
  reason: string;
}

export interface UpsertAssistantFaqCommand {
  organizationId: string;
  id: string | null;
  version: number | null;
  detailCenterId: string | null;
  question: string;
  answer: string;
  position: number;
  active: boolean;
  reason: string;
}

export interface SetHandoffRuleCommand {
  organizationId: string;
  code: HandoffCode;
  version: number;
  active: boolean;
  assignTo: string | null;
  message: string | null;
  reason: string;
}

export interface SetAssistantServiceCommand {
  organizationId: string;
  serviceId: string;
  visible: boolean;
  bookable: boolean;
  priceVariesBySize: boolean;
  reason: string;
}

export interface SetCenterPublicInfoCommand {
  detailCenterId: string;
  version: number | null;
  address: string | null;
  phone: string | null;
  mapsUrl: string | null;
  directions: string | null;
  nearbyZones: string[];
  handoffUserId: string | null;
  hours: CenterHours[];
  reason: string;
}

export interface AssistantRepository {
  settings(organizationId: string): Promise<Result<AssistantSettings | null>>;
  updateSettings(command: UpdateAssistantSettingsCommand): Promise<Result<void>>;
  setReminders(command: SetAssistantRemindersCommand): Promise<Result<void>>;
  membershipReminders(organizationId: string): Promise<Result<MembershipReminderSettings | null>>;
  setMembershipReminders(command: SetMembershipRemindersCommand): Promise<Result<void>>;
  faqs(organizationId: string): Promise<Result<AssistantFaq[]>>;
  upsertFaq(command: UpsertAssistantFaqCommand): Promise<Result<void>>;
  deleteFaq(organizationId: string, id: string, reason: string): Promise<Result<void>>;
  handoffRules(organizationId: string): Promise<Result<HandoffRule[]>>;
  setHandoffRule(command: SetHandoffRuleCommand): Promise<Result<void>>;
  services(organizationId: string): Promise<Result<AssistantService[]>>;
  setService(command: SetAssistantServiceCommand): Promise<Result<void>>;
  centers(organizationId: string): Promise<Result<CenterPublicInfo[]>>;
  setCenterInfo(command: SetCenterPublicInfoCommand): Promise<Result<void>>;
  conversationState(conversationId: string): Promise<Result<ConversationAssistantState | null>>;
  setConversationActive(conversationId: string, active: boolean): Promise<Result<void>>;
  metrics(centerIds: string[], from: string, to: string): Promise<Result<AssistantCenterMetrics[]>>;
}

// ---------------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------------

export const ASSISTANT_COPY = {
  title: "Asistente de WhatsApp",
  description:
    "Atiende el número central de WhatsApp con IA usando sólo los datos de la plataforma: precios del catálogo, promociones autorizadas, horarios y disponibilidad. Propone citas que el cliente confirma con un botón; lo que no puede resolver lo pasa a una persona.",
  modes: {
    apagado: "Apagado: no responde",
    prueba: "Prueba: sólo responde a los números de prueba",
    activo: "Activo: responde a todos los clientes",
  } satisfies Record<AssistantMode, string>,
  centerChoices: {
    colonia: "Pregunta la colonia y sugiere el centro más cercano",
    lista: "Muestra la lista de centros",
  } satisfies Record<CenterChoice, string>,
  turnStatuses: {
    procesando: "Procesando",
    respondido: "Respondió",
    escalado: "Pasó a una persona",
    omitido: "Omitido",
    error: "Error",
  } satisfies Record<TurnStatus, string>,
  botStatuses: { activo: "Asistente activo", pausado: "Asistente pausado" } satisfies Record<
    BotStatus,
    string
  >,
  missingKey:
    "Falta ANTHROPIC_API_KEY en el servidor: el asistente no responde aunque esté en prueba o activo.",
  noMeta: "WhatsApp aún no está conectado (Integraciones): el asistente no recibe mensajes.",
  onlyAdmin: "Sólo el admin de la organización cambia la configuración del asistente.",
  /** Cómo se agendan las citas según el ajuste «agenda propia». */
  bookingNote: {
    on: "Citas: el asistente propone la cita y el cliente la confirma con el botón «Confirmar»; la base valida el horario y la asigna a una bahía libre. También reprograma y cancela con confirmación del cliente.",
    off: "Citas: el asistente muestra horarios libres y pasa la conversación a una persona para agendar.",
  },
  costNote:
    "Costo estimado con el precio público por millón de tokens del modelo; la factura real está en la consola de Anthropic.",
  label: "Asistente",
} as const;

/** Modo del asistente: activo en verde, prueba en ámbar, apagado en rojo. */
export const ASSISTANT_MODE_TONES: Record<AssistantMode, StatusTone> = {
  activo: "success",
  prueba: "warning",
  apagado: "danger",
};

/**
 * Estado real del asistente en una conversación: aunque la conversación lo
 * tenga activo, si el asistente está apagado en la configuración no responde.
 */
export function conversationAssistantBadge(
  botStatus: BotStatus,
  mode: AssistantMode,
): { label: string; tone: StatusTone } {
  if (mode === "apagado") return { label: "Asistente apagado", tone: "danger" };
  if (botStatus === "pausado") return { label: ASSISTANT_COPY.botStatuses.pausado, tone: "danger" };
  if (mode === "prueba") return { label: "Asistente en prueba", tone: "warning" };
  return { label: ASSISTANT_COPY.botStatuses.activo, tone: "success" };
}

export const HANDOFF_LABELS: Record<HandoffCode, string> = {
  pide_persona: "El cliente pidió hablar con una persona",
  agendar: "Quiere agendar una cita",
  queja: "Queja o cliente molesto",
  descuento: "Pide un descuento fuera de las promociones",
  b2b: "Empresa o flotilla",
  fotos: "Envió fotos o pide valoración",
  requiere_valoracion: "Servicio que requiere valoración previa",
  garantia: "Garantía o servicio ya realizado",
  no_entiende: "El asistente no entendió la solicitud",
  falla_tecnica: "Falla técnica del asistente",
};

/** Costo estimado (USD) de un consumo de tokens con el precio público del modelo. */
export function estimateAssistantCost(
  model: AssistantModel,
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number },
): number {
  const p = ASSISTANT_MODEL_INFO[model];
  const usd =
    (usage.input * p.input +
      usage.output * p.output +
      usage.cacheRead * p.cacheRead +
      usage.cacheWrite * p.cacheWrite) /
    1_000_000;
  return Math.round(usd * 10000) / 10000;
}

/** Normaliza un celular de prueba a sólo dígitos (10 a 15). */
export function normalizeTestNumber(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return /^[0-9]{10,15}$/.test(digits) ? digits : null;
}

/** «lun-vie 08:00-19:00 · sáb 09:00-14:00 · dom cerrado» a partir del horario por día. */
export function formatCenterHours(hours: readonly CenterHours[]): string {
  if (hours.length === 0) return "Sin horario registrado";
  const byDay = new Map(hours.map((h) => [h.weekday, `${h.opens}-${h.closes}`]));
  const parts: string[] = [];
  let start = 1;
  for (let d = 1; d <= 8; d++) {
    const prev = byDay.get(d - 1) ?? "cerrado";
    const cur = d <= 7 ? (byDay.get(d) ?? "cerrado") : null;
    if (d > 1 && cur !== prev) {
      const label =
        start === d - 1
          ? WEEKDAY_LABELS[start - 1]!.slice(0, 3)
          : `${WEEKDAY_LABELS[start - 1]!.slice(0, 3)}-${WEEKDAY_LABELS[d - 2]!.slice(0, 3)}`;
      parts.push(`${label} ${prev}`);
      start = d;
    }
  }
  return parts.join(" · ");
}
