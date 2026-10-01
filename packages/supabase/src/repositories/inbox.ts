import {
  fail,
  type ChannelAccount,
  type ChannelAccountStatus,
  type Conversation,
  type ConversationNote,
  type ConversationPriority,
  type ConversationStatus,
  type InboundItem,
  type InboxChannel,
  type InboxMessage,
  type InboxRepository,
  type MessageStatus,
  type QuickReply,
  type Result,
  type StatusItem,
  type TemplateCategory,
  type TemplateItem,
  type WhatsappTemplate,
} from "@meguiars/domain";
import {
  assignConversationSchema,
  channelAccountSchema,
  conversationLeadSchema,
  conversationNoteSchema,
  conversationStatusSchema,
  conversationTriageSchema,
  linkConversationLeadSchema,
  quickReplySchema,
  sendMessageSchema,
  sendTemplateSchema,
} from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import type { Database, Json } from "../database.types";
import { toRepoError } from "../errors";
import { invalid, run } from "./shared";

type Fns = Database["public"]["Functions"];
type ConversationRow = Fns["list_conversations"]["Returns"][number];

export const toConversation = (r: ConversationRow): Conversation => ({
  id: r.id,
  detailCenterId: r.detail_center_id,
  centerName: r.detail_center_name,
  channelAccountId: r.channel_account_id,
  accountLabel: r.account_label,
  accountStatus: r.account_status as ChannelAccountStatus,
  channel: r.channel as InboxChannel,
  contactExternalId: r.contact_external_id,
  contactPhone: r.contact_phone,
  contactName: r.contact_name,
  leadId: r.lead_id,
  leadName: r.lead_name,
  leadStatus: r.lead_status,
  clientId: r.client_id,
  clientName: r.client_name,
  assignedTo: r.assigned_to,
  assignedName: r.assigned_name,
  status: r.status as ConversationStatus,
  unreadCount: r.unread_count,
  lastInboundAt: r.last_inbound_at,
  lastMessageAt: r.last_message_at,
  lastMessagePreview: r.last_message_preview,
  windowOpen: r.window_open,
  windowClosesAt: r.window_closes_at,
  version: r.version,
  priority: r.priority as ConversationPriority,
  tags: r.tags ?? [],
  pending: r.pending,
  notes: r.notes,
});

async function done(call: () => PromiseLike<{ error: unknown }>): Promise<Result<void>> {
  try {
    const { error } = await call();
    return error ? { ok: false, error: toRepoError(error) } : { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toRepoError(error) };
  }
}

