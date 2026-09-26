import { formatMoney } from "../catalog/presenter";
import type { AppointmentListItem, AppointmentStatus, ServiceOrderDraft } from "./agenda";
import { APPOINTMENT_STATUSES, APPOINTMENT_TRANSITIONS, STATUS_NEEDS_REASON } from "./agenda";
import {
  agendaCopy,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_TONES,
  STATUS_ACTION_LABELS,
} from "./copy";
import { utcToZoned } from "./zoned-time";

/** Tarjeta/fila de la agenda (mismos textos en web y móvil); horas en la zona del centro. */
export function presentAppointment(item: AppointmentListItem, timeZone: string) {
  const start = utcToZoned(item.startsAt, timeZone);
  const end = utcToZoned(item.endsAt, timeZone);
  return {
    id: item.id,
    time: `${start.time}–${end.time}`,
    // Si termina otro día (servicios largos), se indica.
    endsOtherDay: end.date !== start.date,
    client: item.clientName ?? "Cliente",
    vehicle: item.vehicleLabel ?? "—",
    services: item.services.join(", ") || "—",
    bay: item.bayName ?? agendaCopy.none,
    technician: item.technicianName ?? agendaCopy.none,
    status: APPOINTMENT_STATUS_LABELS[item.status],
    tone: APPOINTMENT_STATUS_TONES[item.status],
    badges: [
      ...(item.isWalkIn ? [agendaCopy.walkInBadge] : []),
      ...(item.conflictOverride ? [agendaCopy.overrideBadge] : []),
    ],
  };
}

/** Acciones de estatus disponibles desde el estatus actual. */
export function statusActions(status: AppointmentStatus) {
  return APPOINTMENT_TRANSITIONS[status].map((to) => ({
    to,
    label: STATUS_ACTION_LABELS[to],
    needsReason: STATUS_NEEDS_REASON.includes(to),
    destructive: STATUS_NEEDS_REASON.includes(to),
  }));
}

/** Resumen del día: citas por estatus (conteos, no un KPI de ocupación). */
export function daySummary(items: readonly AppointmentListItem[]) {
  return APPOINTMENT_STATUSES.map((status) => ({
    status,
    label: APPOINTMENT_STATUS_LABELS[status],
    count: items.filter((i) => i.status === status).length,
  })).filter((s) => s.count > 0);
}

export function presentOrderDraft(draft: ServiceOrderDraft) {
  const total = draft.lines.reduce((sum, l) => sum + l.unitPrice, 0);
  return {
    lines: draft.lines.map((l) => ({
      key: l.serviceId,
      name: `${l.serviceName} · ${l.serviceCode}`,
      price: formatMoney(l.unitPrice),
    })),
    total: formatMoney(total),
  };
}
