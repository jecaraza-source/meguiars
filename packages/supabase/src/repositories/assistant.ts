import {
  parseBeginTurn,
  type AssistantCenterMetrics,
  type AssistantFaq,
  type AssistantGateway,
  type AssistantMode,
  type AssistantModel,
  type AssistantRepository,
  type AssistantService,
  type AssistantSettings,
  type BotStatus,
  type CenterChoice,
  type CenterHours,
  type CenterPublicInfo,
  type HandoffCode,
  type HandoffRule,
  type InboxChannel,
  type PreparedReminder,
  type ReminderGateway,
  type Result,
  type TurnStatus,
} from "@meguiars/domain";
import type { MeguiarsSupabaseClient } from "../client";
import type { Json } from "../database.types";
import { toRepoError } from "../errors";
import { run } from "./shared";

async function done(call: () => PromiseLike<{ error: unknown }>): Promise<Result<void>> {
  try {
    const { error } = await call();
    return error ? { ok: false, error: toRepoError(error) } : { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toRepoError(error) };
  }
}

/** Como run, pero acepta respuestas vacías (lista sin filas, jsonb null). */
async function rows<TRow, T>(
  call: () => PromiseLike<{ data: TRow | null; error: unknown }>,
  map: (data: TRow | null) => T,
): Promise<Result<T>> {
  try {
    const { data, error } = await call();
    if (error) return { ok: false, error: toRepoError(error) };
    return { ok: true, data: map(data) };
  } catch (error) {
    return { ok: false, error: toRepoError(error) };
  }
}

const hoursOf = (v: Json): CenterHours[] =>
  Array.isArray(v)
    ? v.flatMap((h) =>
        h && typeof h === "object" && !Array.isArray(h)
          ? [{ weekday: Number(h.weekday), opens: String(h.opens ?? ""), closes: String(h.closes ?? "") }]
          : [],
      )
    : [];

const obj = (v: unknown): Record<string, Json | undefined> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, Json | undefined>) : {};

/** Botones guardados por la base ([{id, titulo}]) en el formato del envío. */
const replyButtons = (v: Json | null): { id: string; title: string }[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const list = v.flatMap((b) => {
    const o = obj(b);
    return typeof o.id === "string" && typeof o.titulo === "string" ? [{ id: o.id, title: o.titulo }] : [];
  });
  return list.length ? list : undefined;
};

