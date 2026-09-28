import { describe, expect, it } from "vitest";
import {
  applyPreferences,
  dashboardCenters,
  dashboardDrill,
  dashboardFilterParams,
  moveInOrder,
  moveTo,
  resolveDashboardFilters,
  savedFiltersOf,
  type DashboardFilters,
  type DashboardWidget,
} from "./dashboards";
import {
  dashboardFiltersLabel,
  dashboardSnapshotCsv,
  formatMetricValue,
  presentWidget,
  seriesLabel,
  type WidgetResultLike,
} from "./presenter";

const A = "aaaaaaaa-0000-0000-0000-000000000000";
const B = "bbbbbbbb-0000-0000-0000-000000000000";
const today = "2026-09-17";

const widget = (id: string, position: number, over: Partial<DashboardWidget> = {}): DashboardWidget => ({
  id,
  metricId: "pnl.revenue",
  type: "kpi",
  title: null,
  position,
  colSpan: 1,
  rowSpan: 1,
  options: {},
  ...over,
});

const filters = (over: Partial<DashboardFilters> = {}): DashboardFilters => ({
  centerIds: [A, B],
  period: "mes",
  from: "2026-09-01",
  to: today,
  channel: null,
  engine: null,
  ...over,
});

describe("filtros globales", () => {
  it("URL > vista guardada > periodo por defecto; centros recortados a los permitidos", () => {
    const base = { defaultRange: "semana" as const, allowedCenterIds: [A, B], today };
    expect(resolveDashboardFilters({ ...base, params: {} }).filters).toEqual(
      filters({ period: "semana", from: "2026-09-14" }),
    );
    expect(
      resolveDashboardFilters({ ...base, params: {}, saved: { periodo: "mes", canal: "b2b", centros: [B] } })
        .filters,
    ).toEqual(filters({ centerIds: [B], channel: "b2b" }));
    const url = resolveDashboardFilters({
      ...base,
      params: {
        periodo: "personalizado",
        desde: "2026-08-01",
        hasta: "2026-08-31",
        centros: `${A},cccc`,
        motor: "premium",
      },
      saved: { canal: "b2b" },
    }).filters;
    expect(url).toEqual(
      filters({
        centerIds: [A],
        period: "personalizado",
        from: "2026-08-01",
        to: "2026-08-31",
        engine: "premium",
      }),
    );
    expect(
      resolveDashboardFilters({ ...base, params: { periodo: "mes", canal: "x", motor: "y" } }).filters
        .channel,
    ).toBeNull();
    expect(
      resolveDashboardFilters({
        ...base,
        params: { periodo: "personalizado", desde: "2026-09-10", hasta: "2026-09-01" },
      }).periodError,
    ).toMatch(/posterior/);
  });

  it("a URL y a vista guardada (todos los centros no se escriben)", () => {
    expect(dashboardFilterParams(filters({ channel: "b2c" }), [A, B])).toEqual({
      periodo: "mes",
      canal: "b2c",
    });
    expect(dashboardFilterParams(filters({ centerIds: [A], period: "personalizado" }), [A, B])).toEqual({
      periodo: "personalizado",
      desde: "2026-09-01",
      hasta: today,
      centros: A,
    });
    expect(savedFiltersOf(filters({ centerIds: [B], engine: "premium" }), [A, B])).toEqual({
      periodo: "mes",
      centros: [B],
      motor: "premium",
    });
  });

  it("centros del tablero: los del usuario ∩ los permitidos", () => {
    const mine = [{ id: A }, { id: B }];
    expect(dashboardCenters(mine, { centerIds: null })).toEqual(mine);
    expect(dashboardCenters(mine, { centerIds: [B, "otro"] })).toEqual([{ id: B }]);
  });
});

