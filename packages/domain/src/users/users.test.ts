import { describe, expect, it } from "vitest";
import { can, guardScreen, navScreenOf, presentOrgUser, usersErrorMessage, type OrgUser } from "../index";

const user = (over: Partial<OrgUser> = {}): OrgUser => ({
  userId: "u1",
  email: "elena@ejemplo.com",
  fullName: "Elena Encargada",
  active: true,
  lastSignInAt: null,
  createdAt: null,
  corporateRoles: [],
  centerRoles: [
    { detailCenterId: "a", centerName: "CDMX", role: "encargado", active: true },
    { detailCenterId: "b", centerName: "MTY", role: "contador", active: false },
  ],
  otherOrg: false,
  ...over,
});

describe("usuarios", () => {
  it("sólo admin_socio tiene users.manage; pantalla bajo Usuarios", () => {
    expect(can(["admin_socio"], "users.manage")).toBe(true);
    expect(
      ["encargado", "contador", "operador_recepcion", "comercial_b2b"].some((r) =>
        can([r as never], "users.manage"),
      ),
    ).toBe(false);
    expect(navScreenOf("userDetail")).toBe("users");
    expect(guardScreen({ status: "signed_out" } as never, "users")).toEqual({
      allow: false,
      redirect: "login",
    });
  });
  it("presenta accesos activos, estado y último acceso", () => {
    expect(presentOrgUser(user())).toMatchObject({
      name: "Elena Encargada",
      access: "Encargado · CDMX",
      status: "Activo",
      statusTone: "success",
      lastSignIn: "Nunca",
      manageable: true,
    });
    expect(
      presentOrgUser(
        user({ corporateRoles: ["admin_socio"], centerRoles: [], active: false, otherOrg: true }),
      ),
    ).toMatchObject({
      access: "Admin / socio · corporativo",
      status: "Desactivado",
      manageable: false,
    });
    expect(presentOrgUser(user({ fullName: null, centerRoles: [] }))).toMatchObject({
      name: "elena@ejemplo.com",
      access: "Sin rol activo",
    });
  });
  it("mensajes de error", () => {
    expect(
      usersErrorMessage({
        kind: "conflict",
        message: "A user with this email address has already been registered",
      }),
    ).toBe("Ya existe una cuenta con ese correo.");
    expect(usersErrorMessage({ kind: "permission_denied", message: "" })).toMatch(/admin/);
  });
});
