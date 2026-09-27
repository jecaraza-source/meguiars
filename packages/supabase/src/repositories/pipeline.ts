import {
  fail,
  type BillingModel,
  type LossReason,
  type Opportunity,
  type OpportunityEventKind,
  type OpportunityKind,
  type OpportunitySource,
  type OpportunityStatus,
  type OpportunityTaskKind,
  type PipelineRepository,
  type VehicleRule,
} from "@meguiars/domain";
import {
  createOpportunitySchema,
  loseOpportunitySchema,
  moveOpportunitySchema,
  opportunityNoteSchema,
  opportunityTaskSchema,
  pipelineStageSchema,
  reopenOpportunitySchema,
  updateOpportunitySchema,
  winOpportunitySchema,
} from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import type { Database, Json } from "../database.types";
import { toRepoError } from "../errors";
import { invalid, run } from "./shared";

type OpportunityRow = Database["public"]["Functions"]["list_opportunities"]["Returns"][number];

const num = (v: number | string | null) => (v === null ? null : Number(v));

const toOpportunity = (r: OpportunityRow): Opportunity => ({
  id: r.id,
  organizationId: r.organization_id,
  detailCenterId: r.detail_center_id,
  centerName: r.center_name,
  kind: r.kind as OpportunityKind,
  title: r.title,
  displayName: r.display_name,
  clientId: r.client_id,
  b2bAccountId: r.b2b_account_id,
  prospect: {
    companyName: r.company_name,
    legalName: r.legal_name,
    rfc: r.rfc,
    contactName: r.contact_name,
    contactTitle: r.contact_title,
    contactPhone: r.contact_phone,
    contactEmail: r.contact_email,
  },
  estimatedValue: Number(r.estimated_value),
  stageId: r.stage_id,
  stageName: r.stage_name,
  stagePosition: r.stage_position,
  stageProbability: r.stage_probability,
  status: r.status as OpportunityStatus,
  ownerId: r.owner_id,
  ownerName: r.owner_name,
  nextAction: r.next_action,
  nextActionOn: r.next_action_on,
  expectedCloseOn: r.expected_close_on,
  source: r.source as OpportunitySource | null,
  proposal: {
    billingModel: r.proposed_billing_model as BillingModel | null,
    months: r.proposed_months,
    vehicleRule: r.proposed_vehicle_rule as VehicleRule | null,
    paymentTermsDays: r.proposed_payment_terms_days,
    creditLimit: num(r.proposed_credit_limit),
    feeAmount: num(r.proposed_fee_amount),
    includedUnits: r.proposed_included_units,
  },
  notes: r.notes,
  closedAt: r.closed_at,
  wonValue: num(r.won_value),
  lossReason: r.loss_reason as LossReason | null,
  lossNotes: r.loss_notes,
  convertedAccountId: r.converted_account_id,
  convertedAgreementId: r.converted_agreement_id,
  openTasks: r.open_tasks,
  version: r.version,
  createdAt: r.created_at,
  today: r.today,
});

/** Prospecto y propuesta en el formato jsonb de las RPC (null = sin dato). */
const prospectJson = (p: Record<string, unknown> | undefined): Json => ({
  company_name: (p?.companyName as string | undefined) ?? null,
  legal_name: (p?.legalName as string | undefined) ?? null,
  rfc: (p?.rfc as string | undefined) ?? null,
  contact_name: (p?.contactName as string | undefined) ?? null,
  contact_title: (p?.contactTitle as string | undefined) ?? null,
  contact_phone: (p?.contactPhone as string | undefined) ?? null,
  contact_email: (p?.contactEmail as string | undefined) ?? null,
});

const proposalJson = (p: Record<string, unknown> | undefined): Json =>
  p?.billingModel
    ? {
        billing_model: p.billingModel as string,
        months: (p.months as number | undefined) ?? null,
        vehicle_rule: (p.vehicleRule as string | undefined) ?? null,
        payment_terms_days: (p.paymentTermsDays as number | undefined) ?? null,
        credit_limit: (p.creditLimit as number | undefined) ?? null,
        fee_amount: (p.feeAmount as number | undefined) ?? null,
        included_units: (p.includedUnits as number | undefined) ?? null,
      }
    : {};

