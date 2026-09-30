import { INBOX_CHANNELS, MAX_MESSAGE_LENGTH } from "@meguiars/domain";
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
