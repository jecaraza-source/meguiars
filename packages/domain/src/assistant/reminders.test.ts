import { describe, expect, it } from "vitest";
import type { WhatsappTemplate } from "../inbox";
import { ok } from "../result";
import { REMINDER_RULES, reminderTemplateIssues, runReminders, type PreparedReminder } from "./reminders";

const reminder = (id: string, over: Partial<PreparedReminder> = {}): PreparedReminder => ({
  messageId: `msg-${id}`,
  externalAccountId: "1234567890",
  contactExternalId: "5215512345678",
  contactPhone: "+525512345678",
  body: "Hola Laura, le recordamos su cita…",
  alreadySent: false,
  templateName: "recordatorio_cita",
  templateLanguage: "es_MX",
  templateParams: ["Laura", "martes 20 de octubre, 10:00", "Centro Polanco"],
  buttonPayloads: [`recordatorio:confirmar:${id}`, `recordatorio:reagendar:${id}`],
  ...over,
});

describe("recordatorios de cita", () => {
  it("envía los pendientes, registra el resultado y sigue si uno falla", async () => {
    const finished: string[] = [];
    const run = await runReminders({
      gateway: {
        due: async () => ok(["a1", "a2", "a3", "a4"]),
        prepare: async (id) =>
          id === "a3" ? ok(null) : id === "a4" ? ok(reminder(id, { alreadySent: true })) : ok(reminder(id)),
        finishOutbound: async (m, r) => {
          finished.push(`${m}:${r.ok ? "ok" : "fail"}`);
          return ok(undefined);
        },
      },
      sender: {
        send: async (r) =>
          r.messageId === "msg-a2"
            ? { ok: false, error: "(#132001) plantilla" }
            : { ok: true, externalId: "wamid" },
      },
    });
    expect(run).toEqual({ due: 4, sent: 1, failed: 1, skipped: 2, errors: ["a2: (#132001) plantilla"] });
    expect(finished).toEqual(["msg-a1:ok", "msg-a2:fail"]);
  });

  it("qué plantilla sirve: utilidad aprobada con 3 datos y 2 botones", () => {
    const t: WhatsappTemplate = {
      id: "t",
      name: "recordatorio_cita",
      language: "es_MX",
      category: "UTILITY",
      status: "APPROVED",
      bodyText: "Hola {{1}} {{2}} {{3}}",
      paramCount: REMINDER_RULES.paramCount,
      quickReplyCount: REMINDER_RULES.quickReplies,
      syncedAt: "2026-10-19T00:00:00Z",
    };
    expect(reminderTemplateIssues(t)).toEqual([]);
    expect(
      reminderTemplateIssues({ ...t, category: "MARKETING", quickReplyCount: 0, status: "PENDING" }),
    ).toEqual(["no está aprobada por Meta", "no es de utilidad", "necesita 2 botones de respuesta rápida"]);
  });
});
