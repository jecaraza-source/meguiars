import type { Result } from "../result";
import type { AgendaFilter, AgendaRepository, AppointmentListItem } from "./agenda";
import { addDays } from "./zoned-time";

/** Vista de 7 días: el día elegido (hoy por omisión) y los 6 siguientes. */
export const AGENDA_WEEK_DAYS = 7;

export type AgendaView = "semana" | "dia";

/** Vista de la agenda desde la URL o la pantalla: 7 días por omisión. */
export const parseAgendaView = (v: string | undefined | null): AgendaView => (v === "dia" ? "dia" : "semana");

export interface AgendaWeekDay {
  day: string;
  /** «Hoy», «Mañana» o «mié 22 oct». */
  label: string;
  isToday: boolean;
}

const DAY_PARTS = new Intl.DateTimeFormat("es-MX", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** Etiqueta corta del día (fecha del centro, "YYYY-MM-DD"). */
export function agendaDayLabel(day: string, today: string): string {
  if (day === today) return "Hoy";
  if (day === addDays(today, 1)) return "Mañana";
  const parts = DAY_PARTS.formatToParts(new Date(`${day}T12:00:00Z`));
  const part = (t: Intl.DateTimeFormatPartTypes) =>
    (parts.find((p) => p.type === t)?.value ?? "").replace(/\./g, "");
  return `${part("weekday")} ${part("day")} ${part("month")}`;
}

export function agendaWeekDays(start: string, today: string): AgendaWeekDay[] {
  return Array.from({ length: AGENDA_WEEK_DAYS }, (_, i) => {
    const day = addDays(start, i);
    return { day, label: agendaDayLabel(day, today), isToday: day === today };
  });
}

/** Citas de los 7 días (una consulta por día, en paralelo), con los mismos filtros que la vista de día. */
export async function loadAgendaWeek(
  repo: Pick<AgendaRepository, "listDay">,
  detailCenterId: string,
  start: string,
  today: string,
  filter: AgendaFilter = {},
): Promise<Result<(AgendaWeekDay & { items: AppointmentListItem[] })[]>> {
  const days = agendaWeekDays(start, today);
  const results = await Promise.all(days.map((d) => repo.listDay(detailCenterId, d.day, filter)));
  const failed = results.find((r) => !r.ok);
  if (failed && !failed.ok) return failed;
  return {
    ok: true,
    data: days.map((d, i) => ({
      ...d,
      items: (results[i] as { ok: true; data: AppointmentListItem[] }).data,
    })),
  };
}
