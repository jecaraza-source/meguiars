import { describe, expect, it } from "vitest";
import { campaignSchema, campaignSpendSchema, contentStatusSchema, promotionSchema } from "./marketing";

const U = "11111111-1111-4111-8111-111111111111";

describe("marketing", () => {
  it("campaña: UTM normalizado, canales sin repetir y fechas en orden", () => {
    const ok = campaignSchema.parse({
      organizationId: U,
      name: "Lavado manual octubre",
      objective: "prospectos",
      channels: ["instagram", "instagram", "facebook"],
      startsOn: "2026-10-01",
      endsOn: "2026-10-31",
      budget: "5000",
      utmSource: "Instagram",
      utmMedium: "paid_social",
      utmCampaign: "lmd_oct",
      landingUrl: "",
      reason: "Campaña del mes",
    });
    expect(ok).toMatchObject({
      utmSource: "instagram",
      channels: ["instagram", "facebook"],
      budget: 5000,
      status: "planeada",
    });
    expect(campaignSchema.safeParse({ ...ok, utmCampaign: "con espacios" }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...ok, endsOn: "2026-09-01" }).success).toBe(false);
    expect(campaignSchema.safeParse({ ...ok, landingUrl: "http://inseguro.mx" }).success).toBe(false);
  });
  it("gasto: importe o egreso ligado", () => {
    expect(campaignSpendSchema.safeParse({ campaignId: U, channel: "instagram" }).success).toBe(false);
    expect(campaignSpendSchema.safeParse({ campaignId: U, channel: "instagram", expenseId: U }).success).toBe(
      true,
    );
    expect(
      campaignSpendSchema.safeParse({
        campaignId: U,
        channel: "facebook",
        amount: "300",
        spentOn: "2026-10-02",
      }).success,
    ).toBe(true);
  });
  it("publicar pide el enlace", () => {
    expect(contentStatusSchema.safeParse({ id: U, version: 1, status: "publicada" }).success).toBe(false);
    expect(
      contentStatusSchema.safeParse({
        id: U,
        version: 1,
        status: "publicada",
        publishedUrl: "https://instagram.com/p/x",
      }).success,
    ).toBe(true);
  });
  it("promoción: código en mayúsculas y porcentaje ≤ 100", () => {
    const base = {
      organizationId: U,
      code: "lava15",
      name: "Lavado 15 %",
      kind: "percent",
      value: "15",
      startsOn: "2026-10-01",
      endsOn: "2026-10-31",
      active: "on",
      reason: "Promo del mes",
    };
    expect(promotionSchema.parse(base)).toMatchObject({
      code: "LAVA15",
      value: 15,
      active: true,
      serviceIds: [],
    });
    expect(promotionSchema.safeParse({ ...base, value: "120" }).success).toBe(false);
    expect(promotionSchema.safeParse({ ...base, code: "a b" }).success).toBe(false);
  });
});
