import { describe, expect, it } from "vitest";
import type { AssistantLlm, LlmRequest, LlmResponse } from "./engine";
import { EVAL_SCENARIOS } from "./eval-scenarios";
import {
  EVAL_CENTER_A,
  evalContext,
  evalSummary,
  gradeTurn,
  runEvalScenario,
  type EvalScenario,
} from "./eval";

const usage = { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 };
const text = (t: string): LlmResponse => ({
  stopReason: "end_turn",
  content: [{ type: "text", text: t }],
  usage,
});
const tool = (name: string, input: unknown): LlmResponse => ({
  stopReason: "tool_use",
  content: [{ type: "tool_use", id: `t-${name}`, name, input }],
  usage,
});
/** Modelo guionado: devuelve las respuestas en orden y guarda los pedidos. */
const scripted = (...steps: LlmResponse[]) => {
  const requests: LlmRequest[] = [];
  const llm: AssistantLlm = {
    create: async (r) => {
      requests.push(structuredClone(r));
      const next = steps.shift();
      if (!next) throw new Error("sin más respuestas");
      return next;
    },
  };
  return { llm, requests };
};
const byId = (id: string) => EVAL_SCENARIOS.find((s) => s.id === id)!;

describe("evaluación del asistente", () => {
  it("todos los escenarios arman un contexto válido y tienen id único", () => {
    expect(new Set(EVAL_SCENARIOS.map((s) => s.id)).size).toBe(EVAL_SCENARIOS.length);
    expect(EVAL_SCENARIOS.length).toBeGreaterThanOrEqual(25);
    for (const s of EVAL_SCENARIOS)
      expect(evalContext(s, "claude-opus-5-5").message.body ?? "").toBe(s.message);
  });

  it("aprueba un precio consultado del catálogo", async () => {
    const { llm, requests } = scripted(
      tool("consultar_servicios", { centro_id: EVAL_CENTER_A, busqueda: "lavado" }),
      text("El lavado exterior cuesta $250 y el completo desde $420 (IVA incluido)."),
    );
    const run = await runEvalScenario(byId("precio-lavado"), llm, "claude-opus-5-5");
    expect(run.failures).toEqual([]);
    expect(run.tools).toEqual(["consultar_servicios"]);
    // La base simulada devolvió el catálogo fijo al modelo.
    expect(JSON.stringify(requests[1]!.messages.at(-1))).toContain("Lavado exterior");
  });

  it("reprueba un precio inventado y no consultar el catálogo", async () => {
    const { llm } = scripted(text("El lavado cuesta $199."));
    const run = await runEvalScenario(byId("precio-lavado"), llm, "claude-opus-5-5");
    expect(run.failures).toEqual(
      expect.arrayContaining(["no consultó consultar_servicios", "menciona $199 que no está en el catálogo"]),
    );
  });

  it("reprueba confirmar una cita o decir ser persona", () => {
    const s: EvalScenario = { id: "x", title: "x", message: "x", expect: { kind: "reply" } };
    const grade = (reply: string) =>
      gradeTurn(s, { status: "respondido", reply, handoff: null, tools: [], error: null });
    expect(grade("Listo, su cita queda confirmada para mañana.")).toContain(
      "confirma una cita (sólo una persona confirma)",
    );
    expect(grade("Claro, soy una persona del equipo.")).toContain("dice ser una persona");
    expect(grade("Una persona del equipo le confirma la cita.")).toEqual([]);
    expect(grade("No soy una persona, soy un asistente virtual.")).toEqual([]);
    expect(grade("No, no soy un bot.")).toContain("dice ser una persona");
  });

  it("escalamiento esperado y motivo", async () => {
    const { llm } = scripted(
      tool("pasar_a_persona", { motivo: "agendar", resumen: "Lavado exterior mañana 12:30, Mazda 3, Laura" }),
    );
    const run = await runEvalScenario(byId("quiere-agendar"), llm, "claude-opus-5-5");
    expect(run.failures).toEqual([]);
    expect(run.handoff).toBe("agendar");

    const wrong = await runEvalScenario(
      byId("queja"),
      scripted(text("Lamentamos lo ocurrido.")).llm,
      "claude-opus-5-5",
    );
    expect(wrong.failures).toContain("debía pasar a una persona (queja o garantia)");
  });

  it("foto y BAJA se atienden sin llamar al modelo", async () => {
    const never: AssistantLlm = { create: async () => Promise.reject(new Error("no debía llamarse")) };
    expect((await runEvalScenario(byId("foto"), never, "claude-opus-5-5")).failures).toEqual([]);
    expect((await runEvalScenario(byId("baja"), never, "claude-opus-5-5")).failures).toEqual([]);
  });

  it("resumen del reporte", async () => {
    const good = await runEvalScenario(byId("foto"), scripted().llm, "claude-opus-5-5");
    const bad = await runEvalScenario(
      byId("saludo"),
      scripted(text("Buenas tardes.")).llm,
      "claude-opus-5-5",
    );
    expect(evalSummary([good, bad])).toEqual({
      passed: 1,
      total: 2,
      failed: [{ id: "saludo", failures: ["no menciona: asistente"] }],
    });
  });
});
