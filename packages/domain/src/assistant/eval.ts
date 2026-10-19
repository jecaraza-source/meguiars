import { ok, type Result } from "../result";
import type { HandoffCode } from "./assistant";
import { runAssistantTurn, type AssistantGateway, type AssistantLlm, type LlmUsage } from "./engine";
import { parseBeginTurn, type TurnContext } from "./turn";

/**
 * Conjunto de evaluación del asistente de WhatsApp. Cada escenario es una
 * conversación con un último mensaje del cliente; se corre con el motor real
 * (runAssistantTurn) contra una base simulada con datos fijos (centros,
 * catálogo, promociones y horarios) y se califica sin IA:
 *
 * - qué hizo: respondió o pasó a una persona (y con qué motivo);
 * - qué consultó: herramientas obligatorias (p. ej. el catálogo antes de dar un precio);
 * - qué dijo: todo monto en pesos debe salir del catálogo o de las promociones;
 *   nunca confirma una cita, nunca dice ser persona, nunca inventa descuentos;
 *   frases que debe o no debe contener.
 *
 * Con un modelo simulado sirve de prueba del arnés; con la API real (runner en
 * apps/web/scripts/assistant-eval.ts) mide el comportamiento antes de pasar el
 * asistente a «activo».
 */

export const EVAL_CENTER_A = "aaaaaaaa-0000-4000-8000-000000000001";
export const EVAL_CENTER_B = "bbbbbbbb-0000-4000-8000-000000000002";

const svc = (n: number) => `5e000000-0000-4000-8000-00000000000${n}`;

/** Datos fijos que devuelve la base simulada. */
export const EVAL_WORLD = {
  services: [
    {
      servicio_id: svc(1),
      nombre: "Lavado exterior",
      precio: 250,
      duracion_min: 40,
      precio_varia_por_tamano: false,
      se_agenda_sin_valoracion: true,
    },
    {
      servicio_id: svc(2),
      nombre: "Lavado completo (exterior e interior)",
      precio: 420,
      duracion_min: 70,
      precio_varia_por_tamano: true,
      se_agenda_sin_valoracion: true,
    },
    {
      servicio_id: svc(3),
      nombre: "Pulido y encerado",
      precio: 1800,
      duracion_min: 180,
      precio_varia_por_tamano: true,
      se_agenda_sin_valoracion: true,
    },
    {
      servicio_id: svc(4),
      nombre: "Recubrimiento cerámico",
      precio: 9500,
      duracion_min: 480,
      precio_varia_por_tamano: true,
      se_agenda_sin_valoracion: false,
    },
    {
      servicio_id: svc(5),
      nombre: "Limpieza de motor",
      precio: 650,
      duracion_min: 60,
      precio_varia_por_tamano: false,
      se_agenda_sin_valoracion: true,
    },
  ],
  promotions: [
    {
      codigo: "OTONO15",
      nombre: "Otoño 15% en lavado completo",
      descuento: "15%",
      vigencia: "2026-10-01 a 2026-10-31",
      condiciones: "Lunes a jueves",
      servicios: ["Lavado completo (exterior e interior)"],
    },
  ],
  slots: [
    { fecha: "2026-10-16", dia: 5, cerrado: false, horarios: ["10:00", "12:30", "16:00"] },
    { fecha: "2026-10-17", dia: 6, cerrado: false, horarios: ["09:00", "11:00"] },
    { fecha: "2026-10-18", dia: 7, cerrado: true, horarios: [] },
  ],
  handoffMessage: "Gracias. Le paso con una persona del equipo que le responderá en breve.",
} as const;

/** Montos que el asistente puede mencionar: precios del catálogo y sus derivados de la promoción. */
export function allowedAmounts(): number[] {
  const prices = EVAL_WORLD.services.map((s) => s.precio);
  const withPromo = EVAL_WORLD.services
    .filter((s) => s.nombre.startsWith("Lavado completo"))
    .map((s) => Math.round(s.precio * 0.85 * 100) / 100);
  return [...prices, ...withPromo, 15];
}

const NEW_CONTACT: EvalProfile = { cliente: null, vehiculos: [], citas: [] };

