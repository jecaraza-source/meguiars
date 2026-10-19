import {
  type ReportDelivery,
  type ReportDeliverySource,
  type ReportDeliveryStatus,
  type ReportEmailsRepository,
  type ReportFrequency,
  type ReportSubscription,
} from "@meguiars/domain";
import { changeReasonSchema, reportSubscriptionSchema } from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import type { Tables } from "../database.types";
import { toRepoError } from "../errors";
import { toDashboardFacts } from "./dashboards";
import { invalid, run } from "./shared";

export const toReportSubscription = (r: Tables<"report_subscriptions">): ReportSubscription => ({
  id: r.id,
  organizationId: r.organization_id,
  name: r.name,
  frequency: r.frequency as ReportFrequency,
  centerIds: r.center_ids,
  recipients: r.recipients,
  active: r.active,
  version: r.version,
  createdBy: r.created_by,
  updatedAt: r.updated_at,
});

export const toReportDelivery = (r: Tables<"report_deliveries">): ReportDelivery => ({
  id: r.id,
  organizationId: r.organization_id,
  subscriptionId: r.subscription_id,
  subscriptionName: r.subscription_name,
  frequency: r.frequency as ReportFrequency,
  source: r.source as ReportDeliverySource,
  periodFrom: r.period_from,
  periodTo: r.period_to,
  recipients: r.recipients,
  status: r.status as ReportDeliveryStatus,
  providerMessageId: r.provider_message_id,
  error: r.error,
  requestedBy: r.requested_by,
  createdAt: r.created_at,
});

/** Envíos que se muestran en la bitácora. */
export const REPORT_DELIVERIES_LIMIT = 50;

/**
 * Adaptador de reportes por correo: lectura por RLS (sólo admin corporativo) y
 * escritura sólo por RPC (programaciones con versión y motivo, bitácora).
 */
export function createReportEmailsRepository(client: MeguiarsSupabaseClient): ReportEmailsRepository {
  return {
    subscriptions(organizationId) {
      return run(
        () =>
          client
            .from("report_subscriptions")
            .select("*")
            .eq("organization_id", organizationId)
            .order("active", { ascending: false })
            .order("name"),
        (rows) => rows.map(toReportSubscription),
      );
    },

    save(input) {
      const parsed = reportSubscriptionSchema.safeParse(input);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const v = parsed.data;
      return run(
        () =>
          client.rpc("save_report_subscription", {
            p_organization_id: v.organizationId,
            p_id: v.id,
            p_version: v.version,
            p_name: v.name,
            p_frequency: v.frequency,
            p_center_ids: v.centerIds.length > 0 ? v.centerIds : null,
            p_recipients: v.recipients,
            p_active: v.active,
            p_reason: v.reason,
          }),
        toReportSubscription,
      );
    },

    async remove(id, reason) {
      const r = changeReasonSchema.safeParse(reason);
      if (!r.success) return invalid(r.error);
      try {
        const res = await client.rpc("delete_report_subscription", { p_id: id, p_reason: r.data });
        return res.error ? { ok: false, error: toRepoError(res.error) } : { ok: true, data: undefined };
      } catch (e) {
        return { ok: false, error: toRepoError(e) };
      }
    },

    deliveries(organizationId, limit = REPORT_DELIVERIES_LIMIT) {
      return run(
        () =>
          client
            .from("report_deliveries")
            .select("*")
            .eq("organization_id", organizationId)
            .order("created_at", { ascending: false })
            .limit(limit),
        (rows) => rows.map(toReportDelivery),
      );
    },

    async recordDelivery(input) {
      try {
        const res = await client.rpc("record_report_delivery", {
          p_subscription_id: input.subscriptionId,
          p_source: input.source,
          p_period_from: input.period.from,
          p_period_to: input.period.to,
          p_status: input.status,
          p_provider_message_id: input.providerMessageId,
          p_error: input.error ? input.error.slice(0, 1000) : null,
        });
        if (res.error) return { ok: false, error: toRepoError(res.error) };
        // Sin fila (o fila vacía): ese periodo ya estaba enviado por la vía automática.
        const row = res.data as Tables<"report_deliveries"> | null;
        return { ok: true, data: row?.id ? toReportDelivery(row) : null };
      } catch (e) {
        return { ok: false, error: toRepoError(e) };
      }
    },

    subscriptionFacts(subscriptionId, q) {
      return run(
        () =>
          client.rpc("report_subscription_facts", {
            p_subscription_id: subscriptionId,
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
