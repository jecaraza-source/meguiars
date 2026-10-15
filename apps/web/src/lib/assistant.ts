import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  runAssistantTurn,
  type AssistantLlm,
  type LlmBlock,
  type LlmRequest,
  type TurnOutcome,
} from "@meguiars/domain";
import { createAssistantServiceGateway } from "@meguiars/supabase";
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

/** Fallback del lado del servidor ante un rechazo del modelo (Opus y Sonnet; Haiku no lo admite). */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
    // Un mensaje de WhatsApp no espera minutos: si tarda, pasa a una persona.
    timeout: 40_000,
    maxRetries: 1,
  });
  return client;
}

/** Adapta el pedido del dominio al SDK oficial (Messages API con herramientas). */
export const claudeLlm: AssistantLlm = {
  async create(req: LlmRequest) {
    const fallback = req.model !== "claude-haiku-5-5";
    const res = await anthropic().beta.messages.create({
      model: req.model,
      max_tokens: 8000,
      // Conversación: respuestas cortas; el razonamiento adaptativo decide cuánto pensar.
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system: req.system.map((b) => ({
        type: "text" as const,
        text: b.text,
        ...(b.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
      })),
      tools: req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
        strict: true,
      })),
      messages: req.messages as Anthropic.Beta.BetaMessageParam[],
      ...(fallback ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
    });
    return {
      stopReason: res.stop_reason,
      content: res.content as unknown as LlmBlock[],
      usage: {
        input: res.usage.input_tokens ?? 0,
        output: res.usage.output_tokens ?? 0,
        cacheRead: res.usage.cache_read_input_tokens ?? 0,
        cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
      },
    };
  },
};

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
