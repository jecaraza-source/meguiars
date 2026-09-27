import { describe, expect, it } from "vitest";
import { can, isReadOnlyRole } from "../roles";
import {
  cashDifference,
  cashSessionActions,
  cashTotals,
  closeNoteRequired,
  closingVerified,
  type CashMethodFact,
  type CashSession,
} from "./cash";
import {
  cashRange,
  cashSummaryCsv,
  cashSummaryText,
  formatDifference,
  presentCashSession,
} from "./presenter";

const fact = (
  method: string,
  kind: CashMethodFact["kind"],
  collected: number,
  refunded = 0,
): CashMethodFact => ({
  method,
  name: method,
  kind,
  collectsCash: kind === "efectivo" || kind === "electronico",
  collected,
  collectedCount: collected ? 1 : 0,
  refunded,
  refundedCount: refunded ? 1 : 0,
});

// Mismo escenario que supabase/tests/cash_sessions.test.sql (primer turno).
const breakdown = [
  fact("efectivo", "efectivo", 1450, 200),
  fact("tarjeta", "electronico", 500),
  fact("transferencia", "electronico", 300),
  fact("membresia", "beneficio", 0),
  fact("credito_b2b", "credito", 0),
];

describe("cashTotals (espejo de private.cash_window_totals)", () => {
  it("esperado = fondo + efectivo cobrado − reembolsos; tarjeta y transferencia aparte", () => {
    const t = cashTotals(500, breakdown, { paymentsCount: 5, reversalsCount: 1 });
    expect(t).toMatchObject({
      openingFloat: 500,
      cashCollected: 1450,
      cashRefunded: 200,
      expectedCash: 1750,
      cardTotal: 500,
      transferTotal: 300,
      nonCashTotal: 0,
    });
  });

  it("un reembolso de un corte anterior puede dejar el esperado por debajo del fondo", () => {
    expect(
      cashTotals(300, [fact("efectivo", "efectivo", 0, 250)], { paymentsCount: 0, reversalsCount: 1 })
        .expectedCash,
    ).toBe(50);
  });

  it("sin errores de redondeo en centavos", () => {
    const t = cashTotals(0.1, [fact("efectivo", "efectivo", 0.2)], { paymentsCount: 1, reversalsCount: 0 });
    expect(t.expectedCash).toBe(0.3);
  });
});

describe("diferencia y nota", () => {
  it("clasifica faltante, sobrante y cuadrado", () => {
    expect(cashDifference(1700, 1750)).toEqual({ difference: -50, kind: "faltante" });
    expect(cashDifference(1760, 1750)).toEqual({ difference: 10, kind: "sobrante" });
    expect(cashDifference(1750, 1750)).toEqual({ difference: 0, kind: "cuadrado" });
    expect(formatDifference(-50).text).toMatch(/^−\$50\.00 · Faltante$/);
  });

  it("una diferencia distinta de cero exige nota", () => {
    expect(closeNoteRequired(1700, 1750)).toBe(true);
    expect(closeNoteRequired(1750.0, 1750)).toBe(false);
  });
});

describe("acciones y permisos", () => {
  it("cierra quien opera la caja; sólo el admin reabre un corte cerrado", () => {
    expect(cashSessionActions("abierta", { operate: true, reopen: false })).toEqual({
      close: true,
      reopen: false,
    });
    expect(cashSessionActions("reabierta", { operate: true, reopen: false })).toEqual({
      close: true,
      reopen: false,
    });
    expect(cashSessionActions("cerrada", { operate: true, reopen: false })).toEqual({
      close: false,
      reopen: false,
    });
    expect(cashSessionActions("cerrada", { operate: true, reopen: true })).toEqual({
      close: false,
      reopen: true,
    });
  });

  it("matriz de roles: encargado opera, admin reabre, recepción y contador sólo consultan", () => {
    expect(can(["encargado"], "cash.operate")).toBe(true);
    expect(can(["encargado"], "cash.reopen")).toBe(false);
    expect(can(["admin_socio"], "cash.reopen")).toBe(true);
    expect(can(["operador_recepcion"], "cash.read")).toBe(true);
    expect(can(["operador_recepcion"], "cash.operate")).toBe(false);
    expect(can(["contador"], "cash.read")).toBe(true);
    expect(isReadOnlyRole("contador")).toBe(true);
    expect(can(["comercial_b2b"], "cash.read")).toBe(false);
  });
});

