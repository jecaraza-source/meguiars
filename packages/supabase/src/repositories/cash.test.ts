import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createCashRepository, toCashSession } from "./cash";

const U = "00000000-0000-4000-8000-000000000001";
const V = "00000000-0000-4000-8000-000000000002";

function fake(response: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(response);
  return { client: { rpc } as unknown as MeguiarsSupabaseClient, rpc };
}

const totals = {
  opening_float: "500.00",
  cash_collected: "1450.00",
  cash_refunded: "200.00",
  expected_cash: "1750.00",
  card_total: "500.00",
  transfer_total: "300.00",
  non_cash_total: 0,
  payments_count: 5,
  reversals_count: 1,
  breakdown: [
    {
      method: "efectivo",
      name: "Efectivo",
      kind: "efectivo",
      collects_cash: true,
      collected: "1450.00",
      collected_count: 4,
      refunded: "200.00",
      refunded_count: 1,
    },
  ],
};

const detail = {
  id: V,
  organization_id: "o",
  detail_center_id: U,
  center_name: "Centro A",
  center_timezone: "America/Mexico_City",
  folio: "A-01-C-000001",
  business_date: "2026-10-09",
  shift: "matutino",
  status: "cerrada",
  opening_float: "500.00",
  opened_at: "2026-10-09T15:00:00Z",
  opened_by_name: "Encargada",
  window_end: "2026-10-09T21:00:00Z",
  closed_at: "2026-10-09T21:01:00Z",
  closed_by_name: "Encargada",
  notes: null,
  version: 2,
  live: totals,
  closings: [
    {
      ...totals,
      id: U,
      sequence: 1,
      window_from: "2026-10-09T15:00:00Z",
      window_to: "2026-10-09T21:00:00Z",
      counted_cash: "1700.00",
      difference: "-50.00",
      notes: "Faltan $50",
      closed_by_name: "Encargada",
      closed_at: "2026-10-09T21:01:00Z",
    },
  ],
  reopenings: [],
  payments: [
    {
      kind: "cobro",
      at: "2026-10-09T16:00:00Z",
      folio: "A-01-R-000001",
      status: "valido",
      amount: "1000.00",
      cash: "1000.00",
      methods: "Efectivo",
    },
  ],
};

describe("repositorio del corte de caja", () => {
  it("convierte la ficha (jsonb) con importes numéricos", () => {
    const s = toCashSession(detail);
    expect(s?.live.expectedCash).toBe(1750);
    expect(s?.closings[0]).toMatchObject({ sequence: 1, countedCash: 1700, difference: -50 });
    expect(s?.live.breakdown[0]).toMatchObject({ method: "efectivo", collected: 1450, refunded: 200 });
    expect(s?.movements[0]).toMatchObject({ kind: "cobro", cash: 1000 });
    expect(toCashSession({ id: 1 })).toBeNull();
  });

  it("abrir envía turno, fondo y solicitud (idempotente)", async () => {
    const { client, rpc } = fake({ data: { id: V, folio: "A-01-C-000001" }, error: null });
    const r = await createCashRepository(client).open({
      detailCenterId: U,
      requestId: V,
      shift: "unico",
      openingFloat: 1000,
    });
    expect(r).toEqual({ ok: true, data: { id: V, folio: "A-01-C-000001" } });
    expect(rpc).toHaveBeenCalledWith("open_cash_session", {
      p_detail_center_id: U,
      p_request_id: V,
      p_shift: "unico",
      p_opening_float: 1000,
      p_notes: null,
    });
  });

  it("cerrar valida la nota ante una diferencia antes de llamar a la base", async () => {
    const { client, rpc } = fake({ data: null, error: null });
    const r = await createCashRepository(client).close({
      sessionId: V,
      version: 1,
      requestId: U,
      countedCash: 1700,
      expectedCash: 1750,
    } as never);
    expect(r.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("cerrar devuelve la diferencia calculada por la base", async () => {
    const { client, rpc } = fake({
      data: { id: U, sequence: 1, expected_cash: "1750.00", counted_cash: "1700.00", difference: "-50.00" },
      error: null,
    });
    const r = await createCashRepository(client).close({
      sessionId: V,
      version: 1,
      requestId: U,
      countedCash: 1700,
      notes: "Faltan $50",
    });
    expect(r).toEqual({
      ok: true,
      data: { id: U, sequence: 1, expectedCash: 1750, countedCash: 1700, difference: -50 },
    });
    expect(rpc).toHaveBeenCalledWith("close_cash_session", {
      p_session_id: V,
      p_version: 1,
      p_request_id: U,
      p_counted_cash: 1700,
      p_notes: "Faltan $50",
    });
  });

  it("la reapertura exige motivo y traduce el permiso denegado", async () => {
    const { client, rpc } = fake({
      data: null,
      error: { code: "42501", message: "Sólo el admin reabre un corte cerrado" },
    });
    const repo = createCashRepository(client);
    expect((await repo.reopen({ sessionId: V, version: 2, reason: "" })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    const r = await repo.reopen({ sessionId: V, version: 2, reason: "Recontar" });
    expect(r).toMatchObject({ ok: false, error: { kind: "permission_denied" } });
  });

  it("el listado convierte importes y nulos", async () => {
    const { client } = fake({
      data: [
        {
          id: V,
          detail_center_id: U,
          folio: "A-01-C-000002",
          business_date: "2026-10-09",
          shift: "unico",
          status: "abierta",
          opening_float: "1000.00",
          opened_at: "2026-10-09T15:00:00Z",
          opened_by_name: null,
          window_end: null,
          closed_at: null,
          closed_by_name: null,
          expected_cash: "1500.00",
          counted_cash: null,
          difference: null,
          card_total: "500.00",
          transfer_total: "0",
          closings_count: 0,
          reopenings_count: 0,
          version: 1,
        },
      ],
      error: null,
    });
    const r = await createCashRepository(client).list([U], "2026-10-09", "2026-10-09");
    expect(r.ok && r.data[0]).toMatchObject({
      expectedCash: 1500,
      countedCash: null,
      difference: null,
      cardTotal: 500,
    });
  });
});
