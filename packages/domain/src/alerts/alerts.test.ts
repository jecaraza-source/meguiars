import { describe, expect, it } from "vitest";
import {
  alertConditionText,
  alertInboxParams,
  alertScopeText,
  can,
  filterAlertInbox,
  guardScreen,
  navScreenOf,
  openAlertCounts,
  parseAlertInboxFilters,
  presentAlert,
  presentAlertEvent,
  presentAlertRule,
  type AlertInstance,
  type AlertRule,
} from "../index";

const A = "aaaaaaaa-0000-0000-0000-000000000000";
const B = "bbbbbbbb-0000-0000-0000-000000000000";
const names = { [A]: "CDMX", [B]: "MTY" };
const alert = (over: Partial<AlertInstance> = {}): AlertInstance => ({
  id: "i1",
  organizationId: "o",
  ruleId: "r1",
  ruleName: "Venta diaria baja",
  metricId: "pnl.revenue",
  channel: null,
  condition: "below",
  threshold: 3000,
  severity: "atencion",
  scopeKey: A,
  detailCenterIds: [A],
  periodFrom: "2026-09-28",
  periodTo: "2026-09-28",
  previousFrom: null,
  previousTo: null,
  value: 660,
  previousValue: null,
  changePct: null,
  occurrences: 1,
  firstDetectedAt: "2026-09-29T12:00:00Z",
  lastDetectedAt: "2026-09-29T12:00:00Z",
  lastPeriodFrom: "2026-09-28",
  lastPeriodTo: "2026-09-28",
  lastValue: 660,
  conditionClearedAt: null,
  status: "nueva",
  reviewedAt: null,
  resolvedAt: null,
  resolutionNote: null,
  notifiedAt: null,
  ...over,
});

describe("permisos y navegación", () => {
  it("bandeja: admin, encargado y contador; revisar/resolver: admin y encargado; reglas: admin", () => {
    expect(["admin_socio", "encargado", "contador"].every((r) => can([r as never], "alerts.read"))).toBe(
      true,
    );
    expect(can(["operador_recepcion"], "alerts.read")).toBe(false);
    expect(can(["comercial_b2b"], "alerts.read")).toBe(false);
    expect(can(["contador"], "alerts.manage")).toBe(false);
    expect(can(["encargado"], "alerts.manage")).toBe(true);
    expect(can(["encargado"], "alerts.rules")).toBe(false);
    expect(can(["admin_socio"], "alerts.rules")).toBe(true);
    expect(navScreenOf("alertRules")).toBe("alerts");
    expect(guardScreen({ status: "signed_out" } as never, "alerts")).toEqual({
      allow: false,
      redirect: "login",
    });
  });
});

describe("bandeja", () => {
  const list = [
    alert({ id: "1", severity: "informativa", lastDetectedAt: "2026-09-29T13:00:00Z" }),
    alert({ id: "2", severity: "critica", scopeKey: B, detailCenterIds: [B] }),
    alert({ id: "3", status: "resuelta", severity: "critica" }),
    alert({ id: "4", status: "revisada", scopeKey: "conjunto", detailCenterIds: [A, B] }),
  ];
  it("filtros desde la URL (centro sólo si es permitido) y de vuelta", () => {
    const f = parseAlertInboxFilters({ estado: "todas", severidad: "critica", centro: B }, [A, B]);
    expect(f).toEqual({ status: "todas", severity: "critica", centerId: B });
    expect(alertInboxParams(f)).toEqual({ estado: "todas", severidad: "critica", centro: B });
    expect(parseAlertInboxFilters({ estado: "x", centro: "otro" }, [A])).toEqual({
      status: "abiertas",
      severity: null,
      centerId: null,
    });
  });
  it("abiertas por defecto; nuevas antes que revisadas, crítica primero; por centro incluye conjuntos", () => {
    const open = parseAlertInboxFilters({}, [A, B]);
    expect(filterAlertInbox(list, open).map((a) => a.id)).toEqual(["2", "1", "4"]);
    expect(filterAlertInbox(list, { ...open, status: "resuelta" }).map((a) => a.id)).toEqual(["3"]);
    expect(filterAlertInbox(list, { ...open, centerId: B }).map((a) => a.id)).toEqual(["2", "4"]);
    expect(openAlertCounts(list)).toEqual({ critica: 1, atencion: 1, informativa: 1, total: 3 });
  });
});

