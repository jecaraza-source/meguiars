import { describe, expect, it } from "vitest";
import { guardScreen } from "../auth/guards";
import { navScreenOf, visibleNavigation } from "../navigation";
import { ROLE_CAPABILITIES } from "../roles";
import {
  comparePilot,
  pilotPeriod,
  presentAdoption,
  presentReadiness,
  summarizePilot,
  type CenterReadiness,
  type PilotDayMetrics,
} from "./pilot";

const day = (d: string, over: Partial<PilotDayMetrics> = {}): PilotDayMetrics => ({
  detailCenterId: "c1",
  day: d,
  activeUsers: 0,
  ordersCreated: 0,
  ordersDelivered: 0,
  ordersCancelled: 0,
  revenue: 0,
  cycleMinutesAvg: null,
  promisedDelivered: 0,
  onTimeDelivered: 0,
  appointments: 0,
  cashClosings: 0,
  cashDifference: 0,
  cashDifferenceAbs: 0,
  membershipsSold: 0,
  membershipRevenue: 0,
  errors: 0,
  ...over,
});

describe("checklist de datos maestros", () => {
  const readiness: CenterReadiness = {
    center: {
      id: "c2",
      organizationId: "o",
      code: "GDL-01",
      name: "Centro 2",
      timezone: "America/Mexico_City",
      active: true,
    },
    ready: false,
    items: [
      { key: "centro", required: true, status: "ok", count: 1, detail: "GDL-01" },
      { key: "equipo", required: true, status: "missing", count: 0, detail: "0 encargados" },
      { key: "catalogo", required: true, status: "warning", count: 5, detail: "1 sin costo" },
      { key: "membresias", required: false, status: "warning", count: 0, detail: "0 planes" },
    ],
  };

  it("cuenta obligatorios completos (un aviso no bloquea) y da cómo corregir", () => {
    const view = presentReadiness(readiness);
    expect(view.progress).toBe("2 de 3 obligatorios");
    expect(view.readyLabel).toBe("Faltan datos obligatorios");
    const equipo = view.rows.find((r) => r.key === "equipo")!;
    expect(equipo).toMatchObject({
      status: "Falta",
      tone: "danger",
      href: "/equipo/usuarios",
      screen: "users",
    });
    expect(equipo.fix).toMatch(/usuarios/);
    expect(view.rows.find((r) => r.key === "centro")!.fix).toBeNull();
    expect(view.rows.find((r) => r.key === "membresias")!.requiredLabel).toBe("Recomendado");
  });

  it("sólo el admin configura centros; el piloto lo ven quienes leen el P&L", () => {
    expect(ROLE_CAPABILITIES.admin_socio).toContain("centers.setup");
    for (const role of ["encargado", "operador_recepcion", "contador", "comercial_b2b"] as const)
      expect(ROLE_CAPABILITIES[role]).not.toContain("centers.setup");
    expect(navScreenOf("centerSetup")).toBe("centers");
    expect(navScreenOf("centerImport")).toBe("centers");
    const state = {
      status: "signed_in",
      user: { id: "u", email: "c@x" },
      profile: { id: "u", fullName: "C", active: true },
      activeCenterId: "c1",
      access: [
        {
          center: { id: "c1", organizationId: "o", code: "A", name: "A", timezone: "UTC", active: true },
          roles: ["contador"],
          corporateRoles: [],
        },
      ],
    } as unknown as Parameters<typeof guardScreen>[0];
    expect(guardScreen(state, "pilot").allow).toBe(true);
    expect(guardScreen(state, "centers").allow).toBe(false);
    expect(
      visibleNavigation(state)
        .flatMap((s) => s.items)
        .map((i) => i.screen),
    ).toContain("pilot");
  });
});

describe("resultados del piloto contra la línea base", () => {
  const rows = [
    day("2026-09-01", {
      activeUsers: 3,
      ordersCreated: 12,
      ordersDelivered: 10,
      revenue: 5000,
      cycleMinutesAvg: 60,
      promisedDelivered: 8,
      onTimeDelivered: 6,
      cashClosings: 1,
      cashDifference: -20,
      cashDifferenceAbs: 20,
      membershipsSold: 1,
      errors: 1,
    }),
    day("2026-09-02", {
      activeUsers: 4,
      ordersCreated: 9,
      ordersDelivered: 10,
      revenue: 7000,
      cycleMinutesAvg: 90,
      promisedDelivered: 2,
      onTimeDelivered: 2,
      cashClosings: 1,
      cashDifference: 10,
      cashDifferenceAbs: 10,
      ordersCancelled: 1,
    }),
  ];

  it("resume el periodo: por día, ticket, a 30 días, ciclo ponderado, puntualidad y caja", () => {
    expect(summarizePilot(rows, 58.456)).toEqual({
      ordenes_dia: 10,
      ticket_promedio: 600,
      ingreso_mensual: 180000,
      margen_bruto_pct: 58.46,
      membresias_mes: 15,
      tiempo_ciclo_min: 75,
      entregas_a_tiempo_pct: 80,
      diferencia_caja_promedio: 15,
    });
    expect(summarizePilot([], null).ordenes_dia).toBeNull();
  });

  it("compara con la línea base según si el indicador sube o baja para bien", () => {
    const cmp = comparePilot(summarizePilot(rows, 58.456), [
      { metric: "ticket_promedio", value: 500, source: "Excel 2025" },
      { metric: "tiempo_ciclo_min", value: 60, source: "Bitácora" },
      { metric: "ordenes_dia", value: 10.1, source: "Bitácora" },
      { metric: "entregas_a_tiempo_pct", value: 0, source: "Bitácora" },
    ]);
    const by = (m: string) => cmp.find((c) => c.metric === m)!;
    expect(by("ticket_promedio")).toMatchObject({
      status: "mejor",
      delta: "+20.0 %",
      actual: expect.stringContaining("600"),
    });
    expect(by("tiempo_ciclo_min")).toMatchObject({ status: "peor", delta: "+25.0 %", actual: "75 min" });
    expect(by("ordenes_dia")).toMatchObject({ status: "igual" });
    expect(by("entregas_a_tiempo_pct")).toMatchObject({ status: "mejor", delta: "—" });
    expect(by("margen_bruto_pct")).toMatchObject({ status: "sin_base", baseline: "—", actual: "58.5 %" });
  });

  it("adopción por día (más reciente primero) y totales", () => {
    const a = presentAdoption(rows);
    expect(a.days.map((d) => d.day)).toEqual(["2026-09-02", "2026-09-01"]);
    expect(a.totals).toMatchObject({
      avgActiveUsers: 3.5,
      maxActiveUsers: 4,
      ordersCreated: 21,
      ordersDelivered: 20,
      ordersCancelled: 1,
      errors: 1,
      cashClosings: 2,
    });
  });

  it("periodos: últimos N días hasta hoy; por defecto 30", () => {
    expect(pilotPeriod("7", "2026-09-30")).toMatchObject({ from: "2026-09-24", to: "2026-09-30" });
    expect(pilotPeriod("x", "2026-03-01")).toMatchObject({ id: "30", from: "2026-01-31", to: "2026-03-01" });
  });
});
