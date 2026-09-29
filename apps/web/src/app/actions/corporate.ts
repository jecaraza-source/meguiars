"use server";

import { corporateCardById } from "@meguiars/analytics";
import { corporateCopy, dashboardsCopy, dashboardsErrorMessage, guardScreen } from "@meguiars/domain";
import { createDashboardRepository } from "@meguiars/supabase";
import { fieldErrors, kpiThresholdSchema } from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, validationState, values, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CorporateFormState = ActionFormState;

async function context() {
  const state = await getAuthState();
  if (!guardScreen(state, "direccion").allow) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  return { repo: createDashboardRepository(supabase) };
}

/**
 * Guarda un umbral de alerta: la tarjeta define métrica y canal fijo; si ya
 * hay umbral para esa tarjeta y centro se reemplaza (con su versión). La base
 * vuelve a validar que sea el admin corporativo.
 */
export async function saveKpiThresholdAction(
  _prev: CorporateFormState,
  form: FormData,
): Promise<CorporateFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: dashboardsCopy.forbiddenDashboard });
  const card = corporateCardById(text(form, "cardId"));
  if (!card) return stamp({ fields: { cardId: corporateCopy.unknownCard }, values: values(form) });
  const organizationId = text(form, "organizationId");
  const detailCenterId = text(form, "detailCenterId") || null;
  const existing = await ctx.repo.kpiThresholds(organizationId);
  const same = existing.ok
    ? existing.data.find(
        (t) =>
          t.metricId === card.metricId && t.channel === card.channel && t.detailCenterId === detailCenterId,
      )
    : undefined;
  const input = {
    organizationId,
    id: same?.id,
    version: same?.version,
    metricId: card.metricId,
    channel: card.channel,
    detailCenterId,
    minValue: text(form, "minValue"),
    maxValue: text(form, "maxValue"),
    reason: text(form, "reason"),
  };
  const parsed = kpiThresholdSchema.safeParse(input);
  if (!parsed.success)
    return stamp(
      validationState(
        fieldErrors(parsed.error),
        ["organizationId", "metricId", "channel", "id", "version"],
        form,
      ),
    );
  const result = await ctx.repo.setKpiThreshold(parsed.data);
  if (!result.ok) return stamp({ error: dashboardsErrorMessage(result.error), values: values(form) });
  revalidatePath("/direccion");
  return stamp({ message: corporateCopy.saved });
}

export async function deleteKpiThresholdAction(
  _prev: CorporateFormState,
  form: FormData,
): Promise<CorporateFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: dashboardsCopy.forbiddenDashboard });
  const result = await ctx.repo.deleteKpiThreshold(text(form, "id"), text(form, "reason"));
  if (!result.ok) return stamp({ error: dashboardsErrorMessage(result.error) });
  revalidatePath("/direccion");
  return stamp({ message: corporateCopy.removed });
}
