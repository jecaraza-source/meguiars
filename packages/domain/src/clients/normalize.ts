/**
 * Normalización de datos de contacto. Es la misma regla que las funciones
 * private.normalize_* de la migración 20260927000000 (los casos de prueba de
 * normalize.test.ts y clients_vehicles.test.sql coinciden), así que web, móvil
 * y base de datos guardan exactamente el mismo valor.
 */

/** Teléfono a E.164; 10 dígitos sin "+" son de México (+52). `null` si no es válido. */
export function normalizePhone(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  let result: string | null = null;
  if (raw.startsWith("+")) result = `+${digits}`;
  else if (digits.length === 10) result = `+52${digits}`;
  else if (digits.length === 12 && digits.startsWith("52")) result = `+${digits}`;
  else if (digits.length === 13 && digits.startsWith("521")) result = `+52${digits.slice(3)}`;
  return result && /^\+[1-9]\d{7,14}$/.test(result) ? result : null;
}

/** Placa o identificador: mayúsculas, sólo letras y dígitos. `null` si queda vacío. */
export function normalizePlate(value: string | null | undefined): string | null {
  const result = (value ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return result === "" ? null : result;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Email en minúsculas. `null` si está vacío o no tiene forma de email. */
export function normalizeEmail(value: string | null | undefined): string | null {
  const result = (value ?? "").trim().toLowerCase();
  return result.length <= 254 && EMAIL.test(result) ? result : null;
}

/** Nombre con espacios simples (se guarda así). */
export function cleanName(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

/** Presentación: +52 55 1234 5678 para México; el resto, tal cual en E.164. */
export function formatPhone(e164: string): string {
  const mx = /^\+52(\d{2})(\d{4})(\d{4})$/.exec(e164);
  return mx ? `+52 ${mx[1]} ${mx[2]} ${mx[3]}` : e164;
}
