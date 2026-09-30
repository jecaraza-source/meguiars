import {
  AUTOMATION_LIMITS,
  AUTOMATION_TRIGGERS,
  LEAD_SOURCES,
  triggerAccepts,
  unknownPlaceholders,
} from "@meguiars/domain";
import { z } from "zod";
import { changeReasonSchema } from "./centers";

/**
 * Validación de automatizaciones (CR2 fase 4). La base vuelve a validar
 * permisos, responsable del centro, marcadores del mensaje y límites.
 */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalUuid = z.preprocess(blankToUndefined, z.uuid().optional());
const optionalVersion = z.preprocess(blankToUndefined, z.coerce.number().int().min(1).optional());
const list = <T extends z.ZodType>(item: T) =>
  z.preprocess((v) => (v == null || v === "" ? [] : Array.isArray(v) ? v : [v]), z.array(item));
const int = (min: number, max: number, label: string) =>
  z.coerce
    .number({ message: `${label}: escribe un número` })
    .int(`${label}: sin decimales`)
    .min(min, `${label}: mínimo ${min}`)
    .max(max, `${label}: máximo ${max}`);
const hour = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:MM)");

export const automationSchema = z
  .object({
    organizationId: z.uuid(),
    id: optionalUuid,
    version: optionalVersion,
    detailCenterId: optionalUuid,
    name: z.string().trim().min(3, "Mínimo 3 caracteres").max(120, "Máximo 120 caracteres"),
    trigger: z.enum(AUTOMATION_TRIGGERS, { message: "Elige el disparador" }),
    delayDays: int(AUTOMATION_LIMITS.delayDays.min, AUTOMATION_LIMITS.delayDays.max, "Días"),
    serviceIds: list(z.uuid()).transform((xs) => [...new Set(xs)]),
    leadSources: list(z.enum(LEAD_SOURCES)).transform((xs) => [...new Set(xs)]),
    assignTo: optionalUuid,
    dueInDays: int(AUTOMATION_LIMITS.dueInDays.min, AUTOMATION_LIMITS.dueInDays.max, "Plazo"),
    messageTemplate: z.preprocess(
      blankToUndefined,
      z.string().trim().max(AUTOMATION_LIMITS.messageLength, "Máximo 1000 caracteres").optional(),
    ),
    cooldownDays: int(AUTOMATION_LIMITS.cooldownDays.min, AUTOMATION_LIMITS.cooldownDays.max, "Frecuencia"),
    maxPerRun: int(AUTOMATION_LIMITS.maxPerRun.min, AUTOMATION_LIMITS.maxPerRun.max, "Tope por corrida"),
    contactFrom: hour,
    contactTo: hour,
    reason: changeReasonSchema,
  })
  .superRefine((v, ctx) => {
    const accepts = triggerAccepts(v.trigger);
    if (!accepts.services && v.serviceIds.length)
      ctx.addIssue({
        code: "custom",
        path: ["serviceIds"],
        message: "Este disparador no filtra por servicio",
      });
    if (!accepts.leadSources && v.leadSources.length)
      ctx.addIssue({
        code: "custom",
        path: ["leadSources"],
        message: "Sólo los prospectos nuevos filtran por canal",
      });
    if (v.contactFrom >= v.contactTo)
      ctx.addIssue({
        code: "custom",
        path: ["contactTo"],
        message: "La hora final va después de la inicial",
      });
    const unknown = v.messageTemplate ? unknownPlaceholders(v.messageTemplate) : [];
    if (unknown.length)
      ctx.addIssue({
        code: "custom",
        path: ["messageTemplate"],
        message: `Sólo se admiten {nombre}, {servicio}, {centro}, {fecha} y {folio} (sobra ${unknown.map((u) => `{${u}}`).join(", ")})`,
      });
    if (v.assignTo && !v.detailCenterId)
      ctx.addIssue({
        code: "custom",
        path: ["assignTo"],
        message: "Para asignar responsable elige el centro",
      });
  });

export const automationActiveSchema = z.object({
  id: z.uuid(),
  version: z.coerce.number().int().min(1),
  active: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()),
  reason: changeReasonSchema,
});
