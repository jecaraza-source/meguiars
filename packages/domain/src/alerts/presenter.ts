import type { StatusTone } from "../agenda/copy";
import { formatMetricValue } from "../dashboards/presenter";
import { formatPeriod } from "../receivables/presenter";
import { DASHBOARD_CHANNEL_LABELS } from "../dashboards/copy";
import {
  isVariationCondition,
  type AlertCondition,
  type AlertEvent,
  type AlertInstance,
  type AlertRule,
  type AlertSeverity,
  type AlertStatus,
} from "./alerts";
import {
  ALERT_EVENT_LABELS,
  ALERT_PERIOD_LABELS,
  ALERT_SCOPE_LABELS,
  ALERT_SEVERITY_LABELS,
  ALERT_STATUS_LABELS,
  ALERTS_COPY,
} from "./copy";

export const ALERT_SEVERITY_TONES: Record<AlertSeverity, StatusTone> = {
  critica: "danger",
  atencion: "warning",
  informativa: "info",
};

export const ALERT_STATUS_TONES: Record<AlertStatus, StatusTone> = {
  nueva: "brand",
  revisada: "neutral",
  resuelta: "success",
};

/** Unidades cuya variación se mide en puntos (igual que el evaluador). */
const POINT_UNITS = new Set(["percent", "ratio"]);

const num = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 });

/** "< $3,000.00", "cae ≥ 15 %", "cae ≥ 5 pts", "sin datos". */
export function alertConditionText(
  rule: { condition: AlertCondition; threshold: number | null },
  unit: string,
): string {
  const t = rule.threshold ?? 0;
  switch (rule.condition) {
    case "below":
      return `< ${formatMetricValue(unit, t)}`;
    case "above":
      return `> ${formatMetricValue(unit, t)}`;
    case "drop_pct":
    case "rise_pct": {
      const verb = rule.condition === "drop_pct" ? "cae" : "sube";
      return `${verb} ≥ ${num.format(t)} ${POINT_UNITS.has(unit) ? "pts" : "%"} vs periodo anterior`;
    }
    case "no_data":
      return "sin datos";
  }
}

/** Nombre del KPI con su canal fijo: "Ventas · B2B". */
export function alertMetricLabel(metricName: string, channel: string | null): string {
  const label = channel ? DASHBOARD_CHANNEL_LABELS[channel as keyof typeof DASHBOARD_CHANNEL_LABELS] : null;
  return label ? `${metricName} · ${label}` : metricName;
}

/** Ámbito: nombre del centro, "Conjunto: A, B" o "Corporativo". */
export function alertScopeText(
  scopeKey: string,
  centerIds: readonly string[],
  centerNames: Readonly<Record<string, string>>,
): string {
  const name = (id: string) => centerNames[id] ?? "Centro sin acceso";
  if (scopeKey === "corporativo") return "Corporativo";
  if (scopeKey === "conjunto") return `Conjunto: ${centerIds.map(name).join(", ")}`;
  return name(scopeKey);
}

export interface AlertPresentationContext {
  metricName: string;
  unit: string;
  centerNames: Readonly<Record<string, string>>;
}

const signed = (n: number, unit: string) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${num.format(Math.abs(n))} ${POINT_UNITS.has(unit) ? "pts" : "%"}`;

/** Presentación de una alerta (igual en web y móvil). */
export function presentAlert(a: AlertInstance, ctx: AlertPresentationContext) {
  const fmt = (v: number | null) => (v === null ? "Sin datos" : formatMetricValue(ctx.unit, v));
  const repeated = a.occurrences > 1;
  return {
    id: a.id,
    title: a.ruleName,
    metric: alertMetricLabel(ctx.metricName, a.channel),
    severity: ALERT_SEVERITY_LABELS[a.severity],
    severityTone: ALERT_SEVERITY_TONES[a.severity],
    status: ALERT_STATUS_LABELS[a.status],
    statusTone: ALERT_STATUS_TONES[a.status],
    scope: alertScopeText(a.scopeKey, a.detailCenterIds, ctx.centerNames),
    condition: alertConditionText(a, ctx.unit),
    /** Periodo y valor que la originaron (trazabilidad). */
    period: formatPeriod(a.periodFrom, a.periodTo),
    value: fmt(a.value),
    previous:
      a.previousFrom && a.previousTo
        ? `${fmt(a.previousValue)} (${formatPeriod(a.previousFrom, a.previousTo)})`
        : null,
    change: a.changePct === null ? null : signed(a.changePct, ctx.unit),
    /** Última detección (si se repitió en otro periodo). */
    last: repeated ? `${fmt(a.lastValue)} en ${formatPeriod(a.lastPeriodFrom, a.lastPeriodTo)}` : null,
    occurrences: repeated ? `Detectada ${a.occurrences} veces` : "Detectada 1 vez",
    cleared: a.conditionClearedAt && a.status !== "resuelta" ? ALERTS_COPY.conditionCleared : null,
    resolutionNote: a.resolutionNote,
    canReview: a.status === "nueva",
    canResolve: a.status !== "resuelta",
  };
}

export type AlertView = ReturnType<typeof presentAlert>;

/** Evento del historial: "Se repitió · $2,450.00 · 3 oct 2026". */
export function presentAlertEvent(e: AlertEvent, unit: string) {
  const detail = [
    e.value !== null ? formatMetricValue(unit, e.value) : null,
    e.periodFrom && e.periodTo ? formatPeriod(e.periodFrom, e.periodTo) : null,
    e.note,
  ].filter((x): x is string => !!x);
  return { id: e.id, label: ALERT_EVENT_LABELS[e.kind], detail: detail.join(" · "), at: e.createdAt };
}

/** Resumen de una regla para la lista del administrador. */
export function presentAlertRule(
  r: AlertRule,
  ctx: { metricName: string; unit: string; centerNames: Readonly<Record<string, string>> },
) {
  const centers =
    r.scopeKind === "corporativo"
      ? "Todos los centros"
      : (r.centerIds ?? []).map((id) => ctx.centerNames[id] ?? "Centro sin acceso").join(", ");
  const hours = r.cooldownMinutes / 60;
  return {
    id: r.id,
    name: r.name,
    metric: alertMetricLabel(ctx.metricName, r.channel),
    condition: alertConditionText(r, ctx.unit),
    period: ALERT_PERIOD_LABELS[r.period],
    scope: `${ALERT_SCOPE_LABELS[r.scopeKind]} · ${centers}`,
    severity: ALERT_SEVERITY_LABELS[r.severity],
    severityTone: ALERT_SEVERITY_TONES[r.severity],
    cooldown:
      r.cooldownMinutes === 0
        ? "Sin cooldown"
        : hours % 24 === 0
          ? `Cooldown ${hours / 24} día${hours === 24 ? "" : "s"}`
          : `Cooldown ${num.format(hours)} h`,
    active: r.active,
    warning: r.active && !r.createdBy ? ALERTS_COPY.authorMissing : null,
    variation: isVariationCondition(r.condition),
  };
}

/** Mensaje de error de alertas para la pantalla. */
export function alertsErrorMessage(error: { kind: string; message: string }): string {
  if (error.kind === "unavailable") return "Sin conexión: las alertas se consultan en línea.";
  if (error.kind === "permission_denied") return error.message || "No tienes permiso sobre esta alerta.";
  if (error.kind === "not_found") return error.message || "Alerta inexistente o sin acceso.";
  if (error.kind === "conflict") return "Alguien más cambió este registro; recarga e inténtalo de nuevo.";
  return error.message;
}
