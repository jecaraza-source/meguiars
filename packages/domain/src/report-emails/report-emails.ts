import type { Result } from "../result";
import type { DashboardFactsRow } from "../dashboards/dashboards";
import { addDays } from "../agenda/zoned-time";
import { corporatePeriodLabel } from "../corporate/presenter";

/**
 * Dirección → Reportes por correo. Espejo de la migración
 * 20261101000000_report_emails.sql. El admin corporativo programa el envío del
 * Tablero corporativo a Dirección; un cron diario manda el último periodo
 * cerrado de cada programación que aún no se haya enviado (ADR 0041). No hay
 * correos a clientes.
 */

export const REPORT_FREQUENCIES = ["diario", "semanal", "quincenal", "mensual"] as const;
export type ReportFrequency = (typeof REPORT_FREQUENCIES)[number];

export const REPORT_FREQUENCY_LABELS: Record<ReportFrequency, string> = {
  diario: "Diario",
  semanal: "Semanal",
  quincenal: "Quincenal",
  mensual: "Mensual",
};

/** Cuándo llega y qué periodo cubre. */
export const REPORT_FREQUENCY_HINTS: Record<ReportFrequency, string> = {
  diario: "Cada mañana, con el día anterior",
  semanal: "Los lunes, con la semana anterior (lunes a domingo)",
  quincenal: "Los días 1 y 16, con la quincena que cerró (1–15 o 16–fin de mes)",
  mensual: "El día 1, con el mes anterior",
};

/** Máximo de destinatarios por programación (igual que la base). */
export const MAX_REPORT_RECIPIENTS = 20;

export interface ReportPeriod {
  from: string;
  to: string;
}

export interface ReportSubscription {
  id: string;
  organizationId: string;
  name: string;
  frequency: ReportFrequency;
  /** null = todos los centros activos de la organización. */
  centerIds: string[] | null;
  recipients: string[];
  active: boolean;
  version: number;
  /** Autor: el envío automático lee los hechos con sus permisos. */
  createdBy: string | null;
  updatedAt: string;
}

export interface ReportSubscriptionInput {
  organizationId: string;
  id: string | null;
  version: number | null;
  name: string;
  frequency: ReportFrequency;
  centerIds: string[] | null;
  recipients: string[];
  active: boolean;
  reason: string;
}

export type ReportDeliverySource = "cron" | "manual";
export type ReportDeliveryStatus = "enviado" | "fallido";

export interface ReportDelivery {
  id: string;
  organizationId: string;
  subscriptionId: string | null;
  subscriptionName: string;
  frequency: ReportFrequency;
  source: ReportDeliverySource;
  periodFrom: string;
  periodTo: string;
  recipients: string[];
  status: ReportDeliveryStatus;
  providerMessageId: string | null;
  error: string | null;
  requestedBy: string | null;
  createdAt: string;
}

