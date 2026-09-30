import { BASELINE_METRICS } from "@meguiars/domain";
import { z } from "zod";
import { centerNameSchema, changeReasonSchema, timeZoneSchema } from "./centers";

/** Alta de centro (F5.2): el código se normaliza a mayúsculas como en la base. */
export const createCenterSchema = z.object({
  organizationId: z.uuid(),
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(
      z.string().regex(/^[A-Z0-9-]{2,20}$/, "Usa 2–20 caracteres: letras, dígitos o guion (p. ej. GDL-01)"),
    ),
  name: centerNameSchema,
  timezone: timeZoneSchema,
  reason: changeReasonSchema,
});
export type CreateCenterInput = z.infer<typeof createCenterSchema>;

const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.iso.date("Fecha inválida").nullable());

/** Indicador de línea base; valor vacío = borrarlo. */
export const baselineSchema = z
  .object({
    detailCenterId: z.uuid(),
    metric: z.enum(BASELINE_METRICS),
    value: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : Number(v.replace(/[$,\s%]/g, ""))))
      .pipe(z.number("Captura un número").min(0, "Debe ser 0 o mayor").nullable()),
    periodFrom: optionalDate,
    periodTo: optionalDate,
    source: z.string().trim().max(200, "Máximo 200 caracteres"),
    reason: changeReasonSchema,
  })
  .superRefine((v, ctx) => {
    if (v.value !== null && v.source.length < 3)
      ctx.addIssue({
        code: "custom",
        path: ["source"],
        message: "Indica de dónde sale el valor (mínimo 3 caracteres)",
      });
    if (v.periodFrom && v.periodTo && v.periodFrom > v.periodTo)
      ctx.addIssue({
        code: "custom",
        path: ["periodTo"],
        message: "El fin del periodo va después del inicio",
      });
  });
export type BaselineInput = z.infer<typeof baselineSchema>;
