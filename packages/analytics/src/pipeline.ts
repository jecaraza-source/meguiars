import { defineKpi, kpiRegistry } from "./kpi";

/**
 * Pipeline comercial (C5). Fuente única: public.pipeline_metric_facts, que se
 * deriva SÓLO de public.opportunity_events (un hecho por oportunidad, sin
 * datos personales). Por eso las métricas se pueden reconstruir en cualquier
 * momento desde el historial.
 */
export interface PipelineFact {
  opportunityId: string;
  detailCenterId: string;
  kind: "b2b" | "b2c_premium";
  /** Fecha de alta (zona del centro). */
  createdOn: string;
  createdValue: number;
  /** Último cierre vigente (una "reabierta" lo anula). */
  outcome: "ganada" | "perdida" | null;
  closedOn: string | null;
  wonValue: number | null;
  currentValue: number;
  currentStageId: string | null;
  stagesReached: readonly string[];
  /** Días del alta al cierre (con decimales). */
  cycleDays: number | null;
}

export interface PipelineStageRef {
  id: string;
  name: string;
  kind: "abierta" | "ganada" | "perdida";
  position: number;
  probability: number;
}

export interface PipelineKpiInput {
  facts: readonly PipelineFact[];
  /** Rango inclusive (fechas YYYY-MM-DD). */
  from: string;
  to: string;
  stages?: readonly PipelineStageRef[];
}

const SOURCES = ["public.opportunity_events"] as const;
const round2 = (n: number) => Math.round(n * 100) / 100;
const inRange = (d: string | null, { from, to }: PipelineKpiInput) => d !== null && d >= from && d <= to;
const created = (i: PipelineKpiInput) => i.facts.filter((f) => inRange(f.createdOn, i));
const closed = (i: PipelineKpiInput, outcome: "ganada" | "perdida") =>
  i.facts.filter((f) => f.outcome === outcome && inRange(f.closedOn, i));
const open = (i: PipelineKpiInput) => i.facts.filter((f) => f.outcome === null);

export const pipelineCreated = kpiRegistry.register(
  defineKpi<PipelineKpiInput>({
    id: "pipeline.created",
    name: "Oportunidades nuevas",
    formula: "Oportunidades con evento «creada» en el rango",
    sources: SOURCES,
    unit: "count",
    scopes: ["center", "corporate"],
    compute: (i) => created(i).length,
  }),
);

export const pipelineWon = kpiRegistry.register(
  defineKpi<PipelineKpiInput>({
    id: "pipeline.won",
    name: "Ganadas",
    formula: "Oportunidades cuyo último cierre es «ganada» con fecha en el rango",
    sources: SOURCES,
    unit: "count",
    scopes: ["center", "corporate"],
    compute: (i) => closed(i, "ganada").length,
  }),
);

export const pipelineLost = kpiRegistry.register(
  defineKpi<PipelineKpiInput>({
    id: "pipeline.lost",
    name: "Perdidas",
    formula: "Oportunidades cuyo último cierre es «perdida» (no reabiertas) con fecha en el rango",
    sources: SOURCES,
    unit: "count",
    scopes: ["center", "corporate"],
    compute: (i) => closed(i, "perdida").length,
  }),
);

export const pipelineConversionRate = kpiRegistry.register(
  defineKpi<PipelineKpiInput>({
    id: "pipeline.conversion_rate",
    name: "Conversión",
    formula: "Ganadas ÷ (ganadas + perdidas) cerradas en el rango × 100 (0 sin cierres)",
    sources: SOURCES,
    unit: "percent",
    scopes: ["center", "corporate"],
    compute: (i) => {
      const won = pipelineWon.compute(i);
      const decided = won + pipelineLost.compute(i);
      return decided === 0 ? 0 : round2((won / decided) * 100);
    },
  }),
);

export const pipelineWonValue = kpiRegistry.register(
  defineKpi<PipelineKpiInput>({
    id: "pipeline.won_value",
    name: "Valor ganado",
    formula: "Σ valor del evento «ganada» de las oportunidades ganadas en el rango",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => round2(closed(i, "ganada").reduce((t, f) => t + (f.wonValue ?? 0), 0)),
  }),
);