async function done(call: () => PromiseLike<{ error: unknown }>) {
  try {
    const { error } = await call();
    return error ? { ok: false as const, error: toRepoError(error) } : { ok: true as const, data: undefined };
  } catch (error) {
    return { ok: false as const, error: toRepoError(error) };
  }
}

/**
 * Adaptador Supabase del puerto `PipelineRepository`. Lecturas por RPC (con
 * nombres de etapa y responsable); todas las mutaciones por RPC con historial
 * y auditoría. Ganar B2B convierte en cuenta/convenio en la base.
 */
export function createPipelineRepository(client: MeguiarsSupabaseClient): PipelineRepository {
  return {
    stages(organizationId) {
      return run(
        () =>
          client.from("pipeline_stages").select("*").eq("organization_id", organizationId).order("position"),
        (rows) =>
          rows.map((s) => ({
            id: s.id,
            organizationId: s.organization_id,
            code: s.code,
            name: s.name,
            kind: s.kind as OpportunityStatus,
            position: s.position,
            probability: s.probability,
            active: s.active,
          })),
      );
    },

    list(detailCenterIds, filter = {}) {
      return run(
        () =>
          client.rpc("list_opportunities", {
            p_detail_center_ids: detailCenterIds,
            p_status: filter.status === undefined ? "abierta" : filter.status,
            p_kind: filter.kind ?? null,
            p_owner_id: filter.ownerId ?? null,
          }),
        (rows) => rows.map(toOpportunity),
      );
    },

    async get(id, detailCenterIds) {
      const r = await run(
        () => client.rpc("list_opportunities", { p_detail_center_ids: detailCenterIds, p_id: id }),
        (rows) => rows.map(toOpportunity),
      );
      if (!r.ok) return r;
      return r.data[0]
        ? { ok: true, data: r.data[0] }
        : fail("not_found", "La oportunidad no existe o no tienes acceso.");
    },

    timeline(id) {
      return run(
        () => client.rpc("opportunity_timeline", { p_id: id }),
        (rows) =>
          rows.map((e) => ({
            id: e.id,
            seq: Number(e.seq),
            kind: e.kind as OpportunityEventKind,
            occurredAt: e.occurred_at,
            actorName: e.actor_name,
            fromStageName: e.from_stage_name,
            toStageName: e.to_stage_name,
            value: num(e.value),
            ownerName: e.owner_name,
            note: e.note,
          })),
      );
    },

    tasks(id) {
      return run(
        () =>
          client
            .from("crm_tasks")
            .select(
              "id, kind, channel, status, due_on, notes, outcome, outcome_notes, assigned_to, completed_at",
            )
            .eq("opportunity_id", id)
            .order("status", { ascending: false })
            .order("due_on"),
        (rows) =>
          rows.map((t) => ({
            id: t.id,
            kind: t.kind as OpportunityTaskKind,
            channel: t.channel,
            status: t.status as "pendiente" | "hecha" | "cancelada",
            dueOn: t.due_on,
            notes: t.notes,
            outcome: t.outcome,
            outcomeNotes: t.outcome_notes,
            assignedTo: t.assigned_to,
            completedAt: t.completed_at,
          })),
      );
    },

    owners(detailCenterId, kind) {
      return run(
        () => client.rpc("pipeline_owners", { p_detail_center_id: detailCenterId, p_kind: kind }),
        (rows) => rows.map((o) => ({ userId: o.user_id, fullName: o.full_name })),
      );
    },

    create(command) {
      const parsed = createOpportunitySchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("create_opportunity", {
            p_detail_center_id: c.detailCenterId,
            p_request_id: c.requestId,
            p_kind: c.kind,
            p_title: c.title,
            p_estimated_value: c.estimatedValue,
            p_client_id: c.clientId ?? null,
            p_b2b_account_id: c.b2bAccountId ?? null,
            p_prospect: prospectJson(c.prospect),
            p_proposal: c.kind === "b2b" ? proposalJson(c.proposal) : {},
            p_stage_id: c.stageId ?? null,
            p_owner_id: c.ownerId ?? null,
            p_next_action: c.nextAction ?? null,
            p_next_action_on: c.nextActionOn ?? null,
            p_expected_close_on: c.expectedCloseOn ?? null,
            p_source: c.source ?? null,
            p_notes: c.notes ?? null,
          }),
        (row) => ({ id: row.id }),
      );
    },

    update(command) {
      const parsed = updateOpportunitySchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("update_opportunity", {
            p_id: c.id,
            p_version: c.version,
            p_title: c.title,
            p_estimated_value: c.estimatedValue,
            p_owner_id: c.ownerId ?? null,
            p_next_action: c.nextAction ?? null,
            p_next_action_on: c.nextActionOn ?? null,
            p_expected_close_on: c.expectedCloseOn ?? null,
            p_source: c.source ?? null,
            p_prospect: prospectJson(c.prospect),
            p_proposal: proposalJson(c.proposal),
            p_notes: c.notes ?? null,
            p_reason: c.reason,
          }),
        (row) => ({ version: row.version }),
      );
    },

    move(id, version, stageId, note) {
      const parsed = moveOpportunitySchema.safeParse({ id, version, stageId, note });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () =>
          client.rpc("move_opportunity_stage", {
            p_id: id,
            p_version: version,
            p_stage_id: stageId,
            p_note: parsed.data.note ?? null,
          }),
        (row) => ({ version: row.version }),
      );
    },

    addNote(id, note) {
      const parsed = opportunityNoteSchema.safeParse({ id, note });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return done(() => client.rpc("add_opportunity_note", { p_id: id, p_note: parsed.data.note }));
    },

    win(command) {
      const parsed = winOpportunitySchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("win_opportunity", {
            p_id: c.id,
            p_version: c.version,
            p_won_value: c.wonValue ?? null,
            p_create_agreement: c.createAgreement,
            p_agreement_starts_on: c.agreementStartsOn ?? null,
            p_note: c.note ?? null,
          }),
        (row) => ({ accountId: row.converted_account_id, agreementId: row.converted_agreement_id }),
      );
    },

    lose(id, version, reason, notes) {
      const parsed = loseOpportunitySchema.safeParse({ id, version, lossReason: reason, notes });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () =>
          client.rpc("lose_opportunity", {
            p_id: id,
            p_version: version,
            p_loss_reason: parsed.data.lossReason,
            p_notes: parsed.data.notes ?? null,
          }),
        (row) => ({ version: row.version }),
      );
    },

    reopen(id, version, stageId, reason) {
      const parsed = reopenOpportunitySchema.safeParse({ id, version, stageId, reason });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () =>
          client.rpc("reopen_opportunity", {
            p_id: id,
            p_version: version,
            p_stage_id: stageId,
            p_reason: parsed.data.reason,
          }),
        (row) => ({ version: row.version }),
      );
    },

    createTask(command) {
      const parsed = opportunityTaskSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("create_opportunity_task", {
            p_opportunity_id: c.opportunityId,
            p_request_id: c.requestId,
            p_kind: c.kind,
            p_channel: c.kind === "reunion" ? "presencial" : null,
            p_due_on: c.dueOn,
            p_notes: c.notes ?? null,
            p_assigned_to: c.assignedTo ?? null,
          }),
        (row) => ({ id: row.id }),
      );
    },

    metricFacts(detailCenterIds, from, to) {
      return run(
        () =>
          client.rpc("pipeline_metric_facts", {
            p_detail_center_ids: detailCenterIds,
            p_from: from,
            p_to: to,
          }),
        (rows) =>
          rows.map((f) => ({
            opportunityId: f.opportunity_id,
            detailCenterId: f.detail_center_id,
            kind: f.kind as OpportunityKind,
            createdOn: f.created_on,
            createdValue: Number(f.created_value),
            outcome: f.outcome as "ganada" | "perdida" | null,
            closedOn: f.closed_on,
            wonValue: num(f.won_value),
            currentValue: Number(f.current_value ?? 0),
            currentStageId: f.current_stage_id,
            stagesReached: f.stages_reached ?? [],
            cycleDays: num(f.cycle_days),
          })),
      );
    },

    upsertStage(command) {
      const parsed = pipelineStageSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("upsert_pipeline_stage", {
            p_organization_id: c.organizationId,
            p_id: c.id ?? null,
            p_name: c.name,
            p_position: c.position,
            p_probability: c.probability,
            p_active: c.active,
            p_reason: c.reason,
          }),
        (row) => ({ id: row.id }),
      );
    },
  };
}
