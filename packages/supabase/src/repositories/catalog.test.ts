import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createCatalogRepository } from "./catalog";

const CENTER = "11111111-1111-4111-8111-111111111111";
const ORG = "00000000-0000-4000-8000-00000000d3e0";
const SERVICE = "5e000000-0000-4000-8000-000000000001";

function fakeRpc(response: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(response);
  const rpc = vi.fn(() => Object.assign(Promise.resolve(response), { single }));
  return { client: { rpc } as unknown as MeguiarsSupabaseClient, rpc };
}

describe("CatalogRepository (Supabase)", () => {
  it("catálogo del centro filtrado por motor, con importes numéricos", async () => {
    const { client, rpc } = fakeRpc({
      data: [
        {
          id: SERVICE,
          code: "LAV-EXP",
          name: "Lavado exprés",
          description: null,
          revenue_engine: "recurrente",
          standard_duration_minutes: 40,
          base_price: 250,
          standard_direct_cost: "80.00",
          price: 220,
          direct_cost: 70,
          price_source: "center",
          available: true,
          active: true,
        },
      ],
      error: null,
    });
    const result = await createCatalogRepository(client).listForCenter(CENTER, {
      revenueEngine: "recurrente",
    });
    expect(rpc).toHaveBeenCalledWith("center_catalog", {
      p_detail_center_id: CENTER,
      p_revenue_engine: "recurrente",
      p_include_inactive: false,
    });
    expect(result).toMatchObject({
      ok: true,
      data: [{ price: 220, standardDirectCost: 80, priceSource: "center", revenueEngine: "recurrente" }],
    });
  });

  it("alta: valida y envía los valores normalizados", async () => {
    const { client, rpc } = fakeRpc({ data: null, error: { code: "23505", message: "duplicate key" } });
    const repo = createCatalogRepository(client);
    const bad = await repo.create({
      organizationId: ORG,
      code: "x",
      name: "Lavado",
      revenueEngine: "recurrente",
      standardDurationMinutes: 40,
      basePrice: 250,
      standardDirectCost: 80,
    });
    expect(bad).toMatchObject({ ok: false, error: { kind: "validation" } });
    expect(rpc).not.toHaveBeenCalled();
    const conflict = await repo.create({
      organizationId: ORG,
      code: " lav-exp ",
      name: "Lavado exprés",
      revenueEngine: "recurrente",
      standardDurationMinutes: 40,
      basePrice: 250,
      standardDirectCost: 80,
    });
    expect(rpc).toHaveBeenCalledWith(
      "create_service",
      expect.objectContaining({ p_code: "LAV-EXP", p_description: "" }),
    );
    expect(conflict).toMatchObject({ ok: false, error: { kind: "conflict", code: "23505" } });
  });

  it("configuración del centro: vacío = valor base (null)", async () => {
    const { client, rpc } = fakeRpc({ data: { id: "cfg" }, error: null });
    const result = await createCatalogRepository(client).configureCenter({
      detailCenterId: CENTER,
      serviceId: SERVICE,
      available: false,
      reason: "Sin cabina",
    });
    expect(rpc).toHaveBeenCalledWith("set_service_center_config", {
      p_detail_center_id: CENTER,
      p_service_id: SERVICE,
      p_available: false,
      p_price_override: null,
      p_direct_cost_override: null,
      p_reason: "Sin cabina",
    });
    expect(result).toEqual({ ok: true, data: undefined });
  });
});
