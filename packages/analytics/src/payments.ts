import { defineKpi, kpiRegistry } from "./kpi";

/**
 * KPIs de cobranza (AF1). Fuente: public.payment_facts (por centro, día y forma
 * de pago; sin datos personales) y public.sales_reconciliation. La venta es la
 * OS: estos KPIs miden sólo la cobranza de ese total. Las fórmulas viven sólo
 * aquí; web, móvil y reportes usan estas funciones.
 */
export interface PaymentFactInput {
  day: string;
  method: string;
  methodName: string;
  /** Entra a caja o banco (efectivo, tarjeta, transferencia). */
  collectsCash: boolean;
  validAmount: number;
  validCount: number;
  reversedAmount: number;
  reversedCount: number;
  changeAmount: number;
}

export interface PaymentKpiInput {
  facts: readonly PaymentFactInput[];
}

export interface ReconciliationInput {
  deliveredOrders: number;
  salesTotal: number;
  collectedForSales: number;
  pendingForSales: number;
  collectedInRange: number;
  cashInRange: number;
  reversedInRange: number;
}

const SOURCES = ["public.payments", "public.payment_tenders", "public.payment_reversals"] as const;
const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (facts: readonly PaymentFactInput[], pick: (f: PaymentFactInput) => number) =>
  round2(facts.reduce((acc, f) => acc + pick(f), 0));

export const paymentsCollected = kpiRegistry.register(
  defineKpi<PaymentKpiInput>({
    id: "payments.collected",
    name: "Cobrado",
    formula: "Σ formas de pago de recibos válidos del periodo (sin recibos revertidos)",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: ({ facts }) => sum(facts, (f) => f.validAmount),
  }),
);

export const paymentsCashIn = kpiRegistry.register(
  defineKpi<PaymentKpiInput>({
    id: "payments.cash_in",
    name: "En caja y banco",
    formula: "Cobrado válido en efectivo, tarjeta y transferencia (el cambio entregado ya está descontado)",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: ({ facts }) => sum(facts, (f) => (f.collectsCash ? f.validAmount : 0)),
  }),
);

export const paymentsNonCash = kpiRegistry.register(
  defineKpi<PaymentKpiInput>({
    id: "payments.non_cash_settled",
    name: "Liquidado sin efectivo",
    formula: "Cobrado válido con membresía o crédito B2B (no entra a caja)",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: ({ facts }) => sum(facts, (f) => (f.collectsCash ? 0 : f.validAmount)),
  }),
);

export const paymentsReversed = kpiRegistry.register(
  defineKpi<PaymentKpiInput>({
    id: "payments.reversed",
    name: "Reversos",
    formula: "Σ importes de recibos del periodo que quedaron revertidos",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: ({ facts }) => sum(facts, (f) => f.reversedAmount),
  }),
);

export const paymentsChangeGiven = kpiRegistry.register(
  defineKpi<PaymentKpiInput>({
    id: "payments.change_given",
    name: "Cambio entregado",
    formula: "Σ (efectivo recibido − efectivo cobrado) de recibos válidos",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: ({ facts }) => sum(facts, (f) => f.changeAmount),
  }),
);

export interface MethodRow {
  method: string;
  name: string;
  collectsCash: boolean;
  amount: number;
  count: number;
  reversed: number;
  share: number;
}

/** Desglose por forma de pago (participación sobre lo cobrado). */
export function paymentsByMethod({ facts }: PaymentKpiInput): MethodRow[] {
  const total = paymentsCollected.compute({ facts });
  const rows = new Map<string, MethodRow>();
  for (const f of facts) {
    const row = rows.get(f.method) ?? {
      method: f.method,
      name: f.methodName,
      collectsCash: f.collectsCash,
      amount: 0,
      count: 0,
      reversed: 0,
      share: 0,
    };
    row.amount = round2(row.amount + f.validAmount);
    row.count += f.validCount;
    row.reversed = round2(row.reversed + f.reversedAmount);
    rows.set(f.method, row);
  }
  return [...rows.values()].map((r) => ({ ...r, share: total > 0 ? round2((r.amount * 100) / total) : 0 }));
}

export const paymentsCollectionRate = kpiRegistry.register(
  defineKpi<{ rows: readonly ReconciliationInput[] }>({
    id: "payments.collection_rate",
    name: "Ventas cobradas",
    formula: "Cobrado aplicado a las OS entregadas del periodo ÷ total de esas OS × 100",
    sources: ["public.service_orders", "public.payment_allocations"],
    unit: "percent",
    scopes: ["center", "corporate"],
    compute: ({ rows }) => {
      const sales = rows.reduce((a, r) => a + r.salesTotal, 0);
      const paid = rows.reduce((a, r) => a + r.collectedForSales, 0);
      return sales > 0 ? round2((paid * 100) / sales) : 0;
    },
  }),
);

/** Consolida la conciliación de varios centros. */
export function consolidateReconciliation(rows: readonly ReconciliationInput[]): ReconciliationInput {
  const add = (pick: (r: ReconciliationInput) => number) => round2(rows.reduce((a, r) => a + pick(r), 0));
  return {
    deliveredOrders: rows.reduce((a, r) => a + r.deliveredOrders, 0),
    salesTotal: add((r) => r.salesTotal),
    collectedForSales: add((r) => r.collectedForSales),
    pendingForSales: add((r) => r.pendingForSales),
    collectedInRange: add((r) => r.collectedInRange),
    cashInRange: add((r) => r.cashInRange),
    reversedInRange: add((r) => r.reversedInRange),
  };
}
