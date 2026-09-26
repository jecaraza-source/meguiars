import type { StatusTone } from "../agenda/copy";
import { formatMoney } from "../catalog/presenter";
import { MEMBERSHIP_STATUS_LABELS } from "../memberships/copy";
import { daysBetween, type MembershipStatus } from "../memberships/membership";
import { formatDateOnly } from "../memberships/presenter";
import { formatDateInCenterTimeZone } from "../time";
import {
  crmCopy,
  NEXT_VISIT_LABELS,
  NEXT_VISIT_TONES,
  SEGMENT_LABELS,
  SEGMENT_TONES,
  TASK_CHANNEL_LABELS,
  TASK_KIND_LABELS,
  TASK_OUTCOME_LABELS,
  TASK_SOURCE_LABELS,
  TASK_STATUS_LABELS,
} from "./copy";
import type { CrmCustomer, CrmTask, TaskDueFilter } from "./crm";

export function presentCrmCustomer(c: CrmCustomer, timeZone: string) {
  return {
    id: c.clientId,
    name: c.fullName,
    phone: c.phone ?? "—",
    segment: SEGMENT_LABELS[c.segment],
    segmentTone: SEGMENT_TONES[c.segment] as StatusTone,
    lastVisit: c.lastVisitAt ? formatDateInCenterTimeZone(c.lastVisitAt, timeZone) : "Sin visitas",
    visits: String(c.visits),
    lifetimeValue: formatMoney(c.lifetimeValue),
    valueBreakdown: `${crmCopy.servicesValue} ${formatMoney(c.servicesValue)} · ${crmCopy.membershipValue} ${formatMoney(c.membershipValue)}`,
    membership: c.membershipNumber
      ? `${c.membershipNumber} · ${c.membershipPlan ?? ""} · ${MEMBERSHIP_STATUS_LABELS[c.membershipStatus as MembershipStatus] ?? c.membershipStatus}`
      : crmCopy.noMembership,
    nextVisit: c.nextVisitOn
      ? `${formatDateOnly(c.nextVisitOn)}${c.nextVisitService ? ` · ${c.nextVisitService}` : ""}`
      : crmCopy.noRecommendation,
    nextVisitLabel: c.nextVisitState ? NEXT_VISIT_LABELS[c.nextVisitState] : "—",
    nextVisitTone: (c.nextVisitState ? NEXT_VISIT_TONES[c.nextVisitState] : "neutral") as StatusTone,
    openTasks: String(c.openTasks),
  };
}

export function presentTask(t: CrmTask, today: string) {
  const late = t.status === "pendiente" ? daysBetween(t.dueOn, today) : 0;
  return {
    id: t.id,
    client: t.clientName,
    clientId: t.clientId,
    what: `${TASK_KIND_LABELS[t.kind]} · ${TASK_CHANNEL_LABELS[t.channel]}`,
    due: formatDateOnly(t.dueOn),
    dueCaption:
      t.status !== "pendiente"
        ? ""
        : late > 0
          ? `Vencida hace ${late} día${late === 1 ? "" : "s"}`
          : late === 0
            ? "Hoy"
            : "",
    overdue: late > 0,
    status: TASK_STATUS_LABELS[t.status],
    source: TASK_SOURCE_LABELS[t.source],
    notes: t.notes ?? "",
    result:
      t.status === "hecha" && t.outcome
        ? `${TASK_OUTCOME_LABELS[t.outcome]}${t.outcomeNotes ? ` · ${t.outcomeNotes}` : ""}`
        : t.status === "cancelada"
          ? (t.cancelReason ?? "")
          : "",
    open: t.status === "pendiente",
  };
}

/** Rango de fechas de un filtro de vencimiento (hoy en la zona del centro). */
export function taskDueRange(
  due: TaskDueFilter,
  today: string,
): { from?: string; to?: string; before?: string } {
  if (due === "vencidas") return { before: today };
  if (due === "hoy") return { from: today, to: today };
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  const next = new Date(`${today}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { from: next.toISOString().slice(0, 10), to: d.toISOString().slice(0, 10) };
}

/**
 * Enlaces para que la persona contacte manualmente (la plataforma no envía):
 * sólo por canales con consentimiento.
 */
export function contactLinks(c: Pick<CrmCustomer, "phone" | "email" | "optedInChannels">) {
  const digits = (c.phone ?? "").replace(/\D/g, "");
  const out: { channel: string; label: string; href: string }[] = [];
  if (digits && c.optedInChannels.includes("llamada"))
    out.push({ channel: "llamada", label: "Llamar", href: `tel:+${digits}` });
  if (digits && c.optedInChannels.includes("whatsapp"))
    out.push({ channel: "whatsapp", label: "WhatsApp", href: `https://wa.me/${digits}` });
  if (c.email && c.optedInChannels.includes("email"))
    out.push({ channel: "email", label: "Email", href: `mailto:${c.email}` });
  return out;
}
