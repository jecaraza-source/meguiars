import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createMembershipRepository } from "./memberships";

const ID = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";

function fake(rpcResponse: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(rpcResponse);
  return { client: { rpc } as unknown as MeguiarsSupabaseClient, rpc };
}

const redemptionRow = {
  id: "r1",
  membership_id: ID,
  detail_center_id: OTHER,
  service_order_id: OTHER,
  item_id: OTHER,
  service_code: "LAV",
  service_name: "Lavado",
  quantity: 2,
  amount: "500.00",
  period_start: "2026-10-01",
  period_end: "2026-10-31",
  redeemed_at: "2026-10-05T15:00:00Z",
  voided_at: null,
  void_reason: null,
};

describe("MembershipRepository (Supabase)", () => {
  it("redime con versión de la OS y llave de idempotencia", async () => {
    const { client, rpc } = fake({ data: redemptionRow, error: null });
    const result = await createMembershipRepository(client).redeem({
      orderId: OTHER,
      version: 4,
      itemId: OTHER,
      membershipId: ID,
      quantity: 2,
      requestId: ID,
    });
    expect(rpc).toHaveBeenCalledWith("redeem_membership_benefit", {
      p_order_id: OTHER,
      p_version: 4,
      p_item_id: OTHER,
      p_membership_id: ID,
      p_quantity: 2,
      p_request_id: ID,
    });
    expect(result).toMatchObject({ ok: true, data: { amount: 500, quantity: 2, serviceCode: "LAV" } });
  });

  it("valida antes de llamar: sin motivo no se anula ni se cambia el estado", async () => {
    const { client, rpc } = fake({ data: null, error: null });
    const repo = createMembershipRepository(client);
    expect((await repo.voidRedemption("r1", 1, "")).ok).toBe(false);
    expect((await repo.setState({ membershipId: ID, state: "cancelada", reason: "" })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("traduce la regla de negocio de la base (MG002) a un error visible", async () => {
    const { client } = fake({
      data: null,
      error: { code: "MG002", message: "Sin saldo: 2 de 2 usados en el periodo" },
    });
    const result = await createMembershipRepository(client).redeem({
      orderId: OTHER,
      version: 1,
      itemId: OTHER,
      membershipId: ID,
      quantity: 1,
      requestId: ID,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("Sin saldo: 2 de 2 usados en el periodo");
  });

  it("KPIs: hechos numéricos por membresía", async () => {
    const { client } = fake({
      data: [
        {
          detail_center_id: OTHER,
          membership_id: ID,
          status: "activa",
          price: "3900.00",
          period_months: 3,
          started_on: "2026-09-01",
          ends_on: "2026-11-30",
          entitled_units: 4,
          used_units: 1,
          new_in_range: true,
          renewals_in_range: 0,
          cancelled_in_range: false,
          expired_in_range: false,
          revenue_in_range: "3900.00",
        },
      ],
      error: null,
    });
    const result = await createMembershipRepository(client).metricFacts([OTHER], "2026-09-01", "2026-09-30");
    expect(result).toMatchObject({
      ok: true,
      data: [{ price: 3900, periodMonths: 3, revenueInRange: 3900 }],
    });
  });
});