/** Adaptador Supabase del puerto `InboxRepository` (sesión del usuario). */
export function createInboxRepository(client: MeguiarsSupabaseClient): InboxRepository {
  return {
    accounts(organizationId) {
      return run(
        () => client.rpc("list_channel_accounts", { p_organization_id: organizationId }),
        (rows): ChannelAccount[] =>
          rows.map((a) => ({
            id: a.id,
            detailCenterId: a.detail_center_id,
            centerName: a.detail_center_name,
            channel: a.channel as InboxChannel,
            externalAccountId: a.external_account_id,
            label: a.label,
            verifiedName: a.verified_name,
            status: a.status as ChannelAccountStatus,
            lastVerifiedAt: a.last_verified_at,
            lastVerifyError: a.last_verify_error,
            lastWebhookAt: a.last_webhook_at,
            active: a.active,
            openConversations: a.open_conversations,
            version: a.version,
          })),
      );
    },

    saveAccount(command) {
      const parsed = channelAccountSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("upsert_channel_account", {
            p_organization_id: c.organizationId,
            p_channel_account_id: c.id ?? null,
            p_detail_center_id: c.detailCenterId,
            p_channel: c.channel,
            p_external_account_id: c.externalAccountId,
            p_label: c.label,
            p_active: c.active,
            p_reason: c.reason,
          }),
        (row) => ({ id: row.id }),
      );
    },

    conversations(detailCenterIds, filter = {}) {
      return run(
        () =>
          client.rpc("list_conversations", {
            p_detail_center_ids: detailCenterIds,
            p_status: filter.status ?? null,
            p_channel: filter.channel ?? null,
            p_assigned_to: filter.assignedTo ?? null,
            p_unassigned: filter.unassigned ?? false,
            p_pending: filter.pending ?? false,
            p_tag: filter.tag ?? null,
          }),
        (rows) => rows.map(toConversation),
      );
    },

    async conversation(id, detailCenterIds) {
      const r = await run(
        () =>
          client.rpc("list_conversations", { p_detail_center_ids: detailCenterIds, p_conversation_id: id }),
        (rows) => rows.map(toConversation),
      );
      if (!r.ok) return r;
      return r.data[0]
        ? { ok: true, data: r.data[0] }
        : fail("not_found", "La conversación no existe o no tienes acceso.");
    },

    messages(conversationId) {
      return run(
        () => client.rpc("conversation_messages", { p_conversation_id: conversationId }),
        (rows): InboxMessage[] =>
          rows.map((m) => ({
            id: m.id,
            direction: m.direction as "entrante" | "saliente",
            messageType: m.message_type,
            body: m.body,
            status: m.status as MessageStatus,
            error: m.error,
            sentByName: m.sent_by_name,
            occurredAt: m.occurred_at,
            statusAt: m.status_at,
          })),
      );
    },

    assign(id, version, userId) {
      const parsed = assignConversationSchema.safeParse({
        conversationId: id,
        version,
        userId: userId ?? undefined,
      });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return done(() =>
        client.rpc("assign_conversation", {
          p_conversation_id: parsed.data.conversationId,
          p_version: parsed.data.version,
          p_user_id: parsed.data.userId ?? null,
        }),
      );
    },

    setStatus(id, version, status) {
      const parsed = conversationStatusSchema.safeParse({ conversationId: id, version, status });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return done(() =>
        client.rpc("set_conversation_status", {
          p_conversation_id: id,
          p_version: parsed.data.version,
          p_status: parsed.data.status,
        }),
      );
    },

    linkLead(id, version, leadId) {
      const parsed = linkConversationLeadSchema.safeParse({ conversationId: id, version, leadId });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return done(() =>
        client.rpc("link_conversation_lead", {
          p_conversation_id: id,
          p_version: parsed.data.version,
          p_lead_id: parsed.data.leadId,
        }),
      );
    },

    createLead(command) {
      const parsed = conversationLeadSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("create_lead_from_conversation", {
            p_conversation_id: c.conversationId,
            p_version: c.version,
            p_request_id: c.requestId,
            p_full_name: c.fullName,
            p_social_handle: c.socialHandle ?? null,
            p_interest_service_ids: c.interestServiceIds,
            p_notes: c.notes ?? null,
          }),
        (row) => ({ leadId: row.id }),
      );
    },

    async prepareOutbound(conversationId, requestId, body, expectedLastMessageAt) {
      const parsed = sendMessageSchema.safeParse({ conversationId, requestId, body, expectedLastMessageAt });
      if (!parsed.success) return invalid(parsed.error);
      const r = await run(
        () =>
          client.rpc("prepare_outbound_message", {
            p_conversation_id: parsed.data.conversationId,
            p_request_id: parsed.data.requestId,
            p_body: parsed.data.body,
            p_expected_last_message_at: parsed.data.expectedLastMessageAt ?? null,
          }),
        (rows) => rows[0],
      );
      if (!r.ok) return r;
      if (!r.data) return fail("unknown", "La base no devolvió el mensaje preparado");
      return {
        ok: true,
        data: {
          messageId: r.data.message_id,
          channel: r.data.channel as InboxChannel,
          externalAccountId: r.data.external_account_id,
          contactExternalId: r.data.contact_external_id,
          contactPhone: r.data.contact_phone,
          body: r.data.body,
          alreadySent: r.data.already_sent,
        },
      };
    },

    async setTriage(id, version, triage) {
      const parsed = conversationTriageSchema.safeParse({ conversationId: id, version, ...triage });
      if (!parsed.success) return invalid(parsed.error);
      return done(() =>
        client.rpc("set_conversation_triage", {
          p_conversation_id: id,
          p_version: parsed.data.version,
          p_priority: parsed.data.priority,
          p_tags: parsed.data.tags,
          p_pending: parsed.data.pending,
        }),
      );
    },

    notes(conversationId) {
      return run(
        () => client.rpc("conversation_notes_list", { p_conversation_id: conversationId }),
        (rows): ConversationNote[] =>
          rows.map((n) => ({ id: n.id, body: n.body, authorName: n.author_name, createdAt: n.created_at })),
      );
    },

    async addNote(conversationId, requestId, body) {
      const parsed = conversationNoteSchema.safeParse({ conversationId, requestId, body });
      if (!parsed.success) return invalid(parsed.error);
      return done(() =>
        client.rpc("add_conversation_note", {
          p_conversation_id: conversationId,
          p_request_id: requestId,
          p_body: parsed.data.body,
        }),
      );
    },

    quickReplies(organizationId, detailCenterId) {
      return run(
        () =>
          client.rpc("list_quick_replies", {
            p_organization_id: organizationId,
            p_detail_center_id: detailCenterId ?? null,
          }),
        (rows): QuickReply[] =>
          rows.map((q) => ({
            id: q.id,
            detailCenterId: q.detail_center_id,
            centerName: q.detail_center_name,
            title: q.title,
            body: q.body,
            active: q.active,
            version: q.version,
            canManage: q.can_manage,
          })),
      );
    },

    saveQuickReply(command) {
      const parsed = quickReplySchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("upsert_quick_reply", {
            p_organization_id: c.organizationId,
            p_id: c.id ?? null,
            p_version: c.version ?? null,
            p_detail_center_id: c.detailCenterId ?? null,
            p_title: c.title,
            p_body: c.body,
            p_active: c.active,
            p_reason: c.reason,
          }),
        (row) => ({ id: row.id }),
      );
    },

    templates(organizationId) {
      return run(
        () => client.rpc("list_whatsapp_templates", { p_organization_id: organizationId }),
        (rows): WhatsappTemplate[] =>
          rows.map((t) => ({
            id: t.id,
            name: t.name,
            language: t.language,
            category: t.category as TemplateCategory,
            status: t.status,
            bodyText: t.body_text,
            paramCount: t.param_count,
            syncedAt: t.synced_at,
          })),
      );
    },

    canSyncTemplates(organizationId) {
      return run(
        () => client.rpc("can_sync_whatsapp_templates", { p_organization_id: organizationId }),
        (v) => v === true,
      );
    },

    async prepareTemplate(conversationId, requestId, templateId, params) {
      const parsed = sendTemplateSchema.safeParse({ conversationId, requestId, templateId, params });
      if (!parsed.success) return invalid(parsed.error);
      const r = await run(
        () =>
          client.rpc("prepare_template_message", {
            p_conversation_id: conversationId,
            p_request_id: requestId,
            p_template_id: templateId,
            p_params: parsed.data.params,
          }),
        (rows) => rows[0],
      );
      if (!r.ok) return r;
      if (!r.data) return fail("unknown", "La base no devolvió el mensaje preparado");
      return {
        ok: true,
        data: {
          messageId: r.data.message_id,
          channel: r.data.channel as InboxChannel,
          externalAccountId: r.data.external_account_id,
          contactExternalId: r.data.contact_external_id,
          contactPhone: r.data.contact_phone,
          body: r.data.body,
          alreadySent: r.data.already_sent,
          templateName: r.data.template_name,
          templateLanguage: r.data.template_language,
          templateParams: r.data.template_params ?? [],
        },
      };
    },
  };
}

