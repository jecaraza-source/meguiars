"use server";

import {
  activeCenterAccess,
  commercialErrorMessage,
  guardScreen,
  zonedToUtc,
  type LeadContactChannel,
  type LeadLossReason,
  type Screen,
} from "@meguiars/domain";
import { createCommercialRepository, createCrmRepository } from "@meguiars/supabase";
import {
  addQuoteDiscountSchema,
  bookQuoteSchema,
  createLeadSchema,
  createQuoteSchema,
  leadStageSchema,
  leadTaskSchema,
  linkLeadClientSchema,
  loseLeadSchema,
  mergeClientsSchema,
  quoteStatusSchema,
  reopenLeadSchema,
  updateLeadSchema,
  updateQuoteSchema,
  voidQuoteDiscountSchema,
} from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, values, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CommercialFormState = ActionFormState;

const FORBIDDEN = "No tienes permiso para esta acción.";

async function context(screen: Screen) {
  const state = await getAuthState();
  if (!guardScreen(state, screen).allow) return null;
  const active = activeCenterAccess(state);
  const supabase = await createSupabaseServerClient();
  if (!active || !supabase) return null;
  return { state, center: active.center, supabase, repo: createCommercialRepository(supabase) };
}

function flatErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path.find((p) => typeof p === "string") ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

const invalidForm = (
  error: z.ZodError,
  form: FormData,
  hidden: readonly string[],
  multi: readonly string[] = [],
) => {
  const fields = flatErrors(error);
  const hiddenError = hidden.map((k) => fields[k]).find(Boolean);
  return stamp(
    hiddenError
      ? { error: `Datos inválidos: ${hiddenError}`, values: values(form, multi) }
      : { fields, values: values(form, multi) },
  );
};

const fail = (
  error: { kind: string; code?: string; message: string },
  form?: FormData,
  multi: readonly string[] = [],
) => stamp({ error: commercialErrorMessage(error), ...(form ? { values: values(form, multi) } : {}) });

const leadPath = (id: string) => `/comercial/prospectos/${id}`;
const quotePath = (id: string) => `/comercial/cotizaciones/${id}`;
const LEAD_MULTI = ["interestServiceIds", "consentChannels"] as const;

function refreshLead(id?: string) {
  revalidatePath("/comercial/prospectos");
  if (id) revalidatePath(leadPath(id));
}
function refreshQuote(id?: string, leadId?: string) {
  revalidatePath("/comercial/cotizaciones");
  if (id) revalidatePath(quotePath(id));
  if (leadId) revalidatePath(leadPath(leadId));
}

const leadFieldsOf = (form: FormData) => ({
  fullName: text(form, "fullName"),
  source: text(form, "source"),
  phone: text(form, "phone"),
  email: text(form, "email"),
  socialHandle: text(form, "socialHandle"),
  sourceDetail: text(form, "sourceDetail"),
  interestServiceIds: form.getAll("interestServiceIds"),
  vehicleDescription: text(form, "vehicleDescription"),
  notes: text(form, "notes"),
  consentChannels: form.getAll("consentChannels"),
  estimatedValue: text(form, "estimatedValue"),
  ownerId: text(form, "ownerId"),
  nextAction: text(form, "nextAction"),
  nextActionOn: text(form, "nextActionOn"),
});

// ---------------------------------------------------------------------------
// Prospectos
// ---------------------------------------------------------------------------

