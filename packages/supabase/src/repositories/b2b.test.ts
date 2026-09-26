import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createB2bRepository } from "./b2b";

const ID = "00000000-0000-4000-8000-000000000001";

function fake(response: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(response);
  return { client: { rpc } as unknown as MeguiarsSupabaseClient, rpc };
}

describe("B2bRepository (Supabase)", () => {
  it("alta de cuenta: normaliza y manda nulos explícitos a la RPC", async () => {
    const { client, rpc } = fake({ data: { id: ID }, error: null });
    const r = await createB2bRepository(client).upsertAccount({
      requestId: ID,
      homeDetailCenterId: ID,
      clientId: ID,
      name: "Flotillas",
      rfc: "fva010101ab1",
      status: "activa",
      reason: "Alta",
    });
    expect(r).toEqual({ ok: true, data: { id: ID } });
    expect(rpc).toHaveBeenCalledWith(
      "upsert_b2b_account",
      expect.objectContaining({ p_id: null, p_rfc: "FVA010101AB1", p_legal_name: null, p_reason: "Alta" }),
    );
  });

  it("la tarifa 'incluido' no manda valor; una inválida no llega a la base", async () => {
    const { client, rpc } = fake({ data: {}, error: null });
    const repo = createB2bRepository(client);
    await repo.setPriceRule({
      agreementId: ID,
      kind: "incluido",
      value: 5,
      minMonthlyOrders: 0,
      active: true,
      reason: "Tarifa",
    });
    expect(rpc).toHaveBeenCalledWith(
      "set_b2b_price_rule",
      expect.objectContaining({ p_value: null, p_service_id: null }),
    );
    rpc.mockClear();
    expect(
      (
        await repo.setPriceRule({
          agreementId: ID,
          kind: "precio_fijo",
          minMonthlyOrders: 0,
          active: true,
          reason: "x",
        })
      ).ok,
    ).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("OS a cuenta: líneas como service_id / quantity; errores de convenio visibles (MG002)", async () => {
    const { client, rpc } = fake({
      data: null,
      error: { code: "MG002", message: "El vehículo no está autorizado en el convenio" },
    });
    const r = await createB2bRepository(client).createOrder({
      detailCenterId: ID,
      requestId: ID,
      accountId: ID,
      vehicleId: ID,
      items: [{ serviceId: ID, quantity: 2 }],
      purchaseOrder: "OC-1",
    });
    expect(rpc).toHaveBeenCalledWith(
      "create_b2b_service_order",
      expect.objectContaining({ p_items: [{ service_id: ID, quantity: 2 }], p_purchase_order: "OC-1" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/no está autorizado/);
  });

  it("estado de cuenta: importes numéricos y crédito nulo sin límite", async () => {
    const { client } = fake({
      data: [
        {
          consumption: "2680.00",
          orders_to_invoice: "2680.00",
          fees_accrued: "0",
          fees_invoiced: "0",
          to_invoice: "2680.00",
          invoiced: "0",
          paid: "0",
          receivable: "0",
          overdue: "0",
          open_orders: "270.00",
          exposure: "2950.00",
          credit_limit: null,
          credit_available: null,
        },
      ],
      error: null,
    });
    const r = await createB2bRepository(client).statement(ID);
    expect(r).toMatchObject({ ok: true, data: { consumption: 2680, exposure: 2950, creditLimit: null } });
  });
});
