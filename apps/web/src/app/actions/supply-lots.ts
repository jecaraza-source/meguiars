"use server";

import { activeCenterAccess, executionCopy, guardScreen, type RepoError } from "@meguiars/domain";
import { createSupplyLotRepository } from "@meguiars/supabase";
import { closeSupplyLotSchema, fieldErrors, registerSupplyLotSchema } from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, validationState, values, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SupplyLotFormState = ActionFormState;

/** Centro activo del servidor (nunca uno enviado por el cliente). ADR 0052. */
async function context() {
  const state = await getAuthState();
  if (!guardScreen(state, "supplyLots").allow) return null;
  const active = activeCenterAccess(state);
  const supabase = await createSupabaseServerClient();
  if (!active || !supabase) return null;
  return { center: active.center, repo: createSupplyLotRepository(supabase) };
}

const message = (e: RepoError) =>
  e.kind === "permission_denied"
    ? executionCopy.forbidden
    : e.kind === "conflict"
      ? "El lote cambió mientras lo editabas; recarga la página."
      : e.message;

function refresh() {
  revalidatePath("/operacion/lotes");
  revalidatePath("/operacion");
}

export async function registerSupplyLotAction(
  _prev: SupplyLotFormState,
  form: FormData,
): Promise<SupplyLotFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: executionCopy.forbidden });
  const parsed = registerSupplyLotSchema.safeParse({
    requestId: text(form, "requestId"),
    inventoryItemId: text(form, "inventoryItemId"),
    lotCode: text(form, "lotCode"),
    expiresOn: text(form, "expiresOn"),
    receivedOn: text(form, "receivedOn"),
    quantity: text(form, "quantity"),
    notes: text(form, "notes"),
  });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["requestId"], form));
  const r = await ctx.repo.register({ ...parsed.data, detailCenterId: ctx.center.id });
  refresh();
  if (!r.ok) return stamp({ error: message(r.error), values: values(form) });
  return stamp({ message: "Lote registrado." });
}

export async function closeSupplyLotAction(
  _prev: SupplyLotFormState,
  form: FormData,
): Promise<SupplyLotFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: executionCopy.forbidden });
  const parsed = closeSupplyLotSchema.safeParse({
    id: text(form, "id"),
    version: text(form, "version"),
    outcome: text(form, "outcome"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["id", "version"], form));
  const r = await ctx.repo.close(parsed.data);
  refresh();
  if (!r.ok) return stamp({ error: message(r.error), values: values(form) });
  return stamp({ message: "Lote cerrado." });
}