const live = cashTotals(500, breakdown, { paymentsCount: 5, reversalsCount: 1 });
const session: CashSession = {
  id: "s1",
  organizationId: "o",
  detailCenterId: "c",
  centerName: "Centro A",
  centerTimezone: "America/Mexico_City",
  folio: "A-01-C-000001",
  businessDate: "2026-10-09",
  shift: "matutino",
  status: "cerrada",
  openingFloat: 500,
  openedAt: "2026-10-09T15:00:00Z",
  openedByName: "Encargado",
  windowEnd: "2026-10-09T21:00:00Z",
  closedAt: "2026-10-09T21:05:00Z",
  closedByName: "Encargado",
  notes: null,
  version: 4,
  live,
  closings: [
    {
      ...live,
      id: "c1",
      sequence: 1,
      windowFrom: "2026-10-09T15:00:00Z",
      windowTo: "2026-10-09T21:00:00Z",
      countedCash: 1700,
      difference: -50,
      notes: "Faltan $50",
      closedByName: "Encargado",
      closedAt: "2026-10-09T21:01:00Z",
    },
    {
      ...live,
      id: "c2",
      sequence: 2,
      windowFrom: "2026-10-09T15:00:00Z",
      windowTo: "2026-10-09T21:00:00Z",
      countedCash: 1750,
      difference: 0,
      notes: "Recuento",
      closedByName: "Encargado",
      closedAt: "2026-10-09T21:05:00Z",
    },
  ],
  reopenings: [
    {
      reason: "Se encontraron $50",
      reopenedByName: "Admin",
      reopenedAt: "2026-10-09T21:03:00Z",
      sequence: 1,
    },
  ],
  movements: [],
};

describe("ficha y exportación", () => {
  it("usa el cierre vigente y verifica contra los cobros", () => {
    const p = presentCashSession(session);
    expect(p.counted).toBe("$1,750.00");
    expect(p.difference?.kind).toBe("cuadrado");
    expect(p.verified?.ok).toBe(true);
    expect(closingVerified({ ...session, live: { ...live, expectedCash: 1760 } })).toBe(false);
    expect(closingVerified({ ...session, status: "abierta" })).toBeNull();
  });

  it("el resumen de texto (web imprime, móvil comparte) incluye esperado, contado, diferencia y reaperturas", () => {
    const text = cashSummaryText(session);
    expect(text).toContain("Resumen del corte de caja A-01-C-000001");
    expect(text).toContain("Efectivo esperado: $1,750.00");
    expect(text).toContain("Efectivo contado: $1,750.00");
    expect(text).toContain("Diferencia: $0.00 · Cuadrado");
    expect(text).toContain("Tarjeta: $500.00");
    expect(text).toContain("Se encontraron $50");
  });

  it("el CSV tiene una fila por concepto, forma de pago y versión del cierre", () => {
    const csv = cashSummaryCsv(session).split("\n");
    expect(csv[0]).toBe("folio,centro,dia,turno,estado,concepto,detalle,importe");
    expect(csv).toContain("A-01-C-000001,Centro A,2026-10-09,matutino,cerrada,efectivo_esperado,,1750");
    expect(csv).toContain("A-01-C-000001,Centro A,2026-10-09,matutino,cerrada,forma_de_pago,efectivo,1250");
    expect(csv.some((l) => l.includes("cierre_v1_diferencia") && l.endsWith(",-50"))).toBe(true);
    expect(csv.some((l) => l.includes("reapertura_v1"))).toBe(true);
  });

  it("rangos del listado", () => {
    expect(cashRange("hoy", "2026-10-09")).toEqual({ from: "2026-10-09", to: "2026-10-09" });
    expect(cashRange("7", "2026-10-09")).toEqual({ from: "2026-10-03", to: "2026-10-09" });
  });
});