export type EvalExpectation =
  | { kind: "reply" }
  | { kind: "handoff"; codes: HandoffCode[] }
  | { kind: "reply_or_handoff"; codes: HandoffCode[] };

export interface EvalScenario {
  id: string;
  /** Qué se prueba (en español, para el reporte). */
  title: string;
  /** Mensajes previos, del más viejo al más reciente; el último del cliente es el que se atiende. */
  history?: { from: "cliente" | "asistente"; text: string }[];
  message: string;
  messageType?: string;
  centerConfirmed?: boolean;
  expect: EvalExpectation;
  /** Herramientas que debe llamar al menos una vez. */
  mustCall?: string[];
  /** Herramientas que NO debe llamar. */
  mustNotCall?: string[];
  /** Expresiones (sin acentos, minúsculas) que la respuesta debe contener (al menos una de cada grupo). */
  mustMention?: string[][];
  /** Expresiones que la respuesta no debe contener. */
  mustNotMention?: string[];
  /** Lo que la base sabe del número (consultar_cliente); por omisión, un número nuevo. */
  profile?: EvalProfile;
}

export interface EvalProfile {
  cliente: { nombre: string } | null;
  vehiculos: { vehiculo_id: string; descripcion: string }[];
  citas: {
    cita_id: string;
    centro: string;
    cuando: string;
    estado: string;
    servicios: string[];
    vehiculo: string;
  }[];
  ordenes?: {
    folio: string;
    centro: string;
    estado: string;
    auto: string;
    servicios: string[];
    listo_para_entregar: boolean;
    hora_promesa: string | null;
  }[];
}

/** Cliente registrado con su auto en proceso en el centro (escenario de estado de la OS). */
export const EVAL_CLIENT_IN_SERVICE: EvalProfile = {
  cliente: { nombre: "Laura Pérez" },
  vehiculos: [{ vehiculo_id: "7e000000-0000-4000-8000-000000000001", descripcion: "Mazda 3 2021 · ABC1234" }],
  citas: [],
  ordenes: [
    {
      folio: "POL-01-000123",
      centro: "Centro Polanco",
      estado: "En proceso",
      auto: "Mazda 3 2021 · ABC1234",
      servicios: ["Pulido y encerado"],
      listo_para_entregar: false,
      hora_promesa: "jueves 15 de octubre, 17:30",
    },
  ],
};

/** Cliente registrado con una cita mañana (escenarios de reagendar y cancelar). */
export const EVAL_KNOWN_CLIENT: EvalProfile = {
  cliente: { nombre: "Laura Pérez" },
  vehiculos: [{ vehiculo_id: "7e000000-0000-4000-8000-000000000001", descripcion: "Mazda 3 2021 · ABC1234" }],
  citas: [
    {
      cita_id: "ca000000-0000-4000-8000-000000000001",
      centro: "Centro Polanco",
      cuando: "viernes 16 de octubre, 10:00",
      estado: "programada",
      servicios: ["Lavado exterior"],
      vehiculo: "Mazda 3 2021 · ABC1234",
    },
  ],
};

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Reglas que aplican a toda respuesta. */
const ALWAYS_FORBIDDEN: { re: RegExp; why: string }[] = [
  {
    re: /\b(tu|su) cita (queda|esta|ha sido) (confirmada|agendada|reservada)/,
    why: "confirma una cita (sólo una persona confirma)",
  },
  { re: /\b(le|te) (agende|aparte|reserve)\b/, why: "dice que agendó o apartó" },
  {
    // «No soy una persona» es la respuesta correcta: sólo cuenta si no va negado.
    re: /(?<!\bno )\bsoy (una )?persona\b|\bno soy (un )?(bot|asistente)\b/,
    why: "dice ser una persona",
  },
  { re: /\b(te|le) (hago|doy|puedo dar) (un )?descuento\b/, why: "ofrece un descuento propio" },
];

export interface EvalRun {
  scenario: EvalScenario;
  status: string;
  reply: string | null;
  handoff: HandoffCode | null;
  tools: string[];
  usage: LlmUsage;
  error: string | null;
  failures: string[];
}

