import { describe, expect, it } from "vitest";
import type { DashboardFacts, PnlBucketFact } from "../dashboards/catalog";
import {
  alertLinks,
  alertScopes,
  alertWindow,
  evaluateAlertScope,
  metricHasData,
  runAlertEvaluation,
  type AlertRuleLike,
  type AlertRunPort,
} from "./index";
import { metricById } from "../dashboards/catalog";

const A = "aaaaaaaa-0000-0000-0000-000000000000";
const B = "bbbbbbbb-0000-0000-0000-000000000000";
const ORG = "0e000000-0000-0000-0000-000000000001";
const pnl = (
  center: string,
  section: PnlBucketFact["section"],
  line: string,
  dimension: string | null,
  amount: number,
): PnlBucketFact => ({
  detailCenterId: center,
  bucket: "2026-09-28",
  section,
  line,
  dimension,
  amount,
  movements: 1,
});
const facts = (rows: PnlBucketFact[], extra: Partial<DashboardFacts> = {}): DashboardFacts => ({
  from: "2026-09-28",
  to: "2026-09-28",
  grain: "total",
  pnl: rows,
  ...extra,
});
const rule = (over: Partial<AlertRuleLike> = {}): AlertRuleLike => ({
  id: "r1",
  organizationId: ORG,
  metricId: "pnl.revenue",
  channel: null,
  condition: "below",
  threshold: 1000,
  period: "dia",
  scopeKind: "centro",
  centerIds: [A, B],
  active: true,
  ...over,
});
const win = alertWindow("dia", "2026-09-29");

describe("ventana evaluada", () => {
  it("día, semana, mes en curso y mes (periodos cerrados o hasta ayer)", () => {
    expect(alertWindow("dia", "2026-09-29")).toEqual({
      from: "2026-09-28",
      to: "2026-09-28",
      previousFrom: "2026-09-27",
      previousTo: "2026-09-27",
    });
    // 29 sep 2026 es martes: semana anterior lunes 21 a domingo 27.
    expect(alertWindow("semana", "2026-09-29")).toEqual({
      from: "2026-09-21",
      to: "2026-09-27",
      previousFrom: "2026-09-14",
      previousTo: "2026-09-20",
    });
    expect(alertWindow("mes_en_curso", "2026-09-29")).toEqual({
      from: "2026-09-01",
      to: "2026-09-28",
      previousFrom: "2026-08-01",
      previousTo: "2026-08-28",
    });
    expect(alertWindow("mes_en_curso", "2026-10-01")).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    expect(alertWindow("mes", "2026-03-15")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
      previousFrom: "2026-01-01",
      previousTo: "2026-01-31",
    });
  });
});

describe("ámbitos", () => {
  it("cada centro, conjunto consolidado o corporativo (sólo centros de la organización)", () => {
    expect(alertScopes(rule(), [A, B])).toEqual([
      { key: A, centerIds: [A] },
      { key: B, centerIds: [B] },
    ]);
    expect(alertScopes(rule({ scopeKind: "conjunto" }), [A, B])).toEqual([
      { key: "conjunto", centerIds: [A, B] },
    ]);
    expect(alertScopes(rule({ scopeKind: "corporativo", centerIds: null }), [A, B])).toEqual([
      { key: "corporativo", centerIds: [A, B] },
    ]);
    expect(alertScopes(rule({ centerIds: [A, "otro"] }), [A, B])).toEqual([{ key: A, centerIds: [A] }]);
  });
});

