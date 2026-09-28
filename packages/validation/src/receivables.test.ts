import { describe, expect, it } from "vitest";
import {
  allocateB2bPaymentSchema,
  billingBatchSchema,
  receivablesExportSchema,
  registerB2bPaymentSchema,
  updateBillingBatchSchema,
} from "./receivables";

const ID = "00000000-0000-4000-8000-000000000001";
const ID2 = "00000000-0000-4000-8000-000000000002";

describe("cuentas por cobrar B2B", () => {
  it("documento: periodo, cuota en texto y OS opcionales (vacío = todas las del periodo)", () => {
    expect(
      billingBatchSchema.parse({
        accountId: ID,
        requestId: ID,
        periodFrom: "2026-09-01",
        periodTo: "2026-09-15",
        orderIds: [],
        feeAmount: "",
        dueOn: "",
        externalRef: " ",
        externalInvoicedOn: "",
        notes: "",
      }),
    ).toEqual({
      accountId: ID,
      requestId: ID,
      periodFrom: "2026-09-01",
      periodTo: "2026-09-15",
      orderIds: undefined,
      feeAmount: 0,
      dueOn: undefined,
      externalRef: undefined,
      externalInvoicedOn: undefined,
      notes: undefined,
    });
    const base = {
      accountId: ID,
      requestId: ID,
      periodFrom: "2026-09-10",
      periodTo: "2026-09-01",
      feeAmount: 0,
    };
    expect(billingBatchSchema.safeParse(base).success).toBe(false);
    expect(
      billingBatchSchema.safeParse({ ...base, periodTo: "2026-09-30", externalInvoicedOn: "2026-09-30" })
        .success,
    ).toBe(false);
    expect(
      billingBatchSchema.safeParse({ ...base, periodTo: "2026-09-30", externalRef: "x".repeat(81) }).success,
    ).toBe(false);
    expect(
      billingBatchSchema.parse({
        ...base,
        periodTo: "2026-09-30",
        externalRef: " FAC-1 ",
        feeAmount: "$1,000",
      }),
    ).toMatchObject({ externalRef: "FAC-1", feeAmount: 1000 });
  });

  it("factura externa y compromiso: motivo obligatorio; la fecha de factura requiere referencia", () => {
    const base = { invoiceId: ID, dueOn: "2026-10-30", reason: "Acuerdo con compras" };
    expect(
      updateBillingBatchSchema.parse({ ...base, externalRef: "", externalInvoicedOn: "" }),
    ).toMatchObject({
      externalRef: undefined,
    });
    expect(updateBillingBatchSchema.safeParse({ ...base, reason: "" }).success).toBe(false);
    expect(updateBillingBatchSchema.safeParse({ ...base, externalInvoicedOn: "2026-10-01" }).success).toBe(
      false,
    );
  });

  it("pago: importe positivo y lo aplicado no supera el pago", () => {
    const base = { accountId: ID, requestId: ID, amount: "1,200", method: "transferencia" };
    expect(registerB2bPaymentSchema.parse({ ...base, allocations: [] })).toMatchObject({
      amount: 1200,
      allocations: undefined,
    });
    expect(
      registerB2bPaymentSchema.safeParse({
        ...base,
        allocations: [
          { invoiceId: ID, amount: "1000" },
          { invoiceId: ID2, amount: "200.01" },
        ],
      }).success,
    ).toBe(false);
    expect(
      registerB2bPaymentSchema.safeParse({ ...base, allocations: [{ invoiceId: ID, amount: 0 }] }).success,
    ).toBe(false);
    expect(registerB2bPaymentSchema.safeParse({ ...base, method: "bitcoin" }).success).toBe(false);
    expect(registerB2bPaymentSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(allocateB2bPaymentSchema.parse({ paymentId: ID, allocations: [] })).toEqual({
      paymentId: ID,
      allocations: undefined,
    });
  });

  it("export: rango válido de hasta un año", () => {
    expect(receivablesExportSchema.safeParse({ from: "2026-01-01", to: "2026-12-31" }).success).toBe(true);
    expect(receivablesExportSchema.safeParse({ from: "2025-01-01", to: "2026-12-31" }).success).toBe(false);
    expect(receivablesExportSchema.safeParse({ from: "2026-02-01", to: "2026-01-01" }).success).toBe(false);
  });
});
