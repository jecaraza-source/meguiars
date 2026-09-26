"use server";

import {
  activeCenterAccess,
  canManageServices,
  guardScreen,
  membershipErrorMessage,
  membershipsCopy,
  type RepoError,
  type Screen,
} from "@meguiars/domain";
import { createMembershipRepository } from "@meguiars/supabase";
import {
  createMembershipSchema,
  fieldErrors,
  membershipBenefitSchema,
  membershipPlanSchema,
  membershipStateSchema,
  redeemBenefitSchema,
  renewMembershipSchema,
  voidRedemptionSchema,
} from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, validationState, values, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MembershipFormState = ActionFormState;

/** Centro activo del servidor (nunca uno enviado por el cliente) y repositorio. */
async function context(screen: Screen) {
  const state = await getAuthState();
  if (!guardScreen(state, screen).allow) return null;
  const active = activeCenterAccess(state);
  const supabase = await createSupabaseServerClient();
  if (!active || !supabase) return null;
  return { state, center: active.center, repo: createMembershipRepository(supabase) };
}

const failed = (error: RepoError, form: FormData) =>
  stamp({ error: membershipErrorMessage(error), values: values(form) });

function refreshMembership(id: string) {
  revalidatePath(`/comercial/membresias/${id}`);
  revalidatePath("/comercial/membresias");
  revalidatePath("/comercial");
}

export async function createMembershipAction(
  _prev: MembershipFormState,
  form: FormData,
): Promise<MembershipFormState> {
  const ctx = await context("membershipNew");
  if (!ctx) return stamp({ error: membershipsCopy.forbidden });
  const parsed = createMembershipSchema.safeParse({
    detailCenterId: ctx.center.id,
    requestId: text(form, "requestId"),
    planId: text(form, "planId"),
    clientId: text(form, "clientId"),
    vehicleId: text(form, "vehicleId"),
    startsOn: text(form, "startsOn"),
    paymentReference: text(form, "paymentReference"),
  });
  if (!parsed.success) {
    return stamp(
      validationState(fieldErrors(parsed.error), ["detailCenterId", "requestId", "clientId"], form),
    );
  }
  const result = await ctx.repo.create(parsed.data);
  if (!result.ok) return failed(result.error, form);
  revalidatePath("/comercial/membresias");
  redirect(`/comercial/membresias/${result.data.id}?nueva=1`);
}

export async function renewMembershipAction(
  _prev: MembershipFormState,
  form: FormData,
): Promise<MembershipFormState> {
  const ctx = await context("membershipDetail");
  if (!ctx) return stamp({ error: membershipsCopy.forbidden });
  const parsed = renewMembershipSchema.safeParse({
    membershipId: text(form, "membershipId"),
    requestId: text(form, "requestId"),
    planId: text(form, "planId"),
    paymentReference: text(form, "paymentReference"),
  });
  if (!parsed.success)
    return stamp(validationState(fieldErrors(parsed.error), ["membershipId", "requestId"], form));
  const result = await ctx.repo.renew(parsed.data);
  refreshMembership(parsed.data.membershipId);
  if (!result.ok) return failed(result.error, form);
  return stamp({ message: membershipsCopy.renewed });
}

export async function setMembershipStateAction(
  _prev: MembershipFormState,
  form: FormData,
): Promise<MembershipFormState> {
  const ctx = await context("membershipDetail");
  if (!ctx) return stamp({ error: membershipsCopy.forbidden });
  const parsed = membershipStateSchema.safeParse({
    membershipId: text(form, "membershipId"),
    state: text(form, "state"),
    reason: text(form, "reason"),
  });
  if (!parsed.success)
    return stamp(validationState(fieldErrors(parsed.error), ["membershipId", "state"], form));
  const result = await ctx.repo.setState(parsed.data);
  refreshMembership(parsed.data.membershipId);
  if (!result.ok) return failed(result.error, form);
  return stamp({ message: membershipsCopy.saved });
}

