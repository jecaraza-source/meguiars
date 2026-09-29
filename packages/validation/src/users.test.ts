import { describe, expect, it } from "vitest";
import { newUserSchema, setPasswordSchema } from "./users";

const ORG = "0e000000-0000-4000-8000-000000000001";
const A = "aaaaaaaa-0000-4000-8000-000000000000";
const base = {
  organizationId: ORG,
  fullName: " Elena Encargada ",
  email: " Elena@Ejemplo.COM ",
  password: "segura123",
  confirmPassword: "segura123",
  accessKind: "centro",
  role: "encargado",
  centerIds: A,
  reason: "Alta de personal",
};
const issues = (input: object) => {
  const r = newUserSchema.safeParse({ ...base, ...input });
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("alta de usuario", () => {
  it("normaliza nombre, correo (minúsculas) y centros", () => {
    expect(newUserSchema.parse(base)).toMatchObject({
      fullName: "Elena Encargada",
      email: "elena@ejemplo.com",
      centerIds: [A],
    });
  });
  it("contraseña mínima de 8 y confirmación", () => {
    expect(issues({ password: "1234567", confirmPassword: "1234567" })).toEqual([
      "password: Mínimo 8 caracteres",
    ]);
    expect(issues({ confirmPassword: "otra12345" })).toEqual([
      "confirmPassword: Las contraseñas no coinciden",
    ]);
  });
  it("acceso por centro exige rol y centros; corporativo no", () => {
    expect(issues({ role: "", centerIds: [] })).toEqual([
      "role: Elige el rol",
      "centerIds: Elige al menos un centro",
    ]);
    expect(issues({ accessKind: "corporativo", role: "", centerIds: [] })).toEqual([]);
  });
  it("correo y motivo", () => {
    expect(issues({ email: "no-es-correo" })).toEqual(["email: Correo inválido"]);
    expect(issues({ reason: "" }).length).toBe(1);
  });
});

describe("cambio de contraseña", () => {
  it("valida longitud y confirmación", () => {
    expect(
      setPasswordSchema.safeParse({ userId: A, password: "nueva1234", confirmPassword: "nueva1234" }).success,
    ).toBe(true);
    expect(
      setPasswordSchema.safeParse({ userId: A, password: "nueva1234", confirmPassword: "x" }).success,
    ).toBe(false);
  });
});
