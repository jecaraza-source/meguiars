import { describe, expect, it } from "vitest";
import { parseSupabasePublicEnv } from "./env";

describe("parseSupabasePublicEnv", () => {
  it("devuelve null cuando no hay configuración", () => {
    expect(parseSupabasePublicEnv(undefined, undefined)).toBeNull();
    expect(parseSupabasePublicEnv("", "")).toBeNull();
  });

  it("acepta una configuración válida", () => {
    expect(parseSupabasePublicEnv("http://127.0.0.1:54321", "sb_publishable_1234567890abcdef")).toEqual({
      url: "http://127.0.0.1:54321",
      publicKey: "sb_publishable_1234567890abcdef",
    });
  });

  it("falla si la configuración está incompleta o mal formada", () => {
    expect(() => parseSupabasePublicEnv("no-es-url", "sb_publishable_1234567890abcdef")).toThrow(/inválida/);
    expect(() => parseSupabasePublicEnv("http://127.0.0.1:54321", undefined)).toThrow(/inválida/);
  });
});
