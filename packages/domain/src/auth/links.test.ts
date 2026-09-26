import { describe, expect, it } from "vitest";
import { isAuthRedirect, parseAuthRedirect } from "./links";

describe("parseAuthRedirect", () => {
  it("lee el código PKCE del deep link móvil", () => {
    expect(parseAuthRedirect("meguiars://auth/confirm?code=abc-123")).toEqual({
      code: "abc-123",
      tokenHash: null,
      type: null,
      errorCode: null,
    });
  });

  it("lee token_hash y type de la plantilla de correo", () => {
    const p = parseAuthRedirect(
      "https://app.mx/auth/confirm?token_hash=h%2Fx&type=recovery&next=/restablecer",
    );
    expect(p.tokenHash).toBe("h/x");
    expect(p.type).toBe("recovery");
  });

  it("lee errores del fragmento (enlace expirado)", () => {
    const p = parseAuthRedirect(
      "meguiars://auth/confirm#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid",
    );
    expect(p.errorCode).toBe("otp_expired");
    expect(p.code).toBeNull();
  });

  it("reconoce sólo la ruta de retorno de auth", () => {
    expect(isAuthRedirect("meguiars://auth/confirm?code=x")).toBe(true);
    expect(isAuthRedirect("exp://192.168.0.2:8081/--/auth/confirm#error=x")).toBe(true);
    expect(isAuthRedirect("meguiars://otra/ruta")).toBe(false);
  });
});
