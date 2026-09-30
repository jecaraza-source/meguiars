import {
  fail,
  type CommercialRepository,
  type DiscountLevel,
  type DuplicatePair,
  type FunnelFact,
  type SaleFact,
  type Lead,
  type LeadConsentChannel,
  type LeadContactChannel,
  type LeadEventKind,
  type LeadLossReason,
  type LeadMilestone,
  type LeadSource,
  type LeadStatus,
  type LeadTaskKind,
  type Quote,
  type QuoteFact,
  type QuoteStatus,
} from "@meguiars/domain";
import {
  addQuoteDiscountSchema,
  bookQuoteSchema,
  createLeadSchema,
  createQuoteSchema,
  leadContactSchema,
  leadNoteSchema,
  leadStageSchema,
  leadTaskSchema,
  linkLeadClientSchema,
  loseLeadSchema,
  mergeClientsSchema,
  moveLeadSchema,
  quoteStatusSchema,
  reopenLeadSchema,
  segmentFilterSchema,
  setQuoteItemSchema,
  updateLeadSchema,
  updateQuoteSchema,
  voidQuoteDiscountSchema,
} from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import type { Database } from "../database.types";
import { toRepoError } from "../errors";
import { invalid, run } from "./shared";

type Fns = Database["public"]["Functions"];
type LeadRow = Fns["list_leads"]["Returns"][number];
type QuoteRow = Fns["list_quotes"]["Returns"][number];

const num = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));

export const toLead = (r: LeadRow): Lead => ({
  id: r.id,
  detailCenterId: r.detail_center_id,
  centerName: r.detail_center_name,
  fullName: r.full_name,
  phone: r.phone,
  email: r.email,
  socialHandle: r.social_handle,
  source: r.source_channel as LeadSource,
  sourceDetail: r.source_detail,
  referredByClientId: r.referred_by_client_id,
  referredByName: r.referred_by_name,
  clientId: r.client_id,
  clientName: r.client_name,
  vehicleDescription: r.vehicle_description,
  notes: r.notes,
  consentChannels: (r.consent_channels ?? []) as LeadConsentChannel[],
  estimatedValue: num(r.estimated_value),
  stageId: r.stage_id,
  stageName: r.stage_name,
  stagePosition: r.stage_position,
  status: r.status as LeadStatus,
  ownerId: r.owner_id,
  ownerName: r.owner_name,
  nextAction: r.next_action,
  nextActionOn: r.next_action_on,
  firstContactAt: r.first_contact_at,
  closedAt: r.closed_at,
  wonValue: num(r.won_value),
  serviceOrderId: r.service_order_id,
  serviceOrderFolio: r.service_order_folio,
  lossReason: r.loss_reason as LeadLossReason | null,
  lossNotes: r.loss_notes,
  interestServiceIds: r.interest_service_ids ?? [],
  interestServiceNames: r.interest_service_names ?? [],
  openTasks: r.open_tasks,
  quotes: r.quotes,
  version: r.version,
  createdAt: r.created_at,
  today: r.today,
});

type Obj = Record<string, unknown>;
const asArray = (j: unknown): Obj[] => (Array.isArray(j) ? (j as Obj[]) : []);

