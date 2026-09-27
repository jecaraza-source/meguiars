import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createPaymentRepository, toReceipt } from "./payments";

const U = "00000000-0000-4000-8000-000000000001";
const V = "00000000-0000-4000-8000-000000000002";

function fake(response: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(response);
  return { client: { rpc } as unknown as MeguiarsSupabaseClient, rpc };
}

const receiptRow = {
  id: V,
  receipt_folio: "CDMX-01-R-000001",
  status: "valido",
  amount: "1000.00",
  cash_received: "600.00",
  change_amount: "100.00",
  notes: null,
  received_at: "2026-09-27T16:00:00Z",
  received_by: "Recepción",
  detail_center_id: U,
  center_name: "Centro CDMX",
  center_timezone: "America/Mexico_City",
  organization_name: "Demo",
  client_name: null,
  tenders: [
    { method: "efectivo", name: "Efectivo", amount: 500, reference: null },
    { method: "tarjeta", name: "Tarjeta", amount: "500.00", reference: "AUT-4411" },
  ],
  orders: [
    {
      id: U,
      folio: "CDMX-01-000001",
      total: 1890,
      applied: 1000,
      paid: 1000,
      balance: 890,
      payment_status: "parcial",
    },
  ],
  reversal: null,
};

describe("PaymentRepository (Supabase)", () => {
  it("cobro mixto: formas de pago, efectivo recibido y solicitud idempotente", async () => {
    const { client, rpc } = fake({
      data: { id: V, receipt_folio: "CDMX-01-R-000001", status: "valido" },
      error: null,
    });
    const r = await createPaymentRepository(client).register({
      orderId: U,
      version: 4,
      requestId: V,
      tenders: [
        { method: "efectivo", amount: 500 },
        { method: "tarjeta", amount: 500, reference: "AUT-4411" },
      ],
      cashReceived: 600,
    });
    expect(r).toEqual({ ok: true, data: { id: V, receiptFolio: "CDMX-01-R-000001", status: "valido" } });
    expect(rpc).toHaveBeenCalledWith("register_payment", {
      p_order_id: U,
      p_version: 4,
      p_request_id: V,
      p_tenders: [
        { method: "efectivo", amount: 500 },
        { method: "tarjeta", amount: 500, reference: "AUT-4411" },
      ],
      p_cash_received: 600,
      p_notes: null,
    });
  });

  it("no llega a la base sin referencia de transferencia ni sin motivo de reverso", async () => {
    const { client, rpc } = fake({ data: null, error: null });
    const repo = createPaymentRepository(client);
    expect(
      (
        await repo.register({
          orderId: U,
          version: 1,
          requestId: V,
          tenders: [{ method: "transferencia", amount: 1 }],
        })
      ).ok,
    ).toBe(false);
    expect((await repo.reverse({ paymentId: V, reason: "" })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("traduce sobrepago, permiso y conflicto de versión", async () => {
    for (const [code, kind] of [
      ["22023", "validation"],
      ["42501", "permission_denied"],
      ["40001", "conflict"],
      ["MG002", "validation"],
    ] as const) {
      const { client } = fake({ data: null, error: { code, message: "x" } });
      const r = await createPaymentRepository(client).register({
        orderId: U,
        version: 1,
        requestId: V,
        tenders: [{ method: "tarjeta", amount: 1 }],
      });
      expect(r.ok ? null : r.error.kind).toBe(kind);
    }
  });

  it("recibo interno: jsonb validado y montos numéricos; sin nombre para el contador", () => {
    const r = toReceipt(receiptRow);
    expect(r).toMatchObject({
      receiptFolio: "CDMX-01-R-000001",
      amount: 1000,
      cashReceived: 600,
      changeAmount: 100,
      clientName: null,
      tenders: [
        { method: "efectivo", amount: 500, reference: null },
        { method: "tarjeta", amount: 500, reference: "AUT-4411" },
      ],
      orders: [{ folio: "CDMX-01-000001", balance: 890, paymentStatus: "parcial" }],
    });
    expect(toReceipt({ id: V })).toBeNull();
  });

  it("recibo inexistente o ajeno → no encontrado", async () => {
    const { client } = fake({ data: null, error: null });
    const r = await createPaymentRepository(client).receipt(V);
    expect(r.ok ? null : r.error.kind).toBe("not_found");
  });

  it("corte: hechos por forma de pago y rango validado", async () => {
    const { client, rpc } = fake({
      data: [
        {
          detail_center_id: U,
          day: "2026-09-27",
          method: "efectivo",
          method_name: "Efectivo",
          collects_cash: true,
          valid_amount: "1500.00",
          valid_count: 2,
          reversed_amount: "100.00",
          reversed_count: 1,
          change_amount: "500.00",
        },
      ],
      error: null,
    });
    const repo = createPaymentRepository(client);
    const r = await repo.facts({ detailCenterIds: [U], from: "2026-09-27", to: "2026-09-27" });
    expect(r).toEqual({
      ok: true,
      data: [
        {
          detailCenterId: U,
          day: "2026-09-27",
          method: "efectivo",
          methodName: "Efectivo",
          collectsCash: true,
          validAmount: 1500,
          validCount: 2,
          reversedAmount: 100,
          reversedCount: 1,
          changeAmount: 500,
        },
      ],
    });
    expect(rpc).toHaveBeenCalledWith("payment_facts", {
      p_detail_center_ids: [U],
      p_from: "2026-09-27",
      p_to: "2026-09-27",
    });
    expect((await repo.facts({ detailCenterIds: [U], from: "2026-09-28", to: "2026-09-27" })).ok).toBe(false);
  });

  it("recibos de la OS: formas de pago y reverso", async () => {
    const { client } = fake({
      data: [
        {
          id: V,
          receipt_folio: "A-01-R-000002",
          amount: "2300.00",
          applied: "2300.00",
          status: "revertido",
          received_at: "2026-09-27T16:00:00Z",
          received_by_name: "Operador",
          cash_received: null,
          change_amount: "0",
          tenders: [{ method: "tarjeta", name: "Tarjeta", amount: 2300, reference: "AUT-1" }],
          reversal_reason: "Tarjeta declinada",
          reversed_at: "2026-09-27T17:00:00Z",
          reversed_by_name: "Encargado",
        },
      ],
      error: null,
    });
    const r = await createPaymentRepository(client).orderPayments(U);
    expect(r.ok && r.data[0]).toMatchObject({
      status: "revertido",
      applied: 2300,
      cashReceived: null,
      reversalReason: "Tarjeta declinada",
      tenders: [{ method: "tarjeta", amount: 2300 }],
    });
  });
});
