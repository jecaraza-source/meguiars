import "server-only";
import { fail, type Result } from "@meguiars/domain";
import {
  createInboxRepository,
  createInboxServiceGateway,
  type MeguiarsSupabaseClient,
} from "@meguiars/supabase";
import { channelServerReady, sendTemplateViaMeta, sendViaMeta } from "./meta";
import { createSupabaseServiceClient } from "./supabase/service";

/**
 * Responder desde la bandeja (web y móvil usan esta misma función):
 * 1. La base, con la sesión de quien responde, valida permiso, cuenta
 *    verificada y ventana de 24 h, y deja el mensaje «pendiente».
 * 2. El servidor lo envía con el token oficial del canal.
 * 3. El resultado (id de Meta o error) lo registra la llave de servicio.
 */
export async function sendConversationMessage(
  userClient: MeguiarsSupabaseClient,
  input: {
    conversationId: string;
    requestId: string;
    body: string;
    expectedLastMessageAt?: string | undefined;
  },
): Promise<Result<{ messageId: string; status: "enviado" | "fallido"; error?: string }>> {
  const service = createSupabaseServiceClient();
  if (!service)
    return fail("unavailable", "El envío no está configurado en el servidor (falta la llave de servicio).");
  const prepared = await createInboxRepository(userClient).prepareOutbound(
    input.conversationId,
    input.requestId,
    input.body,
    input.expectedLastMessageAt,
  );
  if (!prepared.ok) return prepared;
  const msg = prepared.data;
  if (msg.alreadySent) return { ok: true, data: { messageId: msg.messageId, status: "enviado" } };
  if (!channelServerReady(msg.channel)) {
    const gateway = createInboxServiceGateway(service);
    await gateway.finishOutbound(msg.messageId, {
      ok: false,
      error: "Faltan las credenciales del canal en el servidor",
    });
    return fail(
      "unavailable",
      "Faltan las credenciales de este canal en el servidor: el mensaje no se envió.",
    );
  }
  const sent = await sendViaMeta(msg);
  const recorded = await createInboxServiceGateway(service).finishOutbound(msg.messageId, sent);
  if (!recorded.ok) return recorded;
  return sent.ok
    ? { ok: true, data: { messageId: msg.messageId, status: "enviado" } }
    : { ok: true, data: { messageId: msg.messageId, status: "fallido", error: sent.error } };
}

/**
 * Plantilla aprobada de WhatsApp (fuera de la ventana de 24 h). Mismo flujo en
 * dos pasos: la base valida estado, categoría y consentimiento; el servidor
 * la envía con el token oficial y registra el resultado.
 */
export async function sendTemplateMessage(
  userClient: MeguiarsSupabaseClient,
  input: { conversationId: string; requestId: string; templateId: string; params: string[] },
): Promise<Result<{ messageId: string; status: "enviado" | "fallido"; error?: string }>> {
  const service = createSupabaseServiceClient();
  if (!service)
    return fail("unavailable", "El envío no está configurado en el servidor (falta la llave de servicio).");
  const prepared = await createInboxRepository(userClient).prepareTemplate(
    input.conversationId,
    input.requestId,
    input.templateId,
    input.params,
  );
  if (!prepared.ok) return prepared;
  const msg = prepared.data;
  if (msg.alreadySent) return { ok: true, data: { messageId: msg.messageId, status: "enviado" } };
  const gateway = createInboxServiceGateway(service);
  if (!channelServerReady("whatsapp")) {
    await gateway.finishOutbound(msg.messageId, {
      ok: false,
      error: "Faltan las credenciales de WhatsApp en el servidor",
    });
    return fail(
      "unavailable",
      "Faltan las credenciales de WhatsApp en el servidor: la plantilla no se envió.",
    );
  }
  const sent = await sendTemplateViaMeta(msg);
  const recorded = await gateway.finishOutbound(msg.messageId, sent);
  if (!recorded.ok) return recorded;
  return sent.ok
    ? { ok: true, data: { messageId: msg.messageId, status: "enviado" } }
    : { ok: true, data: { messageId: msg.messageId, status: "fallido", error: sent.error } };
}
