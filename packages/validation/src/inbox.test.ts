import { describe, expect, it } from "vitest";
import {
  channelAccountSchema,
  conversationHistorySchema,
  conversationLeadSchema,
  sendMessageSchema,
} from "./inbox";

const U = "11111111-1111-4111-8111-111111111111";

describe("bandeja", () => {
  it("cuenta oficial: identificador numérico de Meta, canal válido y motivo", () => {
    const ok = channelAccountSchema.parse({
      organizationId: U,
      detailCenterId: U,
      channel: "whatsapp",
      externalAccountId: " 106540352242922 ",
      label: "WhatsApp CDMX",
      active: "on",
      reason: "Alta del número",
    });
    expect(ok).toMatchObject({ externalAccountId: "106540352242922", active: true });
    expect(ok.id).toBeUndefined();
    expect(
      channelAccountSchema.safeParse({ ...ok, externalAccountId: "EAAG-token-pegado-por-error" }).success,
    ).toBe(false);
    expect(channelAccountSchema.safeParse({ ...ok, channel: "tiktok" }).success).toBe(false);
  });
  it("mensaje: texto no vacío y dentro del límite", () => {
    expect(sendMessageSchema.safeParse({ conversationId: U, requestId: U, body: "   " }).success).toBe(false);
    expect(
      sendMessageSchema.safeParse({ conversationId: U, requestId: U, body: "x".repeat(4097) }).success,
    ).toBe(false);
    expect(sendMessageSchema.parse({ conversationId: U, requestId: U, body: " Hola " }).body).toBe("Hola");
  });
  it("prospecto desde la conversación: nombre normalizado y @usuario opcional", () => {
    expect(
      conversationLeadSchema.parse({
        conversationId: U,
        version: "2",
        requestId: U,
        fullName: " Ana  Ruiz ",
        socialHandle: "",
        interestServiceIds: U,
      }),
    ).toMatchObject({ fullName: "Ana Ruiz", socialHandle: undefined, interestServiceIds: [U], version: 2 });
  });
});

describe("historial de conversaciones", () => {
  it("acepta filtros vacíos y teléfonos en cualquier formato", () => {
    expect(conversationHistorySchema.parse({ client: " ", phone: "", from: "", to: "" })).toEqual({
      client: undefined,
      phone: undefined,
      channel: undefined,
      status: undefined,
      from: undefined,
      to: undefined,
    });
    expect(conversationHistorySchema.parse({ phone: "+52 (55) 1111-2222" }).phone).toBe("+52 (55) 1111-2222");
  });

  it("rechaza teléfonos cortos o con letras, fechas inválidas y rangos al revés", () => {
    expect(conversationHistorySchema.safeParse({ phone: "123" }).success).toBe(false);
    expect(conversationHistorySchema.safeParse({ phone: "55abc1234" }).success).toBe(false);
    expect(conversationHistorySchema.safeParse({ from: "18/10/2026" }).success).toBe(false);
    expect(conversationHistorySchema.safeParse({ from: "2026-10-18", to: "2026-10-01" }).success).toBe(false);
    expect(conversationHistorySchema.safeParse({ channel: "sms" }).success).toBe(false);
  });
});
