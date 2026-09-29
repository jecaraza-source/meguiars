import { describe, expect, it } from "vitest";
import type { DashboardFacts, PnlBucketFact } from "../dashboards/catalog";
import { pnlByCenter } from "../pnl";
import type { ServiceFact } from "../services";
import {
  ALL_CENTERS,
  alertOf,
  CORPORATE_CARDS,
  corporateBoard,
  corporateCardById,
  corporateDrill,
  corporateMix,
  orderLinesLevel,
  previousPeriod,
  sortMix,
  thresholdFor,
  trendOf,
  type CorporateContext,
  type DrillView,
  type ThresholdLike,
} from "./index";

/**
 * Dataset fixture de D3: tres centros (A con historia, B abrió a mediados del
 * periodo anterior, C sin actividad), mes al día 28 contra agosto al día 28.
 * Las ventas por servicio cuadran con el P&L igual que en
 * supabase/tests/corporate_board.test.sql (lavado, cera, descuento general).
 */
const A = "aaaaaaaa-0000-0000-0000-000000000000";
const B = "bbbbbbbb-0000-0000-0000-000000000000";
const C = "cccccccc-0000-0000-0000-000000000000";
const from = "2026-09-01";
const to = "2026-09-28";
const prev = { from: "2026-08-01", to: "2026-08-28" };
const CENTERS = [
  { id: A, name: "Centro A" },
  { id: B, name: "Centro B" },
  { id: C, name: "Centro C" },
];

const pnl = (
  center: string,
  bucket: string,
  section: PnlBucketFact["section"],
  line: string,
  dimension: string | null,
  amount: number,
): PnlBucketFact => ({ detailCenterId: center, bucket, section, line, dimension, amount, movements: 1 });

const svc = (
  center: string,
  channel: ServiceFact["channel"],
  engine: string,
  serviceId: string | null,
  serviceName: string,
  kind: ServiceFact["kind"],
  quantity: number,
  revenue: number,
  standardCost: number,
): ServiceFact => ({
  detailCenterId: center,
  bucket: from,
  channel,
  engine,
  serviceId,
  serviceName,
  kind,
  quantity,
  orders: Math.max(1, quantity),
  revenue,
  standardCost,
});

const membership = (center: string, price: number, periodMonths: number) => ({
  detailCenterId: center,
  status: "activa" as const,
  price,
  periodMonths,
  entitledUnits: 4,
  usedUnits: 0,
  newInRange: false,
  renewalsInRange: 0,
  cancelledInRange: false,
  expiredInRange: false,
  revenueInRange: 0,
});

const resources = (center: string, firstActivityOn: string | null) => ({
  detailCenterId: center,
  bays: 2,
  technicians: 1,
  operatingHoursPerDay: 10,
  operatingDaysPerWeek: 6,
  ltvLifetimeYears: 3,
  firstActivityOn,
});

const orders = (center: string, channel: "b2c" | "b2b", n: number, sales: number, productSales: number) => ({
  detailCenterId: center,
  bucket: from,
  channel,
  orders: n,
  sales,
  productSales,
  standardMinutes: 40 * n,
  timedOrders: 0,
  actualMinutes: 0,
  reworkOrders: 0,
});

