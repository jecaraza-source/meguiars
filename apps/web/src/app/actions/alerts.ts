"use server";

import { alertsErrorMessage, ALERTS_COPY, guardScreen } from "@meguiars/domain";
import { createAlertsRepository, createDashboardRepository } from "@meguiars/supabase";
import { alertResolveSchema, alertReviewSchema, alertRuleSchema, fieldErrors } from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { evaluateAlertsNow } from "@/lib/alerts";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, validationState, values, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AlertsFormState = ActionFormState;

const FORBIDDEN = "No tienes permiso para esta acción.";

/** Sesión con acceso a la pantalla; la base vuelve a autorizar cada escritura (RPC + RLS). */
async function context(screen: "alerts" | "alertRules") {
  const state = await getAuthState();
  if (state.status !== "signed_in" || !guardScreen(state, screen).allow) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  return { state, alerts: createAlertsRepository(supabase), dashboards: createDashboardRepository(supabase) };
}

function revalidateAlerts(id?: string) {
  revalidatePath("/direccion/alertas");
  if (id) revalidatePath(`/direccion/alertas/${id}`);
}

export async function reviewAlertAction(_prev: AlertsFormState, form: FormData): Promise<AlertsFormState> {
  const ctx = await context("alerts");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const parsed = alertReviewSchema.safeParse({ id: text(form, "id"), note: text(form, "note") });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["id"], form));
  const r = await ctx.alerts.review(parsed.data.id, parsed.data.note);
  if (!r.ok) return stamp({ error: alertsErrorMessage(r.error), values: values(form) });
  revalidateAlerts(parsed.data.id);
  return stamp({ message: "Alerta marcada como revisada." });
}

export async function resolveAlertAction(_prev: AlertsFormState, form: FormData): Promise<AlertsFormState> {
  const ctx = await context("alerts");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const parsed = alertResolveSchema.safeParse({ id: text(form, "id"), note: text(form, "note") });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["id"], form));
  const r = await ctx.alerts.resolve(parsed.data.id, parsed.data.note);
  if (!r.ok) return stamp({ error: alertsErrorMessage(r.error), values: values(form) });
  revalidateAlerts(parsed.data.id);
  return stamp({ message: `Alerta resuelta. ${ALERTS_COPY.resolvedKeepsHistory}` });
}

/** Alta o edición de una regla (admin corporativo). */
export async function saveAlertRuleAction(_prev: AlertsFormState, form: FormData): Promise<AlertsFormState> {
  const ctx = await context("alertRules");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const parsed = alertRuleSchema.safeParse({
    organizationId: text(form, "organizationId"),
    id: text(form, "id"),
    version: text(form, "version"),
    name: text(form, "name"),
    description: text(form, "description"),
    metricId: text(form, "metricId"),
    channel: text(form, "channel"),
    condition: text(form, "condition"),
    threshold: text(form, "threshold"),
    period: text(form, "period"),
    scopeKind: text(form, "scopeKind"),
    centerIds: form.getAll("centerIds").filter((v): v is string => typeof v === "string"),
    severity: text(form, "severity"),
    cooldownMinutes: text(form, "cooldownMinutes"),
    active: text(form, "active"),
    reason: text(form, "reason"),
  });
  if (!parsed.success)
    return stamp({
      ...validationState(fieldErrors(parsed.error), ["organizationId", "id", "version"], form),
      values: values(form, ["centerIds"]),
    });
  const r = await ctx.alerts.saveRule(parsed.data);
  if (!r.ok) return stamp({ error: alertsErrorMessage(r.error), values: values(form, ["centerIds"]) });
  revalidatePath("/direccion/alertas/reglas");
  redirect("/direccion/alertas/reglas?hecho=guardada");
}

/** "Evaluar ahora": mismo runner que el cron, con la sesión del admin corporativo. */
export async function evaluateAlertsNowAction(_prev: AlertsFormState): Promise<AlertsFormState> {
  const ctx = await context("alertRules");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const r = await evaluateAlertsNow(ctx.state, ctx.alerts, ctx.dashboards);
  if (!r.ok) return stamp({ error: r.error });
  revalidateAlerts();
  revalidatePath("/direccion/alertas/reglas");
  const s = r.summary;
  const base = `Reglas evaluadas: ${s.rulesEvaluated}. Alertas nuevas: ${s.created.length}.`;
  return s.errors.length
    ? stamp({ error: `${base} Con error: ${s.errors.map((e) => e.message).join("; ")}` })
    : stamp({ message: base });
}
