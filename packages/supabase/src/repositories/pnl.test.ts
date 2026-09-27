import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createPnlRepository } from "./pnl";

const U = "00000000-0000-4000-8000-000000000001";

function fake(response: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(response);
  return { client: { rpc } as unknown as MeguiarsSupabaseClient, rpc };
}

describe("repositorio del P&L", () => {
  it("líneas por centro con importes numéricos", async () => {
    const { client, rpc } = fake({
      data: [
        {
          detail_center_id: U,
          section: "ingreso",
          line: "b2c",
          dimension: "premium",
          amount: "5000.00",
          movements: 1,
        },
      ],
      error: null,
    });
    const r = await createPnlRepository(client).lines([U], "2026-09-01", "2026-09-27");
    expect(r).toEqual({
      ok: true,
      data: [
        {
          detailCenterId: U,
          section: "ingreso",
          line: "b2c",
          dimension: "premium",
          amount: 5000,
          movements: 1,
        },
      ],
    });
    expect(rpc).toHaveBeenCalledWith("pnl_lines", {
      p_detail_center_ids: [U],
      p_from: "2026-09-01",
      p_to: "2026-09-27",
    });
  });

  it("periodo inválido no llega a la base", async () => {
    const { client, rpc } = fake({ data: [], error: null });
    const r = await createPnlRepository(client).lines([U], "2026-09-27", "2026-09-01");
    expect(r.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("drill-down con filtros opcionales", async () => {
    const { client, rpc } = fake({
      data: [
        {
          detail_center_id: U,
          section: "gasto",
          line: "personal",
          dimension: null,
          source: "expenses",
          source_id: U,
          reference: "A-01-E-000001",
          occurred_on: "2026-09-27",
          description: "Nómina",
          amount: "1000.00",
        },
      ],
      error: null,
    });
    const r = await createPnlRepository(client).drilldown({
      detailCenterIds: [U],
      from: "2026-09-27",
      to: "2026-09-27",
      section: "gasto",
      line: "personal",
    });
    expect(r.ok && r.data[0]).toMatchObject({ source: "expenses", amount: 1000, reference: "A-01-E-000001" });
    expect(rpc).toHaveBeenCalledWith("pnl_drilldown", {
      p_detail_center_ids: [U],
      p_from: "2026-09-27",
      p_to: "2026-09-27",
      p_section: "gasto",
      p_line: "personal",
      p_dimension: null,
    });
  });
});
