import { createClient, type SupabaseClient, type SupabaseClientOptions } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type MeguiarsSupabaseClient = SupabaseClient<Database>;

/**
 * Crea el cliente Supabase tipado. Cada plataforma pasa su propio
 * almacenamiento de sesión (cookies en web, AsyncStorage/SecureStore en móvil).
 * Usa siempre la llave pública (anon/publishable): la autorización la aplica RLS.
 */
export function createMeguiarsClient(
  url: string | undefined,
  publicKey: string | undefined,
  options?: SupabaseClientOptions<"public">,
): MeguiarsSupabaseClient {
  if (!url || !publicKey) {
    throw new Error("Faltan variables de entorno de Supabase (URL y llave pública)");
  }
  return createClient<Database>(url, publicKey, options);
}
