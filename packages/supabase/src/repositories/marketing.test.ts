import { describe, expect, it, vi } from "vitest";
import type { MeguiarsSupabaseClient } from "../client";
import { createMarketingRepository } from "./marketing";

const U = "11111111-1111-4111-8111-111111111111";

function fakeClient(data: unknown) {
  const rpc = vi.fn(() => Promise.resolve({ data, error: null }));
  return { client: { rpc } as unknown as MeguiarsSupabaseClient, rpc };
}

describe("repositorio de marketing", () => {
  it("la campaña exige UTM válido antes de llegar a la base", async () => {
    const { client, rpc } = fakeClient({ id: U });
    const repo = createMarketingRepository(client);
    const base = {
      organizationId: U,
      name: "Lavado del mes",
      objective: "prospectos" as const,
      channels: ["facebook" as const],
      startsOn: "2026-10-01",
      endsOn: "2026-10-31",
      status: "planeada" as const,
      utmSource: "facebook",
      utmMedium: "paid_social",
      utmCampaign: "lavado-octubre",
      landingUrl: "https://meguiars.mx/lavado",
      reason: "Alta de campaña",
    };
    const bad = await repo.saveCampaign({ ...base, utmCampaign: "Lavado Octubre" });
    expect(bad.ok).toBe(false);
    const http = await repo.saveCampaign({ ...base, landingUrl: "http://meguiars.mx" });
    expect(http.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    const ok = await repo.saveCampaign(base);
    expect(ok).toEqual({ ok: true, data: { id: U } });
    expect(rpc).toHaveBeenCalledWith(
      "upsert_campaign",
      expect.objectContaining({ p_utm_campaign: "lavado-octubre", p_budget: null, p_detail_center_id: null }),
    );
  });

  it("el gasto necesita importe o egreso ligado", async () => {
    const { client, rpc } = fakeClient(null);
    const repo = createMarketingRepository(client);
    const bad = await repo.addSpend({ campaignId: U, channel: "facebook" });
    expect(bad.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    const linked = await repo.addSpend({ campaignId: U, channel: "facebook", expenseId: U });
    expect(linked.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("add_campaign_spend", {
      p_campaign_id: U,
      p_spent_on: null,
      p_amount: null,
      p_channel: "facebook",
      p_expense_id: U,
      p_note: null,
    });
  });

  it("publicar exige el enlace y el código de promoción viaja en mayúsculas", async () => {
    const { client, rpc } = fakeClient(null);
    const repo = createMarketingRepository(client);
    expect((await repo.setPostStatus(U, 1, "publicada")).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    await repo.applyPromotionToOrder(U, 3, " lava15 ");
    expect(rpc).toHaveBeenCalledWith("apply_promotion_to_order", {
      p_order_id: U,
      p_version: 3,
      p_code: "LAVA15",
    });
  });

  it("los hechos de campaña llegan como números", async () => {
    const { client } = fakeClient([
      {
        campaign_id: U,
        name: "Lavado",
        objective: "prospectos",
        status: "activa",
        starts_on: "2026-10-01",
        ends_on: "2026-10-31",
        budget: null,
        spend: "1500.00",
        leads: 2,
        contacted: 1,
        quoted: 1,
        booked: 1,
        won: 1,
        sales: "340.00",
        sales_cost: "100.00",
        sales_margin: "240.00",
        promo_uses: 2,
        promo_discount: "120.00",
      },
    ]);
    const r = await createMarketingRepository(client).facts(U, [U], "2026-10-01", "2026-10-31");
    expect(r.ok && r.data[0]).toMatchObject({
      budget: null,
      spend: 1500,
      sales: 340,
      salesMargin: 240,
      promoDiscount: 120,
    });
  });
});
