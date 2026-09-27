import {
  fail,
  type CashMethodFact,
  type CashRepository,
  type CashSession,
  type CashSessionListItem,
  type CashSessionStatus,
  type CashShift,
  type CashTotals,
} from "@meguiars/domain";
import { closeCashSchema, openCashSchema, reopenCashSchema } from "@meguiars/validation";
import { z } from "zod";
import type { MeguiarsSupabaseClient } from "../client";
import type { Database, Json } from "../database.types";
import { toRepoError } from "../errors";
import { invalid, run } from "./shared";

type ListRow = Database["public"]["Functions"]["list_cash_sessions"]["Returns"][number];

const toListItem = (r: ListRow): CashSessionListItem => ({
  id: r.id,
  detailCenterId: r.detail_center_id,
  folio: r.folio,
  businessDate: r.business_date,
  shift: r.shift as CashShift,
  status: r.status as CashSessionStatus,
  openingFloat: Number(r.opening_float),
  openedAt: r.opened_at,
  openedByName: r.opened_by_name,
  windowEnd: r.window_end,
  closedAt: r.closed_at,
  closedByName: r.closed_by_name,
  expectedCash: Number(r.expected_cash),
  countedCash: r.counted_cash === null ? null : Number(r.counted_cash),
  difference: r.difference === null ? null : Number(r.difference),
  cardTotal: Number(r.card_total),
  transferTotal: Number(r.transfer_total),
  closingsCount: r.closings_count,
  reopeningsCount: r.reopenings_count,
  version: r.version,
});

// cash_session_detail devuelve jsonb: se valida la forma antes de usarla.
const factJson = z.object({
  method: z.string(),
  name: z.string(),
  kind: z.enum(["efectivo", "electronico", "beneficio", "credito", "otro"]),
  collects_cash: z.boolean(),
  collected: z.coerce.number(),
  collected_count: z.number(),
  refunded: z.coerce.number(),
  refunded_count: z.number(),
});

const totalsJson = z.object({
  opening_float: z.coerce.number(),
  cash_collected: z.coerce.number(),
  cash_refunded: z.coerce.number(),
  expected_cash: z.coerce.number(),
  card_total: z.coerce.number(),
  transfer_total: z.coerce.number(),
  non_cash_total: z.coerce.number(),
  payments_count: z.number(),
  reversals_count: z.number(),
  breakdown: z.array(factJson),
});

const detailJson = z.object({
  id: z.string(),
  organization_id: z.string(),
  detail_center_id: z.string(),
  center_name: z.string(),
  center_timezone: z.string(),
  folio: z.string(),
  business_date: z.string(),
  shift: z.string(),
  status: z.string(),
  opening_float: z.coerce.number(),
  opened_at: z.string(),
  opened_by_name: z.string().nullable(),
  window_end: z.string().nullable(),
  closed_at: z.string().nullable(),
  closed_by_name: z.string().nullable(),
  notes: z.string().nullable(),
  version: z.number(),
  live: totalsJson,
  closings: z.array(
    totalsJson.extend({
      id: z.string(),
      sequence: z.number(),
      window_from: z.string(),
      window_to: z.string(),
      counted_cash: z.coerce.number(),
      difference: z.coerce.number(),
      notes: z.string().nullable(),
      closed_by_name: z.string().nullable(),
      closed_at: z.string(),
    }),
  ),
  reopenings: z.array(
    z.object({
      reason: z.string(),
      reopened_by_name: z.string().nullable(),
      reopened_at: z.string(),
      sequence: z.number(),
    }),
  ),
  payments: z.array(
    z.object({
      kind: z.enum(["cobro", "reverso"]),
      at: z.string(),
      folio: z.string(),
      status: z.enum(["valido", "revertido"]),
      amount: z.coerce.number(),
      cash: z.coerce.number(),
      methods: z.string().nullable(),
    }),
  ),
});

const toFact = (f: z.infer<typeof factJson>): CashMethodFact => ({
  method: f.method,
  name: f.name,
  kind: f.kind,
  collectsCash: f.collects_cash,
  collected: f.collected,
  collectedCount: f.collected_count,
  refunded: f.refunded,
  refundedCount: f.refunded_count,
});

const toTotals = (t: z.infer<typeof totalsJson>): CashTotals => ({
  openingFloat: t.opening_float,
  cashCollected: t.cash_collected,
  cashRefunded: t.cash_refunded,
  expectedCash: t.expected_cash,
  cardTotal: t.card_total,
  transferTotal: t.transfer_total,
  nonCashTotal: t.non_cash_total,
  paymentsCount: t.payments_count,
  reversalsCount: t.reversals_count,
  breakdown: t.breakdown.map(toFact),
});

