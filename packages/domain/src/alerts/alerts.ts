import type { Result } from "../result";
import type { DashboardChannelKey, DashboardFactsRow } from "../dashboards/dashboards";

/**
 * Dirección / Alertas (D4). Espejo de la migración 20261018000000_alerts.sql.
 * Una regla vigila un KPI registrado (D1/D2) en un periodo y un ámbito; la
 * evaluación (Vercel Cron diario o "Evaluar ahora") calcula el KPI con la
 * misma fórmula del registro (@meguiars/analytics) y registra el resultado en
 * la base, que deduplica (una alerta abierta por regla y ámbito) y aplica el
 * cooldown. Resolver no borra: queda la bitácora de eventos.
 */

export const ALERT_CONDITIONS = ["below", "above", "drop_pct", "rise_pct", "no_data"] as const;
export type AlertCondition = (typeof ALERT_CONDITIONS)[number];
export const ALERT_PERIODS = ["dia", "semana", "mes_en_curso", "mes"] as const;
export type AlertPeriod = (typeof ALERT_PERIODS)[number];
export const ALERT_SCOPES = ["centro", "conjunto", "corporativo"] as const;
export type AlertScopeKind = (typeof ALERT_SCOPES)[number];
export const ALERT_SEVERITIES = ["informativa", "atencion", "critica"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];
export const ALERT_STATUSES = ["nueva", "revisada", "resuelta"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];
export const ALERT_EVENT_KINDS = [
  "creada",
  "repetida",
  "condicion_superada",
  "revisada",
  "resuelta",
] as const;
export type AlertEventKind = (typeof ALERT_EVENT_KINDS)[number];

/** Cooldown por defecto (1 día) y máximo (30 días), en minutos. */
export const DEFAULT_ALERT_COOLDOWN_MINUTES = 1440;
export const MAX_ALERT_COOLDOWN_MINUTES = 43_200;

export const isVariationCondition = (c: AlertCondition) => c === "drop_pct" || c === "rise_pct";

export interface AlertRule {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  metricId: string;
  channel: DashboardChannelKey | null;
  condition: AlertCondition;
  threshold: number | null;
  period: AlertPeriod;
  scopeKind: AlertScopeKind;
  /** null = corporativo (todos los centros de la organización). */
  centerIds: string[] | null;
  severity: AlertSeverity;
  cooldownMinutes: number;
  active: boolean;
  version: number;
  /** Autor: la evaluación programada lee los hechos con sus permisos. */
  createdBy: string | null;
  updatedAt: string;
}

export interface AlertRuleInput {
  organizationId: string;
  id: string | null;
  version: number | null;
  name: string;
  description: string | null;
  metricId: string;
  channel: DashboardChannelKey | null;
  condition: AlertCondition;
  threshold: number | null;
  period: AlertPeriod;
  scopeKind: AlertScopeKind;
  centerIds: string[] | null;
  severity: AlertSeverity;
  cooldownMinutes: number;
  active: boolean;
  reason: string;
}

/** Alerta: copia de la regla al dispararse + datos del KPI y periodo que la originaron. */
export interface AlertInstance {
  id: string;
  organizationId: string;
  ruleId: string;
  ruleName: string;
  metricId: string;
  channel: DashboardChannelKey | null;
  condition: AlertCondition;
  threshold: number | null;
  severity: AlertSeverity;
  /** Centro (id), "conjunto" o "corporativo". */
  scopeKey: string;
  detailCenterIds: string[];
  periodFrom: string;
  periodTo: string;
  previousFrom: string | null;
  previousTo: string | null;
  value: number | null;
  previousValue: number | null;
  changePct: number | null;
  occurrences: number;
  firstDetectedAt: string;
  lastDetectedAt: string;
  lastPeriodFrom: string;
  lastPeriodTo: string;
  lastValue: number | null;
  conditionClearedAt: string | null;
  status: AlertStatus;
  reviewedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  /** Reservado para el notificador futuro (correo/WhatsApp). */
  notifiedAt: string | null;
}

export interface AlertEvent {
  id: number;
  instanceId: string;
  kind: AlertEventKind;
  actorId: string | null;
  note: string | null;
  value: number | null;
  periodFrom: string | null;
  periodTo: string | null;
  createdAt: string;
}

export interface AlertRun {
  id: string;
  organizationId: string;
  source: "cron" | "manual";
  startedAt: string;
  finishedAt: string | null;
  rulesEvaluated: number;
  created: number;
  updated: number;
  suppressed: number;
  cleared: number;
  error: string | null;
}

/** Resultado por ámbito que se registra (public.record_alert_results). */
export interface AlertResultInput {
  scopeKey: string;
  centerIds: string[];
  triggered: boolean;
  value: number | null;
  previousValue: number | null;
  changePct: number | null;
  periodFrom: string;
  periodTo: string;
  previousFrom: string | null;
  previousTo: string | null;
}

