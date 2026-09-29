import { MIN_PASSWORD_LENGTH } from "@meguiars/domain";
import { z } from "zod";
import { appRoleSchema, changeReasonSchema } from "./centers";

/**
 * Administración de usuarios (A1). La base vuelve a validar permisos (admin
 * corporativo) y roles; Supabase Auth valida el correo y la contraseña.
 */

const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Mínimo ${MIN_PASSWORD_LENGTH} caracteres`)
  .max(72, "Máximo 72 caracteres");

const passwordsMatch = (v: { password: string; confirmPassword: string }, ctx: z.RefinementCtx) => {
  if (v.password !== v.confirmPassword)
    ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Las contraseñas no coinciden" });
};

export const newUserSchema = z
  .object({
    organizationId: z.uuid(),
    fullName: z.string().trim().min(2, "Escribe el nombre").max(120, "Máximo 120 caracteres"),
    email: z.string().trim().toLowerCase().pipe(z.email("Correo inválido").max(254)),
    accessKind: z.enum(["corporativo", "centro"], { message: "Elige el tipo de acceso" }),
    role: z.preprocess((v) => (v === "" ? undefined : v), appRoleSchema.optional()),
    centerIds: z.preprocess((v) => (v == null ? [] : Array.isArray(v) ? v : [v]), z.array(z.uuid()).max(50)),
    password: passwordSchema,
    confirmPassword: z.string(),
    reason: changeReasonSchema,
  })
  .superRefine((v, ctx) => {
    passwordsMatch(v, ctx);
    if (v.accessKind === "centro" && !v.role)
      ctx.addIssue({ code: "custom", path: ["role"], message: "Elige el rol" });
    if (v.accessKind === "centro" && v.centerIds.length === 0)
      ctx.addIssue({ code: "custom", path: ["centerIds"], message: "Elige al menos un centro" });
  });
export type NewUserValues = z.output<typeof newUserSchema>;

export const setPasswordSchema = z
  .object({ userId: z.uuid(), password: passwordSchema, confirmPassword: z.string() })
  .superRefine(passwordsMatch);

export const setUserDisabledSchema = z.object({
  userId: z.uuid(),
  disabled: z.boolean(),
  reason: changeReasonSchema,
});