describe("vista personal", () => {
  const ws = [widget("w1", 1), widget("w2", 2), widget("w3", 3), widget("w4", 4)];
  it("ordena según la vista, deja los nuevos al final y separa los ocultos", () => {
    const r = applyPreferences(ws, { widgetOrder: ["w3", "w1"], hiddenWidgetIds: ["w2"] });
    expect(r.visible.map((w) => w.id)).toEqual(["w3", "w1", "w4"]);
    expect(r.hidden.map((w) => w.id)).toEqual(["w2"]);
    expect(applyPreferences(ws, null).visible.map((w) => w.id)).toEqual(["w1", "w2", "w3", "w4"]);
  });

  it("subir, bajar y arrastrar", () => {
    expect(moveInOrder(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveInOrder(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(moveTo(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });
});

describe("drill-down", () => {
  it("P&L con los mismos filtros (canal → línea, motor → dimensión, un centro → centro)", () => {
    const d = dashboardDrill(
      { kind: "pnl", section: "ingreso" },
      filters({ centerIds: [A], channel: "b2b", engine: "premium" }),
    );
    expect(d.screen).toBe("pnlDrilldown");
    expect(d.href).toBe(
      `/finanzas/resultados/detalle?seccion=ingreso&desde=2026-09-01&hasta=${today}&linea=b2b&dimension=premium&centro=${A}`,
    );
    expect(dashboardDrill({ kind: "pnl", section: "costo_directo" }, filters()).href).toContain(
      "alcance=todos",
    );
    expect(dashboardDrill({ kind: "pnl", section: "gasto", line: "personal" }, filters()).href).toContain(
      "seccion=gasto&desde=2026-09-01&hasta=2026-09-17&linea=personal&alcance=todos",
    );
    expect(dashboardDrill({ kind: "payments" }, filters()).href).toBe("/finanzas/cobranza?alcance=todos");
    expect(dashboardDrill({ kind: "pipeline" }, filters({ centerIds: [A] })).href).toBe(
      "/comercial/pipeline/indicadores",
    );
  });
});

describe("presentación y exportación", () => {
  const metric = {
    id: "pnl.revenue",
    name: "Ventas",
    description: "Venta devengada",
    unit: "currency",
    formula: "Σ total de OS entregadas",
    source: "pnl",
    sourceTables: ["public.service_orders"],
    drill: { kind: "pnl" as const, section: "ingreso" as const },
  };

  it("formato por unidad y etiquetas de periodo", () => {
    expect(formatMetricValue("currency", 1234.5)).toBe("$1,234.50");
    expect(formatMetricValue("percent", 12.345)).toBe("12.35 %");
    expect(formatMetricValue("count", 1200)).toBe("1,200");
    expect(seriesLabel("2026-09-14", "semana")).toBe("Sem. 14 sep");
    expect(seriesLabel("2026-09-01", "mes")).toBe("sep 2026");
  });

  it("KPI con avisos de filtro no aplicable y centros sin permiso; sin permiso no muestra datos", () => {
    const ok: WidgetResultLike = {
      status: "ok",
      metric,
      data: { kind: "kpi", value: 8349 },
      ignoredFilters: ["motor"],
      centersWithoutAccess: ["Centro B"],
    };
    const p = presentWidget(widget("w1", 1, { title: "Ventas del mes" }), ok, filters());
    expect(p).toMatchObject({
      title: "Ventas del mes",
      subtitle: "Ventas",
      value: "$8,349.00",
      notes: ["No aplica el filtro de motor", "Sin permiso en: Centro B"],
    });
    expect(p.drill?.screen).toBe("pnlDrilldown");
    const denied = presentWidget(widget("w1", 1), { status: "forbidden", metric }, filters());
    expect(denied.value).toBeNull();
    expect(denied.message).toMatch(/Sin permiso/);
  });

  it("filas con barra relativa y CSV del snapshot", () => {
    const dist: WidgetResultLike = {
      status: "ok",
      metric,
      data: {
        kind: "distribution",
        rows: [
          { key: "premium", label: "Premium", value: 3000, share: 75 },
          { key: "recurrente", label: "Recurrente", value: 1000, share: 25 },
        ],
      },
    };
    const p = presentWidget(widget("w2", 2, { type: "distribution" }), dist, filters());
    expect(p.rows.map((r) => [r.label, r.value, r.share, r.pct])).toEqual([
      ["Premium", "$3,000.00", "75.00 %", 100],
      ["Recurrente", "$1,000.00", "25.00 %", 33],
    ]);
    const kpi = presentWidget(
      widget("w1", 1),
      { status: "ok", metric, data: { kind: "kpi", value: 4000 } },
      filters(),
    );
    const names = (id: string) => (id === A ? "Centro A" : "Centro, B");
    const csv = dashboardSnapshotCsv("Corporativo", filters(), names, [kpi, p]).split("\n");
    expect(csv[0]).toBe(
      "tablero,periodo_desde,periodo_hasta,centros,canal,motor,widget,tipo,unidad,clave,etiqueta,valor,participacion",
    );
    expect(csv[1]).toBe(
      `Corporativo,2026-09-01,${today},"Centro A | Centro, B",,,Ventas,kpi,currency,total,Total,4000,`,
    );
    expect(csv[2]).toBe(
      `Corporativo,2026-09-01,${today},"Centro A | Centro, B",,,Ventas,distribution,currency,premium,Premium,3000,75.00`,
    );
    expect(dashboardFiltersLabel(filters({ channel: "b2b" }), names)).toContain("Canal: B2B");
  });
});
