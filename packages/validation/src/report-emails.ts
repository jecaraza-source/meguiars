import { MAX_REPORT_RECIPIENTS, REPORT_FREQUENCIES, splitRecipients } from "@meguiars/domain";
import { z } from "zod";
import { changeReasonSchema } from "./centers";

/**
 * Programación de reportes por correo (Dirección), compartida por web y móvil.
 * La base vuelve a validar: admin corporativo, centros de la organización,
 * correos (1 a 20, formato) y versión.
 */

const blankToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

export const reportSubscriptionSchema = z.object({
  organizationId: z.uuid(),
  id: z.preprocess(blankToNull, z.uuid().nullable()),
  version: z.preprocess(blankToNull, z.coerce.number().int().min(1).nullable()),
  name: z.string().trim().min(3, "Mínimo 3 caracteres").max(120, "Máximo 120 caracteres"),
  frequency: z.enum(REPORT_FREQUENCIES, { message: "Elige la frecuencia" }),
  /** Vacío = todos los centros. */
  centerIds: z.preprocess(
    (v) => (v === null || v === undefined ? [] : Array.isArray(v) ? v : [v]),
    z.array(z.uuid()).max(50),
  ),
  /** Cuadro de texto o lista: se separa por coma, punto y coma, espacio o renglón. */
  recipients: z.preprocess(
    (v) => (typeof v === "string" ? splitRecipients(v) : Array.isArray(v) ? splitRecipients(v.join(",")) : v),
    z
      .array(z.email({ message: "Hay un correo con formato inválido" }).max(254))
      .min(1, "Escribe al menos un correo")
      .max(MAX_REPORT_RECIPIENTS, `Máximo ${MAX_REPORT_RECIPIENTS} correos`),
  ),
  active: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()),
  reason: changeReasonSchema,
});
export type ReportSubscriptionForm = z.infer<typeof reportSubscriptionSchema>;
