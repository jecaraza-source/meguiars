import {
  fail,
  type BenefitBalance,
  type FrozenBenefit,
  type Membership,
  type MembershipEvent,
  type MembershipEventKind,
  type MembershipListItem,
  type MembershipMetricFact,
  type MembershipPlan,
  type MembershipRedemption,
  type MembershipRepository,
  type MembershipStatus,
  type PeriodMonths,
  type PlanTier,
  type RedeemScope,
} from "@meguiars/domain";
import {
  createMembershipSchema,
  membershipBenefitSchema,
  membershipPlanSchema,
  membershipStateSchema,
  redeemBenefitSchema,
  renewMembershipSchema,
  voidRedemptionSchema,
} from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import type { Json, Tables } from "../database.types";
import { toRepoError } from "../errors";
import { invalid, run } from "./shared";

type PlanRow = Tables<"membership_plans"> & {
  membership_benefits:
    (Tables<"membership_benefits"> & { services: { code: string; name: string } | null })[] | null;
};

const toPlan = (row: PlanRow): MembershipPlan => ({
  id: row.id,
  organizationId: row.organization_id,
  code: row.code,
  tier: row.tier as PlanTier,
  name: row.name,
  description: row.description,
  price: Number(row.price),
  periodMonths: row.period_months as PeriodMonths,
  redeemScope: row.redeem_scope as RedeemScope,
  restrictions: row.restrictions,
  renewalNoticeDays: row.renewal_notice_days,
  availableFrom: row.available_from,
  availableUntil: row.available_until,
  active: row.active,
  benefits: (row.membership_benefits ?? [])
    .map((b) => ({
      id: b.id,
      serviceId: b.service_id,
      serviceCode: b.services?.code ?? "",
      serviceName: b.services?.name ?? "",
      quantityPerPeriod: b.quantity_per_period,
      notes: b.notes,
    }))
    .sort((a, b) => a.serviceName.localeCompare(b.serviceName)),
});

const toFrozen = (benefits: Json): FrozenBenefit[] =>
  (Array.isArray(benefits) ? benefits : []).map((b) => {
    const x = b as Record<string, unknown>;
    return {
      benefitId: String(x["benefit_id"] ?? ""),
      serviceId: String(x["service_id"] ?? ""),
      serviceCode: String(x["service_code"] ?? ""),
      serviceName: String(x["service_name"] ?? ""),
      quantityPerPeriod: Number(x["quantity_per_period"] ?? 0),
    };
  });

export const toMembership = (row: Tables<"memberships">): Membership => ({
  id: row.id,
  organizationId: row.organization_id,
  detailCenterId: row.detail_center_id,
  number: row.number,
  planId: row.plan_id,
  clientId: row.client_id,
  vehicleId: row.vehicle_id,
  state: row.state,
  planCode: row.plan_code,
  planName: row.plan_name,
  planTier: row.plan_tier as PlanTier,
  price: Number(row.price),
  periodMonths: row.period_months as PeriodMonths,
  redeemScope: row.redeem_scope as RedeemScope,
  renewalNoticeDays: row.renewal_notice_days,
  benefits: toFrozen(row.benefits),
  startedOn: row.started_on,
  periodAnchor: row.period_anchor,
  endsOn: row.ends_on,
  renewals: row.renewals,
  autoRenew: row.auto_renew,
  cancelReason: row.cancel_reason,
  createdAt: row.created_at,
});

const toRedemption = (row: Tables<"membership_redemptions">): MembershipRedemption => ({
  id: row.id,
  membershipId: row.membership_id,
  detailCenterId: row.detail_center_id,
  serviceOrderId: row.service_order_id,
  itemId: row.item_id,
  serviceCode: row.service_code,
  serviceName: row.service_name,
  quantity: row.quantity,
  amount: Number(row.amount),
  periodStart: row.period_start,
  periodEnd: row.period_end,
  redeemedAt: row.redeemed_at,
  voidedAt: row.voided_at,
  voidReason: row.void_reason,
});

const toEvent = (row: Tables<"membership_events">): MembershipEvent => ({
  id: row.id,
  kind: row.kind as MembershipEventKind,
  detailCenterId: row.detail_center_id,
  fromState: row.from_state,
  toState: row.to_state,
  planCode: row.plan_code,
  amount: row.amount === null ? null : Number(row.amount),
  periodStart: row.period_start,
  periodEnd: row.period_end,
  reason: row.reason,
  data:
    row.data && typeof row.data === "object" && !Array.isArray(row.data)
      ? (row.data as Record<string, unknown>)
      : null,
  actorId: row.actor_id,
  occurredAt: row.occurred_at,
});