export async function createLeadAction(
  _prev: CommercialFormState,
  form: FormData,
): Promise<CommercialFormState> {
  const ctx = await context("leadNew");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const parsed = createLeadSchema.safeParse({
    detailCenterId: ctx.center.id,
    requestId: text(form, "requestId"),
    referredByClientId: text(form, "referredByClientId"),
    clientId: text(form, "clientId"),
    ...leadFieldsOf(form),
  });
  if (!parsed.success) return invalidForm(parsed.error, form, ["detailCenterId", "requestId"], LEAD_MULTI);
  // Coincidencias por teléfono o email (nunca por nombre): se avisa antes de duplicar.
  if (text(form, "confirmMatches") !== "on" && !parsed.data.clientId) {
    const matches = await ctx.repo.leadMatches(ctx.center.id, parsed.data.phone, parsed.data.email);
    if (matches.ok && matches.data.length > 0) {
      const list = matches.data
        .map((m) => `${m.kind === "cliente" ? "Cliente" : "Prospecto"} ${m.displayName} (${m.detail})`)
        .join("; ");
      return stamp({
        fields: {
          confirmMatches: `Ya hay registros con ese teléfono o email: ${list}. Si es la misma persona, búscala y trabaja sobre ese registro.`,
        },
        values: values(form, LEAD_MULTI),
      });
    }
  }
  const r = await ctx.repo.createLead(parsed.data);
  if (!r.ok) return fail(r.error, form, LEAD_MULTI);
  refreshLead();
  redirect(`${leadPath(r.data.id)}?nuevo=1`);
}

export async function updateLeadAction(
  _prev: CommercialFormState,
  form: FormData,
): Promise<CommercialFormState> {
  const ctx = await context("leadDetail");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const parsed = updateLeadSchema.safeParse({
    id: text(form, "id"),
    version: text(form, "version"),
    reason: text(form, "reason"),
    ...leadFieldsOf(form),
  });
  if (!parsed.success) return invalidForm(parsed.error, form, ["id", "version"], LEAD_MULTI);
  const r = await ctx.repo.updateLead(parsed.data);
  if (!r.ok) return fail(r.error, form, LEAD_MULTI);
  refreshLead(parsed.data.id);
  return stamp({ message: "Prospecto actualizado" });
}

export async function logLeadContactAction(
  _prev: CommercialFormState,
  form: FormData,
): Promise<CommercialFormState> {
  const ctx = await context("leadDetail");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const id = text(form, "id");
  const r = await ctx.repo.logContact(
    id,
    Number(text(form, "version")),
    text(form, "channel") as LeadContactChannel,
    text(form, "note") || undefined,
  );
  if (!r.ok) return fail(r.error, form);
  refreshLead(id);
  return stamp({ message: "Contacto registrado" });
}

export async function moveLeadAction(
  _prev: CommercialFormState,
  form: FormData,
): Promise<CommercialFormState> {
  const ctx = await context("leadDetail");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const id = text(form, "id");
  const r = await ctx.repo.moveLead(
    id,
    Number(text(form, "version")),
    text(form, "stageId"),
    text(form, "note") || undefined,
  );
  if (!r.ok) return fail(r.error, form);
  refreshLead(id);
  return stamp({ message: "Etapa actualizada" });
}

export async function addLeadNoteAction(
  _prev: CommercialFormState,
  form: FormData,
): Promise<CommercialFormState> {
  const ctx = await context("leadDetail");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const id = text(form, "id");
  const r = await ctx.repo.addLeadNote(id, text(form, "note"));
  if (!r.ok) return fail(r.error, form);
  refreshLead(id);
  return stamp({ message: "Nota agregada" });
}

export async function loseLeadAction(
  _prev: CommercialFormState,
  form: FormData,
): Promise<CommercialFormState> {
  const ctx = await context("leadDetail");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const parsed = loseLeadSchema.safeParse({
    id: text(form, "id"),
    version: text(form, "version"),
    reason: text(form, "lossReason"),
    notes: text(form, "lossNotes"),
  });
  if (!parsed.success) {
    const state = invalidForm(parsed.error, form, ["id", "version"]);
    return state.fields?.reason ? { ...state, fields: { lossReason: state.fields.reason } } : state;
  }
  const r = await ctx.repo.loseLead(
    parsed.data.id,
    parsed.data.version,
    parsed.data.reason as LeadLossReason,
    parsed.data.notes,
  );
  if (!r.ok) return fail(r.error, form);
  refreshLead(parsed.data.id);
  return stamp({ message: "Prospecto marcado como perdido" });
}

