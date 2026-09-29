import "server-only";
import { createMeguiarsClient, type MeguiarsSupabaseClient } from "@meguiars/supabase";
import { supabaseEnv } from "./env";

/**
 * Cliente con la llave de servicio, SÓLO para la evaluación programada de
 * alertas (/api/cron/alertas). Nunca se importa en componentes de cliente
 * ("server-only") ni en móvil. La base limita lo que puede hacer: registrar
 * corridas y leer hechos con los permisos del autor de cada regla.
 */
export function createSupabaseServiceClient(): MeguiarsSupabaseClient | null {
  const env = supabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env || !key) return null;
  return createMeguiarsClient(
    { url: env.url, publicKey: key },
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}