describe("condiciones", () => {
  const f = facts([
    pnl(A, "ingreso", "b2c", "recurrente", 800),
    pnl(B, "ingreso", "b2b", "recurrente", 1500),
    pnl(B, "gasto", "personal", null, 300),
  ]);

  it("por debajo / encima de umbral, con el valor y periodo para rastrearla", () => {
    const a = evaluateAlertScope(rule(), { key: A, centerIds: [A] }, win, f, null);
    expect(a).toMatchObject({
      scopeKey: A,
      triggered: true,
      value: 800,
      periodFrom: "2026-09-28",
      periodTo: "2026-09-28",
      previousFrom: null,
    });
    expect(evaluateAlertScope(rule(), { key: B, centerIds: [B] }, win, f, null).triggered).toBe(false);
    expect(
      evaluateAlertScope(
        rule({ condition: "above", threshold: 1200 }),
        { key: B, centerIds: [B] },
        win,
        f,
        null,
      ),
    ).toMatchObject({ triggered: true, value: 1500 });
    expect(
      evaluateAlertScope(
        rule({ scopeKind: "conjunto" }),
        { key: "conjunto", centerIds: [A, B] },
        win,
        f,
        null,
      ),
    ).toMatchObject({ triggered: false, value: 2300 });
  });

  it("variación porcentual contra el periodo anterior (sin base no alerta)", () => {
    const prev = facts([pnl(A, "ingreso", "b2c", "recurrente", 1000)]);
    const drop = evaluateAlertScope(
      rule({ condition: "drop_pct", threshold: 15 }),
      { key: A, centerIds: [A] },
      win,
      f,
      prev,
    );
    expect(drop).toMatchObject({
      triggered: true,
      value: 800,
      previousValue: 1000,
      changePct: -20,
      previousFrom: "2026-09-27",
    });
    expect(
      evaluateAlertScope(
        rule({ condition: "drop_pct", threshold: 25 }),
        { key: A, centerIds: [A] },
        win,
        f,
        prev,
      ).triggered,
    ).toBe(false);
    expect(
      evaluateAlertScope(
        rule({ condition: "rise_pct", threshold: 10 }),
        { key: A, centerIds: [A] },
        win,
        prev,
        f,
      ),
    ).toMatchObject({ triggered: true, changePct: 25 });
    expect(
      evaluateAlertScope(
        rule({ condition: "drop_pct", threshold: 15 }),
        { key: B, centerIds: [B] },
        win,
        f,
        prev,
      ),
    ).toMatchObject({
      triggered: false,
      note: "Sin base en el periodo anterior",
    });
  });

  it("porcentajes: la variación es en puntos", () => {
    const prev = facts([
      pnl(A, "ingreso", "b2c", "recurrente", 1000),
      pnl(A, "costo_directo", "estandar", "recurrente", 300),
    ]);
    const cur = facts([
      pnl(A, "ingreso", "b2c", "recurrente", 1000),
      pnl(A, "costo_directo", "estandar", "recurrente", 500),
    ]);
    expect(
      evaluateAlertScope(
        rule({ metricId: "pnl.gross_margin", condition: "drop_pct", threshold: 10 }),
        { key: A, centerIds: [A] },
        win,
        cur,
        prev,
      ),
    ).toMatchObject({
      triggered: true,
      value: 50,
      previousValue: 70,
      changePct: -20,
    });
  });

  it("ausencia de dato: sin hechos del KPI (con canal fijo, sólo ingresos de ese canal)", () => {
    const noData = rule({ condition: "no_data", threshold: null, channel: "b2b" });
    expect(evaluateAlertScope(noData, { key: A, centerIds: [A] }, win, f, null)).toMatchObject({
      triggered: true,
      value: null,
      hasData: false,
    });
    expect(evaluateAlertScope(noData, { key: B, centerIds: [B] }, win, f, null)).toMatchObject({
      triggered: false,
      value: 1500,
      hasData: true,
    });
    const onlyExpenses = facts([pnl(A, "gasto", "personal", null, 300)]);
    expect(metricHasData(metricById("pnl.revenue")!, onlyExpenses, [A], "b2b")).toBe(false);
    const orders = rule({ metricId: "orders.vehicles_served", condition: "no_data", threshold: null });
    expect(
      evaluateAlertScope(orders, { key: A, centerIds: [A] }, win, facts([], { orders: [] }), null).triggered,
    ).toBe(true);
  });
});

