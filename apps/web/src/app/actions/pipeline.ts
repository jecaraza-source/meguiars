"use server";

import {
  activeCenterAccess,
  guardScreen,
  pipelineCopy,
  pipelineErrorMessage,
  type Screen,
} from "@meguiars/domain";
import { createCrmRepository, createPipelineRepository } from "@meguiars/supabase";
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
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, values, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PipelineFormState = ActionFormState;

async function context(screen: Screen) {
  const state = await getAuthState();
  if (!guardScreen(state, screen).allow) return null;
  const active = activeCenterAccess(state);
  const supabase = await createSupabaseServerClient();
  if (!active || !supabase) return null;
  return { state, center: active.center, supabase, repo: createPipelineRepository(supabase) };
}

/** Errores por campo con el nombre plano del formulario (prospect.contactPhone → contactPhone). */
function flatErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path.at(-1) ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

const invalidForm = (error: z.ZodError, form: FormData, hidden: readonly string[] = ["id", "version"]) => {
  const fields = flatErrors(error);
  const hiddenError = hidden.map((k) => fields[k]).find(Boolean);
  return stamp(
    hiddenError
      ? { error: `Datos inválidos: ${hiddenError}`, values: values(form) }
      : { fields, values: values(form) },
  );
};

const prospectOf = (form: FormData) => ({
  companyName: text(form, "companyName"),
  legalName: text(form, "legalName"),
  rfc: text(form, "rfc"),
  contactName: text(form, "contactName"),
  contactTitle: text(form, "contactTitle"),
  contactPhone: text(form, "contactPhone"),
  contactEmail: text(form, "contactEmail"),
});

const proposalOf = (form: FormData) => ({
  billingModel: text(form, "billingModel"),
  months: text(form, "months"),
  vehicleRule: text(form, "vehicleRule"),
  paymentTermsDays: text(form, "paymentTermsDays"),
  creditLimit: text(form, "creditLimit"),
  feeAmount: text(form, "feeAmount"),
  includedUnits: text(form, "includedUnits"),
});

const detailPath = (id: string) => `/comercial/pipeline/${id}`;

function refresh(id?: string) {
  revalidatePath("/comercial/pipeline");
  if (id) revalidatePath(detailPath(id));
}

export async function createOpportunityAction(
  _prev: PipelineFormState,
  form: FormData,
): Promise<PipelineFormState> {
  const ctx = await context("opportunityNew");
  if (!ctx) return stamp({ error: pipelineCopy.forbidden });
  const kind = text(form, "kind");
  const parsed = createOpportunitySchema.safeParse({
    detailCenterId: ctx.center.id,
    requestId: text(form, "requestId"),
    kind,
    title: text(form, "title"),
    estimatedValue: text(form, "estimatedValue"),
    clientId: text(form, "clientId"),
    b2bAccountId: kind === "b2b" ? text(form, "b2bAccountId") : "",
    stageId: text(form, "stageId"),
    ownerId: text(form, "ownerId"),
    nextAction: text(form, "nextAction"),
    nextActionOn: text(form, "nextActionOn"),
    expectedCloseOn: text(form, "expectedCloseOn"),
    source: text(form, "source"),
    prospect: kind === "b2b" ? prospectOf(form) : undefined,
    proposal: kind === "b2b" ? proposalOf(form) : undefined,
    notes: text(form, "notes"),
  });
  if (!parsed.success) return invalidForm(parsed.error, form, ["detailCenterId", "requestId"]);
  const r = await ctx.repo.create(parsed.data);
  if (!r.ok) return stamp({ error: pipelineErrorMessage(r.error), values: values(form) });
  refresh();
  redirect(`${detailPath(r.data.id)}?creada=1`);
}

