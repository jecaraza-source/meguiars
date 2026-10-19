import type { InboxChannel } from "../inbox";
import type { Result } from "../result";
import type { AssistantModel, HandoffCode, TurnStatus } from "./assistant";
import { ASSISTANT_LIMITS } from "./assistant";
import {
  MEDIA_HANDOFF_TYPES,
  OPT_OUT_REPLY,
  assistantRules,
  assistantTools,
  historyMessages,
  isOptOutMessage,
  parseToolCall,
  toWhatsappText,
  turnSituation,
  type AssistantToolDef,
  type BeginTurn,
  type BookingProposalInput,
  type ToolCall,
  type TurnContext,
} from "./turn";

/**
 * Un turno del asistente (un mensaje entrante). Todas las dependencias se
 * inyectan: la base (llave de servicio), el modelo (SDK de Anthropic en el
 * servidor) y el envío (API oficial de WhatsApp). Así se prueba sin red.
 *
 * Orden: abrir turno (la base decide si atiende) → reglas fijas (baja de
 * promociones, fotos) → modelo con herramientas de sólo lectura → una sola
 * respuesta → registrar tokens y resultado. Ante cualquier falla, la
 * conversación pasa a una persona; nunca se queda sin atender.
 */

export interface LlmBlock {
  type: string;
  [key: string]: unknown;
}

export interface LlmRequest {
  model: AssistantModel;
  system: { text: string; cache: boolean }[];
  tools: AssistantToolDef[];
  messages: { role: "user" | "assistant"; content: string | LlmBlock[] }[];
}

export interface LlmUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface LlmResponse {
  stopReason: string | null;
  content: LlmBlock[];
  usage: LlmUsage;
}

export interface AssistantLlm {
  /** Lanza error si la API falla (red, 4xx/5xx después de reintentos). */
  create(request: LlmRequest): Promise<LlmResponse>;
}

export interface PreparedReply {
  messageId: string;
  channel: InboxChannel;
  externalAccountId: string;
  contactExternalId: string;
  contactPhone: string | null;
  body: string;
  alreadySent: boolean;
  /** Botones de respuesta rápida (resumen de una cita propuesta). */
  buttons?: { id: string; title: string }[] | undefined;
}

type ReplyResult = { superseded: true } | { superseded: false; reply: PreparedReply };

export interface AssistantGateway {
  beginTurn(messageId: string): Promise<Result<BeginTurn>>;
  services(turnId: string, centerId: string, query: string): Promise<Result<unknown>>;
  promotions(turnId: string, centerId: string): Promise<Result<unknown>>;
  membershipPlans(turnId: string): Promise<Result<unknown>>;
  freeSlots(
    turnId: string,
    centerId: string,
    serviceIds: string[],
    from: string | null,
    days: number,
  ): Promise<Result<unknown>>;
  chooseCenter(turnId: string, centerId: string): Promise<Result<unknown>>;
  /** Nombre, autos y próximas citas del contacto. */
  clientProfile(turnId: string): Promise<Result<unknown>>;
  /** Proponer cita / cambio / cancelación: la base valida y devuelve {propuesta_id, resumen} o {error}. */
  proposeBooking(turnId: string, booking: BookingProposalInput): Promise<Result<unknown>>;
  proposeReschedule(
    turnId: string,
    appointmentId: string,
    date: string,
    time: string,
  ): Promise<Result<unknown>>;
  proposeCancel(turnId: string, appointmentId: string): Promise<Result<unknown>>;
  /** Deja pendiente el resumen con botones de la propuesta (en lugar del texto del turno). */
  replyProposal(turnId: string, proposalId: string): Promise<Result<ReplyResult>>;
  /** El contacto tocó un botón: la base lo ejecuta o lo descarta (handled = false → lo atiende el asistente). */
  handleButton(messageId: string): Promise<Result<{ handled: boolean; reply: PreparedReply | null }>>;
  handoff(
    turnId: string,
    code: HandoffCode,
    summary: string,
  ): Promise<Result<{ escalated: boolean; message: string | null; note: string | null }>>;
  optOut(turnId: string): Promise<Result<void>>;
  reply(turnId: string, body: string): Promise<Result<ReplyResult>>;
  finishOutbound(
    messageId: string,
    result: { ok: true; externalId: string } | { ok: false; error: string },
  ): Promise<Result<void>>;
  finishTurn(
    turnId: string,
    outcome: {
      status: Exclude<TurnStatus, "procesando">;
      usage: LlmUsage;
      toolCalls: unknown[];
      error: string | null;
    },
  ): Promise<Result<void>>;
}

export interface AssistantSender {
  send(reply: PreparedReply): Promise<{ ok: true; externalId: string } | { ok: false; error: string }>;
}

