import { describe, expect, it } from "vitest";
import {
  addQuoteDiscountSchema,
  createLeadSchema,
  createQuoteSchema,
  leadStageSchema,
  mergeClientsSchema,
  quoteStatusSchema,
  segmentFilterSchema,
} from "./commercial";

const C = "11111111-1111-4111-8111-111111111111";
const R = "22222222-2222-4222-8222-222222222222";
const S = "33333333-3333-4333-8333-333333333333";

describe("prospecto", () => {
  it("normaliza teléfono, deduplica consentimiento y pide un medio de contacto", () => {
    const ok = createLeadSchema.parse({
      detailCenterId: C,
      requestId: R,
      fullName: "  Ana   Ruiz ",
      source: "instagram",
      phone: "55 1111 2222",
      socialHandle: "@ana",
      interestServiceIds: [S, S],
      consentChannels: ["whatsapp", "whatsapp"],
      estimatedValue: "",
    });
    expect(ok).toMatchObject({
      fullName: "Ana Ruiz",
      phone: "+525511112222",
      interestServiceIds: [S],
      consentChannels: ["whatsapp"],
      estimatedValue: undefined,
    });
    const noContact = createLeadSchema.safeParse({
      detailCenterId: C,
      requestId: R,
      fullName: "Ana",
      source: "facebook",
    });
    expect(noContact.success).toBe(false);
    expect(noContact.error?.issues[0]?.message).toMatch(/teléfono, email o usuario/);
  });
  it("una recomendación indica quién recomendó; el canal es obligatorio", () => {
    expect(
      createLeadSchema.safeParse({
        detailCenterId: C,
        requestId: R,
        fullName: "Ana",
        source: "recomendacion",
        phone: "5511112222",
      }).success,
    ).toBe(false);
    expect(
      createLeadSchema.safeParse({
        detailCenterId: C,
        requestId: R,
        fullName: "Ana",
        source: "recomendacion",
        sourceDetail: "José Pérez",
        phone: "5511112222",
      }).success,
    ).toBe(true);
    expect(
      createLeadSchema.safeParse({ detailCenterId: C, requestId: R, fullName: "Ana", phone: "5511112222" })
        .success,
    ).toBe(false);
  });
});

describe("cotización", () => {
  it("exige prospecto o cliente, líneas sin repetir y vigencia acotada", () => {
    const base = { detailCenterId: C, requestId: R, items: [{ serviceId: S, quantity: "2" }] };
    expect(createQuoteSchema.safeParse(base).success).toBe(false);
    expect(createQuoteSchema.parse({ ...base, clientId: C }).items).toEqual([{ serviceId: S, quantity: 2 }]);
    expect(
      createQuoteSchema.safeParse({
        ...base,
        clientId: C,
        items: [
          { serviceId: S, quantity: 1 },
          { serviceId: S, quantity: 1 },
        ],
      }).success,
    ).toBe(false);
    expect(createQuoteSchema.safeParse({ ...base, clientId: C, validDays: 91 }).success).toBe(false);
  });
  it("descuento con motivo (mismo formulario que la OS)", () => {
    expect(
      addQuoteDiscountSchema.safeParse({
        quoteId: C,
        version: 1,
        kind: "percent",
        value: "120",
        reason: "Promo",
      }).success,
    ).toBe(false);
    expect(
      addQuoteDiscountSchema.safeParse({
        quoteId: C,
        version: 1,
        kind: "amount",
        value: "100",
        reason: "Cliente frecuente",
      }).success,
    ).toBe(true);
  });
  it("rechazar o cancelar pide motivo", () => {
    expect(quoteStatusSchema.safeParse({ quoteId: C, version: 1, status: "rechazada" }).success).toBe(false);
    expect(quoteStatusSchema.safeParse({ quoteId: C, version: 1, status: "enviada" }).success).toBe(true);
  });
});

describe("fusión, segmentos y embudo", () => {
  it("fusión: dos clientes distintos y motivo", () => {
    expect(
      mergeClientsSchema.safeParse({ keepClientId: C, mergeClientId: C, reason: "Mismo teléfono" }).success,
    ).toBe(false);
    expect(
      mergeClientsSchema.safeParse({ keepClientId: C, mergeClientId: R, reason: "Mismo teléfono" }).success,
    ).toBe(true);
  });
  it("segmento: rangos coherentes y canal válido", () => {
    expect(segmentFilterSchema.parse({ serviceIds: S, minSpend: "1000", consentChannel: "" })).toMatchObject({
      serviceIds: [S],
      minSpend: 1000,
      consentChannel: undefined,
    });
    expect(segmentFilterSchema.safeParse({ minSpend: "2000", maxSpend: "100" }).success).toBe(false);
    expect(segmentFilterSchema.safeParse({ consentChannel: "fax" }).success).toBe(false);
  });
  it("etapa: clave en minúsculas y posición de etapa abierta", () => {
    expect(
      leadStageSchema.parse({
        organizationId: C,
        code: "Visita_Agendada",
        name: "Visita",
        position: "6",
        milestone: "",
        active: "on",
        reason: "Nueva etapa",
      }),
    ).toMatchObject({ code: "visita_agendada", position: 6, milestone: null, active: true });
    expect(
      leadStageSchema.safeParse({
        organizationId: C,
        code: "x",
        name: "X",
        position: 90,
        active: true,
        reason: "abc",
      }).success,
    ).toBe(false);
  });
});
