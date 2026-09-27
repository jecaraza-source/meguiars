import { describe, expect, it } from "vitest";
import {
  pipelineAvgCycleDays,
  pipelineByKind,
  pipelineConversionRate,
  pipelineCreated,
  pipelineFunnel,
  pipelineLost,
  pipelineOpenByStage,
  pipelineOpenValue,
  pipelineWeightedValue,
  pipelineWon,
  pipelineWonValue,
  type PipelineFact,
  type PipelineStageRef,
} from "./pipeline";

const stages: PipelineStageRef[] = [
  { id: "p", name: "Prospecto", kind: "abierta", position: 1, probability: 10 },
  { id: "c", name: "Contactado", kind: "abierta", position: 2, probability: 25 },
  { id: "n", name: "Negociación", kind: "abierta", position: 4, probability: 75 },
  { id: "g", name: "Ganado", kind: "ganada", position: 90, probability: 100 },
  { id: "x", name: "Perdido", kind: "perdida", position: 91, probability: 0 },
];

const fact = (f: Partial<PipelineFact>): PipelineFact => ({
  opportunityId: "o",
  detailCenterId: "A",
  kind: "b2b",
  createdOn: "2026-10-05",
  createdValue: 1000,
  outcome: null,
  closedOn: null,
  wonValue: null,
  currentValue: 1000,
  currentStageId: "p",
  stagesReached: ["p"],
  cycleDays: null,
  ...f,
});

// Hechos como los devuelve pipeline_metric_facts para octubre.
const facts = [
  fact({
    opportunityId: "won1",
    outcome: "ganada",
    closedOn: "2026-10-20",
    wonValue: 90_000,
    currentValue: 90_000,
    currentStageId: "g",
    stagesReached: ["p", "c", "n", "g"],
    cycleDays: 15,
  }),
  fact({
    opportunityId: "won2",
    kind: "b2c_premium",
    createdOn: "2026-09-20",
    outcome: "ganada",
    closedOn: "2026-10-02",
    wonValue: 11_000,
    currentValue: 11_000,
    currentStageId: "g",
    stagesReached: ["p", "g"],
    cycleDays: 12,
  }),
  fact({
    opportunityId: "lost",
    outcome: "perdida",
    closedOn: "2026-10-10",
    currentStageId: "x",
    stagesReached: ["p", "c", "x"],
  }),
  fact({ opportunityId: "open1", currentValue: 20_000, currentStageId: "c", stagesReached: ["p", "c"] }),
  fact({
    opportunityId: "open2",
    createdOn: "2026-09-01",
    currentValue: 40_000,
    currentStageId: "n",
    stagesReached: ["n"],
  }),
];
const input = { facts, from: "2026-10-01", to: "2026-10-31", stages };

describe("pipeline comercial", () => {
  it("oportunidades, cierres, conversión, valor ganado y ciclo promedio del rango", () => {
    expect(pipelineCreated.compute(input)).toBe(3);
    expect(pipelineWon.compute(input)).toBe(2);
    expect(pipelineLost.compute(input)).toBe(1);
    expect(pipelineConversionRate.compute(input)).toBe(66.67);
    expect(pipelineWonValue.compute(input)).toBe(101_000);
    expect(pipelineAvgCycleDays.compute(input)).toBe(13.5);
  });

  it("pipeline abierto y ponderado por la probabilidad de la etapa vigente", () => {
    expect(pipelineOpenValue.compute(input)).toBe(60_000);
    expect(pipelineWeightedValue.compute(input)).toBe(20_000 * 0.25 + 40_000 * 0.75);
    expect(pipelineOpenByStage(input).map((r) => [r.name, r.count, r.value])).toEqual([
      ["Prospecto", 0, 0],
      ["Contactado", 1, 20_000],
      ["Negociación", 1, 40_000],
    ]);
  });

  it("embudo: nuevas del rango que llegaron a cada etapa o más allá (perder no es avance)", () => {
    expect(pipelineFunnel(input).map((r) => [r.name, r.reached, r.percent])).toEqual([
      ["Prospecto", 3, 100],
      ["Contactado", 3, 100],
      ["Negociación", 1, 33.33],
      ["Ganado", 1, 33.33],
    ]);
  });

  it("sin cierres ni altas en el rango, todo es 0", () => {
    const empty = { ...input, from: "2027-01-01", to: "2027-01-31" };
    expect(pipelineConversionRate.compute(empty)).toBe(0);
    expect(pipelineAvgCycleDays.compute(empty)).toBe(0);
    expect(pipelineFunnel(empty).every((r) => r.percent === 0)).toBe(true);
  });

  it("por tipo", () => {
    const [b2b, b2c] = pipelineByKind(input);
    expect(b2b).toMatchObject({
      kind: "b2b",
      created: 3,
      won: 1,
      lost: 1,
      conversionRate: 50,
      wonValue: 90_000,
    });
    expect(b2c).toMatchObject({
      kind: "b2c_premium",
      created: 0,
      won: 1,
      wonValue: 11_000,
      avgCycleDays: 12,
    });
  });
});
