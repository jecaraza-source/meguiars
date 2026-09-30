import {
  fail,
  type ChannelAccount,
  type ChannelAccountStatus,
  type Conversation,
  type ConversationStatus,
  type InboundItem,
  type InboxChannel,
  type InboxMessage,
  type InboxRepository,
  type MessageStatus,
  type Result,
  type StatusItem,
} from "@meguiars/domain";
import {
  assignConversationSchema,
  channelAccountSchema,
  conversationLeadSchema,
  conversationStatusSchema,
  linkConversationLeadSchema,
  sendMessageSchema,
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

    async prepareOutbound(conversationId, requestId, body) {
      const parsed = sendMessageSchema.safeParse({ conversationId, requestId, body });
      if (!parsed.success) return invalid(parsed.error);
      const r = await run(
        () =>
          client.rpc("prepare_outbound_message", {
            p_conversation_id: parsed.data.conversationId,
            p_request_id: parsed.data.requestId,
            p_body: parsed.data.body,
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
