import { describe, expect, it } from "vitest";
import type { DashboardFilters } from "../dashboards/dashboards";
import {
  corporateBoardHref,
  corporateDrillHref,
  corporateDrillParams,
  corporateFilters,
  parseCorporateDrill,
} from "./corporate";
import {
  corporateSnapshotCsv,
  presentCorporateCard,
  presentDrillLevel,
  presentReconciliation,
  presentThreshold,
  presentTrend,
  type CorporateCardLike,
} from "./presenter";

const A = "aaaaaaaa-0000-4000-8000-000000000000";
const B = "bbbbbbbb-0000-4000-8000-000000000000";
const filters: DashboardFilters = {
  centerIds: [A, B],
  period: "mes",
  from: "2026-09-01",
  to: "2026-09-28",
  channel: null,
  engine: null,
};

describe("filtros del tablero corporativo", () => {
  it("centros y periodo; canal y motor no son filtros globales", () => {
    const { filters: f } = corporateFilters({
      params: { periodo: "semana", canal: "b2b", motor: "premium", centros: A },
      allowedCenterIds: [A, B],
      today: "2026-09-30",
    });
    expect(f).toMatchObject({
      centerIds: [A],
      period: "semana",
      from: "2026-09-28",
      channel: null,
      engine: null,
    });
    expect(
      corporateFilters({ params: {}, allowedCenterIds: [A, B], today: "2026-09-28" }).filters,
    ).toMatchObject({
      period: "mes",
      from: "2026-09-01",
      centerIds: [A, B],
    });
    const bad = corporateFilters({
      params: { periodo: "personalizado", desde: "2026-09-10", hasta: "2026-09-01" },
      allowedCenterIds: [A],
      today: "2026-09-28",
    });
    expect(bad.periodError).toBeTruthy();
  });
});

describe("navegación del drill-down (URL web = parámetros móviles)", () => {
  it("ida y vuelta", () => {
    const path = { cardId: "ventas", center: A, dim: "canal" as const, value: "b2c", service: B };
    const params = corporateDrillParams(path, filters, [A, B]);
    expect(params).toEqual({
      periodo: "mes",
      tarjeta: "ventas",
      centro: A,
      dim: "canal",
      valor: "b2c",
      servicio: B,
    });
    expect(parseCorporateDrill(params)).toEqual(path);
    expect(corporateDrillHref({ cardId: "ventas", center: "*" }, filters, [A, B])).toBe(
      "/direccion/detalle?periodo=mes&tarjeta=ventas&centro=*",
    );
    expect(corporateBoardHref({ ...filters, centerIds: [A] }, [A, B])).toBe(
      `/direccion?periodo=mes&centros=${A}`,
    );
  });

  it("descarta parámetros inválidos nivel por nivel", () => {
    expect(parseCorporateDrill({})).toBeNull();
    expect(parseCorporateDrill({ tarjeta: "Ventas;drop" })).toBeNull();
    expect(parseCorporateDrill({ tarjeta: "ventas", centro: "x", dim: "canal", valor: "b2c" })).toEqual({
      cardId: "ventas",
    });
    expect(parseCorporateDrill({ tarjeta: "ventas", centro: A, dim: "otro", valor: "b2c" })).toEqual({
      cardId: "ventas",
      center: A,
    });
    expect(
      parseCorporateDrill({ tarjeta: "ventas", centro: A, dim: "motor", valor: "premium", servicio: "1; x" }),
    ).toEqual({
      cardId: "ventas",
      center: A,
      dim: "motor",
      value: "premium",
    });
    expect(
      parseCorporateDrill({
        tarjeta: "ventas",
        centro: "*",
        dim: "motor",
        valor: "descuento_os",
        servicio: "descuento_os",
      })!.service,
    ).toBe("descuento_os");
  });
});

