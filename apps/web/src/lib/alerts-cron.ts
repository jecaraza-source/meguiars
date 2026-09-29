import "server-only";
import { repositoryAlertPort, runAlertEvaluation, type AlertNotifier } from "@meguiars/analytics";
import { todayIn } from "@meguiars/domain";
import { createAlertsRepository, toAlertRule, type MeguiarsSupabaseClient } from "@meguiars/supabase";

export interface ScheduledAlertsSummary {
  organizations: number;
  rulesEvaluated: number;
  created: number;
  /** Reglas activas sin autor (sembradas o de un usuario borrado): no se evalúan. */
  skippedWithoutAuthor: number;
  errors: string[];
}

/**
 * Evaluación programada (Vercel Cron, diaria): por cada organización con
 * reglas activas, el MISMO runner que "Evaluar ahora". Los hechos se leen con
 * los permisos del autor de cada regla (public.alert_rule_facts); la base
 * deduplica, aplica cooldown y guarda la bitácora de la corrida.
 */
export async function runScheduledAlerts(
  client: MeguiarsSupabaseClient,
  notifier?: AlertNotifier,
): Promise<ScheduledAlertsSummary> {
  const out: ScheduledAlertsSummary = {
    organizations: 0,
    rulesEvaluated: 0,
    created: 0,
    skippedWithoutAuthor: 0,
    errors: [],
  };
  const { data: rows, error } = await client.from("alert_rules").select("*").eq("active", true);
  if (error) throw new Error(error.message);
  const rules = (rows ?? []).map(toAlertRule);
  const alerts = createAlertsRepository(client);
  for (const organizationId of [...new Set(rules.map((r) => r.organizationId))]) {
    const { data: centers, error: centersError } = await client
      .from("detail_centers")
      .select("id, timezone")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("created_at");
    if (centersError || !centers?.length) {
      out.errors.push(`${organizationId}: ${centersError?.message ?? "sin centros activos"}`);
      continue;
    }
    const orgRules = rules.filter((r) => r.organizationId === organizationId);
    const runnable = orgRules.filter((r) => r.createdBy);
    out.skippedWithoutAuthor += orgRules.length - runnable.length;
    if (runnable.length === 0) continue;
    try {
      const summary = await runAlertEvaluation({
        organizationId,
        source: "cron",
        today: todayIn(centers[0]!.timezone),
        orgCenterIds: centers.map((c) => c.id),
        rules: runnable,
        port: repositoryAlertPort({
          organizationId,
          alerts,
          readFacts: (rule, q) => alerts.ruleFacts(rule.id, q),
          notifier,
        }),
      });
      out.organizations += 1;
      out.rulesEvaluated += summary.rulesEvaluated;
      out.created += summary.created.length;
      out.errors.push(...summary.errors.map((e) => `${e.ruleId}: ${e.message}`));
    } catch (e) {
      out.errors.push(`${organizationId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}
