import {
  fail,
  type B2bAccountPayment,
  type B2bAccountStatus,
  type B2bBillingDocument,
  type B2bBillingDocumentDetail,
  type B2bDocumentStatus,
  type B2bPaymentMethod,
  type B2bReceivableAccount,
  type B2bReceivablesExportRow,
  type ReceivablesRepository,
  type Result,
} from "@meguiars/domain";
import {
  allocateB2bPaymentSchema,
  b2bVoidSchema,
  billingBatchSchema,
  receivablesExportSchema,
  registerB2bPaymentSchema,
  updateBillingBatchSchema,
} from "@meguiars/validation";
import { z } from "zod";
import type { MeguiarsSupabaseClient } from "../client";
import type { Database, Json } from "../database.types";
import { toRepoError } from "../errors";
import { invalid, run } from "./shared";

type Fn = Database["public"]["Functions"];
type AccountRow = Fn["b2b_receivables"]["Returns"][number];
type DocumentRow = Fn["b2b_billing_documents"]["Returns"][number];
type ExportRow = Fn["b2b_receivables_export"]["Returns"][number];

const n = (v: number | string) => Number(v);

const toAccount = (r: AccountRow): B2bReceivableAccount => ({
  accountId: r.account_id,
  accountName: r.account_name,
  homeDetailCenterId: r.home_detail_center_id,
  status: r.status as B2bAccountStatus,
  unbilledOrders: n(r.unbilled_orders),
  unbilledOrdersCount: r.unbilled_orders_count,
  unbilledFees: n(r.unbilled_fees),
  documentsBalance: n(r.documents_balance),
  porFacturar: n(r.por_facturar),
  facturadoExterno: n(r.facturado_externo),
  parcial: n(r.parcial),
  vencido: n(r.vencido),
  unapplied: n(r.unapplied),
  consumption: n(r.consumption),
  paid: n(r.paid),
  balance: n(r.balance),
  oldestUnbilledOn: r.oldest_unbilled_on,
  creditLimit: r.credit_limit === null ? null : n(r.credit_limit),
});

const toDocument = (r: DocumentRow): B2bBillingDocument => ({
  id: r.id,
  accountId: r.account_id,
  accountName: r.account_name,
  homeDetailCenterId: r.home_detail_center_id,
  folio: r.folio,
  periodFrom: r.period_from,
  periodTo: r.period_to,
  issuedOn: r.issued_on,
  externalRef: r.external_ref,
  externalInvoicedOn: r.external_invoiced_on,
  dueOn: r.due_on,
  dueOnReason: r.due_on_reason,
  ordersAmount: n(r.orders_amount),
  feeAmount: n(r.fee_amount),
  amount: n(r.amount),
  paid: n(r.paid),
  balance: n(r.balance),
  status: r.status as B2bDocumentStatus,
  ageDays: r.age_days,
  daysOverdue: r.days_overdue,
  ordersCount: r.orders_count,
  notes: r.notes,
  voidReason: r.void_reason,
  createdAt: r.created_at,
});

const toExportRow = (r: ExportRow): B2bReceivablesExportRow => ({
  folio: r.folio,
  status: r.status as B2bDocumentStatus,
  accountName: r.account_name,
  legalName: r.legal_name,
  rfc: r.rfc,
  taxRegime: r.tax_regime,
  fiscalZip: r.fiscal_zip,
  billingEmail: r.billing_email,
  periodFrom: r.period_from,
  periodTo: r.period_to,
  issuedOn: r.issued_on,
  externalRef: r.external_ref,
  externalInvoicedOn: r.external_invoiced_on,
  dueOn: r.due_on,
  lineKind: r.line_kind === "cuota" ? "cuota" : "os",
  orderFolio: r.order_folio,
  centerName: r.center_name,
  deliveredOn: r.delivered_on,
  vehicleLabel: r.vehicle_label,
  purchaseOrder: r.purchase_order,
  lineAmount: n(r.line_amount),
  documentAmount: n(r.document_amount),
  documentPaid: n(r.document_paid),
  documentBalance: n(r.document_balance),
});

// Las aplicaciones y el detalle vienen como jsonb: se valida la forma antes de usarlos.
const allocationsJson = z.array(
  z.object({ invoice_id: z.string(), folio: z.string(), amount: z.coerce.number() }),
);

