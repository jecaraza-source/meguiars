import type { RepoError } from "../result";
import type { ClientMatch, Vehicle } from "./client";
import { clientsCopy, DUPLICATE_FIELD_LABELS } from "./copy";

/** SQLSTATE con el que create_client / update_client señalan un posible duplicado. */
export const POSSIBLE_DUPLICATE_CODE = "MG001";

export const isPossibleDuplicate = (error: RepoError): boolean => error.code === POSSIBLE_DUPLICATE_CODE;

/** "Coincide por teléfono y placa". */
export function describeMatch(match: ClientMatch): string {
  const fields = match.matchedOn.map((f) => DUPLICATE_FIELD_LABELS[f]);
  const list = fields.length > 1 ? `${fields.slice(0, -1).join(", ")} y ${fields.at(-1)}` : (fields[0] ?? "");
  return `Coincide por ${list} · ${match.phoneHint} · ${match.homeCenterName}`;
}

/** Mensaje para errores de clientes (conflictos de placa, duplicados, permisos). */
export function clientErrorMessage(error: RepoError): string {
  if (isPossibleDuplicate(error)) return clientsCopy.duplicateMessage;
  if (error.code === "23505") return clientsCopy.plateTaken;
  if (error.kind === "permission_denied") return clientsCopy.notFound;
  return error.message;
}

export function vehicleLabel(vehicle: Pick<Vehicle, "make" | "model" | "year" | "plate">): string {
  return `${vehicle.make} ${vehicle.model} ${vehicle.year} · ${vehicle.plate}`;
}

/** Año máximo aceptado para un vehículo (modelos del año siguiente). */
export function maxVehicleYear(now: Date = new Date()): number {
  return now.getUTCFullYear() + 1;
}

/**
 * Llave de idempotencia de un formulario (UUID v4). Usa crypto.randomUUID si
 * existe; si no (algunos motores móviles), un v4 con Math.random, suficiente
 * porque sólo distingue envíos, no protege nada.
 */
export function newRequestId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === "x" ? r : (r % 4) + 8).toString(16);
  });
}
