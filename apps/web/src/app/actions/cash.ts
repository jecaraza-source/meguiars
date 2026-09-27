"use server";

import {
  activeCenterAccess,
  canInActiveCenter,
  cashCopy,
  cashErrorMessage,
  guardScreen,
  type Capability,
} from "@meguiars/domain";
import { createCashRepository } from "@meguiars/supabase";
import { closeCashSchema, fieldErrors, openCashSchema, reopenCashSchema } from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, validationState, values, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CashFormState = ActionFormState;

/** Centro activo del servidor (nunca uno enviado por el cliente) con la capacidad pedida. */
async function context(capability: Capability) {
  const state = await getAuthState();
  if (!guardScreen(state, "cash").allow || !canInActiveCenter(state, capability)) return null;
  const active = activeCenterAccess(state);
  const supabase = await createSupabaseServerClient();
  if (!active || !supabase) return null;
  return { center: active.center, repo: createCashRepository(supabase) };
}

const refresh = (sessionId?: string) => {
  revalidatePath("/finanzas/caja");
  if (sessionId) revalidatePath(`/finanzas/caja/${sessionId}`);
};

/** Apertura de caja del turno en el centro activo (encargado o admin). */
export async function openCashAction(_prev: CashFormState, form: FormData): Promise<CashFormState> {
  const ctx = await context("cash.operate");
  if (!ctx) return stamp({ error: cashCopy.forbidden });
  const parsed = openCashSchema.safeParse({
    detailCenterId: ctx.center.id,
    requestId: text(form, "requestId"),
    shift: text(form, "shift"),
    openingFloat: text(form, "openingFloat"),
    notes: text(form, "notes"),
  });
  if (!parsed.success)
    return stamp(validationState(fieldErrors(parsed.error), ["detailCenterId", "requestId"], form));
  const result = await ctx.repo.open(parsed.data);
  refresh();
  if (!result.ok) return stamp({ error: cashErrorMessage(result.error), values: values(form) });
  redirect(`/finanzas/caja/${result.data.id}?hecho=abierta`);
}

/** Arqueo y cierre: el efectivo contado lo captura el encargado; la base calcula la diferencia. */
export async function closeCashAction(_prev: CashFormState, form: FormData): Promise<CashFormState> {
  const ctx = await context("cash.operate");
  if (!ctx) return stamp({ error: cashCopy.forbidden });
  const sessionId = text(form, "sessionId");
  const parsed = closeCashSchema.safeParse({
    sessionId,
    version: text(form, "version"),
    requestId: text(form, "requestId"),
    countedCash: text(form, "countedCash"),
    notes: text(form, "notes"),
    expectedCash: text(form, "expectedCash") || undefined,
  });
  if (!parsed.success)
    return stamp(validationState(fieldErrors(parsed.error), ["sessionId", "version", "requestId"], form));
  const result = await ctx.repo.close(parsed.data);
  refresh(sessionId);
  if (!result.ok) {
    const stale = result.error.code === "40001";
    return stamp({ error: cashErrorMessage(result.error), values: stale ? {} : values(form) });
  }
  redirect(`/finanzas/caja/${sessionId}?hecho=cerrada`);
}

/** Reapertura (sólo admin) con motivo obligatorio. */
export async function reopenCashAction(_prev: CashFormState, form: FormData): Promise<CashFormState> {
  const ctx = await context("cash.reopen");
  if (!ctx) return stamp({ error: cashCopy.forbidden });
  const sessionId = text(form, "sessionId");
  const parsed = reopenCashSchema.safeParse({
    sessionId,
    version: text(form, "version"),
    reason: text(form, "reason"),
  });
  if (!parsed.success)
    return stamp(validationState(fieldErrors(parsed.error), ["sessionId", "version"], form));
  const result = await ctx.repo.reopen(parsed.data);
  refresh(sessionId);
  if (!result.ok) return stamp({ error: cashErrorMessage(result.error), values: values(form) });
  redirect(`/finanzas/caja/${sessionId}?hecho=reabierta`);
}
