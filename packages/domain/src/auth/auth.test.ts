import { describe, expect, it } from "vitest";
import type { CenterAccess } from "../access/access";
import type { AppRole } from "../roles";
import { authErrorMessage } from "./errors";
import { authCopy } from "./copy";
import { evaluateGuard, guardScreen } from "./guards";
import {
  activeRoles,
  buildAuthState,
  canInActiveCenter,
  resolveActiveCenterId,
  switchActiveCenter,
  type SessionUser,
  type SignedInState,
} from "./session";

const access = (id: string, roles: AppRole[], active = true): CenterAccess => ({
  center: {
    id,
    organizationId: "o1",
    code: id,
    name: id,
    timezone: "UTC",
    active,
    createdAt: "",
    updatedAt: "",
  },
  organizationName: "Demo",
  roles,
  corporateRoles: [],
});

const user = (over: Partial<SessionUser> = {}): SessionUser => ({
  id: "u1",
  email: "u@demo.mx",
  fullName: "Usuario",
  active: true,
  lastDetailCenterId: null,
  ...over,
});

const A = access("A", ["encargado"]);
const B = access("B", ["contador"]);
const X = access("X", ["admin_socio"], false);

describe("centro activo", () => {
  it("con un solo centro utilizable lo selecciona solo", () => {
    expect(resolveActiveCenterId([A, X], [])).toBe("A");
  });

  it("con varios centros exige elegir, salvo que haya uno guardado válido", () => {
    expect(resolveActiveCenterId([A, B], [])).toBeNull();
    expect(resolveActiveCenterId([A, B], [null, "B"])).toBe("B");
  });

  it("ignora un centro guardado que ya no es utilizable (deshabilitado o sin acceso)", () => {
    expect(resolveActiveCenterId([A, B, X], ["X"])).toBeNull();
    expect(resolveActiveCenterId([A, B], ["Z"])).toBeNull();
  });

  it("la elección reciente gana a la guardada en el perfil", () => {
    const state = buildAuthState(user({ lastDetailCenterId: "A" }), [A, B], "B");
    expect(state.status === "signed_in" && state.activeCenterId).toBe("B");
  });

  it("cambiar de centro cambia roles y permisos sin arrastrar los del anterior", () => {
    const state = buildAuthState(user(), [A, B], "A") as SignedInState;
    expect(activeRoles(state)).toEqual(["encargado"]);
    expect(canInActiveCenter(state, "operations.write")).toBe(true);
    const switched = switchActiveCenter(state, "B");
    expect(activeRoles(switched)).toEqual(["contador"]);
    expect(canInActiveCenter(switched, "operations.write")).toBe(false);
    expect(canInActiveCenter(switched, "audit.read")).toBe(true);
    expect(() => switchActiveCenter(state, "X")).toThrow();
  });
});

describe("estado de sesión", () => {
  it("sin usuario: signed_out; perfil inactivo: disabled", () => {
    expect(buildAuthState(null, [])).toEqual({ status: "signed_out" });
    expect(buildAuthState(user({ active: false }), [A])).toEqual({ status: "disabled", email: "u@demo.mx" });
  });
});

describe("guards por rol", () => {
  const signedIn = (centers: CenterAccess[], active: string | null) =>
    ({ status: "signed_in", user: user(), access: centers, activeCenterId: active }) as const;

  it("redirige a login sin sesión y a cuenta deshabilitada", () => {
    expect(guardScreen({ status: "signed_out" }, "home")).toEqual({ allow: false, redirect: "login" });
    expect(guardScreen({ status: "loading" }, "account")).toEqual({ allow: false, redirect: "login" });
    expect(guardScreen({ status: "disabled", email: "x" }, "home")).toEqual({
      allow: false,
      redirect: "disabled",
    });
  });

  it("exige elegir centro cuando hay varios y avisa si no hay ninguno", () => {
    expect(guardScreen(signedIn([A, B], null), "home")).toEqual({ allow: false, redirect: "select_center" });
    expect(guardScreen(signedIn([X], null), "home")).toEqual({ allow: false, redirect: "no_centers" });
    expect(guardScreen(signedIn([A, B], null), "selectCenter")).toEqual({ allow: true });
    expect(guardScreen(signedIn([], null), "account")).toEqual({ allow: true });
  });

  it("equipo: encargado y contador sí; operador no", () => {
    expect(guardScreen(signedIn([A], "A"), "team")).toEqual({ allow: true });
    expect(guardScreen(signedIn([B], "B"), "team")).toEqual({ allow: true });
    const op = access("C", ["operador_recepcion"]);
    expect(guardScreen(signedIn([op], "C"), "team")).toEqual({ allow: false, redirect: "forbidden" });
  });

  it("ejecución de OS: roles con órdenes sí; el contador no (igual que la RLS de evidencias)", () => {
    expect(guardScreen(signedIn([A], "A"), "orderExecution")).toEqual({ allow: true });
    expect(guardScreen(signedIn([B], "B"), "orderExecution")).toEqual({
      allow: false,
      redirect: "forbidden",
    });
    // Insumos: lectura con el catálogo (el contador sí los consulta).
    expect(guardScreen(signedIn([B], "B"), "supplies")).toEqual({ allow: true });
  });

  it("editar centro: sólo admin_socio; el contador (sólo lectura) no", () => {
    const socio = access("S", ["admin_socio"]);
    expect(guardScreen(signedIn([socio], "S"), "editCenter")).toEqual({ allow: true });
    expect(guardScreen(signedIn([B], "B"), "editCenter")).toEqual({ allow: false, redirect: "forbidden" });
    expect(evaluateGuard(signedIn([A], "A"), { capability: "center.manage" }).allow).toBe(false);
  });
});

describe("mensajes de error de Auth", () => {
  it("no distingue entre correo inexistente y contraseña incorrecta", () => {
    expect(authErrorMessage({ code: "invalid_credentials" })).toBe(authCopy.errors.invalidCredentials);
    expect(authErrorMessage({ code: "user_not_found" })).toBe(authCopy.errors.invalidCredentials);
  });

  it("traduce cuenta deshabilitada, enlaces expirados y red", () => {
    expect(authErrorMessage({ code: "user_banned" })).toBe(authCopy.errors.disabled);
    expect(authErrorMessage({ code: "otp_expired" })).toBe(authCopy.errors.sessionExpired);
    expect(authErrorMessage({ status: 0, message: "Failed to fetch" })).toBe(authCopy.errors.network);
    expect(authErrorMessage(null)).toBe(authCopy.errors.unknown);
  });
});
