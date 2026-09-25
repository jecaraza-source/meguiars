import { describe, expect, it } from "vitest";
import { cleanName, formatPhone, normalizeEmail, normalizePhone, normalizePlate } from "./normalize";

// Mismos casos que supabase/tests/clients_vehicles.test.sql (private.normalize_*).
describe("normalizePhone", () => {
  it.each([
    ["55 1234 5678", "+525512345678"],
    ["+52 (55) 1234-5678", "+525512345678"],
    ["521 55 1234 5678", "+525512345678"],
    ["525512345678", "+525512345678"],
    ["+1 415 555 0100", "+14155550100"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["12345", "abc", "", "+0 55 1234 5678", "+52 55 1234 5678 9999 99"])("%s es inválido", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe("normalizePlate / normalizeEmail / cleanName", () => {
  it("placa en mayúsculas sin separadores", () => {
    expect(normalizePlate(" abc-12-34 ")).toBe("ABC1234");
    expect(normalizePlate(" - ")).toBeNull();
  });

  it("email en minúsculas y con forma válida", () => {
    expect(normalizeEmail("  Ana@Correo.MX ")).toBe("ana@correo.mx");
    expect(normalizeEmail("no-es-email")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
  });

  it("nombre con espacios simples", () => {
    expect(cleanName("  José   Pérez ")).toBe("José Pérez");
  });

  it("formatea teléfonos de México para mostrar", () => {
    expect(formatPhone("+525512345678")).toBe("+52 55 1234 5678");
    expect(formatPhone("+14155550100")).toBe("+14155550100");
  });
});
