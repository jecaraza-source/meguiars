import { describe, expect, it } from "vitest";
import { redactPii, toErrorReport } from "./observability";

describe("reporte de error sin datos personales", () => {
  it("enmascara correos, teléfonos, tokens y llaves; conserva uuids y folios", () => {
    const text =
      "Falló para ana.lopez+1@correo.com.mx tel 55 1234-5678 (+52 81 8000 1234) token eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.abc sb_secret_abcdefghijklmnop orden 0d000000-0000-4000-8000-000000000006 folio CDMX-01-000123 total 1890.00";
    const out = redactPii(text);
    expect(out).not.toMatch(/ana\.lopez|1234-5678|8000 1234|eyJ|sb_secret/);
    expect(out).toContain("[correo]");
    expect(out).toContain("[teléfono]");
    expect(out).toContain("[token]");
    expect(out).toContain("[llave]");
    expect(out).toContain("0d000000-0000-4000-8000-000000000006");
    expect(out).toContain("CDMX-01-000123");
    expect(out).toContain("1890.00");
  });

  it("quita la query de la ruta, recorta el mensaje y conserva digest y request id", () => {
    const error = Object.assign(new Error(`x${"y".repeat(400)}`), { digest: "123456789" });
    const report = toErrorReport(error, {
      source: "web",
      path: "/clientes?q=Juan%20P%C3%A9rez&tel=5512345678",
      method: "GET",
      route: "/clientes",
      kind: "render",
      requestId: "iad1::abc-123",
    });
    expect(report).toMatchObject({
      level: "error",
      source: "web",
      name: "Error",
      digest: "123456789",
      path: "/clientes",
      requestId: "iad1::abc-123",
    });
    expect(report.message.length).toBeLessThanOrEqual(301);
  });

  it("acepta valores que no son Error", () => {
    expect(toErrorReport("falló con 5512345678", { source: "mobile" })).toMatchObject({
      name: "string",
      message: "falló con [teléfono]",
    });
    expect(toErrorReport(null, { source: "mobile" }).message).toBe("Error sin mensaje");
  });
});