export async function reopenLeadAction(
  _prev: CommercialFormState,
  form: FormData,
): Promise<CommercialFormState> {
  const ctx = await context("leadDetail");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const parsed = reopenLeadSchema.safeParse({
    id: text(form, "id"),
    version: text(form, "version"),
    stageId: text(form, "stageId"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return invalidForm(parsed.error, form, ["id", "version"]);
  const r = await ctx.repo.reopenLead(
    parsed.data.id,
    parsed.data.version,
    parsed.data.stageId,
    parsed.data.reason,
  );
  if (!r.ok) return fail(r.error, form);
  refreshLead(parsed.data.id);
  return stamp({ message: "Prospecto reabierto" });
}

export async function linkLeadClientAction(
  _prev: CommercialFormState,
  form: FormData,
): Promise<CommercialFormState> {
  const ctx = await context("leadDetail");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const parsed = linkLeadClientSchema.safeParse({
    id: text(form, "id"),
    version: text(form, "version"),
    clientId: text(form, "clientId"),
    reason: text(form, "reason") || "Es la misma persona",
  });
  if (!parsed.success) return invalidForm(parsed.error, form, ["id", "version"]);
  const r = await ctx.repo.linkLeadClient(
    parsed.data.id,
    parsed.data.version,
    parsed.data.clientId,
    parsed.data.reason,
  );
  if (!r.ok) return fail(r.error, form);
  refreshLead(parsed.data.id);
  return stamp({ message: "Prospecto ligado al cliente" });
}

export async function winLeadAction(
  _prev: CommercialFormState,
  form: FormData,
): Promise<CommercialFormState> {
  const ctx = await context("leadDetail");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const id = text(form, "id");
  if (!text(form, "serviceOrderId")) return stamp({ fields: { serviceOrderId: "Elige la OS entregada" } });
  const r = await ctx.repo.winLead(id, Number(text(form, "version")), text(form, "serviceOrderId"));
  if (!r.ok) return fail(r.error, form);
  refreshLead(id);
  return stamp({ message: "Venta atribuida al prospecto" });
}

export async function createLeadTaskAction(
  _prev: CommercialFormState,
  form: FormData,
): Promise<CommercialFormState> {
  const ctx = await context("leadDetail");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const parsed = leadTaskSchema.safeParse({
    leadId: text(form, "id"),
    requestId: text(form, "requestId"),
    kind: text(form, "taskKind"),
    dueOn: text(form, "dueOn"),
    notes: text(form, "taskNotes"),
    assignedTo: text(form, "assignedTo"),
  });
  if (!parsed.success) return invalidForm(parsed.error, form, ["leadId", "requestId"]);
  const r = await ctx.repo.createLeadTask(parsed.data);
  if (!r.ok) return fail(r.error, form);
  refreshLead(parsed.data.leadId);
  return stamp({ message: "Tarea agregada" });
}

export async function completeLeadTaskAction(
  _prev: CommercialFormState,
  form: FormData,
): Promise<CommercialFormState> {
  const ctx = await context("leadDetail");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const id = text(form, "id");
  const r = await createCrmRepository(ctx.supabase).completeTask({
    taskId: text(form, "taskId"),
    outcome: (text(form, "outcome") || "contactado") as "contactado",
    notes: text(form, "outcomeNotes") || undefined,
  });
  refreshLead(id);
  return r.ok ? stamp({ message: "Tarea completada" }) : fail(r.error);
}

export async function upsertLeadStageAction(
  _prev: CommercialFormState,
  form: FormData,
): Promise<CommercialFormState> {
  const ctx = await context("leads");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const parsed = leadStageSchema.safeParse({
    organizationId: ctx.center.organizationId,
    id: text(form, "id"),
    code: text(form, "code"),
    name: text(form, "name"),
    position: text(form, "position"),
    milestone: text(form, "milestone"),
    active: form.get("active"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return invalidForm(parsed.error, form, ["organizationId", "id"]);
  const r = await ctx.repo.upsertStage(parsed.data);
  if (!r.ok) return fail(r.error, form);
  revalidatePath("/comercial/prospectos");
  return stamp({ message: "Embudo actualizado" });
}

// ---------------------------------------------------------------------------
// Cotizaciones
// ---------------------------------------------------------------------------

/** Líneas del formulario: casillas `serviceId` con su cantidad `qty-<id>`. */
const itemsOf = (form: FormData) =>
  form
    .getAll("serviceId")
    .filter((v): v is string => typeof v === "string" && v !== "")
    .map((serviceId) => ({ serviceId, quantity: text(form, `qty-${serviceId}`) || "1" }));

export async function createQuoteAction(
  _prev: CommercialFormState,
  form: FormData,
): Promise<CommercialFormState> {
  const ctx = await context("quoteNew");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const parsed = createQuoteSchema.safeParse({
    detailCenterId: ctx.center.id,
    requestId: text(form, "requestId"),
    items: itemsOf(form),
    leadId: text(form, "leadId"),
    clientId: text(form, "clientId"),
    vehicleId: text(form, "vehicleId"),
    validDays: text(form, "validDays"),
    notes: text(form, "notes"),
  });
  if (!parsed.success) return invalidForm(parsed.error, form, ["detailCenterId", "requestId"], ["serviceId"]);
  const r = await ctx.repo.createQuote(parsed.data);
  if (!r.ok) return fail(r.error, form, ["serviceId"]);
  refreshQuote(undefined, parsed.data.leadId);
  redirect(`${quotePath(r.data.id)}?nueva=1`);
}

export async function setQuoteItemAction(
  _prev: CommercialFormState,
  form: FormData,
): Promise<CommercialFormState> {
  const ctx = await context("quoteDetail");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const id = text(form, "quoteId");
  const r = await ctx.repo.setQuoteItem(
    id,
    Number(text(form, "version")),
    text(form, "serviceId"),
    Number(text(form, "quantity")),
  );
  if (!r.ok) return fail(r.error, form);
  refreshQuote(id);
  return stamp({ message: "Cotización actualizada" });
}

export async function addQuoteDiscountAction(
  _prev: CommercialFormState,
  form: FormData,
): Promise<CommercialFormState> {
  const ctx = await context("quoteDetail");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const parsed = addQuoteDiscountSchema.safeParse({
    quoteId: text(form, "quoteId"),
    version: text(form, "version"),
    itemId: text(form, "itemId"),
    kind: text(form, "kind"),
    value: text(form, "value"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return invalidForm(parsed.error, form, ["quoteId", "version"]);
  const r = await ctx.repo.addQuoteDiscount(parsed.data);
  if (!r.ok) return fail(r.error, form);
  refreshQuote(parsed.data.quoteId);
  return stamp({ message: "Descuento aplicado" });
}

export async function voidQuoteDiscountAction(
  _prev: CommercialFormState,
  form: FormData,
): Promise<CommercialFormState> {
  const ctx = await context("quoteDetail");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const parsed = voidQuoteDiscountSchema.safeParse({
    quoteId: text(form, "quoteId"),
    version: text(form, "version"),
    discountId: text(form, "discountId"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return invalidForm(parsed.error, form, ["quoteId", "version", "discountId"]);
  const r = await ctx.repo.voidQuoteDiscount(
    parsed.data.quoteId,
    parsed.data.version,
    parsed.data.discountId,
    parsed.data.reason,
  );
  if (!r.ok) return fail(r.error, form);
  refreshQuote(parsed.data.quoteId);
  return stamp({ message: "Descuento anulado" });
}

export async function quoteStatusAction(
  _prev: CommercialFormState,
  form: FormData,
): Promise<CommercialFormState> {
  const ctx = await context("quoteDetail");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const parsed = quoteStatusSchema.safeParse({
    quoteId: text(form, "quoteId"),
    version: text(form, "version"),
    status: text(form, "status"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return invalidForm(parsed.error, form, ["quoteId", "version", "status"]);
  const r = await ctx.repo.setQuoteStatus(
    parsed.data.quoteId,
    parsed.data.version,
    parsed.data.status,
    parsed.data.reason,
  );
  if (!r.ok) return fail(r.error, form);
  refreshQuote(parsed.data.quoteId, text(form, "leadId") || undefined);
  return stamp({ message: "Estado actualizado" });
}

export async function updateQuoteAction(
  _prev: CommercialFormState,
  form: FormData,
): Promise<CommercialFormState> {
  const ctx = await context("quoteDetail");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const parsed = updateQuoteSchema.safeParse({
    quoteId: text(form, "quoteId"),
    version: text(form, "version"),
    vehicleId: text(form, "vehicleId"),
    validUntil: text(form, "validUntil"),
    notes: text(form, "notes"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return invalidForm(parsed.error, form, ["quoteId", "version"]);
  const c = parsed.data;
  const r = await ctx.repo.updateQuote(
    c.quoteId,
    c.version,
    c.vehicleId ?? null,
    c.validUntil,
    c.notes ?? null,
    c.reason,
  );
  if (!r.ok) return fail(r.error, form);
  refreshQuote(c.quoteId);
  return stamp({ message: "Cotización actualizada" });
}

export async function bookQuoteAction(
  _prev: CommercialFormState,
  form: FormData,
): Promise<CommercialFormState> {
  const ctx = await context("quoteDetail");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const date = text(form, "date");
  const time = text(form, "time");
  if (!date || !time)
    return stamp({
      fields: { date: date ? "" : "Elige la fecha", time: time ? "" : "Elige la hora" },
      values: values(form),
    });
  const parsed = bookQuoteSchema.safeParse({
    quoteId: text(form, "quoteId"),
    version: text(form, "version"),
    requestId: text(form, "requestId"),
    startsAt: zonedToUtc(date, time, ctx.center.timezone),
    vehicleId: text(form, "vehicleId"),
    bayId: text(form, "bayId"),
    technicianId: text(form, "technicianId"),
    notes: text(form, "notes"),
  });
  if (!parsed.success) return invalidForm(parsed.error, form, ["quoteId", "version", "requestId"]);
  const r = await ctx.repo.bookQuote(parsed.data);
  if (!r.ok) return fail(r.error, form);
  refreshQuote(parsed.data.quoteId, text(form, "leadId") || undefined);
  revalidatePath("/agenda");
  redirect(`${quotePath(parsed.data.quoteId)}?reservada=1`);
}

// ---------------------------------------------------------------------------
// Duplicados
// ---------------------------------------------------------------------------

export async function mergeClientsAction(
  _prev: CommercialFormState,
  form: FormData,
): Promise<CommercialFormState> {
  const ctx = await context("duplicates");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const a = text(form, "clientA");
  const b = text(form, "clientB");
  const keep = text(form, "keep") === "b" ? b : a;
  const parsed = mergeClientsSchema.safeParse({
    keepClientId: keep,
    mergeClientId: keep === a ? b : a,
    reason: text(form, "reason"),
  });
  if (!parsed.success) return invalidForm(parsed.error, form, ["keepClientId", "mergeClientId"]);
  const r = await ctx.repo.mergeClients(
    parsed.data.keepClientId,
    parsed.data.mergeClientId,
    parsed.data.reason,
  );
  if (!r.ok) return fail(r.error, form);
  revalidatePath("/comercial/duplicados");
  revalidatePath(`/comercial/clientes/${parsed.data.keepClientId}`);
  return stamp({ message: "Clientes fusionados" });
}