export function toCashSession(json: Json): CashSession | null {
  const parsed = detailJson.safeParse(json);
  if (!parsed.success) return null;
  const s = parsed.data;
  return {
    id: s.id,
    organizationId: s.organization_id,
    detailCenterId: s.detail_center_id,
    centerName: s.center_name,
    centerTimezone: s.center_timezone,
    folio: s.folio,
    businessDate: s.business_date,
    shift: s.shift as CashShift,
    status: s.status as CashSessionStatus,
    openingFloat: s.opening_float,
    openedAt: s.opened_at,
    openedByName: s.opened_by_name,
    windowEnd: s.window_end,
    closedAt: s.closed_at,
    closedByName: s.closed_by_name,
    notes: s.notes,
    version: s.version,
    live: toTotals(s.live),
    closings: s.closings.map((c) => ({
      ...toTotals(c),
      id: c.id,
      sequence: c.sequence,
      windowFrom: c.window_from,
      windowTo: c.window_to,
      countedCash: c.counted_cash,
      difference: c.difference,
      notes: c.notes,
      closedByName: c.closed_by_name,
      closedAt: c.closed_at,
    })),
    reopenings: s.reopenings.map((r) => ({
      reason: r.reason,
      reopenedByName: r.reopened_by_name,
      reopenedAt: r.reopened_at,
      sequence: r.sequence,
    })),
    movements: s.payments.map((m) => ({
      kind: m.kind,
      at: m.at,
      folio: m.folio,
      status: m.status,
      amount: m.amount,
      cash: m.cash,
      methods: m.methods ?? "",
    })),
  };
}

const rangeSchema = z.object({
  detailCenterIds: z.array(z.uuid()).min(1),
  from: z.iso.date(),
  to: z.iso.date(),
});

/** Adaptador del corte de caja. Escrituras sólo por RPC (idempotentes por solicitud y versión). */
export function createCashRepository(client: MeguiarsSupabaseClient): CashRepository {
  return {
    list(detailCenterIds, from, to) {
      const parsed = rangeSchema.safeParse({ detailCenterIds, from, to });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () =>
          client.rpc("list_cash_sessions", { p_detail_center_ids: detailCenterIds, p_from: from, p_to: to }),
        (rows) => rows.map(toListItem),
      );
    },

    async get(id) {
      try {
        const { data, error } = await client.rpc("cash_session_detail", { p_session_id: id });
        if (error) return { ok: false, error: toRepoError(error) };
        const session = data ? toCashSession(data) : null;
        return session
          ? { ok: true, data: session }
          : fail("not_found", "El corte no existe o no tienes acceso");
      } catch (error) {
        return { ok: false, error: toRepoError(error) };
      }
    },

    uncovered(detailCenterIds, from, to) {
      const parsed = rangeSchema.safeParse({ detailCenterIds, from, to });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () => client.rpc("cash_uncovered", { p_detail_center_ids: detailCenterIds, p_from: from, p_to: to }),
        (rows) =>
          rows.map((r) => ({
            detailCenterId: r.detail_center_id,
            day: r.day,
            cashAmount: Number(r.cash_amount),
            paymentsCount: r.payments_count,
          })),
      );
    },

    open(command) {
      const parsed = openCashSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("open_cash_session", {
            p_detail_center_id: c.detailCenterId,
            p_request_id: c.requestId,
            p_shift: c.shift,
            p_opening_float: c.openingFloat,
            p_notes: c.notes ?? null,
          }),
        (s) => ({ id: s.id, folio: s.folio }),
      );
    },

    close(command) {
      const parsed = closeCashSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("close_cash_session", {
            p_session_id: c.sessionId,
            p_version: c.version,
            p_request_id: c.requestId,
            p_counted_cash: c.countedCash,
            p_notes: c.notes ?? null,
          }),
        (x) => ({
          id: x.id,
          sequence: x.sequence,
          expectedCash: Number(x.expected_cash),
          countedCash: Number(x.counted_cash),
          difference: Number(x.difference),
        }),
      );
    },

    reopen(command) {
      const parsed = reopenCashSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("reopen_cash_session", {
            p_session_id: c.sessionId,
            p_version: c.version,
            p_reason: c.reason,
          }),
        (s) => ({ id: s.id, version: s.version }),
      );
    },
  };
}
