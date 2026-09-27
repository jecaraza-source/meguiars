import {
  AGREEMENT_STATUSES,
  B2B_ACCOUNT_STATUSES,
  B2B_PAYMENT_METHODS,
  BILLING_MODELS,
  FEE_MODELS,
  PRICE_RULE_KINDS,
  RFC_PATTERN,
  VEHICLE_RULES,
} from "@meguiars/domain";
import { z } from "zod";
import { moneySchema } from "./catalog";
import { changeReasonSchema } from "./centers";
import { clientEmailSchema, clientPhoneSchema } from "./clients";
import { quantitySchema } from "./orders";

/**
 * Validación B2B (C3), compartida por web (server actions) y móvil. La base
 * vuelve a validar permisos, vigencia, vehículos autorizados, crédito y tarifas.
 */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, `Usa como máximo ${max} caracteres`).optional());
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const optionalMoney = z.preprocess(blankToUndefined, moneySchema.optional());
const optionalUuid = z.preprocess(blankToUndefined, z.uuid().optional());
const nameSchema = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, " "))
  .pipe(
    z.string().min(2, "Escribe el nombre (mínimo 2 caracteres)").max(120, "Usa como máximo 120 caracteres"),
  );

export const rfcSchema = z.preprocess(
  (v) => (typeof v === "string" ? blankToUndefined(v.trim().toUpperCase()) : v),
  z.string().regex(RFC_PATTERN, "RFC inválido (12 o 13 caracteres)").optional(),
);

export const b2bAccountSchema = z.object({
  id: optionalUuid,
  requestId: z.uuid(),
  homeDetailCenterId: z.uuid({ message: "Elige el centro gestor" }),
  clientId: z.uuid({ message: "Elige la empresa" }),
  name: nameSchema,
  legalName: optionalText(200),
  rfc: rfcSchema,
  taxRegime: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^\d{3}$/, "Clave de 3 dígitos")
      .optional(),
  ),
  fiscalZip: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^\d{5}$/, "CP de 5 dígitos")
      .optional(),
  ),
  billingEmail: clientEmailSchema,
  status: z.enum(B2B_ACCOUNT_STATUSES),
  notes: optionalText(2000),
  reason: changeReasonSchema,
});

export const b2bContactSchema = z
  .object({
    accountId: z.uuid(),
    id: optionalUuid,
    fullName: nameSchema,
    title: optionalText(80),
    phone: z.preprocess(blankToUndefined, clientPhoneSchema.optional()),
    email: clientEmailSchema,
    isPrimary: z.boolean(),
    active: z.boolean(),
    reason: changeReasonSchema,
  })
  .refine((c) => c.phone || c.email, { message: "Captura teléfono o email", path: ["phone"] });

export const b2bAgreementSchema = z
  .object({
    accountId: z.uuid(),
    id: optionalUuid,
    requestId: z.uuid(),
    name: nameSchema,
    billingModel: z.enum(BILLING_MODELS, { message: "Elige el modelo de cobro" }),
    startsOn: isoDate,
    endsOn: isoDate,
    status: z.enum(AGREEMENT_STATUSES),
    vehicleRule: z.enum(VEHICLE_RULES),
    paymentTermsDays: z.coerce
      .number({ message: "Días inválidos" })
      .int()
      .min(0, "Mínimo 0")
      .max(120, "Máximo 120"),
    creditLimit: optionalMoney,
    feeAmount: optionalMoney,
    includedUnits: z.preprocess(
      blankToUndefined,
      z.coerce.number({ message: "Cantidad inválida" }).int().min(1, "Mínimo 1").max(10_000).optional(),
    ),
    centerIds: z.array(z.uuid()).min(1, "Habilita al menos un centro"),
    notes: optionalText(2000),
    reason: changeReasonSchema,
  })
  .superRefine((g, ctx) => {
    if (g.endsOn < g.startsOn)
      ctx.addIssue({
        code: "custom",
        path: ["endsOn"],
        message: "El fin debe ser igual o posterior al inicio",
      });
    if (FEE_MODELS.includes(g.billingModel)) {
      if (!g.feeAmount) ctx.addIssue({ code: "custom", path: ["feeAmount"], message: "Captura la cuota" });
      if (!g.includedUnits)
        ctx.addIssue({ code: "custom", path: ["includedUnits"], message: "Indica los servicios incluidos" });
    }
    if (g.creditLimit === 0)
      ctx.addIssue({ code: "custom", path: ["creditLimit"], message: "Deja vacío para sin límite" });
  });

