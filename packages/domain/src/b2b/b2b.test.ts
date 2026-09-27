import { describe, expect, it } from "vitest";
import type { AuthState } from "../auth/session";
import { canInCenter } from "../auth/session";
import { can } from "../roles";
import { agreementFees, agreementState, resolveB2bPrice, RFC_PATTERN, type PriceRuleLike } from "./b2b";
import { b2bErrorMessage, presentAgreement, statementCards } from "./presenter";

const rule = (r: Partial<PriceRuleLike> & Pick<PriceRuleLike, "id" | "kind">): PriceRuleLike => ({
  serviceId: null,
  value: null,
  minMonthlyOrders: 0,
  active: true,
  ...r,
});

describe("convenios B2B", () => {
  it("estado efectivo: programado, vigente (inclusive), vencido; suspendido y cancelado mandan", () => {
    expect(agreementState("activo", "2026-10-01", "2026-12-31", "2026-09-30")).toBe("programado");
    expect(agreementState("activo", "2026-10-01", "2026-12-31", "2026-10-01")).toBe("vigente");
    expect(agreementState("activo", "2026-10-01", "2026-12-31", "2026-12-31")).toBe("vigente");
    expect(agreementState("activo", "2026-10-01", "2026-12-31", "2027-01-01")).toBe("vencido");
    expect(agreementState("suspendido", "2026-10-01", "2026-12-31", "2026-11-01")).toBe("suspendido");
    expect(agreementState("cancelado", "2026-10-01", "2026-12-31", "2026-11-01")).toBe("cancelado");
  });

  it("cuotas: iguala por mes iniciado (con recorte de fin de mes), paquete una vez", () => {
    const iguala = {
      billingModel: "iguala" as const,
      feeAmount: 1000,
      startsOn: "2026-01-31",
      endsOn: "2026-12-31",
    };
    expect(agreementFees(iguala, "2026-01-01", "2026-03-30")).toBe(2000);
    expect(agreementFees(iguala, "2026-01-01", "2026-03-31")).toBe(3000);
    expect(agreementFees({ ...iguala, endsOn: "2026-02-15" }, "2026-01-01", "2026-12-31")).toBe(1000);
    const paquete = {
      billingModel: "paquete" as const,
      feeAmount: 5000,
      startsOn: "2026-02-01",
      endsOn: "2026-12-31",
    };
    expect(agreementFees(paquete, "2026-01-01", "2026-02-01")).toBe(5000);
    expect(agreementFees(paquete, "2026-03-01", "2026-12-31")).toBe(0);
    expect(
      agreementFees(
        { ...paquete, billingModel: "por_vehiculo", feeAmount: null },
        "2026-01-01",
        "2026-12-31",
      ),
    ).toBe(0);
  });

  it("precio convenido: servicio sobre general, escalón de volumen, incluido con unidades", () => {
    const rules = [
      rule({ id: "general", kind: "descuento_pct", value: 10 }),
      rule({ id: "lav", kind: "precio_fijo", serviceId: "LAV", value: 180 }),
      rule({ id: "lav-vol", kind: "precio_fijo", serviceId: "LAV", value: 150, minMonthlyOrders: 2 }),
      rule({ id: "lav-inc", kind: "incluido", serviceId: "LAV" }),
    ];
    const base = { listPrice: 250, quantity: 1, monthlyVolume: 1, usedUnits: 0, includedUnits: null };
    expect(resolveB2bPrice(rules, { ...base, serviceId: "POL", listPrice: 2800 })).toEqual({
      price: 2520,
      ruleId: "general",
    });
    expect(resolveB2bPrice(rules, { ...base, serviceId: "LAV" })).toEqual({ price: 180, ruleId: "lav" });
    expect(resolveB2bPrice(rules, { ...base, serviceId: "LAV", monthlyVolume: 2 })).toEqual({
      price: 150,
      ruleId: "lav-vol",
    });
    expect(resolveB2bPrice(rules, { ...base, serviceId: "LAV", includedUnits: 2, usedUnits: 1 })).toEqual({
      price: 0,
      ruleId: "lav-inc",
    });
    expect(resolveB2bPrice(rules, { ...base, serviceId: "LAV", includedUnits: 2, usedUnits: 2 })).toEqual({
      price: 180,
      ruleId: "lav",
    });
    expect(resolveB2bPrice([], { ...base, serviceId: "LAV" })).toEqual({ price: 250, ruleId: null });
    expect(
      resolveB2bPrice([rule({ id: "off", kind: "precio_fijo", value: 1, active: false })], {
        ...base,
        serviceId: "LAV",
      }),
    ).toEqual({ price: 250, ruleId: null });
  });

  it("RFC de persona moral y física", () => {
    expect(RFC_PATTERN.test("FVA010101AB1")).toBe(true);
    expect(RFC_PATTERN.test("GOML800101AB1")).toBe(true);
    expect(RFC_PATTERN.test("fva010101ab1")).toBe(false);
    expect(RFC_PATTERN.test("FV010101AB1")).toBe(false);
  });

  it("permisos: tarifas sólo admin y comercial B2B; el contador consulta; el operador no", () => {
    expect(can(["comercial_b2b"], "b2b.write")).toBe(true);
    expect(can(["encargado"], "b2b.write")).toBe(false);
    expect(can(["operador_recepcion"], "b2b.read")).toBe(false);
    expect(can(["contador"], "b2b.read")).toBe(true);
    expect(can(["contador"], "b2b.billing")).toBe(false);
  });

  it("administrar la cuenta se decide en su centro gestor, no en el activo", () => {
    const center = (id: string) => ({
      id,
      organizationId: "o",
      code: id,
      name: id,
      timezone: "UTC",
      active: true,
      createdAt: "",
      updatedAt: "",
    });
    const state: AuthState = {
      status: "signed_in",
      user: { id: "u", email: "u@x.mx", fullName: null, active: true, lastDetailCenterId: "A" },
      access: [
        { center: center("A"), organizationName: "O", roles: ["comercial_b2b"], corporateRoles: [] },
        { center: center("B"), organizationName: "O", roles: ["contador"], corporateRoles: [] },
      ],
      activeCenterId: "B",
    };
    expect(canInCenter(state, "A", "b2b.write")).toBe(true);
    expect(canInCenter(state, "B", "b2b.write")).toBe(false);
    expect(canInCenter(state, "C", "b2b.read")).toBe(false);
  });

  it("presentación del convenio y del estado de cuenta", () => {
    const g = presentAgreement(
      {
        id: "g",
        accountId: "a",
        name: "Iguala",
        billingModel: "iguala",
        startsOn: "2026-01-01",
        endsOn: "2026-12-31",
        status: "activo",
        vehicleRule: "lista",
        paymentTermsDays: 30,
        creditLimit: 5000,
        feeAmount: 1000,
        includedUnits: 2,
        notes: null,
        centerIds: ["A", "B"],
      },
      "2027-01-10",
      (id) => `Centro ${id}`,
    );
    expect(g).toMatchObject({ state: "Vencido", applies: false, centers: "Centro A, Centro B" });
    expect(g.fee).toContain("al mes");
    const cards = statementCards({
      consumption: 2680,
      ordersToInvoice: 2680,
      feesAccrued: 0,
      feesInvoiced: 0,
      toInvoice: 2680,
      invoiced: 0,
      paid: 0,
      receivable: 0,
      overdue: 0,
      openOrders: 270,
      exposure: 2950,
      creditLimit: null,
      creditAvailable: null,
    });
    expect(cards.map((c) => c.label)).toEqual([
      "Consumo acumulado",
      "Por facturar",
      "Por cobrar",
      "Crédito disponible",
    ]);
    expect(cards[3]!.value).toBe("Sin límite");
    expect(b2bErrorMessage({ kind: "conflict", code: "40001", message: "x" })).toMatch(/otro dispositivo/);
  });
});
