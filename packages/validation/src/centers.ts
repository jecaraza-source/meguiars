import { APP_ROLES, isValidTimeZone } from "@meguiars/domain";
import { z } from "zod";

export const centerCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9-]{2,20}$/, "Usa 2–20 caracteres: mayúsculas, dígitos o guion");

export const centerNameSchema = z.string().trim().min(2).max(120);

export const timeZoneSchema = z.string().refine(isValidTimeZone, "Zona horaria IANA inválida");

/** Motivo obligatorio para cambios sensibles auditados (igual que en SQL). */
export const changeReasonSchema = z.string().trim().min(3).max(500);

export const detailCenterInputSchema = z.object({
  code: centerCodeSchema,
  name: centerNameSchema,
  timezone: timeZoneSchema,
});
export type DetailCenterInput = z.infer<typeof detailCenterInputSchema>;

export const updateDetailCenterSchema = z.object({
  id: z.uuid(),
  name: centerNameSchema,
  timezone: timeZoneSchema,
  reason: changeReasonSchema,
});

export const appRoleSchema = z.enum(APP_ROLES);

export const setCenterMembershipSchema = z.object({
  detailCenterId: z.uuid(),
  userId: z.uuid(),
  role: appRoleSchema,
  active: z.boolean(),
  reason: changeReasonSchema,
});

export const setRoleAssignmentSchema = z.object({
  organizationId: z.uuid(),
  userId: z.uuid(),
  role: appRoleSchema,
  active: z.boolean(),
  reason: changeReasonSchema,
});
