import { defineKpi, kpiRegistry } from "./kpi";

/**
 * Conversión de recomendaciones (C4). Fuente: public.upsell_metric_facts (por
 * regla y centro, sin datos personales). Una oferta = una sugerencia mostrada en
 * una OS (una vez por regla y OS).
 */
export interface UpsellFact {
  ruleId: string;
  ruleName: string;
  detailCenterId: string;
  targetKind: "servicio" | "membresia";
  offered: number;
  accepted: number;
  rejected: number;
  orders: number;
  incrementalRevenue: number;
  membershipValue: number;
}

export interface UpsellKpiInput {
  facts: readonly UpsellFact[];
}

const SOURCES = ["public.upsell_offers", "public.service_order_items", "public.service_orders"] as const;
const round2 = (n: number) => Math.round(n * 100) / 100;
const total = (facts: readonly UpsellFact[], pick: (f: UpsellFact) => number) =>
  facts.reduce((t, f) => t + pick(f), 0);

export const upsellOffered = kpiRegistry.register(
  defineKpi<UpsellKpiInput>({
    id: "upsell.offered",
    name: "Sugerencias ofrecidas",
    formula: "Sugerencias mostradas en OS del rango (una por regla y OS)",
    sources: SOURCES,
    unit: "count",
    scopes: ["center", "corporate"],
    compute: ({ facts }) => total(facts, (f) => f.offered),
  }),
);

export const upsellAcceptanceRate = kpiRegistry.register(
  defineKpi<UpsellKpiInput>({
    id: "upsell.acceptance_rate",
    name: "Tasa de aceptación",
    formula: "Sugerencias aceptadas ÷ sugerencias ofrecidas × 100 (0 sin ofertas)",
    sources: SOURCES,
    unit: "percent",
    scopes: ["center", "corporate"],
    compute: ({ facts }) => {
      const offered = total(facts, (f) => f.offered);
      return offered === 0 ? 0 : round2((total(facts, (f) => f.accepted) / offered) * 100);
    },
  }),
);

export const upsellIncrementalRevenue = kpiRegistry.register(
  defineKpi<UpsellKpiInput>({
    id: "upsell.incremental_revenue",
    name: "Ingreso incremental",
    formula:
      "Σ valor vigente (subtotal − descuentos) de las líneas agregadas al aceptar, en OS no canceladas; " +
      "una línea quitada después aporta $0",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: ({ facts }) => round2(total(facts, (f) => f.incrementalRevenue)),
  }),
);

export const upsellMembershipValue = kpiRegistry.register(
  defineKpi<UpsellKpiInput>({
    id: "upsell.membership_value",
    name: "Membresías aceptadas (valor)",
    formula:
      "Σ precio del plan de las sugerencias de membresía aceptadas (intención; la venta se registra en Membresías)",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: ({ facts }) => round2(total(facts, (f) => f.membershipValue)),
  }),
);

export const upsellIncrementPerOrder = kpiRegistry.register(
  defineKpi<UpsellKpiInput>({
    id: "upsell.increment_per_order",
    name: "Incremento por OS con sugerencias",
    formula: "Ingreso incremental ÷ OS con al menos una sugerencia (por regla y centro)",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (input) => {
      const orders = total(input.facts, (f) => f.orders);
      return orders === 0 ? 0 : round2(upsellIncrementalRevenue.compute(input) / orders);
    },
  }),
);

export interface UpsellRuleRow {
  ruleId: string;
  ruleName: string;
  targetKind: "servicio" | "membresia";
  offered: number;
  accepted: number;
  rejected: number;
  acceptanceRate: number;
  incrementalRevenue: number;
  membershipValue: number;
}

/** Conversión por regla (todos los centros del rango), ordenada por ingreso. */
export function upsellByRule(facts: readonly UpsellFact[]): UpsellRuleRow[] {
  const byRule = new Map<string, UpsellFact[]>();
  for (const f of facts) byRule.set(f.ruleId, [...(byRule.get(f.ruleId) ?? []), f]);
  return [...byRule.values()]
    .map((list) => ({
      ruleId: list[0]!.ruleId,
      ruleName: list[0]!.ruleName,
      targetKind: list[0]!.targetKind,
      offered: total(list, (f) => f.offered),
      accepted: total(list, (f) => f.accepted),
      rejected: total(list, (f) => f.rejected),
      acceptanceRate: upsellAcceptanceRate.compute({ facts: list }),
      incrementalRevenue: upsellIncrementalRevenue.compute({ facts: list }),
      membershipValue: upsellMembershipValue.compute({ facts: list }),
    }))
    .sort((a, b) => b.incrementalRevenue + b.membershipValue - (a.incrementalRevenue + a.membershipValue));
}
