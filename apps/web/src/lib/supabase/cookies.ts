import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Cookies de sesión: toda la sesión web se maneja en el servidor (no hay
 * cliente Supabase de navegador), así que pueden ser httpOnly y un XSS no
 * puede leer los tokens. secure en producción (HTTPS).
 */
export const SESSION_COOKIE_OPTIONS: CookieOptionsWithName = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};
