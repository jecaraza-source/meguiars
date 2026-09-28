import { B2B_PAYMENT_METHODS, DOCUMENT_NOTES_MAX, EXPORT_MAX_DAYS, EXTERNAL_REF_MAX } from "@meguiars/domain";
import { z } from "zod";
import { moneySchema } from "./catalog";
import { changeReasonSchema } from "./centers";

/**
 * Validación de cuentas por cobrar B2B (AF5), compartida por web (server
 * actions) y móvil. La base vuelve a validar permisos, periodo, OS del periodo,
 * cuota devengada, saldos por documento y por cuenta.
 */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (AAAA-MM-DD)");
const optionalDate = z.preprocess(blankToUndefined, isoDate.optional());
const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, `Usa como máximo ${max} caracteres`).optional());
const positiveMoney = moneySchema.refine((n) => n > 0, "El importe debe ser mayor que 0");

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export const billingBatchSchema = z
  .object({
    accountId: z.uuid(),
    requestId: z.uuid(),
    periodFrom: isoDate,
    periodTo: isoDate,
    orderIds: z.preprocess(
      (v) => (Array.isArray(v) && v.length === 0 ? undefined : v),
      z.array(z.uuid()).optional(),
    ),
    feeAmount: z.preprocess((v) => blankToUndefined(v) ?? 0, moneySchema),
    dueOn: optionalDate,
    externalRef: optionalText(EXTERNAL_REF_MAX),
    externalInvoicedOn: optionalDate,
    notes: optionalText(DOCUMENT_NOTES_MAX),
  })
  .superRefine((v, ctx) => {
    if (v.periodTo < v.periodFrom)
      ctx.addIssue({ code: "custom", path: ["periodTo"], message: "El periodo va del inicio al fin" });
    if (v.externalInvoicedOn && !v.externalRef)
      ctx.addIssue({
        code: "custom",
        path: ["externalRef"],
        message: "La fecha de la factura externa requiere su referencia",
      });
    if (v.dueOn && v.dueOn < v.periodFrom)
      ctx.addIssue({
        code: "custom",
        path: ["dueOn"],
        message: "La fecha compromiso es posterior al periodo",
      });
  });

export const updateBillingBatchSchema = z
  .object({
    invoiceId: z.uuid(),
    externalRef: optionalText(EXTERNAL_REF_MAX),
    externalInvoicedOn: optionalDate,
    dueOn: isoDate,
    reason: changeReasonSchema,
  })
  .refine((v) => !v.externalInvoicedOn || v.externalRef, {
    path: ["externalRef"],
    message: "La fecha de la factura externa requiere su referencia",
  });

export const paymentAllocationSchema = z.object({
  invoiceId: z.uuid(),
  amount: positiveMoney,
});

export const registerB2bPaymentSchema = z
  .object({
    accountId: z.uuid(),
    requestId: z.uuid(),
    amount: positiveMoney,
    method: z.enum(B2B_PAYMENT_METHODS, { message: "Elige la forma de pago" }),
    reference: optionalText(120),
    paidOn: optionalDate,
    allocations: z.preprocess(
      (v) => (Array.isArray(v) && v.length === 0 ? undefined : v),
      z.array(paymentAllocationSchema).optional(),
    ),
  })
  .refine(
    (v) =>
      !v.allocations ||
      Math.round(v.allocations.reduce((s, a) => s + a.amount, 0) * 100) <= Math.round(v.amount * 100),
    { path: ["allocations"], message: "Lo aplicado no puede superar el pago" },
  );

export const allocateB2bPaymentSchema = z.object({
  paymentId: z.uuid(),
  allocations: z.preprocess(
    (v) => (Array.isArray(v) && v.length === 0 ? undefined : v),
    z.array(paymentAllocationSchema).optional(),
  ),
});

export const receivablesExportSchema = z
  .object({ from: isoDate, to: isoDate })
  .refine((v) => v.to >= v.from && daysBetween(v.from, v.to) <= EXPORT_MAX_DAYS, {
    path: ["to"],
    message: "Rango inválido (máximo un año)",
  });