export const toQuote = (r: QuoteRow): Quote => ({
  id: r.id,
  detailCenterId: r.detail_center_id,
  centerName: r.detail_center_name,
  folio: r.folio,
  leadId: r.lead_id,
  leadName: r.lead_name,
  clientId: r.client_id,
  clientName: r.client_name,
  vehicleId: r.vehicle_id,
  vehicleLabel: r.vehicle_label,
  contactName: r.contact_name,
  status: r.status as QuoteStatus,
  expired: r.expired,
  validUntil: r.valid_until,
  subtotal: Number(r.subtotal),
  discountTotal: Number(r.discount_total),
  total: Number(r.total),
  standardCostTotal: Number(r.standard_cost_total),
  operatorPayTotal: Number(r.operator_pay_total),
  costTotal: Number(r.cost_total),
  contributionMargin: Number(r.contribution_margin),
  notes: r.notes,
  appointmentId: r.appointment_id,
  appointmentStartsAt: r.appointment_starts_at,
  serviceOrderId: r.service_order_id,
  serviceOrderFolio: r.service_order_folio,
  sentAt: r.sent_at,
  decidedAt: r.decided_at,
  decisionReason: r.decision_reason,
  items: asArray(r.items).map((i) => ({
    id: String(i.id),
    serviceId: String(i.service_id),
    serviceCode: String(i.service_code),
    serviceName: String(i.service_name),
    revenueEngine: String(i.revenue_engine),
    unitPrice: Number(i.unit_price),
    priceSource: i.price_source as "base" | "center",
    unitDirectCost: Number(i.unit_direct_cost),
    operatorCommissionPct: num(i.operator_commission_pct as number | null),
    durationMinutes: Number(i.duration_minutes),
    quantity: Number(i.quantity),
    lineSubtotal: Number(i.line_subtotal),
    lineDiscount: Number(i.line_discount),
    operatorPay: Number(i.operator_pay),
    currentPrice: num(i.current_price as number | null),
  })),
  discounts: asArray(r.discounts).map((d) => ({
    id: String(d.id),
    itemId: (d.item_id as string | null) ?? null,
    kind: d.kind as "percent" | "amount",
    value: Number(d.value),
    amount: Number(d.amount),
    reason: String(d.reason),
    authorizationLevel: d.authorization_level as DiscountLevel,
    authorizedByName: (d.authorized_by_name as string | null) ?? null,
    voidedAt: (d.voided_at as string | null) ?? null,
    voidReason: (d.void_reason as string | null) ?? null,
    createdAt: String(d.created_at),
  })),
  version: r.version,
  createdByName: r.created_by_name,
  createdAt: r.created_at,
});

async function done(call: () => PromiseLike<{ error: unknown }>) {
  try {
    const { error } = await call();
    return error ? { ok: false as const, error: toRepoError(error) } : { ok: true as const, data: undefined };
  } catch (error) {
    return { ok: false as const, error: toRepoError(error) };
  }
}

const versionOf = (row: { version: number }) => ({ version: row.version });

