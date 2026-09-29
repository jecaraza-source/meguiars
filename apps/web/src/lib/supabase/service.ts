import "server-only";
import { createMeguiarsClient, type MeguiarsSupabaseClient } from "@meguiars/supabase";
import { supabaseEnv } from "./env";

/**
 * Cliente con la llave de servicio. SÓLO en el servidor web ("server-only";
 * nunca en componentes de cliente ni en móvil) y para dos usos:
 * - la evaluación programada de alertas (/api/cron/alertas): registra corridas
 *   y lee hechos con los permisos del autor de cada regla;
 * - Usuarios (app/actions/users.ts): crear cuentas y cambiar contraseñas (Auth
 *   Admin API), siempre después de comprobar con la sesión del admin
 *   corporativo (public.can_admin_user).
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
