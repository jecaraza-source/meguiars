import {
  EXPENSE_PAYMENT_METHODS,
  EXPENSE_RECEIPT_MAX_BYTES,
  EXPENSE_RECEIPT_MIME_TYPES,
  EXPENSE_STATUSES,
  normalizePhone,
  PNL_GROUPS,
} from "@meguiars/domain";
import { z } from "zod";
import { dayStringSchema } from "./agenda";
import { rfcSchema } from "./b2b";
import { moneySchema } from "./catalog";
import { changeReasonSchema } from "./centers";

/**
 * Validación de egresos, compartida por web (server actions) y móvil. Los
 * formularios envían texto; aquí se convierte. La base vuelve a validar
 * (categoría activa de la organización, fecha no futura, umbral y permisos).
 */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalUuid = z.preprocess(blankToUndefined, z.uuid().optional());
const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, `Usa como máximo ${max} caracteres`).optional());

export const pnlGroupSchema = z.enum(PNL_GROUPS, { message: "Elige el grupo del P&L" });
export const expenseStatusSchema = z.enum(EXPENSE_STATUSES);
export const expensePaymentMethodSchema = z.enum(EXPENSE_PAYMENT_METHODS, {
  message: "Elige la forma de pago",
});

/** Campos del egreso (formulario de web y móvil). */
export const expenseFormSchema = z.object({
  categoryId: z.uuid({ message: "Elige la categoría" }),
  vendorId: optionalUuid,
  concept: z
    .string()
    .trim()
    .min(3, "Describe el concepto (mínimo 3 caracteres)")
    .max(200, "Máximo 200 caracteres"),
  amount: moneySchema.refine((n) => n > 0, "Debe ser mayor que 0"),
  paymentMethod: expensePaymentMethodSchema,
  paidOn: dayStringSchema,
  reference: optionalText(80),
  notes: optionalText(1000),
});

export const createExpenseSchema = expenseFormSchema.extend({
  detailCenterId: z.uuid(),
  requestId: z.uuid(),
});

export const updateExpenseSchema = expenseFormSchema.extend({
  expenseId: z.uuid(),
  version: z.coerce.number().int().min(1),
  reason: changeReasonSchema,
});

export const approveExpenseSchema = z.object({
  expenseId: z.uuid(),
  version: z.coerce.number().int().min(1),
  reason: optionalText(500),
});

/** Rechazar y anular exigen motivo. */
export const expenseReasonSchema = z.object({
  expenseId: z.uuid(),
  version: z.coerce.number().int().min(1),
  reason: changeReasonSchema,
});

export const expenseFilterSchema = z
  .object({
    detailCenterIds: z.array(z.uuid()).min(1).max(100),
    from: dayStringSchema,
    to: dayStringSchema,
    categoryId: optionalUuid,
    vendorId: optionalUuid,
    status: z.preprocess(blankToUndefined, expenseStatusSchema.optional()),
    pnlGroup: z.preprocess(blankToUndefined, pnlGroupSchema.optional()),
  })
  .refine((f) => f.from <= f.to, { message: "El inicio debe ser anterior al fin", path: ["from"] });

export const receiptMetaSchema = z.object({
  contentType: z.enum(EXPENSE_RECEIPT_MIME_TYPES, { message: "Sube una foto (JPG, PNG o WebP) o un PDF" }),
  sizeBytes: z
    .number()
    .int()
    .min(1, "Archivo vacío")
    .max(EXPENSE_RECEIPT_MAX_BYTES, "El comprobante excede 10 MB"),
  fileName: optionalText(200),
});

export const removeReceiptSchema = z.object({ attachmentId: z.uuid(), reason: changeReasonSchema });

const vendorPhoneSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .transform((v, ctx) => {
      const phone = normalizePhone(v);
      if (!phone) {
        ctx.addIssue({
          code: "custom",
          message: "Teléfono inválido: usa 10 dígitos o formato internacional con +",
        });
        return z.NEVER;
      }
      return phone;
    })
    .optional(),
);

export const vendorSchema = z.object({
  detailCenterId: z.uuid(),
  vendorId: optionalUuid,
  name: z.string().trim().min(2, "Escribe el nombre (mínimo 2 caracteres)").max(120, "Máximo 120 caracteres"),
  rfc: rfcSchema,
  phone: vendorPhoneSchema,
  email: z.preprocess(
    blankToUndefined,
    z.string().trim().toLowerCase().pipe(z.email("Correo inválido")).optional(),
  ),
  notes: optionalText(500),
  active: z.boolean(),
});

export const expenseCategorySchema = z.object({
  organizationId: z.uuid(),
  categoryId: optionalUuid,
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{2,30}$/, "Clave de 2 a 30 caracteres: minúsculas, números o _"),
  name: z.string().trim().min(2, "Escribe el nombre").max(80, "Máximo 80 caracteres"),
  pnlGroup: pnlGroupSchema,
  description: optionalText(300),
  position: z.coerce.number().int().min(1, "Orden de 1 a 999").max(999, "Orden de 1 a 999"),
  active: z.boolean(),
  reason: changeReasonSchema,
});

export const thresholdSchema = z.object({
  detailCenterId: z.uuid(),
  threshold: z.preprocess(
    blankToUndefined,
    moneySchema.refine((n) => n > 0, "Debe ser mayor que 0").optional(),
  ),
  reason: changeReasonSchema,
});
