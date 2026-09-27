import { formatMoney } from "../catalog/presenter";
import { addDays } from "../agenda/zoned-time";
import { formatInCenterTimeZone } from "../time";
import {
  ORDER_PAYMENT_STATUS_LABELS,
  ORDER_PAYMENT_STATUS_TONES,
  PAYMENT_METHOD_LABELS,
  RECEIPT_STATUS_LABELS,
  RECEIPT_STATUS_TONES,
  paymentsCopy,
} from "./copy";
import {
  orderPaymentStatus,
  PAYABLE_ORDER_STATUSES,
  type OrderPayment,
  type PaymentListItem,
  type PaymentReceipt,
  type ReceivableOrder,
  type ReceiptTender,
} from "./payments";
import type { ServiceOrderStatus } from "../orders/order";

const when = (iso: string, timeZone: string) => formatInCenterTimeZone(iso, timeZone);

export const tenderLabel = (t: Pick<ReceiptTender, "method" | "name" | "amount" | "reference">) =>
  `${PAYMENT_METHOD_LABELS[t.method] ?? t.name} ${formatMoney(t.amount)}${t.reference ? ` · ${t.reference}` : ""}`;

/** Resumen de cobro de la OS (web y móvil). */
export function presentOrderPayment(order: {
  status: ServiceOrderStatus;
  total: number;
  paidAmount: number;
  b2bAccountId: string | null;
}) {
  const status = orderPaymentStatus(order.total, order.paidAmount);
  const balance = Math.max(0, Math.round((order.total - order.paidAmount) * 100) / 100);
  const payable = PAYABLE_ORDER_STATUSES.includes(order.status) && balance > 0;
  return {
    status,
    statusLabel: ORDER_PAYMENT_STATUS_LABELS[status],
    statusTone: ORDER_PAYMENT_STATUS_TONES[status],
    total: formatMoney(order.total),
    paid: formatMoney(order.paidAmount),
    balance: formatMoney(balance),
    balanceValue: balance,
    payable,
    /** Por qué no se puede cobrar (null = se puede). */
    blocked: payable ? null : balance === 0 ? paymentsCopy.settled : paymentsCopy.notPayable,
    hint: order.b2bAccountId ? paymentsCopy.b2bHint : null,
  };
}

/** Recibo en la lista de la OS. */
export function presentOrderPaymentRow(p: OrderPayment, timeZone: string) {
  return {
    id: p.id,
    folio: p.receiptFolio,
    amount: formatMoney(p.applied),
    status: RECEIPT_STATUS_LABELS[p.status],
    statusTone: RECEIPT_STATUS_TONES[p.status],
    valid: p.status === "valido",
    when: when(p.receivedAt, timeZone),
    who: p.receivedByName ?? "—",
    tenders: p.tenders.map(tenderLabel).join(" + "),
    change: p.changeAmount > 0 ? `${paymentsCopy.change} ${formatMoney(p.changeAmount)}` : null,
    reversal: p.reversalReason
      ? `${paymentsCopy.reversed}: ${p.reversalReason} · ${p.reversedByName ?? "—"} · ${
          p.reversedAt ? when(p.reversedAt, timeZone) : ""
        }`
      : null,
  };
}

/** Recibo interno imprimible. */
export function presentReceipt(r: PaymentReceipt) {
  return {
    folio: r.receiptFolio,
    title: paymentsCopy.receiptTitle,
    organization: r.organizationName,
    center: r.centerName,
    when: when(r.receivedAt, r.centerTimezone),
    who: r.receivedBy ?? "—",
    client: r.clientName ?? paymentsCopy.noClientData,
    amount: formatMoney(r.amount),
    status: RECEIPT_STATUS_LABELS[r.status],
    statusTone: RECEIPT_STATUS_TONES[r.status],
    tenders: r.tenders.map((t) => ({
      label: PAYMENT_METHOD_LABELS[t.method] ?? t.name,
      amount: formatMoney(t.amount),
      reference: t.reference,
    })),
    cashReceived: r.cashReceived === null ? null : formatMoney(r.cashReceived),
    change: r.changeAmount > 0 ? formatMoney(r.changeAmount) : null,
    orders: r.orders.map((o) => ({
      id: o.id,
      folio: o.folio,
      total: formatMoney(o.total),
      applied: formatMoney(o.applied),
      balance: formatMoney(o.balance),
      status: ORDER_PAYMENT_STATUS_LABELS[o.paymentStatus],
    })),
    notes: r.notes,
    reversal: r.reversal
      ? `${r.reversal.reason} · ${r.reversal.reversedBy ?? "—"} · ${when(r.reversal.reversedAt, r.centerTimezone)}`
      : null,
    legend: paymentsCopy.notCfdi,
  };
}

export function presentPaymentListItem(p: PaymentListItem, timeZone: string) {
  return {
    id: p.id,
    folio: p.receiptFolio,
    when: when(p.receivedAt, timeZone),
    amount: formatMoney(p.amount),
    status: RECEIPT_STATUS_LABELS[p.status],
    statusTone: RECEIPT_STATUS_TONES[p.status],
    client: p.clientName ?? paymentsCopy.noClientData,
    orders: p.orderFolios ?? "—",
    methods: p.methods ?? "—",
    who: p.receivedByName ?? "—",
  };
}

export function presentReceivable(o: ReceivableOrder) {
  return {
    id: o.id,
    folio: o.folio,
    client: o.clientName ?? paymentsCopy.noClientData,
    total: formatMoney(o.total),
    paid: formatMoney(o.paidAmount),
    balance: formatMoney(o.balance),
    status: ORDER_PAYMENT_STATUS_LABELS[o.paymentStatus],
    statusTone: ORDER_PAYMENT_STATUS_TONES[o.paymentStatus],
    b2b: o.b2bAccountId !== null,
  };
}

export const PAYMENT_RANGES = ["hoy", "7", "30"] as const;
export type PaymentRangeKey = (typeof PAYMENT_RANGES)[number];

export const PAYMENT_RANGE_LABELS: Record<PaymentRangeKey, string> = {
  hoy: paymentsCopy.rangeToday,
  "7": paymentsCopy.range7,
  "30": paymentsCopy.range30,
};

/** Rango del corte (inclusive) a partir de la fecha del centro. */
export function paymentRange(key: PaymentRangeKey, today: string): { from: string; to: string } {
  const days = key === "hoy" ? 0 : Number(key) - 1;
  return { from: addDays(today, -days), to: today };
}

/** Mensaje de error de cobranza para la UI. */
export function paymentErrorMessage(error: { kind: string; code?: string; message: string }): string {
  if (error.code === "40001") return "La OS cambió en otro dispositivo; recarga para ver el saldo actual";
  if (error.kind === "unavailable") return paymentsCopy.onlineOnly;
  if (error.kind === "permission_denied" && !error.message) return paymentsCopy.forbidden;
  return error.message;
}
