import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createExpenseRepository, toExpense } from "./expenses";

const U = "00000000-0000-4000-8000-000000000001";
const V = "00000000-0000-4000-8000-000000000002";

function fake(response: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(response);
  const upload = vi.fn().mockResolvedValue({ data: {}, error: null });
  const createSignedUrls = vi
    .fn()
    .mockResolvedValue({ data: [{ path: "o/c/e/f.pdf", signedUrl: "https://s/f" }], error: null });
  const storage = { from: vi.fn(() => ({ upload, createSignedUrls })) };
  return { client: { rpc, storage } as unknown as MeguiarsSupabaseClient, rpc, upload, storage };
}

const row = { id: V, folio: "A-01-E-000001", status: "pendiente", version: 1 };
const detail = {
  id: V,
  organization_id: "o",
  detail_center_id: "c",
  folio: "A-01-E-000001",
  category_id: U,
  category_name: "Nómina",
  pnl_group: "personal",
  vendor_id: null,
  vendor_name: null,
  concept: "Nómina",
  amount: "8000.00",
  payment_method: "transferencia",
  paid_on: "2026-09-27",
  reference: null,
  notes: null,
  status: "pendiente",
  requires_approval: true,
  approved_at: null,
  approved_by_name: null,
  void_reason: null,
  voided_at: null,
  voided_by_name: null,
  version: 1,
  created_by: U,
  created_by_name: "Encargada",
  created_at: "2026-09-27T12:00:00Z",
  center_timezone: "America/Mexico_City",
  attachments: [
    {
      id: U,
      storage_path: "o/c/e/f.pdf",
      file_name: "factura.pdf",
      content_type: "application/pdf",
      size_bytes: 1000,
      uploaded_by_name: "Encargada",
      created_at: "2026-09-27T12:00:00Z",
    },
  ],
  events: [
    {
      kind: "solicitada",
      amount: "8000.00",
      note: null,
      actor_name: "Encargada",
      occurred_at: "2026-09-27T12:00:00Z",
    },
  ],
};

describe("ExpenseRepository (Supabase)", () => {
  it("alta: importe en texto, proveedor opcional y solicitud idempotente", async () => {
    const { client, rpc } = fake({ data: row, error: null });
    const r = await createExpenseRepository(client).create({
      detailCenterId: U,
      requestId: V,
      categoryId: U,
      concept: "Nómina",
      amount: 8000,
      paymentMethod: "transferencia",
      paidOn: "2026-09-27",
    });
    expect(r).toEqual({ ok: true, data: { id: V, folio: "A-01-E-000001", status: "pendiente", version: 1 } });
    expect(rpc).toHaveBeenCalledWith("create_expense", {
      p_detail_center_id: U,
      p_request_id: V,
      p_category_id: U,
      p_vendor_id: null,
      p_concept: "Nómina",
      p_amount: 8000,
      p_payment_method: "transferencia",
      p_paid_on: "2026-09-27",
      p_reference: null,
      p_notes: null,
    });
  });

  it("editar, rechazar y anular sin motivo no llegan a la base", async () => {
    const { client, rpc } = fake({ data: row, error: null });
    const repo = createExpenseRepository(client);
    expect((await repo.reject({ expenseId: V, version: 1, reason: "" })).ok).toBe(false);
    expect((await repo.void({ expenseId: V, version: 1 })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    await repo.approve({ expenseId: V, version: 1 });
    expect(rpc).toHaveBeenCalledWith("approve_expense", { p_expense_id: V, p_version: 1, p_note: null });
  });

  it("comprobante: sube a <org>/<centro>/<egreso>/<uuid>.pdf y lo registra", async () => {
    const { client, rpc, upload, storage } = fake({ data: { id: U }, error: null });
    const r = await createExpenseRepository(client).uploadReceipt({
      expense: { organizationId: "o", detailCenterId: "c", id: "e" },
      fileId: "f",
      file: new ArrayBuffer(8),
      contentType: "application/pdf",
      sizeBytes: 8,
      fileName: "factura.pdf",
    });
    expect(r).toEqual({ ok: true, data: { id: U } });
    expect(storage.from).toHaveBeenCalledWith("expense-receipts");
    expect(upload).toHaveBeenCalledWith("o/c/e/f.pdf", expect.any(ArrayBuffer), {
      contentType: "application/pdf",
      upsert: false,
    });
    expect(rpc).toHaveBeenCalledWith(
      "register_expense_attachment",
      expect.objectContaining({ p_storage_path: "o/c/e/f.pdf" }),
    );
  });

  it("comprobante inválido no se sube", async () => {
    const { client, upload } = fake({ data: null, error: null });
    const r = await createExpenseRepository(client).uploadReceipt({
      expense: { organizationId: "o", detailCenterId: "c", id: "e" },
      fileId: "f",
      file: new ArrayBuffer(8),
      contentType: "image/gif" as never,
      sizeBytes: 8,
    });
    expect(r.ok).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });

  it("ficha: jsonb validado, montos numéricos y URL firmada del comprobante", async () => {
    const { client } = fake({ data: detail, error: null });
    const r = await createExpenseRepository(client).get(V);
    expect(r.ok && r.data).toMatchObject({
      amount: 8000,
      pnlGroup: "personal",
      attachments: [{ fileName: "factura.pdf", signedUrl: "https://s/f" }],
      events: [{ kind: "solicitada", amount: 8000 }],
    });
    expect(toExpense({ id: V }, new Map())).toBeNull();
  });

  it("ajeno o inexistente → no encontrado; conflicto de versión", async () => {
    expect((await createExpenseRepository(fake({ data: null, error: null }).client).get(V)).ok).toBe(false);
    const r = await createExpenseRepository(
      fake({ data: null, error: { code: "40001", message: "x" } }).client,
    ).approve({
      expenseId: V,
      version: 1,
    });
    expect(r.ok ? null : r.error.kind).toBe("conflict");
  });

  it("filtros", async () => {
    const { client, rpc } = fake({ data: [], error: null });
    const repo = createExpenseRepository(client);
    await repo.list({ detailCenterIds: [U], from: "2026-09-01", to: "2026-09-30", status: "pendiente" });
    expect(rpc).toHaveBeenLastCalledWith("list_expenses", {
      p_detail_center_ids: [U],
      p_from: "2026-09-01",
      p_to: "2026-09-30",
      p_category_id: null,
      p_vendor_id: null,
      p_status: "pendiente",
      p_pnl_group: null,
    });
    expect((await repo.list({ detailCenterIds: [U], from: "2026-09-30", to: "2026-09-01" })).ok).toBe(false);
  });
});
