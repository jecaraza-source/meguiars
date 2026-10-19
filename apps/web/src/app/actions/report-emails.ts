"use server";

import { dashboardsErrorMessage, guardScreen } from "@meguiars/domain";
import { createReportEmailsRepository } from "@meguiars/supabase";
import { changeReasonSchema, fieldErrors, reportSubscriptionSchema } from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/dal";
import { canManageDashboards, centersWith } from "@/lib/dashboards";
import { stamp, text, validationState, values, type ActionFormState } from "@/lib/form-data";
import { reportScope, sendReportNow } from "@/lib/report-emails";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ReportEmailsFormState = ActionFormState;

const FORBIDDEN = "Sólo el admin corporativo programa los reportes por correo.";
const PATH = "/direccion/reportes";

/** Admin corporativo con acceso a la pantalla; la base vuelve a autorizar cada escritura (RPC + RLS). */
async function context() {
  const state = await getAuthState();
  if (
    state.status !== "signed_in" ||
    !guardScreen(state, "reportEmails").allow ||
    !canManageDashboards(state)
  )
    return null;
  const client = await createSupabaseServerClient();
  if (!client) return null;
  return { state, client, repo: createReportEmailsRepository(client) };
}

/** Alta o edición de una programación. */
export async function saveReportSubscriptionAction(
  _prev: ReportEmailsFormState,
  form: FormData,
): Promise<ReportEmailsFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: FORBIDDEN });
  const parsed = reportSubscriptionSchema.safeParse({
    organizationId: text(form, "organizationId"),
    id: text(form, "id"),
    version: text(form, "version"),
    name: text(form, "name"),
    frequency: text(form, "frequency"),
    centerIds: form.getAll("centerIds").filter((v): v is string => typeof v === "string"),
    recipients: text(form, "recipients"),
    active: text(form, "active"),
    reason: text(form, "reason"),
  });
  if (!parsed.success)
    return stamp({
      ...validationState(fieldErrors(parsed.error), ["organizationId", "id", "version"], form),
      values: values(form, ["centerIds"]),
    });
  const r = await ctx.repo.save({
    ...parsed.data,
    centerIds: parsed.data.centerIds.length ? parsed.data.centerIds : null,
  });
  if (!r.ok) return stamp({ error: dashboardsErrorMessage(r.error), values: values(form, ["centerIds"]) });
  revalidatePath(PATH);
  redirect(`${PATH}?hecho=guardado`);
}

/** Borra una programación (la bitácora de envíos se conserva). */
export async function deleteReportSubscriptionAction(
  _prev: ReportEmailsFormState,
  form: FormData,
): Promise<ReportEmailsFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: FORBIDDEN });
  const reason = changeReasonSchema.safeParse(text(form, "reason"));
  if (!reason.success)
    return stamp({ fields: { reason: reason.error.issues[0]?.message ?? "Motivo inválido" } });
  const r = await ctx.repo.remove(text(form, "id"), reason.data);
  if (!r.ok) return stamp({ error: dashboardsErrorMessage(r.error) });
  revalidatePath(PATH);
  redirect(`${PATH}?hecho=borrado`);
}

/** «Enviar ahora»: el último periodo cerrado, con los permisos de quien lo pide. */
export async function sendReportNowAction(
  _prev: ReportEmailsFormState,
  form: FormData,
): Promise<ReportEmailsFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: FORBIDDEN });
  const scope = reportScope(ctx.state);
  const subs = await ctx.repo.subscriptions(scope.organizationId);
  if (!subs.ok) return stamp({ error: dashboardsErrorMessage(subs.error) });
  const sub = subs.data.find((s) => s.id === text(form, "id"));
  if (!sub) return stamp({ error: "La programación no existe." });
  const r = await sendReportNow({
    client: ctx.client,
    sub,
    orgCenters: scope.orgCenters,
    allowedCenters: (capability) => centersWith(ctx.state, capability),
  });
  revalidatePath(PATH);
  return r.ok ? stamp({ message: r.message }) : stamp({ error: r.message });
}
