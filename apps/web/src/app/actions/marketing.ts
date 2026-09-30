"use server";

import {
  activeCenterAccess,
  commercialErrorMessage,
  guardScreen,
  zonedToUtc,
  type CampaignChannel,
  type CampaignObjective,
  type CampaignStatus,
  type ContentFormat,
  type ContentStatus,
  type PromotionKind,
  type Screen,
} from "@meguiars/domain";
import { createMarketingRepository } from "@meguiars/supabase";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, values, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MarketingFormState = ActionFormState;

const FORBIDDEN = "No tienes permiso para esta acción.";
const MULTI = ["channels", "serviceIds", "detailCenterIds"] as const;

async function context(screen: Screen) {
  const state = await getAuthState();
  if (!guardScreen(state, screen).allow) return null;
  const active = activeCenterAccess(state);
  const supabase = await createSupabaseServerClient();
  if (!active || !supabase) return null;
  return { state, center: active.center, repo: createMarketingRepository(supabase) };
}

const fail = (error: { kind: string; code?: string; message: string }, form?: FormData) =>
  stamp({ error: commercialErrorMessage(error), ...(form ? { values: values(form, MULTI) } : {}) });
const all = (form: FormData, key: string) => form.getAll(key).map(String).filter(Boolean);
const optional = (form: FormData, key: string) => text(form, key) || undefined;

export async function saveCampaignAction(
  _prev: MarketingFormState,
  form: FormData,
): Promise<MarketingFormState> {
  const ctx = await context("campaigns");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const id = optional(form, "id");
  const r = await ctx.repo.saveCampaign({
    organizationId: ctx.center.organizationId,
    id,
    version: id ? Number(text(form, "version")) : undefined,
    detailCenterId: optional(form, "detailCenterId"),
    name: text(form, "name"),
    objective: text(form, "objective") as CampaignObjective,
    channels: all(form, "channels") as CampaignChannel[],
    startsOn: text(form, "startsOn"),
    endsOn: text(form, "endsOn"),
    budget: text(form, "budget") ? Number(text(form, "budget")) : undefined,
    status: (text(form, "status") || "planeada") as CampaignStatus,
    utmSource: text(form, "utmSource"),
    utmMedium: text(form, "utmMedium"),
    utmCampaign: text(form, "utmCampaign"),
    landingUrl: optional(form, "landingUrl"),
    notes: optional(form, "notes"),
    reason: text(form, "reason"),
  });
  if (!r.ok) return fail(r.error, form);
  revalidatePath("/comercial/campanas");
  if (!id) redirect(`/comercial/campanas/${r.data.id}`);
  revalidatePath(`/comercial/campanas/${id}`);
  return stamp({ message: "Campaña guardada" });
}

export async function addSpendAction(_prev: MarketingFormState, form: FormData): Promise<MarketingFormState> {
  const ctx = await context("campaignDetail");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const campaignId = text(form, "campaignId");
  const r = await ctx.repo.addSpend({
    campaignId,
    spentOn: optional(form, "spentOn"),
    amount: text(form, "amount") ? Number(text(form, "amount")) : undefined,
    channel: text(form, "channel") as CampaignChannel,
    expenseId: optional(form, "expenseId"),
    note: optional(form, "note"),
  });
  if (!r.ok) return fail(r.error, form);
  revalidatePath(`/comercial/campanas/${campaignId}`);
  return stamp({ message: "Gasto registrado" });
}

export async function voidSpendAction(
  _prev: MarketingFormState,
  form: FormData,
): Promise<MarketingFormState> {
  const ctx = await context("campaignDetail");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const r = await ctx.repo.voidSpend(text(form, "spendId"), text(form, "reason"));
  if (!r.ok) return fail(r.error);
  revalidatePath(`/comercial/campanas/${text(form, "campaignId")}`);
  return stamp({ message: "Gasto anulado" });
}

