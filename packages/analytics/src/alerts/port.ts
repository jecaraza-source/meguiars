import type { AlertsRepository, DashboardFactsRow, Result } from "@meguiars/domain";
import type { DashboardFacts } from "../dashboards/catalog";
import type { AlertRuleLike } from "./evaluate";
import type { AlertRunPort } from "./run";

/**
 * Notificador futuro (correo, WhatsApp): recibe las alertas NUEVAS de una
 * regla. Hoy no hay implementación; al agregarla se marca notified_at.
 */
export interface AlertNotifier {
  notify(input: { organizationId: string; ruleId: string; alertIds: string[] }): Promise<void>;
}

type FactsQuery = { sources: string[]; detailCenterIds: string[]; from: string; to: string };

const unwrap = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
};

/**
 * Puerto del runner sobre el repositorio de alertas. `readFacts` decide con
 * qué permisos se leen los hechos: el cron usa AlertsRepository.ruleFacts
 * (autor de la regla); "Evaluar ahora", DashboardRepository.facts (sesión).
 */
export function repositoryAlertPort(input: {
  organizationId: string;
  alerts: AlertsRepository;
  readFacts: (rule: AlertRuleLike, query: FactsQuery) => Promise<Result<DashboardFactsRow>>;
  notifier?: AlertNotifier | undefined;
}): AlertRunPort {
  const { alerts, notifier } = input;
  return {
    startRun: async (organizationId, source) => unwrap(await alerts.startRun(organizationId, source)),
    finishRun: async (runId, n, error) => unwrap(await alerts.finishRun(runId, n, error)),
    facts: async (rule, query) => unwrap(await input.readFacts(rule, query)) as DashboardFacts,
    record: async (runId, ruleId, results) =>
      unwrap(
        await alerts.recordResults(
          runId,
          ruleId,
          results.map((r) => ({
            scopeKey: r.scopeKey,
            centerIds: [...r.centerIds],
            triggered: r.triggered,
            value: r.value,
            previousValue: r.previousValue,
            changePct: r.changePct,
            periodFrom: r.periodFrom,
            periodTo: r.periodTo,
            previousFrom: r.previousFrom,
            previousTo: r.previousTo,
          })),
        ),
      ),
    ...(notifier
      ? {
          notify: (ruleId: string, alertIds: string[]) =>
            notifier.notify({ organizationId: input.organizationId, ruleId, alertIds }),
        }
      : {}),
  };
}
