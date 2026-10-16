import "server-only";
import { runAssistantTurn, type TurnOutcome } from "@meguiars/domain";
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
 */
export async function runAssistantForMessages(messageIds: string[]): Promise<TurnOutcome[]> {
  const service = createSupabaseServiceClient();
  if (!service || !assistantServerReady() || !channelServerReady("whatsapp")) return [];
  const deps = {
    gateway: createAssistantServiceGateway(service),
    llm: claudeLlm,
    sender: { send: sendViaMeta },
  };
  const outcomes: TurnOutcome[] = [];
  for (const id of messageIds) {
    try {
      outcomes.push(await runAssistantTurn(deps, id));
    } catch (e) {
      console.error("asistente: turno sin terminar", id, e instanceof Error ? e.message : e);
    }
  }
  return outcomes;
}
