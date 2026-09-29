import {
  fail,
  type AlertCondition,
  type AlertEvent,
  type AlertEventKind,
  type AlertInstance,
  type AlertPeriod,
  type AlertRecordSummary,
  type AlertRule,
  type AlertRun,
  type AlertScopeKind,
  type AlertSeverity,
  type AlertStatus,
  type AlertsRepository,
  type DashboardChannelKey,
} from "@meguiars/domain";
import { alertResolveSchema, alertReviewSchema, alertRuleSchema } from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import type { Json, Tables } from "../database.types";
import { toRepoError } from "../errors";
import { toDashboardFacts } from "./dashboards";
import { invalid, run } from "./shared";

const num = (v: number | string | null): number | null => (v === null ? null : Number(v));

export const toAlertRule = (r: Tables<"alert_rules">): AlertRule => ({
  id: r.id,
  organizationId: r.organization_id,
  name: r.name,
  description: r.description,
  metricId: r.metric_id,
  channel: r.channel as DashboardChannelKey | null,
  condition: r.condition as AlertCondition,
  threshold: num(r.threshold),
  period: r.period as AlertPeriod,
  scopeKind: r.scope_kind as AlertScopeKind,
  centerIds: r.center_ids,
  severity: r.severity as AlertSeverity,
  cooldownMinutes: r.cooldown_minutes,
  active: r.active,
  version: r.version,
  createdBy: r.created_by,
  updatedAt: r.updated_at,
});

export const toAlertInstance = (r: Tables<"alert_instances">): AlertInstance => ({
  id: r.id,
  organizationId: r.organization_id,
  ruleId: r.rule_id,
  ruleName: r.rule_name,
  metricId: r.metric_id,
  channel: r.channel as DashboardChannelKey | null,
  condition: r.condition as AlertCondition,
  threshold: num(r.threshold),
  severity: r.severity as AlertSeverity,
  scopeKey: r.scope_key,
  detailCenterIds: r.detail_center_ids,
  periodFrom: r.period_from,
  periodTo: r.period_to,
  previousFrom: r.previous_from,
  previousTo: r.previous_to,
  value: num(r.value),
  previousValue: num(r.previous_value),
  changePct: num(r.change_pct),
  occurrences: r.occurrences,
  firstDetectedAt: r.first_detected_at,
  lastDetectedAt: r.last_detected_at,
  lastPeriodFrom: r.last_period_from,
  lastPeriodTo: r.last_period_to,
  lastValue: num(r.last_value),
  conditionClearedAt: r.condition_cleared_at,
  status: r.status as AlertStatus,
  reviewedAt: r.reviewed_at,
  resolvedAt: r.resolved_at,
  resolutionNote: r.resolution_note,
  notifiedAt: r.notified_at,
});

const toEvent = (r: Tables<"alert_events">): AlertEvent => ({
  id: r.id,
  instanceId: r.instance_id,
  kind: r.kind as AlertEventKind,
  actorId: r.actor_id,
  note: r.note,
  value: num(r.value),
  periodFrom: r.period_from,
  periodTo: r.period_to,
  createdAt: r.created_at,
});

const toRun = (r: Tables<"alert_evaluation_runs">): AlertRun => ({
  id: r.id,
  organizationId: r.organization_id,
  source: r.source as AlertRun["source"],
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  rulesEvaluated: r.rules_evaluated,
  created: r.created,
  updated: r.updated,
  suppressed: r.suppressed,
  cleared: r.cleared,
  error: r.error,
});

const toSummary = (raw: Json): AlertRecordSummary => {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    created: Array.isArray(o.created) ? o.created.map(String) : [],
    updated: Number(o.updated ?? 0),
    suppressed: Number(o.suppressed ?? 0),
    cleared: Number(o.cleared ?? 0),
  };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Adaptador de alertas: lectura por RLS (bandeja por permisos de centro) y
 * escritura sólo por RPC (reglas, revisar/resolver, registrar resultados).
 */
