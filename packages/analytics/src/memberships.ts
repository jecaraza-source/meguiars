import { defineKpi, kpiRegistry } from "./kpi";

/**
 * KPIs de membresías (C1). Fuente: public.membership_metric_facts (un hecho
 * por membresía, sin datos personales), evaluado al corte `to`. Las fórmulas
 * viven sólo aquí; web, móvil y reportes usan estas funciones.
 */
export interface MembershipFact {
  status: "activa" | "proxima_a_vencer" | "vencida" | "suspendida" | "cancelada";
  price: number;
  periodMonths: number;
  entitledUnits: number;
  usedUnits: number;
  newInRange: boolean;
  renewalsInRange: number;
  cancelledInRange: boolean;
  expiredInRange: boolean;
  revenueInRange: number;
}

export interface MembershipKpiInput {
  facts: readonly MembershipFact[];
  /** Rango (YYYY-MM-DD, inclusivo). */
  from: string;
  to: string;
}

const SOURCES = ["public.memberships", "public.membership_events", "public.membership_redemptions"] as const;
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Activa o próxima a vencer al corte (suspendidas, vencidas y canceladas no cuentan). */
const isActive = (f: MembershipFact) => f.status === "activa" || f.status === "proxima_a_vencer";
const days = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
/** Meses promedio del rango (30.4375 días por mes). */
export const rangeMonths = (from: string, to: string) => Math.max(0, days(from, to)) / 30.4375;

export const membershipActiveCount = kpiRegistry.register(
  defineKpi<MembershipKpiInput>({
    id: "membership.active_count",
    name: "Membresías activas",
    formula: "Membresías activas o próximas a vencer al corte (sin suspendidas, vencidas ni canceladas)",
    sources: SOURCES,
    unit: "count",
    scopes: ["center", "corporate"],
    compute: ({ facts }) => facts.filter(isActive).length,
  }),
);

export const membershipNewCount = kpiRegistry.register(
  defineKpi<MembershipKpiInput>({
    id: "membership.new_count",
    name: "Altas",
    formula: "Membresías con evento de alta dentro del rango",
    sources: SOURCES,
    unit: "count",
    scopes: ["center", "corporate"],
    compute: ({ facts }) => facts.filter((f) => f.newInRange).length,
  }),
);

export const membershipChurnCount = kpiRegistry.register(
  defineKpi<MembershipKpiInput>({
    id: "membership.churn_count",
    name: "Bajas",
    formula: "Cancelaciones en el rango + membresías que vencieron en el rango y no se renovaron al corte",
    sources: SOURCES,
    unit: "count",
    scopes: ["center", "corporate"],
    compute: ({ facts }) => facts.filter((f) => f.cancelledInRange || f.expiredInRange).length,
  }),
);

export const membershipRenewalCount = kpiRegistry.register(
  defineKpi<MembershipKpiInput>({
    id: "membership.renewal_count",
    name: "Renovaciones",
    formula: "Eventos de renovación dentro del rango",
    sources: SOURCES,
    unit: "count",
    scopes: ["center", "corporate"],
    compute: ({ facts }) => facts.reduce((t, f) => t + f.renewalsInRange, 0),
  }),
);

export const membershipMrr = kpiRegistry.register(
  defineKpi<MembershipKpiInput>({
    id: "membership.mrr",
    name: "MRR",
    formula:
      "Σ (precio congelado del periodo ÷ meses del periodo) de las membresías activas o próximas a vencer al corte. " +
      "Ej.: mensual $849 aporta $849; trimestral $3,900 aporta $1,300. Suspendidas, vencidas y canceladas aportan $0.",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: ({ facts }) => round2(facts.filter(isActive).reduce((t, f) => t + f.price / f.periodMonths, 0)),
  }),
);

export const membershipArpm = kpiRegistry.register(
  defineKpi<MembershipKpiInput>({
    id: "membership.arpm",
    name: "Ingreso promedio por miembro",
    formula: "MRR ÷ membresías activas (0 si no hay activas)",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (input) => {
      const active = membershipActiveCount.compute(input);
      return active === 0 ? 0 : round2(membershipMrr.compute(input) / active);
    },
  }),
);

export const membershipRedeemedUnits = kpiRegistry.register(
  defineKpi<MembershipKpiInput>({
    id: "membership.redeemed_units",
    name: "Uso (servicios redimidos)",
    formula: "Unidades redimidas (no anuladas) dentro del rango",
    sources: SOURCES,
    unit: "count",
    scopes: ["center", "corporate"],
    compute: ({ facts }) => facts.reduce((t, f) => t + f.usedUnits, 0),
  }),
);

export const membershipUsageRate = kpiRegistry.register(
  defineKpi<MembershipKpiInput>({
    id: "membership.usage_rate",
    name: "Tasa de uso",
    formula:
      "Unidades redimidas en el rango ÷ unidades incluidas en el rango de las membresías activas " +
      "(unidades por periodo × meses del rango ÷ meses del periodo) × 100",
    sources: SOURCES,
    unit: "percent",
    scopes: ["center", "corporate"],
    compute: ({ facts, from, to }) => {
      const months = rangeMonths(from, to);
      const entitled = facts
        .filter(isActive)
        .reduce((t, f) => t + (f.entitledUnits * months) / f.periodMonths, 0);
      const used = facts.filter(isActive).reduce((t, f) => t + f.usedUnits, 0);
      return entitled === 0 ? 0 : Math.round((used / entitled) * 1000) / 10;
    },
  }),
);

export const membershipRevenue = kpiRegistry.register(
  defineKpi<MembershipKpiInput>({
    id: "membership.revenue",
    name: "Ingreso por membresías",
    formula: "Σ montos cobrados en altas y renovaciones dentro del rango",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: ({ facts }) => round2(facts.reduce((t, f) => t + f.revenueInRange, 0)),
  }),
);

/** Todos los indicadores de membresías, en el orden de las pantallas. */
export function membershipKpis(input: MembershipKpiInput) {
  return {
    active: membershipActiveCount.compute(input),
    newCount: membershipNewCount.compute(input),
    churn: membershipChurnCount.compute(input),
    renewals: membershipRenewalCount.compute(input),
    mrr: membershipMrr.compute(input),
    arpm: membershipArpm.compute(input),
    redeemedUnits: membershipRedeemedUnits.compute(input),
    usageRate: membershipUsageRate.compute(input),
    revenue: membershipRevenue.compute(input),
  };
}
