import { describe, expect, it } from "vitest";
import {
  ASSISTANT_MODEL_INFO,
  OPT_OUT_REPLY,
  assistantRules,
  assistantTools,
  buildLlmRequest,
  estimateAssistantCost,
  formatCenterHours,
  historyMessages,
  isOptOutMessage,
  normalizeTestNumber,
  parseBeginTurn,
  parseToolCall,
  runAssistantTurn,
  runButtonReply,
  toWhatsappText,
  turnSituation,
  type AssistantGateway,
  type AssistantLlm,
  type LlmRequest,
  type LlmResponse,
  type PreparedReply,
  type TurnContext,
} from "./index";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const SVC = "5e000000-0000-4000-8000-000000000001";

const raw = (over: Record<string, unknown> = {}) => ({
  turn_id: "turn-1",
  now: "2026-10-15T16:30:00Z",
  settings: {
    model: "claude-opus-5-5",
    assistant_name: "Asistente MEGUIAR'S",
    tone: "Cordial y breve; de usted.",
    greeting: "Hola, soy el asistente de MEGUIAR'S",
    privacy_url: "https://ejemplo.mx/privacidad",
    human_hours: "lun-sáb 9:00-19:00",
    after_hours_message: null,
    center_choice: "colonia",
    max_days_ahead: 14,
    min_hours_ahead: 2,
    mention_promotions: true,
    mention_memberships: false,
  },
  conversation: {
    id: "conv-1",
    detail_center_id: A,
    detail_center_name: "Centro Polanco",
    center_confirmed: false,
    contact_name: "Ana Ruiz",
    client_name: null,
    marketing_opt_out: false,
    first_contact: true,
  },
  message: { id: "msg-1", type: "text", body: "¿Cuánto cuesta un lavado?" },
  centers: [
    {
      id: A,
      nombre: "Centro Polanco",
      zona_horaria: "America/Mexico_City",
      direccion: "Av. Masaryk 100",
      zonas_cercanas: ["Polanco", "Anzures"],
      horario: [1, 2, 3, 4, 5]
        .map((d) => ({ dia: d, abre: "08:00", cierra: "19:00" }))
        .concat([{ dia: 6, abre: "09:00", cierra: "14:00" }]),
    },
    {
      id: B,
      nombre: "Centro Coyoacán",
      zona_horaria: "America/Mexico_City",
      direccion: null,
      zonas_cercanas: [],
      horario: [],
    },
  ],
  faqs: [{ centro: null, pregunta: "¿Aceptan tarjeta?", respuesta: "Sí, crédito y débito." }],
  handoff: ["pide_persona", "agendar", "queja", "fotos", "falla_tecnica", "no_entiende", "inventado"].map(
    (c) => ({ codigo: c }),
  ),
  history: [
    {
      direction: "saliente",
      by_bot: true,
      type: "text",
      body: "mensaje viejo del asistente",
      at: "2026-10-15T16:00:00Z",
    },
    { direction: "entrante", by_bot: false, type: "text", body: "Hola", at: "2026-10-15T16:29:00Z" },
    {
      direction: "entrante",
      by_bot: false,
      type: "text",
      body: "¿Cuánto cuesta un lavado?",
      at: "2026-10-15T16:30:00Z",
    },
  ],
  ...over,
});

const ctxOf = (over: Record<string, unknown> = {}): TurnContext => {
  const r = parseBeginTurn(raw(over));
  if (!("context" in r)) throw new Error("sin contexto");
  return r.context;
};

