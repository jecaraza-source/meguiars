import { formatDuration, formatMoney } from "../catalog/presenter";
import type { AppRole } from "../roles";
import { formatInCenterTimeZone } from "../time";
import {
  DISCOUNT_LEVEL_LABELS,
  ORDER_ACTION_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  ordersCopy,
  SALES_CHANNEL_LABELS,
} from "./copy";
import type {
  ServiceOrder,
  ServiceOrderDiscount,
  ServiceOrderListItem,
  ServiceOrderStatus,
  StatusHistoryEntry,
} from "./order";
import {
  authorizationBlocker,
  CLOSED_STATUSES,
  deliveryBlocker,
  DISCOUNT_EDITABLE_STATUSES,
  ITEM_EDITABLE_STATUSES,
  ORDER_STATUS_NEEDS_REASON,
  PAYABLE_STATUSES,
  SERVICE_ORDER_TRANSITIONS,
} from "./order";
import { orderBalance, orderMargin } from "./totals";

/** Fila del listado de OS (mismos textos en web y móvil). */
export function presentOrderListItem(item: ServiceOrderListItem, timeZone: string) {
  const balance = orderBalance(item);
  return {
    id: item.id,
    folio: item.folio,
    client: item.clientName,
    vehicle: item.vehicleLabel,
    status: ORDER_STATUS_LABELS[item.status],
    tone: ORDER_STATUS_TONES[item.status],
    channel: SALES_CHANNEL_LABELS[item.channel],
    total: formatMoney(item.total),
    balance: balance > 0 && item.status !== "cancelada" ? formatMoney(balance) : "—",
    resources: [item.bayName, item.technicianName].filter(Boolean).join(" · ") || ordersCopy.none,
    createdAt: formatInCenterTimeZone(item.createdAt, timeZone),
  };
}

/** Minutos trabajados, incluido el tramo en curso. */
export function workedMinutes(
  order: Pick<ServiceOrder, "workedMinutes" | "workStartedAt">,
  now = new Date(),
) {
  const running = order.workStartedAt
    ? Math.max(0, Math.floor((now.getTime() - new Date(order.workStartedAt).getTime()) / 60000))
    : 0;
  return order.workedMinutes + running;
}

/** Resumen de la OS: KPIs y permisos de edición según estatus. */
export function presentOrder(order: ServiceOrder, now = new Date()) {
  const margin = orderMargin(order);
  const balance = orderBalance(order);
  return {
    title: `${order.folio} · ${order.clientName}`,
    subtitle: order.vehicleLabel,
    status: ORDER_STATUS_LABELS[order.status],
    tone: ORDER_STATUS_TONES[order.status],
    channel:
      SALES_CHANNEL_LABELS[order.channel] + (order.channelReference ? ` · ${order.channelReference}` : ""),
    kpis: [
      {
        label: ordersCopy.total,
        value: formatMoney(order.total),
        caption: `${ordersCopy.subtotal} ${formatMoney(order.subtotal)} · ${ordersCopy.discountTotal} ${formatMoney(order.discountTotal)}`,
      },
      {
        label: ordersCopy.balance,
        value: formatMoney(balance),
        caption: `${ordersCopy.paid} ${formatMoney(order.paidAmount)}`,
      },
      { label: ordersCopy.margin, value: formatMoney(margin.amount), caption: `${margin.percent}%` },
      {
        label: ordersCopy.worked,
        value: formatDuration(workedMinutes(order, now)),
        caption: `${ordersCopy.estimated} ${formatDuration(order.estimatedMinutes)}`,
      },
    ],
    canEditItems: ITEM_EDITABLE_STATUSES.includes(order.status),
    itemsNeedReason: order.status !== "abierta",
    canDiscount: DISCOUNT_EDITABLE_STATUSES.includes(order.status),
    canPay: PAYABLE_STATUSES.includes(order.status) && balance > 0,
    canEditDetails: !CLOSED_STATUSES.includes(order.status),
    canChangeChannel: order.status === "abierta",
    balance,
  };
}

export interface OrderStatusAction {
  to: ServiceOrderStatus;
  label: string;
  needsReason: boolean;
  destructive: boolean;
  /** Regla que impide la transición ahora (null = se puede). */
  blocker: string | null;
}

/** Acciones de estatus desde el estatus actual, con las reglas por canal y rol. */
export function orderStatusActions(order: ServiceOrder, roles: readonly AppRole[]): OrderStatusAction[] {
  const manager = roles.includes("admin_socio") || roles.includes("encargado");
  return SERVICE_ORDER_TRANSITIONS[order.status].map((to) => {
    let blocker: string | null = null;
    if (to === "autorizada") blocker = authorizationBlocker(order);
    if (to === "entregada") blocker = deliveryBlocker(order);
    if (to === "cancelada" && order.status !== "abierta" && !manager) blocker = ordersCopy.managerOnly;
    if (to === "cancelada" && order.paidAmount > 0)
      blocker = "La OS tiene cobros registrados; los reembolsos llegan con el módulo de pagos";
    return {
      to,
      label: ORDER_ACTION_LABELS[to],
      needsReason: ORDER_STATUS_NEEDS_REASON.includes(to),
      destructive: to === "cancelada" || to === "pausada",
      blocker,
    };
  });
}

export function presentDiscount(d: ServiceOrderDiscount, lineName: (itemId: string) => string) {
  return {
    id: d.id,
    target: d.itemId ? lineName(d.itemId) : ordersCopy.wholeOrder,
    value: d.kind === "percent" ? `${d.value}%` : formatMoney(d.value),
    amount: formatMoney(d.amount),
    reason: d.voidedAt ? `${d.reason} · ${ordersCopy.voided}: ${d.voidReason ?? ""}` : d.reason,
    level: DISCOUNT_LEVEL_LABELS[d.authorizationLevel],
    active: d.voidedAt === null,
  };
}

export function presentHistory(entry: StatusHistoryEntry, timeZone: string) {
  return {
    key: String(entry.id),
    when: formatInCenterTimeZone(entry.occurredAt, timeZone),
    change: entry.fromStatus
      ? `${ORDER_STATUS_LABELS[entry.fromStatus]} → ${ORDER_STATUS_LABELS[entry.toStatus]}`
      : ORDER_STATUS_LABELS[entry.toStatus],
    reason: entry.reason ?? "—",
  };
}

/** Mensaje para errores de la OS (versión vieja, reglas del canal, permisos). */
export function orderErrorMessage(error: { kind: string; code?: string; message: string }): string {
  if (error.code === "40001") return ordersCopy.stale;
  return error.message;
}
