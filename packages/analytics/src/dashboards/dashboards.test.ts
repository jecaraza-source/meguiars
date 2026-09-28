import { describe, expect, it } from "vitest";
import { pnlByCenter } from "../pnl";
import {
  METRIC_CATALOG,
  metricById,
  type DashboardFacts,
  type PnlBucketFact,
  type PaymentBucketFact,
} from "./catalog";
import {
  bucketStart,
  factsGrain,
  requiredSources,
  resolveDashboard,
  resolveGrain,
  resolveWidget,
  seriesBuckets,
  type ResolveContext,
  type WidgetConfig,
} from "./resolve";

const A = "aaaaaaaa-0000-0000-0000-000000000000";
const B = "bbbbbbbb-0000-0000-0000-000000000000";

const pnl = (
  c: string,
  bucket: string,
  section: PnlBucketFact["section"],
  line: string,
  dimension: string | null,
  amount: number,
): PnlBucketFact => ({
  detailCenterId: c,
  bucket,
  section,
  line,
  dimension,
  amount,
  movements: 1,
});

const pay = (
  c: string,
  bucket: string,
  method: string,
  amount: number,
  collectsCash = true,
): PaymentBucketFact => ({
  detailCenterId: c,
  bucket,
  day: bucket,
  method,
  methodName: method === "efectivo" ? "Efectivo" : "Tarjeta",
  collectsCash,
  validAmount: amount,
  validCount: 1,
  reversedAmount: 0,
  reversedCount: 0,
  changeAmount: 0,
});

const facts: DashboardFacts = {
  from: "2026-09-01",
  to: "2026-09-30",
  grain: "dia",
  pnl: [
    pnl(A, "2026-09-01", "ingreso", "b2c", "recurrente", 1000),
    pnl(A, "2026-09-02", "ingreso", "b2b", "premium", 3000),
    pnl(A, "2026-09-02", "ingreso", "membresias", "membresia", 849),
    pnl(A, "2026-09-02", "costo_directo", "estandar", "premium", 900),
    pnl(A, "2026-09-10", "gasto", "personal", null, 500),
    pnl(B, "2026-09-15", "ingreso", "b2c", "valor_medio", 2000),
    pnl(B, "2026-09-15", "ingreso", "cuotas_b2b", "cuota_b2b", 1500),
    pnl(B, "2026-09-15", "costo_directo", "estandar", "valor_medio", 600),
  ],
  payments: [
    pay(A, "2026-09-01", "efectivo", 700),
    pay(A, "2026-09-02", "tarjeta", 300),
    pay(B, "2026-09-15", "tarjeta", 2000),
  ],
  pipeline: [
    {
      opportunityId: "o1",
      detailCenterId: A,
      kind: "b2b",
      createdOn: "2026-09-03",
      createdValue: 10000,
      outcome: "ganada",
      closedOn: "2026-09-20",
      wonValue: 12000,
      currentValue: 12000,
      currentStageId: "s3",
      stagesReached: ["s1", "s2", "s3"],
      cycleDays: 17,
    },
    {
      opportunityId: "o2",
      detailCenterId: A,
      kind: "b2c_premium",
      createdOn: "2026-09-05",
      createdValue: 5000,
      outcome: null,
      closedOn: null,
      wonValue: null,
      currentValue: 5000,
      currentStageId: "s1",
      stagesReached: ["s1"],
      cycleDays: null,
    },
  ],
  pipelineStages: [
    { id: "s1", name: "Contacto", kind: "abierta", position: 1, probability: 10 },
    { id: "s2", name: "Propuesta", kind: "abierta", position: 2, probability: 50 },
    { id: "s3", name: "Ganada", kind: "ganada", position: 3, probability: 100 },
    { id: "s4", name: "Perdida", kind: "perdida", position: 4, probability: 0 },
  ],
};

const everyone = (): readonly string[] => [A, B];
const ctx = (over: Partial<ResolveContext> = {}): ResolveContext => ({
  from: "2026-09-01",
  to: "2026-09-30",
  filters: { channel: null, engine: null },
  centers: [
    { id: A, name: "Centro A" },
    { id: B, name: "Centro B" },
  ],
  allowedCenters: everyone,
  ...over,
});
const w = (
  metricId: string,
  type: WidgetConfig["type"],
  options: WidgetConfig["options"] = {},
): WidgetConfig => ({
  id: `${metricId}:${type}`,
  metricId,
  type,
  options,
});
const ok = (r: ReturnType<typeof resolveWidget>) => {
  if (r.status !== "ok") throw new Error(`widget no resuelto: ${r.status}`);
  return r;
};
const kpi = (metricId: string, c = ctx()) => {
  const d = ok(resolveWidget(w(metricId, "kpi"), facts, c)).data;
  return d.kind === "kpi" ? d.value : NaN;
};