export type TurnOutcome =
  | { status: "skipped"; reason: string }
  | {
      status: Exclude<TurnStatus, "procesando">;
      turnId: string;
      reply: string | null;
      handoff: HandoffCode | null;
      toolCalls: { tool: string; ok: boolean }[];
      usage: LlmUsage;
      error: string | null;
      /** Propuesta de cita enviada con botones en este turno. */
      proposalId?: string | null;
    };

const ZERO: LlmUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const add = (a: LlmUsage, b: LlmUsage): LlmUsage => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
});
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 400);

export function buildLlmRequest(ctx: TurnContext): LlmRequest {
  return {
    model: ctx.settings.model,
    system: [
      { text: assistantRules(ctx), cache: true },
      { text: turnSituation(ctx), cache: false },
    ],
    tools: assistantTools(ctx),
    messages: historyMessages(ctx).map((m) => ({ role: m.role, content: m.text })),
  };
}

async function runTool(
  gateway: AssistantGateway,
  ctx: TurnContext,
  call: Exclude<ToolCall, { tool: "pasar_a_persona" }>,
): Promise<Result<unknown>> {
  switch (call.tool) {
    case "consultar_servicios":
      return gateway.services(ctx.turnId, call.centerId, call.query);
    case "consultar_promociones":
      return gateway.promotions(ctx.turnId, call.centerId);
    case "consultar_membresias":
      return gateway.membershipPlans(ctx.turnId);
    case "consultar_horarios_disponibles":
      return gateway.freeSlots(ctx.turnId, call.centerId, call.serviceIds, call.from, call.days);
    case "consultar_cliente":
      return gateway.clientProfile(ctx.turnId);
    case "proponer_cita":
      return gateway.proposeBooking(ctx.turnId, call.booking);
    case "proponer_cambio_cita":
      return gateway.proposeReschedule(ctx.turnId, call.appointmentId, call.date, call.time);
    case "proponer_cancelacion":
      return gateway.proposeCancel(ctx.turnId, call.appointmentId);
    case "elegir_centro": {
      const r = await gateway.chooseCenter(ctx.turnId, call.centerId);
      if (r.ok) {
        // Lo que sigue en este turno ya habla de ese centro.
        const center = ctx.centers.find((c) => c.id === call.centerId);
        ctx.conversation.centerConfirmed = true;
        ctx.conversation.detailCenterId = call.centerId;
        ctx.conversation.detailCenterName = center?.name ?? ctx.conversation.detailCenterName;
      }
      return r;
    }
  }
}