export const b2bPriceRuleSchema = z
  .object({
    agreementId: z.uuid(),
    id: optionalUuid,
    serviceId: optionalUuid,
    kind: z.enum(PRICE_RULE_KINDS, { message: "Elige el tipo" }),
    value: optionalMoney,
    minMonthlyOrders: z.preprocess(
      (v) => blankToUndefined(v) ?? 0,
      z.coerce.number({ message: "Número inválido" }).int().min(0).max(10_000),
    ),
    active: z.boolean(),
    notes: optionalText(500),
    reason: changeReasonSchema,
  })
  .superRefine((r, ctx) => {
    if (r.kind !== "incluido" && r.value === undefined)
      ctx.addIssue({ code: "custom", path: ["value"], message: "Captura el precio o el %" });
    if (r.kind === "descuento_pct" && r.value !== undefined && (r.value <= 0 || r.value > 100))
      ctx.addIssue({ code: "custom", path: ["value"], message: "El descuento va de 0 a 100 %" });
  })
  .transform((r) => (r.kind === "incluido" ? { ...r, value: undefined } : r));

export const b2bVehicleSchema = z.object({
  accountId: z.uuid(),
  vehicleId: z.uuid(),
  active: z.boolean(),
  costCenter: optionalText(80),
  driverName: optionalText(120),
  notes: optionalText(500),
  reason: changeReasonSchema,
});

export const createB2bOrderSchema = z.object({
  detailCenterId: z.uuid(),
  requestId: z.uuid(),
  accountId: z.uuid({ message: "Elige la cuenta" }),
  vehicleId: z.uuid({ message: "Elige el vehículo" }),
  items: z
    .array(z.object({ serviceId: z.uuid(), quantity: quantitySchema }))
    .min(1, "Agrega al menos un servicio o producto"),
  purchaseOrder: optionalText(80),
  observations: optionalText(4000),
});

export const applyB2bAccountSchema = z.object({
  orderId: z.uuid(),
  version: z.coerce.number().int().min(1),
  accountId: z.uuid({ message: "Elige la cuenta" }),
  purchaseOrder: optionalText(80),
});

export const b2bInvoiceSchema = z
  .object({
    accountId: z.uuid(),
    requestId: z.uuid(),
    reference: z.string().trim().min(1, "Captura la referencia").max(80),
    issuedOn: isoDate,
    orderIds: z.array(z.uuid()),
    feeAmount: z.preprocess((v) => blankToUndefined(v) ?? 0, moneySchema),
    notes: optionalText(1000),
  })
  .refine((i) => i.orderIds.length > 0 || i.feeAmount > 0, {
    message: "Elige OS o captura la cuota a facturar",
    path: ["orderIds"],
  });

export const b2bPaymentSchema = z.object({
  accountId: z.uuid(),
  requestId: z.uuid(),
  amount: moneySchema.refine((n) => n > 0, "El importe debe ser mayor que 0"),
  method: z.enum(B2B_PAYMENT_METHODS, { message: "Elige la forma de pago" }),
  reference: optionalText(120),
  paidOn: isoDate,
  invoiceId: optionalUuid,
});

export const b2bVoidSchema = z.object({ id: z.uuid(), reason: changeReasonSchema });

export const b2bAccountFilterSchema = z.object({
  status: z.preprocess(blankToUndefined, z.enum(B2B_ACCOUNT_STATUSES).optional()),
  query: optionalText(80),
});