/** Configuración del asistente con la sesión del usuario (la base valida permisos). */
export function createAssistantRepository(client: MeguiarsSupabaseClient): AssistantRepository {
  return {
    settings(organizationId) {
      return rows(
        () => client.rpc("get_assistant_settings", { p_organization_id: organizationId }),
        (data): AssistantSettings | null => {
          const r = data?.[0];
          if (!r) return null;
          return {
            mode: r.mode as AssistantMode,
            model: r.model as AssistantModel,
            assistantName: r.assistant_name,
            tone: r.tone,
            greeting: r.greeting,
            privacyUrl: r.privacy_url,
            humanHours: r.human_hours,
            afterHoursMessage: r.after_hours_message,
            centerChoice: r.center_choice as CenterChoice,
            maxDaysAhead: r.max_days_ahead,
            minHoursAhead: r.min_hours_ahead,
            mentionPromotions: r.mention_promotions,
            mentionMemberships: r.mention_memberships,
            selfBooking: r.self_booking,
            remindersEnabled: r.reminders_enabled,
            reminderTemplateId: r.reminder_template_id,
            reminderHours: r.reminder_hours,
            testNumbers: r.test_numbers ?? [],
            version: r.version,
            updatedAt: r.updated_at,
            canManage: r.can_manage,
          };
        },
      );
    },
    updateSettings(c) {
      return done(() =>
        client.rpc("update_assistant_settings", {
          p_organization_id: c.organizationId,
          p_version: c.version,
          p_mode: c.mode,
          p_model: c.model,
          p_assistant_name: c.assistantName,
          p_tone: c.tone,
          p_greeting: c.greeting ?? "",
          p_privacy_url: c.privacyUrl ?? "",
          p_human_hours: c.humanHours ?? "",
          p_after_hours_message: c.afterHoursMessage ?? "",
          p_center_choice: c.centerChoice,
          p_max_days_ahead: c.maxDaysAhead,
          p_min_hours_ahead: c.minHoursAhead,
          p_mention_promotions: c.mentionPromotions,
          p_mention_memberships: c.mentionMemberships,
          p_self_booking: c.selfBooking,
          p_test_numbers: c.testNumbers,
          p_reason: c.reason,
        }),
      );
    },
    setReminders(c) {
      return done(() =>
        client.rpc("set_assistant_reminders", {
          p_organization_id: c.organizationId,
          p_version: c.version,
          p_enabled: c.enabled,
          // La base acepta null (sin plantilla); los tipos generados piden string.
          p_template_id: c.templateId as string,
          p_hours: c.hours,
          p_reason: c.reason,
        }),
      );
    },
    faqs(organizationId) {
      return rows(
        () => client.rpc("list_assistant_faqs", { p_organization_id: organizationId }),
        (data): AssistantFaq[] =>
          (data ?? []).map((r) => ({
            id: r.id,
            detailCenterId: r.detail_center_id,
            centerName: r.detail_center_name,
            question: r.question,
            answer: r.answer,
            position: r.position,
            active: r.active,
            version: r.version,
          })),
      );
    },
    upsertFaq(c) {
      return done(() =>
        client.rpc("upsert_assistant_faq", {
          p_organization_id: c.organizationId,
          p_id: c.id as string,
          p_version: c.version as number,
          p_detail_center_id: c.detailCenterId as string,
          p_question: c.question,
          p_answer: c.answer,
          p_position: c.position,
          p_active: c.active,
          p_reason: c.reason,
        }),
      );
    },
    deleteFaq(organizationId, id, reason) {
      return done(() =>
        client.rpc("delete_assistant_faq", { p_organization_id: organizationId, p_id: id, p_reason: reason }),
      );
    },
    handoffRules(organizationId) {
      return rows(
        () => client.rpc("list_assistant_handoff_rules", { p_organization_id: organizationId }),
        (data): HandoffRule[] =>
          (data ?? []).map((r) => ({
            code: r.code as HandoffCode,
            label: r.label,
            active: r.active,
            required: r.required,
            assignTo: r.assign_to,
            assignToName: r.assign_to_name,
            message: r.message,
            defaultMessage: r.default_message,
            version: r.version,
          })),
      );
    },
    setHandoffRule(c) {
      return done(() =>
        client.rpc("set_assistant_handoff_rule", {
          p_organization_id: c.organizationId,
          p_code: c.code,
          p_version: c.version,
          p_active: c.active,
          p_assign_to: c.assignTo as string,
          p_message: c.message ?? "",
          p_reason: c.reason,
        }),
      );
    },
    services(organizationId) {
      return rows(
        () => client.rpc("list_assistant_services", { p_organization_id: organizationId }),
        (data): AssistantService[] =>
          (data ?? []).map((r) => ({
            serviceId: r.service_id,
            code: r.code,
            name: r.name,
            revenueEngine: r.revenue_engine,
            basePrice: Number(r.base_price),
            durationMinutes: r.standard_duration_minutes,
            active: r.active,
            visible: r.visible,
            bookable: r.bookable,
            priceVariesBySize: r.price_varies_by_size,
          })),
      );
    },
    setService(c) {
      return done(() =>
        client.rpc("set_assistant_service", {
          p_organization_id: c.organizationId,
          p_service_id: c.serviceId,
          p_visible: c.visible,
          p_bookable: c.bookable,
          p_price_varies_by_size: c.priceVariesBySize,
          p_reason: c.reason,
        }),
      );
    },
    centers(organizationId) {
      return rows(
        () => client.rpc("list_center_public_info", { p_organization_id: organizationId }),
        (data): CenterPublicInfo[] =>
          (data ?? []).map((r) => ({
            detailCenterId: r.detail_center_id,
            code: r.code,
            name: r.name,
            timezone: r.timezone,
            active: r.active,
            address: r.address,
            phone: r.phone,
            mapsUrl: r.maps_url,
            directions: r.directions,
            nearbyZones: r.nearby_zones ?? [],
            handoffUserId: r.handoff_user_id,
            handoffUserName: r.handoff_user_name,
            hours: hoursOf(r.hours),
            version: r.version,
            canEdit: r.can_edit,
          })),
      );
    },
    setCenterInfo(c) {
      return done(() =>
        client.rpc("set_center_public_info", {
          p_detail_center_id: c.detailCenterId,
          p_version: c.version as number,
          p_address: c.address ?? "",
          p_phone: c.phone ?? "",
          p_maps_url: c.mapsUrl ?? "",
          p_directions: c.directions ?? "",
          p_nearby_zones: c.nearbyZones,
          p_handoff_user_id: c.handoffUserId as string,
          p_hours: c.hours as unknown as Json,
          p_reason: c.reason,
        }),
      );
    },
    conversationState(conversationId) {
      return rows(
        () => client.rpc("conversation_assistant", { p_conversation_id: conversationId }),
        (data) => {
          const r = data?.[0];
          if (!r) return null;
          return {
            botStatus: r.bot_status as BotStatus,
            pausedReason: r.bot_paused_reason,
            pausedAt: r.bot_paused_at,
            marketingOptOutAt: r.marketing_opt_out_at,
            mode: r.assistant_mode as AssistantMode,
            turns: r.turns,
            lastTurnStatus: (r.last_turn_status as TurnStatus | null) ?? null,
            lastTurnAt: r.last_turn_at,
          };
        },
      );
    },
    setConversationActive(conversationId, active) {
      return done(() =>
        client.rpc("set_conversation_assistant", { p_conversation_id: conversationId, p_active: active }),
      );
    },
    metrics(centerIds, from, to) {
      return rows(
        () => client.rpc("assistant_metrics", { p_detail_center_ids: centerIds, p_from: from, p_to: to }),
        (data): AssistantCenterMetrics[] =>
          (data ?? []).map((r) => ({
            detailCenterId: r.detail_center_id,
            conversations: r.conversations,
            turns: r.turns,
            answered: r.answered,
            handedOff: r.handed_off,
            skipped: r.skipped,
            errors: r.errors,
            inputTokens: Number(r.input_tokens),
            outputTokens: Number(r.output_tokens),
            cacheReadTokens: Number(r.cache_read_tokens),
            cacheWriteTokens: Number(r.cache_write_tokens),
            handoffs: (r.handoffs ?? {}) as Partial<Record<HandoffCode, number>>,
          })),
      );
    },
  };
}

