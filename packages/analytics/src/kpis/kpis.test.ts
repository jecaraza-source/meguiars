import { describe, expect, it } from "vitest";
import { kpiRegistry } from "../kpi";
import { METRIC_CATALOG, type DashboardFacts, type PnlBucketFact } from "../dashboards/catalog";
import { resolveDashboard, type ResolveContext, type WidgetResult } from "../dashboards/resolve";
import { KPI_CATALOG, KPI_CATEGORIES, kpiValidFilters, kpiWidgets } from "./catalog";

/**
 * Dataset fixture de D2: un centro, 7 días (22–28 sep). Las fuentes `orders`,
 * `centers` y `customers` tienen los mismos números que produce la base en
 * supabase/tests/kpis.test.sql (3 OS: $450 con producto $200, $250 con
 * retrabajo y $250 B2B; 2 clientes, uno recurrente; 2 bahías y 1 técnico).
 */
const A = "aaaaaaaa-0000-0000-0000-000000000000";
const from = "2026-09-22";
const to = "2026-09-28";

const pnl = (
  bucket: string,
  section: PnlBucketFact["section"],
  line: string,
  dimension: string | null,
  amount: number,
): PnlBucketFact => ({ detailCenterId: A, bucket, section, line, dimension, amount, movements: 1 });

const facts: DashboardFacts = {
  from,
  to,
  grain: "total",
  pnl: [
    pnl(from, "ingreso", "b2c", "recurrente", 500),
    pnl(from, "ingreso", "b2c", "producto_complemento", 200),
    pnl(from, "ingreso", "b2b", "recurrente", 250),
    pnl(from, "ingreso", "membresias", "membresia", 849),
    pnl(from, "costo_directo", "estandar", "recurrente", 240),
    pnl(from, "costo_directo", "estandar", "producto_complemento", 60),
    pnl(from, "costo_directo", "variacion_insumos", null, 10),
    pnl(from, "costo_directo", "egresos_costo_directo", null, 50),
    pnl(from, "gasto", "personal", null, 300),
    pnl(from, "gasto", "operativo", null, 100),
  ],
  orders: [
    {
      detailCenterId: A,
      bucket: from,
      channel: "b2c",
      orders: 2,
      sales: 700,
      productSales: 200,
      standardMinutes: 90,
      timedOrders: 2,
      actualMinutes: 90,
      reworkOrders: 1,
    },
    {
      detailCenterId: A,
      bucket: from,
      channel: "b2b",
      orders: 1,
      sales: 250,
      productSales: 0,
      standardMinutes: 40,
      timedOrders: 0,
      actualMinutes: 0,
      reworkOrders: 0,
    },
  ],
  centers: [
    {
      detailCenterId: A,
      bays: 2,
      technicians: 1,
      operatingHoursPerDay: 10,
      operatingDaysPerWeek: 6,
      ltvLifetimeYears: 3,
    },
  ],
  customers: [
    {
      detailCenterId: A,
      clientKey: "k-ana",
      channel: "b2c",
      visits: 1,
      sales: 450,
      cost: 140,
      priorVisit: true,
    },
    {
      detailCenterId: A,
      clientKey: "k-beto",
      channel: "b2c",
      visits: 1,
      sales: 250,
      cost: 80,
      priorVisit: false,
    },
    {
      detailCenterId: A,
      clientKey: "k-beto",
      channel: "b2b",
      visits: 1,
      sales: 250,
      cost: 80,
      priorVisit: false,
    },
  ],
  upsell: [
    {
      ruleId: "r1",
      ruleName: "Cera",
      detailCenterId: A,
      targetKind: "servicio",
      offered: 4,
      accepted: 1,
      rejected: 2,
      orders: 3,
      incrementalRevenue: 200,
      membershipValue: 0,
    },
  ],
  pipeline: [
    {
      opportunityId: "o1",
      detailCenterId: A,
      kind: "b2b",
      createdOn: "2026-09-01",
      createdValue: 1000,
      outcome: "ganada",
      closedOn: "2026-09-24",
      wonValue: 1200,
      currentValue: 1200,
      currentStageId: null,
      stagesReached: [],
      cycleDays: 23,
    },
    {
      opportunityId: "o2",
      detailCenterId: A,
      kind: "b2c_premium",
      createdOn: "2026-09-10",
      createdValue: 500,
      outcome: "perdida",
      closedOn: "2026-09-25",
      wonValue: null,
      currentValue: 500,
      currentStageId: null,
      stagesReached: [],
      cycleDays: 15,
    },
  ],
  pipelineStages: [],
  memberships: [
    {
      detailCenterId: A,
      status: "activa",
      price: 849,
      periodMonths: 1,
      entitledUnits: 4,
      usedUnits: 1,
      newInRange: true,
      renewalsInRange: 0,
      cancelledInRange: false,
      expiredInRange: false,
      revenueInRange: 849,
    },
    {
      detailCenterId: A,
      status: "proxima_a_vencer",
      price: 3900,
      periodMonths: 3,
      entitledUnits: 12,
      usedUnits: 5,
      newInRange: false,
      renewalsInRange: 1,
      cancelledInRange: false,
      expiredInRange: false,
      revenueInRange: 0,
    },
    {
      detailCenterId: A,
      status: "cancelada",
      price: 849,
      periodMonths: 1,
      entitledUnits: 4,
      usedUnits: 0,
      newInRange: false,
      renewalsInRange: 0,
      cancelledInRange: true,
      expiredInRange: false,
      revenueInRange: 0,
    },
  ],
};