export function createAlertsRepository(client: MeguiarsSupabaseClient): AlertsRepository {
  return {
    rules(organizationId) {
      return run(
        () =>
          client
            .from("alert_rules")
            .select("*")
            .eq("organization_id", organizationId)
            .order("active", { ascending: false })
            .order("name"),
        (rows) => rows.map(toAlertRule),
      );
    },

    saveRule(input) {
      const parsed = alertRuleSchema.safeParse(input);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const v = parsed.data;
      return run(
        () =>
          client.rpc("save_alert_rule", {
            p_organization_id: v.organizationId,
            p_id: v.id,
            p_version: v.version,
            p_name: v.name,
            p_description: v.description,
            p_metric_id: v.metricId,
            p_channel: v.channel,
            p_condition: v.condition,
            p_threshold: v.threshold,
            p_period: v.period,
            p_scope_kind: v.scopeKind,
            p_center_ids: v.centerIds,
            p_severity: v.severity,
            p_cooldown_minutes: v.cooldownMinutes,
            p_active: v.active,
            p_reason: v.reason,
          }),
        toAlertRule,
      );
    },

    instances(organizationId, opts = {}) {
      return run(
        () => {
          let q = client.from("alert_instances").select("*").eq("organization_id", organizationId);
          if (!opts.includeResolved) q = q.neq("status", "resuelta");
          return q.order("last_detected_at", { ascending: false }).limit(opts.limit ?? 200);
        },
        (rows) => rows.map(toAlertInstance),
      );
    },

    instance(id) {
      if (!UUID.test(id)) return Promise.resolve(fail("not_found", "Alerta inexistente"));
      return run(
        () => client.from("alert_instances").select("*").eq("id", id).maybeSingle(),
        toAlertInstance,
      );
    },

    events(instanceId) {
      return run(
        () => client.from("alert_events").select("*").eq("instance_id", instanceId).order("id"),
        (rows) => rows.map(toEvent),
      );
    },

    review(id, note) {
      const parsed = alertReviewSchema.safeParse({ id, note });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () => client.rpc("review_alert", { p_id: parsed.data.id, p_note: parsed.data.note }),
        toAlertInstance,
      );
    },

    resolve(id, note) {
      const parsed = alertResolveSchema.safeParse({ id, note });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () => client.rpc("resolve_alert", { p_id: parsed.data.id, p_note: parsed.data.note }),
        toAlertInstance,
      );
    },

    runs(organizationId, limit = 10) {
      return run(
        () =>
          client
            .from("alert_evaluation_runs")
            .select("*")
            .eq("organization_id", organizationId)
            .order("started_at", { ascending: false })
            .limit(limit),
        (rows) => rows.map(toRun),
      );
    },

    startRun(organizationId, source) {
      return run(
        () => client.rpc("start_alert_run", { p_organization_id: organizationId, p_source: source }),
        (id) => String(id),
      );
    },

    async finishRun(runId, rulesEvaluated, error) {
      try {
        const r = await client.rpc("finish_alert_run", {
          p_run_id: runId,
          p_rules_evaluated: rulesEvaluated,
          p_error: error ? error.slice(0, 2000) : null,
        });
        return r.error ? { ok: false, error: toRepoError(r.error) } : { ok: true, data: undefined };
      } catch (e) {
        return { ok: false, error: toRepoError(e) };
      }
    },

    recordResults(runId, ruleId, results) {
      const payload = results.map((r) => ({
        scope_key: r.scopeKey,
        center_ids: r.centerIds,
        triggered: r.triggered,
        value: r.value,
        previous_value: r.previousValue,
        change_pct: r.changePct,
        period_from: r.periodFrom,
        period_to: r.periodTo,
        previous_from: r.previousFrom,
        previous_to: r.previousTo,
      }));
      return run(
        () =>
          client.rpc("record_alert_results", {
            p_run_id: runId,
            p_rule_id: ruleId,
            p_results: payload as Json,
          }),
        toSummary,
      );
    },

    ruleFacts(ruleId, q) {
      return run(
        () =>
          client.rpc("alert_rule_facts", {
            p_rule_id: ruleId,
            p_sources: q.sources,
            p_detail_center_ids: q.detailCenterIds,
            p_from: q.from,
            p_to: q.to,
          }),
        (raw) => toDashboardFacts(raw as Record<string, unknown>),
      );
    },
  };
}
