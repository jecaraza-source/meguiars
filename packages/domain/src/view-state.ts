import type { RepoError, Result } from "./result";

/**
 * Estados de pantalla comunes a web y móvil. Toda vista de datos
 * maneja explícitamente loading, empty, error y permission denied.
 */
export type ViewState<T> =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; data: T }
  | { status: "permission_denied"; message: string }
  | { status: "error"; message: string };

export function toViewState<T>(
  result: Result<T>,
  isEmpty: (data: T) => boolean = (data) => Array.isArray(data) && data.length === 0,
): ViewState<T> {
  if (!result.ok) return errorToViewState(result.error);
  return isEmpty(result.data) ? { status: "empty" } : { status: "ready", data: result.data };
}

export function errorToViewState(error: RepoError): ViewState<never> {
  if (error.kind === "permission_denied") {
    return { status: "permission_denied", message: "No tienes permiso para ver esta información." };
  }
  if (error.kind === "unavailable") {
    return { status: "error", message: "El servicio no está disponible. Intenta más tarde." };
  }
  return { status: "error", message: error.message || "Ocurrió un error inesperado." };
}
