import {
  fail,
  type Campaign,
  type CampaignChannel,
  type CampaignFact,
  type CampaignObjective,
  type CampaignStatus,
  type ContentFormat,
  type ContentPost,
  type ContentStatus,
  type MarketingRepository,
  type Promotion,
  type PromotionKind,
  type Result,
  type SpendFact,
} from "@meguiars/domain";
import {
  applyPromotionSchema,
  campaignSchema,
  campaignSpendSchema,
  contentPostSchema,
  contentStatusSchema,
  promotionSchema,
} from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import type { Database } from "../database.types";
import { toRepoError } from "../errors";
import { invalid, run } from "./shared";

type Fns = Database["public"]["Functions"];
type CampaignRow = Fns["list_campaigns"]["Returns"][number];

const num = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));

export const toCampaign = (r: CampaignRow): Campaign => ({
  id: r.id,
  detailCenterId: r.detail_center_id,
  centerName: r.detail_center_name,
  name: r.name,
  objective: r.objective as CampaignObjective,
  channels: (r.channels ?? []) as CampaignChannel[],
  startsOn: r.starts_on,
  endsOn: r.ends_on,
  budget: num(r.budget),
  status: r.status as CampaignStatus,
  utmSource: r.utm_source,
  utmMedium: r.utm_medium,
  utmCampaign: r.utm_campaign,
  landingUrl: r.landing_url,
  notes: r.notes,
  spend: Number(r.spend),
  leads: r.leads,
  promotions: r.promotions,
  posts: r.posts,
  version: r.version,
  canManage: r.can_manage,
});

async function done(call: () => PromiseLike<{ error: unknown }>): Promise<Result<void>> {
  try {
    const { error } = await call();
    return error ? { ok: false, error: toRepoError(error) } : { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toRepoError(error) };
  }
}

