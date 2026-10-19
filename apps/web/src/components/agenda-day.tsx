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