describe("contexto del turno", () => {
  it("interpreta la respuesta de la base y descarta motivos desconocidos", () => {
    const ctx = ctxOf();
    expect(ctx.turnId).toBe("turn-1");
    expect(ctx.centers.map((c) => c.name)).toEqual(["Centro Polanco", "Centro Coyoacán"]);
    expect(ctx.handoff).not.toContain("inventado");
    expect(parseBeginTurn({ skip: "asistente apagado" })).toEqual({ skip: "asistente apagado" });
    expect(parseBeginTurn({})).toEqual({ skip: "respuesta inválida de la base" });
  });

  it("instrucciones: centros, horario, respuestas aprobadas y reglas sin precios inventados", () => {
    const ctx = ctxOf();
    const rules = assistantRules(ctx);
    expect(rules).toContain(`Centro Polanco (centro_id: ${A})`);
    expect(rules).toContain("lun-vie 08:00-19:00 · sáb 09:00-14:00 · dom cerrado");
    expect(rules).toContain("P: ¿Aceptan tarjeta?");
    expect(rules).toContain("Nunca inventes ni estimes precios");
    expect(rules).toContain("No reservas ni confirmas citas");
    expect(rules).toContain("pide_persona:");
    expect(rules).not.toContain("falla_tecnica:");
    expect(rules).not.toContain("consultar_membresias");
    // Las instrucciones cacheadas no dependen de la conversación.
    expect(assistantRules(ctxOf({ conversation: { ...raw().conversation, contact_name: "Otra" } }))).toBe(
      rules,
    );
  });

  it("situación: hora local del centro, saludo del primer mensaje y centro pendiente", () => {
    const s = turnSituation(ctxOf());
    expect(s).toContain("jueves 2026-10-15, 10:30");
    expect(s).toContain("Hola, soy el asistente de MEGUIAR'S");
    expect(s).toContain("aún no elige centro");
    expect(s).toContain("Centro provisional para consultar");
  });

  it("historial: empieza con el cliente y une mensajes seguidos", () => {
    const ctx = ctxOf({
      history: [
        ...raw().history,
        { direction: "saliente", by_bot: false, type: "text", body: "Le atiendo yo", at: "x" },
        { direction: "entrante", by_bot: false, type: "audio", body: null, at: "y" },
      ],
    });
    expect(historyMessages(ctx)).toEqual([
      { role: "user", text: "Hola\n¿Cuánto cuesta un lavado?" },
      { role: "assistant", text: "[Respondió una persona del equipo] Le atiendo yo" },
      { role: "user", text: "[El cliente envió un audio (no puedes escucharlo; pídele que lo escriba)]" },
    ]);
  });

  it("herramientas: sin membresías si la organización no las ofrece y motivos sólo de reglas activas", () => {
    const tools = assistantTools(ctxOf());
    expect(tools.map((t) => t.name)).toEqual([
      "consultar_servicios",
      "consultar_promociones",
      "consultar_horarios_disponibles",
      "consultar_cliente",
      "elegir_centro",
      "pasar_a_persona",
    ]);
    const motivo = (tools.at(-1)!.inputSchema.properties as Record<string, { enum: string[] }>).motivo;
    expect(motivo?.enum).toEqual(["pide_persona", "agendar", "queja", "fotos", "no_entiende"]);
    for (const t of tools) expect(t.inputSchema.additionalProperties).toBe(false);
  });

  it("valida la entrada de las herramientas", () => {
    const ctx = ctxOf();
    expect(parseToolCall(ctx, "consultar_servicios", { centro_id: A, busqueda: "lavado" })).toEqual({
      ok: true,
      call: { tool: "consultar_servicios", centerId: A, query: "lavado" },
    });
    expect(parseToolCall(ctx, "consultar_servicios", { centro_id: "otro", busqueda: "" }).ok).toBe(false);
    expect(parseToolCall(ctx, "consultar_membresias", {}).ok).toBe(false);
    expect(
      parseToolCall(ctx, "consultar_horarios_disponibles", {
        centro_id: A,
        servicio_ids: ["x"],
        desde: "",
        dias: 2,
      }).ok,
    ).toBe(false);
    expect(
      parseToolCall(ctx, "consultar_horarios_disponibles", {
        centro_id: A,
        servicio_ids: [SVC],
        desde: "mañana",
        dias: 9,
      }),
    ).toEqual({
      ok: true,
      call: { tool: "consultar_horarios_disponibles", centerId: A, serviceIds: [SVC], from: null, days: 5 },
    });
    expect(parseToolCall(ctx, "pasar_a_persona", { motivo: "falla_tecnica", resumen: "" }).ok).toBe(false);
    expect(parseToolCall(ctx, "borrar_todo", {}).ok).toBe(false);
  });

  it("baja, formato de WhatsApp, números de prueba y costo estimado", () => {
    expect(isOptOutMessage("BAJA")).toBe(true);
    expect(isOptOutMessage("  Stop! ")).toBe(true);
    expect(isOptOutMessage("quiero dar de baja mi cita")).toBe(false);
    expect(toWhatsappText("## Precios\n**Lavado**: $250")).toBe("Precios\n*Lavado*: $250");
    expect(normalizeTestNumber("+52 55 1111-2222")).toBe("525511112222");
    expect(normalizeTestNumber("123")).toBeNull();
    expect(
      estimateAssistantCost("claude-opus-5-5", {
        input: 1_000_000,
        output: 100_000,
        cacheRead: 0,
        cacheWrite: 0,
      }),
    ).toBe(ASSISTANT_MODEL_INFO["claude-opus-5-5"].input + 2);
    expect(formatCenterHours([])).toBe("Sin horario registrado");
  });
});

