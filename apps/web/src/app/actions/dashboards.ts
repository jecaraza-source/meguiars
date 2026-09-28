"use server";

import {
  dashboardsCopy,
  dashboardsErrorMessage,
  guardScreen,
  type DashboardInput,
  type SavedDashboardFilters,
} from "@meguiars/domain";
import { createDashboardRepository } from "@meguiars/supabase";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DashboardsFormState = ActionFormState;

/** Sesión con acceso a la pantalla; la base vuelve a autorizar cada escritura. */
async function context(screen: "dashboards" | "dashboardEdit") {
  const state = await getAuthState();
  if (!guardScreen(state, screen).allow) return null;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  return { repo: createDashboardRepository(supabase) };
}

const json = <T>(form: FormData, key: string, fallback: T): T => {
  try {
    const raw = text(form, key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

/**
 * Alta o edición de un tablero con su rejilla completa (el constructor envía
 * el tablero como JSON en `payload`). Sin SQL: cada widget es una métrica registrada.
 */
export async function saveDashboardAction(
  _prev: DashboardsFormState,
  form: FormData,
): Promise<DashboardsFormState> {
  const ctx = await context("dashboardEdit");
  if (!ctx) return stamp({ error: dashboardsCopy.forbiddenDashboard });
  const input = json<DashboardInput | null>(form, "payload", null);
  if (!input) return stamp({ error: "Datos inválidos" });
  const result = await ctx.repo.save(input);
  if (!result.ok) return stamp({ error: dashboardsErrorMessage(result.error) });
  revalidatePath("/direccion/tableros");
  revalidatePath(`/direccion/tableros/${result.data.id}`);
  redirect(`/direccion/tableros/${result.data.id}?hecho=guardado`);
}

export async function archiveDashboardAction(
  _prev: DashboardsFormState,
  form: FormData,
): Promise<DashboardsFormState> {
  const ctx = await context("dashboardEdit");
  if (!ctx) return stamp({ error: dashboardsCopy.forbiddenDashboard });
  const result = await ctx.repo.archive(
    text(form, "id"),
    Number(text(form, "version")),
    text(form, "reason"),
  );
  if (!result.ok)
    return stamp({
      error: dashboardsErrorMessage(result.error),
      fields: result.error.kind === "validation" ? { reason: result.error.message } : {},
    });
  revalidatePath("/direccion/tableros");
  redirect("/direccion/tableros?hecho=archivado");
}

/** Vista personal: orden, ocultos, filtros actuales y favorito. */
export async function saveDashboardViewAction(
  _prev: DashboardsFormState,
  form: FormData,
): Promise<DashboardsFormState> {
  const ctx = await context("dashboards");
  if (!ctx) return stamp({ error: dashboardsCopy.forbiddenDashboard });
  const dashboardId = text(form, "dashboardId");
  const result = await ctx.repo.savePreferences({
    dashboardId,
    widgetOrder: json<string[]>(form, "order", []),
    hiddenWidgetIds: json<string[]>(form, "hidden", []),
    filters: json<SavedDashboardFilters>(form, "filters", {}),
    isFavorite: text(form, "favorite") === "1",
  });
  if (!result.ok) return stamp({ error: dashboardsErrorMessage(result.error) });
  revalidatePath(`/direccion/tableros/${dashboardId}`);
  revalidatePath("/direccion/tableros");
  return stamp({ message: dashboardsCopy.viewSaved });
}

export async function resetDashboardViewAction(
  _prev: DashboardsFormState,
  form: FormData,
): Promise<DashboardsFormState> {
  const ctx = await context("dashboards");
  if (!ctx) return stamp({ error: dashboardsCopy.forbiddenDashboard });
  const dashboardId = text(form, "dashboardId");
  const result = await ctx.repo.resetPreferences(dashboardId);
  if (!result.ok) return stamp({ error: dashboardsErrorMessage(result.error) });
  revalidatePath(`/direccion/tableros/${dashboardId}`);
  redirect(`/direccion/tableros/${dashboardId}`);
}
