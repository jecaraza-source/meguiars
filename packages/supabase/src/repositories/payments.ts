import type {
  OrderPayment,
  OrderPaymentStatus,
  PaymentFact,
  PaymentListItem,
  PaymentMethodCode,
  PaymentMutation,
  PaymentReceipt,
  PaymentRepository,
  ReceiptStatus,
  ReceiptTender,
} from "@meguiars/domain";
import { paymentRangeSchema, registerPaymentSchema, reversePaymentSchema } from "@meguiars/validation";
import { z } from "zod";
import type { MeguiarsSupabaseClient } from "../client";
import type { Database, Json, Tables } from "../database.types";
import { toRepoError } from "../errors";
import { invalid, run } from "./shared";

type Fn<K extends keyof Database["public"]["Functions"]> = Database["public"]["Functions"][K]["Returns"];

const num = (v: number | string | null) => (v === null ? null : Number(v));

const toTenders = (json: Json | null | undefined): ReceiptTender[] =>
  Array.isArray(json)
    ? json.map((t) => {
        const o = (t ?? {}) as Record<string, unknown>;
        return {
          method: o.method as PaymentMethodCode,
          name: String(o.name ?? o.method ?? ""),
          amount: Number(o.amount),
          reference: typeof o.reference === "string" ? o.reference : null,
        };
      })
    : [];

const toMutation = (p: Tables<"payments">): PaymentMutation => ({
  id: p.id,
  receiptFolio: p.receipt_folio,
  status: p.status as ReceiptStatus,
});

const toOrderPayment = (r: Fn<"order_payments">[number]): OrderPayment => ({
  id: r.id,
  receiptFolio: r.receipt_folio,
  amount: Number(r.amount),
  applied: Number(r.applied),
  status: r.status as ReceiptStatus,
  receivedAt: r.received_at,
  receivedByName: r.received_by_name,
  cashReceived: num(r.cash_received),
  changeAmount: Number(r.change_amount),
  tenders: toTenders(r.tenders),
  reversalReason: r.reversal_reason,
  reversedAt: r.reversed_at,
  reversedByName: r.reversed_by_name,
});

// payment_receipt devuelve jsonb: se valida la forma antes de usarla.
const receiptJson = z.object({
  id: z.string(),
  receipt_folio: z.string(),
  status: z.enum(["valido", "revertido"]),
  amount: z.coerce.number(),
  cash_received: z.coerce.number().nullable(),
  change_amount: z.coerce.number(),
  notes: z.string().nullable(),
  received_at: z.string(),
  received_by: z.string().nullable(),
  detail_center_id: z.string(),
  center_name: z.string(),
  center_timezone: z.string(),
  organization_name: z.string(),
  client_name: z.string().nullable(),
  tenders: z.unknown(),
  orders: z
    .array(
      z.object({
        id: z.string(),
        folio: z.string(),
        total: z.coerce.number(),
        applied: z.coerce.number(),
        paid: z.coerce.number(),
        balance: z.coerce.number(),
        payment_status: z.enum(["pendiente", "parcial", "pagada"]),
      }),
    )
    .nullable(),
  reversal: z
    .object({ reason: z.string(), reversed_at: z.string(), reversed_by: z.string().nullable() })
    .nullable(),
});

export const toReceipt = (json: Json): PaymentReceipt | null => {
  const parsed = receiptJson.safeParse(json);
  if (!parsed.success) return null;
  const r = parsed.data;
  return {
    id: r.id,
    receiptFolio: r.receipt_folio,
    status: r.status,
    amount: r.amount,
    cashReceived: r.cash_received,
    changeAmount: r.change_amount,
    notes: r.notes,
    receivedAt: r.received_at,
    receivedBy: r.received_by,
    detailCenterId: r.detail_center_id,
    centerName: r.center_name,
    centerTimezone: r.center_timezone,
    organizationName: r.organization_name,
    clientName: r.client_name,
    tenders: toTenders(r.tenders as Json),
    orders: (r.orders ?? []).map((o) => ({ ...o, paymentStatus: o.payment_status })),
    reversal: r.reversal
      ? { reason: r.reversal.reason, reversedAt: r.reversal.reversed_at, reversedBy: r.reversal.reversed_by }
      : null,
  };
};

const toListItem = (r: Fn<"list_payments">[number]): PaymentListItem => ({
  id: r.id,
  detailCenterId: r.detail_center_id,
  receiptFolio: r.receipt_folio,
  receivedAt: r.received_at,
  amount: Number(r.amount),
  status: r.status as ReceiptStatus,
  clientName: r.client_name,
  orderFolios: r.order_folios,
  methods: r.methods,
  receivedByName: r.received_by_name,
});

