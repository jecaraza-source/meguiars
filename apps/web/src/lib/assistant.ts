import "server-only";
import { runAssistantTurn, runButtonReply, type TurnOutcome } from "@meguiars/domain";
import { createAssistantServiceGateway } from "@meguiars/supabase";
import { claudeLlm } from "./claude-llm";
import { channelServerReady, sendViaMeta } from "./meta";
import { createSupabaseServiceClient } from "./supabase/service";

/**
 * Asistente de WhatsApp en el servidor. La llave de la API de Claude vive SÓLO
 * aquí (ANTHROPIC_API_KEY en Vercel, nunca NEXT_PUBLIC_): no llega al navegador,
 * a la app móvil ni a la base. ANTHROPIC_BASE_URL sólo se usa en pruebas
 * locales con un servidor falso.
 */

export function assistantServerReady(): boolean {
  return (process.env.ANTHROPIC_API_KEY ?? "").trim() !== "";
}

/**
 * Atiende los mensajes nuevos de WhatsApp (los devuelve el webhook). Uno por
 * uno: si llegan varios del mismo contacto, la base sólo deja responder al
 * más reciente. Nunca lanza: el webhook ya respondió 200 a Meta.
 *
 * Primero los botones: si el contacto tocó «Confirmar» en una cita propuesta,
 * la base la agenda (o la cambia o cancela) sin IA y se envía su respuesta.
 * Así la confirmación funciona aunque falte la llave de Claude.
 */
export async function runAssistantForMessages(messageIds: string[]): Promise<TurnOutcome[]> {
  const service = createSupabaseServiceClient();
  if (!service || !channelServerReady("whatsapp")) return [];
  const gateway = createAssistantServiceGateway(service);
  const sender = { send: sendViaMeta };
  const pending: string[] = [];
  for (const id of messageIds) {
    try {
      if (!(await runButtonReply({ gateway, sender }, id))) pending.push(id);
    } catch (e) {
      console.error("asistente: botón sin atender", id, e instanceof Error ? e.message : e);
      pending.push(id);
    }
  }
  if (!assistantServerReady()) return [];
  const deps = { gateway, llm: claudeLlm, sender };
  const outcomes: TurnOutcome[] = [];
  for (const id of pending) {
    try {
      outcomes.push(await runAssistantTurn(deps, id));
    } catch (e) {
      console.error("asistente: turno sin terminar", id, e instanceof Error ? e.message : e);
    }
  }
  return outcomes;
}
