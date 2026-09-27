"use server";

import {
  activeCenterAccess,
  b2bCopy,
  b2bErrorMessage,
  guardScreen,
  type RepoError,
  type Screen,
} from "@meguiars/domain";
import { createB2bRepository } from "@meguiars/supabase";
import {
  applyB2bAccountSchema,
  b2bAccountSchema,
  b2bAgreementSchema,
  b2bContactSchema,
  b2bInvoiceSchema,
  b2bPaymentSchema,
  b2bPriceRuleSchema,
  b2bVehicleSchema,
  b2bVoidSchema,
  createB2bOrderSchema,
  fieldErrors,
  linesFromQuantities,
} from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, validationState, values, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type B2bFormState = ActionFormState;

/** Centro activo del servidor (nunca uno enviado por el cliente) y repositorio. */
async function context(screen: Screen) {
  const state = await getAuthState();
  if (!guardScreen(state, screen).allow) return null;
  const active = activeCenterAccess(state);
  const supabase = await createSupabaseServerClient();
  if (!active || !supabase) return null;
  return { state, center: active.center, repo: createB2bRepository(supabase) };
}

const failed = (error: RepoError, form: FormData, multi: readonly string[] = []) =>
  stamp({ error: b2bErrorMessage(error), values: values(form, multi) });
const checked = (form: FormData, key: string) => form.get(key) === "on" || form.get(key) === "true";
const all = (form: FormData, key: string) =>
  form.getAll(key).filter((v): v is string => typeof v === "string");

function refreshAccount(id: string) {
  revalidatePath(`/comercial/b2b/${id}`);
  revalidatePath("/comercial/b2b");
}

export async function upsertAccountAction(_prev: B2bFormState, form: FormData): Promise<B2bFormState> {
  const ctx = await context("b2bAccountNew");
  if (!ctx) return stamp({ error: b2bCopy.forbidden });
  const id = text(form, "id");
  const parsed = b2bAccountSchema.safeParse({
    id,
    requestId: text(form, "requestId"),
    homeDetailCenterId: text(form, "homeDetailCenterId"),
    clientId: text(form, "clientId"),
    name: text(form, "name"),
    legalName: text(form, "legalName"),
    rfc: text(form, "rfc"),
    taxRegime: text(form, "taxRegime"),
    fiscalZip: text(form, "fiscalZip"),
    billingEmail: text(form, "billingEmail"),
    status: text(form, "status") || "activa",
    notes: text(form, "notes"),
    reason: text(form, "reason") || (id ? "" : "Alta de cuenta B2B"),
  });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["id", "requestId"], form));
  const result = await ctx.repo.upsertAccount(parsed.data);
  if (!result.ok) return failed(result.error, form);
  refreshAccount(result.data.id);
  if (!id) redirect(`/comercial/b2b/${result.data.id}?nueva=1`);
  return stamp({ message: b2bCopy.saved });
}

export async function upsertContactAction(_prev: B2bFormState, form: FormData): Promise<B2bFormState> {
  const ctx = await context("b2bAccountNew");
  if (!ctx) return stamp({ error: b2bCopy.forbidden });
  const parsed = b2bContactSchema.safeParse({
    accountId: text(form, "accountId"),
    id: text(form, "id"),
    fullName: text(form, "fullName"),
    title: text(form, "title"),
    phone: text(form, "phone"),
    email: text(form, "email"),
    isPrimary: checked(form, "isPrimary"),
    active: text(form, "active") !== "false",
    reason: text(form, "reason"),
  });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["accountId", "id"], form));
  const result = await ctx.repo.upsertContact(parsed.data);
  refreshAccount(parsed.data.accountId);
  if (!result.ok) return failed(result.error, form);
  return stamp({ message: b2bCopy.saved });
}

