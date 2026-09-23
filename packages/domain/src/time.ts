/**
 * Regla: las fechas se almacenan en UTC y se presentan en la zona
 * horaria configurada del centro.
 */

export const DEFAULT_TIME_ZONE = "America/Mexico_City";

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Serializa un instante a ISO-8601 en UTC (formato que se persiste). */
export function toUtcIso(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Fecha inválida: ${String(value)}`);
  }
  return date.toISOString();
}

export interface FormatInCenterOptions {
  locale?: string;
  dateStyle?: Intl.DateTimeFormatOptions["dateStyle"];
  timeStyle?: Intl.DateTimeFormatOptions["timeStyle"];
}

/** Presenta un instante UTC en la zona horaria del centro. */
export function formatInCenterTimeZone(
  utc: Date | string | number,
  timeZone: string,
  { locale = "es-MX", dateStyle = "medium", timeStyle = "short" }: FormatInCenterOptions = {},
): string {
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError(`Zona horaria inválida: ${timeZone}`);
  }
  return new Intl.DateTimeFormat(locale, { timeZone, dateStyle, timeStyle }).format(new Date(toUtcIso(utc)));
}
