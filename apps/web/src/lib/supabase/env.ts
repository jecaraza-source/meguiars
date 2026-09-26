import { checkSupabaseTarget, resolveAppEnvironment } from "@meguiars/domain";
import { parseSupabasePublicEnv } from "@meguiars/validation";

/**
 * Ambiente de este despliegue: `NEXT_PUBLIC_APP_ENV` o, en Vercel, `VERCEL_ENV`
 * (development | preview | production). Sin ninguno, `local`.
 */
export function appEnvironment() {
  return resolveAppEnvironment(process.env.NEXT_PUBLIC_APP_ENV || process.env.VERCEL_ENV);
}

/** Configuración pública de Supabase, validada contra el ambiente. */
export function supabaseEnv() {
  const env = parseSupabasePublicEnv(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  checkSupabaseTarget(appEnvironment(), env?.url);
  return env;
}
