import { describe, expect, it } from "vitest";
import {
  expenseCategorySchema,
  expenseFilterSchema,
  expenseFormSchema,
  expenseReasonSchema,
  receiptMetaSchema,
  thresholdSchema,
  updateExpenseSchema,
  vendorSchema,
} from "./expenses";

const ID = "00000000-0000-4000-8000-000000000001";

describe("egresos", () => {
  it("formulario: importe en texto, proveedor opcional, fecha del centro", () => {
    expect(
      expenseFormSchema.parse({
        categoryId: ID,
        vendorId: "",
        concept: " Renta ",
        amount: "$18,000",
        paymentMethod: "transferencia",
        paidOn: "2026-09-27",
        reference: "",
        notes: "",
      }),
    ).toEqual({
      categoryId: ID,
      vendorId: undefined,
      concept: "Renta",
      amount: 18000,
      paymentMethod: "transferencia",
      paidOn: "2026-09-27",
      reference: undefined,
      notes: undefined,
    });
  });

  it("rechaza importe 0, forma de pago desconocida y concepto corto", () => {
    const base = {
      categoryId: ID,
      concept: "Renta",
      amount: 10,
      paymentMethod: "efectivo",
      paidOn: "2026-09-27",
    };
    expect(expenseFormSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(expenseFormSchema.safeParse({ ...base, paymentMethod: "bitcoin" }).success).toBe(false);
    expect(expenseFormSchema.safeParse({ ...base, concept: "x" }).success).toBe(false);
  });

  it("editar, rechazar y anular exigen motivo", () => {
    expect(
      updateExpenseSchema.safeParse({
        expenseId: ID,
        version: 2,
        categoryId: ID,
        concept: "Renta",
        amount: 10,
        paymentMethod: "efectivo",
        paidOn: "2026-09-27",
        reason: "",
      }).success,
    ).toBe(false);
    expect(expenseReasonSchema.safeParse({ expenseId: ID, version: 1, reason: "no" }).success).toBe(false);
  });

  it("comprobante: foto o PDF de hasta 10 MB", () => {
    expect(receiptMetaSchema.safeParse({ contentType: "application/pdf", sizeBytes: 1000 }).success).toBe(
      true,
    );
    expect(receiptMetaSchema.safeParse({ contentType: "image/gif", sizeBytes: 1000 }).success).toBe(false);
    expect(
      receiptMetaSchema.safeParse({ contentType: "image/jpeg", sizeBytes: 11 * 1024 * 1024 }).success,
    ).toBe(false);
  });

  it("filtros, proveedor, categoría y umbral", () => {
    expect(
      expenseFilterSchema.safeParse({ detailCenterIds: [ID], from: "2026-09-28", to: "2026-09-27" }).success,
    ).toBe(false);
    expect(
      vendorSchema.parse({
        detailCenterId: ID,
        name: "Químicos",
        rfc: "qce010101ab1",
        phone: "55 1111 2222",
        active: true,
      }),
    ).toMatchObject({ rfc: "QCE010101AB1", phone: "+525511112222" });
    expect(
      expenseCategorySchema.safeParse({
        organizationId: ID,
        code: "Fletes",
        name: "Fletes",
        pnlGroup: "impuestos",
        position: 10,
        active: true,
        reason: "Nueva",
      }).success,
    ).toBe(false);
    expect(
      thresholdSchema.parse({ detailCenterId: ID, threshold: "", reason: "Sin umbral" }).threshold,
    ).toBeUndefined();
  });
});
