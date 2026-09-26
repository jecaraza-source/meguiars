import { isValidTimeZone } from "../time";

/**
 * Conversión entre hora local de un centro y UTC con Intl (sin dependencias).
 * La agenda guarda UTC; el usuario captura y ve la hora del centro.
 */

function offsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - utcMs) / 60000);
}

/** "2026-10-01" + "10:00" en `timeZone` → instante UTC (ISO). */
export function zonedToUtc(date: string, time: string, timeZone: string): string {
  if (!isValidTimeZone(timeZone)) throw new RangeError(`Zona horaria inválida: ${timeZone}`);
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) throw new RangeError("Fecha u hora inválida");
  const naive = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  // Dos pasadas: el offset puede cambiar alrededor de un cambio de horario.
  let utc = naive - offsetMinutes(naive, timeZone) * 60000;
  utc = naive - offsetMinutes(utc, timeZone) * 60000;
  return new Date(utc).toISOString();
}

/** Instante UTC → fecha y hora locales del centro ("2026-10-01", "10:00"). */
export function utcToZoned(utc: string | Date, timeZone: string): { date: string; time: string } {
  const ms = new Date(utc).getTime();
  const local = new Date(ms + offsetMinutes(ms, timeZone) * 60000);
  const iso = local.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** Fecha de hoy en la zona del centro. */
export const todayIn = (timeZone: string, now: Date = new Date()): string => utcToZoned(now, timeZone).date;

/** Suma días a una fecha "YYYY-MM-DD" (calendario, sin zona). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
