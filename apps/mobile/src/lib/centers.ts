import { centersCopy, toViewState, type DetailCenter, type ViewState } from "@meguiars/domain";
import { createDetailCenterRepository, createMeguiarsClient } from "@meguiars/supabase";
import { parseSupabasePublicEnv } from "@meguiars/validation";

/**
 * Caso de uso "Mis centros" en móvil (misma lógica que apps/web/src/lib/centers.ts).
 * Las variables EXPO_PUBLIC_* se incrustan en el bundle: deben leerse de forma literal.
 * TODO(auth): persistir la sesión con SecureStore cuando exista el módulo de Auth.
 */
export async function loadVisibleCenters(): Promise<ViewState<DetailCenter[]>> {
  const env = parseSupabasePublicEnv(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (!env) return { status: "error", message: centersCopy.notConfigured };

  const client = createMeguiarsClient(env, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await createDetailCenterRepository(client).listVisible();
  return toViewState(result);
}
