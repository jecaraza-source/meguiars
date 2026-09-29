import type { AppointmentStatus } from "../agenda/agenda";
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_TONES } from "../agenda/copy";
import { formatMoney } from "../catalog/presenter";
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from "../orders/copy";
import type { ServiceOrderStatus } from "../orders/order";
import type { Result } from "../result";
import { formatTimeInCenterTimeZone } from "../time";

/**
 * Operación del día (O6): resumen del centro activo (public.center_day_summary).
 * Cada bloque es null si el usuario no tiene el permiso de ese módulo.
 */
export interface DayActiveOrder {
  id: string;
  folio: string;
  status: ServiceOrderStatus;
  clientName: string;
  vehicle: string;
  total: number;
  paidAmount: number;
  promisedAt: string | null;
  bayName: string | null;
  technicianName: string | null;
}

export interface DayAppointment {
  id: string;
  startsAt: string;
  status: AppointmentStatus;
  clientName: string;
  vehicle: string;
  bayName: string | null;
}

export interface DaySummary {
  /** AAAA-MM-DD del centro. */
  day: string;
  orders: {
    byStatus: Partial<Record<ServiceOrderStatus, number>>;
    active: DayActiveOrder[];
    deliveredToday: { count: number; total: number; pending: number };
    openedToday: number;
  } | null;
  agenda: {
    byStatus: Partial<Record<AppointmentStatus, number>>;
    upcoming: DayAppointment[];
  } | null;
  payments: { count: number; total: number } | null;
}

export interface DayRepository {
  summary(detailCenterId: string): Promise<Result<DaySummary>>;
}

export const DAY_COPY = {
  title: "Operación del día",
  description: "Órdenes de servicio, agenda y cobros de hoy en el centro activo.",
  activeTitle: "Órdenes en curso",
  activeEmpty: "No hay órdenes abiertas ni en proceso.",
  agendaTitle: "Próximas citas de hoy",
  agendaEmpty: "No hay citas pendientes hoy.",
  newOrder: "Nueva orden",
  newAppointment: "Nueva cita",
} as const;

const count = (m: Partial<Record<string, number>>, keys: readonly string[]) =>
  keys.reduce((a, k) => a + (m[k] ?? 0), 0);

/** Presentación del resumen (igual en web y móvil). `timezone` del centro para las horas. */
export function presentDaySummary(s: DaySummary, timezone: string) {
  const time = { format: (d: Date) => formatTimeInCenterTimeZone(d, timezone) };
  const kpis: { key: string; label: string; value: string; caption?: string }[] = [];
  if (s.orders) {
    const o = s.orders.byStatus;
    kpis.push(
      {
        key: "taller",
        label: "En taller",
        value: String(count(o, ["en_proceso", "pausada"])),
        caption: `${o.pausada ?? 0} en pausa`,
      },
      {
        key: "por_iniciar",
        label: "Por iniciar",
        value: String(count(o, ["abierta", "autorizada"])),
        caption: `${o.abierta ?? 0} sin autorizar`,
      },
      { key: "listas", label: "Listas para entregar", value: String(o.terminada ?? 0) },
      {
        key: "entregadas",
        label: "Entregadas hoy",
        value: String(s.orders.deliveredToday.count),
        caption: `Venta ${formatMoney(s.orders.deliveredToday.total)}`,
      },
    );
  }
  if (s.payments)
    kpis.push({
      key: "cobrado",
      label: "Cobrado hoy",
      value: formatMoney(s.payments.total),
      caption: `${s.payments.count} ${s.payments.count === 1 ? "recibo" : "recibos"}`,
    });
  if (s.orders && s.orders.deliveredToday.pending > 0)
    kpis.push({
      key: "por_cobrar",
      label: "Entregado sin cobrar",
      value: formatMoney(s.orders.deliveredToday.pending),
    });
  if (s.agenda) {
    const a = s.agenda.byStatus;
    const total = Object.values(a).reduce((x, n) => x + (n ?? 0), 0);
    kpis.push({
      key: "citas",
      label: "Citas de hoy",
      value: String(total - (a.cancelada ?? 0)),
      caption: `${count(a, ["programada"])} por llegar · ${a.no_show ?? 0} no llegaron`,
    });
  }
  return {
    kpis,
    active: (s.orders?.active ?? []).map((o) => ({
      id: o.id,
      href: `/ordenes/${o.id}`,
      folio: o.folio,
      status: ORDER_STATUS_LABELS[o.status],
      tone: ORDER_STATUS_TONES[o.status],
      client: o.clientName,
      vehicle: o.vehicle,
      total: formatMoney(o.total),
      balance: o.total - o.paidAmount > 0 ? `Saldo ${formatMoney(o.total - o.paidAmount)}` : "Pagada",
      where: [o.bayName, o.technicianName].filter(Boolean).join(" · ") || null,
      promised: o.promisedAt ? `Promesa ${time.format(new Date(o.promisedAt))}` : null,
    })),
    upcoming: (s.agenda?.upcoming ?? []).map((a) => ({
      id: a.id,
      href: `/agenda/${a.id}`,
      time: time.format(new Date(a.startsAt)),
      status: APPOINTMENT_STATUS_LABELS[a.status],
      tone: APPOINTMENT_STATUS_TONES[a.status],
      client: a.clientName,
      vehicle: a.vehicle,
      bay: a.bayName,
    })),
    showOrders: s.orders !== null,
    showAgenda: s.agenda !== null,
  };
}
