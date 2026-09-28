"use server";

import { guardScreen, receivablesCopy, receivablesErrorMessage, type RepoError } from "@meguiars/domain";
import { createReceivablesRepository } from "@meguiars/supabase";
import {
  allocateB2bPaymentSchema,
  b2bVoidSchema,
  billingBatchSchema,
  fieldErrors,
  registerB2bPaymentSchema,
  updateBillingBatchSchema,
} from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, validationState, values, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ReceivablesFormState = ActionFormState;

/**
 * Sesión con acceso a cuentas por cobrar. Agrupar, facturar y cobrar se
 * autorizan en la base (b2b.billing en el centro gestor de la cuenta).
 */
async function context() {
  const state = await getAuthState();
  if (!guardScreen(state, "receivables").allow) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  return { repo: createReceivablesRepository(supabase) };
}

const failed = (error: RepoError, form: FormData, multi: readonly string[] = []) =>
  stamp({ error: receivablesErrorMessage(error), values: values(form, multi) });

const all = (form: FormData, key: string) =>
  form.getAll(key).filter((v): v is string => typeof v === "string");

function refresh(accountId: string, documentId?: string) {
  revalidatePath("/finanzas/cxc");
  if (accountId) {
    revalidatePath(`/finanzas/cxc/cuentas/${accountId}`);
    revalidatePath(`/comercial/b2b/${accountId}`);
  }
  if (documentId) revalidatePath(`/finanzas/cxc/documentos/${documentId}`);
}

/** Agrupa OS entregadas del periodo (todas o las elegidas) y la cuota en un documento de cobro. */
export async function createBatchAction(
  _prev: ReceivablesFormState,
  form: FormData,
): Promise<ReceivablesFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: receivablesCopy.forbidden });
  const accountId = text(form, "accountId");
  const offered = all(form, "offeredIds");
  const selected = all(form, "orderIds");
  // Todas las ofrecidas marcadas = todas las del periodo (la base las vuelve a buscar).
  const orderIds = selected.length === offered.length ? undefined : selected;
  const parsed = billingBatchSchema.safeParse({
    accountId,
    requestId: text(form, "requestId"),
    periodFrom: text(form, "periodFrom"),
    periodTo: text(form, "periodTo"),
    orderIds,
    feeAmount: text(form, "feeAmount"),
    dueOn: text(form, "dueOn"),
    externalRef: text(form, "externalRef"),
    externalInvoicedOn: text(form, "externalInvoicedOn"),
    notes: text(form, "notes"),
  });
  if (!parsed.success)
    return stamp({
      ...validationState(fieldErrors(parsed.error), ["accountId", "requestId", "orderIds"], form),
      values: values(form, ["orderIds", "offeredIds"]),
    });
  if (orderIds && orderIds.length === 0 && parsed.data.feeAmount <= 0)
    return stamp({ error: "Elige al menos una OS o captura la cuota", values: values(form, ["orderIds"]) });
  const result = await ctx.repo.createBatch(parsed.data);
  refresh(accountId);
  if (!result.ok) return failed(result.error, form, ["orderIds", "offeredIds"]);
  redirect(`/finanzas/cxc/documentos/${result.data.id}?hecho=creado`);
}

/** Referencia de la factura externa y fecha compromiso (con motivo). */
export async function updateBatchAction(
  _prev: ReceivablesFormState,
  form: FormData,
): Promise<ReceivablesFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: receivablesCopy.forbidden });
  const invoiceId = text(form, "invoiceId");
  const parsed = updateBillingBatchSchema.safeParse({
    invoiceId,
    externalRef: text(form, "externalRef"),
    externalInvoicedOn: text(form, "externalInvoicedOn"),
    dueOn: text(form, "dueOn"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["invoiceId"], form));
  const result = await ctx.repo.updateBatch(parsed.data);
  refresh(text(form, "accountId"), invoiceId);
  if (!result.ok) return failed(result.error, form);
  return stamp({ message: receivablesCopy.saved });
}

/** Anula un documento sin pagos aplicados; sus OS vuelven a quedar por agrupar. */
export async function voidBatchAction(
  _prev: ReceivablesFormState,
  form: FormData,
): Promise<ReceivablesFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: receivablesCopy.forbidden });
  const invoiceId = text(form, "invoiceId");
  const parsed = b2bVoidSchema.safeParse({ id: invoiceId, reason: text(form, "reason") });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["id"], form));
  const result = await ctx.repo.voidBatch(parsed.data.id, parsed.data.reason);
  refresh(text(form, "accountId"), invoiceId);
  if (!result.ok) return failed(result.error, form);
  return stamp({ message: receivablesCopy.voided });
}

/**
 * Pago de la cuenta. Aplicación "auto" (compromiso más antiguo primero) o
 * manual: un importe por documento en los campos `alloc:<id>`.
 */
export async function registerPaymentAction(
  _prev: ReceivablesFormState,
  form: FormData,
): Promise<ReceivablesFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: receivablesCopy.forbidden });
  const accountId = text(form, "accountId");
  const allocations =
    text(form, "mode") === "manual"
      ? [...form.entries()]
          .filter(([k, v]) => k.startsWith("alloc:") && typeof v === "string" && v.trim() !== "")
          .map(([k, v]) => ({ invoiceId: k.slice(6), amount: v as string }))
      : undefined;
  const parsed = registerB2bPaymentSchema.safeParse({
    accountId,
    requestId: text(form, "requestId"),
    amount: text(form, "amount"),
    method: text(form, "method"),
    reference: text(form, "reference"),
    paidOn: text(form, "paidOn"),
    allocations,
  });
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error);
    const allocError = Object.entries(fields).find(([k]) => k.startsWith("allocations"))?.[1];
    return stamp({
      ...validationState(fields, ["accountId", "requestId"], form),
      ...(allocError ? { error: allocError } : {}),
    });
  }
  const result = await ctx.repo.registerPayment(parsed.data);
  refresh(accountId);
  if (!result.ok) return failed(result.error, form);
  return stamp({ message: receivablesCopy.paymentRecorded });
}

/** Aplica el saldo a favor de un pago (automático: compromiso más antiguo primero). */
export async function allocatePaymentAction(
  _prev: ReceivablesFormState,
  form: FormData,
): Promise<ReceivablesFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: receivablesCopy.forbidden });
  const parsed = allocateB2bPaymentSchema.safeParse({ paymentId: text(form, "paymentId") });
  if (!parsed.success) return stamp({ error: receivablesCopy.forbidden });
  const result = await ctx.repo.allocatePayment(parsed.data);
  refresh(text(form, "accountId"));
  if (!result.ok) return failed(result.error, form);
  return stamp({ message: receivablesCopy.allocated });
}

/** Anula un pago (sus aplicaciones dejan de contar) con motivo. */
export async function voidPaymentAction(
  _prev: ReceivablesFormState,
  form: FormData,
): Promise<ReceivablesFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: receivablesCopy.forbidden });
  const parsed = b2bVoidSchema.safeParse({ id: text(form, "paymentId"), reason: text(form, "reason") });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["id"], form));
  const result = await ctx.repo.voidPayment(parsed.data.id, parsed.data.reason);
  refresh(text(form, "accountId"));
  if (!result.ok) return failed(result.error, form);
  return stamp({ message: receivablesCopy.paymentVoided });
}
