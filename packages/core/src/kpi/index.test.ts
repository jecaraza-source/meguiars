import { describe, expect, it } from "vitest";
import { defineKpi, KpiRegistry } from ".";

const sample = () =>
  defineKpi<{ done: number; total: number }>({
    id: "test.completion_rate",
    name: "Tasa de cumplimiento",
    formula: "done / total × 100 (0 si total = 0)",
    sources: ["public.example"],
    unit: "percent",
    compute: ({ done, total }) => (total === 0 ? 0 : (done / total) * 100),
  });

describe("kpi", () => {
  it("calcula con la fórmula declarada", () => {
    const kpi = sample();
    expect(kpi.compute({ done: 3, total: 4 })).toBe(75);
    expect(kpi.compute({ done: 0, total: 0 })).toBe(0);
  });

  it("exige id con namespace y fuente de datos", () => {
    expect(() => defineKpi({ ...sample(), id: "SinNamespace" })).toThrow();
    expect(() => defineKpi({ ...sample(), sources: [] })).toThrow();
  });

  it("no permite ids duplicados en el registro", () => {
    const registry = new KpiRegistry();
    registry.register(sample());
    expect(() => registry.register(sample())).toThrow(/duplicado/);
    expect(registry.list()).toHaveLength(1);
  });
});
