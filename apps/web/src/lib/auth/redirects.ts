import type { GuardResult } from "@meguiars/domain";

type Redirect = Extract<GuardResult, { allow: false }>["redirect"];

export const GUARD_REDIRECTS: Record<Redirect, string> = {
  login: "/login",
  disabled: "/cuenta-deshabilitada",
  select_center: "/seleccionar-centro",
  no_centers: "/sin-centros",
  forbidden: "/sin-permiso",
};

/**
 * Rutas accesibles sin sesión. /api/cron se protege con CRON_SECRET (no con sesión);
 * /api/health sólo dice si la app y Supabase responden (monitoreo externo).
 */
export const PUBLIC_PATHS = [
  "/login",
  "/recuperar",
  "/auth/confirm",
  "/cuenta-deshabilitada",
  "/api/cron",
  "/api/health",
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Sólo rutas internas: evita redirecciones abiertas con ?next=. */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}
