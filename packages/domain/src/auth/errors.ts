import { authCopy } from "./copy";

/**
 * Mensaje para errores de Supabase Auth (campo `code` de AuthError). Nunca
 * revela si un correo existe: credenciales inválidas y usuario inexistente
 * producen el mismo mensaje.
 */
export function authErrorMessage(
  error: { code?: string; status?: number; message?: string } | null | undefined,
): string {
  switch (error?.code) {
    case "invalid_credentials":
    case "user_not_found":
      return authCopy.errors.invalidCredentials;
    case "email_not_confirmed":
      return authCopy.errors.emailNotConfirmed;
    case "user_banned":
      return authCopy.errors.disabled;
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return authCopy.errors.rateLimited;
    case "weak_password":
      return authCopy.errors.weakPassword;
    case "same_password":
      return authCopy.errors.samePassword;
    case "session_expired":
    case "session_not_found":
    case "refresh_token_not_found":
    case "refresh_token_already_used":
    case "otp_expired":
    case "flow_state_expired":
    case "flow_state_not_found":
    case "bad_code_verifier":
      return authCopy.errors.sessionExpired;
    default:
      if (error?.status === 0 || /fetch|network/i.test(error?.message ?? "")) return authCopy.errors.network;
      return authCopy.errors.unknown;
  }
}
