import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_OBJECTIVES,
  CAMPAIGN_STATUSES,
  CONTENT_FORMATS,
  CONTENT_STATUSES,
  PROMOTION_KINDS,
} from "@meguiars/domain";
import { z } from "zod";
import { moneySchema } from "./catalog";
import { changeReasonSchema } from "./centers";

/**
 * Validación de CR2 (fase 3): campañas, gasto, calendario y promociones. La
 * base vuelve a validar permisos, UTM único, vigencia, usos y centros.
 */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, `Usa como máximo ${max} caracteres`).optional());
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const optionalUuid = z.preprocess(blankToUndefined, z.uuid().optional());
const optionalVersion = z.preprocess(blankToUndefined, z.coerce.number().int().min(1).optional());
const list = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (v) => (v == null || v === "" ? [] : Array.isArray(v) ? v : [v]),
    z.array(z.enum(values)).transform((xs) => [...new Set(xs)]),
  );
const uuidList = z.preprocess(
  (v) => (v == null || v === "" ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.uuid()).transform((xs) => [...new Set(xs)]),
);
const httpsUrl = (max: number) =>
  z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .max(max, `Máximo ${max} caracteres`)
      .regex(/^https:\/\/\S{3,}$/, "Usa un enlace https://")
      .optional(),
  );
const utmPart = (max: number, label: string) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .regex(new RegExp(`^[a-z0-9_.-]{2,${max}}$`), `${label}: 2 a ${max} letras minúsculas, números, _ . o -`);

export const campaignSchema = z
  .object({
    organizationId: z.uuid(),
    id: optionalUuid,
    version: optionalVersion,
    detailCenterId: optionalUuid,
    name: z.string().trim().min(3, "Mínimo 3 caracteres").max(120, "Máximo 120 caracteres"),
    objective: z.enum(CAMPAIGN_OBJECTIVES, { message: "Elige el objetivo" }),
    channels: list(CAMPAIGN_CHANNELS),
    startsOn: isoDate,
    endsOn: isoDate,
    budget: z.preprocess(blankToUndefined, moneySchema.optional()),
    status: z.enum(CAMPAIGN_STATUSES).default("planeada"),
    utmSource: utmPart(40, "utm_source"),
    utmMedium: utmPart(40, "utm_medium"),
    utmCampaign: utmPart(60, "utm_campaign"),
    landingUrl: httpsUrl(500),
    notes: optionalText(2000),
    reason: changeReasonSchema,
  })
  .refine((v) => v.endsOn >= v.startsOn, {
    path: ["endsOn"],
    message: "La fecha final va después de la inicial",
  });

export const campaignSpendSchema = z
  .object({
    campaignId: z.uuid(),
    spentOn: z.preprocess(blankToUndefined, isoDate.optional()),
    amount: z.preprocess(blankToUndefined, moneySchema.optional()),
    channel: z.enum(CAMPAIGN_CHANNELS, { message: "Elige el canal" }),
    expenseId: optionalUuid,
    note: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (!v.expenseId && (v.amount == null || v.amount <= 0))
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Captura el importe o liga un egreso" });
    if (!v.expenseId && !v.spentOn)
      ctx.addIssue({ code: "custom", path: ["spentOn"], message: "Elige la fecha" });
  });

export const contentPostSchema = z.object({
  organizationId: z.uuid(),
  id: optionalUuid,
  version: optionalVersion,
  detailCenterId: optionalUuid,
  campaignId: optionalUuid,
  channel: z.enum(CAMPAIGN_CHANNELS, { message: "Elige el canal" }),
  format: z.enum(CONTENT_FORMATS, { message: "Elige el formato" }),
  title: z.string().trim().min(3, "Mínimo 3 caracteres").max(120, "Máximo 120 caracteres"),
  copy: optionalText(4000),
  plannedAt: z.string().min(16, "Elige fecha y hora"),
  ownerId: optionalUuid,
  linkUrl: httpsUrl(800),
  reason: changeReasonSchema,
});

export const contentStatusSchema = z
  .object({
    id: z.uuid(),
    version: z.coerce.number().int().min(1),
    status: z.enum(CONTENT_STATUSES),
    publishedUrl: httpsUrl(800),
  })
  .refine((v) => v.status !== "publicada" || !!v.publishedUrl, {
    path: ["publishedUrl"],
    message: "Pega el enlace de la publicación",
  });

export const promotionSchema = z
  .object({
    organizationId: z.uuid(),
    id: optionalUuid,
    version: optionalVersion,
    campaignId: optionalUuid,
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9_-]{2,29}$/, "Código: 3 a 30 letras o números (sin espacios)"),
    name: z.string().trim().min(3, "Mínimo 3 caracteres").max(120, "Máximo 120 caracteres"),
    kind: z.enum(PROMOTION_KINDS, { message: "Elige el tipo" }),
    value: z.coerce.number({ message: "Valor inválido" }).positive("Debe ser mayor que 0"),
    serviceIds: uuidList,
    detailCenterIds: uuidList,
    startsOn: isoDate,
    endsOn: isoDate,
    maxUses: z.preprocess(blankToUndefined, z.coerce.number().int().min(1, "Mínimo 1").optional()),
    active: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()),
    terms: optionalText(1000),
    reason: changeReasonSchema,
  })
  .superRefine((v, ctx) => {
    if (v.kind === "percent" && v.value > 100)
      ctx.addIssue({ code: "custom", path: ["value"], message: "Un porcentaje no pasa de 100" });
    if (v.endsOn < v.startsOn)
      ctx.addIssue({ code: "custom", path: ["endsOn"], message: "La fecha final va después de la inicial" });
  });

export const applyPromotionSchema = z.object({
  documentId: z.uuid(),
  version: z.coerce.number().int().min(1),
  code: z.string().trim().toUpperCase().min(3, "Escribe el código").max(30, "Código inválido"),
});
