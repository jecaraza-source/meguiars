import { B2B_PAYMENT_METHOD_LABELS } from "../b2b/copy";
import { formatMoney } from "../catalog/presenter";
import { formatDateOnly } from "../memberships/presenter";
import { B2B_DOCUMENT_STATUS_LABELS, B2B_DOCUMENT_STATUS_TONES, receivablesCopy } from "./copy";
import {
  receivableTraceGap,
  type AgingReport,
  type B2bAccountPayment,
  type B2bBillingDocument,
  type B2bReceivableAccount,
  type B2bReceivablesExportRow,
  type B2bUnbilledOrder,
} from "./receivables";

export const formatAge = (days: number) => (days === 1 ? "1 día" : `${days} días`);

export function formatPeriod(from: string, to: string): string {
  return from === to ? formatDateOnly(from) : `${formatDateOnly(from)} – ${formatDateOnly(to)}`;
}

export function presentReceivableAccount(a: B2bReceivableAccount) {
  const gap = receivableTraceGap(a);
  return {
    id: a.accountId,
    name: a.accountName,
    balance: formatMoney(a.balance),
    unbilled:
      a.unbilledOrders + a.unbilledFees > 0
        ? `${formatMoney(a.unbilledOrders + a.unbilledFees)}${
            a.unbilledOrdersCount ? ` · ${a.unbilledOrdersCount} OS` : ""
          }`
        : "—",
    /** Para tarjetas KPI: importe y, aparte, el número de OS. */
    unbilledValue: formatMoney(a.unbilledOrders + a.unbilledFees),
    unbilledCaption: a.unbilledOrdersCount ? `${a.unbilledOrdersCount} OS` : undefined,
    documents: a.documentsBalance ? formatMoney(a.documentsBalance) : "—",
    overdue: a.vencido ? formatMoney(a.vencido) : "—",
    overdueTone: a.vencido > 0 ? ("danger" as const) : ("neutral" as const),
    unapplied: a.unapplied ? formatMoney(a.unapplied) : "—",
    consumption: formatMoney(a.consumption),
    paid: formatMoney(a.paid),
    trace: gap === 0 ? receivablesCopy.traceOk : receivablesCopy.traceGap,
    traceOk: gap === 0,
    /** Desglose de la fórmula del saldo para mostrarla. */
    formula: `${formatMoney(a.consumption)} − ${formatMoney(a.paid)} = ${formatMoney(
      a.unbilledOrders + a.unbilledFees,
    )} + ${formatMoney(a.documentsBalance)} − ${formatMoney(a.unapplied)}`,
  };
}

export function presentDocumentRow(d: B2bBillingDocument) {
  return {
    id: d.id,
    folio: d.folio,
    account: d.accountName,
    period: formatPeriod(d.periodFrom, d.periodTo),
    issuedOn: formatDateOnly(d.issuedOn),
    externalRef: d.externalRef ?? "—",
    dueOn: formatDateOnly(d.dueOn),
    amount: formatMoney(d.amount),
    paid: formatMoney(d.paid),
    balance: formatMoney(d.balance),
    status: B2B_DOCUMENT_STATUS_LABELS[d.status],
    statusTone: B2B_DOCUMENT_STATUS_TONES[d.status],
    age: formatAge(d.ageDays),
    overdue: d.daysOverdue > 0 ? formatAge(d.daysOverdue) : "—",
    orders:
      d.feeAmount > 0 ? `${d.ordersCount} OS + ${receivablesCopy.fee.toLowerCase()}` : `${d.ordersCount} OS`,
  };
}

export function presentUnbilledOrder(o: B2bUnbilledOrder) {
  return {
    id: o.id,
    folio: o.folio,
    account: o.accountName,
    center: o.centerName,
    deliveredOn: formatDateOnly(o.deliveredOn),
    vehicle: o.vehicleLabel,
    purchaseOrder: o.purchaseOrder ?? "—",
    total: formatMoney(o.total),
    age: formatAge(o.ageDays),
  };
}

export function presentAccountPayment(p: B2bAccountPayment) {
  return {
    id: p.id,
    title: `${formatDateOnly(p.paidOn)} · ${B2B_PAYMENT_METHOD_LABELS[p.method]}${p.reference ? ` · ${p.reference}` : ""}`,
    amount: formatMoney(p.amount),
    voided: p.voidedAt !== null,
    voidReason: p.voidReason,
    allocations:
      p.allocations.length === 0
        ? "—"
        : p.allocations.map((a) => `${a.folio} ${formatMoney(a.amount)}`).join(" · "),
    unapplied: p.voidedAt === null && p.unapplied > 0 ? formatMoney(p.unapplied) : null,
  };
}

/** Aging listo para tabla: una fila por rango y otra por cuenta. */
export function presentAging(r: AgingReport) {
  return {
    headers: r.buckets.map((b) => b.label),
    totals: r.totals.map(formatMoney),
    documents: r.documents.map(formatMoney),
    unbilled: r.unbilled.map(formatMoney),
    total: formatMoney(r.total),
    accounts: r.byAccount.map((a) => ({
      id: a.accountId,
      name: a.accountName,
      amounts: a.amounts.map((v) => (v ? formatMoney(v) : "—")),
      total: formatMoney(a.total),
    })),
  };
}

const csvCell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * CSV de soporte para el contador / facturación externa (web lo descarga con BOM
 * para Excel; móvil lo comparte). Montos con punto decimal y sin símbolo.
 */
export function receivablesExportCsv(rows: readonly B2bReceivablesExportRow[]): string {
  const header = [
    "documento",
    "estado",
    "cuenta",
    "razon_social",
    "rfc",
    "regimen_fiscal",
    "cp_fiscal",
    "email_facturacion",
    "periodo_desde",
    "periodo_hasta",
    "fecha_documento",
    "factura_externa",
    "fecha_factura_externa",
    "fecha_compromiso",
    "concepto",
    "os",
    "centro",
    "fecha_entrega",
    "vehiculo",
    "orden_de_compra",
    "importe_linea",
    "importe_documento",
    "pagado_documento",
    "saldo_documento",
  ];
  const lines = rows.map((r) => [
    r.folio,
    r.status,
    r.accountName,
    r.legalName,
    r.rfc,
    r.taxRegime,
    r.fiscalZip,
    r.billingEmail,
    r.periodFrom,
    r.periodTo,
    r.issuedOn,
    r.externalRef,
    r.externalInvoicedOn,
    r.dueOn,
    r.lineKind,
    r.orderFolio,
    r.centerName,
    r.deliveredOn,
    r.vehicleLabel,
    r.purchaseOrder,
    r.lineAmount.toFixed(2),
    r.documentAmount.toFixed(2),
    r.documentPaid.toFixed(2),
    r.documentBalance.toFixed(2),
  ]);
  return [header, ...lines].map((r) => r.map(csvCell).join(",")).join("\n");
}

/** Mensaje de error de cuentas por cobrar para la UI. */
export function receivablesErrorMessage(error: { kind: string; message: string }): string {
  if (error.kind === "unavailable") return receivablesCopy.onlineOnly;
  if (error.kind === "permission_denied" && !error.message) return receivablesCopy.forbidden;
  if (error.kind === "not_found" && !error.message) return receivablesCopy.notFound;
  return error.message;
}
