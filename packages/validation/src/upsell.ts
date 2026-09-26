import { REJECTION_REASONS, RULE_STAGES, SALES_CHANNELS } from "@meguiars/domain";
import { z } from "zod";
import { moneySchema } from "./catalog";
import { changeReasonSchema } from "./centers";

/** Validación de recomendaciones de venta (C4), compartida por web y móvil. La base vuelve a validar. */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalUuid = z.preprocess(blankToUndefined, z.uuid().optional());
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

export const upsellRuleSchema = z
  .object({
    organizationId: z.uuid(),
    id: optionalUuid,
    name: z
      .string()
      .transform((v) => v.trim().replace(/\s+/g, " "))
      .pipe(z.string().min(2, "Escribe el nombre (mínimo 2 caracteres)").max(120)),
    sourceServiceId: optionalUuid,
    targetServiceId: optionalUuid,
    targetPlanId: optionalUuid,
    stage: z.enum(RULE_STAGES, { message: "Elige la etapa" }),
    priority: z.coerce
      .number({ message: "Prioridad inválida" })
      .int()
      .min(1, "Mínimo 1")
      .max(100, "Máximo 100"),
    pitch: z.string().trim().min(3, "Escribe el argumento").max(280, "Usa como máximo 280 caracteres"),
    channels: z.array(z.enum(SALES_CHANNELS)).min(1, "Elige al menos un canal"),
    centerIds: z.preprocess(
      (v) => (Array.isArray(v) && v.length === 0 ? undefined : v),
      z.array(z.uuid()).optional(),
    ),
    minOrderTotal: z.preprocess(blankToUndefined, moneySchema.optional()),
    startsOn: isoDate,
    endsOn: z.preprocess(blankToUndefined, isoDate.optional()),
    active: z.boolean(),
    reason: changeReasonSchema,
  })
  .superRefine((r, ctx) => {
    if (!r.targetServiceId === !r.targetPlanId)
      ctx.addIssue({
        code: "custom",
        path: ["targetServiceId"],
        message: "Elige un servicio o un plan sugerido",
      });
    if (r.targetServiceId && r.targetServiceId === r.sourceServiceId)
      ctx.addIssue({
        code: "custom",
        path: ["targetServiceId"],
        message: "El sugerido debe ser distinto del origen",
      });
    if (r.endsOn && r.endsOn < r.startsOn)
      ctx.addIssue({
        code: "custom",
        path: ["endsOn"],
        message: "El fin debe ser igual o posterior al inicio",
      });
  });

export const upsellDecisionSchema = z.object({
  orderId: z.uuid(),
  ruleId: z.uuid(),
  version: z.coerce.number().int().min(1).optional(),
  reason: z.preprocess(blankToUndefined, z.enum(REJECTION_REASONS).optional()),
});