const facts: DashboardFacts = {
  from,
  to,
  grain: "total",
  pnl: [
    pnl(A, from, "ingreso", "b2c", "recurrente", 500),
    pnl(A, from, "ingreso", "b2c", "producto_complemento", 200),
    pnl(A, from, "ingreso", "b2c", "descuento_os", -50),
    pnl(A, from, "ingreso", "b2b", "recurrente", 250),
    pnl(A, from, "ingreso", "membresias", "membresia", 300),
    pnl(A, from, "costo_directo", "estandar", "recurrente", 240),
    pnl(A, from, "costo_directo", "estandar", "producto_complemento", 60),
    pnl(A, from, "costo_directo", "variacion_insumos", null, 10),
    pnl(A, from, "gasto", "personal", null, 400),
    pnl(A, from, "gasto", "operativo", null, 100),
    pnl(B, from, "ingreso", "b2c", "recurrente", 250),
    pnl(B, from, "ingreso", "cuotas_b2b", "cuota_b2b", 1000),
    pnl(B, from, "costo_directo", "estandar", "recurrente", 80),
    pnl(B, from, "gasto", "personal", null, 900),
  ],
  services: [
    svc(A, "b2c", "recurrente", "lav", "Lavado", "servicio", 2, 500, 160),
    svc(A, "b2c", "producto_complemento", "cera", "Cera", "producto", 1, 200, 60),
    svc(A, "b2c", "descuento_os", null, "Descuento general de la OS", "descuento", 0, -50, 0),
    svc(A, "b2b", "recurrente", "lav", "Lavado", "servicio", 1, 250, 80),
    svc(B, "b2c", "recurrente", "lav", "Lavado", "servicio", 1, 250, 80),
  ],
  orders: [orders(A, "b2c", 2, 650, 200), orders(A, "b2b", 1, 250, 0), orders(B, "b2c", 1, 250, 0)],
  centers: [resources(A, "2026-05-01"), resources(B, "2026-08-15"), resources(C, null)],
  memberships: [membership(A, 300, 1), membership(B, 900, 3)],
  customers: [
    {
      detailCenterId: A,
      clientKey: "k1",
      channel: "b2c",
      visits: 2,
      sales: 650,
      cost: 220,
      priorVisit: true,
    },
    {
      detailCenterId: A,
      clientKey: "k2",
      channel: "b2b",
      visits: 1,
      sales: 250,
      cost: 80,
      priorVisit: false,
    },
    {
      detailCenterId: B,
      clientKey: "k3",
      channel: "b2c",
      visits: 1,
      sales: 250,
      cost: 80,
      priorVisit: false,
    },
  ],
};

const previousFacts: DashboardFacts = {
  from: prev.from,
  to: prev.to,
  grain: "total",
  pnl: [
    pnl(A, prev.from, "ingreso", "b2c", "recurrente", 1000),
    pnl(A, prev.from, "costo_directo", "estandar", "recurrente", 320),
    pnl(A, prev.from, "gasto", "personal", null, 400),
    pnl(B, prev.from, "ingreso", "b2c", "recurrente", 100),
  ],
  services: [],
  orders: [orders(A, "b2c", 4, 1000, 0)],
  centers: facts.centers!,
  memberships: [membership(A, 300, 1)],
  customers: [
    {
      detailCenterId: A,
      clientKey: "k1",
      channel: "b2c",
      visits: 1,
      sales: 1000,
      cost: 320,
      priorVisit: true,
    },
  ],
};

const thresholds: ThresholdLike[] = [
  { metricId: "pnl.revenue", channel: null, detailCenterId: null, minValue: 1210, maxValue: null },
  { metricId: "pnl.revenue", channel: "b2b", detailCenterId: A, minValue: 300, maxValue: null },
  { metricId: "pnl.ebitda", channel: null, detailCenterId: null, minValue: null, maxValue: 500 },
  { metricId: "pnl.ebitda", channel: null, detailCenterId: B, minValue: null, maxValue: 200 },
];

const ctx = (over: Partial<CorporateContext> = {}): CorporateContext => ({
  from,
  to,
  previous: prev,
  centers: CENTERS,
  allowedCenters: () => [A, B, C],
  thresholds,
  ...over,
});

const board = (over: Partial<CorporateContext> = {}) => corporateBoard(facts, previousFacts, ctx(over));
const cardOf = (id: string, over: Partial<CorporateContext> = {}) =>
  board(over).find((c) => c.card.id === id)!;
const cell = (id: string, key: string, over: Partial<CorporateContext> = {}) => {
  const c = cardOf(id, over);
  return key === "consolidado" ? c.consolidated! : c.centers.find((x) => x.key === key)!;
};
const ok = (v: DrillView) => {
  if (v.status !== "ok") throw new Error(`drill ${v.status}`);
  return v;
};

