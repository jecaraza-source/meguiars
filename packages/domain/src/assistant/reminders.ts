import type { WhatsappTemplate } from "../inbox";
import type { Result } from "../result";

/**
 * Recordatorios de cita por WhatsApp (asistente F2, parte 2). La base decide
 * qué citas tocan y deja cada recordatorio «pendiente» (public.reminders_due y
 * public.prepare_appointment_reminder); aquí sólo se envían con el token de
 * Meta del servidor y se registra el resultado. Espejo de private.reminder_rules.
 */
export const REMINDER_RULES = {
  /** Datos de la plantilla: {{1}} nombre, {{2}} fecha y hora, {{3}} centro. */
  paramCount: 3,
  /** Botones de respuesta rápida: Confirmar y Reagendar (en ese orden). */
  quickReplies: 2,
  /** Citas agendadas con menos anticipación no reciben recordatorio. */
  minNoticeHours: 12,
  /** No se envía si faltan menos de estas horas para la cita. */
  minLeadHours: 2,
  /** Horas antes de la cita (configurable por organización). */
  hours: { min: 2, max: 72, default: 24 },
} as const;

/** Texto sugerido para crear la plantilla en WhatsApp Manager (categoría Utilidad). */
export const REMINDER_TEMPLATE_EXAMPLE = {
  name: "recordatorio_cita",
  category: "UTILITY",
  body: "Hola {{1}}, le recordamos su cita el {{2}} en {{3}}. ¿Nos confirma su asistencia?",
  buttons: ["Confirmar", "Reagendar"],
} as const;

/** Por qué una plantilla no sirve de recordatorio (vacío = sirve). */
export function reminderTemplateIssues(t: WhatsappTemplate): string[] {
  const issues: string[] = [];
  if (t.status !== "APPROVED") issues.push("no está aprobada por Meta");
  if (t.category !== "UTILITY") issues.push("no es de utilidad");
  if (t.paramCount !== REMINDER_RULES.paramCount) issues.push(`necesita ${REMINDER_RULES.paramCount} datos`);
  if (t.quickReplyCount !== REMINDER_RULES.quickReplies)
    issues.push(`necesita ${REMINDER_RULES.quickReplies} botones de respuesta rápida`);
  return issues;
}

/** Recordatorio preparado por la base, listo para enviarse. */
export interface PreparedReminder {
  messageId: string;
  externalAccountId: string;
  contactExternalId: string;
  contactPhone: string | null;
  body: string;
  alreadySent: boolean;
  templateName: string;
  templateLanguage: string;
  templateParams: string[];
  buttonPayloads: string[];
}

export interface ReminderGateway {
  due(limit: number): Promise<Result<string[]>>;
  /** null = la cita ya no tiene recordatorio válido (configuración incompleta): queda marcada sin enviar. */
  prepare(appointmentId: string): Promise<Result<PreparedReminder | null>>;
  finishOutbound(
    messageId: string,
    result: { ok: true; externalId: string } | { ok: false; error: string },
  ): Promise<Result<void>>;
}

export interface ReminderSender {
  send(reminder: PreparedReminder): Promise<{ ok: true; externalId: string } | { ok: false; error: string }>;
}

export interface ReminderRun {
  due: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
}

/**
 * Envía los recordatorios pendientes. Un error en una cita no detiene a las
 * demás; un envío fallido no se reintenta (la base ya marcó la cita).
 */
export async function runReminders(
  deps: { gateway: ReminderGateway; sender: ReminderSender },
  limit = 50,
): Promise<ReminderRun> {
  const run: ReminderRun = { due: 0, sent: 0, failed: 0, skipped: 0, errors: [] };
  const due = await deps.gateway.due(limit);
  if (!due.ok) {
    run.errors.push(due.error.message);
    return run;
  }
  run.due = due.data.length;
  for (const id of due.data) {
    const prepared = await deps.gateway.prepare(id);
    if (!prepared.ok) {
      run.failed += 1;
      run.errors.push(`${id}: ${prepared.error.message}`);
      continue;
    }
    const r = prepared.data;
    if (!r || r.alreadySent) {
      run.skipped += 1;
      continue;
    }
    const sent = await deps.sender.send(r);
    const done = await deps.gateway.finishOutbound(r.messageId, sent);
    if (sent.ok) run.sent += 1;
    else {
      run.failed += 1;
      run.errors.push(`${id}: ${sent.error}`);
    }
    if (!done.ok) run.errors.push(`${id}: ${done.error.message}`);
  }
  return run;
}

// ---------------------------------------------------------------------------
// Aviso de membresía (ADR 0049): a quien tiene servicios incluidos sin usar y
// no ha venido en N días. Espejo de private.membership_reminder_rules. Se envía
// con el mismo runReminders y otro gateway (membresías en lugar de citas).
// ---------------------------------------------------------------------------

export const MEMBERSHIP_REMINDER_RULES = {
  /** Datos de la plantilla: {{1}} nombre, {{2}} servicios disponibles («2 Lavado»). */
  paramCount: 2,
  /** Sin botones: si el cliente responde, lo atiende el asistente. */
  quickReplies: 0,
  /** Días sin visita ni uso antes del aviso (y entre un aviso y otro). */
  days: { min: 7, max: 60, default: 14 },
  /** Sólo se envía entre estas horas del centro. */
  fromHour: 10,
  toHour: 19,
} as const;

export const MEMBERSHIP_REMINDER_TEMPLATE_EXAMPLE = {
  name: "aviso_membresia",
  category: "MARKETING",
  body: "Hola {{1}}, su membresía de Meguiar's incluye {{2}} disponibles este periodo. ¿Le agendamos una visita? Responda a este mensaje.",
} as const;

/** Por qué una plantilla no sirve para el aviso de membresía (vacío = sirve). */
export function membershipReminderTemplateIssues(t: WhatsappTemplate): string[] {
  const issues: string[] = [];
  if (t.status !== "APPROVED") issues.push("no está aprobada por Meta");
  if (t.category !== "UTILITY" && t.category !== "MARKETING")
    issues.push("no es de utilidad ni de marketing");
  if (t.paramCount !== MEMBERSHIP_REMINDER_RULES.paramCount)
    issues.push(`necesita ${MEMBERSHIP_REMINDER_RULES.paramCount} datos`);
  if (t.quickReplyCount !== MEMBERSHIP_REMINDER_RULES.quickReplies) issues.push("no debe llevar botones");
  return issues;
}

/** Configuración del aviso de membresía (public.get_membership_reminder_settings). */
export interface MembershipReminderSettings {
  enabled: boolean;
  templateId: string | null;
  days: number;
  sentLast30Days: number;
  version: number;
  canManage: boolean;
}

export interface SetMembershipRemindersCommand {
  organizationId: string;
  version: number;
  enabled: boolean;
  templateId: string | null;
  days: number;
  reason: string;
}

/** Texto para quien no administra (web y móvil). */
export function membershipReminderStatus(s: MembershipReminderSettings): string {
  return s.enabled
    ? `Encendido: a quien tiene servicios sin usar y no viene en ${s.days} días (máx. uno cada ${s.days} días). ${s.sentLast30Days} enviados en 30 días.`
    : "Apagado.";
}
