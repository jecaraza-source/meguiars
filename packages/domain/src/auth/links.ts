/** Parámetros del enlace de recuperación que Supabase Auth envía a la app. */
export interface AuthRedirectParams {
  code: string | null;
  tokenHash: string | null;
  type: string | null;
  /** error_code (p. ej. otp_expired) cuando el enlace es inválido o expiró. */
  errorCode: string | null;
}

function parseParams(fragment: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const pair of fragment.split("&")) {
    if (!pair) continue;
    const [rawKey, ...rest] = pair.split("=");
    const decode = (v: string) => {
      try {
        return decodeURIComponent(v.replace(/\+/g, " "));
      } catch {
        return v;
      }
    };
    params.set(decode(rawKey ?? ""), decode(rest.join("=")));
  }
  return params;
}

/**
 * Lee query y fragmento de una URL de retorno (meguiars://auth/confirm?code=…,
 * https://…/auth/confirm?token_hash=…&type=recovery o #error_code=…). Sin
 * depender de URL/URLSearchParams, incompletos en React Native.
 */
export function parseAuthRedirect(url: string): AuthRedirectParams {
  const hashIndex = url.indexOf("#");
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : "";
  const queryIndex = beforeHash.indexOf("?");
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : "";
  const params = new Map([...parseParams(query), ...parseParams(hash)]);
  return {
    code: params.get("code") || null,
    tokenHash: params.get("token_hash") || null,
    type: params.get("type") || null,
    errorCode: params.get("error_code") || params.get("error") || null,
  };
}

/** ¿La URL es el retorno de autenticación de la app? */
export function isAuthRedirect(url: string, path = "auth/confirm"): boolean {
  return url.split(/[?#]/)[0]!.replace(/\/+$/, "").endsWith(path);
}
