import { z } from "zod";

/**
 * Variables públicas de Supabase. Sólo la llave pública (anon/publishable):
 * la service_role nunca se usa en web cliente ni en móvil.
 */
export const supabasePublicEnvSchema = z.object({
  url: z.url(),
  publicKey: z.string().min(20),
});
export type SupabasePublicEnv = z.infer<typeof supabasePublicEnvSchema>;

/**
 * Lee la configuración pública. Devuelve `null` si falta (la UI muestra un
 * estado "sin configurar") y lanza si está presente pero mal formada.
 */
export function parseSupabasePublicEnv(
  url: string | undefined,
  publicKey: string | undefined,
): SupabasePublicEnv | null {
  if (!url && !publicKey) return null;
  const parsed = supabasePublicEnvSchema.safeParse({ url, publicKey });
  if (!parsed.success) {
    throw new Error(`Configuración de Supabase inválida: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
