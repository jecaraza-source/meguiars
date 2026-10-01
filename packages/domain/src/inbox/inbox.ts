import type { Result } from "../result";

/**
 * CR2 (fase 2): bandeja unificada sobre las API oficiales de Meta (WhatsApp
 * Cloud API, Messenger Platform e Instagram Messaging). Espejo de la migración
 * 20261024000000_inbox_channels.sql. Los tokens y el App Secret viven sólo en
 * el servidor web; aquí no hay secretos.
 */

export const INBOX_CHANNELS = ["whatsapp", "messenger", "instagram"] as const;
export type InboxChannel = (typeof INBOX_CHANNELS)[number];

export const CHANNEL_ACCOUNT_STATUSES = ["pendiente", "verificada", "error"] as const;
export type ChannelAccountStatus = (typeof CHANNEL_ACCOUNT_STATUSES)[number];

export const CONVERSATION_STATUSES = ["abierta", "cerrada"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

/** Triaje de la conversación (espejo de 20261027000000_inbox_triage_templates.sql). */
export const CONVERSATION_PRIORITIES = ["baja", "normal", "alta"] as const;
export type ConversationPriority = (typeof CONVERSATION_PRIORITIES)[number];
export const MAX_CONVERSATION_TAGS = 10;

/** Categorías de plantilla de WhatsApp; las de autenticación no se usan desde la bandeja. */
export const TEMPLATE_CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/** Marcadores de las respuestas rápidas (datos reales del contacto y del centro). */
export const QUICK_REPLY_PLACEHOLDERS = ["nombre", "centro"] as const;

export const MESSAGE_STATUSES = [
  "recibido",
  "pendiente",
  "enviado",
  "entregado",
  "leido",
  "fallido",
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/** Ventana de atención de las tres plataformas: 24 h desde el último mensaje del contacto. */
export const SERVICE_WINDOW_HOURS = 24;
export const MAX_MESSAGE_LENGTH = 4096;

/** Canal de origen del prospecto que nace de una conversación. */
export const LEAD_SOURCE_BY_CHANNEL: Record<InboxChannel, "whatsapp" | "facebook" | "instagram"> = {
  whatsapp: "whatsapp",
  messenger: "facebook",
  instagram: "instagram",
};

export interface ChannelAccount {
  id: string;
  detailCenterId: string;
  centerName: string;
  channel: InboxChannel;
  externalAccountId: string;
  label: string;
  verifiedName: string | null;
  status: ChannelAccountStatus;
  lastVerifiedAt: string | null;
  lastVerifyError: string | null;
  lastWebhookAt: string | null;
  active: boolean;
  openConversations: number;
  version: number;
}

export interface Conversation {
  id: string;
  detailCenterId: string;
  centerName: string;
  channelAccountId: string;
  accountLabel: string;
  accountStatus: ChannelAccountStatus;
  channel: InboxChannel;
  contactExternalId: string;
  contactPhone: string | null;
  contactName: string | null;
  leadId: string | null;
  leadName: string | null;
  leadStatus: string | null;
  clientId: string | null;
  clientName: string | null;
  assignedTo: string | null;
  assignedName: string | null;
  status: ConversationStatus;
  unreadCount: number;
  lastInboundAt: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  windowOpen: boolean;
  windowClosesAt: string | null;
  version: number;
  priority: ConversationPriority;
  tags: string[];
  pending: boolean;
  notes: number;
}

export interface ConversationNote {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
}

export interface QuickReply {
  id: string;
  detailCenterId: string | null;
  centerName: string | null;
  title: string;
  body: string;
  active: boolean;
  version: number;
  canManage: boolean;
}

export interface WhatsappTemplate {
  id: string;
  name: string;
  language: string;
  category: TemplateCategory;
  status: string;
  bodyText: string | null;
  paramCount: number;
  syncedAt: string;
}

/** Lo que el servidor necesita para enviar una plantilla preparada. */
export interface OutboundTemplate extends OutboundMessage {
  templateName: string;
  templateLanguage: string;
  templateParams: string[];
}

export interface InboxMessage {
  id: string;
  direction: "entrante" | "saliente";
  messageType: string;
  body: string | null;
  status: MessageStatus;
  error: string | null;
  sentByName: string | null;
  occurredAt: string;
  statusAt: string;
}

export interface ConversationFilter {
  status?: ConversationStatus | undefined;
  channel?: InboxChannel | undefined;
  assignedTo?: string | undefined;
  unassigned?: boolean | undefined;
  pending?: boolean | undefined;
  tag?: string | undefined;
}

/** Lo que el servidor necesita para enviar un mensaje preparado. */
export interface OutboundMessage {
  messageId: string;
  channel: InboxChannel;
  externalAccountId: string;
  contactExternalId: string;
  contactPhone: string | null;
  body: string;
  alreadySent: boolean;
}

export interface InboxRepository {
  accounts(organizationId: string): Promise<Result<ChannelAccount[]>>;
  saveAccount(command: {
    organizationId: string;
    id?: string | undefined;
    detailCenterId: string;
    channel: InboxChannel;
    externalAccountId: string;
    label: string;
    active: boolean;
    reason: string;
  }): Promise<Result<{ id: string }>>;
  conversations(detailCenterIds: string[], filter?: ConversationFilter): Promise<Result<Conversation[]>>;
  conversation(id: string, detailCenterIds: string[]): Promise<Result<Conversation>>;
  messages(conversationId: string): Promise<Result<InboxMessage[]>>;
  assign(id: string, version: number, userId: string | null): Promise<Result<void>>;
  setStatus(id: string, version: number, status: ConversationStatus): Promise<Result<void>>;
  linkLead(id: string, version: number, leadId: string): Promise<Result<void>>;
  createLead(command: {
    conversationId: string;
    version: number;
    requestId: string;
    fullName: string;
    socialHandle?: string | undefined;
    interestServiceIds: string[];
    notes?: string | undefined;
  }): Promise<Result<{ leadId: string }>>;
  prepareOutbound(
    conversationId: string,
    requestId: string,
    body: string,
    expectedLastMessageAt?: string | undefined,
  ): Promise<Result<OutboundMessage>>;
  setTriage(
    id: string,
    version: number,
    triage: { priority: ConversationPriority; tags: string[]; pending: boolean },
  ): Promise<Result<void>>;
  notes(conversationId: string): Promise<Result<ConversationNote[]>>;
  addNote(conversationId: string, requestId: string, body: string): Promise<Result<void>>;
  quickReplies(organizationId: string, detailCenterId?: string | undefined): Promise<Result<QuickReply[]>>;
  saveQuickReply(command: {
    organizationId: string;
    id?: string | undefined;
    version?: number | undefined;
    detailCenterId?: string | undefined;
    title: string;
    body: string;
    active: boolean;
    reason: string;
  }): Promise<Result<{ id: string }>>;
  templates(organizationId: string): Promise<Result<WhatsappTemplate[]>>;
  canSyncTemplates(organizationId: string): Promise<Result<boolean>>;
  prepareTemplate(
    conversationId: string,
    requestId: string,
    templateId: string,
    params: string[],
  ): Promise<Result<OutboundTemplate>>;
}

// ---------------------------------------------------------------------------
// Reglas
// ---------------------------------------------------------------------------

/** Espejo de private.conversation_window_open. */
export function windowOpen(lastInboundAt: string | null, now: Date = new Date()): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - new Date(lastInboundAt).getTime() < SERVICE_WINDOW_HOURS * 3_600_000;
}

/** Horas y minutos que le quedan a la ventana (null si está cerrada). */
export function windowRemaining(
  lastInboundAt: string | null,
  now: Date = new Date(),
): { hours: number; minutes: number } | null {
  if (!windowOpen(lastInboundAt, now)) return null;
  const left = SERVICE_WINDOW_HOURS * 3_600_000 - (now.getTime() - new Date(lastInboundAt!).getTime());
  const minutes = Math.floor(left / 60_000);
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

/** Por qué no se puede responder (null si se puede). Espejo de prepare_outbound_message. */
export function replyBlocker(c: Pick<Conversation, "windowOpen" | "accountStatus">): string | null {
  if (c.accountStatus !== "verificada")
    return "La cuenta de este canal no está verificada con Meta: revisa Integraciones.";
  if (!c.windowOpen)
    return "Pasaron más de 24 h desde el último mensaje del contacto: sólo se permiten plantillas aprobadas de WhatsApp. En Messenger e Instagram, contáctalo por otro medio.";
  return null;
}

/** Etiquetas normalizadas (minúsculas, sin repetir, sin vacías); espejo de set_conversation_triage. */
export function normalizeTags(input: readonly string[]): string[] {
  return [
    ...new Set(input.map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 1 && t.length <= 30)),
  ].sort();
}

/** Etiqueta válida: letras (con acentos), números, espacios o guiones. */
export function validTag(tag: string): boolean {
  return /^[a-z0-9áéíóúñü _-]+$/.test(tag);
}

/** Respuesta rápida con los datos reales del contacto y del centro. */
export function fillQuickReply(body: string, data: { name?: string | null; center?: string | null }): string {
  const first = (data.name ?? "").trim().split(" ")[0] ?? "";
  return body.replaceAll("{nombre}", first).replaceAll("{centro}", data.center ?? "");
}

/** Marcadores no permitidos en una respuesta rápida. */
export function unknownQuickReplyPlaceholders(body: string): string[] {
  const found = [...body.matchAll(/\{([^}]*)\}/g)].map((m) => m[1] ?? "");
  return [...new Set(found.filter((p) => !(QUICK_REPLY_PLACEHOLDERS as readonly string[]).includes(p)))];
}

/** Texto que verá el cliente al enviar la plantilla (espejo de prepare_template_message). */
export function renderTemplate(bodyText: string | null, name: string, params: readonly string[]): string {
  return params.reduce((text, p, i) => text.replaceAll(`{{${i + 1}}}`, p), bodyText ?? name);
}

/** Por qué no se puede usar una plantilla en la conversación (null si se puede). */
export function templateBlocker(
  t: Pick<WhatsappTemplate, "status" | "category">,
  c: Pick<Conversation, "channel" | "accountStatus">,
  whatsappConsent: boolean,
): string | null {
  if (c.channel !== "whatsapp") return "Las plantillas son de WhatsApp.";
  if (c.accountStatus !== "verificada") return "La cuenta de WhatsApp no está verificada con Meta.";
  if (t.status !== "APPROVED") return `Sólo se envían plantillas aprobadas por Meta (esta está ${t.status}).`;
  if (t.category === "AUTHENTICATION")
    return "Las plantillas de autenticación no se envían desde la bandeja.";
  if (t.category === "MARKETING" && !whatsappConsent)
    return "Plantilla de marketing: el contacto no autorizó promociones por WhatsApp.";
  return null;
}