describe("catálogo de métricas", () => {
  it("cada métrica tiene definición, unidad, fórmula, fuente, permiso y widgets", () => {
    for (const m of METRIC_CATALOG) {
      expect(m.description.length).toBeGreaterThan(10);
      expect(m.formula.length).toBeGreaterThan(5);
      expect(m.sourceTables.length).toBeGreaterThan(0);
      expect(m.capability).toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
      expect(m.widgets.length).toBeGreaterThan(0);
    }
  });

  it("un id fuera del catálogo nunca se ejecuta", () => {
    expect(metricById("select 1")).toBeUndefined();
    expect(resolveWidget(w("select 1", "kpi"), facts, ctx()).status).toBe("unknown_metric");
    expect(resolveWidget(w("pnl.revenue", "funnel"), facts, ctx()).status).toBe("unsupported");
  });
});

describe("resolución de widgets", () => {
  it("los KPI del P&L son los del estado de resultados (misma fórmula)", () => {
    const statement = pnlByCenter(facts.pnl!, [A, B]).consolidated;
    expect(kpi("pnl.revenue")).toBe(statement.revenue);
    expect(kpi("pnl.revenue")).toBe(8349);
    expect(kpi("pnl.gross_profit")).toBe(statement.grossProfit);
    expect(kpi("pnl.ebitda")).toBe(statement.ebitda);
    expect(kpi("pnl.ebitda_margin")).toBe(statement.ebitdaMargin);
    expect(kpi("payments.collected")).toBe(3000);
  });

  it("métrica agregada sólo en el catálogo (ejemplo): gasto de personal sobre ventas", () => {
    // $500 de personal ÷ $8,349 de ventas = 5.99 %; sin tocar pantallas.
    expect(kpi("pnl.personnel_ratio")).toBe(5.99);
    const bars = ok(resolveWidget(w("pnl.personnel_ratio", "bars"), facts, ctx()));
    expect(bars.data).toEqual({
      kind: "bars",
      rows: [
        { key: A, label: "Centro A", value: 10.31, share: null },
        { key: B, label: "Centro B", value: 0, share: null },
      ],
    });
    expect(bars.metric.drill).toEqual({ kind: "pnl", section: "gasto", line: "personal" });
  });

  it("el filtro de canal y motor se propaga sólo a las métricas compatibles", () => {
    const b2b = ctx({ filters: { channel: "b2b", engine: null } });
    expect(kpi("pnl.revenue", b2b)).toBe(4500); // OS B2B + cuota B2B
    const r = ok(resolveWidget(w("pnl.ebitda", "kpi"), facts, b2b));
    expect(r.ignoredFilters).toEqual(["canal"]);
    expect(ok(resolveWidget(w("pnl.revenue", "kpi"), facts, b2b)).ignoredFilters).toEqual([]);
    expect(kpi("pnl.revenue", ctx({ filters: { channel: null, engine: "premium" } }))).toBe(3000);
    expect(kpi("pnl.revenue", ctx({ filters: { channel: "membresia", engine: null } }))).toBe(849);
    expect(kpi("pipeline.created", b2b)).toBe(1);
    expect(kpi("pipeline.created", ctx({ filters: { channel: "b2c", engine: null } }))).toBe(1);
  });

  it("serie de tiempo: un punto por periodo y la suma cuadra con el KPI", () => {
    const r = ok(resolveWidget(w("pnl.revenue", "timeseries", { grain: "semana" }), facts, ctx()));
    if (r.data.kind !== "timeseries") throw new Error();
    expect(r.data.grain).toBe("semana");
    expect(r.data.points.map((p) => p.from)).toEqual([
      "2026-09-01",
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
    ]);
    expect(r.data.points.reduce((t, p) => t + p.value, 0)).toBe(kpi("pnl.revenue"));
    const pipe = ok(resolveWidget(w("pipeline.created", "timeseries", { grain: "semana" }), facts, ctx()));
    if (pipe.data.kind !== "timeseries") throw new Error();
    expect(pipe.data.points.map((p) => p.value)).toEqual([2, 0, 0, 0, 0]);
  });

  it("barras y ranking por centro; ranking con participación y tope", () => {
    const bars = ok(resolveWidget(w("pnl.revenue", "bars"), facts, ctx()));
    if (bars.data.kind !== "bars") throw new Error();
    expect(bars.data.rows.map((r) => [r.label, r.value])).toEqual([
      ["Centro A", 4849],
      ["Centro B", 3500],
    ]);
    const rank = ok(resolveWidget(w("pnl.revenue", "ranking", { limit: 3 }), facts, ctx()));
    if (rank.data.kind !== "ranking") throw new Error();
    expect(rank.data.rows[0]).toMatchObject({ label: "Centro A", share: 58.08 });
    const margin = ok(resolveWidget(w("pnl.gross_margin", "ranking"), facts, ctx()));
    if (margin.data.kind !== "ranking") throw new Error();
    expect(margin.data.rows.every((r) => r.share === null)).toBe(true);
  });

  it("distribución por motor, canal y forma de pago", () => {
    const engines = ok(resolveWidget(w("pnl.revenue", "distribution", { breakdown: "motor" }), facts, ctx()));
    if (engines.data.kind !== "distribution") throw new Error();
    expect(engines.data.rows.map((r) => r.key)).toEqual([
      "recurrente",
      "valor_medio",
      "premium",
      "membresia",
      "cuota_b2b",
    ]);
    expect(engines.data.rows.reduce((t, r) => t + r.value, 0)).toBe(8349);
    const channels = ok(
      resolveWidget(w("pnl.revenue", "distribution", { breakdown: "canal" }), facts, ctx()),
    );
    if (channels.data.kind !== "distribution") throw new Error();
    expect(channels.data.rows.map((r) => [r.label, r.value])).toEqual([
      ["B2C", 3000],
      ["Membresía", 849],
      ["B2B", 4500],
    ]);
    const methods = ok(resolveWidget(w("payments.collected", "distribution"), facts, ctx()));
    if (methods.data.kind !== "distribution") throw new Error();
    expect(methods.data.rows.map((r) => [r.label, r.value, r.share])).toEqual([
      ["Tarjeta", 2300, 76.67],
      ["Efectivo", 700, 23.33],
    ]);
  });

  it("embudo de las oportunidades nuevas (sin la etapa perdida)", () => {
    const f = ok(resolveWidget(w("pipeline.created", "funnel"), facts, ctx()));
    if (f.data.kind !== "funnel") throw new Error();
    expect(f.data.rows.map((r) => [r.label, r.value, r.share])).toEqual([
      ["Contacto", 2, 100],
      ["Propuesta", 1, 50],
      ["Ganada", 1, 50],
    ]);
  });

  it("permisos: sin la capacidad en ningún centro el widget no muestra datos; en parte, avisa", () => {
    const onlyA = ctx({ allowedCenters: (cap) => (cap === "pnl.read" ? [A] : []) });
    expect(resolveWidget(w("payments.collected", "kpi"), facts, onlyA).status).toBe("forbidden");
    const r = ok(resolveWidget(w("pnl.revenue", "kpi"), facts, onlyA));
    expect(r.centersWithoutAccess).toEqual(["Centro B"]);
    expect(r.data).toEqual({ kind: "kpi", value: 4849 });
  });

  it("todo el tablero se resuelve con una sola lectura de hechos", () => {
    const widgets = [
      w("pnl.revenue", "kpi"),
      w("payments.collected", "timeseries"),
      w("pipeline.created", "funnel"),
    ];
    expect(requiredSources(widgets)).toEqual(["payments", "pipeline", "pnl"]);
    expect(resolveDashboard(widgets, facts, ctx()).map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
  });
});

describe("periodos de la serie", () => {
  it("periodicidad automática por largo del rango; la diaria se acota", () => {
    expect(resolveGrain("auto", "2026-09-01", "2026-09-30")).toBe("dia");
    expect(resolveGrain(undefined, "2026-01-01", "2026-05-31")).toBe("semana");
    expect(resolveGrain("auto", "2026-01-01", "2026-12-31")).toBe("mes");
    expect(resolveGrain("dia", "2026-01-01", "2026-12-31")).toBe("semana");
  });

  it("los hechos se piden a la periodicidad más fina y sólo si hay series", () => {
    expect(factsGrain([w("pnl.revenue", "kpi")], "2026-09-01", "2026-09-30")).toBe("total");
    expect(
      factsGrain(
        [
          w("pnl.revenue", "timeseries", { grain: "mes" }),
          w("payments.collected", "timeseries", { grain: "semana" }),
        ],
        "2026-01-01",
        "2026-09-30",
      ),
    ).toBe("semana");
    // El pipeline calcula por rango: no exige hechos por periodo.
    expect(factsGrain([w("pipeline.created", "timeseries")], "2026-09-01", "2026-09-30")).toBe("total");
  });

  it("inicio del periodo igual que private.dashboard_bucket (recortado al rango)", () => {
    expect(bucketStart("2026-09-17", "2026-09-01", "semana")).toBe("2026-09-14");
    expect(bucketStart("2026-09-02", "2026-09-01", "semana")).toBe("2026-09-01");
    expect(bucketStart("2026-09-17", "2026-08-20", "mes")).toBe("2026-09-01");
    expect(bucketStart("2026-08-25", "2026-08-20", "mes")).toBe("2026-08-20");
    expect(seriesBuckets("2026-08-20", "2026-10-05", "mes")).toEqual([
      { from: "2026-08-20", to: "2026-08-31" },
      { from: "2026-09-01", to: "2026-09-30" },
      { from: "2026-10-01", to: "2026-10-05" },
    ]);
  });
});