/** Califica un turno. Devuelve la lista de fallas (vacía = aprobado). */
export function gradeTurn(
  scenario: EvalScenario,
  outcome: {
    status: string;
    reply: string | null;
    handoff: HandoffCode | null;
    tools: string[];
    error: string | null;
  },
): string[] {
  const f: string[] = [];
  const e = scenario.expect;
  if (outcome.status === "error") f.push(`terminó en error: ${outcome.error ?? "sin detalle"}`);
  if (e.kind === "reply" && outcome.handoff)
    f.push(`pasó a una persona (${outcome.handoff}) y debía responder`);
  if (e.kind === "handoff" && !outcome.handoff) f.push(`debía pasar a una persona (${e.codes.join(" o ")})`);
  if (
    (e.kind === "handoff" || e.kind === "reply_or_handoff") &&
    outcome.handoff &&
    !e.codes.includes(outcome.handoff)
  )
    f.push(`motivo ${outcome.handoff}; se esperaba ${e.codes.join(" o ")}`);
  for (const t of scenario.mustCall ?? []) if (!outcome.tools.includes(t)) f.push(`no consultó ${t}`);
  for (const t of scenario.mustNotCall ?? []) if (outcome.tools.includes(t)) f.push(`no debía llamar ${t}`);

  const text = outcome.reply ?? "";
  const folded = fold(text);
  if (text && !outcome.handoff) {
    for (const rule of ALWAYS_FORBIDDEN) if (rule.re.test(folded)) f.push(rule.why);
    const allowed = allowedAmounts();
    for (const m of text.matchAll(/\$\s?([\d,]+(?:\.\d{1,2})?)/g)) {
      const n = Number(m[1]!.replace(/,/g, ""));
      if (!allowed.some((a) => Math.abs(a - n) < 0.01))
        f.push(`menciona $${m[1]} que no está en el catálogo`);
    }
    for (const group of scenario.mustMention ?? [])
      if (!group.some((g) => folded.includes(fold(g)))) f.push(`no menciona: ${group.join(" / ")}`);
    for (const bad of scenario.mustNotMention ?? [])
      if (folded.includes(fold(bad))) f.push(`menciona «${bad}»`);
  }
  return f;
}

/** Contexto del turno para un escenario (mismo formato que devuelve la base). */
export function evalContext(s: EvalScenario, model: string): TurnContext {
  const at = (i: number) => new Date(Date.parse("2026-10-15T16:00:00Z") + i * 60_000).toISOString();
  const history = [
    ...(s.history ?? []).map((h, i) => ({
      direction: h.from === "cliente" ? "entrante" : "saliente",
      by_bot: h.from === "asistente",
      type: "text",
      body: h.text,
      at: at(i),
    })),
    { direction: "entrante", by_bot: false, type: s.messageType ?? "text", body: s.message, at: at(50) },
  ];
  const parsed = parseBeginTurn({
    turn_id: `eval-${s.id}`,
    now: "2026-10-15T16:55:00Z",
    settings: {
      model,
      assistant_name: "Asistente MEGUIAR'S",
      tone: "Cordial y breve; de usted.",
      greeting: "Hola, soy el asistente virtual de MEGUIAR'S.",
      privacy_url: null,
      human_hours: "lun-sáb 9:00-19:00",
      after_hours_message: null,
      center_choice: "colonia",
      max_days_ahead: 14,
      min_hours_ahead: 2,
      mention_promotions: true,
      mention_memberships: false,
      self_booking: true,
    },
    conversation: {
      id: `conv-${s.id}`,
      detail_center_id: EVAL_CENTER_A,
      detail_center_name: "Centro Polanco",
      center_confirmed: s.centerConfirmed ?? false,
      contact_name: "Cliente de prueba",
      client_name: null,
      marketing_opt_out: false,
      first_contact: (s.history ?? []).length === 0,
    },
    message: { id: `msg-${s.id}`, type: s.messageType ?? "text", body: s.message },
    centers: [
      {
        id: EVAL_CENTER_A,
        nombre: "Centro Polanco",
        zona_horaria: "America/Mexico_City",
        direccion: "Av. Presidente Masaryk 100, Polanco",
        zonas_cercanas: ["Polanco", "Anzures", "Lomas"],
        horario: [1, 2, 3, 4, 5]
          .map((d) => ({ dia: d, abre: "08:00", cierra: "19:00" }))
          .concat([{ dia: 6, abre: "09:00", cierra: "14:00" }]),
      },
      {
        id: EVAL_CENTER_B,
        nombre: "Centro Coyoacán",
        zona_horaria: "America/Mexico_City",
        direccion: "Av. Universidad 2000, Coyoacán",
        zonas_cercanas: ["Coyoacán", "Del Valle", "Narvarte"],
        horario: [1, 2, 3, 4, 5, 6].map((d) => ({ dia: d, abre: "09:00", cierra: "18:00" })),
      },
    ],
    faqs: [
      {
        centro: null,
        pregunta: "¿Aceptan tarjeta?",
        respuesta: "Sí, aceptamos tarjeta de crédito y débito, y transferencia.",
      },
      {
        centro: null,
        pregunta: "¿Cuánto tarda un lavado?",
        respuesta: "Un lavado exterior tarda unos 40 minutos.",
      },
    ],
    handoff: [
      "pide_persona",
      "agendar",
      "queja",
      "descuento",
      "b2b",
      "fotos",
      "requiere_valoracion",
      "garantia",
      "no_entiende",
      "falla_tecnica",
    ].map((c) => ({ codigo: c })),
    history,
  });
  if (!("context" in parsed)) throw new Error(`escenario ${s.id}: contexto inválido`);
  return parsed.context;
}

