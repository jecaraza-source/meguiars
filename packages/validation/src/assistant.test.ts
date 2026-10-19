import { describe, expect, it } from "vitest";
import {
  assistantFaqSchema,
  assistantRemindersSchema,
  assistantSettingsSchema,
  centerPublicInfoSchema,
  handoffRuleSchema,
  hoursFromForm,
} from "./assistant";

const ORG = "0e000000-0000-4000-8000-000000000001";
const base = {
  organizationId: ORG,
  version: "1",
  mode: "prueba",
  model: "claude-opus-5-5",
  assistantName: "Asistente MEGUIAR'S",
  tone: "Cordial y breve",
  greeting: "",
  privacyUrl: "",
  humanHours: "lun-sáb 9-19",
  afterHoursMessage: "",
  centerChoice: "colonia",
  maxDaysAhead: "14",
  minHoursAhead: "2",
  mentionPromotions: "on",
  mentionMemberships: undefined,
  testNumbers: "+52 55 1111 2222\n5511112222, 5215533334444",
  reason: "Modo prueba",
};

describe("asistente: validación", () => {
  it("normaliza los números de prueba y los textos vacíos", () => {
    const r = assistantSettingsSchema.parse(base);
    expect(r.testNumbers).toEqual(["525511112222", "5511112222", "5215533334444"]);
    expect(r.greeting).toBeNull();
    expect(r.mentionPromotions).toBe(true);
    expect(r.mentionMemberships).toBe(false);
  });

  it("rechaza modo prueba sin números, números inválidos, modelos no permitidos y URL sin https", () => {
    expect(assistantSettingsSchema.safeParse({ ...base, testNumbers: "" }).success).toBe(false);
    expect(assistantSettingsSchema.safeParse({ ...base, testNumbers: "123" }).success).toBe(false);
    expect(assistantSettingsSchema.safeParse({ ...base, model: "gpt-5" }).success).toBe(false);
    expect(assistantSettingsSchema.safeParse({ ...base, privacyUrl: "http://x.mx" }).success).toBe(false);
    expect(assistantSettingsSchema.safeParse({ ...base, maxDaysAhead: "90" }).success).toBe(false);
    expect(assistantSettingsSchema.safeParse({ ...base, mode: "apagado", testNumbers: "" }).success).toBe(
      true,
    );
  });

  it("respuestas aprobadas y reglas de escalamiento", () => {
    expect(
      assistantFaqSchema.parse({
        organizationId: ORG,
        id: "",
        version: "",
        detailCenterId: "",
        question: "¿Tarjeta?",
        answer: "Sí",
        position: "",
        active: "on",
        reason: "Alta",
      }),
    ).toMatchObject({ id: null, detailCenterId: null, position: 100, active: true });
    expect(
      handoffRuleSchema.safeParse({
        organizationId: ORG,
        code: "pide_persona",
        version: "1",
        active: undefined,
        assignTo: "",
        message: "",
        reason: "Quitar",
      }).success,
    ).toBe(false);
    expect(
      handoffRuleSchema.safeParse({
        organizationId: ORG,
        code: "descuento",
        version: "1",
        active: undefined,
        assignTo: "",
        message: "",
        reason: "Quitar",
      }).success,
    ).toBe(true);
  });

  it("datos del centro: zonas, horario por día y cierre después de abrir", () => {
    const form = new Map([
      ["opens_1", "08:00"],
      ["closes_1", "19:00"],
      ["opens_6", "09:00"],
      ["closes_6", ""],
    ]);
    const { hours, errors } = hoursFromForm((k) => form.get(k) ?? null);
    expect(hours).toEqual([{ weekday: 1, opens: "08:00", closes: "19:00" }]);
    expect(errors).toHaveLength(1);
    const ok = centerPublicInfoSchema.parse({
      detailCenterId: ORG,
      version: "",
      address: "Av. Masaryk 100",
      phone: "55 1234 5678",
      mapsUrl: "",
      directions: "",
      nearbyZones: "Polanco, Anzures\nLomas",
      handoffUserId: "",
      hours,
      reason: "Datos",
    });
    expect(ok.nearbyZones).toEqual(["Polanco", "Anzures", "Lomas"]);
    expect(
      centerPublicInfoSchema.safeParse({
        ...ok,
        version: "",
        hours: [{ weekday: 2, opens: "19:00", closes: "08:00" }],
      }).success,
    ).toBe(false);
  });
});

describe("recordatorios de cita", () => {
  const form = {
    organizationId: ORG,
    version: "3",
    enabled: "on",
    templateId: "",
    hours: "24",
    reason: "Encender",
  };
  it("encender exige plantilla; las horas van de 2 a 72", () => {
    expect(assistantRemindersSchema.safeParse(form).success).toBe(false);
    const ok = assistantRemindersSchema.parse({
      ...form,
      templateId: "7e000000-0000-4000-8000-000000000001",
    });
    expect(ok).toMatchObject({ enabled: true, hours: 24, version: 3 });
    expect(assistantRemindersSchema.safeParse({ ...form, enabled: null, hours: "1" }).success).toBe(false);
    expect(assistantRemindersSchema.parse({ ...form, enabled: null })).toMatchObject({
      enabled: false,
      templateId: null,
    });
  });
});
