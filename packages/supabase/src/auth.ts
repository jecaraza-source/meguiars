import {
  authErrorMessage,
  buildAuthState,
  fail,
  ok,
  type AuthState,
  type Result,
  type SessionUser,
} from "@meguiars/domain";
import type { MeguiarsSupabaseClient } from "./client";
import { toRepoError } from "./errors";
import { createAccessRepository } from "./repositories/access";

const authFail = <T>(error: { code?: string; status?: number; message?: string }): Result<T> =>
  fail("validation", authErrorMessage(error), error.code);

/**
 * Estado de sesión validado contra Supabase Auth (getUser consulta al servidor,
 * no sólo el JWT local): perfil, accesos y centro activo.
 */
export async function loadAuthState(
  client: MeguiarsSupabaseClient,
  preferredCenterId?: string | null,
): Promise<Result<AuthState>> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return ok({ status: "signed_out" });

  const profile = await client
    .from("profiles")
    .select("id, full_name, active, last_detail_center_id")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profile.error) return { ok: false, error: toRepoError(profile.error) };
  if (!profile.data) return ok({ status: "signed_out" });

  const user: SessionUser = {
    id: data.user.id,
    email: data.user.email ?? "",
    fullName: profile.data.full_name,
    active: profile.data.active,
    lastDetailCenterId: profile.data.last_detail_center_id,
  };
  if (!user.active) return ok(buildAuthState(user, []));

  const access = await createAccessRepository(client).listMyAccess();
  if (!access.ok) return access;
  return ok(buildAuthState(user, access.data, preferredCenterId));
}

export async function signInWithPassword(
  client: MeguiarsSupabaseClient,
  credentials: { email: string; password: string },
): Promise<Result<{ userId: string }>> {
  try {
    const { data, error } = await client.auth.signInWithPassword(credentials);
    if (error) return authFail(error);
    return ok({ userId: data.user.id });
  } catch (error) {
    return authFail({ status: 0, message: String(error) });
  }
}

/**
 * Envía el enlace de recuperación. Responde ok aunque el correo no exista
 * (Supabase no lo revela); sólo falla por límite de envíos o red.
 */
export async function sendPasswordReset(
  client: MeguiarsSupabaseClient,
  email: string,
  redirectTo: string,
): Promise<Result<null>> {
  try {
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return authFail(error);
    return ok(null);
  } catch (error) {
    return authFail({ status: 0, message: String(error) });
  }
}

/** Canjea el enlace de recuperación (código PKCE o token_hash) por una sesión. */
export async function exchangeRecoveryLink(
  client: MeguiarsSupabaseClient,
  params: { code?: string | null; tokenHash?: string | null },
): Promise<Result<null>> {
  try {
    if (params.code) {
      const { error } = await client.auth.exchangeCodeForSession(params.code);
      if (error) return authFail(error);
      return ok(null);
    }
    if (params.tokenHash) {
      const { error } = await client.auth.verifyOtp({ token_hash: params.tokenHash, type: "recovery" });
      if (error) return authFail(error);
      return ok(null);
    }
    return authFail({ code: "otp_expired" });
  } catch (error) {
    return authFail({ status: 0, message: String(error) });
  }
}

export async function updatePassword(
  client: MeguiarsSupabaseClient,
  password: string,
): Promise<Result<null>> {
  try {
    const { error } = await client.auth.updateUser({ password });
    if (error) return authFail(error);
    return ok(null);
  } catch (error) {
    return authFail({ status: 0, message: String(error) });
  }
}

export async function signOut(client: MeguiarsSupabaseClient): Promise<void> {
  // scope local: cierra la sesión de este dispositivo; los demás siguen activos.
  await client.auth.signOut({ scope: "local" });
}

/** Guarda el centro activo en el perfil (RPC; valida acceso en el servidor). */
export async function setActiveCenter(
  client: MeguiarsSupabaseClient,
  detailCenterId: string,
): Promise<Result<string>> {
  try {
    const { data, error } = await client.rpc("set_active_center", { p_detail_center_id: detailCenterId });
    if (error) return { ok: false, error: toRepoError(error) };
    return ok(data);
  } catch (error) {
    return { ok: false, error: toRepoError(error) };
  }
}
