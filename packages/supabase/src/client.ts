import { createClient, type SupabaseClient, type SupabaseClientOptions } from "@supabase/supabase-js";
import type { SupabasePublicEnv } from "@meguiars/validation";
import type { Database } from "./database.types";

export type MeguiarsSupabaseClient = SupabaseClient<Database>;

/**
 * Crea el cliente Supabase tipado con la llave pública. Cada plataforma
 * inyecta su almacenamiento de sesión (cookies en web, SecureStore/AsyncStorage
 * en móvil) vía `options.auth`. La autorización la aplica RLS.
 */
export function createMeguiarsClient(
  env: SupabasePublicEnv,
  options?: SupabaseClientOptions<"public">,
): MeguiarsSupabaseClient {
  return createClient<Database>(env.url, env.publicKey, options);
}