describe("tarjetas del tablero corporativo", () => {
  it("declara las 10 tarjetas pedidas sobre métricas registradas", () => {
    expect(CORPORATE_CARDS.map((c) => c.id)).toEqual([
      "ventas",
      "ebitda",
      "margen",
      "vehiculos",
      "ticket",
      "membresias",
      "mrr",
      "recurrencia",
      "venta_b2b",
      "venta_productos",
    ]);
    expect(corporateCardById("venta_b2b")).toMatchObject({ metricId: "pnl.revenue", channel: "b2b" });
  });

  it("valores por centro y consolidado (fixture)", () => {
    const expected: Record<string, [number, number, number, number]> = {
      ventas: [1200, 1250, 0, 2450],
      ebitda: [390, 270, 0, 660],
      margen: [74.17, 93.6, 0, 84.08],
      vehiculos: [3, 1, 0, 4],
      ticket: [300, 250, 0, 287.5],
      membresias: [1, 1, 0, 2],
      mrr: [300, 300, 0, 600],
      recurrencia: [50, 0, 0, 33.33],
      venta_b2b: [250, 1000, 0, 1250],
      venta_productos: [200, 0, 0, 200],
    };
    for (const [id, [a, b, c, total]] of Object.entries(expected)) {
      const r = cardOf(id);
      expect([...r.centers.map((x) => x.value), r.consolidated!.value], id).toEqual([a, b, c, total]);
    }
  });

  it("el consolidado coincide con el estado de resultados", () => {
    const st = pnlByCenter(facts.pnl!, [A, B, C]);
    expect(cell("ventas", "consolidado").value).toBe(st.consolidated.revenue);
    expect(cell("ebitda", "consolidado").value).toBe(st.consolidated.ebitda);
    expect(cell("margen", "consolidado").value).toBe(st.consolidated.grossMargin);
    st.centers.forEach((c) => expect(cell("ventas", c.detailCenterId).value).toBe(c.statement.revenue));
  });

  it("funciona con 2, 3 o N centros sin código por centro", () => {
    for (const n of [1, 2, 3]) {
      const centers = CENTERS.slice(0, n);
      const r = cardOf("ventas", { centers });
      expect(r.centers.map((c) => c.key)).toEqual(centers.map((c) => c.id));
      expect(r.consolidated!.value).toBe([1200, 2450, 2450][n - 1]);
    }
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, name: `Centro ${i}` }));
    const r = cardOf("ventas", {
      centers: [...CENTERS, ...many],
      allowedCenters: () => [A, B, C, ...many.map((m) => m.id)],
    });
    expect(r.centers).toHaveLength(15);
    expect(r.consolidated!.value).toBe(2450);
  });

  it("los filtros (centros y periodo) son los mismos en todas las tarjetas", () => {
    const soloA = board({ centers: [CENTERS[0]!] });
    for (const r of soloA) expect(r.centers.map((c) => c.key)).toEqual([A]);
    expect(soloA.find((r) => r.card.id === "vehiculos")!.consolidated!.value).toBe(3);
    expect(soloA.find((r) => r.card.id === "mrr")!.consolidated!.value).toBe(300);
  });

  it("respeta permisos por centro: sin permiso no suma ni se muestra", () => {
    const over = { allowedCenters: (cap: string) => (cap === "pnl.read" ? [A] : [A, B, C]) };
    const ventas = cardOf("ventas", over);
    expect(ventas.consolidated!.value).toBe(1200);
    expect(ventas.centers.map((c) => c.key)).toEqual([A]);
    expect(ventas.centersWithoutAccess).toEqual(["Centro B", "Centro C"]);
    expect(cardOf("mrr", over).consolidated!.value).toBe(600);
    expect(cardOf("recurrencia", { allowedCenters: () => [] }).status).toBe("forbidden");
  });
});

