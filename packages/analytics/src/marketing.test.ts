import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_KPIS,
  campaignBudgetUsed,
  campaignCostPerLead,
  campaignCostPerSale,
  campaignLeadToSale,
  campaignMarginAfterSpend,
  campaignPromoDiscount,
  campaignSales,
  campaignSalesPerPeso,
  campaignSpend,
  type CampaignFactInput,
} from "./marketing";

const base: CampaignFactInput = {
  campaignId: "c1",
  name: "Lavado manual",
  budget: 5000,
  spend: 1500,
  leads: 10,
  contacted: 8,
  quoted: 5,
  booked: 3,
  won: 2,
  sales: 900,
  salesCost: 300,
  salesMargin: 600,
  promoUses: 2,
  promoDiscount: 120,
};

describe("KPIs de campaña", () => {
  it("costo por prospecto, por venta, conversión y presupuesto", () => {
    const i = { facts: [base] };
    expect(campaignSpend.compute(i)).toBe(1500);
    expect(campaignCostPerLead.compute(i)).toBe(150);
    expect(campaignCostPerSale.compute(i)).toBe(750);
    expect(campaignLeadToSale.compute(i)).toBe(20);
    expect(campaignBudgetUsed.compute(i)).toBe(30);
    expect(campaignPromoDiscount.compute(i)).toBe(120);
  });
  it("ventas por peso invertido no es utilidad: el margen después de la inversión puede ser negativo", () => {
    const i = { facts: [base] };
    expect(campaignSales.compute(i)).toBe(900);
    expect(campaignSalesPerPeso.compute(i)).toBe(0.6);
    expect(campaignMarginAfterSpend.compute(i)).toBe(-900);
    expect(campaignSalesPerPeso.formula).toMatch(/No es utilidad/);
  });
  it("sin datos en lugar de 0 cuando falta el denominador", () => {
    const noSpend = {
      facts: [{ ...base, spend: 0, won: 0, sales: 0, salesMargin: 0, promoUses: 0, budget: null }],
    };
    expect(campaignCostPerLead.compute(noSpend)).toBeNull();
    expect(campaignCostPerSale.compute(noSpend)).toBeNull();
    expect(campaignSalesPerPeso.compute(noSpend)).toBeNull();
    expect(campaignSales.compute(noSpend)).toBe(0);
    expect(campaignBudgetUsed.compute(noSpend)).toBeNull();
    expect(campaignPromoDiscount.compute(noSpend)).toBeNull();
    expect(campaignMarginAfterSpend.compute(noSpend)).toBeNull();
    const noLeads = { facts: [{ ...base, leads: 0, won: 0 }] };
    expect(campaignLeadToSale.compute(noLeads)).toBeNull();
    expect(campaignCostPerLead.compute(noLeads)).toBeNull();
    expect(campaignSales.compute({ facts: [{ ...base, leads: 0, won: 0, sales: 0 }] })).toBeNull();
    expect(campaignSpend.compute({ facts: [] })).toBeNull();
  });
  it("totales de varias campañas y fórmula explicada en todos", () => {
    const i = {
      facts: [
        base,
        {
          ...base,
          campaignId: "c2",
          spend: 500,
          leads: 5,
          won: 1,
          sales: 400,
          salesMargin: 250,
          budget: null,
        },
      ],
    };
    expect(campaignCostPerLead.compute(i)).toBe(133.33);
    expect(campaignBudgetUsed.compute(i)).toBe(30);
    expect(CAMPAIGN_KPIS.every((k) => k.formula.length > 10 && k.sources.length > 0)).toBe(true);
  });
});