/** Adaptador Supabase del puerto `MarketingRepository`. Escrituras por RPC. */
export function createMarketingRepository(client: MeguiarsSupabaseClient): MarketingRepository {
  return {
    campaigns(organizationId) {
      return run(
        () => client.rpc("list_campaigns", { p_organization_id: organizationId }),
        (rows) => rows.map(toCampaign),
      );
    },

    async campaign(organizationId, id) {
      const r = await run(
        () => client.rpc("list_campaigns", { p_organization_id: organizationId, p_id: id }),
        (rows) => rows.map(toCampaign),
      );
      if (!r.ok) return r;
      return r.data[0]
        ? { ok: true, data: r.data[0] }
        : fail("not_found", "La campaña no existe o no tienes acceso.");
    },

    saveCampaign(command) {
      const parsed = campaignSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("upsert_campaign", {
            p_organization_id: c.organizationId,
            p_id: c.id ?? null,
            p_version: c.version ?? null,
            p_detail_center_id: c.detailCenterId ?? null,
            p_name: c.name,
            p_objective: c.objective,
            p_channels: c.channels,
            p_starts_on: c.startsOn,
            p_ends_on: c.endsOn,
            p_budget: c.budget ?? null,
            p_status: c.status,
            p_utm_source: c.utmSource,
            p_utm_medium: c.utmMedium,
            p_utm_campaign: c.utmCampaign,
            p_landing_url: c.landingUrl ?? null,
            p_notes: c.notes ?? null,
            p_reason: c.reason,
          }),
        (row) => ({ id: row.id }),
      );
    },

    spendEntries(campaignId) {
      return run(
        () => client.rpc("campaign_spend_entries", { p_campaign_id: campaignId }),
        (rows) =>
          rows.map((s) => ({
            id: s.id,
            spentOn: s.spent_on,
            amount: Number(s.amount),
            channel: s.channel as CampaignChannel,
            expenseId: s.expense_id,
            expenseFolio: s.expense_folio,
            note: s.note,
            voidedAt: s.voided_at,
            voidReason: s.void_reason,
            createdByName: s.created_by_name,
          })),
      );
    },

    addSpend(command) {
      const parsed = campaignSpendSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return done(() =>
        client.rpc("add_campaign_spend", {
          p_campaign_id: c.campaignId,
          p_spent_on: c.spentOn ?? null,
          p_amount: c.amount ?? null,
          p_channel: c.channel,
          p_expense_id: c.expenseId ?? null,
          p_note: c.note ?? null,
        }),
      );
    },

    voidSpend(spendId, reason) {
      if (reason.trim().length < 3)
        return Promise.resolve(fail("validation", "Indica el motivo (mínimo 3 caracteres)"));
      return done(() => client.rpc("void_campaign_spend", { p_spend_id: spendId, p_reason: reason.trim() }));
    },

    async marketingExpenses(organizationId) {
      const [expenses, linked] = await Promise.all([
        run(
          () =>
            client
              .from("expenses")
              .select("id, folio, concept, amount, paid_on")
              .eq("organization_id", organizationId)
              .eq("pnl_group", "marketing")
              .in("status", ["pendiente", "aprobado"])
              .order("paid_on", { ascending: false })
              .limit(100),
          (rows) => rows,
        ),
        run(
          () =>
            client
              .from("campaign_spend")
              .select("expense_id")
              .eq("organization_id", organizationId)
              .not("expense_id", "is", null),
          (rows) => new Set(rows.map((r) => r.expense_id)),
        ),
      ]);
      if (!expenses.ok) return expenses;
      const used = linked.ok ? linked.data : new Set<string | null>();
      return {
        ok: true,
        data: expenses.data
          .filter((e) => !used.has(e.id))
          .map((e) => ({
            id: e.id,
            label: `${e.folio} · ${e.concept} · $${Number(e.amount).toFixed(2)} · ${e.paid_on}`,
          })),
      };
    },

    posts(organizationId, from, to, filter = {}) {
      return run(
        () =>
          client.rpc("list_content_posts", {
            p_organization_id: organizationId,
            p_from: from,
            p_to: to,
            p_detail_center_id: filter.detailCenterId ?? null,
            p_campaign_id: filter.campaignId ?? null,
          }),
        (rows): ContentPost[] =>
          rows.map((p) => ({
            id: p.id,
            detailCenterId: p.detail_center_id,
            centerName: p.detail_center_name,
            campaignId: p.campaign_id,
            campaignName: p.campaign_name,
            channel: p.channel as CampaignChannel,
            format: p.format as ContentFormat,
            title: p.title,
            copy: p.copy,
            plannedAt: p.planned_at,
            status: p.status as ContentStatus,
            ownerId: p.owner_id,
            ownerName: p.owner_name,
            linkUrl: p.link_url,
            publishedUrl: p.published_url,
            publishedAt: p.published_at,
            overdue: p.overdue,
            version: p.version,
            canManage: p.can_manage,
          })),
      );
    },

    savePost(command) {
      const parsed = contentPostSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("upsert_content_post", {
            p_organization_id: c.organizationId,
            p_id: c.id ?? null,
            p_version: c.version ?? null,
            p_detail_center_id: c.detailCenterId ?? null,
            p_campaign_id: c.campaignId ?? null,
            p_channel: c.channel,
            p_format: c.format,
            p_title: c.title,
            p_copy: c.copy ?? null,
            p_planned_at: c.plannedAt,
            p_owner_id: c.ownerId ?? null,
            p_link_url: c.linkUrl ?? null,
            p_reason: c.reason,
          }),
        (row) => ({ id: row.id }),
      );
    },

    setPostStatus(id, version, status, publishedUrl) {
      const parsed = contentStatusSchema.safeParse({ id, version, status, publishedUrl });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return done(() =>
        client.rpc("set_content_post_status", {
          p_id: id,
          p_version: parsed.data.version,
          p_status: parsed.data.status,
          p_published_url: parsed.data.publishedUrl ?? null,
          p_reason: null,
        }),
      );
    },

    promotions(organizationId) {
      return run(
        () => client.rpc("list_promotions", { p_organization_id: organizationId }),
        (rows): Promotion[] =>
          rows.map((p) => ({
            id: p.id,
            campaignId: p.campaign_id,
            campaignName: p.campaign_name,
            code: p.code,
            name: p.name,
            kind: p.kind as PromotionKind,
            value: Number(p.value),
            serviceIds: p.service_ids ?? [],
            serviceNames: p.service_names ?? [],
            detailCenterIds: p.detail_center_ids ?? [],
            startsOn: p.starts_on,
            endsOn: p.ends_on,
            maxUses: p.max_uses,
            uses: p.uses,
            discountGranted: Number(p.discount_granted),
            active: p.active,
            terms: p.terms,
            version: p.version,
          })),
      );
    },

    savePromotion(command) {
      const parsed = promotionSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("upsert_promotion", {
            p_organization_id: c.organizationId,
            p_id: c.id ?? null,
            p_version: c.version ?? null,
            p_campaign_id: c.campaignId ?? null,
            p_code: c.code,
            p_name: c.name,
            p_kind: c.kind,
            p_value: c.value,
            p_service_ids: c.serviceIds,
            p_detail_center_ids: c.detailCenterIds,
            p_starts_on: c.startsOn,
            p_ends_on: c.endsOn,
            p_max_uses: c.maxUses ?? null,
            p_active: c.active,
            p_terms: c.terms ?? null,
            p_reason: c.reason,
          }),
        (row) => ({ id: row.id }),
      );
    },

    applyPromotionToQuote(quoteId, version, code) {
      const parsed = applyPromotionSchema.safeParse({ documentId: quoteId, version, code });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return done(() =>
        client.rpc("apply_promotion_to_quote", {
          p_quote_id: quoteId,
          p_version: parsed.data.version,
          p_code: parsed.data.code,
        }),
      );
    },

    applyPromotionToOrder(orderId, version, code) {
      const parsed = applyPromotionSchema.safeParse({ documentId: orderId, version, code });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return done(() =>
        client.rpc("apply_promotion_to_order", {
          p_order_id: orderId,
          p_version: parsed.data.version,
          p_code: parsed.data.code,
        }),
      );
    },

    setLeadCampaign(leadId, version, campaignId) {
      return done(() =>
        client.rpc("set_lead_campaign", { p_id: leadId, p_version: version, p_campaign_id: campaignId }),
      );
    },

    leadCampaignId(leadId) {
      return run(
        () => client.from("leads").select("id, campaign_id").eq("id", leadId).limit(1),
        (rows) => rows[0]?.campaign_id ?? null,
      );
    },

    facts(organizationId, detailCenterIds, from, to) {
      return run(
        () =>
          client.rpc("campaign_facts", {
            p_organization_id: organizationId,
            p_detail_center_ids: detailCenterIds,
            p_from: from,
            p_to: to,
          }),
        (rows): CampaignFact[] =>
          rows.map((f) => ({
            campaignId: f.campaign_id,
            name: f.name,
            objective: f.objective as CampaignObjective,
            status: f.status as CampaignStatus,
            startsOn: f.starts_on,
            endsOn: f.ends_on,
            budget: num(f.budget),
            spend: Number(f.spend),
            leads: f.leads,
            contacted: f.contacted,
            quoted: f.quoted,
            booked: f.booked,
            won: f.won,
            sales: Number(f.sales),
            salesCost: Number(f.sales_cost),
            salesMargin: Number(f.sales_margin),
            promoUses: f.promo_uses,
            promoDiscount: Number(f.promo_discount),
          })),
      );
    },

    spendFacts(organizationId, detailCenterIds, from, to) {
      return run(
        () =>
          client.rpc("campaign_spend_facts", {
            p_organization_id: organizationId,
            p_detail_center_ids: detailCenterIds,
            p_from: from,
            p_to: to,
          }),
        (rows): SpendFact[] =>
          rows.map((r) => ({
            spendId: r.spend_id,
            campaignId: r.campaign_id,
            campaignCenterId: r.campaign_detail_center_id,
            channel: r.channel as CampaignChannel,
            spentOn: r.spent_on,
            amount: Number(r.amount),
            origin: r.origin === "egreso" ? "egreso" : "manual",
          })),
      );
    },
  };
}
