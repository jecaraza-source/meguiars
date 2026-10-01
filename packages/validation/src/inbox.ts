import {
  CONVERSATION_PRIORITIES,
  INBOX_CHANNELS,
  MAX_CONVERSATION_TAGS,
  MAX_MESSAGE_LENGTH,
  normalizeTags,
  unknownQuickReplyPlaceholders,
  validTag,
} from "@meguiars/domain";
import { z } from "zod";
import { changeReasonSchema } from "./centers";
import { clientNameSchema } from "./clients";

/**
 * Validación de la bandeja CR2 (fase 2), compartida por web y móvil. La base
 * vuelve a validar permisos, ventana de 24 h y estado de la cuenta.
 */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const version = z.coerce.number().int().min(1);
const uuidList = z.preprocess(
  (v) => (v == null || v === "" ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.uuid()).transform((xs) => [...new Set(xs)]),
);

export const channelAccountSchema = z.object({
  organizationId: z.uuid(),
  id: z.preprocess(blankToUndefined, z.uuid().optional()),
  detailCenterId: z.uuid({ message: "Elige el centro" }),
  channel: z.enum(INBOX_CHANNELS, { message: "Elige el canal" }),
  externalAccountId: z
    .string()
    .trim()
    .regex(/^[0-9]{5,30}$/, "Usa el identificador numérico de Meta (phone_number_id, id de página o IG ID)"),
  label: z.string().trim().min(2, "Mínimo 2 caracteres").max(80, "Máximo 80 caracteres"),
  active: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()),
  reason: changeReasonSchema,
});

export const sendMessageSchema = z.object({
  conversationId: z.uuid(),
  requestId: z.uuid(),
  body: z
    .string()
    .trim()
    .min(1, "Escribe el mensaje")
    .max(MAX_MESSAGE_LENGTH, `Máximo ${MAX_MESSAGE_LENGTH} caracteres`),
  /** Último mensaje que la persona vio: si hubo otro después, no se envía (respuestas duplicadas). */
  expectedLastMessageAt: z.preprocess(blankToUndefined, z.iso.datetime({ offset: true }).optional()),
});

/** Plantilla aprobada de WhatsApp (fuera de la ventana de 24 h). */
export const sendTemplateSchema = z.object({
  conversationId: z.uuid(),
  requestId: z.uuid(),
  templateId: z.uuid({ message: "Elige la plantilla" }),
  params: z.preprocess(
    (v) => (v == null || v === "" ? [] : Array.isArray(v) ? v : [v]),
    z
      .array(z.string().trim().min(1, "Completa los datos de la plantilla").max(200, "Máximo 200 caracteres"))
      .max(20),
  ),
});

export const conversationTriageSchema = z.object({
  conversationId: z.uuid(),
  version,
  priority: z.enum(CONVERSATION_PRIORITIES, { message: "Elige la prioridad" }),
  tags: z
    .preprocess(
      (v) => (typeof v === "string" ? v.split(",") : Array.isArray(v) ? v : []),
      z.array(z.string()).transform((xs) => normalizeTags(xs)),
    )
    .refine((xs) => xs.length <= MAX_CONVERSATION_TAGS, `Máximo ${MAX_CONVERSATION_TAGS} etiquetas`)
    .refine((xs) => xs.every(validTag), "Etiquetas: letras, números, espacios o guiones"),
  pending: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()),
});

export const conversationNoteSchema = z.object({
  conversationId: z.uuid(),
  requestId: z.uuid(),
  body: z.string().trim().min(1, "Escribe la nota").max(2000, "Máximo 2000 caracteres"),
});

export const quickReplySchema = z
  .object({
    organizationId: z.uuid(),
    id: z.preprocess(blankToUndefined, z.uuid().optional()),
    version: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).optional()),
    detailCenterId: z.preprocess(blankToUndefined, z.uuid().optional()),
    title: z.string().trim().min(2, "Mínimo 2 caracteres").max(60, "Máximo 60 caracteres"),
    body: z.string().trim().min(2, "Mínimo 2 caracteres").max(1000, "Máximo 1000 caracteres"),
    active: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()),
    reason: changeReasonSchema,
  })
  .superRefine((v, ctx) => {
    const unknown = unknownQuickReplyPlaceholders(v.body);
    if (unknown.length)
      ctx.addIssue({
        code: "custom",
        path: ["body"],
        message: `Sólo se admiten {nombre} y {centro} (sobra ${unknown.map((u) => `{${u}}`).join(", ")})`,
      });
  });

export const assignConversationSchema = z.object({
  conversationId: z.uuid(),
  version,
  userId: z.preprocess(blankToUndefined, z.uuid().optional()),
});

export const conversationStatusSchema = z.object({
  conversationId: z.uuid(),
  version,
  status: z.enum(["abierta", "cerrada"]),
});

export const linkConversationLeadSchema = z.object({
  conversationId: z.uuid(),
  version,
  leadId: z.uuid({ message: "Elige el prospecto" }),
});

export const conversationLeadSchema = z.object({
  conversationId: z.uuid(),
  version,
  requestId: z.uuid(),
  fullName: clientNameSchema,
  socialHandle: z.preprocess(
    blankToUndefined,
    z.string().trim().min(2, "Mínimo 2 caracteres").max(80, "Máximo 80 caracteres").optional(),
  ),
  interestServiceIds: uuidList,
  notes: z.preprocess(blankToUndefined, z.string().trim().max(2000, "Máximo 2000 caracteres").optional()),
});
