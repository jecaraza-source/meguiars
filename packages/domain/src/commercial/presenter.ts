import type { StatusTone } from "../agenda/copy";
import { formatMoney } from "../catalog/presenter";
import {
  firstResponseMinutes,
  leadNextActionState,
  marginPct,
  priceDrift,
  quoteBookingBlocker,
  quoteDisplayStatus,
  quoteEditable,
  quoteStatusActions,
  type Lead,
  type Quote,
} from "./commercial";
import {
  LEAD_LOSS_REASON_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_TONES,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_TONES,
} from "./copy";

const NEXT_ACTION_LABELS = {
  vencida: "Acción vencida",
  hoy: "Acción para hoy",
  proxima: "Acción programada",
  sin_fecha: "Acción sin fecha",
  sin_accion: "Sin siguiente acción",
} as const;

const NEXT_ACTION_TONES: Record<keyof typeof NEXT_ACTION_LABELS, StatusTone> = {
  vencida: "danger",
  hoy: "warning",
  proxima: "neutral",
  sin_fecha: "warning",
  sin_accion: "warning",
};

/** Minutos legibles: "12 min", "3 h 5 min", "2 d 4 h". */
export function formatMinutes(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h} h ${Math.round(minutes % 60)} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

/** Contacto visible del prospecto (teléfono, email o usuario de redes). */
export const leadContact = (l: Pick<Lead, "phone" | "email" | "socialHandle">) =>
  [l.phone, l.email, l.socialHandle].filter(Boolean).join(" · ") || "—";

export function presentLead(l: Lead) {
  const action = leadNextActionState(l, l.today);
  const responseMinutes = firstResponseMinutes(l.createdAt, l.firstContactAt);
  return {
    ...l,
    sourceLabel: LEAD_SOURCE_LABELS[l.source],
    statusLabel: LEAD_STATUS_LABELS[l.status],
    statusTone: LEAD_STATUS_TONES[l.status],
    contact: leadContact(l),
    nextActionLabel: action ? NEXT_ACTION_LABELS[action] : null,
    nextActionTone: action ? NEXT_ACTION_TONES[action] : null,
    firstResponse: responseMinutes == null ? "Sin contactar" : formatMinutes(responseMinutes),
    uncontacted: l.status === "abierta" && !l.firstContactAt,
    lossLabel: l.lossReason ? LEAD_LOSS_REASON_LABELS[l.lossReason] : null,
    wonLabel: l.wonValue != null ? formatMoney(l.wonValue) : null,
    interestLabel: l.interestServiceNames.join(", ") || "—",
  };
}

export function presentQuote(q: Quote) {
  const display = quoteDisplayStatus(q);
  const pct = marginPct(q.contributionMargin, q.total);
  return {
    ...q,
    displayStatus: display,
    statusLabel: QUOTE_STATUS_LABELS[display],
    statusTone: QUOTE_STATUS_TONES[display],
    editable: quoteEditable(q),
    bookingBlocker: quoteBookingBlocker(q),
    statusActions: quoteStatusActions(q),
    marginLabel: `${formatMoney(q.contributionMargin)}${pct == null ? "" : ` (${pct} %)`}`,
    drift: priceDrift(q.items),
    who: q.clientName ?? q.leadName ?? q.contactName,
  };
}

/** Valor de un indicador comercial; sin denominador se muestra «Sin datos», nunca 0. */
export function formatCommercialKpi(
  unit: "count" | "percent" | "currency" | "minutes" | "hours" | "ratio",
  value: number | null,
): string {
  if (value == null) return "Sin datos";
  switch (unit) {
    case "currency":
      return formatMoney(value);
    case "percent":
      return `${value} %`;
    case "minutes":
      return formatMinutes(value);
    default:
      return String(value);
  }
}

/** Mensaje para la persona a partir del error del repositorio. */
export function commercialErrorMessage(error: { kind: string; code?: string; message: string }): string {
  if (error.code === "40001")
    return "El registro cambió en otro dispositivo; recarga para ver la versión actual";
  if (error.kind === "permission_denied" && !error.message) return "No tienes permiso para esta acción.";
  return error.message;
}

/** Texto para compartir la cotización por el canal del cliente (la plataforma no lo envía). */
export function quoteShareText(q: Quote, centerName: string): string {
  const lines = q.items.map(
    (i) =>
      `• ${i.serviceName}${i.quantity > 1 ? ` × ${i.quantity}` : ""}: ${formatMoney(i.lineSubtotal - i.lineDiscount)}`,
  );
  const discount = q.discountTotal > 0 ? [`Descuento: −${formatMoney(q.discountTotal)}`] : [];
  return [
    `Cotización ${q.folio} · ${centerName}`,
    `Para: ${q.clientName ?? q.contactName}`,
    ...lines,
    ...discount,
    `Total: ${formatMoney(q.total)} (IVA incluido)`,
    `Vigente hasta el ${q.validUntil}.`,
    ...(q.notes ? [q.notes] : []),
    "Responde este mensaje para reservar tu cita.",
  ].join("\n");
}
