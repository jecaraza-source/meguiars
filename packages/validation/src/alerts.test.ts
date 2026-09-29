import { describe, expect, it } from "vitest";
import { alertResolveSchema, alertReviewSchema, alertRuleSchema } from "./alerts";

const ORG = "0e000000-0000-4000-8000-000000000001";
const A = "aaaaaaaa-0000-4000-8000-000000000000";
const B = "bbbbbbbb-0000-4000-8000-000000000000";
const base = {
  organizationId: ORG,
  id: "",
  version: "",
  name: "Venta diaria baja",
  description: "",
  metricId: "pnl.revenue",
  channel: "",
  condition: "below",
  threshold: "3000",
  period: "dia",
  scopeKind: "centro",
  centerIds: [A],
  severity: "atencion",
  cooldownMinutes: "1440",
  active: "on",
  reason: "Nueva regla de Dirección",
};
const issues = (input: object) => {
  const r = alertRuleSchema.safeParse({ ...base, ...input });
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("regla de alerta", () => {
  it("normaliza el formulario (vacíos, números, casilla, un solo centro)", () => {
    const r = alertRuleSchema.parse({ ...base, centerIds: A });
    expect(r).toMatchObject({
      id: null,
      version: null,
      description: null,
      channel: null,
      threshold: 3000,
      centerIds: [A],
      cooldownMinutes: 1440,
      active: true,
    });
    expect(alertRuleSchema.parse({ ...base, active: undefined }).active).toBe(false);
  });
  it("umbral según la condición", () => {
    expect(issues({ condition: "no_data" })).toEqual(["threshold: La ausencia de dato no lleva umbral"]);
    expect(issues({ condition: "no_data", threshold: "" })).toEqual([]);
    expect(issues({ threshold: "" })).toEqual(["threshold: Indica el umbral"]);
    expect(issues({ condition: "drop_pct", threshold: "0" })).toEqual([
      "threshold: La variación debe ser mayor que 0",
    ]);
  });
  it("ámbito: centro ≥ 1, conjunto ≥ 2, corporativo sin centros", () => {
    expect(issues({ centerIds: [] })).toEqual(["centerIds: Elige al menos un centro"]);
    expect(issues({ scopeKind: "conjunto" })).toEqual([
      "centerIds: Un conjunto necesita al menos dos centros",
    ]);
    expect(issues({ scopeKind: "conjunto", centerIds: [A, A] })).toEqual(["centerIds: Centros repetidos"]);
    expect(alertRuleSchema.parse({ ...base, scopeKind: "conjunto", centerIds: [A, B] }).centerIds).toEqual([
      A,
      B,
    ]);
    expect(alertRuleSchema.parse({ ...base, scopeKind: "corporativo", centerIds: [A] }).centerIds).toBeNull();
  });
  it("cooldown, severidad, versión y motivo", () => {
    expect(issues({ cooldownMinutes: "50000" })).toEqual(["cooldownMinutes: Máximo 30 días"]);
    expect(issues({ severity: "alta" })).toEqual(["severity: Elige una severidad"]);
    expect(issues({ id: A })).toEqual(["version: Falta la versión de la regla"]);
    expect(issues({ reason: "" }).length).toBe(1);
  });
});

describe("revisar y resolver", () => {
  it("resolver exige nota; revisar no", () => {
    expect(alertResolveSchema.safeParse({ id: A, note: " " }).success).toBe(false);
    expect(alertResolveSchema.parse({ id: A, note: " Se habló con el encargado " }).note).toBe(
      "Se habló con el encargado",
    );
    expect(alertReviewSchema.parse({ id: A, note: "" }).note).toBeNull();
  });
});
