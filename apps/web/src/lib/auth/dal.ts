import "server-only";
import { guardScreen, type AuthState, type Screen, type SignedInState } from "@meguiars/domain";
import { loadAuthState } from "@meguiars/supabase";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GUARD_REDIRECTS } from "./redirects";

/**
 * Capa de acceso a datos de autenticación: valida la sesión contra Supabase
 * Auth (no sólo la cookie) y arma el estado una vez por petición.
 */
export const getAuthState = cache(async (): Promise<AuthState> => {
  const client = await createSupabaseServerClient();
  if (!client) return { status: "signed_out" };
  const result = await loadAuthState(client);
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
});

/** Aplica el guard de la pantalla; redirige si no se cumple. */
export async function requireScreen(screen: Screen): Promise<SignedInState> {
  const state = await getAuthState();
  const result = guardScreen(state, screen);
  if (!result.allow) redirect(GUARD_REDIRECTS[result.redirect]);
  return state as SignedInState;
}
