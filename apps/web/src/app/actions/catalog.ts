"use server";

import { activeCenterAccess, catalogCopy, guardScreen, type RepoError } from "@meguiars/domain";
import { createCatalogRepository } from "@meguiars/supabase";
import {
  centerConfigSchema,
  createServiceSchema,
  fieldErrors,
  updateServiceSchema,
} from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, validationState, values, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Mensaje de error del catálogo (clave repetida, permisos). */
function catalogError(error: RepoError): string {
  if (error.code === "23505") return catalogCopy.codeTaken;
  if (error.kind === "permission_denied") return catalogCopy.forbidden;
  return error.message;
}

/** Centro activo y organización del servidor (nunca los envía el cliente). */
async function context(screen: "catalogNew" | "catalogDetail") {
  const state = await getAuthState();
  if (!guardScreen(state, screen).allow) return null;
  const active = activeCenterAccess(state);
  const supabase = await createSupabaseServerClient();
  if (!active || !supabase) return null;
  return { center: active.center, repo: createCatalogRepository(supabase) };
}

const serviceFields = (form: FormData) => ({
  name: text(form, "name"),
  description: text(form, "description"),
  revenueEngine: text(form, "revenueEngine"),
  standardDurationMinutes: text(form, "standardDurationMinutes"),
  basePrice: text(form, "basePrice"),
  standardDirectCost: text(form, "standardDirectCost"),
});

export async function createServiceAction(_prev: ActionFormState, form: FormData): Promise<ActionFormState> {
  const ctx = await context("catalogNew");
  if (!ctx) return stamp({ error: catalogCopy.forbidden });
  const parsed = createServiceSchema.safeParse({
    organizationId: ctx.center.organizationId,
    code: text(form, "code"),
    ...serviceFields(form),
  });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["organizationId"], form));
  const result = await ctx.repo.create(parsed.data);
  if (!result.ok) return stamp({ error: catalogError(result.error), values: values(form) });
  revalidatePath("/catalogo");
  redirect(`/catalogo/${result.data.id}?nuevo=1`);
}

export async function updateServiceAction(_prev: ActionFormState, form: FormData): Promise<ActionFormState> {
  const ctx = await context("catalogDetail");
  if (!ctx) return stamp({ error: catalogCopy.forbidden });
  const parsed = updateServiceSchema.safeParse({
    id: text(form, "id"),
    ...serviceFields(form),
    active: text(form, "active") === "1",
    reason: text(form, "reason"),
  });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["id"], form));
  const result = await ctx.repo.update(parsed.data);
  if (!result.ok) return stamp({ error: catalogError(result.error), values: values(form) });
  revalidatePath(`/catalogo/${parsed.data.id}`);
  return stamp({ message: catalogCopy.saved });
}

export async function configureCenterAction(
  _prev: ActionFormState,
  form: FormData,
): Promise<ActionFormState> {
  const ctx = await context("catalogDetail");
  if (!ctx) return stamp({ error: catalogCopy.forbidden });
  const parsed = centerConfigSchema.safeParse({
    detailCenterId: ctx.center.id,
    serviceId: text(form, "serviceId"),
    available: text(form, "available") === "1",
    priceOverride: text(form, "priceOverride"),
    directCostOverride: text(form, "directCostOverride"),
    reason: text(form, "centerReason"),
  });
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    if (errors.reason) errors.centerReason = errors.reason;
    return stamp(validationState(errors, ["detailCenterId", "serviceId"], form));
  }
  const result = await ctx.repo.configureCenter(parsed.data);
  if (!result.ok) return stamp({ error: catalogError(result.error), values: values(form) });
  revalidatePath(`/catalogo/${parsed.data.serviceId}`);
  return stamp({ message: catalogCopy.saved });
}
