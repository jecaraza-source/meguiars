import { describe, expect, it } from "vitest";
import {
  paymentFormSchema,
  paymentRangeSchema,
  registerPaymentSchema,
  reversePaymentSchema,
} from "./payments";

const ID = "00000000-0000-4000-8000-000000000001";

describe("cobranza", () => {
  it("formulario: importes en texto, pago mixto, efectivo recibido y notas", () => {
    expect(
      paymentFormSchema.parse({
        tenders: [
          { method: "efectivo", amount: "1,000", reference: "" },
          { method: "transferencia", amount: "$500.50", reference: " SPEI-1 " },
        ],
        cashReceived: "1200",
        notes: "",
      }),
    ).toEqual({
      tenders: [
        { method: "efectivo", amount: 1000, reference: undefined },
        { method: "transferencia", amount: 500.5, reference: "SPEI-1" },
      ],
      cashReceived: 1200,
      notes: undefined,
    });
  });

  it("rechaza forma desconocida, importe 0, transferencia sin referencia y efectivo insuficiente", () => {
    expect(paymentFormSchema.safeParse({ tenders: [{ method: "cripto", amount: 1 }] }).success).toBe(false);
    expect(paymentFormSchema.safeParse({ tenders: [{ method: "tarjeta", amount: "0" }] }).success).toBe(
      false,
    );
    expect(paymentFormSchema.safeParse({ tenders: [{ method: "transferencia", amount: 10 }] }).success).toBe(
      false,
    );
    expect(paymentFormSchema.safeParse({ tenders: [] }).success).toBe(false);
    expect(
      paymentFormSchema.safeParse({ tenders: [{ method: "efectivo", amount: 300 }], cashReceived: "200" })
        .success,
    ).toBe(false);
    expect(
      paymentFormSchema.safeParse({ tenders: [{ method: "tarjeta", amount: 300 }], cashReceived: "400" })
        .success,
    ).toBe(false);
  });

  it("comando: OS, versión y solicitud (idempotencia)", () => {
    expect(
      registerPaymentSchema.safeParse({
        orderId: ID,
        version: 3,
        requestId: ID,
        tenders: [{ method: "credito_b2b", amount: 250 }],
      }).success,
    ).toBe(true);
    expect(
      registerPaymentSchema.safeParse({
        orderId: ID,
        version: 3,
        tenders: [{ method: "tarjeta", amount: 1 }],
      }).success,
    ).toBe(false);
  });

  it("reverso con motivo y rango válido", () => {
    expect(reversePaymentSchema.safeParse({ paymentId: ID, reason: " " }).success).toBe(false);
    expect(reversePaymentSchema.parse({ paymentId: ID, reason: " Reembolso " }).reason).toBe("Reembolso");
    expect(
      paymentRangeSchema.safeParse({ detailCenterIds: [ID], from: "2026-09-28", to: "2026-09-27" }).success,
    ).toBe(false);
  });
});
