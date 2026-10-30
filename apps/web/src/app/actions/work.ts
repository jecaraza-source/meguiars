"use server";

import { activeCenterAccess, guardScreen, MY_WORK_COPY, type Screen } from "@meguiars/domain";
import { createMyWorkRepository } from "@meguiars/supabase";
import {
  fieldErrors,
  linkTechnicianSchema,
  myWorkCommentSchema,
  myWorkProblemSchema,
} from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, values, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function context(screen: Screen) {
  const state = await getAuthState();
  if (!guardScreen(state, screen).allow) return null;
  const active = activeCenterAccess(state);
  const supabase = await createSupabaseServerClient();
  if (!active || !supabase) return null;
  return { center: active.center, repo: createMyWorkRepository(supabase) };
}

const NO_ACCESS = "Sin acceso a «Mi día» en este centro";

/** Empezar o «Trabajo terminado» de un servicio (botón con name="action"). */
export async function myWorkItemAction(_prev: ActionFormState, form: FormData): Promise<ActionFormState> {
  const ctx = await context("myWork");
  if (!ctx) return stamp({ error: NO_ACCESS });
  const itemId = text(form, "itemId");
  const action = text(form, "action");
  const result = action === "done" ? await ctx.repo.done(itemId) : await ctx.repo.start(itemId);
  if (!result.ok) return stamp({ error: result.error.message });
  revalidatePath("/mi-dia");
  return stamp({
    message: result.data.orderFinished
      ? MY_WORK_COPY.finished
      : action === "done"
        ? "Trabajo terminado"
        : "Servicio empezado",
  });
}

/** Comentario o problema de una OS (campo kind). */
export async function myWorkNoteAction(_prev: ActionFormState, form: FormData): Promise<ActionFormState> {
  const ctx = await context("myWork");
  if (!ctx) return stamp({ error: NO_ACCESS });
  const kind = text(form, "kind");
  const orderId = text(form, "orderId");
  const body = text(form, "text");
  if (kind === "problem") {
    const parsed = myWorkProblemSchema.safeParse({ orderId, description: body });
    if (!parsed.success)
      return stamp({ fields: { text: fieldErrors(parsed.error).description ?? "" }, values: values(form) });
    const result = await ctx.repo.reportProblem(parsed.data.orderId, parsed.data.description);
    if (!result.ok) return stamp({ error: result.error.message, values: values(form) });
  } else {
    const parsed = myWorkCommentSchema.safeParse({ orderId, note: body });
    if (!parsed.success)
      return stamp({ fields: { text: fieldErrors(parsed.error).note ?? "" }, values: values(form) });
    const result = await ctx.repo.comment(parsed.data.orderId, parsed.data.note);
    if (!result.ok) return stamp({ error: result.error.message, values: values(form) });
  }
  revalidatePath("/mi-dia");
  return stamp({ message: kind === "problem" ? "Problema reportado a recepción" : "Comentario guardado" });
}

/** Liga (o desliga) un técnico de la agenda con un usuario del centro. */
export async function linkTechnicianUserAction(
  _prev: ActionFormState,
  form: FormData,
): Promise<ActionFormState> {
  const ctx = await context("agenda");
  if (!ctx) return stamp({ error: "Sin acceso a la agenda" });
  const parsed = linkTechnicianSchema.safeParse({
    technicianId: text(form, "technicianId"),
    userId: text(form, "userId"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return stamp({ fields: fieldErrors(parsed.error), values: values(form) });
  const result = await ctx.repo.linkTechnicianUser(
    parsed.data.technicianId,
    parsed.data.userId,
    parsed.data.reason,
  );
  if (!result.ok) return stamp({ error: result.error.message, values: values(form) });
  revalidatePath("/agenda");
  return stamp({ message: parsed.data.userId ? "Técnico ligado a su usuario" : "Técnico desligado" });
}