export interface ReportDeliveryInput {
  subscriptionId: string;
  source: ReportDeliverySource;
  period: ReportPeriod;
  status: ReportDeliveryStatus;
  providerMessageId: string | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Periodos
// ---------------------------------------------------------------------------

const lastDayOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const ymd = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const parts = (date: string) => date.split("-").map(Number) as [number, number, number];
const previousMonth = (year: number, month: number): [number, number] =>
  month === 1 ? [year - 1, 12] : [year, month - 1];

function wholeMonth(year: number, month: number): ReportPeriod {
  return { from: ymd(year, month, 1), to: ymd(year, month, lastDayOfMonth(year, month)) };
}

/**
 * Último periodo CERRADO al día `today` (fecha local del centro). El cron lo
 * envía si aún no se envió, así que si un día no corre se recupera al
 * siguiente.
 */
export function reportPeriod(frequency: ReportFrequency, today: string): ReportPeriod {
  const [year, month, day] = parts(today);
  switch (frequency) {
    case "diario": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "semanal": {
      // Domingo anterior (si hoy es domingo, el de la semana pasada).
      const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
      const to = addDays(today, -(dow === 0 ? 7 : dow));
      return { from: addDays(to, -6), to };
    }
    case "quincenal": {
      if (day >= 16) return { from: ymd(year, month, 1), to: ymd(year, month, 15) };
      const [py, pm] = previousMonth(year, month);
      return { from: ymd(py, pm, 16), to: ymd(py, pm, lastDayOfMonth(py, pm)) };
    }
    case "mensual": {
      const [py, pm] = previousMonth(year, month);
      return wholeMonth(py, pm);
    }
  }
}

/** Periodo anterior equivalente, contra el que se compara cada cifra. */
export function previousReportPeriod(frequency: ReportFrequency, period: ReportPeriod): ReportPeriod {
  const [year, month, day] = parts(period.from);
  switch (frequency) {
    case "diario": {
      const d = addDays(period.from, -1);
      return { from: d, to: d };
    }
    case "semanal":
      return { from: addDays(period.from, -7), to: addDays(period.to, -7) };
    case "quincenal": {
      if (day === 16) return { from: ymd(year, month, 1), to: ymd(year, month, 15) };
      const [py, pm] = previousMonth(year, month);
      return { from: ymd(py, pm, 16), to: ymd(py, pm, lastDayOfMonth(py, pm)) };
    }
    case "mensual": {
      const [py, pm] = previousMonth(year, month);
      return wholeMonth(py, pm);
    }
  }
}

const sameDelivered = (d: ReportDelivery, period: ReportPeriod) =>
  d.source === "cron" && d.status === "enviado" && d.periodFrom === period.from && d.periodTo === period.to;

/**
 * ¿Toca enviar? Activa y su último periodo cerrado aún no se envió por la vía
 * automática. (Un «Enviar ahora» no cuenta: es una prueba o un adelanto.)
 */
export function reportDue(
  sub: Pick<ReportSubscription, "id" | "active" | "frequency">,
  today: string,
  deliveries: readonly ReportDelivery[],
): ReportPeriod | null {
  if (!sub.active) return null;
  const period = reportPeriod(sub.frequency, today);
  return deliveries.some((d) => d.subscriptionId === sub.id && sameDelivered(d, period)) ? null : period;
}

// ---------------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------------

export const reportPeriodLabel = (p: ReportPeriod) => corporatePeriodLabel(p.from, p.to);

export const reportSubject = (name: string, period: ReportPeriod) =>
  `Meguiar's · ${name} · ${reportPeriodLabel(period)}`;

/** Destinatarios capturados en un cuadro de texto: separados por coma, punto y coma, espacio o renglón. */
export const splitRecipients = (text: string): string[] => [
  ...new Set(
    text
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  ),
];

export const reportCentersText = (centerIds: readonly string[] | null, names: Record<string, string>) =>
  centerIds === null
    ? "Todos los centros"
    : centerIds.map((id) => names[id] ?? "Centro sin acceso").join(", ");

export const REPORT_DELIVERY_STATUS_TONES: Record<ReportDeliveryStatus, "success" | "danger"> = {
  enviado: "success",
  fallido: "danger",
};

export const REPORT_DELIVERY_SOURCE_LABELS: Record<ReportDeliverySource, string> = {
  cron: "Automático",
  manual: "Enviar ahora",
};

export const reportEmailsCopy = {
  title: "Reportes por correo",
  description:
    "El Tablero corporativo llega por correo a Dirección: diario, semanal, quincenal o mensual. Sólo para el equipo; no se envía nada a clientes.",
  notConfigured:
    "El envío de correos no está configurado en el servidor (falta RESEND_API_KEY o REPORTS_EMAIL_FROM). Puedes dejar las programaciones listas; se enviarán cuando quede configurado.",
  configured: "Envío de correos configurado",
  empty: "Aún no hay reportes programados",
  emptyHint: "Crea uno con su frecuencia, los centros y los correos de Dirección que lo reciben.",
  noDeliveries: "Sin envíos todavía",
  sendNow: "Enviar ahora",
  sendNowHint: "Manda ya el último periodo cerrado a sus destinatarios (no cuenta como el envío automático).",
  paused: "Pausado",
  active: "Activo",
  history: "Últimos envíos",
  onlyWeb: "Las programaciones se crean y editan en la web.",
};

// ---------------------------------------------------------------------------
// Puerto
// ---------------------------------------------------------------------------

/** Puerto de reportes por correo. Web y móvil usan el mismo adaptador (`@meguiars/supabase`). */
export interface ReportEmailsRepository {
  subscriptions(organizationId: string): Promise<Result<ReportSubscription[]>>;
  save(input: ReportSubscriptionInput): Promise<Result<ReportSubscription>>;
  remove(id: string, reason: string): Promise<Result<void>>;
  /** Envíos más recientes primero. */
  deliveries(organizationId: string, limit?: number): Promise<Result<ReportDelivery[]>>;
  /** null = ese periodo ya estaba enviado por la vía automática. */
  recordDelivery(input: ReportDeliveryInput): Promise<Result<ReportDelivery | null>>;
  /**
   * Hechos con los permisos del autor (public.report_subscription_facts). Sólo
   * con la llave de servicio (cron); la sesión de usuario usa
   * DashboardRepository.facts con sus propios permisos.
   */
  subscriptionFacts(
    subscriptionId: string,
    query: { sources: string[]; detailCenterIds: string[]; from: string; to: string },
  ): Promise<Result<DashboardFactsRow>>;
}
