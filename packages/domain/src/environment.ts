/**
 * Ambientes de despliegue. Cada uno usa su propio proyecto Supabase (ver
 * docs/modules/ci-cd.md); la UI de ambientes que no son producción muestra un
 * aviso para no confundir datos de prueba con datos reales.
 */
export const APP_ENVIRONMENTS = ["local", "preview", "production"] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

/** Alias aceptados: los de Vercel (`VERCEL_ENV`) y los perfiles de EAS. */
const ALIASES: Record<string, AppEnvironment> = {
  local: "local",
  development: "local",
  dev: "local",
  preview: "preview",
  staging: "preview",
  production: "production",
  prod: "production",
};

/**
 * Normaliza el ambiente declarado. Sin valor es `local`; un valor desconocido
 * es un error de configuración (mejor fallar en el build que desplegar a ciegas).
 */
export function resolveAppEnvironment(raw: string | undefined | null): AppEnvironment {
  const value = raw?.trim().toLowerCase();
  if (!value) return "local";
  const env = ALIASES[value];
  if (!env) throw new Error(`Ambiente desconocido: "${raw}". Usa ${APP_ENVIRONMENTS.join(", ")}.`);
  return env;
}

export interface EnvironmentBanner {
  label: string;
  message: string;
  tone: "info" | "warning";
}

const BANNERS: Record<AppEnvironment, EnvironmentBanner | null> = {
  local: { label: "Local", message: "Ambiente de desarrollo.", tone: "info" },
  preview: {
    label: "Preview",
    message: "Versión de prueba para revisar cambios; no es producción.",
    tone: "warning",
  },
  production: null,
};

/** Aviso visible en web y móvil; `null` en producción. */
export function environmentBanner(env: AppEnvironment): EnvironmentBanner | null {
  return BANNERS[env];
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "10.0.2.2", "[::1]"]);

/**
 * Regla de despliegue: un build de preview o producción no puede apuntar a un
 * Supabase local (casi siempre es un `.env` copiado por error).
 */
export function checkSupabaseTarget(env: AppEnvironment, supabaseUrl: string | null | undefined) {
  if (!supabaseUrl || env === "local") return;
  const host = new URL(supabaseUrl).hostname;
  if (LOCAL_HOSTS.has(host)) {
    throw new Error(`El ambiente "${env}" no puede usar un Supabase local (${host}).`);
  }
}