const toFact = (r: Fn<"payment_facts">[number]): PaymentFact => ({
  detailCenterId: r.detail_center_id,
  day: r.day,
  method: r.method as PaymentMethodCode,
  methodName: r.method_name,
  collectsCash: r.collects_cash,
  validAmount: Number(r.valid_amount),
  validCount: r.valid_count,
  reversedAmount: Number(r.reversed_amount),
  reversedCount: r.reversed_count,
  changeAmount: Number(r.change_amount),
});

/** Adaptador de cobranza. Sólo RPC: las tablas no aceptan escrituras desde la API. */
export function createPaymentRepository(client: MeguiarsSupabaseClient): PaymentRepository {
  const range = (r: { detailCenterIds: string[]; from: string; to: string }) =>
    ({ p_detail_center_ids: r.detailCenterIds, p_from: r.from, p_to: r.to }) as const;

  return {
    orderPayments(orderId) {
      return run(
        () => client.rpc("order_payments", { p_order_id: orderId }),
        (rows) => rows.map(toOrderPayment),
      );
    },

    register(command) {
      const parsed = registerPaymentSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("register_payment", {
            p_order_id: c.orderId,
            p_version: c.version,
            p_request_id: c.requestId,
            p_tenders: c.tenders.map((t) => ({
              method: t.method,
              amount: t.amount,
              ...(t.reference ? { reference: t.reference } : {}),
            })),
            p_cash_received: c.cashReceived ?? null,
            p_notes: c.notes ?? null,
          }),
        toMutation,
      );
    },

    reverse(command) {
      const parsed = reversePaymentSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () =>
          client.rpc("reverse_payment", {
            p_payment_id: parsed.data.paymentId,
            p_reason: parsed.data.reason,
          }),
        toMutation,
      );
    },

    async receipt(id) {
      const result = await run(
        () => client.rpc("payment_receipt", { p_payment_id: id }),
        (json) => toReceipt(json),
      );
      if (!result.ok) return result;
      return result.data
        ? { ok: true, data: result.data }
        : { ok: false, error: { kind: "not_found", message: "El recibo no existe o no tienes acceso" } };
    },

    list(r) {
      const parsed = paymentRangeSchema.safeParse(r);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () => client.rpc("list_payments", range(parsed.data)),
        (rows) => rows.map(toListItem),
      );
    },

    facts(r) {
      const parsed = paymentRangeSchema.safeParse(r);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () => client.rpc("payment_facts", range(parsed.data)),
        (rows) => rows.map(toFact),
      );
    },

    receivables(detailCenterIds) {
      return run(
        () => client.rpc("receivable_orders", { p_detail_center_ids: detailCenterIds }),
        (rows) =>
          rows.map((r) => ({
            id: r.id,
            detailCenterId: r.detail_center_id,
            folio: r.folio,
            clientName: r.client_name,
            channel: r.channel,
            status: r.status,
            b2bAccountId: r.b2b_account_id,
            total: Number(r.total),
            paidAmount: Number(r.paid_amount),
            balance: Number(r.balance),
            paymentStatus: (r.payment_status ?? "pendiente") as OrderPaymentStatus,
            createdAt: r.created_at,
          })),
      );
    },

    reconciliation(r) {
      const parsed = paymentRangeSchema.safeParse(r);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () => client.rpc("sales_reconciliation", range(parsed.data)),
        (rows) =>
          rows.map((x) => ({
            detailCenterId: x.detail_center_id,
            deliveredOrders: x.delivered_orders,
            salesTotal: Number(x.sales_total),
            collectedForSales: Number(x.collected_for_sales),
            pendingForSales: Number(x.pending_for_sales),
            collectedInRange: Number(x.collected_in_range),
            cashInRange: Number(x.cash_in_range),
            reversedInRange: Number(x.reversed_in_range),
          })),
      );
    },

    async hasActiveMembership(clientId, today) {
      try {
        // Aproximación para habilitar la opción; la base valida la vigencia exacta al cobrar.
        const { data, error } = await client
          .from("memberships")
          .select("id")
          .eq("client_id", clientId)
          .eq("state", "activa")
          .gte("ends_on", today)
          .limit(1);
        if (error) return { ok: false, error: toRepoError(error) };
        return { ok: true, data: (data ?? []).length > 0 };
      } catch (error) {
        return { ok: false, error: toRepoError(error) };
      }
    },
  };
}