export async function redeemBenefitAction(
  _prev: MembershipFormState,
  form: FormData,
): Promise<MembershipFormState> {
  const ctx = await context("orderNew");
  if (!ctx) return stamp({ error: membershipsCopy.forbidden });
  const parsed = redeemBenefitSchema.safeParse({
    orderId: text(form, "orderId"),
    version: text(form, "version"),
    itemId: text(form, "itemId"),
    membershipId: text(form, "membershipId"),
    quantity: text(form, "quantity") || "1",
    requestId: text(form, "requestId"),
  });
  if (!parsed.success) {
    return stamp(
      validationState(fieldErrors(parsed.error), ["orderId", "version", "membershipId", "requestId"], form),
    );
  }
  const result = await ctx.repo.redeem(parsed.data);
  revalidatePath(`/ordenes/${parsed.data.orderId}`);
  refreshMembership(parsed.data.membershipId);
  if (!result.ok) return failed(result.error, form);
  return stamp({ message: membershipsCopy.redeemed });
}

export async function voidRedemptionAction(
  _prev: MembershipFormState,
  form: FormData,
): Promise<MembershipFormState> {
  const ctx = await context("orderNew");
  if (!ctx) return stamp({ error: membershipsCopy.forbidden });
  const orderId = text(form, "orderId");
  const parsed = voidRedemptionSchema.safeParse({
    redemptionId: text(form, "redemptionId"),
    version: text(form, "version"),
    reason: text(form, "reason"),
  });
  if (!parsed.success)
    return stamp(validationState(fieldErrors(parsed.error), ["redemptionId", "version"], form));
  const result = await ctx.repo.voidRedemption(
    parsed.data.redemptionId,
    parsed.data.version,
    parsed.data.reason,
  );
  revalidatePath(`/ordenes/${orderId}`);
  if (result.ok) refreshMembership(result.data.membershipId);
  if (!result.ok) return failed(result.error, form);
  return stamp({ message: membershipsCopy.saved });
}

/** Alta o edición de un plan (admin corporativo). */
export async function upsertPlanAction(
  _prev: MembershipFormState,
  form: FormData,
): Promise<MembershipFormState> {
  const ctx = await context("membershipPlans");
  if (!ctx || !canManageServices(ctx.state)) return stamp({ error: membershipsCopy.forbidden });
  const id = text(form, "id");
  const parsed = membershipPlanSchema.safeParse({
    organizationId: ctx.center.organizationId,
    id,
    code: text(form, "code"),
    tier: text(form, "tier"),
    name: text(form, "name"),
    description: text(form, "description"),
    price: text(form, "price"),
    periodMonths: text(form, "periodMonths"),
    redeemScope: text(form, "redeemScope"),
    restrictions: text(form, "restrictions"),
    renewalNoticeDays: text(form, "renewalNoticeDays"),
    availableFrom: text(form, "availableFrom"),
    availableUntil: text(form, "availableUntil"),
    active: text(form, "active") === "1",
    reason: text(form, "reason"),
  });
  if (!parsed.success)
    return stamp(validationState(fieldErrors(parsed.error), ["organizationId", "id"], form));
  const result = await ctx.repo.upsertPlan(parsed.data);
  revalidatePath("/comercial/planes");
  if (!result.ok) return failed(result.error, form);
  if (!id) redirect(`/comercial/planes/${result.data.id}?nuevo=1`);
  revalidatePath(`/comercial/planes/${result.data.id}`);
  return stamp({ message: membershipsCopy.saved });
}

/** Servicio incluido en un plan (unidades vacías o "Quitar" = quitarlo). */
export async function setBenefitAction(
  _prev: MembershipFormState,
  form: FormData,
): Promise<MembershipFormState> {
  const ctx = await context("membershipPlanDetail");
  if (!ctx || !canManageServices(ctx.state)) return stamp({ error: membershipsCopy.forbidden });
  const planId = text(form, "planId");
  const parsed = membershipBenefitSchema.safeParse({
    planId,
    serviceId: text(form, "serviceId"),
    quantityPerPeriod: text(form, "intent") === "remove" ? "" : text(form, "quantityPerPeriod"),
    notes: text(form, "notes"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["planId"], form));
  const result = await ctx.repo.setBenefit(parsed.data);
  revalidatePath(`/comercial/planes/${planId}`);
  revalidatePath("/comercial/planes");
  if (!result.ok) return failed(result.error, form);
  return stamp({ message: membershipsCopy.saved });
}