describe("tendencia contra el periodo anterior", () => {
  it("periodo anterior equivalente", () => {
    expect(previousPeriod("mes", from, to)).toEqual(prev);
    expect(previousPeriod("mes", "2026-03-01", "2026-03-31")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(previousPeriod("anio", "2028-01-01", "2028-02-29")).toEqual({
      from: "2027-01-01",
      to: "2027-02-28",
    });
    expect(previousPeriod("semana", "2026-09-28", "2026-09-30")).toEqual({
      from: "2026-09-21",
      to: "2026-09-23",
    });
    expect(previousPeriod("hoy", "2026-09-28", "2026-09-28")).toEqual({
      from: "2026-09-27",
      to: "2026-09-27",
    });
    expect(previousPeriod("personalizado", "2026-09-10", "2026-09-19")).toEqual({
      from: "2026-08-31",
      to: "2026-09-09",
    });
  });

  it("cambio % en moneda y conteos; puntos en porcentajes", () => {
    expect(cell("ventas", A).trend).toMatchObject({
      status: "ok",
      previous: 1000,
      delta: 20,
      mode: "percent",
      direction: "up",
      favorable: true,
    });
    expect(cell("ebitda", A).trend).toMatchObject({ status: "ok", delta: 39.29 });
    expect(cell("margen", A).trend).toMatchObject({
      status: "ok",
      previous: 68,
      delta: 6.17,
      mode: "points",
    });
    expect(cell("vehiculos", A).trend).toMatchObject({
      status: "ok",
      delta: -25,
      direction: "down",
      favorable: false,
    });
    expect(cell("ticket", A).trend).toMatchObject({ status: "ok", delta: 20 });
    expect(cell("membresias", A).trend).toMatchObject({
      status: "ok",
      delta: 0,
      direction: "flat",
      favorable: null,
    });
    expect(cell("recurrencia", A).trend).toMatchObject({ status: "ok", delta: -50, mode: "points" });
  });

  it("sólo cuando es válida: sin historia completa o sin base no hay tendencia", () => {
    expect(cell("ventas", B).trend).toMatchObject({ status: "invalid", reason: "sin_historia" });
    expect(cell("ventas", C).trend).toMatchObject({ status: "invalid", reason: "sin_historia" });
    expect(cell("ventas", "consolidado").trend).toMatchObject({ status: "invalid", reason: "sin_historia" });
    expect(cell("venta_b2b", A).trend).toMatchObject({ status: "invalid", reason: "sin_base" });
    expect(cell("ventas", "consolidado", { centers: [CENTERS[0]!] }).trend).toMatchObject({
      status: "ok",
      delta: 20,
    });
    expect(corporateBoard(facts, null, ctx({ previous: null }))[0]!.consolidated!.trend).toMatchObject({
      status: "invalid",
      reason: "sin_periodo",
    });
    expect(
      trendOf({
        unit: "currency",
        higherIsBetter: false,
        current: 90,
        previous: 100,
        firstActivity: ["2026-01-01"],
        previousFrom: "2026-08-01",
      }),
    ).toMatchObject({ direction: "down", favorable: true });
  });
});

describe("alertas por umbral", () => {
  it("el umbral del centro pisa al general; el consolidado usa el general", () => {
    expect(thresholdFor(thresholds, "pnl.ebitda", null, B)!.maxValue).toBe(200);
    expect(thresholdFor(thresholds, "pnl.ebitda", null, A)!.maxValue).toBe(500);
    expect(thresholdFor(thresholds, "pnl.ebitda", null, null)!.maxValue).toBe(500);
    expect(thresholdFor(thresholds, "pnl.revenue", "b2b", B)).toBeNull();
    expect(alertOf(10, null)).toBeNull();
  });

  it("marca las celdas que cruzan el umbral", () => {
    expect(cell("ventas", A).alert).toEqual({ kind: "bajo", limit: 1210, scope: "organizacion" });
    expect(cell("ventas", B).alert).toBeNull();
    expect(cell("ventas", C).alert).toMatchObject({ kind: "bajo" });
    expect(cell("ventas", "consolidado").alert).toBeNull();
    expect(cell("venta_b2b", A).alert).toEqual({ kind: "bajo", limit: 300, scope: "centro" });
    expect(cell("ebitda", "consolidado").alert).toEqual({ kind: "alto", limit: 500, scope: "organizacion" });
    expect(cell("ebitda", B).alert).toEqual({ kind: "alto", limit: 200, scope: "centro" });
    expect(cell("ebitda", A).alert).toBeNull();
  });
});

describe("ranking de motores y servicios", () => {
  const mix = corporateMix(facts, ctx());

  it("motores por ingreso y margen de contribución", () => {
    expect(mix.byEngine.map((r) => [r.key, r.revenue, r.margin])).toEqual([
      ["cuota_b2b", 1000, 1000],
      ["recurrente", 1000, 680],
      ["membresia", 300, 300],
      ["producto_complemento", 200, 140],
      ["-", 0, -10],
      ["descuento_os", -50, -50],
    ]);
    expect(mix.byEngine.find((r) => r.key === "recurrente")).toMatchObject({ marginPct: 68, share: 40.82 });
    expect(sortMix(mix.byEngine, "margin")[1]!.key).toBe("recurrente");
  });

  it("servicios por ingreso y margen (venta − costo estándar)", () => {
    expect(mix.byService.map((r) => [r.key, r.revenue, r.margin, r.quantity])).toEqual([
      ["lav", 1000, 680, 4],
      ["cera", 200, 140, 1],
      ["descuento_os", -50, -50, null],
    ]);
    expect(sortMix(mix.byService, "margin").map((r) => r.key)).toEqual(["lav", "cera", "descuento_os"]);
  });

  it("concilia con el P&L sin diferencias", () => {
    expect(mix.revenueReconciliation.at(-1)).toMatchObject({ amount: 2450, total: true });
    expect(mix.marginReconciliation.at(-1)).toMatchObject({ amount: 2060, total: true });
    expect([mix.revenueDifference, mix.marginDifference]).toEqual([0, 0]);
    const soloB = corporateMix(facts, ctx({ centers: [CENTERS[1]!] }));
    expect(soloB.byService.map((r) => r.key)).toEqual(["lav"]);
    expect([soloB.revenueDifference, soloB.marginDifference]).toEqual([0, 0]);
    expect(corporateMix(facts, ctx({ allowedCenters: () => [] })).status).toBe("forbidden");
  });
});

describe("drill-down: KPI → centro → canal/motor → servicio → OS", () => {
  const drill = (path: Parameters<typeof corporateDrill>[0], over: Partial<CorporateContext> = {}) =>
    ok(corporateDrill(path, facts, ctx(over)));

  it("nivel centro explica el consolidado", () => {
    const v = drill({ cardId: "ventas" });
    const [lvl] = v.levels;
    expect(lvl!.rows.map((r) => [r.key, r.value])).toEqual([
      [A, 1200],
      [B, 1250],
      [C, 0],
    ]);
    expect([lvl!.parent.value, lvl!.sum, lvl!.difference]).toEqual([2450, 2450, 0]);
    expect(lvl!.rows[0]!.next).toEqual({ cardId: "ventas", center: A });
  });

  it("nivel canal y motor del centro (Σ = cifra del centro)", () => {
    const v = drill({ cardId: "ventas", center: A });
    const [canal, motor] = v.levels;
    expect(canal!.rows.map((r) => [r.key, r.value])).toEqual([
      ["b2c", 650],
      ["membresia", 300],
      ["b2b", 250],
    ]);
    expect(motor!.rows.map((r) => [r.key, r.value])).toEqual([
      ["recurrente", 750],
      ["producto_complemento", 200],
      ["membresia", 300],
      ["descuento_os", -50],
    ]);
    for (const l of v.levels) expect([l.parent.value, l.difference]).toEqual([1200, 0]);
    expect(v.breadcrumbs.map((b) => b.label)).toEqual(["Ventas", "Centro A"]);
  });

  it("nivel servicio (incluye descuento general y ventas que no son OS)", () => {
    const b2c = drill({ cardId: "ventas", center: A, dim: "canal", value: "b2c" }).levels[0]!;
    expect(b2c.rows.map((r) => [r.key, r.value])).toEqual([
      ["lav", 500],
      ["cera", 200],
      ["descuento_os", -50],
    ]);
    expect([b2c.parent.value, b2c.difference]).toEqual([650, 0]);
    const mem = drill({ cardId: "ventas", center: A, dim: "canal", value: "membresia" }).levels[0]!;
    expect(mem.rows.map((r) => [r.key, r.value, r.pnl?.line])).toEqual([
      ["linea:membresias", 300, "membresias"],
    ]);
    expect(mem.difference).toBe(0);
    const fees = drill({ cardId: "ventas", center: ALL_CENTERS, dim: "motor", value: "cuota_b2b" })
      .levels[0]!;
    expect([fees.parent.value, fees.rows[0]!.label, fees.difference]).toEqual([1000, "Cuotas B2B", 0]);
    const all = drill({ cardId: "ventas", center: ALL_CENTERS, dim: "motor", value: "recurrente" })
      .levels[0]!;
    expect(all.rows.map((r) => [r.key, r.value])).toEqual([["lav", 1000]]);
    expect(all.difference).toBe(0);
  });

  it("canal fijo (Venta B2B): motor → servicio y cuotas", () => {
    const v = drill({ cardId: "venta_b2b", center: ALL_CENTERS });
    expect(v.levels.map((l) => l.kind)).toEqual(["motor"]);
    expect(v.levels[0]!.rows.map((r) => [r.key, r.value])).toEqual([
      ["recurrente", 250],
      ["cuota_b2b", 1000],
    ]);
    const s = drill({ cardId: "venta_b2b", center: ALL_CENTERS, dim: "motor", value: "recurrente" })
      .levels[0]!;
    expect(s.rows.map((r) => [r.key, r.value])).toEqual([["lav", 250]]);
    expect(s.difference).toBe(0);
  });

  it("último nivel: OS del servicio (Σ = cifra del servicio)", () => {
    const v = drill({ cardId: "ventas", center: A, dim: "canal", value: "b2c", service: "lav" });
    expect(v.orderLines).toMatchObject({
      detailCenterIds: [A],
      channel: "b2c",
      engine: null,
      serviceId: "lav",
    });
    expect(v.orderLines!.parent.value).toBe(500);
    const lvl = orderLinesLevel(
      ["A-01-000001", "A-01-000002"].map((folio, i) => ({
        detailCenterId: A,
        serviceOrderId: `o${i}`,
        folio,
        deliveredOn: "2026-09-10",
        channel: "b2c",
        engine: "recurrente",
        serviceId: "lav",
        serviceName: "Lavado",
        kind: "servicio" as const,
        quantity: 1,
        revenue: 250,
        standardCost: 80,
      })),
      v.orderLines!,
      () => "Centro A",
    );
    expect([lvl.sum, lvl.difference, lvl.rows[0]!.label]).toEqual([500, 0, "A-01-000001"]);
    const discount = drill({
      cardId: "ventas",
      center: A,
      dim: "motor",
      value: "descuento_os",
      service: "descuento_os",
    });
    expect(discount.orderLines).toMatchObject({ engine: "descuento_os", serviceId: null });
  });

  it("venta de productos: canal → producto", () => {
    const v = drill({ cardId: "venta_productos", center: A });
    expect(v.levels[0]!.rows.map((r) => [r.key, r.value])).toEqual([["b2c", 200]]);
    const p = drill({ cardId: "venta_productos", center: A, dim: "canal", value: "b2c" }).levels[0]!;
    expect(p.rows.map((r) => [r.key, r.value])).toEqual([["cera", 200]]);
    expect(p.difference).toBe(0);
  });

  it("EBITDA y margen: renglones del estado de resultados con sus movimientos", () => {
    const v = drill({ cardId: "ebitda", center: A });
    const lines = v.levels[0]!;
    expect(lines.kind).toBe("pnl");
    expect(lines.parent.value).toBe(390);
    expect(lines.rows.find((r) => r.key === "ebitda")!.value).toBe(390);
    expect(lines.rows.find((r) => r.key === "personnel")!.pnl).toEqual({
      section: "gasto",
      line: "personal",
      detailCenterIds: [A],
    });
  });

  it("KPIs no aditivos se explican por canal con la misma fórmula", () => {
    const v = drill({ cardId: "ticket", center: A });
    expect(v.levels[0]!.rows.map((r) => [r.key, r.value])).toEqual([
      ["b2c", 325],
      ["membresia", 0],
      ["b2b", 250],
    ]);
    expect([v.levels[0]!.additive, v.levels[0]!.difference]).toEqual([false, null]);
    expect(drill({ cardId: "membresias" }).levels[0]!.rows[0]!.next).toBeNull();
  });

  it("según permiso: sin permiso no hay detalle; servicios sólo con pnl.read", () => {
    expect(corporateDrill({ cardId: "ventas" }, facts, ctx({ allowedCenters: () => [] })).status).toBe(
      "forbidden",
    );
    expect(corporateDrill({ cardId: "nada" }, facts, ctx()).status).toBe("unknown");
    const soloA = drill(
      { cardId: "ventas", center: ALL_CENTERS },
      { allowedCenters: (c) => (c === "pnl.read" ? [A] : [A, B]) },
    );
    expect(soloA.levels[0]!.parent.value).toBe(1200);
    const foreign = drill({ cardId: "ventas", center: B }, { allowedCenters: () => [A] });
    expect(foreign.path).toEqual({ cardId: "ventas" });
  });
});