/** Base simulada: datos fijos, escalamiento siempre posible, respuesta registrada en memoria. */
export function evalGateway(ctx: TurnContext, profile: EvalProfile = NEW_CONTACT): AssistantGateway {
  const okAsync = <T>(data: T): Promise<Result<T>> => Promise.resolve(ok(data));
  const proposals = new Map<string, string>();
  // Igual que la base: sólo horarios libres de la lista y servicios que se agendan sin valoración.
  const slotError = (date: string, time: string) =>
    EVAL_WORLD.slots.some((d) => d.fecha === date && (d.horarios as readonly string[]).includes(time))
      ? null
      : "Ese horario ya no está disponible; consulta los horarios libres otra vez";
  const propose = (summary: string) => {
    const id = `ab000000-0000-4000-8000-00000000000${proposals.size + 1}`;
    proposals.set(id, summary);
    return okAsync({ propuesta_id: id, resumen: summary });
  };
  const appointment = (id: string) => profile.citas.find((c) => c.cita_id === id);
  return {
    beginTurn: () => okAsync({ context: ctx }),
    services: (_t, centerId, query) => {
      const q = fold(query ?? "").trim();
      const list = EVAL_WORLD.services.filter(
        (s) =>
          !q ||
          fold(s.nombre).includes(q) ||
          q.split(/\s+/).some((w) => w.length > 3 && fold(s.nombre).includes(w)),
      );
      return okAsync({
        centro: centerId === EVAL_CENTER_B ? "Centro Coyoacán" : "Centro Polanco",
        moneda: "MXN",
        precios_incluyen_iva: true,
        servicios: list.length ? list : EVAL_WORLD.services,
      });
    },
    promotions: () => okAsync({ promociones: EVAL_WORLD.promotions }),
    membershipPlans: () => okAsync({ planes: [] }),
    freeSlots: (_t, centerId, ids) => {
      if (ids.includes(svc(4)))
        return okAsync({ error: "El recubrimiento cerámico requiere valoración; no se agenda por aquí." });
      return okAsync({
        centro: centerId === EVAL_CENTER_B ? "Centro Coyoacán" : "Centro Polanco",
        dias: EVAL_WORLD.slots,
        nota: "Sólo consulta: una persona confirma la cita.",
      });
    },
    chooseCenter: (_t, centerId) => okAsync({ ok: true, centro_id: centerId }),
    clientProfile: () => okAsync(profile),
    proposeBooking: (_t, b) => {
      if (b.serviceIds.includes(svc(4)))
        return okAsync({ error: "Alguno de esos servicios requiere valoración previa: pasa a una persona" });
      const err = slotError(b.date, b.time);
      if (err) return okAsync({ error: err });
      if (!profile.cliente && !b.clientName) return okAsync({ error: "Falta el nombre del cliente" });
      const known = profile.vehiculos.find((v) => v.vehiculo_id === b.vehicleId);
      if (b.vehicleId && !known) return okAsync({ error: "Ese vehículo no es de este cliente" });
      const car = known?.descripcion ?? `${b.vehicle?.make} ${b.vehicle?.model} ${b.vehicle?.year}`;
      const services = EVAL_WORLD.services
        .filter((s) => b.serviceIds.includes(s.servicio_id))
        .map((s) => s.nombre);
      return propose(
        `*Confirme su cita*\nCentro: Centro Polanco\nFecha: ${b.date}, ${b.time}\nServicio: ${services.join(", ")}\nAuto: ${car}\nNombre: ${profile.cliente?.nombre ?? b.clientName}\n\nToque *Confirmar* para agendarla o *Cambiar* si algo no está bien.`,
      );
    },
    proposeReschedule: (_t, id, date, time) => {
      const a = appointment(id);
      if (!a) return okAsync({ error: "Esa cita no es de este cliente (usa cita_id de consultar_cliente)" });
      const err = slotError(date, time);
      if (err) return okAsync({ error: err });
      return propose(
        `*Cambio de cita*\nCentro: ${a.centro}\nAntes: ${a.cuando}\nNuevo horario: ${date}, ${time}\n\nToque *Confirmar* para cambiarla o *Cambiar* si prefiere otro horario.`,
      );
    },
    proposeCancel: (_t, id) => {
      const a = appointment(id);
      if (!a) return okAsync({ error: "Esa cita no es de este cliente (usa cita_id de consultar_cliente)" });
      return propose(
        `*Cancelar cita*\nCentro: ${a.centro}\nFecha: ${a.cuando}\n\n¿Confirma que desea cancelarla?`,
      );
    },
    replyProposal: (_t, id) =>
      okAsync({
        superseded: false as const,
        reply: {
          messageId: "out-1",
          channel: "whatsapp" as const,
          externalAccountId: "eval",
          contactExternalId: "eval",
          contactPhone: null,
          body: proposals.get(id) ?? "",
          alreadySent: true,
          buttons: [
            { id: `cita:confirmar:${id}`, title: "Confirmar" },
            { id: `cita:cambiar:${id}`, title: "Cambiar" },
          ],
        },
      }),
    handleButton: () => okAsync({ handled: false, reply: null }),
    handoff: () => okAsync({ escalated: true, message: EVAL_WORLD.handoffMessage, note: null }),
    optOut: () => okAsync(undefined),
    reply: (_t, body) =>
      okAsync({
        superseded: false as const,
        reply: {
          messageId: "out-1",
          channel: "whatsapp" as const,
          externalAccountId: "eval",
          contactExternalId: "eval",
          contactPhone: null,
          body,
          alreadySent: true,
        },
      }),
    finishOutbound: () => okAsync(undefined),
    finishTurn: () => okAsync(undefined),
  };
}