/**
 * Operaciones exclusivas del servidor con la llave de servicio (webhook
 * firmado, verificación con Meta y resultado del envío). Nunca en móvil ni en
 * componentes de cliente.
 */
export function createInboxServiceGateway(serviceClient: MeguiarsSupabaseClient) {
  return {
    ingestInbound(channel: InboxChannel, externalAccountId: string, items: InboundItem[]) {
      return run(
        () =>
          serviceClient.rpc("ingest_inbound_messages", {
            p_channel: channel,
            p_external_account_id: externalAccountId,
            p_items: items as unknown as Json,
          }),
        (r) => r as Record<string, unknown>,
      );
    },
    ingestStatuses(channel: InboxChannel, items: StatusItem[]) {
      return run(
        () =>
          serviceClient.rpc("ingest_message_statuses", {
            p_channel: channel,
            p_items: items as unknown as Json,
          }),
        (n) => n,
      );
    },
    recordVerification(accountId: string, result: { ok: true; name: string } | { ok: false; error: string }) {
      return done(() =>
        serviceClient.rpc("record_channel_verification", {
          p_channel_account_id: accountId,
          p_ok: result.ok,
          p_verified_name: result.ok ? result.name : null,
          p_error: result.ok ? null : result.error,
        }),
      );
    },
    recordTemplates(organizationId: string, businessAccountId: string, items: TemplateItem[]) {
      return run(
        () =>
          serviceClient.rpc("record_whatsapp_templates", {
            p_organization_id: organizationId,
            p_business_account_id: businessAccountId,
            p_items: items as unknown as Json,
          }),
        (n) => n,
      );
    },
    finishOutbound(
      messageId: string,
      result: { ok: true; externalId: string } | { ok: false; error: string },
    ) {
      return done(() =>
        serviceClient.rpc("finish_outbound_message", {
          p_message_id: messageId,
          p_external_id: result.ok ? result.externalId : null,
          p_error: result.ok ? null : result.error,
        }),
      );
    },
  };
}
