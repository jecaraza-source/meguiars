import type { PnlLineRow, PnlMovement, PnlRepository, PnlSectionKey } from "@meguiars/domain";
import { pnlDrillSchema, pnlRangeSchema } from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import { invalid, run } from "./shared";

/** Adaptador del P&L: sólo lectura por RPC (la base filtra los centros autorizados). */
export function createPnlRepository(client: MeguiarsSupabaseClient): PnlRepository {
  return {
    lines(detailCenterIds, from, to) {
      const parsed = pnlRangeSchema.safeParse({ detailCenterIds, from, to });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () => client.rpc("pnl_lines", { p_detail_center_ids: detailCenterIds, p_from: from, p_to: to }),
        (rows) =>
          rows.map((r): PnlLineRow => ({
            detailCenterId: r.detail_center_id,
            section: r.section as PnlSectionKey,
            line: r.line,
            dimension: r.dimension,
            amount: Number(r.amount),
            movements: r.movements,
          })),
      );
    },

    drilldown(query) {
      const parsed = pnlDrillSchema.safeParse(query);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const q = parsed.data;
      return run(
        () =>
          client.rpc("pnl_drilldown", {
            p_detail_center_ids: q.detailCenterIds,
            p_from: q.from,
            p_to: q.to,
            p_section: q.section,
            p_line: q.line ?? null,
            p_dimension: q.dimension ?? null,
          }),
        (rows) =>
          rows.map((r): PnlMovement => ({
            detailCenterId: r.detail_center_id,
            section: r.section as PnlSectionKey,
            line: r.line,
            dimension: r.dimension,
            source: r.source as PnlMovement["source"],
            sourceId: r.source_id,
            reference: r.reference,
            occurredOn: r.occurred_on,
            description: r.description,
            amount: Number(r.amount),
          })),
      );
    },
  };
}