const ctx = (over: Partial<ResolveContext> = {}): ResolveContext => ({
  from,
  to,
  filters: { channel: null, engine: null },
  centers: [{ id: A, name: "Centro A" }],
  allowedCenters: () => [A],
  ...over,
});

const valueOf = (r: WidgetResult) => {
  if (r.status !== "ok") throw new Error(`${r.widgetId}: ${r.status}`);
  return r.data.kind === "kpi"
    ? r.data.value
    : r.data.kind === "timeseries"
      ? r.data.points
      : r.data.rows.map((x) => [x.key, x.value]);
};
const resolveAll = (c = ctx()) =>
  Object.fromEntries(resolveDashboard(kpiWidgets(), facts, c).map((r) => [r.widgetId, valueOf(r)]));

describe("registro de KPIs (D2)", () => {
  it("cubre las cuatro categorías con los KPIs mínimos", () => {
    const byCategory = Object.fromEntries(
      KPI_CATEGORIES.map((c) => [c, KPI_CATALOG.filter((k) => k.category === c).map((k) => k.name)]),
    );
    expect(byCategory).toEqual({
      financieros: [
        "Ventas",
        "Utilidad bruta",
        "Margen de contribución",
        "EBITDA gerencial",
        "Ticket promedio",
        "Ingreso por centro",
      ],
      operativos: [
        "Vehículos atendidos",
        "Ocupación",
        "Duración promedio",
        "Productividad por técnico",
        "Retrabajos e incidencias",
      ],
      comerciales: [
        "Ventas por motor",
        "Ventas B2C",
        "Venta B2B",
        "Venta de productos",
        "Tasa de upselling",
        "Conversión de oportunidades",
      ],
      clientes: [
        "Membresías activas",
        "MRR",
        "Altas de membresía",
        "Renovaciones",
        "Cancelaciones",
        "Recurrencia",
        "Frecuencia de visita",
        "LTV gerencial inicial",
      ],
    });
  });

  it("cada KPI declara definición, numerador/denominador, filtros, periodo, unidad y notas", () => {
    for (const k of KPI_CATALOG) {
      expect(k.definition.length, k.id).toBeGreaterThan(20);
      expect(k.numerator.length, k.id).toBeGreaterThan(3);
      expect(k.denominator === null || k.denominator.length > 3, k.id).toBe(true);
      expect(k.notes.length, k.id).toBeGreaterThan(10);
      expect(["rango", "corte"]).toContain(k.period);
      expect(k.metric.unit).toBeTruthy();
      expect(kpiValidFilters(k).slice(0, 2)).toEqual(["centros", "periodo"]);
    }
    expect(kpiValidFilters(KPI_CATALOG.find((k) => k.id === "kpi.ventas_b2c")!)).toEqual([
      "centros",
      "periodo",
      "motor",
    ]);
  });

  it("no hay dos fórmulas para el mismo KPI: cada métrica tiene una fórmula única, la de su KPI registrado", () => {
    const formulas = METRIC_CATALOG.map((m) => m.formula);
    expect(new Set(formulas).size).toBe(formulas.length);
    for (const m of METRIC_CATALOG) expect(kpiRegistry.get(m.id)?.formula, m.id).toBe(m.formula);
    // Los KPIs que comparten métrica (ventas, por centro, por motor, B2C, B2B) usan la misma fórmula.
    const revenueKpis = KPI_CATALOG.filter((k) => k.metricId === "pnl.revenue");
    expect(revenueKpis.map((k) => k.id)).toEqual([
      "kpi.ventas",
      "kpi.ingreso_por_centro",
      "kpi.ventas_por_motor",
      "kpi.ventas_b2c",
      "kpi.venta_b2b",
    ]);
  });
});