/** Adaptador Supabase del puerto `CommercialRepository`. Lecturas y escrituras por RPC. */
export function createCommercialRepository(client: MeguiarsSupabaseClient): CommercialRepository {
  return {
    stages(organizationId) {
      return run(
        () => client.from("lead_stages").select("*").eq("organization_id", organizationId).order("position"),
        (rows) =>
          rows.map((s) => ({
            id: s.id,
            organizationId: s.organization_id,
            code: s.code,
            name: s.name,
            kind: s.kind as LeadStatus,
            milestone: s.milestone as LeadMilestone | null,
            position: s.position,
            active: s.active,
          })),
      );
    },

    leads(detailCenterIds, filter = {}) {
      return run(
        () =>
          client.rpc("list_leads", {
            p_detail_center_ids: detailCenterIds,
            p_status: filter.status ?? null,
            p_stage_id: filter.stageId ?? null,
            p_owner_id: filter.ownerId ?? null,
            p_source_channel: filter.source ?? null,
            p_query: filter.query ?? null,
          }),
        (rows) => rows.map(toLead),
      );
    },

    async lead(id, detailCenterIds) {
      const r = await run(
        () => client.rpc("list_leads", { p_detail_center_ids: detailCenterIds, p_id: id }),
        (rows) => rows.map(toLead),
      );
      if (!r.ok) return r;
      return r.data[0]
        ? { ok: true, data: r.data[0] }
        : fail("not_found", "El prospecto no existe o no tienes acceso.");
    },

    leadTimeline(id) {
      return run(
        () => client.rpc("lead_timeline", { p_id: id }),
        (rows) =>
          rows.map((e) => ({
            seq: Number(e.seq),
            kind: e.kind as LeadEventKind,
            occurredAt: e.occurred_at,
            actorName: e.actor_name,
            fromStageName: e.from_stage_name,
            toStageName: e.to_stage_name,
            value: num(e.value),
            ownerName: e.owner_name,
            channel: e.channel as LeadContactChannel | null,
            quoteId: e.quote_id,
            quoteFolio: e.quote_folio,
            appointmentId: e.appointment_id,
            serviceOrderId: e.service_order_id,
            serviceOrderFolio: e.service_order_folio,
            note: e.note,
          })),
      );
    },

    leadTasks(id) {
      return run(
        () =>
          client
            .from("crm_tasks")
            .select("id, kind, channel, status, due_on, notes, outcome, assigned_to, completed_at")
            .eq("lead_id", id)
            .order("status", { ascending: false })
            .order("due_on"),
        (rows) =>
          rows.map((t) => ({
            id: t.id,
            kind: t.kind as LeadTaskKind,
            channel: t.channel,
            status: t.status as "pendiente" | "hecha" | "cancelada",
            dueOn: t.due_on,
            notes: t.notes,
            outcome: t.outcome,
            assignedTo: t.assigned_to,
            completedAt: t.completed_at,
          })),
      );
    },

    leadOwners(detailCenterId) {
      return run(
        () => client.rpc("lead_owners", { p_detail_center_id: detailCenterId }),
        (rows) => rows.map((o) => ({ userId: o.user_id, fullName: o.full_name })),
      );
    },

    leadMatches(detailCenterId, phone, email, excludeLeadId) {
      if (!phone && !email) return Promise.resolve({ ok: true, data: [] });
      return run(
        () =>
          client.rpc("lead_matches", {
            p_detail_center_id: detailCenterId,
            p_phone: phone ?? null,
            p_email: email ?? null,
            p_exclude_lead_id: excludeLeadId ?? null,
          }),
        (rows) =>
          rows.map((m) => ({
            kind: m.kind as "prospecto" | "cliente",
            id: m.id,
            displayName: m.display_name,
            detail: m.detail,
            matchedOn: m.matched_on as ("telefono" | "email")[],
          })),
      );
    },

    createLead(command) {
      const parsed = createLeadSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("create_lead", {
            p_detail_center_id: c.detailCenterId,
            p_request_id: c.requestId,
            p_full_name: c.fullName,
            p_source_channel: c.source,
            p_phone: c.phone ?? null,
            p_email: c.email ?? null,
            p_social_handle: c.socialHandle ?? null,
            p_source_detail: c.sourceDetail ?? null,
            p_referred_by_client_id: c.referredByClientId ?? null,
            p_client_id: c.clientId ?? null,
            p_interest_service_ids: c.interestServiceIds,
            p_vehicle_description: c.vehicleDescription ?? null,
            p_notes: c.notes ?? null,
            p_consent_channels: c.consentChannels,
            p_estimated_value: c.estimatedValue ?? null,
            p_owner_id: c.ownerId ?? null,
            p_next_action: c.nextAction ?? null,
            p_next_action_on: c.nextActionOn ?? null,
          }),
        (row) => ({ id: row.id }),
      );
    },

    updateLead(command) {
      const parsed = updateLeadSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("update_lead", {
            p_id: c.id,
            p_version: c.version,
            p_full_name: c.fullName,
            p_phone: c.phone ?? null,
            p_email: c.email ?? null,
            p_social_handle: c.socialHandle ?? null,
            p_source_channel: c.source,
            p_source_detail: c.sourceDetail ?? null,
            p_interest_service_ids: c.interestServiceIds,
            p_vehicle_description: c.vehicleDescription ?? null,
            p_notes: c.notes ?? null,
            p_consent_channels: c.consentChannels,
            p_estimated_value: c.estimatedValue ?? null,
            p_owner_id: c.ownerId ?? null,
            p_next_action: c.nextAction ?? null,
            p_next_action_on: c.nextActionOn ?? null,
            p_reason: c.reason,
          }),
        versionOf,
      );
    },

    logContact(id, version, channel, note) {
      const parsed = leadContactSchema.safeParse({ id, version, channel, note });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("log_lead_contact", {
            p_id: c.id,
            p_version: c.version,
            p_channel: c.channel,
            p_note: c.note ?? null,
          }),
        versionOf,
      );
    },

    moveLead(id, version, stageId, note) {
      const parsed = moveLeadSchema.safeParse({ id, version, stageId, note });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("move_lead_stage", {
            p_id: c.id,
            p_version: c.version,
            p_stage_id: c.stageId,
            p_note: c.note ?? null,
          }),
        versionOf,
      );
    },

    addLeadNote(id, note) {
      const parsed = leadNoteSchema.safeParse({ id, note });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return done(() => client.rpc("add_lead_note", { p_id: parsed.data.id, p_note: parsed.data.note }));
    },

    loseLead(id, version, reason, notes) {
      const parsed = loseLeadSchema.safeParse({ id, version, reason, notes });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("lose_lead", {
            p_id: c.id,
            p_version: c.version,
            p_reason: c.reason,
            p_notes: c.notes ?? null,
          }),
        versionOf,
      );
    },

    reopenLead(id, version, stageId, reason) {
      const parsed = reopenLeadSchema.safeParse({ id, version, stageId, reason });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("reopen_lead", {
            p_id: c.id,
            p_version: c.version,
            p_stage_id: c.stageId,
            p_reason: c.reason,
          }),
        versionOf,
      );
    },

    winLead(id, version, serviceOrderId) {
      return run(
        () => client.rpc("win_lead", { p_id: id, p_version: version, p_service_order_id: serviceOrderId }),
        versionOf,
      );
    },

    linkLeadClient(id, version, clientId, reason) {
      const parsed = linkLeadClientSchema.safeParse({ id, version, clientId, reason });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("link_lead_client", {
            p_id: c.id,
            p_version: c.version,
            p_client_id: c.clientId,
            p_reason: c.reason,
          }),
        versionOf,
      );
    },

    createLeadTask(command) {
      const parsed = leadTaskSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("create_lead_task", {
            p_id: c.leadId,
            p_request_id: c.requestId,
            p_kind: c.kind,
            p_due_on: c.dueOn,
            p_notes: c.notes ?? null,
            p_assigned_to: c.assignedTo ?? null,
          }),
        (row) => ({ id: row.id }),
      );
    },

    upsertStage(command) {
      const parsed = leadStageSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("upsert_lead_stage", {
            p_organization_id: c.organizationId,
            p_id: c.id ?? null,
            p_code: c.code,
            p_name: c.name,
            p_position: c.position,
            p_milestone: c.milestone,
            p_active: c.active,
            p_reason: c.reason,
          }),
        (row) => ({ id: row.id }),
      );
    },

    quotes(detailCenterIds, filter = {}) {
      return run(
        () =>
          client.rpc("list_quotes", {
            p_detail_center_ids: detailCenterIds,
            p_status: filter.status ?? null,
            p_lead_id: filter.leadId ?? null,
            p_client_id: filter.clientId ?? null,
          }),
        (rows) => rows.map(toQuote),
      );
    },

    async quote(id, detailCenterIds) {
      const r = await run(
        () => client.rpc("list_quotes", { p_detail_center_ids: detailCenterIds, p_id: id }),
        (rows) => rows.map(toQuote),
      );
      if (!r.ok) return r;
      return r.data[0]
        ? { ok: true, data: r.data[0] }
        : fail("not_found", "La cotización no existe o no tienes acceso.");
    },

    createQuote(command) {
      const parsed = createQuoteSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("create_quote", {
            p_detail_center_id: c.detailCenterId,
            p_request_id: c.requestId,
            p_items: c.items.map((i) => ({ service_id: i.serviceId, quantity: i.quantity })),
            p_lead_id: c.leadId ?? null,
            p_client_id: c.clientId ?? null,
            p_vehicle_id: c.vehicleId ?? null,
            p_valid_days: c.validDays ?? null,
            p_notes: c.notes ?? null,
          }),
        (row) => ({ id: row.id, folio: row.folio }),
      );
    },

    setQuoteItem(quoteId, version, serviceId, quantity) {
      const parsed = setQuoteItemSchema.safeParse({ quoteId, version, serviceId, quantity });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("set_quote_item", {
            p_quote_id: c.quoteId,
            p_version: c.version,
            p_service_id: c.serviceId,
            p_quantity: c.quantity,
          }),
        versionOf,
      );
    },

    addQuoteDiscount(command) {
      const parsed = addQuoteDiscountSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("add_quote_discount", {
            p_quote_id: c.quoteId,
            p_version: c.version,
            p_item_id: c.itemId ?? null,
            p_kind: c.kind,
            p_value: c.value,
            p_reason: c.reason,
          }),
        versionOf,
      );
    },

    voidQuoteDiscount(quoteId, version, discountId, reason) {
      const parsed = voidQuoteDiscountSchema.safeParse({ quoteId, version, discountId, reason });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("void_quote_discount", {
            p_quote_id: c.quoteId,
            p_version: c.version,
            p_discount_id: c.discountId,
            p_reason: c.reason,
          }),
        versionOf,
      );
    },

    setQuoteStatus(quoteId, version, status, reason) {
      const parsed = quoteStatusSchema.safeParse({ quoteId, version, status, reason });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("set_quote_status", {
            p_quote_id: c.quoteId,
            p_version: c.version,
            p_status: c.status,
            p_reason: c.reason ?? null,
          }),
        versionOf,
      );
    },

    updateQuote(quoteId, version, vehicleId, validUntil, notes, reason) {
      const parsed = updateQuoteSchema.safeParse({ quoteId, version, vehicleId, validUntil, notes, reason });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("update_quote", {
            p_quote_id: c.quoteId,
            p_version: c.version,
            p_vehicle_id: c.vehicleId ?? null,
            p_valid_until: c.validUntil,
            p_notes: c.notes ?? null,
            p_reason: c.reason,
          }),
        versionOf,
      );
    },

    bookQuote(command) {
      const parsed = bookQuoteSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("book_quote", {
            p_quote_id: c.quoteId,
            p_version: c.version,
            p_request_id: c.requestId,
            p_starts_at: c.startsAt,
            p_vehicle_id: c.vehicleId ?? null,
            p_bay_id: c.bayId ?? null,
            p_technician_id: c.technicianId ?? null,
            p_notes: c.notes ?? null,
          }),
        (row) => ({ appointmentId: row.id }),
      );
    },

    duplicates(detailCenterIds) {
      return run(
        () => client.rpc("client_duplicate_candidates", { p_detail_center_ids: detailCenterIds }),
        (rows): DuplicatePair[] =>
          rows.map((r) => ({
            a: {
              clientId: r.client_a_id,
              name: r.client_a_name,
              phone: r.client_a_phone,
              email: r.client_a_email,
              createdAt: r.client_a_created_at,
              orders: r.client_a_orders,
              activeMemberships: r.client_a_active_memberships,
              b2b: r.client_a_b2b,
            },
            b: {
              clientId: r.client_b_id,
              name: r.client_b_name,
              phone: r.client_b_phone,
              email: r.client_b_email,
              createdAt: r.client_b_created_at,
              orders: r.client_b_orders,
              activeMemberships: r.client_b_active_memberships,
              b2b: r.client_b_b2b,
            },
            matchedOn: r.matched_on as DuplicatePair["matchedOn"],
            nameSimilarity: Number(r.name_similarity),
          })),
      );
    },

    mergeClients(keepClientId, mergeClientId, reason) {
      const parsed = mergeClientsSchema.safeParse({ keepClientId, mergeClientId, reason });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return done(() =>
        client.rpc("merge_clients", {
          p_keep_client_id: c.keepClientId,
          p_merge_client_id: c.mergeClientId,
          p_reason: c.reason,
        }),
      );
    },

    segment(detailCenterIds, filter) {
      const parsed = segmentFilterSchema.safeParse(filter);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const f = parsed.data;
      return run(
        () =>
          client.rpc("commercial_segment", {
            p_detail_center_ids: detailCenterIds,
            p_service_ids: f.serviceIds.length ? f.serviceIds : null,
            p_interest_service_ids: f.interestServiceIds.length ? f.interestServiceIds : null,
            p_min_visits: f.minVisits ?? null,
            p_min_spend: f.minSpend ?? null,
            p_max_spend: f.maxSpend ?? null,
            p_min_days_since_visit: f.minDaysSinceVisit ?? null,
            p_max_days_since_visit: f.maxDaysSinceVisit ?? null,
            p_consent_channel: f.consentChannel ?? null,
          }),
        (rows) =>
          rows.map((r) => ({
            clientId: r.client_id,
            fullName: r.full_name,
            phone: r.phone,
            email: r.email,
            homeCenterName: r.home_center_name,
            visits: r.visits,
            firstVisitAt: r.first_visit_at,
            lastVisitAt: r.last_visit_at,
            daysSinceLastVisit: r.days_since_last_visit,
            avgDaysBetweenVisits: num(r.avg_days_between_visits),
            totalSpend: Number(r.total_spend),
            avgTicket: num(r.avg_ticket),
            serviceNames: r.service_names ?? [],
            interestNames: r.interest_names ?? [],
            consentChannels: r.consent_channels ?? [],
          })),
      );
    },

    funnelFacts(detailCenterIds, from, to) {
      return run(
        () =>
          client.rpc("commercial_funnel_facts", {
            p_detail_center_ids: detailCenterIds,
            p_from: from,
            p_to: to,
          }),
        (rows): FunnelFact[] =>
          rows.map((r) => ({
            leadId: r.lead_id,
            detailCenterId: r.detail_center_id,
            source: r.source_channel as LeadSource,
            ownerId: r.owner_id,
            createdAt: r.created_at,
            firstContactMinutes: num(r.first_contact_minutes),
            quotedAt: r.quoted_at,
            bookedAt: r.booked_at,
            wonAt: r.won_at,
            lostAt: r.lost_at,
            lossReason: r.loss_reason as LeadLossReason | null,
            status: r.status as LeadStatus,
            saleTotal: num(r.sale_total),
            saleCost: num(r.sale_cost),
            saleMargin: num(r.sale_margin),
            interestServiceIds: r.interest_service_ids ?? [],
            campaignId: r.campaign_id,
            stageName: r.stage_name,
            stagePosition: r.stage_position,
          })),
      );
    },

    salesFacts(detailCenterIds, from, to) {
      return run(
        () =>
          client.rpc("commercial_sales_facts", {
            p_detail_center_ids: detailCenterIds,
            p_from: from,
            p_to: to,
          }),
        (rows): SaleFact[] =>
          rows.map((r) => ({
            orderId: r.service_order_id,
            detailCenterId: r.detail_center_id,
            deliveredOn: r.delivered_on,
            total: Number(r.total),
            cost: Number(r.cost_total),
            margin: Number(r.margin),
            discountTotal: Number(r.discount_total),
            clientId: r.client_id,
            firstPurchase: r.first_purchase,
            leadId: r.lead_id,
            source: r.source_channel as LeadSource | null,
            ownerId: r.owner_id,
            campaignId: r.campaign_id,
            serviceIds: r.service_ids ?? [],
          })),
      );
    },

    quoteFacts(detailCenterIds, from, to) {
      return run(
        () =>
          client.rpc("commercial_quote_facts", {
            p_detail_center_ids: detailCenterIds,
            p_from: from,
            p_to: to,
          }),
        (rows): QuoteFact[] =>
          rows.map((r) => ({
            quoteId: r.quote_id,
            detailCenterId: r.detail_center_id,
            fromLead: r.from_lead,
            source: r.source_channel as LeadSource | null,
            status: r.status as QuoteStatus,
            expired: r.expired,
            createdAt: r.created_at,
            total: Number(r.total),
            discountTotal: Number(r.discount_total),
            costTotal: Number(r.cost_total),
            contributionMargin: Number(r.contribution_margin),
            booked: r.booked,
            orderStatus: r.order_status,
            orderTotal: num(r.order_total),
            orderMargin: num(r.order_margin),
          })),
      );
    },
  };
}
