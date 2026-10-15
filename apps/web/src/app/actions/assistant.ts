"use server";

import { activeCenterAccess, commercialErrorMessage, guardScreen, type Screen } from "@meguiars/domain";
import { createAssistantRepository } from "@meguiars/supabase";
import {
  assistantFaqSchema,
  assistantServiceSchema,
  assistantSettingsSchema,
  centerPublicInfoSchema,
  handoffRuleSchema,
  hoursFromForm,
} from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, values, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AssistantFormState = ActionFormState;

const FORBIDDEN = "No tienes permiso para esta acción.";
const PAGE = "/comercial/asistente";

async function context(screen: Screen = "assistant") {
  const state = await getAuthState();
  if (!guardScreen(state, screen).allow) return null;
  const active = activeCenterAccess(state);
  const supabase = await createSupabaseServerClient();
  if (!active || !supabase) return null;
  return { center: active.center, repo: createAssistantRepository(supabase) };
}

const fail = (error: { kind: string; code?: string; message: string }, form: FormData) =>
  stamp({ error: commercialErrorMessage(error), values: values(form) });

const invalid = (issues: { path: PropertyKey[]; message: string }[], form: FormData) =>
  stamp({
    error: issues.map((i) => i.message).join(" · "),
    fields: Object.fromEntries(issues.map((i) => [String(i.path[0] ?? "form"), i.message])),
    values: values(form),
  });

export async function saveAssistantSettingsAction(
  _prev: AssistantFormState,
  form: FormData,
): Promise<AssistantFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: FORBIDDEN });
  const parsed = assistantSettingsSchema.safeParse({
    organizationId: ctx.center.organizationId,
    version: text(form, "version"),
    mode: text(form, "mode"),
    model: text(form, "model"),
    assistantName: text(form, "assistantName"),
    tone: text(form, "tone"),
    greeting: text(form, "greeting"),
    privacyUrl: text(form, "privacyUrl"),
    humanHours: text(form, "humanHours"),
    afterHoursMessage: text(form, "afterHoursMessage"),
    centerChoice: text(form, "centerChoice"),
    maxDaysAhead: text(form, "maxDaysAhead"),
    minHoursAhead: text(form, "minHoursAhead"),
    mentionPromotions: form.get("mentionPromotions"),
    mentionMemberships: form.get("mentionMemberships"),
    testNumbers: text(form, "testNumbers"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return invalid(parsed.error.issues, form);
  const r = await ctx.repo.updateSettings(parsed.data);
  if (!r.ok) return fail(r.error, form);
  revalidatePath(PAGE);
  return stamp({ message: "Configuración del asistente guardada" });
}

export async function saveAssistantFaqAction(
  _prev: AssistantFormState,
  form: FormData,
): Promise<AssistantFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: FORBIDDEN });
  const parsed = assistantFaqSchema.safeParse({
    organizationId: ctx.center.organizationId,
    id: text(form, "id"),
    version: text(form, "version"),
    detailCenterId: text(form, "detailCenterId"),
    question: text(form, "question"),
    answer: text(form, "answer"),
    position: text(form, "position"),
    active: form.get("active"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return invalid(parsed.error.issues, form);
  const r = await ctx.repo.upsertFaq(parsed.data);
  if (!r.ok) return fail(r.error, form);
  revalidatePath(PAGE);
  return stamp({ message: "Respuesta guardada" });
}

export async function deleteAssistantFaqAction(
  _prev: AssistantFormState,
  form: FormData,
): Promise<AssistantFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: FORBIDDEN });
  const r = await ctx.repo.deleteFaq(ctx.center.organizationId, text(form, "id"), "Respuesta eliminada");
  if (!r.ok) return fail(r.error, form);
  revalidatePath(PAGE);
  return stamp({ message: "Respuesta eliminada" });
}

export async function saveHandoffRuleAction(
  _prev: AssistantFormState,
  form: FormData,
): Promise<AssistantFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: FORBIDDEN });
  const parsed = handoffRuleSchema.safeParse({
    organizationId: ctx.center.organizationId,
    code: text(form, "code"),
    version: text(form, "version"),
    active: form.get("active"),
    assignTo: text(form, "assignTo"),
    message: text(form, "message"),
    reason: text(form, "reason") || "Ajuste de escalamiento",
  });
  if (!parsed.success) return invalid(parsed.error.issues, form);
  const r = await ctx.repo.setHandoffRule(parsed.data);
  if (!r.ok) return fail(r.error, form);
  revalidatePath(PAGE);
  return stamp({ message: "Regla de escalamiento guardada" });
}

export async function saveAssistantServiceAction(
  _prev: AssistantFormState,
  form: FormData,
): Promise<AssistantFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: FORBIDDEN });
  const parsed = assistantServiceSchema.safeParse({
    organizationId: ctx.center.organizationId,
    serviceId: text(form, "serviceId"),
    visible: form.get("visible"),
    bookable: form.get("bookable"),
    priceVariesBySize: form.get("priceVariesBySize"),
    reason: "Servicios que ofrece el asistente",
  });
  if (!parsed.success) return invalid(parsed.error.issues, form);
  const r = await ctx.repo.setService(parsed.data);
  if (!r.ok) return fail(r.error, form);
  revalidatePath(PAGE);
  return stamp({ message: "Servicio actualizado" });
}

export async function saveCenterInfoAction(
  _prev: AssistantFormState,
  form: FormData,
): Promise<AssistantFormState> {
  const ctx = await context();
  if (!ctx) return stamp({ error: FORBIDDEN });
  const { hours, errors } = hoursFromForm((k) => {
    const v = form.get(k);
    return typeof v === "string" ? v : null;
  });
  if (errors.length) return stamp({ error: errors.join(" · "), values: values(form) });
  const parsed = centerPublicInfoSchema.safeParse({
    detailCenterId: text(form, "detailCenterId"),
    version: text(form, "version"),
    address: text(form, "address"),
    phone: text(form, "phone"),
    mapsUrl: text(form, "mapsUrl"),
    directions: text(form, "directions"),
    nearbyZones: text(form, "nearbyZones"),
    handoffUserId: text(form, "handoffUserId"),
    hours,
    reason: text(form, "reason"),
  });
  if (!parsed.success) return invalid(parsed.error.issues, form);
  const r = await ctx.repo.setCenterInfo(parsed.data);
  if (!r.ok) return fail(r.error, form);
  revalidatePath(PAGE);
  return stamp({ message: "Datos del centro guardados" });
}

/** Pausar o reactivar el asistente en una conversación (Bandeja). */
export async function conversationAssistantAction(
  _prev: AssistantFormState,
  form: FormData,
): Promise<AssistantFormState> {
  const ctx = await context("conversation");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const id = text(form, "conversationId");
  const active = text(form, "active") === "true";
  const r = await ctx.repo.setConversationActive(id, active);
  if (!r.ok) return fail(r.error, form);
  revalidatePath(`/comercial/bandeja/${id}`);
  return stamp({ message: active ? "Asistente reactivado en la conversación" : "Asistente pausado" });
}
