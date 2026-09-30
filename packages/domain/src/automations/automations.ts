import type { LeadSource } from "../commercial/commercial";
import type { Result } from "../result";

/**
 * CR2 (fase 4): automatizaciones comerciales. Espejo de
 * 20261026000000_commercial_automations.sql (schema-parity.test.ts compara las
 * listas). La acción de una automatización es una TAREA en la cola del CRM con
 * el mensaje sugerido: la plataforma no envía mensajes sola (escribir fuera de
 * la ventana de 24 h de WhatsApp exige plantillas aprobadas por Meta).
 */

export const AUTOMATION_TRIGGERS = [
  "prospecto_nuevo",
  "cotizacion_pendiente",
  "reserva_proxima",
  "servicio_entregado",
  "mantenimiento",
  "cliente_inactivo",
] as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];

export const AUTOMATION_PURPOSES = ["operativa", "promocional"] as const;
export type AutomationPurpose = (typeof AUTOMATION_PURPOSES)[number];

export const AUTOMATION_RUN_MODES = ["programada", "manual", "vista_previa"] as const;
export type AutomationRunMode = (typeof AUTOMATION_RUN_MODES)[number];

export const AUTOMATION_OUTCOMES = ["tarea_creada", "detenida"] as const;
export type AutomationOutcome = (typeof AUTOMATION_OUTCOMES)[number];

/** Motivos por los que un candidato no recibe acción en una corrida. */
export const AUTOMATION_SKIP_REASONS = [
  "sin_consentimiento",
  "sin_canal",
  "limite_frecuencia",
  "tope_corrida",
] as const;
export type AutomationSkipReason = (typeof AUTOMATION_SKIP_REASONS)[number];

/** Datos reales que puede llevar el mensaje sugerido (nunca precios ni promociones inventados). */
export const MESSAGE_PLACEHOLDERS = ["nombre", "servicio", "centro", "fecha", "folio"] as const;
export type MessagePlaceholder = (typeof MESSAGE_PLACEHOLDERS)[number];

/** Límites (espejo de los check de automations). */
export const AUTOMATION_LIMITS = {
  delayDays: { min: 0, max: 730 },
  dueInDays: { min: 0, max: 30 },
  cooldownDays: { min: 1, max: 365 },
  maxPerRun: { min: 1, max: 500 },
  messageLength: 1000,
} as const;

/** Mantenimiento y reactivación son promocionales: exigen consentimiento del canal. */
export function triggerPurpose(trigger: AutomationTrigger): AutomationPurpose {
  return trigger === "mantenimiento" || trigger === "cliente_inactivo" ? "promocional" : "operativa";
}

/** Condiciones que admite cada disparador. */
export function triggerAccepts(trigger: AutomationTrigger): { services: boolean; leadSources: boolean } {
  return {
    services: trigger !== "reserva_proxima" && trigger !== "cliente_inactivo",
    leadSources: trigger === "prospecto_nuevo",
  };
}

/** Marcadores desconocidos del mensaje ({precio}, {descuento}…). */
export function unknownPlaceholders(template: string): string[] {
  const found = [...template.matchAll(/\{([^}]*)\}/g)].map((m) => m[1] ?? "");
  return [...new Set(found.filter((p) => !(MESSAGE_PLACEHOLDERS as readonly string[]).includes(p)))];
}

/** Mensaje sugerido con datos reales (espejo de private.render_automation_message). */
export function renderAutomationMessage(
  template: string,
  data: {
    name?: string | null;
    service?: string | null;
    center?: string | null;
    date?: string | null;
    folio?: string | null;
  },
): string {
  const firstName = (data.name ?? "").trim().split(" ")[0] ?? "";
  const date = data.date ? data.date.split("-").reverse().join("/") : "";
  return template
    .replaceAll("{nombre}", firstName)
    .replaceAll("{servicio}", data.service ?? "tu servicio")
    .replaceAll("{centro}", data.center ?? "")
    .replaceAll("{fecha}", date)
    .replaceAll("{folio}", data.folio ?? "");
}

/** Plantillas editables sugeridas por disparador (sin precios ni promociones). */
export const AUTOMATION_PRESETS: Record<
  AutomationTrigger,
  { name: string; delayDays: number; dueInDays: number; cooldownDays: number; template: string }