export async function upsertAgreementAction(_prev: B2bFormState, form: FormData): Promise<B2bFormState> {
  const ctx = await context("b2bAccountNew");
  if (!ctx) return stamp({ error: b2bCopy.forbidden });
  const id = text(form, "id");
  const parsed = b2bAgreementSchema.safeParse({
    accountId: text(form, "accountId"),
    id,
    requestId: text(form, "requestId"),
    name: text(form, "name"),
    billingModel: text(form, "billingModel"),
    startsOn: text(form, "startsOn"),
    endsOn: text(form, "endsOn"),
    status: text(form, "status") || "activo",
    vehicleRule: text(form, "vehicleRule") || "lista",
    paymentTermsDays: text(form, "paymentTermsDays"),
    creditLimit: text(form, "creditLimit"),
    feeAmount: text(form, "feeAmount"),
    includedUnits: text(form, "includedUnits"),
    centerIds: all(form, "centerIds"),
    notes: text(form, "notes"),
    reason: text(form, "reason"),
  });
  if (!parsed.success)
    return stamp({
      ...validationState(fieldErrors(parsed.error), ["accountId", "id", "requestId"], form),
      values: values(form, ["centerIds"]),
    });
  const result = await ctx.repo.upsertAgreement(parsed.data);
  refreshAccount(parsed.data.accountId);
  if (!result.ok) return failed(result.error, form, ["centerIds"]);
  revalidatePath(`/comercial/b2b/convenios/${result.data.id}`);
  if (!id) redirect(`/comercial/b2b/convenios/${result.data.id}?nuevo=1`);
  return stamp({ message: b2bCopy.saved });
}

export async function setPriceRuleAction(_prev: B2bFormState, form: FormData): Promise<B2bFormState> {
  const ctx = await context("b2bAccountNew");
  if (!ctx) return stamp({ error: b2bCopy.forbidden });
  const parsed = b2bPriceRuleSchema.safeParse({
    agreementId: text(form, "agreementId"),
    id: text(form, "id"),
    serviceId: text(form, "serviceId"),
    kind: text(form, "kind"),
    value: text(form, "value"),
    minMonthlyOrders: text(form, "minMonthlyOrders"),
    active: text(form, "active") !== "false",
    notes: text(form, "notes"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["agreementId", "id"], form));
  const result = await ctx.repo.setPriceRule(parsed.data);
  revalidatePath(`/comercial/b2b/convenios/${parsed.data.agreementId}`);
  if (!result.ok) return failed(result.error, form);
  return stamp({ message: b2bCopy.saved });
}

export async function setVehicleAction(_prev: B2bFormState, form: FormData): Promise<B2bFormState> {
  const ctx = await context("b2bAccountNew");
  if (!ctx) return stamp({ error: b2bCopy.forbidden });
  const parsed = b2bVehicleSchema.safeParse({
    accountId: text(form, "accountId"),
    vehicleId: text(form, "vehicleId"),
    active: text(form, "active") === "true",
    costCenter: text(form, "costCenter"),
    driverName: text(form, "driverName"),
    notes: text(form, "notes"),
    reason: text(form, "reason"),
  });
  if (!parsed.success)
    return stamp(validationState(fieldErrors(parsed.error), ["accountId", "vehicleId", "active"], form));
  const result = await ctx.repo.setVehicle(parsed.data);
  refreshAccount(parsed.data.accountId);
  if (!result.ok) return failed(result.error, form);
  return stamp({ message: b2bCopy.saved });
}

export async function createInvoiceAction(_prev: B2bFormState, form: FormData): Promise<B2bFormState> {
  const ctx = await context("b2bAccountDetail");
  if (!ctx) return stamp({ error: b2bCopy.forbidden });
  const parsed = b2bInvoiceSchema.safeParse({
    accountId: text(form, "accountId"),
    requestId: text(form, "requestId"),
    reference: text(form, "reference"),
    issuedOn: text(form, "issuedOn"),
    orderIds: all(form, "orderIds"),
    feeAmount: text(form, "feeAmount"),
    notes: text(form, "notes"),
  });
  if (!parsed.success)
    return stamp({
      ...validationState(fieldErrors(parsed.error), ["accountId", "requestId"], form),
      values: values(form, ["orderIds"]),
    });
  const result = await ctx.repo.createInvoice(parsed.data);
  refreshAccount(parsed.data.accountId);
  if (!result.ok) return failed(result.error, form, ["orderIds"]);
  return stamp({ message: b2bCopy.saved });
}

export async function recordPaymentAction(_prev: B2bFormState, form: FormData): Promise<B2bFormState> {
  const ctx = await context("b2bAccountDetail");
  if (!ctx) return stamp({ error: b2bCopy.forbidden });
  const parsed = b2bPaymentSchema.safeParse({
    accountId: text(form, "accountId"),
    requestId: text(form, "requestId"),
    amount: text(form, "amount"),
    method: text(form, "method"),
    reference: text(form, "reference"),
    paidOn: text(form, "paidOn"),
    invoiceId: text(form, "invoiceId"),
  });
  if (!parsed.success)
    return stamp(validationState(fieldErrors(parsed.error), ["accountId", "requestId"], form));
  const result = await ctx.repo.recordPayment(parsed.data);
  refreshAccount(parsed.data.accountId);
  if (!result.ok) return failed(result.error, form);
  return stamp({ message: b2bCopy.saved });
}

/** Anular un corte o un pago (botón `kind`), con motivo. */
export async function voidBillingAction(_prev: B2bFormState, form: FormData): Promise<B2bFormState> {
  const ctx = await context("b2bAccountDetail");
  if (!ctx) return stamp({ error: b2bCopy.forbidden });
  const parsed = b2bVoidSchema.safeParse({ id: text(form, "id"), reason: text(form, "reason") });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["id"], form));
  const result =
    text(form, "kind") === "invoice"
      ? await ctx.repo.voidInvoice(parsed.data.id, parsed.data.reason)
      : await ctx.repo.voidPayment(parsed.data.id, parsed.data.reason);
  refreshAccount(text(form, "accountId"));
  if (!result.ok) return failed(result.error, form);
  return stamp({ message: b2bCopy.saved });
}

