import { describe, expect, it } from "vitest";
import { accountLabel, parseLoginIdentifier } from "./login";

describe("acceso con correo o celular", () => {
  it("con «@» es correo (en minúsculas); si no, celular en E.164", () => {
    expect(parseLoginIdentifier(" Ana@Empresa.MX ")).toEqual({ email: "ana@empresa.mx" });
    expect(parseLoginIdentifier("55 1234 5678")).toEqual({ phone: "+525512345678" });
    expect(parseLoginIdentifier("+52 1 55 1234 5678")).toEqual({ phone: "+5215512345678" });
    expect(parseLoginIdentifier("5215512345678")).toEqual({ phone: "+525512345678" });
  });
  it("rechaza lo que no es correo ni celular", () => {
    for (const v of ["", "   ", "ana@", "12345", "hola"]) expect(parseLoginIdentifier(v)).toBeNull();
  });
  it("la cuenta se muestra con el correo o con el celular con formato", () => {
    expect(accountLabel({ email: "ana@empresa.mx", phone: "525512345678" })).toBe("ana@empresa.mx");
    expect(accountLabel({ email: null, phone: "525512345678" })).toBe("+52 55 1234 5678");
    expect(accountLabel({ email: "", phone: null })).toBe("");
  });
});
