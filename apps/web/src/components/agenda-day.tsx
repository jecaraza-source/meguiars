import { agendaBadgeTone, type presentAppointment } from "@meguiars/domain";
import Link from "next/link";
import { Badge } from "./ui/display";

type Item = ReturnType<typeof presentAppointment>;

/** Lista del día por hora (tarjetas en móvil y escritorio: lectura rápida en recepción). */
export function AgendaDayList({ items }: { items: Item[] }) {
  return (
    <ol aria-label="Citas del día" className="flex flex-col gap-sm">
      {items.map((i) => (
        <li
          key={i.id}
          className="mg-card"
          data-source={i.fromWhatsapp ? "whatsapp" : undefined}
          style={
            i.fromWhatsapp
              ? {
                  borderLeft: "var(--mg-space-xs) solid var(--mg-color-success)",
                  background: "var(--mg-color-success-surface)",
                }
              : undefined
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-sm">
            <Link href={`/agenda/${i.id}`} className="text-lg font-semibold underline">
              {i.time} · {i.client}
            </Link>
            <span className="flex flex-wrap gap-xs">
              {i.badges.map((b) => (
                <Badge key={b} label={b} tone={agendaBadgeTone(b)} />
              ))}
              <Badge label={i.status} tone={i.tone} />
            </span>
          </div>
          <p className="text-sm">{i.vehicle}</p>
          <p className="text-sm text-muted">
            {i.services} · {i.bay} · {i.technician}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** Siete columnas (hoy y los 6 días siguientes): vista rápida de la carga de la semana. */
export function AgendaWeekBoard({
  days,
}: {
  days: { day: string; label: string; isToday: boolean; href: string; items: Item[] }[];
}) {
  return (
    <div className="relative min-w-0 overflow-x-auto" data-testid="agenda-week">
      <ol aria-label="Citas de los próximos 7 días" className="grid gap-sm md:grid-cols-7">
        {days.map((d) => (
          <li
            key={d.day}
            className="flex min-w-0 flex-col gap-xs rounded-md border border-border bg-surface p-xs"
            aria-current={d.isToday ? "date" : undefined}
          >
            <Link
              href={d.href}
              className={`flex items-baseline justify-between gap-xs text-sm font-bold underline ${d.isToday ? "text-accent" : ""}`}
            >
              <span className="capitalize">{d.label}</span>
              <span className="text-xs font-normal text-muted">{d.items.length}</span>
            </Link>
            {d.items.length === 0 ? (
              <p className="text-xs text-muted">Sin citas</p>
            ) : (
              <ul className="flex flex-col gap-xs">
                {d.items.map((i) => (
                  <li
                    key={i.id}
                    className="mg-card gap-xxs p-xs text-xs"
                    data-source={i.fromWhatsapp ? "whatsapp" : undefined}
                    style={
                      i.fromWhatsapp
                        ? {
                            borderLeft: "var(--mg-space-xs) solid var(--mg-color-success)",
                            background: "var(--mg-color-success-surface)",
                            padding: "var(--mg-space-xs)",
                          }
                        : { padding: "var(--mg-space-xs)" }
                    }
                  >
                    <Link href={`/agenda/${i.id}`} className="font-semibold underline">
                      {i.time}
                    </Link>
                    <span className="truncate">{i.client}</span>
                    <span className="truncate text-muted">{i.services}</span>
                    <span className="flex flex-wrap gap-xxs">
                      <Badge label={i.status} tone={i.tone} />
                      {i.badges.map((b) => (
                        <Badge key={b} label={b} tone={agendaBadgeTone(b)} />
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
