import { describe, expect, it } from "vitest";
import { fieldErrors, forgotPasswordSchema, loginSchema, resetPasswordSchema } from "./auth";

describe("validaciones de autenticación", () => {
  it("normaliza el correo y exige contraseña", () => {
    expect(loginSchema.parse({ email: "  Ana@Demo.MX ", password: "x" }).email).toBe("ana@demo.mx");
    const bad = loginSchema.safeParse({ email: "no-es-correo", password: "" });
    expect(bad.success).toBe(false);
    expect(Object.keys(fieldErrors(bad.error!)).sort()).toEqual(["email", "password"]);
  });

  it("recuperación sólo necesita un correo válido", () => {
    expect(forgotPasswordSchema.safeParse({ email: "ana@demo.mx" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "" }).success).toBe(false);
  });

  it("la nueva contraseña tiene longitud mínima y debe confirmarse", () => {
    expect(resetPasswordSchema.safeParse({ password: "corta", confirm: "corta" }).success).toBe(false);
    const mismatch = resetPasswordSchema.safeParse({ password: "suficiente1", confirm: "suficiente2" });
    expect(mismatch.success).toBe(false);
    expect(fieldErrors(mismatch.error!)).toEqual({ confirm: "Las contraseñas no coinciden" });
    expect(resetPasswordSchema.safeParse({ password: "suficiente1", confirm: "suficiente1" }).success).toBe(
      true,
    );
  });
});