export interface AlertRecordSummary {
  created: string[];
  updated: number;
  suppressed: number;
  cleared: number;
}

// ---------------------------------------------------------------------------
// Bandeja: filtros
// ---------------------------------------------------------------------------

export const ALERT_INBOX_STATUSES = ["abiertas", "nueva", "revisada", "resuelta", "todas"] as const;
export type AlertInboxStatus = (typeof ALERT_INBOX_STATUSES)[number];

export interface AlertInboxFilters {
  status: AlertInboxStatus;
  severity: AlertSeverity | null;
  /** Centro: alertas cuyo ámbito lo incluye. */
  centerId: string | null;
}

type Params = Record<string, string | string[] | undefined>;
const one = (p: Params, k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined);
const isIn = <T extends string>(list: readonly T[], v: string | undefined): v is T =>
  v !== undefined && (list as readonly string[]).includes(v);

/** Filtros de la bandeja desde la URL (web) o los parámetros de la pantalla (móvil). */
export function parseAlertInboxFilters(
  params: Params,
  allowedCenterIds: readonly string[],
): AlertInboxFilters {
  const status = one(params, "estado");
  const severity = one(params, "severidad");
  const center = one(params, "centro");
  return {
    status: isIn(ALERT_INBOX_STATUSES, status) ? status : "abiertas",
    severity: isIn(ALERT_SEVERITIES, severity) ? severity : null,
    centerId: center && allowedCenterIds.includes(center) ? center : null,
  };
}

export function alertInboxParams(f: AlertInboxFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.status !== "abiertas") out.estado = f.status;
  if (f.severity) out.severidad = f.severity;
  if (f.centerId) out.centro = f.centerId;
  return out;
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { critica: 0, atencion: 1, informativa: 2 };
const STATUS_RANK: Record<AlertStatus, number> = { nueva: 0, revisada: 1, resuelta: 2 };

/** Aplica los filtros y ordena: abiertas primero, luego severidad, luego la más reciente. */
export function filterAlertInbox(alerts: readonly AlertInstance[], f: AlertInboxFilters): AlertInstance[] {
  return alerts
    .filter((a) => {
      if (f.status === "abiertas" && a.status === "resuelta") return false;
      if (f.status !== "abiertas" && f.status !== "todas" && a.status !== f.status) return false;
      if (f.severity && a.severity !== f.severity) return false;
      if (f.centerId && !a.detailCenterIds.includes(f.centerId)) return false;
      return true;
    })
    .sort(
      (a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        b.lastDetectedAt.localeCompare(a.lastDetectedAt),
    );
}

/** Conteo de abiertas por severidad (encabezado de la bandeja y del tablero). */
export function openAlertCounts(
  alerts: readonly AlertInstance[],
): Record<AlertSeverity, number> & { total: number } {
  const out = { critica: 0, atencion: 0, informativa: 0, total: 0 };
  for (const a of alerts) {
    if (a.status === "resuelta") continue;
    out[a.severity] += 1;
    out.total += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Puerto
// ---------------------------------------------------------------------------

/** Puerto de alertas. Web y móvil usan el mismo adaptador (`@meguiars/supabase`). */
export interface AlertsRepository {
  rules(organizationId: string): Promise<Result<AlertRule[]>>;
  saveRule(input: AlertRuleInput): Promise<Result<AlertRule>>;
  /** Alertas visibles (RLS: permiso en todos los centros del ámbito), las más recientes primero. */
  instances(
    organizationId: string,
    opts?: { includeResolved?: boolean; limit?: number },
  ): Promise<Result<AlertInstance[]>>;
  instance(id: string): Promise<Result<AlertInstance>>;
  events(instanceId: string): Promise<Result<AlertEvent[]>>;
  review(id: string, note: string | null): Promise<Result<AlertInstance>>;
  resolve(id: string, note: string): Promise<Result<AlertInstance>>;
  runs(organizationId: string, limit?: number): Promise<Result<AlertRun[]>>;
  // Evaluación (cron con llave de servicio, o "Evaluar ahora" del admin corporativo).
  startRun(organizationId: string, source: AlertRun["source"]): Promise<Result<string>>;
  finishRun(runId: string, rulesEvaluated: number, error: string | null): Promise<Result<void>>;
  recordResults(
    runId: string,
    ruleId: string,
    results: AlertResultInput[],
  ): Promise<Result<AlertRecordSummary>>;
  /**
   * Hechos de una regla con los permisos de su autor (public.alert_rule_facts).
   * Sólo con la llave de servicio (cron); la sesión de usuario usa
   * DashboardRepository.facts con sus propios permisos.
   */
  ruleFacts(
    ruleId: string,
    query: { sources: string[]; detailCenterIds: string[]; from: string; to: string },
  ): Promise<Result<DashboardFactsRow>>;
}
