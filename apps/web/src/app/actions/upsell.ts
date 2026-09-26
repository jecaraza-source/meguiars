"use server";

import {
  activeCenterAccess,
  guardScreen,
  upsellCopy,
  upsellErrorMessage,
  type Screen,
} from "@meguiars/domain";
import { createUpsellRepository } from "@meguiars/supabase";
import { fieldErrors, upsellDecisionSchema, upsellRuleSchema } from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, validationState, values, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type UpsellFormState = ActionFormState;

async function context(screen: Screen) {
  const state = await getAuthState();
  if (!guardScreen(state, screen).allow) return null;
  const active = activeCenterAccess(state);
  const supabase = await createSupabaseServerClient();
  if (!active || !supabase) return null;
  return { state, center: active.center, repo: createUpsellRepository(supabase) };
}

/** Aceptar o rechazar una sugerencia (botón `op`). Nunca bloquea la OS: un error sólo se muestra en la tarjeta. */
export async function decideUpsellAction(_prev: UpsellFormState, form: FormData): Promise<UpsellFormState> {
  const ctx = await context("orderDetail");
  if (!ctx) return stamp({ error: upsellCopy.forbidden });
  const parsed = upsellDecisionSchema.safeParse({
    orderId: text(form, "orderId"),
    ruleId: text(form, "ruleId"),
    version: text(form, "version"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return stamp({ error: upsellCopy.forbidden });
  const { orderId, ruleId, version, reason } = parsed.data;
  if (text(form, "op") === "reject") {
    const r = await ctx.repo.reject(orderId, ruleId, reason);
    revalidatePath(`/ordenes/${orderId}`);
    return r.ok ? stamp({ message: upsellCopy.dismissed }) : stamp({ error: upsellErrorMessage(r.error) });
  }
  const r = await ctx.repo.accept(orderId, version ?? 0, ruleId);
  revalidatePath(`/ordenes/${orderId}`);
  if (!r.ok) return stamp({ error: upsellErrorMessage(r.error) });
  const clientId = text(form, "membershipClientId");
  if (clientId) redirect(`/comercial/membresias/nueva?cliente=${clientId}`);
  return stamp({ message: upsellCopy.added });
}

export async function upsertUpsellRuleAction(
  _prev: UpsellFormState,
  form: FormData,
): Promise<UpsellFormState> {
  const ctx = await context("upsell");
  if (!ctx) return stamp({ error: upsellCopy.forbidden });
  const targetKind = text(form, "targetKind");
  const parsed = upsellRuleSchema.safeParse({
    organizationId: ctx.center.organizationId,
    id: text(form, "id"),
    name: text(form, "name"),
    sourceServiceId: text(form, "sourceServiceId"),
    targetServiceId: targetKind === "membresia" ? "" : text(form, "targetServiceId"),
    targetPlanId: targetKind === "membresia" ? text(form, "targetPlanId") : "",
    stage: text(form, "stage"),
    priority: text(form, "priority"),
    pitch: text(form, "pitch"),
    channels: form.getAll("channels").filter((v): v is string => typeof v === "string"),
    centerIds: form.getAll("centerIds").filter((v): v is string => typeof v === "string"),
    minOrderTotal: text(form, "minOrderTotal"),
    startsOn: text(form, "startsOn"),
    endsOn: text(form, "endsOn"),
    active: form.get("active") === "on",
    reason: text(form, "reason"),
  });
  if (!parsed.success)
    return stamp({
      ...validationState(fieldErrors(parsed.error), ["organizationId", "id"], form),
      values: values(form, ["channels", "centerIds"]),
    });
  const r = await ctx.repo.upsertRule(parsed.data);
  revalidatePath("/comercial/recomendaciones");
  if (!r.ok)
    return stamp({ error: upsellErrorMessage(r.error), values: values(form, ["channels", "centerIds"]) });
  if (!parsed.data.id) redirect(`/comercial/recomendaciones?regla=${r.data.id}&guardada=1`);
  return stamp({ message: upsellCopy.saved });
}