export async function runAssistantTurn(
  deps: { gateway: AssistantGateway; llm: AssistantLlm; sender: AssistantSender },
  messageId: string,
): Promise<TurnOutcome> {
  const { gateway, llm, sender } = deps;
  const begun = await gateway.beginTurn(messageId);
  if (!begun.ok) return { status: "skipped", reason: begun.error.message };
  if ("skip" in begun.data) return { status: "skipped", reason: begun.data.skip };
  const ctx = begun.data.context;

  let usage = ZERO;
  const toolCalls: { tool: string; ok: boolean }[] = [];
  let handoff: HandoffCode | null = null;
  let text: string | null = null;
  let error: string | null = null;
  // Última propuesta válida del turno: se responde con su resumen y botones.
  let proposalId: string | null = null;

  const escalate = async (code: HandoffCode, summary: string) => {
    const r = await gateway.handoff(ctx.turnId, code, summary);
    if (r.ok && r.data.escalated) {
      handoff = code;
      text = r.data.message;
      return true;
    }
    return r.ok ? r.data.note : `No se pudo pasar a una persona: ${r.error.message}`;
  };

  try {
    if (isOptOutMessage(ctx.message.body)) {
      const r = await gateway.optOut(ctx.turnId);
      if (!r.ok) throw new Error(r.error.message);
      toolCalls.push({ tool: "baja_promociones", ok: true });
      text = OPT_OUT_REPLY;
    } else if ((MEDIA_HANDOFF_TYPES as readonly string[]).includes(ctx.message.type)) {
      const done = await escalate(
        "fotos",
        `El cliente envió ${ctx.message.type === "image" ? "una foto" : "un archivo"}.`,
      );
      if (done !== true) throw new Error(String(done));
    } else {
      const request = buildLlmRequest(ctx);
      if (request.messages.length === 0) throw new Error("Sin mensajes del cliente para responder");
      for (let round = 0; ; round++) {
        if (round >= ASSISTANT_LIMITS.toolRounds) {
          error = "Demasiadas consultas en un solo mensaje";
          const done = await escalate(
            "falla_tecnica",
            "El asistente no logró responder (demasiadas consultas).",
          );
          if (done !== true) throw new Error(String(done));
          break;
        }
        const res = await llm.create(request);
        usage = add(usage, res.usage);
        if (res.stopReason === "refusal") {
          const done = await escalate("no_entiende", "El modelo no pudo responder esta solicitud.");
          if (done !== true) throw new Error(String(done));
          break;
        }
        const uses = res.content.filter((b) => b.type === "tool_use");
        if (uses.length === 0) {
          const out = res.content
            .filter((b) => b.type === "text" && typeof b.text === "string")
            .map((b) => b.text as string)
            .join("\n")
            .trim();
          if (proposalId) text = out || "propuesta";
          else if (res.stopReason === "max_tokens" || out === "") {
            error = res.stopReason === "max_tokens" ? "Respuesta incompleta (max_tokens)" : "Respuesta vacía";
            const done = await escalate("falla_tecnica", "El asistente no generó una respuesta válida.");
            if (done !== true) throw new Error(String(done));
          } else text = toWhatsappText(out);
          break;
        }
        request.messages.push({ role: "assistant", content: res.content });
        const results: LlmBlock[] = [];
        let stop = false;
        for (const use of uses) {
          const id = String(use.id ?? "");
          const parsed = parseToolCall(ctx, String(use.name ?? ""), use.input);
          if (!parsed.ok) {
            toolCalls.push({ tool: String(use.name ?? "?"), ok: false });
            results.push({ type: "tool_result", tool_use_id: id, is_error: true, content: parsed.error });
            continue;
          }
          const call = parsed.call;
          if (call.tool === "pasar_a_persona") {
            const done = await escalate(call.code, call.summary);
            toolCalls.push({ tool: call.tool, ok: done === true });
            if (done === true) {
              stop = true;
              break;
            }
            results.push({
              type: "tool_result",
              tool_use_id: id,
              is_error: true,
              content: done ?? "No escalado",
            });
            continue;
          }
          const r = await runTool(gateway, ctx, call);
          toolCalls.push({ tool: call.tool, ok: r.ok });
          const pid = proposalIdOf(call.tool, r);
          if (pid) proposalId = pid;
          results.push(
            r.ok
              ? { type: "tool_result", tool_use_id: id, content: JSON.stringify(r.data) }
              : { type: "tool_result", tool_use_id: id, is_error: true, content: r.error.message },
          );
        }
        if (stop) break;
        request.messages.push({ role: "user", content: results });
      }
    }
  } catch (e) {
    error = errMsg(e);
    if (!handoff) {
      try {
        const done = await escalate("falla_tecnica", `Falla técnica: ${error}`);
        if (done !== true) text = null;
      } catch {
        text = null;
      }
    }
  }

  // Una sola respuesta por turno; si llegó otro mensaje mientras tanto, contesta su turno.
  let status: Exclude<TurnStatus, "procesando"> = error ? "error" : handoff ? "escalado" : "respondido";
  if (text) {
    // Con una propuesta, el cliente recibe el resumen de la base con botones (no el texto del modelo).
    const prepared =
      proposalId && !handoff
        ? await gateway.replyProposal(ctx.turnId, proposalId)
        : await gateway.reply(ctx.turnId, text);
    if (!prepared.ok) {
      status = "error";
      error = `No se registró la respuesta: ${prepared.error.message}`;
    } else if (prepared.data.superseded) {
      status = "omitido";
    } else {
      // Lo que recibe el cliente (con una propuesta, el resumen de la base).
      text = prepared.data.reply.body;
    }
    if (prepared.ok && !prepared.data.superseded && !prepared.data.reply.alreadySent) {
      const sent = await sender.send(prepared.data.reply);
      await gateway.finishOutbound(prepared.data.reply.messageId, sent);
      if (!sent.ok) {
        status = "error";
        error = `WhatsApp no aceptó la respuesta: ${sent.error}`;
      }
    }
  } else if (!error && !handoff) status = "error";
  await gateway.finishTurn(ctx.turnId, { status, usage, toolCalls, error });
  return { status, turnId: ctx.turnId, reply: text, handoff, toolCalls, usage, error, proposalId };
}

/** propuesta_id de una propuesta aceptada por la base (no de un error). */
function proposalIdOf(tool: string, r: Result<unknown>): string | null {
  if (!r.ok || !tool.startsWith("proponer_")) return null;
  const d = r.data;
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const id = (d as Record<string, unknown>).propuesta_id;
  return typeof id === "string" && id !== "" ? id : null;
}

/**
 * El contacto tocó un botón de WhatsApp. Si es de una propuesta de cita, la
 * base la confirma (o la descarta) sin IA y aquí sólo se envía su respuesta.
 * Devuelve false si el mensaje lo debe atender el asistente (no era un botón,
 * o el contacto pidió «Cambiar»).
 */
export async function runButtonReply(
  deps: { gateway: AssistantGateway; sender: AssistantSender },
  messageId: string,
): Promise<boolean> {
  const r = await deps.gateway.handleButton(messageId);
  if (!r.ok) throw new Error(r.error.message);
  if (!r.data.handled) return false;
  const reply = r.data.reply;
  if (reply && !reply.alreadySent) {
    const sent = await deps.sender.send(reply);
    await deps.gateway.finishOutbound(reply.messageId, sent);
  }
  return true;
}