/** OS a cuenta B2B (operación: orders.write). */
export async function createB2bOrderAction(_prev: B2bFormState, form: FormData): Promise<B2bFormState> {
  const ctx = await context("orderNew");
  if (!ctx) return stamp({ error: b2bCopy.forbidden });
  const quantities: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("qty:") && typeof value === "string") quantities[key.slice(4)] = value;
  }
  const parsed = createB2bOrderSchema.safeParse({
    detailCenterId: ctx.center.id,
    requestId: text(form, "requestId"),
    accountId: text(form, "accountId"),
    vehicleId: text(form, "vehicleId"),
    items: linesFromQuantities(quantities),
    purchaseOrder: text(form, "purchaseOrder"),
    observations: text(form, "observations"),
  });
  if (!parsed.success)
    return stamp({
      fields: Object.fromEntries(
        Object.entries(fieldErrors(parsed.error)).map(([k, v]) => [k === "items" ? "lines" : k, v]),
      ),
      values: values(form),
    });
  const result = await ctx.repo.createOrder(parsed.data);
  if (!result.ok) return failed(result.error, form);
  revalidatePath("/ordenes");
  redirect(`/ordenes/${result.data.id}?nueva=1`);
}

export async function applyB2bAccountAction(_prev: B2bFormState, form: FormData): Promise<B2bFormState> {
  const ctx = await context("orderDetail");
  if (!ctx) return stamp({ error: b2bCopy.forbidden });
  const parsed = applyB2bAccountSchema.safeParse({
    orderId: text(form, "orderId"),
    version: text(form, "version"),
    accountId: text(form, "accountId"),
    purchaseOrder: text(form, "purchaseOrder"),
  });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["orderId", "version"], form));
  const result = await ctx.repo.applyAccount(
    parsed.data.orderId,
    parsed.data.version,
    parsed.data.accountId,
    parsed.data.purchaseOrder,
  );
  revalidatePath(`/ordenes/${parsed.data.orderId}`);
  if (!result.ok) return failed(result.error, form);
  return stamp({ message: b2bCopy.saved });
}
