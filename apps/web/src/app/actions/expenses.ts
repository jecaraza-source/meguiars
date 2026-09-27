"use server";

import {
  activeCenterAccess,
  canInActiveCenter,
  expenseErrorMessage,
  expensesCopy,
  guardScreen,
  type Capability,
  type ExpenseMutation,
  type Result,
} from "@meguiars/domain";
import { createExpenseRepository } from "@meguiars/supabase";
import {
  approveExpenseSchema,
  expenseCategorySchema,
  expenseFormSchema,
  expenseReasonSchema,
  fieldErrors,
  receiptMetaSchema,
  removeReceiptSchema,
  thresholdSchema,
  updateExpenseSchema,
  vendorSchema,
} from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, validationState, values, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ExpenseFormState = ActionFormState;

/** Centro activo del servidor (nunca uno enviado por el cliente) con la capacidad pedida. */
async function context(capability: Capability) {
  const state = await getAuthState();
  if (!guardScreen(state, "expenses").allow || !canInActiveCenter(state, capability)) return null;
  const active = activeCenterAccess(state);
  const supabase = await createSupabaseServerClient();
  if (!active || !supabase) return null;
  return { center: active.center, repo: createExpenseRepository(supabase) };
}

const fields = (form: FormData) => ({
  categoryId: text(form, "categoryId"),
  vendorId: text(form, "vendorId"),
  concept: text(form, "concept"),
  amount: text(form, "amount"),
  paymentMethod: text(form, "paymentMethod"),
  paidOn: text(form, "paidOn"),
  reference: text(form, "reference"),
  notes: text(form, "notes"),
});

function done(expenseId: string, result: Result<unknown>, form: FormData, message: string): ExpenseFormState {
  revalidatePath(`/finanzas/egresos/${expenseId}`);
  revalidatePath("/finanzas/egresos");
  revalidatePath("/finanzas/resultados");
  if (!result.ok) {
    const stale = result.error.code === "40001";
    return stamp({ error: expenseErrorMessage(result.error), values: stale ? {} : values(form) });
  }
  return stamp({ message });
}

/** Comprobante opcional del formulario: el tipo y el tamaño salen del archivo, no del cliente. */
function receiptOf(form: FormData) {
  const file = form.get("receipt");
  if (!(file instanceof File) || file.size === 0) return { file: null, error: null };
  const parsed = receiptMetaSchema.safeParse({
    contentType: file.type,
    sizeBytes: file.size,
    fileName: file.name,
  });
  if (!parsed.success) {
    const e = fieldErrors(parsed.error);
    return { file: null, error: e.contentType ?? e.sizeBytes ?? e.fileName ?? expensesCopy.receiptType };
  }
  return { file, error: null, meta: parsed.data };
}

const fileIdOf = (form: FormData) => {
  const id = text(form, "fileId");
  return /^[0-9a-f-]{36}$/i.test(id) ? id : crypto.randomUUID();
};

export async function createExpenseAction(
  _prev: ExpenseFormState,
  form: FormData,
): Promise<ExpenseFormState> {
  const ctx = await context("expenses.write");
  if (!ctx) return stamp({ error: expensesCopy.forbidden });
  const parsed = expenseFormSchema.safeParse(fields(form));
  const receipt = receiptOf(form);
  if (!parsed.success || receipt.error) {
    const f = parsed.success ? {} : fieldErrors(parsed.error);
    return stamp({
      fields: { ...f, ...(receipt.error ? { receipt: receipt.error } : {}) },
      values: values(form),
    });
  }
  const result: Result<ExpenseMutation> = await ctx.repo.create({
    ...parsed.data,
    detailCenterId: ctx.center.id,
    requestId: text(form, "requestId"),
  });
  if (!result.ok) return stamp({ error: expenseErrorMessage(result.error), values: values(form) });
  let query = result.data.status === "pendiente" ? "?creado=pendiente" : "?creado=1";
  if (receipt.file && receipt.meta) {
    const upload = await ctx.repo.uploadReceipt({
      expense: {
        organizationId: ctx.center.organizationId,
        detailCenterId: ctx.center.id,
        id: result.data.id,
      },
      fileId: fileIdOf(form),
      file: receipt.file,
      contentType: receipt.meta.contentType,
      sizeBytes: receipt.meta.sizeBytes,
      fileName: receipt.meta.fileName,
    });
    // El egreso ya existe: si el comprobante falla se avisa en la ficha para reintentar.
    if (!upload.ok) query += "&comprobante=error";
  }
  revalidatePath("/finanzas/egresos");
  revalidatePath("/finanzas/resultados");
  redirect(`/finanzas/egresos/${result.data.id}${query}`);
}

export async function updateExpenseAction(
  _prev: ExpenseFormState,
  form: FormData,
): Promise<ExpenseFormState> {
  const ctx = await context("expenses.write");
  if (!ctx) return stamp({ error: expensesCopy.forbidden });
  const expenseId = text(form, "expenseId");
  const parsed = updateExpenseSchema.safeParse({
    ...fields(form),
    expenseId,
    version: text(form, "version"),
    reason: text(form, "reason"),
  });
  if (!parsed.success)
    return stamp(validationState(fieldErrors(parsed.error), ["expenseId", "version"], form));
  return done(expenseId, await ctx.repo.update(parsed.data), form, expensesCopy.saved);
}

/**
 * Aprobar, rechazar o anular. Tras decidir, el formulario deja de aplicar al
 * egreso: se redirige a la ficha con el aviso en la URL.
 */