const detailJson = z.object({
  id: z.string(),
  account_id: z.string(),
  account_name: z.string(),
  legal_name: z.string().nullable(),
  rfc: z.string().nullable(),
  tax_regime: z.string().nullable(),
  fiscal_zip: z.string().nullable(),
  billing_email: z.string().nullable(),
  home_detail_center_id: z.string(),
  folio: z.string(),
  period_from: z.string(),
  period_to: z.string(),
  issued_on: z.string(),
  external_ref: z.string().nullable(),
  external_invoiced_on: z.string().nullable(),
  due_on: z.string(),
  due_on_reason: z.string().nullable(),
  orders_amount: z.coerce.number(),
  fee_amount: z.coerce.number(),
  amount: z.coerce.number(),
  paid: z.coerce.number(),
  balance: z.coerce.number(),
  status: z.string(),
  age_days: z.number(),
  days_overdue: z.number(),
  notes: z.string().nullable(),
  void_reason: z.string().nullable(),
  created_at: z.string(),
  orders: z.array(
    z.object({
      id: z.string(),
      folio: z.string(),
      detail_center_id: z.string(),
      center_name: z.string(),
      delivered_on: z.string(),
      vehicle_label: z.string(),
      purchase_order: z.string().nullable(),
      total: z.coerce.number(),
    }),
  ),
  payments: z.array(
    z.object({
      payment_id: z.string(),
      paid_on: z.string(),
      method: z.string(),
      reference: z.string().nullable(),
      amount: z.coerce.number(),
      voided: z.boolean(),
    }),
  ),
});

export function toBillingDocumentDetail(json: Json): B2bBillingDocumentDetail | null {
  const parsed = detailJson.safeParse(json);
  if (!parsed.success) return null;
  const d = parsed.data;
  return {
    id: d.id,
    accountId: d.account_id,
    accountName: d.account_name,
    legalName: d.legal_name,
    rfc: d.rfc,
    taxRegime: d.tax_regime,
    fiscalZip: d.fiscal_zip,
    billingEmail: d.billing_email,
    homeDetailCenterId: d.home_detail_center_id,
    folio: d.folio,
    periodFrom: d.period_from,
    periodTo: d.period_to,
    issuedOn: d.issued_on,
    externalRef: d.external_ref,
    externalInvoicedOn: d.external_invoiced_on,
    dueOn: d.due_on,
    dueOnReason: d.due_on_reason,
    ordersAmount: d.orders_amount,
    feeAmount: d.fee_amount,
    amount: d.amount,
    paid: d.paid,
    balance: d.balance,
    status: d.status as B2bDocumentStatus,
    ageDays: d.age_days,
    daysOverdue: d.days_overdue,
    notes: d.notes,
    voidReason: d.void_reason,
    createdAt: d.created_at,
    orders: d.orders.map((o) => ({
      id: o.id,
      folio: o.folio,
      detailCenterId: o.detail_center_id,
      centerName: o.center_name,
      deliveredOn: o.delivered_on,
      vehicleLabel: o.vehicle_label,
      purchaseOrder: o.purchase_order,
      total: o.total,
    })),
    payments: d.payments.map((p) => ({
      paymentId: p.payment_id,
      paidOn: p.paid_on,
      method: p.method as B2bPaymentMethod,
      reference: p.reference,
      amount: p.amount,
      voided: p.voided,
    })),
  };
}

const centersSchema = z.array(z.uuid()).min(1);

async function done(call: PromiseLike<{ error: unknown }>): Promise<Result<void>> {
  try {
    const { error } = await call;
    return error ? { ok: false, error: toRepoError(error) } : { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toRepoError(error) };
  }
}

const allocationsArg = (a: { invoiceId: string; amount: number }[] | undefined) =>
  a ? (a.map((x) => ({ invoice_id: x.invoiceId, amount: x.amount })) as Json) : null;

