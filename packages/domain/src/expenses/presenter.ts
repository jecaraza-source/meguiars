import { formatMoney } from "../catalog/presenter";
import { formatDateOnly } from "../memberships/presenter";
import { formatInCenterTimeZone } from "../time";
import {
  APPROVAL_EVENT_LABELS,
  EXPENSE_PAYMENT_METHOD_LABELS,
  EXPENSE_STATUS_LABELS,
  EXPENSE_STATUS_TONES,
  expensesCopy,
  PNL_GROUP_LABELS,
} from "./copy";
import type { ApprovalEvent, Expense, ExpenseListItem } from "./expenses";

export function presentExpenseRow(e: ExpenseListItem) {
  return {
    id: e.id,
    folio: e.folio,
    date: formatDateOnly(e.paidOn),
    concept: e.concept,
    amount: formatMoney(e.amount),
    category: e.categoryName,
    group: PNL_GROUP_LABELS[e.pnlGroup],
    vendor: e.vendorName ?? "—",
    method: EXPENSE_PAYMENT_METHOD_LABELS[e.paymentMethod],
    status: EXPENSE_STATUS_LABELS[e.status],
    statusTone: EXPENSE_STATUS_TONES[e.status],
    receipts: e.attachments > 0 ? String(e.attachments) : "—",
  };
}

export function presentExpense(e: Expense) {
  return {
    title: `${e.folio} · ${e.concept}`,
    amount: formatMoney(e.amount),
    date: formatDateOnly(e.paidOn),
    category: e.categoryName,
    group: PNL_GROUP_LABELS[e.pnlGroup],
    vendor: e.vendorName ?? "—",
    method: EXPENSE_PAYMENT_METHOD_LABELS[e.paymentMethod],
    reference: e.reference ?? "—",
    status: EXPENSE_STATUS_LABELS[e.status],
    statusTone: EXPENSE_STATUS_TONES[e.status],
    createdBy: `${e.createdByName ?? "—"} · ${formatInCenterTimeZone(e.createdAt, e.centerTimezone)}`,
    approvedBy:
      e.approvedAt && e.requiresApproval
        ? `${e.approvedByName ?? "—"} · ${formatInCenterTimeZone(e.approvedAt, e.centerTimezone)}`
        : null,
    voided:
      e.voidedAt && e.voidReason
        ? `${expensesCopy.voided.replace(".", "")}: ${e.voidReason} · ${e.voidedByName ?? "—"} · ${formatInCenterTimeZone(e.voidedAt, e.centerTimezone)}`
        : null,
  };
}

export function presentApprovalEvent(ev: ApprovalEvent, timeZone: string) {
  return {
    what: APPROVAL_EVENT_LABELS[ev.kind],
    amount: formatMoney(ev.amount),
    note: ev.note,
    who: ev.actorName ?? "—",
    when: formatInCenterTimeZone(ev.occurredAt, timeZone),
  };
}

export const formatBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

/** Mensaje de error de egresos para la UI. */
export function expenseErrorMessage(error: { kind: string; code?: string; message: string }): string {
  if (error.code === "40001")
    return "El egreso cambió en otro dispositivo; recarga para ver la versión actual";
  if (error.kind === "unavailable") return expensesCopy.onlineOnly;
  if (error.kind === "permission_denied" && !error.message) return expensesCopy.forbidden;
  return error.message;
}
