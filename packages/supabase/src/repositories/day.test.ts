import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createDayRepository } from "./day";

describe("repositorio del día", () => {
  it("una RPC; convierte bloques y deja null los que no se pueden ver", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        day: "2026-09-29",
        orders: {
          by_status: { en_proceso: 2, terminada: 1 },
          active: [
            {
              id: "o1",
              folio: "CDMX-01-000010",
              status: "terminada",
              client_name: "Ana",
              vehicle: "Mazda 3 · ABC",
              total: "550.00",
              paid_amount: "0",
              promised_at: null,
              bay_name: "Bahía 1",
              technician_name: null,
            },
          ],
          delivered_today: { count: 3, total: "1500.50", pending: "200" },
          opened_today: 4,
        },
        agenda: null,
        payments: { count: 2, total: "1300.5" },
      },
      error: null,
    });
    const r = await createDayRepository({ rpc } as unknown as MeguiarsSupabaseClient).summary("c1");
    expect(rpc).toHaveBeenCalledWith("center_day_summary", { p_detail_center_id: "c1" });
    expect(r).toMatchObject({
      ok: true,
      data: {
        orders: {
          byStatus: { en_proceso: 2, terminada: 1 },
          active: [{ folio: "CDMX-01-000010", total: 550, bayName: "Bahía 1" }],
          deliveredToday: { count: 3, total: 1500.5, pending: 200 },
        },
        agenda: null,
        payments: { count: 2, total: 1300.5 },
      },
    });
  });
});
