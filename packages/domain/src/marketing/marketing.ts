import type { Result } from "../result";

/**
 * CR2 (fase 3): calendario de contenido, campañas con UTM, gasto publicitario y
 * promociones con código. Espejo de 20261025000000_marketing_campaigns.sql.
 * La publicación en redes se hace en cada red: aquí se planea, se liga a la
 * campaña y se registra el enlace publicado.
 */

export const CAMPAIGN_CHANNELS = [
  "instagram",
  "facebook",
  "whatsapp",
  "tiktok",
  "google",
  "email",
  "otro",
] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

export const CAMPAIGN_OBJECTIVES = ["prospectos", "reservas", "ventas", "reactivacion", "marca"] as const;
export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number];

export const CAMPAIGN_STATUSES = ["planeada", "activa", "pausada", "terminada", "cancelada"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CONTENT_FORMATS = [
  "publicacion",
  "carrusel",
  "reel",
  "historia",
  "video",
  "estado",
  "correo",
  "otro",
] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const CONTENT_STATUSES = ["idea", "borrador", "programada", "publicada", "cancelada"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const PROMOTION_KINDS = ["percent", "amount"] as const;
export type PromotionKind = (typeof PROMOTION_KINDS)[number];

export interface Campaign {
  id: string;
  detailCenterId: string | null;
  centerName: string | null;
  name: string;
  objective: CampaignObjective;
  channels: CampaignChannel[];
  startsOn: string;
  endsOn: string;
  budget: number | null;
  status: CampaignStatus;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  landingUrl: string | null;
  notes: string | null;
  spend: number;
  leads: number;
  promotions: number;
  posts: number;
  version: number;
  canManage: boolean;
}

export interface CampaignSpendEntry {
  id: string;
  spentOn: string;
  amount: number;
  channel: CampaignChannel;
  expenseId: string | null;
  expenseFolio: string | null;
  note: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdByName: string | null;
}

export interface ContentPost {
  id: string;
  detailCenterId: string | null;
  centerName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  channel: CampaignChannel;
  format: ContentFormat;
  title: string;
  copy: string | null;
  plannedAt: string;
  status: ContentStatus;
  ownerId: string | null;
  ownerName: string | null;
  linkUrl: string | null;
  publishedUrl: string | null;
  publishedAt: string | null;
  overdue: boolean;
  version: number;
  canManage: boolean;
}

export interface Promotion {
  id: string;
  campaignId: string | null;
  campaignName: string | null;
  code: string;
  name: string;
  kind: PromotionKind;
  value: number;
  serviceIds: string[];
  serviceNames: string[];
  detailCenterIds: string[];
  startsOn: string;
  endsOn: string;
  maxUses: number | null;
  uses: number;
  discountGranted: number;
  active: boolean;
  terms: string | null;
  version: number;
}

export interface CampaignFact {
  campaignId: string;
  name: string;
  objective: CampaignObjective;
  status: CampaignStatus;
  startsOn: string;
  endsOn: string;
  budget: number | null;
  spend: number;
  leads: number;
  contacted: number;
  quoted: number;
  booked: number;
  won: number;
  sales: number;
  salesCost: number;
  salesMargin: number;
  promoUses: number;
  promoDiscount: number;
}

export interface CampaignCommand {
  organizationId: string;
  id?: string | undefined;
  version?: number | undefined;
  detailCenterId?: string | undefined;
  name: string;
  objective: CampaignObjective;
  channels: CampaignChannel[];
  startsOn: string;
  endsOn: string;
  budget?: number | undefined;
  status: CampaignStatus;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  landingUrl?: string | undefined;
  notes?: string | undefined;
  reason: string;
}

export interface ContentPostCommand {
  organizationId: string;
  id?: string | undefined;
  version?: number | undefined;
  detailCenterId?: string | undefined;
  campaignId?: string | undefined;
  channel: CampaignChannel;
  format: ContentFormat;
  title: string;
  copy?: string | undefined;
  plannedAt: string;
  ownerId?: string | undefined;
  linkUrl?: string | undefined;
  reason: string;
}

export interface PromotionCommand {
  organizationId: string;
  id?: string | undefined;
  version?: number | undefined;
  campaignId?: string | undefined;
  code: string;
  name: string;
  kind: PromotionKind;
  value: number;
  serviceIds: string[];
  detailCenterIds: string[];
  startsOn: string;
  endsOn: string;
  maxUses?: number | undefined;
  active: boolean;
  terms?: string | undefined;
  reason: string;
}

/** Inversión registrada (public.campaign_spend_facts). */
export interface SpendFact {
  spendId: string;
  campaignId: string;
  campaignCenterId: string | null;
  channel: CampaignChannel;
  spentOn: string;
  amount: number;
  origin: "egreso" | "manual";
}

export interface MarketingRepository {
  campaigns(organizationId: string): Promise<Result<Campaign[]>>;
  campaign(organizationId: string, id: string): Promise<Result<Campaign>>;
  saveCampaign(command: CampaignCommand): Promise<Result<{ id: string }>>;
  spendEntries(campaignId: string): Promise<Result<CampaignSpendEntry[]>>;
  addSpend(command: {
    campaignId: string;
    spentOn?: string | undefined;
    amount?: number | undefined;
    channel: CampaignChannel;
    expenseId?: string | undefined;
    note?: string | undefined;
  }): Promise<Result<void>>;
  voidSpend(spendId: string, reason: string): Promise<Result<void>>;
  /** Egresos vigentes del grupo marketing aún sin campaña (para ligar el gasto). */
  marketingExpenses(organizationId: string): Promise<Result<{ id: string; label: string }[]>>;
  posts(
    organizationId: string,
    from: string,
    to: string,
    filter?: { detailCenterId?: string | undefined; campaignId?: string | undefined },
  ): Promise<Result<ContentPost[]>>;
  savePost(command: ContentPostCommand): Promise<Result<{ id: string }>>;
  setPostStatus(
    id: string,
    version: number,
    status: ContentStatus,
    publishedUrl?: string | undefined,
  ): Promise<Result<void>>;
  promotions(organizationId: string): Promise<Result<Promotion[]>>;
  savePromotion(command: PromotionCommand): Promise<Result<{ id: string }>>;
  applyPromotionToQuote(quoteId: string, version: number, code: string): Promise<Result<void>>;
  applyPromotionToOrder(orderId: string, version: number, code: string): Promise<Result<void>>;
  setLeadCampaign(leadId: string, version: number, campaignId: string | null): Promise<Result<void>>;
  leadCampaignId(leadId: string): Promise<Result<string | null>>;
  facts(
    organizationId: string,
    detailCenterIds: string[],
    from: string,
    to: string,
  ): Promise<Result<CampaignFact[]>>;
  spendFacts(
    organizationId: string,
    detailCenterIds: string[],
    from: string,
    to: string,
  ): Promise<Result<SpendFact[]>>;
}

// ---------------------------------------------------------------------------
// Reglas
// ---------------------------------------------------------------------------

/** Valor UTM a partir de un texto: minúsculas, sin acentos; conserva _ . - y el resto pasa a guion bajo. */
export function utmSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/^[_.-]+|[_.-]+$/g, "")
    .slice(0, 60);
}

