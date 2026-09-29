import type { DashboardFacts } from "../dashboards/catalog";
import {
  alertScopes,
  alertSources,
  alertWindow,
  evaluateAlertScope,
  isVariation,
  type AlertRuleLike,
  type AlertScopeResult,
} from "./evaluate";

/**
 * Orquestación de una evaluación de alertas (D4), la misma para el cron de la
 * web (llave de servicio), "Evaluar ahora" en web y en móvil (sesión del admin
 * corporativo). Las dependencias se inyectan: quién lee los hechos y quién
 * registra los resultados (public.record_alert_results aplica deduplicación y
 * cooldown en la base).
 */
export interface AlertRunPort {
  startRun(organizationId: string, source: "cron" | "manual"): Promise<string>;
  finishRun(runId: string, rulesEvaluated: number, error: string | null): Promise<void>;
  facts(
    rule: AlertRuleLike,
    query: { sources: string[]; detailCenterIds: string[]; from: string; to: string },
  ): Promise<DashboardFacts>;
  record(runId: string, ruleId: string, results: AlertScopeResult[]): Promise<{ created: string[] }>;
  /** Interfaz de notificación futura (email/WhatsApp); hoy no hace nada. */
  notify?(ruleId: string, createdAlertIds: string[]): Promise<void>;
}

export interface AlertRunSummary {
  runId: string;
  rulesEvaluated: number;
  created: string[];
  errors: { ruleId: string; message: string }[];
}

export async function runAlertEvaluation(input: {
  organizationId: string;
  source: "cron" | "manual";
  /** Hoy en la zona horaria de la organización (AAAA-MM-DD). */
  today: string;
  orgCenterIds: readonly string[];
  rules: readonly AlertRuleLike[];
  port: AlertRunPort;
}): Promise<AlertRunSummary> {
  const { port } = input;
  const runId = await port.startRun(input.organizationId, input.source);
  const summary: AlertRunSummary = { runId, rulesEvaluated: 0, created: [], errors: [] };
  for (const rule of input.rules.filter((r) => r.active && r.organizationId === input.organizationId)) {
    try {
      const scopes = alertScopes(rule, input.orgCenterIds);
      if (scopes.length === 0) continue;
      const window = alertWindow(rule.period, input.today);
      const detailCenterIds = [...new Set(scopes.flatMap((s) => s.centerIds))];
      const sources = alertSources(rule);
      const facts = await port.facts(rule, { sources, detailCenterIds, from: window.from, to: window.to });
      const previous = isVariation(rule.condition)
        ? await port.facts(rule, {
            sources,
            detailCenterIds,
            from: window.previousFrom,
            to: window.previousTo,
          })
        : null;
      const results = scopes.map((s) => evaluateAlertScope(rule, s, window, facts, previous));
      const { created } = await port.record(runId, rule.id, results);
      summary.rulesEvaluated += 1;
      summary.created.push(...created);
      if (created.length > 0) await port.notify?.(rule.id, created);
    } catch (e) {
      summary.errors.push({ ruleId: rule.id, message: e instanceof Error ? e.message : String(e) });
    }
  }
  await port.finishRun(
    runId,
    summary.rulesEvaluated,
    summary.errors.length ? summary.errors.map((e) => `${e.ruleId}: ${e.message}`).join("\n") : null,
  );
  return summary;
}