describe("dataset fixture: valores esperados", () => {
  it("todos los KPIs con una sola lectura de hechos", () => {
    expect(resolveAll()).toEqual({
      // Financieros
      "kpi.ventas": 1799,
      "kpi.utilidad_bruta": 1439,
      "kpi.margen_contribucion": 1489,
      "kpi.ebitda": 1039,
      "kpi.ticket_promedio": 316.67,
      "kpi.ingreso_por_centro": [[A, 1799]],
      // Operativos: 130 min ÷ (2 × 10 h × 60 × 7 días × 6/7) = 1.81 %
      "kpi.vehiculos": 3,
      "kpi.ocupacion": 1.81,
      "kpi.duracion": 45,
      "kpi.productividad": 3,
      "kpi.retrabajos": 33.33,
      // Comerciales
      "kpi.ventas_por_motor": [
        ["recurrente", 750],
        ["producto_complemento", 200],
        ["membresia", 849],
      ],
      "kpi.ventas_b2c": 700,
      "kpi.venta_b2b": 250,
      "kpi.venta_productos": 200,
      "kpi.upselling": 25,
      "kpi.conversion": 50,
      // Membresías y clientes: MRR = $849 + $3,900 ÷ 3
      "kpi.membresias_activas": 2,
      "kpi.mrr": 2149,
      "kpi.altas": 1,
      "kpi.renovaciones": 1,
      "kpi.cancelaciones": 1,
      "kpi.recurrencia": 50,
      "kpi.frecuencia": 1.5,
      // ($950 ÷ 2) × (365 ÷ 7) × (1 − $300 ÷ $950) × 3 años
      "kpi.ltv": 50839.29,
    });
  });

  it("el filtro de canal se propaga a los KPIs compatibles y no pisa un canal fijo", () => {
    const b2c = resolveAll(ctx({ filters: { channel: "b2c", engine: null } }));
    expect(b2c["kpi.ventas"]).toBe(700);
    expect(b2c["kpi.venta_b2b"]).toBe(250);
    expect(b2c["kpi.vehiculos"]).toBe(2);
    expect(b2c["kpi.ticket_promedio"]).toBe(350);
    expect(b2c["kpi.frecuencia"]).toBe(1);
    // ($700 ÷ 2) × (365 ÷ 7) × (1 − $220 ÷ $700) × 3
    expect(b2c["kpi.ltv"]).toBe(37542.86);
    expect(b2c["kpi.ocupacion"]).toBe(1.81);
  });

  it("el motor filtra ventas y margen de contribución (ingreso y costo estándar del motor)", () => {
    const premium = resolveAll(ctx({ filters: { channel: null, engine: "producto_complemento" } }));
    expect(premium["kpi.ventas"]).toBe(200);
    expect(premium["kpi.margen_contribucion"]).toBe(140);
  });

  it("el LTV usa el parámetro de vida esperada de la organización", () => {
    const five = { ...facts, centers: [{ ...facts.centers![0]!, ltvLifetimeYears: 5 }] };
    const [ltv] = resolveDashboard(kpiWidgets(KPI_CATALOG.filter((k) => k.id === "kpi.ltv")), five, ctx());
    expect(valueOf(ltv!)).toBe(84732.14);
  });

  it("sin permiso en el centro, los KPIs de esa fuente no muestran datos", () => {
    const results = resolveDashboard(
      kpiWidgets(),
      facts,
      ctx({ allowedCenters: (cap) => (cap === "customers.metrics.read" ? [A] : []) }),
    );
    const status = Object.fromEntries(results.map((r) => [r.widgetId, r.status]));
    expect(status["kpi.recurrencia"]).toBe("ok");
    expect(status["kpi.ventas"]).toBe("forbidden");
    expect(status["kpi.vehiculos"]).toBe("forbidden");
  });
});