type BalanceRow = {
  service_id: string;
  service_code: string;
  service_name: string;
  quantity_per_period: number;
  used: number;
  remaining: number;
  period_start: string | null;
  period_end: string | null;
};
const toBalance = (r: BalanceRow): BenefitBalance => ({
  serviceId: r.service_id,
  serviceCode: r.service_code,
  serviceName: r.service_name,
  quantityPerPeriod: r.quantity_per_period,
  used: r.used,
  remaining: r.remaining,
  periodStart: r.period_start,
  periodEnd: r.period_end,
});

const PLAN_SELECT = "*, membership_benefits(*, services(code, name))";

/**
 * Adaptador Supabase del puerto `MembershipRepository`. Toda mutación va por
 * RPC (motivo, auditoría, idempotencia); las lecturas respetan la RLS.
 */
export function createMembershipRepository(client: MeguiarsSupabaseClient): MembershipRepository {
  async function balance(membershipId: string) {
    const { data, error } = await client.rpc("membership_balance", { p_membership_id: membershipId });
    if (error) return { ok: false as const, error: toRepoError(error) };
    return { ok: true as const, data: (data ?? []).map(toBalance) };
  }

  function getPlan(planId: string) {
    return run(
      () => client.from("membership_plans").select(PLAN_SELECT).eq("id", planId).maybeSingle(),
      (row) => toPlan(row as unknown as PlanRow),
    );
  }

  return {
    listPlans(organizationId, options = {}) {
      return run(
        () => {
          const q = client.from("membership_plans").select(PLAN_SELECT).eq("organization_id", organizationId);
          return (options.includeInactive ? q : q.eq("active", true)).order("price");
        },
        (rows) => (rows as unknown as PlanRow[]).map(toPlan),
      );
    },

    getPlan,

    async upsertPlan(command) {
      const parsed = membershipPlanSchema.safeParse(command);
      if (!parsed.success) return invalid(parsed.error);
      const c = parsed.data;
      const saved = await run(
        () =>
          client.rpc("upsert_membership_plan", {
            p_organization_id: c.organizationId,
            p_id: c.id ?? null,
            p_code: c.code,
            p_tier: c.tier,
            p_name: c.name,
            p_description: c.description ?? null,
            p_price: c.price,
            p_period_months: c.periodMonths,
            p_redeem_scope: c.redeemScope,
            p_restrictions: c.restrictions ?? null,
            p_renewal_notice_days: c.renewalNoticeDays,
            p_available_from: c.availableFrom ?? null,
            p_available_until: c.availableUntil ?? null,
            p_active: c.active,
            p_reason: c.reason,
          }),
        (row) => row.id,
      );
      return saved.ok ? getPlan(saved.data) : saved;
    },

    async setBenefit(command) {
      const parsed = membershipBenefitSchema.safeParse(command);
      if (!parsed.success) return invalid(parsed.error);
      const c = parsed.data;
      try {
        const { error } = await client.rpc("set_membership_benefit", {
          p_plan_id: c.planId,
          p_service_id: c.serviceId,
          p_quantity_per_period: c.quantityPerPeriod ?? null,
          p_notes: c.notes ?? null,
          p_reason: c.reason,
        });
        return error ? { ok: false, error: toRepoError(error) } : { ok: true, data: undefined };
      } catch (error) {
        return { ok: false, error: toRepoError(error) };
      }
    },

    list(detailCenterId, filter = {}) {
      return run(
        () =>
          client.rpc("list_memberships", {
            p_detail_center_id: detailCenterId,
            ...(filter.status ? { p_status: filter.status } : {}),
            ...(filter.query ? { p_query: filter.query } : {}),
          }),
        (rows): MembershipListItem[] =>
          rows.map((r) => ({
            id: r.id,
            number: r.number,
            state: r.state,
            status: r.status as MembershipStatus,
            planCode: r.plan_code,
            planName: r.plan_name,
            planTier: r.plan_tier as PlanTier,
            price: Number(r.price),
            periodMonths: r.period_months as PeriodMonths,
            clientId: r.client_id,
            clientName: r.client_name,
            vehicleId: r.vehicle_id,
            vehicleLabel: r.vehicle_label,
            startedOn: r.started_on,
            endsOn: r.ends_on,
            renewals: r.renewals,
          })),
      );
    },

    async get(membershipId) {
      try {
        const [row, bal, redemptions, events] = await Promise.all([
          client
            .from("memberships")
            .select("*, clients(full_name), vehicles(make, model, year, plate)")
            .eq("id", membershipId)
            .maybeSingle(),
          balance(membershipId),
          client
            .from("membership_redemptions")
            .select("*")
            .eq("membership_id", membershipId)
            .order("redeemed_at", { ascending: false }),
          client
            .from("membership_events")
            .select("*")
            .eq("membership_id", membershipId)
            .order("occurred_at", { ascending: false })
            .order("id", { ascending: false }),
        ]);
        if (row.error) return { ok: false, error: toRepoError(row.error) };
        if (!row.data) return fail("not_found", "La membresía no existe o no tienes acceso.");
        if (!bal.ok) return bal;
        const failed = [redemptions, events].find((r) => r.error);
        if (failed?.error) return { ok: false, error: toRepoError(failed.error) };
        const data = row.data as unknown as Tables<"memberships"> & {
          clients: { full_name: string } | null;
          vehicles: { make: string; model: string; year: number; plate: string } | null;
        };
        const v = data.vehicles;
        return {
          ok: true,
          data: {
            membership: toMembership(data),
            clientName: data.clients?.full_name ?? "—",
            vehicleLabel: v ? `${v.make} ${v.model} ${v.year} · ${v.plate}` : "—",
            balance: bal.data,
            redemptions: (redemptions.data ?? []).map(toRedemption),
            events: (events.data ?? []).map(toEvent),
          },
        };
      } catch (error) {
        return { ok: false, error: toRepoError(error) };
      }
    },

    async forVehicle(vehicleId) {
      try {
        const { data, error } = await client
          .from("memberships")
          .select("*")
          .eq("vehicle_id", vehicleId)
          .neq("state", "cancelada")
          .maybeSingle();
        if (error) return { ok: false, error: toRepoError(error) };
        if (!data) return { ok: true, data: null };
        const bal = await balance(data.id);
        if (!bal.ok) return bal;
        return { ok: true, data: { membership: toMembership(data), balance: bal.data } };
      } catch (error) {
        return { ok: false, error: toRepoError(error) };
      }
    },

    redemptionsForOrder(orderId) {
      return run(
        () =>
          client
            .from("membership_redemptions")
            .select("*")
            .eq("service_order_id", orderId)
            .order("redeemed_at", { ascending: false }),
        (rows) => rows.map(toRedemption),
      );
    },

    create(command) {
      const parsed = createMembershipSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("create_membership", {
            p_detail_center_id: c.detailCenterId,
            p_request_id: c.requestId,
            p_plan_id: c.planId,
            p_client_id: c.clientId,
            p_vehicle_id: c.vehicleId,
            ...(c.startsOn ? { p_starts_on: c.startsOn } : {}),
            ...(c.paymentReference ? { p_payment_reference: c.paymentReference } : {}),
          }),
        toMembership,
      );
    },

    renew(command) {
      const parsed = renewMembershipSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("renew_membership", {
            p_membership_id: c.membershipId,
            p_request_id: c.requestId,
            ...(c.planId ? { p_plan_id: c.planId } : {}),
            ...(c.paymentReference ? { p_payment_reference: c.paymentReference } : {}),
          }),
        toMembership,
      );
    },

    setState(command) {
      const parsed = membershipStateSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("set_membership_state", {
            p_membership_id: c.membershipId,
            p_state: c.state,
            p_reason: c.reason,
          }),
        toMembership,
      );
    },

    redeem(command) {
      const parsed = redeemBenefitSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("redeem_membership_benefit", {
            p_order_id: c.orderId,
            p_version: c.version,
            p_item_id: c.itemId,
            p_membership_id: c.membershipId,
            p_quantity: c.quantity,
            p_request_id: c.requestId,
          }),
        toRedemption,
      );
    },

    voidRedemption(redemptionId, version, reason) {
      const parsed = voidRedemptionSchema.safeParse({ redemptionId, version, reason });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () =>
          client.rpc("void_membership_redemption", {
            p_redemption_id: parsed.data.redemptionId,
            p_version: parsed.data.version,
            p_reason: parsed.data.reason,
          }),
        toRedemption,
      );
    },

    metricFacts(detailCenterIds, from, to) {
      return run(
        () =>
          client.rpc("membership_metric_facts", {
            p_detail_center_ids: detailCenterIds,
            p_from: from,
            p_to: to,
          }),
        (rows): MembershipMetricFact[] =>
          rows.map((r) => ({
            detailCenterId: r.detail_center_id,
            membershipId: r.membership_id,
            status: r.status as MembershipStatus,
            price: Number(r.price),
            periodMonths: r.period_months,
            startedOn: r.started_on,
            endsOn: r.ends_on,
            entitledUnits: r.entitled_units,
            usedUnits: r.used_units,
            newInRange: r.new_in_range,
            renewalsInRange: r.renewals_in_range,
            cancelledInRange: r.cancelled_in_range,
            expiredInRange: r.expired_in_range,
            revenueInRange: Number(r.revenue_in_range),
          })),
      );
    },
  };
}
