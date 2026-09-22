import "server-only";
import { centersCopy, toViewState, type DetailCenter, type ViewState } from "@meguiars/domain";
import { createDetailCenterRepository, createMeguiarsClient } from "@meguiars/supabase";
import { parseSupabasePublicEnv } from "@meguiars/validation";

/**
 * Caso de uso "Mis centros" en el servidor. Usa la llave pública: sin sesión
 * RLS rechaza la consulta y la vista muestra "permiso denegado".
 * TODO(auth): tomar la sesión de las cookies cuando exista el módulo de Auth.
 */
export async function loadVisibleCenters(): Promise<ViewState<DetailCenter[]>> {
  const env = parseSupabasePublicEnv(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (!env) return { status: "error", message: centersCopy.notConfigured };

  const client = createMeguiarsClient(env, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await createDetailCenterRepository(client).listVisible();
  return toViewState(result);
}