describe("presentación", () => {
  it("tendencia: flecha, magnitud, unidad y tono", () => {
    expect(
      presentTrend(
        { status: "ok", previous: 1000, delta: 20, mode: "percent", direction: "up", favorable: true },
        "currency",
      ),
    ).toEqual({
      text: "▲ 20.0 %",
      tone: "good",
      hint: "Periodo anterior: $1,000.00",
    });
    expect(
      presentTrend(
        { status: "ok", previous: 68, delta: -6.17, mode: "points", direction: "down", favorable: false },
        "percent",
      ).text,
    ).toBe("▼ 6.2 pts");
    expect(
      presentTrend(
        { status: "ok", previous: 1, delta: 0, mode: "percent", direction: "flat", favorable: null },
        "count",
      ).tone,
    ).toBe("neutral");
    expect(
      presentTrend({ status: "invalid", previous: null, reason: "sin_historia" }, "currency"),
    ).toMatchObject({
      text: "—",
      tone: "none",
    });
  });

  const card: CorporateCardLike = {
    card: {
      id: "ventas",
      name: "Ventas",
      metricId: "pnl.revenue",
      channel: null,
      drill: "revenue",
      metric: { unit: "currency", name: "Ventas", description: "Venta devengada", formula: "Σ ingresos" },
    },
    status: "ok",
    consolidated: {
      key: "consolidado",
      label: "Consolidado",
      value: 2450,
      trend: { status: "invalid", previous: 1100, reason: "sin_historia" },
      alert: null,
    },
    centers: [
      {
        key: A,
        label: "Centro A",
        value: 1200,
        trend: { status: "ok", previous: 1000, delta: 20, mode: "percent", direction: "up", favorable: true },
        alert: { kind: "bajo", limit: 1210, scope: "organizacion" },
      },
    ],
    centersWithoutAccess: ["Centro C"],
  };

  it("tarjeta con celdas por centro, alertas y enlaces al detalle", () => {
    const p = presentCorporateCard(card, filters, [A, B]);
    expect(p.consolidated!.value).toBe("$2,450.00");
    expect(p.centers[0]!.alert).toEqual({
      kind: "bajo",
      text: "Bajo el mínimo ($1,210.00) · umbral general",
    });
    expect(p.centers[0]!.href).toBe(`/direccion/detalle?periodo=mes&tarjeta=ventas&centro=${A}`);
    expect([p.alerts, p.notes]).toEqual([1, ["Sin permiso en: Centro C"]]);
    expect(
      presentCorporateCard({ ...card, status: "forbidden", consolidated: null }, filters, [A, B]).message,
    ).toBeTruthy();
    expect(corporateSnapshotCsv(filters, () => "Centro A", [card]).split("\n")).toEqual([
      "kpi,unidad,periodo_desde,periodo_hasta,centro,valor,anterior,cambio,alerta",
      "Ventas,currency,2026-09-01,2026-09-28,Centro A,1200,1000,20 %,bajo 1210",
      "Ventas,currency,2026-09-01,2026-09-28,Consolidado,2450,1100,,",
    ]);
  });

  it("nivel del drill-down con conciliación y destinos (tablero o movimientos del P&L)", () => {
    const l = presentDrillLevel(
      {
        kind: "servicio",
        title: "Por servicio",
        unit: "currency",
        parent: { label: "Ventas · Centro A · Membresía", value: 300 },
        rows: [
          {
            key: "lav",
            label: "Lavado",
            value: 100,
            share: 33.33,
            next: { cardId: "ventas", center: A, dim: "canal", value: "membresia", service: "lav" },
            pnl: null,
            detail: "1 u. · 1 OS",
            level: 1,
          },
          {
            key: "linea:membresias",
            label: "Venta de membresías",
            value: 200,
            share: 66.67,
            next: null,
            pnl: { section: "ingreso", line: "membresias", detailCenterIds: [A] },
            detail: null,
            level: 1,
          },
        ],
        additive: true,
        sum: 300,
        difference: 0,
        note: null,
      },
      filters,
      [A, B],
    );
    expect(l.reconciliation).toEqual({ ok: true, text: "Las filas suman la cifra (diferencia 0)." });
    expect(l.rows[0]!.target).toMatchObject({ kind: "drill" });
    expect(l.rows[1]!.target).toMatchObject({
      kind: "pnl",
      target: {
        screen: "pnlDrilldown",
        query: { detailCenterIds: [A], section: "ingreso", line: "membresias" },
      },
    });
    expect(presentReconciliation([{ label: "Ventas", amount: 10, total: true }], 0.5)).toMatchObject({
      ok: false,
    });
  });

  it("umbral legible", () => {
    expect(
      presentThreshold(
        {
          id: "t",
          organizationId: "o",
          metricId: "pnl.revenue",
          channel: null,
          detailCenterId: null,
          minValue: 3000,
          maxValue: null,
          version: 1,
        },
        "Ventas",
        "currency",
        () => "",
      ),
    ).toEqual({
      id: "t",
      card: "Ventas",
      center: "Todos los centros (general)",
      limits: "Mínimo: $3,000.00",
    });
  });
});