export const pipelineAvgCycleDays = kpiRegistry.register(
  defineKpi<PipelineKpiInput>({
    id: "pipeline.avg_cycle_days",
    name: "Ciclo promedio (días)",
    formula: "Promedio de días entre «creada» y «ganada» de las ganadas en el rango (0 sin ganadas)",
    sources: SOURCES,
    unit: "ratio",
    scopes: ["center", "corporate"],
    compute: (i) => {
      const won = closed(i, "ganada");
      if (won.length === 0) return 0;
      return Math.round((won.reduce((t, f) => t + (f.cycleDays ?? 0), 0) / won.length) * 10) / 10;
    },
  }),
);

export const pipelineOpenValue = kpiRegistry.register(
  defineKpi<PipelineKpiInput>({
    id: "pipeline.open_value",
    name: "Pipeline abierto",
    formula: "Σ último valor registrado de las oportunidades sin cierre vigente",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => round2(open(i).reduce((t, f) => t + f.currentValue, 0)),
  }),
);

export const pipelineWeightedValue = kpiRegistry.register(
  defineKpi<PipelineKpiInput>({
    id: "pipeline.weighted_value",
    name: "Pipeline ponderado",
    formula: "Σ último valor × probabilidad de la etapa vigente ÷ 100 de las oportunidades abiertas",
    sources: [...SOURCES, "public.pipeline_stages"],
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => {
      const prob = new Map((i.stages ?? []).map((s) => [s.id, s.probability]));
      return round2(
        open(i).reduce((t, f) => t + (f.currentValue * (prob.get(f.currentStageId ?? "") ?? 0)) / 100, 0),
      );
    },
  }),
);

export interface FunnelRow {
  stageId: string;
  name: string;
  /** Oportunidades nuevas del rango que llegaron a esta etapa o a una posterior (incluido ganado). */
  reached: number;
  /** % respecto de las nuevas del rango. */
  percent: number;
}

/** Embudo de las oportunidades nuevas del rango (la etapa perdida no cuenta como avance). */
export function pipelineFunnel(i: PipelineKpiInput): FunnelRow[] {
  const stages = [...(i.stages ?? [])]
    .filter((s) => s.kind !== "perdida")
    .sort((a, b) => a.position - b.position);
  const position = new Map(stages.map((s) => [s.id, s.position]));
  const cohort = created(i);
  const furthest = cohort.map((f) => Math.max(0, ...f.stagesReached.map((id) => position.get(id) ?? 0)));
  return stages.map((s) => {
    const reached = furthest.filter((p) => p >= s.position).length;
    return {
      stageId: s.id,
      name: s.name,
      reached,
      percent: cohort.length === 0 ? 0 : round2((reached / cohort.length) * 100),
    };
  });
}

export interface OpenStageRow {
  stageId: string;
  name: string;
  count: number;
  value: number;
}

/** Abiertas por etapa vigente (según el último evento con etapa). */
export function pipelineOpenByStage(i: PipelineKpiInput): OpenStageRow[] {
  return [...(i.stages ?? [])]
    .filter((s) => s.kind === "abierta")
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const list = open(i).filter((f) => f.currentStageId === s.id);
      return {
        stageId: s.id,
        name: s.name,
        count: list.length,
        value: round2(list.reduce((t, f) => t + f.currentValue, 0)),
      };
    });
}

/** Resumen por tipo (B2B / B2C premium). */
export function pipelineByKind(i: PipelineKpiInput) {
  return (["b2b", "b2c_premium"] as const).map((kind) => {
    const sub = { ...i, facts: i.facts.filter((f) => f.kind === kind) };
    return {
      kind,
      created: pipelineCreated.compute(sub),
      won: pipelineWon.compute(sub),
      lost: pipelineLost.compute(sub),
      conversionRate: pipelineConversionRate.compute(sub),
      wonValue: pipelineWonValue.compute(sub),
      avgCycleDays: pipelineAvgCycleDays.compute(sub),
    };
  });
}
