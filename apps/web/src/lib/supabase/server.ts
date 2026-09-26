import "server-only";
import type { Database } from "@meguiars/supabase";
import { parseSupabasePublicEnv } from "@meguiars/validation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SESSION_COOKIE_OPTIONS } from "./cookies";

export function supabaseEnv() {
  return parseSupabasePublicEnv(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Cliente Supabase ligado a las cookies de la petición (sesión httpOnly
 * gestionada por @supabase/ssr). En Server Components las cookies son de sólo
 * lectura: el refresco de sesión lo escribe proxy.ts.
 */
export async function createSupabaseServerClient() {
  // Leer cookies primero hace dinámica toda página que dependa de la sesión,
  // incluso sin configuración (nunca se prerenderiza una página privada).
  const cookieStore = await cookies();
  const env = supabaseEnv();
  if (!env) return null;
  return createServerClient<Database>(env.url, env.publicKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Llamado desde un Server Component: proxy.ts ya refrescó la sesión.
        }
      },
    },
  });
}
