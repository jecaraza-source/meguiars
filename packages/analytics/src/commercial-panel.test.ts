import { describe, expect, it } from "vitest";
import {
  PANEL_KPIS,
  PANEL_KPI_ORIGIN,
  filterPanel,
  leadsByStage,
  panelAttributedMargin,
  panelAttributedRevenue,
  panelAvgTicket,
  panelBookingToSale,
  panelByChannel,
  panelCostPerCustomer,
  panelCostPerLead,
  panelLeadToBooking,
  panelMarginAfterSpend,
  panelNewCustomers,
  panelReturningCustomers,
  panelRoas,
  panelSales,
  panelSpend,
  spendByOrigin,
  type PanelInput,
  type PanelLeadFact,
  type PanelSaleFact,
} from "./commercial-panel";

const lead = (p: Partial<PanelLeadFact>): PanelLeadFact => ({
  leadId: "l",
  source: "instagram",
  ownerId: "u1",
  campaignId: "c1",
  interestServiceIds: ["s1"],
  stageName: "Nuevo",
  stagePosition: 1,
  firstContactMinutes: 10,
  bookedAt: null,
  wonAt: null,
  status: "abierta",
  ...p,
});
const sale = (p: Partial<PanelSaleFact>): PanelSaleFact => ({
  orderId: "o",
  clientId: "k",
  total: 500,
  cost: 200,
  margin: 300,
  firstPurchase: true,
  leadId: null,
  source: null,
  ownerId: null,
  campaignId: null,
  serviceIds: ["s1"],
  ...p,
});

const input: PanelInput = {
  leads: [
    lead({ leadId: "l1", bookedAt: "x", status: "ganada", stageName: "Ganado", stagePosition: 90 }),
    lead({ leadId: "l2", bookedAt: "x" }),
    lead({ leadId: "l3", source: "facebook", campaignId: null, ownerId: "u2", interestServiceIds: ["s2"] }),
    lead({ leadId: "l4" }),
  ],
  sales: [
    sale({
      orderId: "o1",
      clientId: "k1",
      leadId: "l1",
      source: "instagram",
      ownerId: "u1",
      campaignId: "c1",
    }),
    sale({
      orderId: "o2",
      clientId: "k2",
      firstPurchase: false,
      total: 300,
      margin: 100,
      serviceIds: ["s2"],
    }),
    sale({ orderId: "o3", clientId: "k3" }),
  ],
  spend: [
    { campaignId: "c1", channel: "instagram", amount: 600, origin: "egreso" },
    { campaignId: "c1", channel: "facebook", amount: 400, origin: "manual" },
  ],
};

describe("panel comercial", () => {
  it("conversiones, ventas, ticket y clientes nuevos/recurrentes", () => {
    expect(panelLeadToBooking.compute(input)).toBe(50);
    expect(panelBookingToSale.compute(input)).toBe(50);
    expect(panelSales.compute(input)).toBe(1300);
    expect(panelAvgTicket.compute(input)).toBe(433.33);
    expect(panelNewCustomers.compute(input)).toBe(2);
    expect(panelReturningCustomers.compute(input)).toBe(1);
  });

  it("inversión, costo por prospecto y por cliente, ROAS que no es rentabilidad", () => {
    expect(panelSpend.compute(input)).toBe(1000);
    expect(panelCostPerLead.compute(input)).toBe(333.33);
    expect(panelCostPerCustomer.compute(input)).toBe(1000);
    expect(panelAttributedRevenue.compute(input)).toBe(500);
    expect(panelRoas.compute(input)).toBe(0.5);
    expect(panelRoas.formula).toMatch(/No es rentabilidad neta/);
    expect(panelAttributedMargin.compute(input)).toBe(300);
    expect(panelMarginAfterSpend.compute(input)).toBe(-700);
    expect(spendByOrigin(input)).toEqual({ egreso: 600, manual: 400 });
  });

  it("filtros: canal y campaña separan la inversión; servicio y responsable no", () => {
    const ig = filterPanel(input, { channel: "instagram" });
    expect(ig.leads).toHaveLength(3);
    expect(panelSpend.compute(ig)).toBe(600);
    const bySvc = filterPanel(input, { serviceId: "s2" });
    expect(bySvc.leads.map((l) => l.leadId)).toEqual(["l3"]);
    expect(bySvc.spend).toBeNull();
    expect(panelSpend.compute(bySvc)).toBeNull();
    expect(panelRoas.compute(bySvc)).toBeNull();
    const byOwner = filterPanel(input, { ownerId: "u1" });
    expect(byOwner.sales.map((s) => s.orderId)).toEqual(["o1"]);
  });

  it("sin datos en lugar de 0 y una venta atribuida una sola vez", () => {
    const empty: PanelInput = { leads: [], sales: [], spend: [] };
    expect(panelLeadToBooking.compute(empty)).toBeNull();
    expect(panelSales.compute(empty)).toBeNull();
    expect(panelSpend.compute(empty)).toBeNull();
    expect(panelCostPerLead.compute(empty)).toBeNull();
    expect(panelRoas.compute(empty)).toBeNull();
    expect(panelMarginAfterSpend.compute(empty)).toBeNull();
    expect(panelAttributedRevenue.compute(empty)).toBeNull();
    const spendOnly: PanelInput = { leads: [], sales: [], spend: input.spend };
    expect(panelAttributedRevenue.compute(spendOnly)).toBe(0);
    expect(panelRoas.compute(spendOnly)).toBe(0);
    expect(panelByChannel(input).find((r) => r.channel === "instagram")).toMatchObject({
      leads: 3,
      won: 1,
      attributedRevenue: 500,
      spend: 600,
    });
  });

  it("etapas en orden del embudo y origen/fórmula en cada KPI", () => {
    expect(leadsByStage(input).map((s) => s.stage)).toEqual(["Nuevo", "Ganado"]);
    expect(PANEL_KPIS.every((k) => k.formula.length > 10 && PANEL_KPI_ORIGIN[k.id])).toBe(true);
  });
});
