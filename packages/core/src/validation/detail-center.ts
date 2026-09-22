import { z } from "zod";
import { APP_ROLES } from "../domain/roles";
import { isValidTimeZone } from "../time";

export const detailCenterInputSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9-]{2,20}$/, "Usa 2–20 caracteres: mayúsculas, dígitos o guion"),
  name: z.string().trim().min(2).max(120),
  timezone: z.string().refine(isValidTimeZone, "Zona horaria IANA inválida"),
});
export type DetailCenterInput = z.infer<typeof detailCenterInputSchema>;

export const membershipInputSchema = z.object({
  detailCenterId: z.uuid(),
  userId: z.uuid(),
  role: z.enum(APP_ROLES),
});
export type MembershipInput = z.infer<typeof membershipInputSchema>;

/** Motivo obligatorio para cambios sensibles auditados. */
export const changeReasonSchema = z.string().trim().min(3).max(500);
