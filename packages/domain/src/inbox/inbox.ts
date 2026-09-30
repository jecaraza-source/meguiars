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
  prepareOutbound(conversationId: string, requestId: string, body: string): Promise<Result<OutboundMessage>>;
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
    return "Pasaron más de 24 h desde el último mensaje del contacto: la plataforma sólo permite plantillas aprobadas. Contáctalo por otro medio.";
  return null;
}
