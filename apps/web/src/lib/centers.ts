import "server-only";
import { centersCopy, toViewState, type CenterAccess, type ViewState } from "@meguiars/domain";
import { createAccessRepository, createMeguiarsClient } from "@meguiars/supabase";
import { parseSupabasePublicEnv } from "@meguiars/validation";

/**
 * Caso de uso "Mis centros" en el servidor: centros visibles con los roles
 * efectivos del usuario y su acceso corporativo. Usa la llave pública: sin
 * sesión, RLS/grants rechazan la consulta y la vista muestra "permiso denegado".
 * TODO(auth): tomar la sesión de las cookies cuando exista el módulo de Auth.
 */
export async function loadMyCenters(): Promise<ViewState<CenterAccess[]>> {
  const env = parseSupabasePublicEnv(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (!env) return { status: "error", message: centersCopy.notConfigured };

  const client = createMeguiarsClient(env, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await createAccessRepository(client).listMyAccess();
  return toViewState(result);
}