> = {
  prospecto_nuevo: {
    name: "Nuevo prospecto: contactar hoy",
    delayDays: 0,
    dueInDays: 0,
    cooldownDays: 30,
    template: "Hola {nombre}, gracias por escribir a {centro}. ¿Te ayudo a cotizar tu servicio?",
  },
  cotizacion_pendiente: {
    name: "Recordar cotización sin respuesta",
    delayDays: 2,
    dueInDays: 0,
    cooldownDays: 30,
    template: "Hola {nombre}, ¿pudiste revisar la cotización {folio}? Vence el {fecha}.",
  },
  reserva_proxima: {
    name: "Confirmar cita",
    delayDays: 1,
    dueInDays: 0,
    cooldownDays: 7,
    template: "Hola {nombre}, te esperamos el {fecha} en {centro}. ¿Confirmas tu cita?",
  },
  servicio_entregado: {
    name: "Pedir valoración del servicio",
    delayDays: 1,
    dueInDays: 0,
    cooldownDays: 30,
    template: "Hola {nombre}, ¿cómo quedó tu {servicio}? Tu opinión nos ayuda mucho.",
  },
  mantenimiento: {
    name: "Recompra de mantenimiento",
    delayDays: 30,
    dueInDays: 1,
    cooldownDays: 30,
    template: "Hola {nombre}, ya toca tu {servicio} en {centro}. ¿Te agendo?",
  },
  cliente_inactivo: {
    name: "Reactivar clientes inactivos",
    delayDays: 180,
    dueInDays: 1,
    cooldownDays: 60,
    template: "Hola {nombre}, te extrañamos en {centro}. ¿Agendamos tu siguiente servicio?",
  },
};

export interface Automation {
  id: string;
  detailCenterId: string | null;
  centerName: string | null;
  name: string;
  trigger: AutomationTrigger;
  purpose: AutomationPurpose;
  delayDays: number;
  serviceIds: string[];
  serviceNames: string[];
  leadSources: LeadSource[];
  assignTo: string | null;
  assignToName: string | null;
  dueInDays: number;
  messageTemplate: string | null;
  cooldownDays: number;
  maxPerRun: number;
  contactFrom: string;
  contactTo: string;
  active: boolean;
  activatedAt: string | null;
  version: number;
  lastRunAt: string | null;
  lastRunMode: AutomationRunMode | null;
  lastRunCreated: number | null;
  lastRunError: string | null;
  tasksCreated: number;
  tasksPending: number;
  tasksDone: number;
  tasksStopped: number;
  canManage: boolean;
}

export interface AutomationRun {
  id: string;
  mode: AutomationRunMode;
  startedAt: string;
  finishedAt: string | null;
  evaluated: number;
  created: number;
  stopped: number;
  skipped: Partial<Record<AutomationSkipReason, number>>;
  error: string | null;
}

export interface AutomationExecution {
  id: string;
  createdAt: string;
  centerName: string;
  outcome: AutomationOutcome;
  detail: string | null;
  contactName: string | null;
  clientId: string | null;
  leadId: string | null;
  taskStatus: string | null;
  taskOutcome: string | null;
  taskDueOn: string | null;
  taskChannel: string | null;
  assignedToName: string | null;
}

export interface AutomationCommand {
  organizationId: string;
  id?: string | undefined;
  version?: number | undefined;
  detailCenterId?: string | undefined;
  name: string;
  trigger: AutomationTrigger;
  delayDays: number;
  serviceIds: string[];
  leadSources: LeadSource[];
  assignTo?: string | undefined;
  dueInDays: number;
  messageTemplate?: string | undefined;
  cooldownDays: number;
  maxPerRun: number;
  contactFrom: string;
  contactTo: string;
  reason: string;
}

export interface AutomationsRepository {
  list(organizationId: string): Promise<Result<Automation[]>>;
  save(command: AutomationCommand): Promise<Result<{ id: string }>>;
  setActive(id: string, version: number, active: boolean, reason: string): Promise<Result<void>>;
  /** Vista previa (no crea nada) o ejecución manual. */
  run(id: string, preview: boolean): Promise<Result<AutomationRun>>;
  runs(automationId: string, limit?: number): Promise<Result<AutomationRun[]>>;
  executions(automationId: string, limit?: number): Promise<Result<AutomationExecution[]>>;
}

/** Resumen legible de lo omitido en una corrida. */
export function skippedTotal(run: Pick<AutomationRun, "skipped">): number {
  return Object.values(run.skipped).reduce((a, b) => a + (b ?? 0), 0);
}
