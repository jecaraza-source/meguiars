import {
  LEAD_CONSENT_CHANNELS,
  LEAD_CONTACT_CHANNELS,
  LEAD_LOSS_REASONS,
  LEAD_MILESTONES,
  LEAD_SOURCES,
  LEAD_TASK_KINDS,
  QUOTE_RULES,
} from "@meguiars/domain";
import { z } from "zod";
import { moneySchema } from "./catalog";
import { changeReasonSchema } from "./centers";
import { clientEmailSchema, clientNameSchema, clientPhoneSchema } from "./clients";
import { discountFormSchema } from "./orders";

/**
 * Validación del módulo comercial CR2 (prospectos, cotizaciones, fusión y
 * segmentos), compartida por web (server actions) y móvil. La base vuelve a
 * validar permisos, etapas, niveles de descuento, vencimiento y duplicados.
 */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, `Usa como máximo ${max} caracteres`).optional());
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const optionalDate = z.preprocess(blankToUndefined, isoDate.optional());
const optionalUuid = z.preprocess(blankToUndefined, z.uuid().optional());
const optionalMoney = z.preprocess(blankToUndefined, moneySchema.optional());
const optionalInt = (min: number, max: number) =>
  z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ message: "Número inválido" })
      .int("Usa un número entero")
      .min(min, `Mínimo ${min}`)
      .max(max, `Máximo ${max}`)
      .optional(),
  );
const version = z.coerce.number().int().min(1);
/** Casillas de formulario: string suelto, arreglo o nada. */
const stringList = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (v) => (v == null || v === "" ? [] : Array.isArray(v) ? v : [v]),
    z.array(z.enum(values)).transform((xs) => [...new Set(xs)]),
  );
const uuidList = z.preprocess(
  (v) => (v == null || v === "" ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.uuid()).transform((xs) => [...new Set(xs)]),
);

const socialHandleSchema = z.preprocess(
  blankToUndefined,
  z.string().trim().min(2, "Mínimo 2 caracteres").max(80, "Usa como máximo 80 caracteres").optional(),
);

const leadFields = {
  fullName: clientNameSchema,
  source: z.enum(LEAD_SOURCES, { message: "Elige el canal de origen" }),
  phone: z.preprocess(blankToUndefined, clientPhoneSchema.optional()),
  email: clientEmailSchema,
  socialHandle: socialHandleSchema,
  sourceDetail: optionalText(200),
  interestServiceIds: uuidList,
  vehicleDescription: optionalText(120),
  notes: optionalText(2000),
  consentChannels: stringList(LEAD_CONSENT_CHANNELS),
  estimatedValue: optionalMoney,
  ownerId: optionalUuid,
  nextAction: optionalText(200),
  nextActionOn: optionalDate,
};

const contactRequired = (
  v: { phone?: string | undefined; email?: string | undefined; socialHandle?: string | undefined },
  ctx: z.RefinementCtx,
) => {
  if (!v.phone && !v.email && !v.socialHandle)
    ctx.addIssue({
      code: "custom",
      path: ["phone"],
      message: "Captura al menos un teléfono, email o usuario de redes",
    });
};

export const createLeadSchema = z
  .object({
    detailCenterId: z.uuid(),
    requestId: z.uuid(),
    referredByClientId: optionalUuid,
    clientId: optionalUuid,
    ...leadFields,
  })
  .superRefine((v, ctx) => {
    contactRequired(v, ctx);
    if (v.source === "recomendacion" && !v.referredByClientId && !v.sourceDetail)
      ctx.addIssue({ code: "custom", path: ["sourceDetail"], message: "Indica quién recomendó" });
  });

export const updateLeadSchema = z
  .object({ id: z.uuid(), version, reason: changeReasonSchema, ...leadFields })
  .superRefine(contactRequired);

export const leadContactSchema = z.object({
  id: z.uuid(),
  version,
  channel: z.enum(LEAD_CONTACT_CHANNELS, { message: "Elige el canal" }),
  note: optionalText(2000),
});

export const moveLeadSchema = z.object({
  id: z.uuid(),
  version,
  stageId: z.uuid({ message: "Elige la etapa" }),
  note: optionalText(500),
});

export const loseLeadSchema = z.object({
  id: z.uuid(),
  version,
  reason: z.enum(LEAD_LOSS_REASONS, { message: "Elige el motivo" }),
  notes: optionalText(1000),
});

export const reopenLeadSchema = z.object({
  id: z.uuid(),
  version,
  stageId: z.uuid(),
  reason: changeReasonSchema,
});

export const linkLeadClientSchema = z.object({
  id: z.uuid(),
  version,
  clientId: z.uuid({ message: "Elige el cliente" }),
  reason: changeReasonSchema,
});

export const leadNoteSchema = z.object({
  id: z.uuid(),
  note: z.string().trim().min(1, "Escribe la nota").max(2000, "Usa como máximo 2000 caracteres"),
});

