"use server";

import {
  activeCenterAccess,
  AUTOMATION_SKIP_LABELS,
  commercialErrorMessage,
  guardScreen,
  skippedTotal,
  type AutomationRun,
  type AutomationSkipReason,
  type AutomationTrigger,
  type LeadSource,
} from "@meguiars/domain";
import { createAutomationsRepository } from "@meguiars/supabase";
import { revalidatePath } from "next/cache";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, values, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AutomationFormState = ActionFormState;

const FORBIDDEN = "No tienes permiso para esta acción.";
const PATH = "/comercial/automatizaciones";

async function context() {
  const state = await getAuthState();
  if (!guardScreen(state, "automations").allow) return null;
  const active = activeCenterAccess(state);
  const supabase = await createSupabaseServerClient();
  if (!active || !supabase) return null;
  return { center: active.center, repo: createAutomationsRepository(supabase) };
}

const all = (form: FormData, key: string) => form.getAll(key).map(String).filter(Boolean);
const optional = (form: FormData, key: string) => text(form, key) || undefined;

/** Resumen de una corrida para el aviso. */
function summary(run: AutomationRun, preview: boolean): string {
  const skipped = Object.entries(run.skipped)
    .filter(([, n]) => n)
    .map(([k, n]) => `${n} ${AUTOMATION_SKIP_LABELS[k as AutomationSkipReason]}`)
    .join(", ");
  const head = preview
    ? `Vista previa: crearía ${run.created} ${run.created === 1 ? "tarea" : "tareas"}`
    : `Corrida: ${run.created} ${run.created === 1 ? "tarea creada" : "tareas creadas"}, ${run.stopped} detenidas`;
  return skippedTotal(run) ? `${head}; omitidos: ${skipped}.` : `${head}.`;
}

export async function saveAutomationAction(
  _prev: AutomationFormState,
  form: FormData,
): Promise<AutomationFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: FORBIDDEN });
  const id = optional(form, "id");
  const r = await ctx.repo.save({
    organizationId: ctx.center.organizationId,
    id,
    version: id ? Number(text(form, "version")) : undefined,
    detailCenterId: optional(form, "detailCenterId"),
    name: text(form, "name"),
    trigger: text(form, "trigger") as AutomationTrigger,
    delayDays: Number(text(form, "delayDays") || 0),
    serviceIds: all(form, "serviceIds"),
    leadSources: all(form, "leadSources") as LeadSource[],
    assignTo: optional(form, "assignTo"),
    dueInDays: Number(text(form, "dueInDays") || 0),
    messageTemplate: optional(form, "messageTemplate"),
    cooldownDays: Number(text(form, "cooldownDays") || 30),
    maxPerRun: Number(text(form, "maxPerRun") || 50),
    contactFrom: text(form, "contactFrom") || "09:00",
    contactTo: text(form, "contactTo") || "19:00",
    reason: text(form, "reason"),
  });
  if (!r.ok)
    return stamp({
      error: commercialErrorMessage(r.error),
      values: values(form, ["serviceIds", "leadSources"]),
    });
  revalidatePath(PATH);
  return stamp({
    message: id
      ? "Automatización guardada"
      : "Automatización creada (inactiva): revisa la vista previa y actívala",
  });
}

export async function setAutomationActiveAction(
  _prev: AutomationFormState,
  form: FormData,
): Promise<AutomationFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: FORBIDDEN });
  const active = text(form, "active") === "true";
  const r = await ctx.repo.setActive(
    text(form, "id"),
    Number(text(form, "version")),
    active,
    text(form, "reason"),
  );
  if (!r.ok) return stamp({ error: commercialErrorMessage(r.error) });
  revalidatePath(PATH);
  return stamp({
    message: active
      ? "Automatización activada"
      : "Automatización desactivada; sus tareas pendientes se cancelaron",
  });
}

export async function runAutomationAction(
  _prev: AutomationFormState,
  form: FormData,
): Promise<AutomationFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: FORBIDDEN });
  const preview = text(form, "mode") !== "manual";
  const r = await ctx.repo.run(text(form, "id"), preview);
  if (!r.ok) return stamp({ error: commercialErrorMessage(r.error) });
  revalidatePath(PATH);
  return stamp({ message: summary(r.data, preview) });
}
