import { describe, expect, it } from "vitest";
import { fail, ok } from "./result";
import { toViewState } from "./view-state";

describe("toViewState", () => {
  it("distingue vacío de listo", () => {
    expect(toViewState(ok([]))).toEqual({ status: "empty" });
    expect(toViewState(ok([1]))).toEqual({ status: "ready", data: [1] });
  });

  it("expone permiso denegado como estado propio", () => {
    expect(toViewState(fail("permission_denied", "42501")).status).toBe("permission_denied");
  });

  it("convierte otros errores en estado de error con mensaje", () => {
    const state = toViewState(fail("unknown", "falló"));
    expect(state).toEqual({ status: "error", message: "falló" });
    expect(toViewState(fail("unavailable", "")).status).toBe("error");
  });
});
