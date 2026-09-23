/**
 * Resultado de una operación de repositorio. Los adaptadores traducen los
 * errores de infraestructura a estos tipos para que la UI distinga
 * explícitamente permiso denegado, no encontrado y validación.
 */
export type RepoErrorKind =
  "permission_denied" | "not_found" | "validation" | "conflict" | "unavailable" | "unknown";

export interface RepoError {
  kind: RepoErrorKind;
  message: string;
  /** Código original (Postgres/PostgREST) para diagnóstico. */
  code?: string;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: RepoError };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const fail = <T = never>(kind: RepoErrorKind, message: string, code?: string): Result<T> => ({
  ok: false,
  error: code === undefined ? { kind, message } : { kind, message, code },
});