/** Adaptador de cuentas por cobrar B2B. Escrituras sólo por RPC (idempotentes por solicitud). */
export function createReceivablesRepository(client: MeguiarsSupabaseClient): ReceivablesRepository {
  return {
    accounts(detailCenterIds) {
      const parsed = centersSchema.safeParse(detailCenterIds);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () => client.rpc("b2b_receivables", { p_detail_center_ids: parsed.data }),
        (rows) => rows.map(toAccount),
      );
    },

    documents(detailCenterIds, filter = {}) {
      const parsed = centersSchema.safeParse(detailCenterIds);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () =>
          client.rpc("b2b_billing_documents", {
            p_detail_center_ids: parsed.data,
            p_account_id: filter.accountId ?? null,
            p_include_closed: filter.includeClosed ?? false,
            p_from: filter.from ?? null,
            p_to: filter.to ?? null,
          }),
        (rows) => rows.map(toDocument),
      );
    },

    unbilledOrders(detailCenterIds, accountId) {
      const parsed = centersSchema.safeParse(detailCenterIds);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () =>
          client.rpc("b2b_unbilled_orders", {
            p_detail_center_ids: parsed.data,
            p_account_id: accountId ?? null,
          }),
        (rows) =>
          rows.map((r) => ({
            id: r.id,
            accountId: r.account_id,
            accountName: r.account_name,
            folio: r.folio,
            detailCenterId: r.detail_center_id,
            centerName: r.center_name,
            deliveredOn: r.delivered_on,
            vehicleLabel: r.vehicle_label,
            purchaseOrder: r.purchase_order,
            total: n(r.total),
            ageDays: r.age_days,
          })),
      );
    },

    payments(accountId) {
      return run(
        () => client.rpc("b2b_account_payments", { p_account_id: accountId }),
        (rows) =>
          rows.map((r): B2bAccountPayment => ({
            id: r.id,
            amount: n(r.amount),
            method: r.method as B2bPaymentMethod,
            reference: r.reference,
            paidOn: r.paid_on,
            voidedAt: r.voided_at,
            voidReason: r.void_reason,
            applied: n(r.applied),
            unapplied: n(r.unapplied),
            allocations: (allocationsJson.safeParse(r.allocations).data ?? []).map((a) => ({
              invoiceId: a.invoice_id,
              folio: a.folio,
              amount: a.amount,
            })),
            createdAt: r.created_at,
          })),
      );
    },

    async document(id) {
      try {
        const { data, error } = await client.rpc("b2b_billing_document", { p_invoice_id: id });
        if (error) return { ok: false, error: toRepoError(error) };
        const doc = data ? toBillingDocumentDetail(data) : null;
        return doc ? { ok: true, data: doc } : fail("not_found", "El documento no existe o no tienes acceso");
      } catch (error) {
        return { ok: false, error: toRepoError(error) };
      }
    },

    exportRows(detailCenterIds, from, to, accountId) {
      const centers = centersSchema.safeParse(detailCenterIds);
      if (!centers.success) return Promise.resolve(invalid(centers.error));
      const range = receivablesExportSchema.safeParse({ from, to });
      if (!range.success) return Promise.resolve(invalid(range.error));
      return run(
        () =>
          client.rpc("b2b_receivables_export", {
            p_detail_center_ids: centers.data,
            p_from: from,
            p_to: to,
            p_account_id: accountId ?? null,
          }),
        (rows) => rows.map(toExportRow),
      );
    },

    createBatch(command) {
      const parsed = billingBatchSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("create_b2b_billing_batch", {
            p_account_id: c.accountId,
            p_request_id: c.requestId,
            p_period_from: c.periodFrom,
            p_period_to: c.periodTo,
            p_order_ids: c.orderIds ?? null,
            p_fee_amount: c.feeAmount,
            p_due_on: c.dueOn ?? null,
            p_external_ref: c.externalRef ?? null,
            p_external_invoiced_on: c.externalInvoicedOn ?? null,
            p_notes: c.notes ?? null,
          }),
        (row) => ({ id: row.id, folio: row.folio }),
      );
    },

    async updateBatch(command) {
      const parsed = updateBillingBatchSchema.safeParse(command);
      if (!parsed.success) return invalid(parsed.error);
      const c = parsed.data;
      return done(
        client.rpc("update_b2b_billing_batch", {
          p_invoice_id: c.invoiceId,
          p_external_ref: c.externalRef ?? null,
          p_external_invoiced_on: c.externalInvoicedOn ?? null,
          p_due_on: c.dueOn,
          p_reason: c.reason,
        }),
      );
    },

    async voidBatch(invoiceId, reason) {
      const parsed = b2bVoidSchema.safeParse({ id: invoiceId, reason });
      if (!parsed.success) return invalid(parsed.error);
      return done(
        client.rpc("void_b2b_invoice", { p_invoice_id: parsed.data.id, p_reason: parsed.data.reason }),
      );
    },

    registerPayment(command) {
      const parsed = registerB2bPaymentSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("register_b2b_payment", {
            p_account_id: c.accountId,
            p_request_id: c.requestId,
            p_amount: c.amount,
            p_method: c.method,
            p_reference: c.reference ?? null,
            p_paid_on: c.paidOn ?? null,
            p_allocations: allocationsArg(c.allocations),
          }),
        (row) => ({ id: row.id }),
      );
    },

    allocatePayment(command) {
      const parsed = allocateB2bPaymentSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("allocate_b2b_payment", {
            p_payment_id: c.paymentId,
            p_allocations: allocationsArg(c.allocations),
          }),
        (applied) => ({ applied: Number(applied) }),
      );
    },

    async voidPayment(paymentId, reason) {
      const parsed = b2bVoidSchema.safeParse({ id: paymentId, reason });
      if (!parsed.success) return invalid(parsed.error);
      return done(
        client.rpc("void_b2b_payment", { p_payment_id: parsed.data.id, p_reason: parsed.data.reason }),
      );
    },
  };
}
