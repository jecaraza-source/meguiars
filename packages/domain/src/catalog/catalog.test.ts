import { describe, expect, it } from "vitest";
import type { AuthState } from "../auth/session";
import type { AppRole } from "../roles";
import { freezeServiceLine, type CatalogItem } from "./catalog";
import {
  formatDuration,
  formatMoney,
  presentCatalogItem,
  presentPriceHistory,
  standardMargin,
} from "./presenter";
import { canConfigureCenterCatalog, canManageServices } from "./rules";

const item: CatalogItem = {
  id: "s1",
  code: "LAV-EXP",
  name: "Lavado exprés",
  description: null,
  revenueEngine: "recurrente",
  standardDurationMinutes: 40,
  basePrice: 250,
  standardDirectCost: 80,
  price: 280,
  directCost: 90,
  priceSource: "center",
  available: true,
  active: true,
};

const stateWith = (roles: AppRole[], corporateRoles: AppRole[]): AuthState => ({
  status: "signed_in",
  user: { id: "u", email: "u@x.mx", fullName: null, active: true, lastDetailCenterId: "A" },
  activeCenterId: "A",
  access: [
    {
      center: {
        id: "A",
        organizationId: "O",
        code: "A-01",
        name: "Centro A",
        timezone: "America/Mexico_City",
        active: true,
        createdAt: "",
        updatedAt: "",
      },
      organizationName: "Org",
      roles: [...roles, ...corporateRoles],
      corporateRoles,
    },
  ],
});

describe("catálogo", () => {
  it("margen estándar: una sola definición", () => {
    expect(standardMargin(280, 90)).toEqual({ amount: 190, percent: 67.9 });
    expect(standardMargin(0, 0)).toEqual({ amount: 0, percent: 0 });
    expect(standardMargin(100, 120)).toEqual({ amount: -20, percent: -20 });
  });

  it("formatos de duración y moneda", () => {
    expect(formatDuration(40)).toBe("40 min");
    expect(formatDuration(480)).toBe("8 h");
    expect(formatDuration(90)).toBe("1 h 30 min");
    expect(formatMoney(12000)).toMatch(/12,000\.00/);
  });

  it("fila del catálogo con precio del centro, margen y estado", () => {
    expect(presentCatalogItem(item)).toMatchObject({
      name: "Lavado exprés · LAV-EXP",
      engine: "Recurrente",
      duration: "40 min",
      margin: expect.stringMatching(/190\.00 · 67\.9%$/),
      status: "Disponible",
    });
    expect(presentCatalogItem(item).price).toMatch(/280\.00 \(centro\)$/);
    expect(presentCatalogItem({ ...item, available: false }).status).toBe("No disponible en este centro");
    expect(presentCatalogItem({ ...item, active: false }).status).toBe("Inactivo");
  });

  it("la línea de OS congela precio, costo, duración y motor; cambios posteriores no la alteran", () => {
    const line = freezeServiceLine(item);
    const later = { ...item, price: 320, directCost: 100 };
    expect(line).toEqual({
      serviceId: "s1",
      serviceCode: "LAV-EXP",
      serviceName: "Lavado exprés",
      revenueEngine: "recurrente",
      unitPrice: 280,
      unitDirectCost: 90,
      durationMinutes: 40,
    });
    expect(freezeServiceLine(later).unitPrice).toBe(320);
    expect(line.unitPrice).toBe(280);
  });

  it("historial: base vs centro y vuelta al valor base", () => {
    const names = (id: string) => (id === "A" ? "Centro A" : "Otro");
    expect(
      presentPriceHistory(
        {
          id: 1,
          detailCenterId: null,
          price: 250,
          directCost: 80,
          validFrom: "2026-09-01T00:00:00Z",
          reason: "Alta",
        },
        names,
        "America/Mexico_City",
      ).scope,
    ).toBe("Base (organización)");
    expect(
      presentPriceHistory(
        {
          id: 2,
          detailCenterId: "A",
          price: null,
          directCost: null,
          validFrom: "2026-09-02T00:00:00Z",
          reason: null,
        },
        names,
        "America/Mexico_City",
      ),
    ).toMatchObject({ scope: "Centro A", price: "Vuelve al valor base", reason: "—" });
  });

  it("permisos: servicios homologados sólo admin corporativo; configuración del centro, admin del centro", () => {
    expect(canManageServices(stateWith([], ["admin_socio"]))).toBe(true);
    expect(canManageServices(stateWith(["admin_socio"], []))).toBe(false);
    expect(canConfigureCenterCatalog(stateWith(["admin_socio"], []))).toBe(true);
    expect(canConfigureCenterCatalog(stateWith(["encargado"], []))).toBe(false);
  });
});
