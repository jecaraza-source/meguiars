import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createReceivablesRepository, toBillingDocumentDetail } from "./receivables";

const U = "00000000-0000-4000-8000-000000000001";
const V = "00000000-0000-4000-8000-000000000002";

function fake(response: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(response);
  return { client: { rpc } as unknown as MeguiarsSupabaseClient, rpc };
}

const detail = {
  id: V,
  account_id: U,
  account_name: "Flotillas SA",
  legal_name: "Flotillas del Valle SA de CV",
  rfc: "FVA010101AB1",
  tax_regime: "601",
  fiscal_zip: "06600",
  billing_email: null,
  home_detail_center_id: U,
  folio: "CXC-000001",
  period_from: "2026-08-01",
  period_to: "2026-08-31",
  issued_on: "2026-09-01",
  external_ref: "FAC-777",
  external_invoiced_on: "2026-09-02",
  due_on: "2026-09-16",
  due_on_reason: null,
  orders_amount: "3000.00",
  fee_amount: "0.00",
  amount: "3000.00",
  paid: "1900.00",
  balance: "1100.00",
  status: "vencido",
  age_days: 26,
  days_overdue: 11,
  notes: null,
  void_reason: null,
  created_at: "2026-09-01T12:00:00Z",
  orders: [
    {
      id: U,
      folio: "A-01-000001",
      detail_center_id: U,
      center_name: "Centro A",
      delivered_on: "2026-08-10",
      vehicle_label: "Nissan NP300 · FLT0001",
      purchase_order: "OC-1",
      total: "200.00",
    },
  ],
  payments: [
    {
      payment_id: U,
      paid_on: "2026-09-20",
      method: "cheque",
      reference: null,
      amount: "500.00",
      voided: false,
    },
  ],
};

describe("repositorio de cuentas por cobrar B2B", () => {
  it("detalle: convierte montos y valida la forma del jsonb", () => {
    const d = toBillingDocumentDetail(detail);
    expect(d).toMatchObject({ folio: "CXC-000001", paid: 1900, balance: 1100, status: "vencido" });
    expect(d?.orders[0]).toMatchObject({ total: 200, purchaseOrder: "OC-1" });
    expect(d?.payments[0]).toMatchObject({ amount: 500, method: "cheque", voided: false });
    expect(toBillingDocumentDetail({ ...detail, orders: "x" })).toBeNull();
  });

  it("documento inexistente → not_found", async () => {
    const { client } = fake({ data: null, error: null });
    const r = await createReceivablesRepository(client).document(V);
    expect(r).toMatchObject({ ok: false, error: { kind: "not_found" } });
  });

  it("agrupar: sin OS = todas las del periodo; manda nulos explícitos", async () => {
    const { client, rpc } = fake({ data: { id: V, folio: "CXC-000002" }, error: null });
    const r = await createReceivablesRepository(client).createBatch({
      accountId: U,
      requestId: V,
      periodFrom: "2026-09-01",
      periodTo: "2026-09-15",
      feeAmount: 0,
      externalRef: "",
    });
    expect(r).toEqual({ ok: true, data: { id: V, folio: "CXC-000002" } });
    expect(rpc).toHaveBeenCalledWith("create_b2b_billing_batch", {
      p_account_id: U,
      p_request_id: V,
      p_period_from: "2026-09-01",
      p_period_to: "2026-09-15",
      p_order_ids: null,
      p_fee_amount: 0,
      p_due_on: null,
      p_external_ref: null,
      p_external_invoiced_on: null,
      p_notes: null,
    });
  });

  it("pago: aplicaciones en snake_case; sin aplicación = automática (null)", async () => {
    const { client, rpc } = fake({ data: { id: U }, error: null });
    const repo = createReceivablesRepository(client);
    await repo.registerPayment({
      accountId: U,
      requestId: V,
      amount: 1200,
      method: "transferencia",
      allocations: [{ invoiceId: V, amount: 200 }],
    });
    expect(rpc).toHaveBeenLastCalledWith("register_b2b_payment", {
      p_account_id: U,
      p_request_id: V,
      p_amount: 1200,
      p_method: "transferencia",
      p_reference: null,
      p_paid_on: null,
      p_allocations: [{ invoice_id: V, amount: 200 }],
    });
    await repo.registerPayment({ accountId: U, requestId: V, amount: 100, method: "cheque" });
    expect(rpc.mock.lastCall?.[1]).toMatchObject({ p_allocations: null });
  });

  it("valida antes de llamar a la base", async () => {
    const { client, rpc } = fake({ data: null, error: null });
    const repo = createReceivablesRepository(client);
    const r = await repo.registerPayment({
      accountId: U,
      requestId: V,
      amount: 100,
      method: "transferencia",
      allocations: [{ invoiceId: V, amount: 150 }],
    });
    expect(r).toMatchObject({ ok: false, error: { kind: "validation" } });
    expect((await repo.accounts([])).ok).toBe(false);
    expect((await repo.exportRows([U], "2025-01-01", "2026-12-31")).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("pagos: aplicaciones del jsonb y saldo a favor", async () => {
    const { client } = fake({
      data: [
        {
          id: U,
          amount: "900.00",
          method: "cheque",
          reference: "CH-12",
          paid_on: "2026-09-20",
          voided_at: null,
          void_reason: null,
          applied: "500.00",
          unapplied: "400.00",
          allocations: [{ invoice_id: V, folio: "CXC-000001", amount: "500.00" }],
          created_at: "2026-09-20T12:00:00Z",
        },
      ],
      error: null,
    });
    const r = await createReceivablesRepository(client).payments(U);
    expect(r.ok && r.data[0]).toMatchObject({
      amount: 900,
      unapplied: 400,
      allocations: [{ invoiceId: V, folio: "CXC-000001", amount: 500 }],
    });
  });

  it("errores de la base: MG002 → validación con el mensaje", async () => {
    const { client } = fake({
      data: null,
      error: { code: "MG002", message: "La cuota facturada supera la devengada pendiente" },
    });
    const r = await createReceivablesRepository(client).voidBatch(V, "Se refactura");
    expect(r).toMatchObject({
      ok: false,
      error: { message: "La cuota facturada supera la devengada pendiente" },
    });
  });
});