export async function updateOpportunityAction(
  _prev: PipelineFormState,
  form: FormData,
): Promise<PipelineFormState> {
  const ctx = await context("opportunityDetail");
  if (!ctx) return stamp({ error: pipelineCopy.forbidden });
  const b2b = text(form, "kind") === "b2b";
  const parsed = updateOpportunitySchema.safeParse({
    id: text(form, "id"),
    version: text(form, "version"),
    title: text(form, "title"),
    estimatedValue: text(form, "estimatedValue"),
    ownerId: text(form, "ownerId"),
    nextAction: text(form, "nextAction"),
    nextActionOn: text(form, "nextActionOn"),
    expectedCloseOn: text(form, "expectedCloseOn"),
    source: text(form, "source"),
    prospect: prospectOf(form),
    proposal: b2b ? proposalOf(form) : undefined,
    notes: text(form, "notes"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return invalidForm(parsed.error, form);
  const r = await ctx.repo.update(parsed.data);
  refresh(parsed.data.id);
  return r.ok
    ? stamp({ message: pipelineCopy.saved })
    : stamp({ error: pipelineErrorMessage(r.error), values: values(form) });
}

export async function moveOpportunityAction(
  _prev: PipelineFormState,
  form: FormData,
): Promise<PipelineFormState> {
  const ctx = await context("opportunityDetail");
  if (!ctx) return stamp({ error: pipelineCopy.forbidden });
  const parsed = moveOpportunitySchema.safeParse({
    id: text(form, "id"),
    version: text(form, "version"),
    stageId: text(form, "stageId"),
    note: text(form, "note"),
  });
  if (!parsed.success) return invalidForm(parsed.error, form);
  const { id, version, stageId, note } = parsed.data;
  const r = await ctx.repo.move(id, version, stageId, note);
  refresh(id);
  return r.ok ? stamp({ message: pipelineCopy.moved }) : stamp({ error: pipelineErrorMessage(r.error) });
}

export async function addOpportunityNoteAction(
  _prev: PipelineFormState,
  form: FormData,
): Promise<PipelineFormState> {
  const ctx = await context("opportunityDetail");
  if (!ctx) return stamp({ error: pipelineCopy.forbidden });
  const parsed = opportunityNoteSchema.safeParse({ id: text(form, "id"), note: text(form, "note") });
  if (!parsed.success) return invalidForm(parsed.error, form, ["id"]);
  const r = await ctx.repo.addNote(parsed.data.id, parsed.data.note);
  refresh(parsed.data.id);
  return r.ok
    ? stamp({ message: pipelineCopy.noteAdded })
    : stamp({ error: pipelineErrorMessage(r.error), values: values(form) });
}

export async function winOpportunityAction(
  _prev: PipelineFormState,
  form: FormData,
): Promise<PipelineFormState> {
  const ctx = await context("opportunityDetail");
  if (!ctx) return stamp({ error: pipelineCopy.forbidden });
  const parsed = winOpportunitySchema.safeParse({
    id: text(form, "id"),
    version: text(form, "version"),
    wonValue: text(form, "wonValue"),
    createAgreement: form.get("createAgreement") === "on",
    agreementStartsOn: text(form, "agreementStartsOn"),
    note: text(form, "note"),
  });
  if (!parsed.success) return invalidForm(parsed.error, form);
  const r = await ctx.repo.win(parsed.data);
  refresh(parsed.data.id);
  if (!r.ok) return stamp({ error: pipelineErrorMessage(r.error), values: values(form) });
  if (r.data.accountId) revalidatePath("/comercial/b2b");
  redirect(`${detailPath(parsed.data.id)}?ganada=1`);
}

export async function loseOpportunityAction(
  _prev: PipelineFormState,
  form: FormData,
): Promise<PipelineFormState> {
  const ctx = await context("opportunityDetail");
  if (!ctx) return stamp({ error: pipelineCopy.forbidden });
  const parsed = loseOpportunitySchema.safeParse({
    id: text(form, "id"),
    version: text(form, "version"),
    lossReason: text(form, "lossReason"),
    notes: text(form, "lossNotes"),
  });
  if (!parsed.success) return invalidForm(parsed.error, form);
  const { id, version, lossReason, notes } = parsed.data;
  const r = await ctx.repo.lose(id, version, lossReason, notes);
  refresh(id);
  return r.ok ? stamp({ message: pipelineCopy.lost }) : stamp({ error: pipelineErrorMessage(r.error) });
}

export async function reopenOpportunityAction(
  _prev: PipelineFormState,
  form: FormData,
): Promise<PipelineFormState> {
  const ctx = await context("opportunityDetail");
  if (!ctx) return stamp({ error: pipelineCopy.forbidden });
  const parsed = reopenOpportunitySchema.safeParse({
    id: text(form, "id"),
    version: text(form, "version"),
    stageId: text(form, "stageId"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return invalidForm(parsed.error, form);
  const { id, version, stageId, reason } = parsed.data;
  const r = await ctx.repo.reopen(id, version, stageId, reason);
  refresh(id);
  return r.ok ? stamp({ message: pipelineCopy.reopened }) : stamp({ error: pipelineErrorMessage(r.error) });
}

export async function createOpportunityTaskAction(
  _prev: PipelineFormState,
  form: FormData,
): Promise<PipelineFormState> {
  const ctx = await context("opportunityDetail");
  if (!ctx) return stamp({ error: pipelineCopy.forbidden });
  const parsed = opportunityTaskSchema.safeParse({
    opportunityId: text(form, "id"),
    requestId: text(form, "requestId"),
    kind: text(form, "taskKind"),
    dueOn: text(form, "dueOn"),
    notes: text(form, "taskNotes"),
  });
  if (!parsed.success) {
    const fields = flatErrors(parsed.error);
    return stamp({
      fields: { taskKind: fields.kind ?? "", dueOn: fields.dueOn ?? "", taskNotes: fields.notes ?? "" },
      values: values(form),
    });
  }
  const r = await ctx.repo.createTask(parsed.data);
  refresh(parsed.data.opportunityId);
  return r.ok
    ? stamp({ message: pipelineCopy.taskAdded })
    : stamp({ error: pipelineErrorMessage(r.error), values: values(form) });
}

export async function completeOpportunityTaskAction(
  _prev: PipelineFormState,
  form: FormData,
): Promise<PipelineFormState> {
  const ctx = await context("opportunityDetail");
  if (!ctx) return stamp({ error: pipelineCopy.forbidden });
  const id = text(form, "id");
  const r = await createCrmRepository(ctx.supabase).completeTask({
    taskId: text(form, "taskId"),
    outcome: (text(form, "outcome") || "contactado") as "contactado",
    notes: text(form, "outcomeNotes") || undefined,
  });
  refresh(id);
  return r.ok ? stamp({ message: pipelineCopy.taskDone }) : stamp({ error: pipelineErrorMessage(r.error) });
}

export async function upsertPipelineStageAction(
  _prev: PipelineFormState,
  form: FormData,
): Promise<PipelineFormState> {
  const ctx = await context("pipelineMetrics");
  if (!ctx) return stamp({ error: pipelineCopy.forbidden });
  const parsed = pipelineStageSchema.safeParse({
    organizationId: ctx.center.organizationId,
    id: text(form, "id"),
    name: text(form, "name"),
    position: text(form, "position"),
    probability: text(form, "probability"),
    active: form.get("active") === "on",
    reason: text(form, "reason"),
  });
  if (!parsed.success) return invalidForm(parsed.error, form, ["organizationId", "id"]);
  const r = await ctx.repo.upsertStage(parsed.data);
  revalidatePath("/comercial/pipeline", "layout");
  return r.ok
    ? stamp({ message: pipelineCopy.stageSaved })
    : stamp({ error: pipelineErrorMessage(r.error), values: values(form) });
}
