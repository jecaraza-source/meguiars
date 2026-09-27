import {
  PAYMENT_METHOD_RULES,
  PAYMENT_METHODS,
  PAYMENT_NOTES_MAX,
  PAYMENT_REFERENCE_MAX,
  REVERSAL_REASON_MAX,
  REVERSAL_REASON_MIN,
} from "@meguiars/domain";
import { z } from "zod";
import { dayStringSchema } from "./agenda";
import { moneySchema } from "./catalog";

/**
 * Validación de cobranza, compartida por web (server actions) y móvil. Los
 * formularios envían texto; aquí se convierte a números. La base vuelve a
 * validar todo (saldo, reglas B2B y de membresía) y calcula los importes.
 */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const paymentMethodSchema = z.enum(PAYMENT_METHODS, { message: "Elige la forma de pago" });

const positiveMoney = moneySchema.refine((n) => n > 0, "Debe ser mayor que 0");

export const tenderSchema = z
  .object({
    method: paymentMethodSchema,
    amount: positiveMoney,
    reference: z.preprocess(
      blankToUndefined,
      z
        .string()
        .trim()
        .max(PAYMENT_REFERENCE_MAX, `Usa como máximo ${PAYMENT_REFERENCE_MAX} caracteres`)
        .optional(),
    ),
  })
  .refine((t) => !PAYMENT_METHOD_RULES[t.method].requiresReference || t.reference !== undefined, {
    message: "Captura la referencia",
    path: ["reference"],
  });

const tendersSchema = z
  .array(tenderSchema)
  .min(1, "Indica al menos una forma de pago")
  .max(5, "Máximo 5 formas de pago");

const cashReceivedSchema = z.preprocess(blankToUndefined, positiveMoney.optional());
const notesSchema = z.preprocess(
  blankToUndefined,
  z.string().trim().max(PAYMENT_NOTES_MAX, `Usa como máximo ${PAYMENT_NOTES_MAX} caracteres`).optional(),
);

/** Efectivo recibido: sólo con efectivo y al menos lo cobrado en efectivo. */
const cashCovers = (v: {
  tenders: { method: string; amount: number }[];
  cashReceived?: number | undefined;
}) => {
  if (v.cashReceived === undefined) return true;
  const cash = v.tenders
    .filter((t) => PAYMENT_METHOD_RULES[t.method as keyof typeof PAYMENT_METHOD_RULES].allowsChange)
    .reduce((a, t) => a + Math.round(t.amount * 100), 0);
  return cash > 0 && Math.round(v.cashReceived * 100) >= cash;
};
const cashMessage = {
  message: "El efectivo recibido debe cubrir el importe en efectivo",
  path: ["cashReceived"],
};

/** Formulario de cobro (web y móvil). */
export const paymentFormSchema = z
  .object({ tenders: tendersSchema, cashReceived: cashReceivedSchema, notes: notesSchema })
  .refine(cashCovers, cashMessage);

/** Comando de cobro (repositorio). */
export const registerPaymentSchema = z
  .object({
    orderId: z.uuid(),
    version: z.coerce.number().int().min(1),
    requestId: z.uuid(),
    tenders: tendersSchema,
    cashReceived: cashReceivedSchema,
    notes: notesSchema,
  })
  .refine(cashCovers, cashMessage);

export const reversePaymentSchema = z.object({
  paymentId: z.uuid(),
  reason: z
    .string({ message: "Indica el motivo" })
    .trim()
    .min(REVERSAL_REASON_MIN, "Indica el motivo del reverso")
    .max(REVERSAL_REASON_MAX, `Usa como máximo ${REVERSAL_REASON_MAX} caracteres`),
});

export const paymentRangeSchema = z
  .object({
    detailCenterIds: z.array(z.uuid()).min(1).max(100),
    from: dayStringSchema,
    to: dayStringSchema,
  })
  .refine((r) => r.from <= r.to, { message: "El inicio debe ser anterior al fin", path: ["from"] });