export const leadTaskSchema = z.object({
  leadId: z.uuid(),
  requestId: z.uuid(),
  kind: z.enum(LEAD_TASK_KINDS, { message: "Elige el tipo" }),
  dueOn: isoDate,
  notes: optionalText(1000),
  assignedTo: optionalUuid,
});

export const leadStageSchema = z.object({
  organizationId: z.uuid(),
  id: optionalUuid,
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{2,40}$/, "Clave: 2 a 40 letras minúsculas, números o guion bajo"),
  name: z.string().trim().min(2, "Mínimo 2 caracteres").max(60, "Máximo 60 caracteres"),
  position: z.coerce.number().int().min(1).max(89, "Las etapas abiertas van de 1 a 89"),
  milestone: z.preprocess(blankToUndefined, z.enum(LEAD_MILESTONES).optional()).transform((v) => v ?? null),
  active: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()),
  reason: changeReasonSchema,
});

const quoteLine = z.object({
  serviceId: z.uuid({ message: "Elige el servicio" }),
  quantity: z.coerce
    .number({ message: "Cantidad inválida" })
    .int("Usa cantidades enteras")
    .min(1, "Mínimo 1")
    .max(99, "Máximo 99"),
});

export const createQuoteSchema = z
  .object({
    detailCenterId: z.uuid(),
    requestId: z.uuid(),
    items: z.array(quoteLine).min(1, "Agrega al menos un servicio"),
    leadId: optionalUuid,
    clientId: optionalUuid,
    vehicleId: optionalUuid,
    validDays: optionalInt(1, QUOTE_RULES.maxValidDays),
    notes: optionalText(2000),
  })
  .superRefine((v, ctx) => {
    if (!v.leadId && !v.clientId)
      ctx.addIssue({ code: "custom", path: ["clientId"], message: "Cotiza a un prospecto o a un cliente" });
    if (new Set(v.items.map((i) => i.serviceId)).size !== v.items.length)
      ctx.addIssue({ code: "custom", path: ["items"], message: "Servicio repetido: usa la cantidad" });
  });

export const setQuoteItemSchema = z.object({
  quoteId: z.uuid(),
  version,
  serviceId: z.uuid({ message: "Elige el servicio" }),
  quantity: z.coerce.number().int().min(0).max(99, "Máximo 99"),
});

export const addQuoteDiscountSchema = z.object({ quoteId: z.uuid(), version }).and(discountFormSchema);

export const voidQuoteDiscountSchema = z.object({
  quoteId: z.uuid(),
  version,
  discountId: z.uuid(),
  reason: changeReasonSchema,
});

export const quoteStatusSchema = z
  .object({
    quoteId: z.uuid(),
    version,
    status: z.enum(["enviada", "aceptada", "rechazada", "cancelada"]),
    reason: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if ((v.status === "rechazada" || v.status === "cancelada") && !v.reason)
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Indica el motivo" });
  });

export const updateQuoteSchema = z.object({
  quoteId: z.uuid(),
  version,
  vehicleId: optionalUuid,
  validUntil: isoDate,
  notes: optionalText(2000),
  reason: changeReasonSchema,
});

export const bookQuoteSchema = z.object({
  quoteId: z.uuid(),
  version,
  requestId: z.uuid(),
  /** Fecha y hora local del centro (YYYY-MM-DDTHH:mm) o ISO con zona. */
  startsAt: z.string().min(16, "Elige fecha y hora"),
  vehicleId: optionalUuid,
  bayId: optionalUuid,
  technicianId: optionalUuid,
  notes: optionalText(2000),
});

export const mergeClientsSchema = z
  .object({
    keepClientId: z.uuid(),
    mergeClientId: z.uuid(),
    reason: changeReasonSchema,
  })
  .refine((v) => v.keepClientId !== v.mergeClientId, {
    path: ["mergeClientId"],
    message: "Elige dos clientes distintos",
  });

export const segmentFilterSchema = z
  .object({
    serviceIds: uuidList,
    interestServiceIds: uuidList,
    minVisits: optionalInt(0, 1000),
    minSpend: optionalMoney,
    maxSpend: optionalMoney,
    minDaysSinceVisit: optionalInt(0, 3650),
    maxDaysSinceVisit: optionalInt(0, 3650),
    consentChannel: z.preprocess(blankToUndefined, z.enum(LEAD_CONSENT_CHANNELS).optional()),
  })
  .superRefine((v, ctx) => {
    if (v.minSpend != null && v.maxSpend != null && v.minSpend > v.maxSpend)
      ctx.addIssue({ code: "custom", path: ["maxSpend"], message: "El máximo debe ser mayor que el mínimo" });
    if (
      v.minDaysSinceVisit != null &&
      v.maxDaysSinceVisit != null &&
      v.minDaysSinceVisit > v.maxDaysSinceVisit
    )
      ctx.addIssue({
        code: "custom",
        path: ["maxDaysSinceVisit"],
        message: "El máximo debe ser mayor que el mínimo",
      });
  });