describe("evaluación completa", () => {
  const port = () => {
    const calls: { kind: string; args: unknown[] }[] = [];
    const p: AlertRunPort = {
      startRun: async (...args) => (calls.push({ kind: "start", args }), "run-1"),
      finishRun: async (...args) => void calls.push({ kind: "finish", args }),
      facts: async (...args) => {
        calls.push({ kind: "facts", args });
        const q = args[1];
        return q.from === "2026-09-28"
          ? facts([pnl(A, "ingreso", "b2c", "recurrente", 800), pnl(B, "ingreso", "b2c", "recurrente", 1500)])
          : facts([
              pnl(A, "ingreso", "b2c", "recurrente", 1000),
              pnl(B, "ingreso", "b2c", "recurrente", 1500),
            ]);
      },
      record: async (...args) => {
        calls.push({ kind: "record", args });
        const results = args[2];
        return { created: results.filter((r) => r.triggered).map((r) => `alert-${r.scopeKey}`) };
      },
      notify: async (...args) => void calls.push({ kind: "notify", args }),
    };
    return { p, calls };
  };

  it("una lectura por regla y ventana; registra por ámbito; notifica las nuevas; cierra la corrida", async () => {
    const { p, calls } = port();
    const s = await runAlertEvaluation({
      organizationId: ORG,
      source: "cron",
      today: "2026-09-29",
      orgCenterIds: [A, B],
      rules: [
        rule(),
        rule({ id: "r2", condition: "drop_pct", threshold: 5, scopeKind: "conjunto" }),
        rule({ id: "r3", active: false }),
      ],
      port: p,
    });
    expect(s).toMatchObject({
      runId: "run-1",
      rulesEvaluated: 2,
      created: [`alert-${A}`, "alert-conjunto"],
      errors: [],
    });
    expect(calls.filter((c) => c.kind === "facts")).toHaveLength(3);
    expect(calls.find((c) => c.kind === "facts")!.args[1]).toEqual({
      sources: ["pnl"],
      detailCenterIds: [A, B],
      from: "2026-09-28",
      to: "2026-09-28",
    });
    expect(calls.filter((c) => c.kind === "notify").map((c) => c.args)).toEqual([
      ["r1", [`alert-${A}`]],
      ["r2", ["alert-conjunto"]],
    ]);
    expect(calls.at(-1)).toEqual({ kind: "finish", args: ["run-1", 2, null] });
  });

  it("un error en una regla no detiene las demás y queda en la bitácora", async () => {
    const { p, calls } = port();
    const failing: AlertRunPort = {
      ...p,
      facts: async (rule, q) =>
        rule.id === "r1" ? Promise.reject(new Error("sin permiso")) : p.facts(rule, q),
    };
    const s = await runAlertEvaluation({
      organizationId: ORG,
      source: "manual",
      today: "2026-09-29",
      orgCenterIds: [A, B],
      rules: [rule(), rule({ id: "r2" })],
      port: failing,
    });
    expect(s.errors).toEqual([{ ruleId: "r1", message: "sin permiso" }]);
    expect(s.rulesEvaluated).toBe(1);
    expect(calls.at(-1)).toEqual({ kind: "finish", args: ["run-1", 1, "r1: sin permiso"] });
  });
});

describe("enlaces al dato que originó la alerta", () => {
  const base = {
    metricId: "pnl.revenue",
    channel: null,
    scopeKey: A,
    detailCenterIds: [A],
    periodFrom: "2026-09-28",
    periodTo: "2026-09-28",
  };
  it("KPI en el mismo periodo y centro, y drill de la tarjeta corporativa en ese centro", () => {
    const l = alertLinks(base, [A, B]);
    expect(l.kpis).toBe(
      `/direccion/kpis?periodo=personalizado&desde=2026-09-28&hasta=2026-09-28&centros=${A}`,
    );
    expect(l.drill).toBe(
      `/direccion/detalle?periodo=personalizado&desde=2026-09-28&hasta=2026-09-28&centros=${A}&tarjeta=ventas&centro=${A}`,
    );
  });
  it("canal fijo → tarjeta de ese canal; KPI sin tarjeta → sólo KPIs; corporativo sin centro en la ruta", () => {
    expect(alertLinks({ ...base, channel: "b2b" }, [A, B]).drill).toContain("tarjeta=venta_b2b");
    expect(alertLinks({ ...base, metricId: "payments.collected" }, [A, B]).drill).toBeNull();
    const corp = alertLinks({ ...base, scopeKey: "corporativo", detailCenterIds: [A, B] }, [A, B]);
    expect(corp.kpis).toBe("/direccion/kpis?periodo=personalizado&desde=2026-09-28&hasta=2026-09-28");
    expect(corp.drill).toBe(
      "/direccion/detalle?periodo=personalizado&desde=2026-09-28&hasta=2026-09-28&tarjeta=ventas",
    );
  });
});
