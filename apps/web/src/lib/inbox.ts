import "server-only";
import { fail, type Result } from "@meguiars/domain";
import {
  createInboxRepository,
  createInboxServiceGateway,
  type MeguiarsSupabaseClient,
} from "@meguiars/supabase";
import { channelServerReady, sendViaMeta } from "./meta";
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
  input: { conversationId: string; requestId: string; body: string },
): Promise<Result<{ messageId: string; status: "enviado" | "fallido"; error?: string }>> {
  const service = createSupabaseServiceClient();
  if (!service)
    return fail("unavailable", "El envío no está configurado en el servidor (falta la llave de servicio).");
  const prepared = await createInboxRepository(userClient).prepareOutbound(
    input.conversationId,
    input.requestId,
    input.body,
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