export async function decideExpenseAction(
  _prev: ExpenseFormState,
  form: FormData,
): Promise<ExpenseFormState> {
  const decision = text(form, "decision");
  const ctx = await context(decision === "void" ? "expenses.write" : "expenses.approve");
  if (!ctx) return stamp({ error: expensesCopy.forbidden });
  const expenseId = text(form, "expenseId");
  const raw = { expenseId, version: text(form, "version"), reason: text(form, "reason") };
  let result: Result<ExpenseMutation>;
  if (decision === "approve") {
    const parsed = approveExpenseSchema.safeParse(raw);
    if (!parsed.success)
      return stamp(validationState(fieldErrors(parsed.error), ["expenseId", "version"], form));
    result = await ctx.repo.approve(parsed.data);
  } else {
    const parsed = expenseReasonSchema.safeParse(raw);
    if (!parsed.success)
      return stamp(validationState(fieldErrors(parsed.error), ["expenseId", "version"], form));
    result = decision === "reject" ? await ctx.repo.reject(parsed.data) : await ctx.repo.void(parsed.data);
  }
  const state = done(expenseId, result, form, "");
  if (!result.ok) return state;
  redirect(
    `/finanzas/egresos/${expenseId}?hecho=${decision === "approve" ? "aprobado" : decision === "reject" ? "rechazado" : "anulado"}`,
  );
}

export async function uploadReceiptAction(
  _prev: ExpenseFormState,
  form: FormData,
): Promise<ExpenseFormState> {
  const ctx = await context("expenses.write");
  if (!ctx) return stamp({ error: expensesCopy.forbidden });
  const expenseId = text(form, "expenseId");
  const receipt = receiptOf(form);
  if (!receipt.file || !receipt.meta)
    return stamp({ fields: { receipt: receipt.error ?? expensesCopy.receiptType }, values: values(form) });
  const expense = await ctx.repo.get(expenseId);
  if (!expense.ok) return stamp({ error: expensesCopy.notFound });
  const result = await ctx.repo.uploadReceipt({
    expense: expense.data,
    fileId: fileIdOf(form),
    file: receipt.file,
    contentType: receipt.meta.contentType,
    sizeBytes: receipt.meta.sizeBytes,
    fileName: receipt.meta.fileName,
  });
  return done(expenseId, result, form, expensesCopy.receiptAdded);
}

export async function removeReceiptAction(
  _prev: ExpenseFormState,
  form: FormData,
): Promise<ExpenseFormState> {
  const ctx = await context("expenses.write");
  if (!ctx) return stamp({ error: expensesCopy.forbidden });
  const expenseId = text(form, "expenseId");
  const parsed = removeReceiptSchema.safeParse({
    attachmentId: text(form, "attachmentId"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["attachmentId"], form));
  return done(
    expenseId,
    await ctx.repo.removeReceipt(parsed.data.attachmentId, parsed.data.reason),
    form,
    expensesCopy.receiptRemoved,
  );
}

export async function upsertVendorAction(_prev: ExpenseFormState, form: FormData): Promise<ExpenseFormState> {
  const ctx = await context("expenses.write");
  if (!ctx) return stamp({ error: expensesCopy.forbidden });
  const parsed = vendorSchema.safeParse({
    detailCenterId: ctx.center.id,
    vendorId: text(form, "vendorId"),
    name: text(form, "name"),
    rfc: text(form, "rfc"),
    phone: text(form, "phone"),
    email: text(form, "email"),
    notes: text(form, "notes"),
    active: form.get("active") === "on",
  });
  if (!parsed.success)
    return stamp(validationState(fieldErrors(parsed.error), ["detailCenterId", "vendorId"], form));
  const result = await ctx.repo.upsertVendor(parsed.data);
  revalidatePath("/finanzas/egresos/configuracion");
  if (!result.ok) return stamp({ error: expenseErrorMessage(result.error), values: values(form) });
  return stamp({ message: expensesCopy.vendorSaved });
}

export async function upsertCategoryAction(
  _prev: ExpenseFormState,
  form: FormData,
): Promise<ExpenseFormState> {
  const ctx = await context("expenses.manage");
  if (!ctx) return stamp({ error: expensesCopy.forbidden });
  const parsed = expenseCategorySchema.safeParse({
    organizationId: ctx.center.organizationId,
    categoryId: text(form, "categoryId"),
    code: text(form, "code"),
    name: text(form, "name"),
    pnlGroup: text(form, "pnlGroup"),
    description: text(form, "description"),
    position: text(form, "position"),
    active: form.get("active") === "on",
    reason: text(form, "reason"),
  });
  if (!parsed.success)
    return stamp(validationState(fieldErrors(parsed.error), ["organizationId", "categoryId"], form));
  const result = await ctx.repo.upsertCategory(parsed.data);
  revalidatePath("/finanzas/egresos/configuracion");
  if (!result.ok) return stamp({ error: expenseErrorMessage(result.error), values: values(form) });
  return stamp({ message: expensesCopy.categorySaved });
}

export async function setThresholdAction(_prev: ExpenseFormState, form: FormData): Promise<ExpenseFormState> {
  const ctx = await context("expenses.approve");
  if (!ctx) return stamp({ error: expensesCopy.forbidden });
  const parsed = thresholdSchema.safeParse({
    detailCenterId: ctx.center.id,
    threshold: text(form, "threshold"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["detailCenterId"], form));
  const result = await ctx.repo.setThreshold(
    ctx.center.id,
    parsed.data.threshold ?? null,
    parsed.data.reason,
  );
  revalidatePath("/finanzas/egresos/configuracion");
  revalidatePath("/finanzas/egresos/nuevo");
  if (!result.ok) return stamp({ error: expenseErrorMessage(result.error), values: values(form) });
  return stamp({ message: expensesCopy.thresholdSaved });
}
