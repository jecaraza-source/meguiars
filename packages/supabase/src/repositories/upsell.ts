import {
  type RuleStage,
  type SalesChannel,
  type TargetKind,
  type UpsellRepository,
  type UpsellStage,
} from "@meguiars/domain";
import { upsellDecisionSchema, upsellRuleSchema } from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import { toRepoError } from "../errors";
import { invalid, run } from "./shared";

/**
 * Adaptador Supabase del puerto `UpsellRepository`. La base rankea, registra
 * las ofertas y agrega la línea al aceptar (mismo camino que la OS); las
 * reglas sólo las escribe el admin corporativo por RPC con motivo.
 */
export function createUpsellRepository(client: MeguiarsSupabaseClient): UpsellRepository {
  return {
    async listRules(organizationId) {
      const [rules, services, plans] = await Promise.all([
        run(
          () =>
            client
              .from("upsell_rules")
              .select("*")
              .eq("organization_id", organizationId)
              .order("active", { ascending: false })
              .order("priority", { ascending: false })
              .order("name"),
          (rows) => rows,
        ),
        run(
          () => client.from("services").select("id, name").eq("organization_id", organizationId),
          (rows) => new Map(rows.map((s) => [s.id, s.name])),
        ),
        run(
          () => client.from("membership_plans").select("id, name").eq("organization_id", organizationId),
          (rows) => new Map(rows.map((p) => [p.id, p.name])),
        ),
      ]);
      if (!rules.ok) return rules;
      const serviceName = (id: string | null) => (id && services.ok ? (services.data.get(id) ?? null) : null);
      const planName = (id: string | null) => (id && plans.ok ? (plans.data.get(id) ?? null) : null);
      return {
        ok: true,
        data: rules.data.map((r) => ({
          id: r.id,
          organizationId: r.organization_id,
          name: r.name,
          sourceServiceId: r.source_service_id,
          sourceServiceName: serviceName(r.source_service_id),
          targetServiceId: r.target_service_id,
          targetPlanId: r.target_plan_id,
          targetName: serviceName(r.target_service_id) ?? planName(r.target_plan_id) ?? "—",
          stage: r.stage as RuleStage,
          priority: r.priority,
          pitch: r.pitch,
          channels: r.channels as SalesChannel[],
          centerIds: r.center_ids,
          minOrderTotal: r.min_order_total === null ? null : Number(r.min_order_total),
          startsOn: r.starts_on,
          endsOn: r.ends_on,
          active: r.active,
        })),
      };
    },

    upsertRule(command) {
      const parsed = upsellRuleSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("upsert_upsell_rule", {
            p_organization_id: c.organizationId,
            p_id: c.id ?? null,
            p_name: c.name,
            p_source_service_id: c.sourceServiceId ?? null,
            p_target_service_id: c.targetServiceId ?? null,
            p_target_plan_id: c.targetPlanId ?? null,
            p_stage: c.stage,
            p_priority: c.priority,
            p_pitch: c.pitch,
            p_channels: c.channels,
            p_center_ids: c.centerIds ?? null,
            p_min_order_total: c.minOrderTotal ?? null,
            p_starts_on: c.startsOn,
            p_ends_on: c.endsOn ?? null,
            p_active: c.active,
            p_reason: c.reason,
          }),
        (row) => ({ id: row.id }),
      );
    },

    suggestions(orderId, limit = 3) {
      return run(
        () => client.rpc("upsell_suggestions", { p_order_id: orderId, p_limit: limit }),
        (rows) =>
          rows.map((s) => ({
            offerId: s.offer_id,
            ruleId: s.rule_id,
            stage: s.stage as UpsellStage,
            ruleName: s.rule_name,
            pitch: s.pitch,
            sourceServiceName: s.source_service_name,
            targetKind: s.target_kind as TargetKind,
            targetServiceId: s.target_service_id,
            targetPlanId: s.target_plan_id,
            targetName: s.target_name,
            price: Number(s.price),
            priority: s.priority,
            acceptanceRate: Number(s.acceptance_rate),
            offeredCount: s.offered_count,
          })),
      );
    },

    accept(orderId, version, ruleId) {
      const parsed = upsellDecisionSchema.safeParse({ orderId, version, ruleId });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () => client.rpc("accept_upsell", { p_order_id: orderId, p_version: version, p_rule_id: ruleId }),
        (row) => ({ version: row.version }),
      );
    },

    async reject(orderId, ruleId, reason) {
      const parsed = upsellDecisionSchema.safeParse({ orderId, ruleId, reason });
      if (!parsed.success) return invalid(parsed.error);
      try {
        const { error } = await client.rpc("reject_upsell", {
          p_order_id: orderId,
          p_rule_id: ruleId,
          p_reason: parsed.data.reason ?? null,
        });
        return error ? { ok: false, error: toRepoError(error) } : { ok: true, data: undefined };
      } catch (error) {
        return { ok: false, error: toRepoError(error) };
      }
    },

    metricFacts(detailCenterIds, from, to) {
      return run(
        () =>
          client.rpc("upsell_metric_facts", { p_detail_center_ids: detailCenterIds, p_from: from, p_to: to }),
        (rows) =>
          rows.map((r) => ({
            ruleId: r.rule_id,
            ruleName: r.rule_name,
            detailCenterId: r.detail_center_id,
            targetKind: r.target_kind as TargetKind,
            offered: r.offered,
            accepted: r.accepted,
            rejected: r.rejected,
            orders: r.orders,
            incrementalRevenue: Number(r.incremental_revenue),
            membershipValue: Number(r.membership_value),
          })),
      );
    },
  };
}