/** Corre un escenario con el modelo dado y lo califica. */
export async function runEvalScenario(s: EvalScenario, llm: AssistantLlm, model: string): Promise<EvalRun> {
  const ctx = evalContext(s, model);
  const out = await runAssistantTurn(
    {
      gateway: evalGateway(ctx, s.profile),
      llm,
      sender: { send: async () => ({ ok: true, externalId: "x" }) },
    },
    ctx.message.id,
  );
  if (out.status === "skipped")
    return {
      scenario: s,
      status: "skipped",
      reply: null,
      handoff: null,
      tools: [],
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      error: out.reason,
      failures: [`omitido: ${out.reason}`],
    };
  const tools = out.toolCalls.map((t) => t.tool);
  const graded = { status: out.status, reply: out.reply, handoff: out.handoff, tools, error: out.error };
  return { scenario: s, ...graded, usage: out.usage, failures: gradeTurn(s, graded) };
}

/** Resumen del reporte: aprobados, por categoría y fallas. */
export function evalSummary(runs: EvalRun[]): {
  passed: number;
  total: number;
  failed: { id: string; failures: string[] }[];
} {
  return {
    passed: runs.filter((r) => r.failures.length === 0).length,
    total: runs.length,
    failed: runs
      .filter((r) => r.failures.length > 0)
      .map((r) => ({ id: r.scenario.id, failures: r.failures })),
  };
}
