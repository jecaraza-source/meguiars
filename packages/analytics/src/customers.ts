import { defineKpi, kpiRegistry } from "./kpi";
import { periodDays, type CenterResourceFact } from "./orders";

/**
 * KPIs de cliente (D2). Fuente: public.dashboard_facts, fuente `customers`:
 * una fila por centro, cliente (llave anónima) y canal con sus visitas del
 * periodo. Sin datos personales. Las fórmulas viven sólo aquí.
 */
export interface CustomerFact {
  detailCenterId: string;
  /** Llave anónima del cliente (md5 del id): sólo sirve para contar únicos. */
  clientKey: string;
  channel: "b2c" | "membresia" | "b2b";
  /** OS entregadas del cliente en el periodo. */
  visits: number;
  sales: number;
  /** Costo estándar de esas OS. */
  cost: number;
  /** Ya tenía una OS entregada en ese centro antes del periodo. */
  priorVisit: boolean;
}

export interface CustomersKpiInput {
  facts: readonly CustomerFact[];
  from: string;
  to: string;
  centers: readonly CenterResourceFact[];
}

const SOURCES = ["public.service_orders"] as const;
const round2 = (n: number) => Math.round(n * 100) / 100;
const uniqueClients = (facts: readonly CustomerFact[]) => new Set(facts.map((f) => f.clientKey)).size;
const sum = (facts: readonly CustomerFact[], pick: (f: CustomerFact) => number) =>
  facts.reduce((t, f) => t + pick(f), 0);

/** Años de vida del LTV: parámetro de la organización (3 si no hay centros). */
export const ltvLifetimeYears = (centers: readonly CenterResourceFact[]) =>
  centers.length === 0 ? 3 : Math.max(...centers.map((c) => c.ltvLifetimeYears));

export const customersRecurrenceRate = kpiRegistry.register(
  defineKpi<CustomersKpiInput>({
    id: "customers.recurrence_rate",
    name: "Recurrencia",
    formula:
      "Clientes con OS entregada en el periodo que ya tenían una OS entregada antes en el mismo centro ÷ clientes con OS entregada en el periodo × 100",
    sources: SOURCES,
    unit: "percent",
    scopes: ["center", "corporate"],
    compute: ({ facts }) => {
      const all = uniqueClients(facts);
      const returning = uniqueClients(facts.filter((f) => f.priorVisit));
      return all === 0 ? 0 : round2((returning * 100) / all);
    },
  }),
);

export const customersVisitFrequency = kpiRegistry.register(
  defineKpi<CustomersKpiInput>({
    id: "customers.visit_frequency",
    name: "Frecuencia de visita",
    formula: "OS entregadas en el periodo ÷ clientes únicos atendidos en el periodo (0 sin clientes)",
    sources: SOURCES,
    unit: "ratio",
    scopes: ["center", "corporate"],
    compute: ({ facts }) => {
      const clients = uniqueClients(facts);
      return clients === 0 ? 0 : round2(sum(facts, (f) => f.visits) / clients);
    },
  }),
);

/**
 * LTV gerencial: gasto anualizado por cliente × margen de las OS × años de
 * vida esperados (parámetro). Es una regla de gestión explícita, no una
 * predicción estadística.
 */
export const customersLtv = kpiRegistry.register(
  defineKpi<CustomersKpiInput>({
    id: "customers.ltv",
    name: "LTV gerencial",
    formula:
      "(Σ ventas de OS del periodo ÷ clientes únicos) × (365 ÷ días del periodo) × (1 − costo estándar ÷ ventas) × años de vida esperados (parámetro de la organización; 3 por defecto)",
    sources: ["public.service_orders", "public.kpi_settings"],
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: ({ facts, from, to, centers }) => {
      const clients = uniqueClients(facts);
      const sales = sum(facts, (f) => f.sales);
      const days = periodDays(from, to);
      if (clients === 0 || sales <= 0 || days === 0) return 0;
      const margin = 1 - sum(facts, (f) => f.cost) / sales;
      return round2((sales / clients) * (365 / days) * margin * ltvLifetimeYears(centers));
    },
  }),
);
