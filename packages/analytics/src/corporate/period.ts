/**
 * Periodo anterior y tendencia del tablero corporativo (D3).
 *
 * Periodo anterior "equivalente": los rangos predefinidos se comparan contra el
 * mismo tramo del periodo calendario anterior (mes al día 28 contra el mes
 * anterior al día 28; año contra el año anterior a la misma fecha; semana
 * contra la semana anterior; hoy contra ayer). Un rango personalizado se
 * compara contra el mismo número de días inmediatamente antes.
 */

export type CorporatePeriodKey = "hoy" | "semana" | "mes" | "anio" | "personalizado";

const DAY_MS = 86_400_000;
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fromTime = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => fromTime(toTime(d) + n * DAY_MS);
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");

/** Mismo día en otro mes/año, recortado al fin de mes (31 → 30, 29 feb → 28 feb). */
function shiftDay(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const ty = target.getUTCFullYear();
  const tm = target.getUTCMonth();
  return `${ty}-${pad(tm + 1)}-${pad(Math.min(d, lastDayOfMonth(ty, tm)))}`;
}

export function previousPeriod(
  period: CorporatePeriodKey,
  from: string,
  to: string,
): { from: string; to: string } {
  switch (period) {
    case "hoy":
    case "semana": {
      const days = period === "hoy" ? 1 : 7;
      return { from: addDays(from, -days), to: addDays(to, -days) };
    }
    case "mes":
      return { from: shiftDay(from, -1), to: shiftDay(to, -1) };
    case "anio":
      return { from: shiftDay(from, -12), to: shiftDay(to, -12) };
    case "personalizado": {
      const days = Math.round((toTime(to) - toTime(from)) / DAY_MS) + 1;
      return { from: addDays(from, -days), to: addDays(from, -1) };
    }
  }
}

export type TrendInvalidReason =
  /** El periodo anterior empieza antes de que algún centro operara (o no tiene actividad). */
  | "sin_historia"
  /** El valor anterior es 0: un cambio porcentual no significa nada. */
  | "sin_base"
  /** No se pudo leer el periodo anterior (periodo fuera de rango o sin permiso). */
  | "sin_periodo";

export type Trend =
  | {
      status: "ok";
      previous: number;
      /** Cambio: % sobre el anterior (moneda, conteos) o puntos (porcentajes y razones). */
      delta: number;
      mode: "percent" | "points";
      direction: "up" | "down" | "flat";
      /** ¿El cambio es favorable? null si no cambió. */
      favorable: boolean | null;
    }
  | { status: "invalid"; previous: number | null; reason: TrendInvalidReason };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Tendencia contra el periodo anterior "cuando es válida": todos los centros
 * operaban desde el inicio del periodo anterior y, para cambios porcentuales,
 * el valor anterior no es 0. Porcentajes y razones se comparan en puntos.
 */
export function trendOf(input: {
  unit: string;
  higherIsBetter: boolean;
  current: number;
  previous: number | null;
  /** Primer día con actividad de cada centro evaluado (null = sin actividad). */
  firstActivity: readonly (string | null)[];
  previousFrom: string | null;
}): Trend {
  const { current, previous, previousFrom } = input;
  if (previous === null || previousFrom === null)
    return { status: "invalid", previous, reason: "sin_periodo" };
  if (input.firstActivity.length === 0 || input.firstActivity.some((d) => d === null || d > previousFrom))
    return { status: "invalid", previous, reason: "sin_historia" };
  const points = input.unit === "percent" || input.unit === "ratio";
  if (!points && previous === 0) return { status: "invalid", previous, reason: "sin_base" };
  const delta = points
    ? round2(current - previous)
    : round2(((current - previous) * 100) / Math.abs(previous));
  const direction = Math.abs(delta) < 0.005 ? "flat" : delta > 0 ? "up" : "down";
  return {
    status: "ok",
    previous,
    delta,
    mode: points ? "points" : "percent",
    direction,
    favorable: direction === "flat" ? null : (direction === "up") === input.higherIsBetter,
  };
}