// ---------------------------------------------------------------------------
// Motor con base, modelo y envío simulados
// ---------------------------------------------------------------------------

function fakes(
  opts: {
    responses?: (LlmResponse | Error)[];
    begin?: unknown;
    superseded?: boolean;
    sendFails?: boolean;
    proposalError?: string;
  } = {},
) {
  const calls: string[] = [];
  const requests: LlmRequest[] = [];
  const sent: PreparedReply[] = [];
  let finished: unknown = null;
  let replyBody: string | null = null;
  const ok = <T>(data: T) => ({ ok: true as const, data });
  const gateway: AssistantGateway = {
    async beginTurn() {
      calls.push("begin");
      return ok(parseBeginTurn(opts.begin ?? raw()));
    },
    async services(_t, c, q) {
      calls.push(`services:${c}:${q}`);
      return ok({ servicios: [{ servicio_id: SVC, nombre: "Lavado exprés", precio: 250 }] });
    },
    async promotions() {
      calls.push("promotions");
      return ok({ promociones: [] });
    },
    async membershipPlans() {
      return ok({ planes: [] });
    },
    async freeSlots() {
      calls.push("slots");
      return ok({ dias: [] });
    },
    async chooseCenter(_t, c) {
      calls.push(`center:${c}`);
      return ok({ cambiado: true });
    },
    async clientProfile() {
      calls.push("profile");
      return ok({ cliente: null, vehiculos: [], citas: [] });
    },
    async proposeBooking(_t, b) {
      calls.push(`propose:${b.date} ${b.time}:${b.vehicle?.make ?? b.vehicleId}`);
      return ok(
        opts.proposalError ? { error: opts.proposalError } : { propuesta_id: "prop-1", resumen: "Confirme" },
      );
    },
    async proposeReschedule(_t, id, d, h) {
      calls.push(`reschedule:${id}:${d} ${h}`);
      return ok({ propuesta_id: "prop-2", resumen: "Cambio" });
    },
    async proposeCancel(_t, id) {
      calls.push(`cancel:${id}`);
      return ok({ propuesta_id: "prop-3", resumen: "Cancelar" });
    },
    async replyProposal(_t, id) {
      calls.push(`replyProposal:${id}`);
      return ok({
        superseded: false as const,
        reply: {
          messageId: "out-2",
          channel: "whatsapp" as const,
          externalAccountId: "123",
          contactExternalId: "521",
          contactPhone: "+521",
          body: "*Confirme su cita*",
          alreadySent: false,
          buttons: [
            { id: `cita:confirmar:${id}`, title: "Confirmar" },
            { id: `cita:cambiar:${id}`, title: "Cambiar" },
          ],
        },
      });
    },
    async handleButton(id) {
      calls.push(`button:${id}`);
      if (id !== "btn") return ok({ handled: false, reply: null });
      return ok({
        handled: true,
        reply: {
          messageId: "out-3",
          channel: "whatsapp" as const,
          externalAccountId: "123",
          contactExternalId: "521",
          contactPhone: "+521",
          body: "Listo, su cita quedó agendada",
          alreadySent: false,
        },
      });
    },
    async handoff(_t, code, summary) {
      calls.push(`handoff:${code}:${summary}`);
      return ok({ escalated: true, message: `aviso ${code}`, note: null });
    },
    async optOut() {
      calls.push("optout");
      return ok(undefined);
    },
    async reply(_t, body) {
      replyBody = body;
      calls.push("reply");
      if (opts.superseded) return ok({ superseded: true as const });
      return ok({
        superseded: false as const,
        reply: {
          messageId: "out-1",
          channel: "whatsapp" as const,
          externalAccountId: "123",
          contactExternalId: "521",
          contactPhone: "+521",
          body,
          alreadySent: false,
        },
      });
    },
    async finishOutbound(_m, r) {
      calls.push(`outbound:${r.ok ? "ok" : "fail"}`);
      return ok(undefined);
    },
    async finishTurn(_t, outcome) {
      finished = outcome;
      return ok(undefined);
    },
  };
  const queue = [...(opts.responses ?? [])];
  const llm: AssistantLlm = {
    async create(req) {
      requests.push(structuredClone(req));
      const next = queue.shift();
      if (!next) throw new Error("sin respuesta simulada");
      if (next instanceof Error) throw next;
      return next;
    },
  };
  const sender = {
    async send(r: PreparedReply) {
      sent.push(r);
      return opts.sendFails
        ? { ok: false as const, error: "131047" }
        : { ok: true as const, externalId: "wamid.out" };
    },
  };
  return {
    deps: { gateway, llm, sender },
    calls,
    requests,
    sent,
    finished: () => finished,
    replyBody: () => replyBody,
  };
}

