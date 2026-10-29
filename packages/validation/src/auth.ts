import { parseLoginIdentifier } from "@meguiars/domain";
import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Correo inválido"));

/** Correo o celular (10 dígitos = México); sale como { email } o { phone } en E.164. */
export const loginIdentifierSchema = z
  .string({ message: "Escribe tu correo o tu celular" })
  .trim()
  .min(1, "Escribe tu correo o tu celular")
  .transform((value, ctx) => {
    const id = parseLoginIdentifier(value);
    if (!id) {
      ctx.addIssue({ code: "custom", message: "Escribe un correo válido o un celular de 10 dígitos" });
      return z.NEVER;
    }
    return id;
  });

export const loginSchema = z.object({
  identifier: loginIdentifierSchema,
  password: z.string().min(1, "Escribe tu contraseña"),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Usa al menos ${PASSWORD_MIN_LENGTH} caracteres`)
      .max(72, "Usa como máximo 72 caracteres"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Las contraseñas no coinciden" });

export const activeCenterSchema = z.object({ detailCenterId: z.uuid() });

/** Primer mensaje de error por campo, para pintar formularios. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
