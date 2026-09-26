"use server";

import { activeCenterAccess, crmCopy, guardScreen, type RepoError, type Screen } from "@meguiars/domain";
import { createCrmRepository } from "@meguiars/supabase";
import {
  cancelTaskSchema,
  completeTaskSchema,
  contactPreferenceSchema,
  createTaskSchema,
  fieldErrors,
  rescheduleTaskSchema,
} from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, validationState, values, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CrmFormState = ActionFormState;

/** Centro activo del servidor (nunca uno enviado por el cliente) y repositorio. */
async function context(screen: Screen) {
  const state = await getAuthState();
  if (!guardScreen(state, screen).allow) return null;
  const active = activeCenterAccess(state);
  const supabase = await createSupabaseServerClient();
  if (!active || !supabase) return null;
  return { state, center: active.center, repo: createCrmRepository(supabase) };
}

const failed = (error: RepoError, form: FormData) =>
  stamp({
    error: error.kind === "permission_denied" && !error.message ? crmCopy.forbidden : error.message,
    values: values(form),
  });

function refresh(clientId?: string) {
  if (clientId) revalidatePath(`/comercial/clientes/${clientId}`);
  revalidatePath("/comercial/clientes");
  revalidatePath("/comercial/seguimientos");
}

export async function createTaskAction(_prev: CrmFormState, form: FormData): Promise<CrmFormState> {
  const ctx = await context("crmCustomerDetail");
  if (!ctx) return stamp({ error: crmCopy.forbidden });
  const parsed = createTaskSchema.safeParse({
    detailCenterId: ctx.center.id,
    requestId: text(form, "requestId"),
    clientId: text(form, "clientId"),
    kind: text(form, "kind"),
    channel: text(form, "channel"),
    dueOn: text(form, "dueOn"),
    notes: text(form, "notes"),
  });
  if (!parsed.success)
    return stamp(
      validationState(fieldErrors(parsed.error), ["detailCenterId", "requestId", "clientId"], form),
    );
  const result = await ctx.repo.createTask(parsed.data);
  refresh(parsed.data.clientId);
  if (!result.ok) return failed(result.error, form);
  return stamp({ message: crmCopy.created });
}

/** Registrar resultado, cancelar o reprogramar un seguimiento (botón `op`). */
export async function updateTaskAction(_prev: CrmFormState, form: FormData): Promise<CrmFormState> {
  const ctx = await context("crmTasks");
  if (!ctx) return stamp({ error: crmCopy.forbidden });
  const op = text(form, "op");
  const taskId = text(form, "taskId");
  const clientId = text(form, "clientId") || undefined;
  let result;
  if (op === "complete") {
    const parsed = completeTaskSchema.safeParse({
      taskId,
      outcome: text(form, "outcome"),
      notes: text(form, "notes"),
    });
    if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["taskId"], form));
    result = await ctx.repo.completeTask(parsed.data);
  } else if (op === "cancel") {
    const parsed = cancelTaskSchema.safeParse({ taskId, reason: text(form, "reason") });
    if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["taskId"], form));
    result = await ctx.repo.cancelTask(parsed.data.taskId, parsed.data.reason);
  } else if (op === "reschedule") {
    const parsed = rescheduleTaskSchema.safeParse({
      taskId,
      dueOn: text(form, "dueOn"),
      reason: text(form, "reason"),
    });
    if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["taskId"], form));
    result = await ctx.repo.rescheduleTask(parsed.data.taskId, parsed.data.dueOn, parsed.data.reason);
  } else {
    return stamp({ error: "Acción inválida" });
  }
  refresh(clientId);
  if (!result.ok) return failed(result.error, form);
  return stamp({ message: crmCopy.saved });
}

export async function generateTasksAction(_prev: CrmFormState, _form: FormData): Promise<CrmFormState> {
  const ctx = await context("crmTasks");
  if (!ctx) return stamp({ error: crmCopy.forbidden });
  const result = await ctx.repo.generateTasks(ctx.center.id);
  refresh();
  if (!result.ok) return stamp({ error: result.error.message });
  return stamp({ message: crmCopy.generated(result.data) });
}

export async function setPreferenceAction(_prev: CrmFormState, form: FormData): Promise<CrmFormState> {
  const ctx = await context("crmCustomerDetail");
  if (!ctx) return stamp({ error: crmCopy.forbidden });
  const parsed = contactPreferenceSchema.safeParse({
    clientId: text(form, "clientId"),
    channel: text(form, "channel"),
    optedIn: text(form, "optedIn") === "true",
    source: "web",
    reason: text(form, "reason"),
  });
  if (!parsed.success)
    return stamp(validationState(fieldErrors(parsed.error), ["clientId", "channel"], form));
  const result = await ctx.repo.setPreference(parsed.data);
  refresh(parsed.data.clientId);
  if (!result.ok) return failed(result.error, form);
  return stamp({ message: crmCopy.saved });
}