const usage = { input: 1000, output: 50, cacheRead: 800, cacheWrite: 0 };
const textResponse = (text: string): LlmResponse => ({
  stopReason: "end_turn",
  content: [{ type: "text", text }],
  usage,
});
const toolResponse = (name: string, input: unknown, id = "tu_1"): LlmResponse => ({
  stopReason: "tool_use",
  content: [
    { type: "thinking", thinking: "", signature: "s" },
    { type: "tool_use", id, name, input },
  ],
  usage,
});

describe("turno del asistente", () => {
  it("si la base no lo atiende, no llama al modelo", async () => {
    const f = fakes({ begin: { skip: "asistente apagado" } });
    expect(await runAssistantTurn(f.deps, "m")).toEqual({ status: "skipped", reason: "asistente apagado" });
    expect(f.requests).toHaveLength(0);
  });

  it("consulta el catálogo y responde una vez con el precio que devolvió la herramienta", async () => {
    const f = fakes({
      responses: [
        toolResponse("consultar_servicios", { centro_id: A, busqueda: "lavado" }),
        textResponse("El **lavado exprés** cuesta $250."),
      ],
    });
    const out = await runAssistantTurn(f.deps, "m");
    expect(out).toMatchObject({
      status: "respondido",
      reply: "El *lavado exprés* cuesta $250.",
      handoff: null,
    });
    expect(f.calls).toEqual(["begin", `services:${A}:lavado`, "reply", "outbound:ok"]);
    // El segundo pedido lleva la respuesta del modelo intacta (con thinking) y el resultado de la herramienta.
    const second = f.requests[1]!;
    expect(second.messages.at(-2)!.content).toEqual(
      toolResponse("consultar_servicios", { centro_id: A, busqueda: "lavado" }).content,
    );
    expect(JSON.stringify(second.messages.at(-1)!.content)).toContain("Lavado exprés");
    expect(second.system[0]!.cache).toBe(true);
    expect(f.finished()).toMatchObject({
      status: "respondido",
      usage: { input: 2000, output: 100, cacheRead: 1600 },
    });
  });

  it("al pasar a una persona envía el aviso de la regla y no vuelve a llamar al modelo", async () => {
    const f = fakes({
      responses: [toolResponse("pasar_a_persona", { motivo: "agendar", resumen: "Lavado mañana 17:00" })],
    });
    const out = await runAssistantTurn(f.deps, "m");
    expect(out).toMatchObject({ status: "escalado", reply: "aviso agendar", handoff: "agendar" });
    expect(f.requests).toHaveLength(1);
    expect(f.sent[0]!.body).toBe("aviso agendar");
  });

  it("entrada inválida de una herramienta vuelve al modelo como error, sin tocar la base", async () => {
    const f = fakes({
      responses: [
        toolResponse("consultar_servicios", { centro_id: "centro-falso", busqueda: "" }),
        textResponse("¿En qué centro?"),
      ],
    });
    await runAssistantTurn(f.deps, "m");
    expect(f.calls).not.toContain(expect.stringContaining("services"));
    expect(JSON.stringify(f.requests[1]!.messages.at(-1))).toContain('"is_error":true');
  });

  it("elegir centro actualiza el contexto del turno", async () => {
    const f = fakes({
      responses: [toolResponse("elegir_centro", { centro_id: B }), textResponse("Listo, Coyoacán.")],
    });
    await runAssistantTurn(f.deps, "m");
    expect(f.calls).toContain(`center:${B}`);
  });

  it("BAJA: registra la baja y responde sin llamar al modelo", async () => {
    const f = fakes({ begin: raw({ message: { id: "m", type: "text", body: "BAJA" } }) });
    const out = await runAssistantTurn(f.deps, "m");
    expect(out).toMatchObject({ status: "respondido", reply: OPT_OUT_REPLY });
    expect(f.calls).toContain("optout");
    expect(f.requests).toHaveLength(0);
  });

  it("una foto pasa directo a una persona", async () => {
    const f = fakes({ begin: raw({ message: { id: "m", type: "image", body: null } }) });
    const out = await runAssistantTurn(f.deps, "m");
    expect(out).toMatchObject({ status: "escalado", handoff: "fotos", reply: "aviso fotos" });
    expect(f.requests).toHaveLength(0);
  });

  it("si la API del modelo falla, pasa a una persona por falla técnica (nunca queda sin atender)", async () => {
    const f = fakes({ responses: [new Error("overloaded")] });
    const out = await runAssistantTurn(f.deps, "m");
    expect(out).toMatchObject({
      status: "error",
      handoff: "falla_tecnica",
      reply: "aviso falla_tecnica",
      error: "overloaded",
    });
    expect(f.sent).toHaveLength(1);
  });

  it("un rechazo del modelo pasa a una persona", async () => {
    const f = fakes({ responses: [{ stopReason: "refusal", content: [], usage }] });
    expect(await runAssistantTurn(f.deps, "m")).toMatchObject({ status: "escalado", handoff: "no_entiende" });
  });

  it("si llegó otro mensaje, no envía nada (lo contesta el turno nuevo)", async () => {
    const f = fakes({ responses: [textResponse("Hola")], superseded: true });
    expect(await runAssistantTurn(f.deps, "m")).toMatchObject({ status: "omitido" });
    expect(f.sent).toHaveLength(0);
  });

  it("si WhatsApp rechaza el envío, queda registrado como error", async () => {
    const f = fakes({ responses: [textResponse("Hola")], sendFails: true });
    const out = await runAssistantTurn(f.deps, "m");
    expect(out).toMatchObject({ status: "error" });
    expect(f.calls).toContain("outbound:fail");
  });

  it("demasiadas rondas de herramientas: pasa a una persona", async () => {
    const f = fakes({
      responses: Array.from({ length: 8 }, (_, i) =>
        toolResponse("consultar_promociones", { centro_id: A }, `tu_${i}`),
      ),
    });
    expect(await runAssistantTurn(f.deps, "m")).toMatchObject({ handoff: "falla_tecnica", status: "error" });
    expect(f.requests).toHaveLength(6);
  });

  it("el pedido usa el modelo configurado y las herramientas del turno", () => {
    const req = buildLlmRequest(ctxOf());
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.messages[0]).toEqual({ role: "user", content: "Hola\n¿Cuánto cuesta un lavado?" });
    expect(req.tools.length).toBe(6);
  });
});

