import { defineKpi, kpiRegistry } from "./kpi";

/**
 * Rentabilidad B2B (C3). Fuente: public.b2b_profitability_facts (por cuenta y
 * centro, sin datos personales): OS terminadas o entregadas en el rango
 * (ingreso = total con la tarifa convenida, costo = costo directo congelado) y
 * cuotas de paquete / iguala devengadas, asignadas al centro gestor.
 */
export interface B2bProfitabilityFact {
  accountId: string;
  accountName: string;
  detailCenterId: string;
  orders: number;
  revenue: number;
  cost: number;
  feeRevenue: number;
}

export interface B2bProfitabilityInput {
  facts: readonly B2bProfitabilityFact[];
}

const SOURCES = ["public.service_orders", "public.b2b_agreements", "public.b2b_accounts"] as const;
const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (facts: readonly B2bProfitabilityFact[], pick: (f: B2bProfitabilityFact) => number) =>
  round2(facts.reduce((t, f) => t + pick(f), 0));

export const b2bIncome = kpiRegistry.register(
  defineKpi<B2bProfitabilityInput>({
    id: "b2b.income",
    name: "Ingreso B2B",
    formula:
      "Σ total de OS B2B terminadas o entregadas en el rango + cuotas de paquete / iguala devengadas en el rango",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: ({ facts }) => sum(facts, (f) => f.revenue + f.feeRevenue),
  }),
);

export const b2bDirectCost = kpiRegistry.register(
  defineKpi<B2bProfitabilityInput>({
    id: "b2b.direct_cost",
    name: "Costo directo B2B",
    formula: "Σ costo directo congelado de las OS B2B terminadas o entregadas en el rango",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: ({ facts }) => sum(facts, (f) => f.cost),
  }),
);

export const b2bMargin = kpiRegistry.register(
  defineKpi<B2bProfitabilityInput>({
    id: "b2b.margin",
    name: "Margen B2B",
    formula: "Ingreso B2B − costo directo B2B",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (input) => round2(b2bIncome.compute(input) - b2bDirectCost.compute(input)),
  }),
);

export const b2bMarginPercent = kpiRegistry.register(
  defineKpi<B2bProfitabilityInput>({
    id: "b2b.margin_percent",
    name: "Margen B2B (%)",
    formula: "Margen B2B ÷ ingreso B2B × 100 (0 si no hay ingreso)",
    sources: SOURCES,
    unit: "percent",
    scopes: ["center", "corporate"],
    compute: (input) => {
      const income = b2bIncome.compute(input);
      return income === 0 ? 0 : round2((b2bMargin.compute(input) / income) * 100);
    },
  }),
);

export interface B2bProfitabilityRow {
  key: string;
  accountId: string;
  accountName: string;
  /** null = consolidado de la cuenta (todos los centros del rango). */
  detailCenterId: string | null;
  orders: number;
  income: number;
  cost: number;
  margin: number;
  marginPercent: number;
}

const row = (
  facts: readonly B2bProfitabilityFact[],
  accountId: string,
  accountName: string,
  detailCenterId: string | null,
): B2bProfitabilityRow => ({
  key: `${accountId}:${detailCenterId ?? "*"}`,
  accountId,
  accountName,
  detailCenterId,
  orders: facts.reduce((t, f) => t + f.orders, 0),
  income: b2bIncome.compute({ facts }),
  cost: b2bDirectCost.compute({ facts }),
  margin: b2bMargin.compute({ facts }),
  marginPercent: b2bMarginPercent.compute({ facts }),
});

/**
 * Rentabilidad por cuenta y centro, y consolidado por cuenta (si opera en más
 * de un centro), ordenada por margen descendente.
 */
export function b2bProfitability(facts: readonly B2bProfitabilityFact[]): {
  rows: B2bProfitabilityRow[];
  total: B2bProfitabilityRow;
} {
  const byAccount = new Map<string, B2bProfitabilityFact[]>();
  for (const f of facts) byAccount.set(f.accountId, [...(byAccount.get(f.accountId) ?? []), f]);
  const rows: B2bProfitabilityRow[] = [];
  const accounts = [...byAccount.values()].sort(
    (a, b) => b2bMargin.compute({ facts: b }) - b2bMargin.compute({ facts: a }),
  );
  for (const list of accounts) {
    const first = list[0]!;
    for (const f of list) rows.push(row([f], f.accountId, f.accountName, f.detailCenterId));
    if (list.length > 1) rows.push(row(list, first.accountId, first.accountName, null));
  }
  return { rows, total: row(facts, "*", "Total", null) };
}