/** Recordatorios de cita con la llave de servicio (sólo el servidor, desde el cron). */
export function createReminderServiceGateway(service: MeguiarsSupabaseClient): ReminderGateway {
  return {
    due(limit) {
      return run(
        () => service.rpc("reminders_due", { p_limit: limit }),
        (rows) => rows.map((r) => r.appointment_id),
      );
    },
    prepare(appointmentId) {
      return run(
        () => service.rpc("prepare_appointment_reminder", { p_appointment_id: appointmentId }),
        (rows): PreparedReminder | null => {
          const r = rows[0];
          if (!r) return null;
          return {
            messageId: r.message_id,
            externalAccountId: r.external_account_id,
            contactExternalId: r.contact_external_id,
            contactPhone: r.contact_phone,
            body: r.body,
            alreadySent: r.already_sent,
            templateName: r.template_name,
            templateLanguage: r.template_language,
            templateParams: r.template_params,
            buttonPayloads: r.button_payloads,
          };
        },
      );
    },
    finishOutbound(messageId, result) {
      return done(() =>
        service.rpc("finish_outbound_message", {
          p_message_id: messageId,
          p_external_id: result.ok ? result.externalId : null,
          p_error: result.ok ? null : result.error,
        }),
      );
    },
  };
}

/**
 * Operaciones del asistente con la llave de servicio (sólo el servidor web,
 * después de recibir el webhook firmado de Meta). Cada herramienta recibe el
 * turno en curso: la base fija con él la organización y la conversación.
 */