describe("citas desde WhatsApp (agenda propia)", () => {
  const booking = (over: Record<string, unknown> = {}) =>
    raw({ settings: { ...raw().settings, self_booking: true }, ...over });
  const proposal = {
    centro_id: A,
    servicio_ids: [SVC],
    fecha: "2026-10-17",
    hora: "10:00",
    nombre: "Laura",
    vehiculo_id: "",
    marca: "Mazda",
    modelo: "3",
    anio: 2021,
    placa: "",
  };

  it("con la agenda propia: herramientas de propuesta y la regla de confirmar con botón", () => {
    const ctx = ctxOf(booking());
    const names = assistantTools(ctx).map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "consultar_cliente",
        "proponer_cita",
        "proponer_cambio_cita",
        "proponer_cancelacion",
      ]),
    );
    expect(assistantRules(ctx)).toContain("proponer_cita");
    expect(assistantRules(ctx)).toContain("nunca confirmas una cita con texto");
    // Sin agenda propia, no se ofrecen y la regla es pasar a una persona.
    expect(assistantTools(ctxOf()).map((t) => t.name)).not.toContain("proponer_cita");
    expect(parseToolCall(ctxOf(), "proponer_cita", proposal)).toEqual({
      ok: false,
      error: "Herramienta no disponible",
    });
  });

  it("valida la propuesta antes de llamar a la base", () => {
    const ctx = ctxOf(booking());
    expect(parseToolCall(ctx, "proponer_cita", proposal)).toEqual({
      ok: true,
      call: {
        tool: "proponer_cita",
        booking: {
          centerId: A,
          serviceIds: [SVC],
          date: "2026-10-17",
          time: "10:00",
          clientName: "Laura",
          vehicleId: null,
          vehicle: { make: "Mazda", model: "3", year: 2021, plate: null },
        },
      },
    });
    expect(parseToolCall(ctx, "proponer_cita", { ...proposal, hora: "10" }).ok).toBe(false);
    expect(parseToolCall(ctx, "proponer_cita", { ...proposal, anio: 0 })).toMatchObject({ ok: false });
    expect(parseToolCall(ctx, "proponer_cita", { ...proposal, vehiculo_id: "abc" })).toMatchObject({
      ok: false,
    });
    expect(
      parseToolCall(ctx, "proponer_cambio_cita", { cita_id: "x", fecha: "2026-10-17", hora: "11:00" }),
    ).toMatchObject({
      ok: false,
    });
  });

  it("una propuesta aceptada se envía como resumen con botones, no como el texto del modelo", async () => {
    const f = fakes({
      begin: booking(),
      responses: [toolResponse("proponer_cita", proposal), textResponse("Le envío el resumen.")],
    });
    const out = await runAssistantTurn(f.deps, "m");
    expect(out).toMatchObject({ status: "respondido", proposalId: "prop-1" });
    expect(f.calls).toEqual([
      "begin",
      "propose:2026-10-17 10:00:Mazda",
      "replyProposal:prop-1",
      "outbound:ok",
    ]);
    expect(f.sent[0]!.buttons?.map((b) => b.title)).toEqual(["Confirmar", "Cambiar"]);
  });

  it("si la base rechaza la propuesta, el modelo explica con texto normal", async () => {
    const f = fakes({
      begin: booking(),
      proposalError: "Ese horario ya no está disponible",
      responses: [
        toolResponse("proponer_cita", proposal),
        textResponse("Ese horario se ocupó, ¿le sirve a las 11?"),
      ],
    });
    expect(await runAssistantTurn(f.deps, "m")).toMatchObject({ status: "respondido", proposalId: null });
    expect(f.calls).toContain("reply");
    expect(f.calls).not.toContain("replyProposal:prop-1");
  });

  it("el botón del cliente se atiende sin IA; «Cambiar» o un texto pasan al asistente", async () => {
    const f = fakes();
    expect(await runButtonReply(f.deps, "btn")).toBe(true);
    expect(f.sent[0]!.body).toBe("Listo, su cita quedó agendada");
    expect(f.calls).toEqual(["button:btn", "outbound:ok"]);
    expect(await runButtonReply(f.deps, "texto")).toBe(false);
    expect(f.requests).toHaveLength(0);
  });
});
