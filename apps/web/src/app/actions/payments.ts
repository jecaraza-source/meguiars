"use server";

import {
  activeCenterAccess,
  canInActiveCenter,
  guardScreen,
  paymentErrorMessage,
  paymentsCopy,
} from "@meguiars/domain";
import { createPaymentRepository } from "@meguiars/supabase";
import { fieldErrors, paymentFormSchema, reversePaymentSchema } from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, values, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PaymentFormState = ActionFormState;

/** Sesión con la capacidad en el centro activo (nunca un centro enviado por el cliente). */
async function context(capability: "payments.write" | "payments.reverse") {
  const state = await getAuthState();
  if (!guardScreen(state, "orderDetail").allow || !canInActiveCenter(state, capability)) return null;
  const supabase = await createSupabaseServerClient();
  if (!activeCenterAccess(state) || !supabase) return null;
  return createPaymentRepository(supabase);
}

/** Formas de pago del formulario: tenders.<n>.method / amount / reference. */
function tendersOf(form: FormData) {
  const rows = new Map<number, Record<string, string>>();
  for (const [key, value] of form.entries()) {
    const m = /^tenders\.(\d+)\.(method|amount|reference)$/.exec(key);
    if (!m || typeof value !== "string") continue;
    const row = rows.get(Number(m[1])) ?? {};
    row[m[2]!] = value;
    rows.set(Number(m[1]), row);
  }
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([, row]) => row);
}

const refresh = (orderId: string) => {
  revalidatePath(`/ordenes/${orderId}`);
  revalidatePath("/ordenes");
  revalidatePath("/finanzas/cobranza");
};

/** Cobro (total, parcial o mixto). Requiere conexión; el requestId hace idempotente el reintento. */
export async function registerPaymentAction(
  _prev: PaymentFormState,
  form: FormData,
): Promise<PaymentFormState> {
  const repo = await context("payments.write");
  if (!repo) return stamp({ error: paymentsCopy.forbidden });
  const orderId = text(form, "orderId");
  const parsed = paymentFormSchema.safeParse({
    tenders: tendersOf(form),
    cashReceived: text(form, "cashReceived"),
    notes: text(form, "notes"),
  });
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error);
    const first = Object.entries(fields).find(([k]) => k.startsWith("tenders"))?.[1];
    return stamp({ fields, error: first, values: values(form) });
  }
  const result = await repo.register({
    ...parsed.data,
    orderId,
    version: Number(text(form, "version")),
    requestId: text(form, "requestId"),
  });
  refresh(orderId);
  if (!result.ok) {
    const stale = result.error.code === "40001";
    return stamp({ error: paymentErrorMessage(result.error), values: stale ? {} : values(form) });
  }
  return stamp({ message: `${paymentsCopy.registered} ${result.data.receiptFolio}` });
}

/** Reverso de un recibo completo (encargado o admin), con motivo. */
export async function reversePaymentAction(
  _prev: PaymentFormState,
  form: FormData,
): Promise<PaymentFormState> {
  const repo = await context("payments.reverse");
  if (!repo) return stamp({ error: paymentsCopy.forbidden });
  const parsed = reversePaymentSchema.safeParse({
    paymentId: text(form, "paymentId"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return stamp({ fields: fieldErrors(parsed.error), values: values(form) });
  const result = await repo.reverse(parsed.data);
  const orderId = text(form, "orderId");
  if (orderId) refresh(orderId);
  revalidatePath(`/finanzas/cobranza/recibos/${parsed.data.paymentId}`);
  if (!result.ok) return stamp({ error: paymentErrorMessage(result.error), values: values(form) });
  return stamp({ message: paymentsCopy.reverseDone });
}
