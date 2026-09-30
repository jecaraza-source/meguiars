"use server";

import { guardScreen, PILOT_COPY, pilotErrorMessage } from "@meguiars/domain";
import {
  createAgendaRepository,
  createCatalogRepository,
  createExpenseRepository,
  createMembershipRepository,
  createPilotRepository,
} from "@meguiars/supabase";
import {
  baselineSchema,
  buildImportPlan,
  createCenterSchema,
  fieldErrors,
  IMPORT_ENTITIES,
  type ImportEntity,
  type ImportPlan,
} from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, validationState, values, type ActionFormState } from "@/lib/form-data";
import { applyImportPlan, loadImportExisting } from "@/lib/import";
import { centersScope } from "@/lib/pilot";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Sesión con permiso de configurar centros (la base lo vuelve a validar en cada RPC). */
async function context() {
  const state = await getAuthState();
  if (state.status !== "signed_in" || !guardScreen(state, "centers").allow) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  return { state, supabase, scope: centersScope(state), pilot: createPilotRepository(supabase) };
}

export async function createCenterAction(_prev: ActionFormState, form: FormData): Promise<ActionFormState> {
  const ctx = await context();
  if (!ctx?.scope.canCreate) return stamp({ error: PILOT_COPY.onlyCorporate });
  const parsed = createCenterSchema.safeParse({
    organizationId: ctx.scope.organizationId,
    code: text(form, "code"),
    name: text(form, "name"),
    timezone: text(form, "timezone"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["organizationId"], form));
  const created = await ctx.pilot.createCenter(parsed.data);
  if (!created.ok) return stamp({ error: pilotErrorMessage(created.error), values: values(form) });
  // El layout lista los centros del usuario: se recalcula para incluir el nuevo.
  revalidatePath("/", "layout");
  redirect(`/equipo/centros/${created.data.id}?nuevo=1`);
}

export async function setBaselineAction(_prev: ActionFormState, form: FormData): Promise<ActionFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: "No tienes permiso para configurar este centro." });
  const parsed = baselineSchema.safeParse({
    detailCenterId: text(form, "detailCenterId"),
    metric: text(form, "metric"),
    value: text(form, "value"),
    periodFrom: text(form, "periodFrom"),
    periodTo: text(form, "periodTo"),
    source: text(form, "source"),
    reason: text(form, "reason"),
  });
  if (!parsed.success)
    return stamp(validationState(fieldErrors(parsed.error), ["detailCenterId", "metric"], form));
  const b = parsed.data;
  const r = await ctx.pilot.setBaseline({ ...b, source: b.value === null ? null : b.source });
  if (!r.ok) return stamp({ error: pilotErrorMessage(r.error), values: values(form) });
  revalidatePath(`/equipo/centros/${b.detailCenterId}`);
  revalidatePath("/direccion/piloto");
  return stamp({ message: b.value === null ? "Indicador borrado." : "Línea base guardada." });
}

/**
 * Lo llama la pantalla de error (web) con el reporte ya sin datos personales.
 * Sin sesión no hace nada; la base recorta, valida el centro y limita por hora.
 */
export async function reportClientErrorAction(report: {
  name: string;
  message: string;
  digest?: string;
  route?: string;
}): Promise<void> {
  const state = await getAuthState();
  if (state.status !== "signed_in") return;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return;
  await createPilotRepository(supabase).reportError(
    {
      source: "web",
      name: String(report.name ?? "Error").slice(0, 80),
      message: String(report.message ?? "").slice(0, 400),
      ...(report.digest ? { digest: String(report.digest).slice(0, 80) } : {}),
      ...(report.route ? { route: String(report.route).split("?")[0]!.slice(0, 200) } : {}),
    },
    state.activeCenterId,
  );
}

export interface ImportState extends ActionFormState {
  plan?: ImportPlan;
  applied?: {
    results: { line: number; key: string; ok: boolean; message: string }[];
    applied: number;
    failed: boolean;
  };
}

const IMPORT_REASON = "Importación de datos maestros";

/** Vista previa (no escribe) o aplicación de un CSV. El plan siempre se recalcula en el servidor. */
export async function importAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: "No tienes permiso para configurar este centro." });
  const entity = text(form, "entity") as ImportEntity;
  const centerId = text(form, "detailCenterId");
  const file = form.get("file");
  const csv = file instanceof File && file.size > 0 ? await file.text() : text(form, "csv");
  const keep = { entity, csv: csv.length > 200_000 ? "" : csv, detailCenterId: centerId };
  if (!IMPORT_ENTITIES.includes(entity)) return stamp({ error: "Elige qué vas a importar.", values: keep });
  if (!ctx.scope.centers.some((c) => c.id === centerId))
    return stamp({ error: "No tienes permiso para configurar este centro.", values: keep });
  if (csv.length > 1_000_000)
    return stamp({ error: "El archivo es demasiado grande (máximo 1 MB).", values: keep });
  // Bahías y técnicos se escriben en el centro activo (las RPC del catálogo de recursos lo exigen).
  if ((entity === "bahias" || entity === "tecnicos") && centerId !== ctx.scope.activeCenterId)
    return stamp({ error: "Cambia a este centro para importar bahías o técnicos.", values: keep });
  const repos = {
    catalog: createCatalogRepository(ctx.supabase),
    agenda: createAgendaRepository(ctx.supabase),
    expenses: createExpenseRepository(ctx.supabase),
    memberships: createMembershipRepository(ctx.supabase),
  };
  const existing = await loadImportExisting(repos, entity, ctx.scope.organizationId, centerId);
  if (!existing.ok) return stamp({ error: pilotErrorMessage(existing.error), values: keep });
  const plan = buildImportPlan(
    entity,
    csv,
    { organizationId: ctx.scope.organizationId, detailCenterId: centerId, reason: IMPORT_REASON },
    existing.data,
  );
  if (text(form, "mode") !== "apply") return stamp({ plan, values: keep });
  if (!plan.canApply)
    return stamp({ plan, error: "Corrige los errores (o no hay cambios) antes de aplicar.", values: keep });
  const result = await applyImportPlan(repos, plan, ctx.scope.organizationId, IMPORT_REASON);
  revalidatePath(`/equipo/centros/${centerId}`);
  return stamp({
    applied: { results: result.results, applied: result.applied, failed: Boolean(result.failed) },
    ...(result.failed
      ? {
          error: `Se detuvo en la línea ${result.failed.line} (${result.failed.key}): ${result.failed.message}. Lo anterior sí se aplicó; corrige y vuelve a importar.`,
        }
      : { message: `Importación aplicada: ${result.applied} fila(s).` }),
    values: keep,
  });
}