describe("presentación trazable", () => {
  it("condición según unidad", () => {
    expect(alertConditionText({ condition: "below", threshold: 3000 }, "currency")).toBe("< $3,000.00");
    expect(alertConditionText({ condition: "drop_pct", threshold: 15 }, "currency")).toBe(
      "cae ≥ 15 % vs periodo anterior",
    );
    expect(alertConditionText({ condition: "rise_pct", threshold: 5 }, "percent")).toBe(
      "sube ≥ 5 pts vs periodo anterior",
    );
    expect(alertConditionText({ condition: "no_data", threshold: null }, "count")).toBe("sin datos");
    expect(alertScopeText("conjunto", [A, B], names)).toBe("Conjunto: CDMX, MTY");
    expect(alertScopeText("corporativo", [A, B], names)).toBe("Corporativo");
  });
  it("alerta: valor, periodo y comparación que la originaron; repetición; condición superada", () => {
    const v = presentAlert(
      alert({
        condition: "drop_pct",
        threshold: 15,
        previousFrom: "2026-09-27",
        previousTo: "2026-09-27",
        previousValue: 1000,
        value: 800,
        changePct: -20,
        occurrences: 3,
        lastValue: 750,
        lastPeriodFrom: "2026-09-30",
        lastPeriodTo: "2026-09-30",
        conditionClearedAt: "2026-10-02T12:00:00Z",
      }),
      { metricName: "Ventas", unit: "currency", centerNames: names },
    );
    expect(v).toMatchObject({
      scope: "CDMX",
      severity: "Atención",
      severityTone: "warning",
      period: "28 sep 2026",
      value: "$800.00",
      previous: "$1,000.00 (27 sep 2026)",
      change: "−20 %",
      last: "$750.00 en 30 sep 2026",
      occurrences: "Detectada 3 veces",
      canReview: true,
      canResolve: true,
    });
    expect(v.cleared).not.toBeNull();
    expect(
      presentAlert(alert({ status: "resuelta" }), {
        metricName: "Ventas",
        unit: "currency",
        centerNames: names,
      }),
    ).toMatchObject({
      canReview: false,
      canResolve: false,
      cleared: null,
    });
    expect(
      presentAlert(alert({ value: null, condition: "no_data" }), {
        metricName: "V",
        unit: "count",
        centerNames: {},
      }),
    ).toMatchObject({
      value: "Sin datos",
      scope: "Centro sin acceso",
    });
  });
  it("historial y reglas", () => {
    expect(
      presentAlertEvent(
        {
          id: 1,
          instanceId: "i",
          kind: "repetida",
          actorId: null,
          note: null,
          value: 2450,
          periodFrom: "2026-10-03",
          periodTo: "2026-10-03",
          createdAt: "x",
        },
        "currency",
      ),
    ).toMatchObject({ label: "Se repitió", detail: "$2,450.00 · 3 oct 2026" });
    const rule: AlertRule = {
      id: "r",
      organizationId: "o",
      name: "Caída",
      description: null,
      metricId: "pnl.revenue",
      channel: "b2b",
      condition: "drop_pct",
      threshold: 15,
      period: "mes_en_curso",
      scopeKind: "corporativo",
      centerIds: null,
      severity: "critica",
      cooldownMinutes: 2880,
      active: true,
      version: 1,
      createdBy: null,
      updatedAt: "x",
    };
    expect(
      presentAlertRule(rule, { metricName: "Ventas", unit: "currency", centerNames: names }),
    ).toMatchObject({
      metric: "Ventas · B2B",
      period: "Mes en curso (hasta ayer)",
      scope: "Corporativo · Todos los centros",
      cooldown: "Cooldown 2 días",
      variation: true,
    });
    expect(presentAlertRule(rule, { metricName: "V", unit: "currency", centerNames: names }).warning).toMatch(
      /Sin autor/,
    );
    expect(
      presentAlertRule(
        { ...rule, cooldownMinutes: 90, createdBy: "u" },
        { metricName: "V", unit: "currency", centerNames: names },
      ),
    ).toMatchObject({
      cooldown: "Cooldown 1.5 h",
      warning: null,
    });
  });
});
