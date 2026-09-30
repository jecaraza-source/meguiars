import {
  BASELINE_METRICS,
  READINESS_KEYS,
  type BaselineMetric,
  type CenterBaseline,
  type CenterReadiness,
  type ClientErrorReport,
  type PilotDayMetrics,
  type PilotRepository,
  type ReadinessItem,
  type Result,
} from "@meguiars/domain";
import type { MeguiarsSupabaseClient } from "../client";
import { toRepoError } from "../errors";
import { run } from "./shared";

type J = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);

/** Convierte la respuesta de public.center_readiness (ignora puntos que la app aún no conoce). */
export function toCenterReadiness(raw: J): CenterReadiness {
  const c = raw.center as J;
  const items = (Array.isArray(raw.items) ? (raw.items as J[]) : [])
    .filter((i) => (READINESS_KEYS as readonly string[]).includes(String(i.key)))
    .map((i): ReadinessItem => ({
      key: i.key as ReadinessItem["key"],
      required: Boolean(i.required),
      status: (["ok", "warning", "missing"].includes(String(i.status))
        ? i.status
        : "missing") as ReadinessItem["status"],
      count: num(i.count),
      detail: String(i.detail ?? ""),
    }));
  return {
    center: {
      id: String(c.id),
      organizationId: String(c.organization_id),
      code: String(c.code),
      name: String(c.name),
      timezone: String(c.timezone),
      active: Boolean(c.active),
    },
    items,
    ready: Boolean(raw.ready),
  };
}

export function toPilotDay(r: J): PilotDayMetrics {
  return {
    detailCenterId: String(r.detail_center_id),
    day: String(r.day),
    activeUsers: num(r.active_users),
    ordersCreated: num(r.orders_created),
    ordersDelivered: num(r.orders_delivered),
    ordersCancelled: num(r.orders_cancelled),
    revenue: num(r.revenue),
    cycleMinutesAvg:
      r.cycle_minutes_avg === null || r.cycle_minutes_avg === undefined ? null : num(r.cycle_minutes_avg),
    promisedDelivered: num(r.promised_delivered),
    onTimeDelivered: num(r.on_time_delivered),
    appointments: num(r.appointments),
    cashClosings: num(r.cash_closings),
    cashDifference: num(r.cash_difference),
    cashDifferenceAbs: num(r.cash_difference_abs),
    membershipsSold: num(r.memberships_sold),
    membershipRevenue: num(r.membership_revenue),
    errors: num(r.errors),
  };
}

/** RPC sin resultado útil (void o fila borrada): sólo importa el error. */
async function runVoid(call: () => PromiseLike<{ error: unknown }>): Promise<Result<null>> {
  try {
    const { error } = await call();
    return error ? { ok: false, error: toRepoError(error) } : { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toRepoError(error) };
  }
}

export function createPilotRepository(client: MeguiarsSupabaseClient): PilotRepository {
  return {
    readiness(centerId) {
      return run(
        () => client.rpc("center_readiness", { p_detail_center_id: centerId }),
        (raw) => toCenterReadiness(raw as J),
      );
    },
    createCenter(c) {
      return run(
        () =>
          client.rpc("create_detail_center", {
            p_organization_id: c.organizationId,
            p_code: c.code,
            p_name: c.name,
            p_timezone: c.timezone,
            p_reason: c.reason,
          }),
        (row) => ({ id: row.id, code: row.code, name: row.name }),
      );
    },
    baselines(centerIds) {
      return run(
        () =>
          client
            .from("center_baselines")
            .select(
              "id, detail_center_id, metric, value, period_from, period_to, source, version, updated_at",
            )
            .in("detail_center_id", centerIds),
        (rows) =>
          rows
            .filter((r) => (BASELINE_METRICS as readonly string[]).includes(r.metric))
            .map((r): CenterBaseline => ({
              id: r.id,
              detailCenterId: r.detail_center_id,
              metric: r.metric as BaselineMetric,
              value: Number(r.value),
              periodFrom: r.period_from,
              periodTo: r.period_to,
              source: r.source,
              version: r.version,
              updatedAt: r.updated_at,
            })),
      );
    },
    setBaseline(b) {
      return runVoid(() =>
        client.rpc("set_center_baseline", {
          p_detail_center_id: b.detailCenterId,
          p_metric: b.metric,
          p_value: b.value,
          p_period_from: b.periodFrom,
          p_period_to: b.periodTo,
          p_source: b.source,
          p_reason: b.reason,
        }),
      );
    },
    metrics(centerIds, from, to) {
      return run(
        () => client.rpc("pilot_metrics", { p_detail_center_ids: centerIds, p_from: from, p_to: to }),
        (rows) => (rows as unknown as J[]).map(toPilotDay),
      );
    },
    errors(centerIds, limit) {
      return run(
        () =>
          client
            .from("client_error_reports")
            .select("id, detail_center_id, source, name, message, digest, route, occurred_at")
            .in("detail_center_id", centerIds)
            .order("occurred_at", { ascending: false })
            .limit(limit),
        (rows) =>
          rows.map((r): ClientErrorReport => ({
            id: r.id,
            detailCenterId: r.detail_center_id,
            source: r.source === "mobile" ? "mobile" : "web",
            name: r.name,
            message: r.message,
            digest: r.digest,
            route: r.route,
            occurredAt: r.occurred_at,
          })),
      );
    },
    reportError(report, centerId) {
      return runVoid(() =>
        client.rpc("report_client_error", {
          p_source: report.source,
          p_name: report.name,
          p_message: report.message,
          p_digest: report.digest ?? null,
          p_route: report.route ?? null,
          p_detail_center_id: centerId,
        }),
      );
    },
  };
}
