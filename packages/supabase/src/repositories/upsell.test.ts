import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createUpsellRepository } from "./upsell";

const U = "00000000-0000-4000-8000-000000000001";
const V = "00000000-0000-4000-8000-000000000002";

function fake(response: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(response);
  return { client: { rpc } as unknown as MeguiarsSupabaseClient, rpc };
}

describe("UpsellRepository (Supabase)", () => {
  it("sugerencias: importes numéricos y explicación", async () => {
    const { client, rpc } = fake({
      data: [
        {
          offer_id: U,
          rule_id: V,
          stage: "diagnostico",
          rule_name: "Lavado → descontaminación",
          pitch: "Deja la pintura lista",
          source_service_name: "Lavado",
          target_kind: "servicio",
          target_service_id: V,
          target_plan_id: null,
          target_name: "Descontaminación",
          price: "650.00",
          priority: 90,
          acceptance_rate: "0.5000",
          offered_count: 0,
        },
      ],
      error: null,
    });
    const r = await createUpsellRepository(client).suggestions(U);
    expect(rpc).toHaveBeenCalledWith("upsell_suggestions", { p_order_id: U, p_limit: 3 });
    expect(r).toMatchObject({
      ok: true,
      data: [{ price: 650, acceptanceRate: 0.5, targetKind: "servicio" }],
    });
  });

  it("aceptar devuelve la nueva versión; la OS que cambió da conflicto visible", async () => {
    const ok = fake({ data: { version: 4 }, error: null });
    expect(await createUpsellRepository(ok.client).accept(U, 3, V)).toEqual({
      ok: true,
      data: { version: 4 },
    });
    const stale = fake({ data: null, error: { code: "40001", message: "La OS cambió en otro dispositivo" } });
    const r = await createUpsellRepository(stale.client).accept(U, 3, V);
    expect(r.ok).toBe(false);
  });

  it("regla inválida no llega a la base; motivo de rechazo opcional", async () => {
    const { client, rpc } = fake({ data: null, error: null });
    const repo = createUpsellRepository(client);
    const bad = await repo.upsertRule({
      organizationId: U,
      name: "X",
      stage: "diagnostico",
      priority: 50,
      pitch: "x x x",
      channels: ["b2c"],
      startsOn: "2026-10-01",
      active: true,
      reason: "Alta",
    });
    expect(bad.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    await repo.reject(U, V);
    expect(rpc).toHaveBeenCalledWith("reject_upsell", { p_order_id: U, p_rule_id: V, p_reason: null });
  });
});