export function createAssistantServiceGateway(service: MeguiarsSupabaseClient): AssistantGateway {
  return {
    beginTurn(messageId) {
      return rows(
        () => service.rpc("assistant_begin_turn", { p_message_id: messageId }),
        (d) => parseBeginTurn(d),
      );
    },
    services(turnId, centerId, query) {
      return rows(
        () =>
          service.rpc("assistant_services", {
            p_turn_id: turnId,
            p_detail_center_id: centerId,
            p_query: query,
          }),
        (d) => d,
      );
    },
    promotions(turnId, centerId) {
      return rows(
        () => service.rpc("assistant_promotions", { p_turn_id: turnId, p_detail_center_id: centerId }),
        (d) => d,
      );
    },
    membershipPlans(turnId) {
      return rows(
        () => service.rpc("assistant_membership_plans", { p_turn_id: turnId }),
        (d) => d,
      );
    },
    freeSlots(turnId, centerId, serviceIds, from, days) {
      return rows(
        () =>
          service.rpc("assistant_free_slots", {
            p_turn_id: turnId,
            p_detail_center_id: centerId,
            p_service_ids: serviceIds,
            ...(from ? { p_from: from } : {}),
            p_days: days,
          }),
        (d) => d,
      );
    },
    chooseCenter(turnId, centerId) {
      return rows(
        () => service.rpc("assistant_choose_center", { p_turn_id: turnId, p_detail_center_id: centerId }),
        (d) => d,
      );
    },
    clientProfile(turnId) {
      return rows(
        () => service.rpc("assistant_client_profile", { p_turn_id: turnId }),
        (d) => d,
      );
    },
    proposeBooking(turnId, b) {
      return rows(
        () =>
          service.rpc("assistant_propose_booking", {
            p_turn_id: turnId,
            p_detail_center_id: b.centerId,
            p_service_ids: b.serviceIds,
            p_date: b.date,
            p_time: b.time,
            p_client_name: b.clientName ?? "",
            // La base trata null y vacío igual; los tipos generados piden string.
            p_vehicle_id: b.vehicleId as string,
            p_vehicle_make: b.vehicle?.make ?? "",
            p_vehicle_model: b.vehicle?.model ?? "",
            // null (no undefined): supabase-js omite las claves undefined y la RPC no tiene valor por omisión.
            p_vehicle_year: (b.vehicle?.year ?? null) as number,
            p_vehicle_plate: b.vehicle?.plate ?? "",
          }),
        (d) => d,
      );
    },
    proposeReschedule(turnId, appointmentId, date, time) {
      return rows(
        () =>
          service.rpc("assistant_propose_reschedule", {
            p_turn_id: turnId,
            p_appointment_id: appointmentId,
            p_date: date,
            p_time: time,
          }),
        (d) => d,
      );
    },
    proposeCancel(turnId, appointmentId) {
      return rows(
        () => service.rpc("assistant_propose_cancel", { p_turn_id: turnId, p_appointment_id: appointmentId }),
        (d) => d,
      );
    },
    replyProposal(turnId, proposalId) {
      return run(
        () => service.rpc("assistant_reply_proposal", { p_turn_id: turnId, p_proposal_id: proposalId }),
        (data) => {
          const r = data[0];
          if (!r || r.superseded || !r.message_id) return { superseded: true as const };
          return {
            superseded: false as const,
            reply: {
              messageId: r.message_id,
              channel: r.channel as InboxChannel,
              externalAccountId: r.external_account_id ?? "",
              contactExternalId: r.contact_external_id ?? "",
              contactPhone: r.contact_phone,
              body: r.body ?? "",
              alreadySent: r.already_sent,
              buttons: replyButtons(r.buttons),
            },
          };
        },
      );
    },
    handleButton(messageId) {
      return rows(
        () => service.rpc("assistant_handle_button", { p_message_id: messageId }),
        (d) => {
          const o = obj(d);
          const r = o.reply && typeof o.reply === "object" && !Array.isArray(o.reply) ? obj(o.reply) : null;
          return {
            handled: o.handled === true,
            reply:
              r && typeof r.message_id === "string"
                ? {
                    messageId: r.message_id,
                    channel: (typeof r.channel === "string" ? r.channel : "whatsapp") as InboxChannel,
                    externalAccountId: String(r.external_account_id ?? ""),
                    contactExternalId: String(r.contact_external_id ?? ""),
                    contactPhone: typeof r.contact_phone === "string" ? r.contact_phone : null,
                    body: String(r.body ?? ""),
                    alreadySent: r.already_sent === true,
                  }
                : null,
          };
        },
      );
    },
    handoff(turnId, code, summary) {
      return rows(
        () => service.rpc("assistant_handoff", { p_turn_id: turnId, p_code: code, p_summary: summary }),
        (d) => {
          const o = (d && typeof d === "object" && !Array.isArray(d) ? d : {}) as Record<
            string,
            Json | undefined
          >;
          return {
            escalated: o.escalado === true,
            message: typeof o.mensaje === "string" ? o.mensaje : null,
            note: typeof o.nota === "string" ? o.nota : null,
          };
        },
      );
    },
    optOut(turnId) {
      return done(() => service.rpc("assistant_opt_out", { p_turn_id: turnId }));
    },
    reply(turnId, body) {
      return run(
        () => service.rpc("assistant_reply", { p_turn_id: turnId, p_body: body }),
        (data) => {
          const r = data[0];
          if (!r || r.superseded || !r.message_id) return { superseded: true as const };
          return {
            superseded: false as const,
            reply: {
              messageId: r.message_id,
              channel: r.channel as InboxChannel,
              externalAccountId: r.external_account_id ?? "",
              contactExternalId: r.contact_external_id ?? "",
              contactPhone: r.contact_phone,
              body: r.body ?? body,
              alreadySent: r.already_sent,
            },
          };
        },
      );
    },
    finishOutbound(messageId, result) {
      return done(() =>
        service.rpc("finish_outbound_message", {
          p_message_id: messageId,
          p_external_id: result.ok ? result.externalId : null,
          p_error: result.ok ? null : result.error,
        }),
      );
    },
    finishTurn(turnId, outcome) {
      return done(() =>
        service.rpc("assistant_finish_turn", {
          p_turn_id: turnId,
          p_status: outcome.status,
          p_input_tokens: outcome.usage.input,
          p_output_tokens: outcome.usage.output,
          p_cache_read_tokens: outcome.usage.cacheRead,
          p_cache_write_tokens: outcome.usage.cacheWrite,
          p_tool_calls: outcome.toolCalls as Json,
          p_error: outcome.error ?? "",
        }),
      );
    },
  };
}
