import type { RepoError, RepoErrorKind } from "@meguiars/domain";

interface ErrorLike {
  code?: string;
  message?: string;
}

const BY_CODE: Record<string, RepoErrorKind> = {
  // Postgres
  "42501": "permission_denied", // insufficient_privilege / RLS
  "22023": "validation", // invalid_parameter_value (motivo, zona horaria)
  "23514": "validation", // check_violation
  "23502": "validation", // not_null_violation
  "22P02": "validation", // invalid_text_representation (uuid/enum)
  "23505": "conflict", // unique_violation
  "23503": "conflict", // foreign_key_violation
  MG001: "conflict", // posible cliente duplicado (create_client / update_client)
  "23P01": "conflict", // exclusion_violation: bahía o técnico ocupados
  "40001": "conflict", // la OS cambió en otro dispositivo (versión optimista)
  MG002: "validation", // regla de la OS: autorizar/entregar según canal
  // PostgREST
  PGRST116: "not_found",
  PGRST301: "permission_denied", // JWT inválido/expirado
  PGRST302: "permission_denied", // sin credenciales
};

/** Traduce errores de PostgREST/Postgres/red al tipo de dominio. */
export function toRepoError(error: unknown): RepoError {
  const e = (error ?? {}) as ErrorLike;
  const code = typeof e.code === "string" && e.code !== "" ? e.code : undefined;
  const message = typeof e.message === "string" && e.message !== "" ? e.message : "Error desconocido";
  let kind: RepoErrorKind = (code && BY_CODE[code]) || "unknown";
  if (!code && (error instanceof TypeError || /fetch|network/i.test(message))) kind = "unavailable";
  return code === undefined ? { kind, message } : { kind, message, code };
}