export async function savePostAction(_prev: MarketingFormState, form: FormData): Promise<MarketingFormState> {
  const ctx = await context("contentCalendar");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const id = optional(form, "id");
  const date = text(form, "date");
  const time = text(form, "time") || "10:00";
  const r = await ctx.repo.savePost({
    organizationId: ctx.center.organizationId,
    id,
    version: id ? Number(text(form, "version")) : undefined,
    detailCenterId: optional(form, "detailCenterId"),
    campaignId: optional(form, "campaignId"),
    channel: text(form, "channel") as CampaignChannel,
    format: text(form, "format") as ContentFormat,
    title: text(form, "title"),
    copy: optional(form, "copy"),
    plannedAt: date ? zonedToUtc(date, time, ctx.center.timezone) : "",
    linkUrl: optional(form, "linkUrl"),
    reason: text(form, "reason") || "Plan de contenido",
  });
  if (!r.ok) return fail(r.error, form);
  revalidatePath("/comercial/calendario");
  return stamp({ message: "Publicación planeada" });
}

export async function postStatusAction(
  _prev: MarketingFormState,
  form: FormData,
): Promise<MarketingFormState> {
  const ctx = await context("contentCalendar");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const r = await ctx.repo.setPostStatus(
    text(form, "id"),
    Number(text(form, "version")),
    text(form, "status") as ContentStatus,
    optional(form, "publishedUrl"),
  );
  if (!r.ok) return fail(r.error, form);
  revalidatePath("/comercial/calendario");
  return stamp({ message: "Publicación actualizada" });
}

export async function savePromotionAction(
  _prev: MarketingFormState,
  form: FormData,
): Promise<MarketingFormState> {
  const ctx = await context("promotions");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const id = optional(form, "id");
  const r = await ctx.repo.savePromotion({
    organizationId: ctx.center.organizationId,
    id,
    version: id ? Number(text(form, "version")) : undefined,
    campaignId: optional(form, "campaignId"),
    code: text(form, "code"),
    name: text(form, "name"),
    kind: text(form, "kind") as PromotionKind,
    value: Number(text(form, "value")),
    serviceIds: all(form, "serviceIds"),
    detailCenterIds: all(form, "detailCenterIds"),
    startsOn: text(form, "startsOn"),
    endsOn: text(form, "endsOn"),
    maxUses: text(form, "maxUses") ? Number(text(form, "maxUses")) : undefined,
    active: form.get("active") === "on",
    terms: optional(form, "terms"),
    reason: text(form, "reason"),
  });
  if (!r.ok) return fail(r.error, form);
  revalidatePath("/comercial/promociones");
  return stamp({ message: "Promoción guardada" });
}

export async function applyPromotionAction(
  _prev: MarketingFormState,
  form: FormData,
): Promise<MarketingFormState> {
  const target = text(form, "target");
  const ctx = await context(target === "order" ? "orderDetail" : "quoteDetail");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const id = text(form, "documentId");
  const version = Number(text(form, "version"));
  const code = text(form, "code");
  const r =
    target === "order"
      ? await ctx.repo.applyPromotionToOrder(id, version, code)
      : await ctx.repo.applyPromotionToQuote(id, version, code);
  if (!r.ok) return fail(r.error, form);
  revalidatePath(target === "order" ? `/ordenes/${id}` : `/comercial/cotizaciones/${id}`);
  return stamp({ message: `Promoción ${code.toUpperCase()} aplicada` });
}

export async function setLeadCampaignAction(
  _prev: MarketingFormState,
  form: FormData,
): Promise<MarketingFormState> {
  const ctx = await context("leadDetail");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const id = text(form, "leadId");
  const r = await ctx.repo.setLeadCampaign(
    id,
    Number(text(form, "version")),
    text(form, "campaignId") || null,
  );
  if (!r.ok) return fail(r.error);
  revalidatePath(`/comercial/prospectos/${id}`);
  return stamp({ message: "Campaña del prospecto actualizada" });
}
