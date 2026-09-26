import { describe, expect, it } from "vitest";
import {
  addMonths,
  canChangePlanOnRenewal,
  canRenew,
  membershipPeriod,
  membershipStatus,
  monthlyValue,
} from "./membership";
import { membershipActions, presentBalance, redeemableLines, renewalCaption } from "./presenter";

const m = (state: "activa" | "suspendida" | "cancelada", endsOn = "2026-10-31") => ({
  state,
  endsOn,
  renewalNoticeDays: 7,
});

describe("estado efectivo (espejo de private.membership_status)", () => {
  it("activa, próxima a vencer (≤ 7 días), vencida, suspendida y cancelada", () => {
    expect(membershipStatus(m("activa"), "2026-10-20")).toBe("activa");
    expect(membershipStatus(m("activa"), "2026-10-24")).toBe("proxima_a_vencer");
    expect(membershipStatus(m("activa"), "2026-10-31")).toBe("proxima_a_vencer");
    expect(membershipStatus(m("activa"), "2026-11-01")).toBe("vencida");
    expect(membershipStatus(m("suspendida"), "2026-11-05")).toBe("suspendida");
    expect(membershipStatus(m("cancelada"), "2026-10-01")).toBe("cancelada");
  });
});

describe("periodos de uso (espejo de private.membership_period)", () => {
  it("suma meses con el recorte de fin de mes de Postgres", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });

  it("bloques desde el ancla; antes del ancla no hay periodo (mismos casos que la prueba SQL)", () => {
    expect(membershipPeriod("2026-01-31", 1, "2026-02-27")).toEqual({
      start: "2026-01-31",
      end: "2026-02-27",
    });
    expect(membershipPeriod("2026-01-31", 1, "2026-02-28")).toEqual({
      start: "2026-02-28",
      end: "2026-03-30",
    });
    expect(membershipPeriod("2026-01-15", 3, "2026-06-01")).toEqual({
      start: "2026-04-15",
      end: "2026-07-14",
    });
    expect(membershipPeriod("2026-05-01", 1, "2026-04-30")).toBeNull();
  });
});

describe("reglas de renovación, acciones y saldo", () => {
  it("se renueva próxima a vencer o vencida; el cambio de plan sólo vencida", () => {
    expect(canRenew("activa")).toBe(false);
    expect(canRenew("proxima_a_vencer")).toBe(true);
    expect(canRenew("suspendida")).toBe(false);
    expect(canChangePlanOnRenewal("proxima_a_vencer")).toBe(false);
    expect(canChangePlanOnRenewal("vencida")).toBe(true);
  });

  it("acciones por estado y permisos (operador vende y renueva; encargado además suspende y cancela)", () => {
    const kinds = (s: Parameters<typeof membershipActions>[0], manage: boolean) =>
      membershipActions(s, { write: true, manage }).map((a) => a.kind);
    expect(kinds("activa", false)).toEqual([]);
    expect(kinds("proxima_a_vencer", false)).toEqual(["renew"]);
    expect(kinds("activa", true)).toEqual(["suspend", "cancel"]);
    expect(kinds("suspendida", true)).toEqual(["reactivate", "cancel"]);
    expect(kinds("cancelada", true)).toEqual([]);
  });

  it("MRR: precio mensualizado por membresía", () => {
    expect(monthlyValue({ price: 3900, periodMonths: 3 })).toBe(1300);
    expect(monthlyValue({ price: 849, periodMonths: 1 })).toBe(849);
  });

  it("saldo y líneas redimibles: sólo servicios incluidos con saldo y sin redención activa", () => {
    const balance = [
      {
        serviceId: "lav",
        serviceCode: "LAV",
        serviceName: "Lavado",
        quantityPerPeriod: 2,
        used: 1,
        remaining: 1,
        periodStart: "2026-10-01",
        periodEnd: "2026-10-31",
      },
      {
        serviceId: "pre",
        serviceCode: "PRE",
        serviceName: "Premium",
        quantityPerPeriod: 1,
        used: 1,
        remaining: 0,
        periodStart: "2026-10-01",
        periodEnd: "2026-10-31",
      },
    ];
    expect(presentBalance(balance[0]!)).toMatchObject({
      usage: "1 de 2",
      remaining: 1,
      period: "1 oct 2026 – 31 oct 2026",
    });
    const items = [
      { id: "i1", serviceId: "lav", serviceName: "Lavado", quantity: 2 },
      { id: "i2", serviceId: "pre", serviceName: "Premium", quantity: 1 },
      { id: "i3", serviceId: "pul", serviceName: "Pulido", quantity: 1 },
    ];
    expect(redeemableLines("activa", items, balance, [])).toEqual([
      { itemId: "i1", label: "Lavado (1 disponibles)", maxQuantity: 1 },
    ]);
    expect(redeemableLines("activa", items, balance, [{ itemId: "i1", voidedAt: null }])).toEqual([]);
    expect(redeemableLines("vencida", items, balance, [])).toEqual([]);
  });

  it("próxima renovación legible", () => {
    expect(renewalCaption("2026-10-31", "2026-10-28")).toBe("Vence en 3 días");
    expect(renewalCaption("2026-10-31", "2026-10-31")).toBe("Vence hoy");
    expect(renewalCaption("2026-10-31", "2026-11-02")).toBe("Venció hace 2 días");
  });
});