/**
 * Enlace con parámetros UTM (source, medium, campaign y, si hay, content).
 * Conserva la ruta y los parámetros propios del enlace; reemplaza utm_* previos.
 * null si la URL base no es https.
 */
export function buildUtmUrl(
  base: string,
  utm: { source: string; medium: string; campaign: string; content?: string | undefined },
): string | null {
  let url: URL;
  try {
    url = new URL(base.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const params: [string, string | undefined][] = [
    ["utm_source", utm.source],
    ["utm_medium", utm.medium],
    ["utm_campaign", utm.campaign],
    ["utm_content", utm.content ? utmSlug(utm.content) : undefined],
  ];
  for (const [k, v] of params) {
    url.searchParams.delete(k);
    if (v) url.searchParams.set(k, v.trim().toLowerCase());
  }
  return url.toString();
}

export type PromotionState = "vigente" | "programada" | "vencida" | "agotada" | "inactiva";

/** Estado de la promoción para la fecha del centro. */
export function promotionState(
  p: Pick<Promotion, "active" | "startsOn" | "endsOn" | "maxUses" | "uses">,
  today: string,
): PromotionState {
  if (!p.active) return "inactiva";
  if (today > p.endsOn) return "vencida";
  if (p.maxUses != null && p.uses >= p.maxUses) return "agotada";
  if (today < p.startsOn) return "programada";
  return "vigente";
}

/** Transiciones del calendario editorial (espejo de set_content_post_status). */
export function contentStatusActions(status: ContentStatus): ContentStatus[] {
  switch (status) {
    case "idea":
      return ["borrador", "programada", "cancelada"];
    case "borrador":
      return ["programada", "publicada", "cancelada"];
    case "programada":
      return ["publicada", "borrador", "cancelada"];
    default:
      return [];
  }
}

/** Días del periodo agrupados para el calendario (fecha local del centro). */
export function groupPostsByDay(
  posts: readonly ContentPost[],
  timeZone: string,
): { day: string; posts: ContentPost[] }[] {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const map = new Map<string, ContentPost[]>();
  for (const p of posts) {
    const day = fmt.format(new Date(p.plannedAt));
    map.set(day, [...(map.get(day) ?? []), p]);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, ps]) => ({ day, posts: ps }));
}
