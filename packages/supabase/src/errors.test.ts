import { describe, expect, it } from "vitest";
import { toRepoError } from "./errors";

describe("toRepoError", () => {
  it.each([
    ["42501", "permission_denied"],
    ["PGRST301", "permission_denied"],
    ["22023", "validation"],
    ["23514", "validation"],
    ["23505", "conflict"],
    ["PGRST116", "not_found"],
    ["XX000", "unknown"],
  ])("mapea %s a %s", (code, kind) => {
    expect(toRepoError({ code, message: "m" })).toEqual({ kind, message: "m", code });
  });

  it("detecta fallas de red como servicio no disponible", () => {
    expect(toRepoError(new TypeError("Failed to fetch")).kind).toBe("unavailable");
  });

  it("tolera errores sin forma conocida", () => {
    expect(toRepoError(undefined)).toEqual({ kind: "unknown", message: "Error desconocido" });
  });
});
