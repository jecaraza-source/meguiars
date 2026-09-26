import { describe, expect, it } from "vitest";
import { checkSupabaseTarget, environmentBanner, resolveAppEnvironment } from "./environment";

describe("resolveAppEnvironment", () => {
  it("sin valor es local", () => {
    expect(resolveAppEnvironment(undefined)).toBe("local");
    expect(resolveAppEnvironment("")).toBe("local");
  });

  it("acepta los valores de VERCEL_ENV y de los perfiles de EAS", () => {
    expect(resolveAppEnvironment("development")).toBe("local");
    expect(resolveAppEnvironment("preview")).toBe("preview");
    expect(resolveAppEnvironment("staging")).toBe("preview");
    expect(resolveAppEnvironment(" Production ")).toBe("production");
  });

  it("falla con un ambiente desconocido", () => {
    expect(() => resolveAppEnvironment("qa")).toThrow(/desconocido/);
  });
});

describe("environmentBanner", () => {
  it("avisa fuera de producción y no en producción", () => {
    expect(environmentBanner("preview")?.tone).toBe("warning");
    expect(environmentBanner("local")?.label).toBe("Local");
    expect(environmentBanner("production")).toBeNull();
  });
});

describe("checkSupabaseTarget", () => {
  it("preview y producción no pueden usar un Supabase local", () => {
    expect(() => checkSupabaseTarget("production", "http://127.0.0.1:54321")).toThrow(/local/);
    expect(() => checkSupabaseTarget("preview", "http://localhost:54321")).toThrow(/local/);
  });

  it("permite proyectos remotos, local con cualquiera y la falta de configuración", () => {
    expect(() => checkSupabaseTarget("production", "https://abc.supabase.co")).not.toThrow();
    expect(() => checkSupabaseTarget("local", "http://127.0.0.1:54321")).not.toThrow();
    expect(() => checkSupabaseTarget("production", undefined)).not.toThrow();
  });
});
