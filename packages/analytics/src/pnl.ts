import { defineKpi, kpiRegistry } from "./kpi";

/**
 * Estado de resultados (P&L) por centro o consolidado (AF2). Fuente:
 * public.pnl_facts (sin datos personales). Las fórmulas viven sólo aquí.
 *
 * - Ventas: OS entregadas en el periodo (por canal) + venta de membresías.
 * - Costo directo: costo estándar de esas OS + variación real de insumos +
 *   egresos del grupo costo_directo (lo que la OS no captura).
 * - Gastos de operación: personal, operativo, administrativo y marketing.
 * - Otros: financiero y otros.
 * - La compra de insumos (grupo `insumos`) NO es gasto: su costo ya está en la
 *   OS. Sí es salida de caja, y se reporta aparte.
 */
export interface PnlFactInput {
  section: "ingreso" | "costo_os" | "egreso" | "egreso_pendiente";
  item: string;
  amount: number;
}

export interface PnlKpiInput {
  facts: readonly PnlFactInput[];
}

const SOURCES = [
  "public.service_orders",
  "public.service_order_consumptions",
  "public.membership_events",
  "public.expenses",
] as const;
const round2 = (n: number) => Math.round(n * 100) / 100;
const sumOf = (facts: readonly PnlFactInput[], pred: (f: PnlFactInput) => boolean) =>
  round2(facts.filter(pred).reduce((a, f) => a + f.amount, 0));
const expense = (group: string) => (f: PnlFactInput) => f.section === "egreso" && f.item === group;

export const OPERATING_GROUPS = ["personal", "operativo", "administrativo", "marketing"] as const;
export const OTHER_GROUPS = ["financiero", "otros"] as const;

export interface PnlLine {
  key: string;
  label: string;
  amount: number;
  /** Nivel visual: 0 = subtotal, 1 = detalle. */
  level: 0 | 1;
  /** % sobre ventas (null si no hay ventas). */
  percent: number | null;
}

export interface PnlStatement {
  revenue: number;
  directCost: number;
  grossProfit: number;
  operatingExpenses: number;
  operatingProfit: number;
  otherExpenses: number;
  netBeforeTax: number;
  /** Salidas de caja aprobadas del periodo (incluye insumos). */
  cashOut: number;
  /** Pendientes de aprobación (no cuentan en el P&L). */
  pending: number;
  lines: PnlLine[];
}

const CHANNEL_LABELS: Record<string, string> = {
  b2c: "Ventas B2C (OS)",
  membresia: "Ventas con membresía (OS)",
  b2b: "Ventas B2B (OS)",
  membresias: "Venta de membresías",
};
const GROUP_LABELS: Record<string, string> = {
  costo_directo: "Costos directos no capturados en la OS",
  personal: "Personal",
  operativo: "Operativo",
  administrativo: "Administrativo",
  marketing: "Marketing",
  financiero: "Financiero",
  otros: "Otros",
};

export function pnlStatement({ facts }: PnlKpiInput): PnlStatement {
  const revenue = sumOf(facts, (f) => f.section === "ingreso");
  const standard = sumOf(facts, (f) => f.section === "costo_os" && f.item === "estandar");
  const variance = sumOf(facts, (f) => f.section === "costo_os" && f.item === "variacion_insumos");
  const directExpenses = sumOf(facts, expense("costo_directo"));
  const directCost = round2(standard + variance + directExpenses);
  const grossProfit = round2(revenue - directCost);
  const operating = OPERATING_GROUPS.map((g) => [g, sumOf(facts, expense(g))] as const);
  const operatingExpenses = round2(operating.reduce((a, [, v]) => a + v, 0));
  const operatingProfit = round2(grossProfit - operatingExpenses);
  const others = OTHER_GROUPS.map((g) => [g, sumOf(facts, expense(g))] as const);
  const otherExpenses = round2(others.reduce((a, [, v]) => a + v, 0));
  const netBeforeTax = round2(operatingProfit - otherExpenses);
  const pct = (n: number) => (revenue > 0 ? round2((n * 100) / revenue) : null);
  const line = (key: string, label: string, amount: number, level: 0 | 1): PnlLine => ({
    key,
    label,
    amount,
    level,
    percent: pct(amount),
  });
  const channels = ["b2c", "membresia", "b2b", "membresias"]
    .map((c) => [c, sumOf(facts, (f) => f.section === "ingreso" && f.item === c)] as const)
    .filter(([, v]) => v !== 0);
  return {
    revenue,
    directCost,
    grossProfit,
    operatingExpenses,
    operatingProfit,
    otherExpenses,
    netBeforeTax,
    cashOut: sumOf(facts, (f) => f.section === "egreso"),
    pending: sumOf(facts, (f) => f.section === "egreso_pendiente"),
    lines: [
      line("revenue", "Ventas", revenue, 0),
      ...channels.map(([c, v]) => line(`revenue.${c}`, CHANNEL_LABELS[c] ?? c, v, 1)),
      line("direct_cost", "Costo directo", directCost, 0),
      line("direct_cost.standard", "Costo estándar de las OS", standard, 1),
      line("direct_cost.variance", "Variación real de insumos", variance, 1),
      line("direct_cost.expenses", GROUP_LABELS.costo_directo!, directExpenses, 1),
      line("gross_profit", "Utilidad bruta", grossProfit, 0),
      line("operating_expenses", "Gastos de operación", operatingExpenses, 0),
      ...operating.map(([g, v]) => line(`operating.${g}`, GROUP_LABELS[g]!, v, 1)),
      line("operating_profit", "Utilidad de operación", operatingProfit, 0),
      line("other_expenses", "Otros gastos", otherExpenses, 0),
      ...others.map(([g, v]) => line(`other.${g}`, GROUP_LABELS[g]!, v, 1)),
      line("net_before_tax", "Utilidad antes de impuestos", netBeforeTax, 0),
    ],
  };
}

export const pnlRevenue = kpiRegistry.register(
  defineKpi<PnlKpiInput>({
    id: "pnl.revenue",
    name: "Ventas",
    formula: "Σ total de OS entregadas en el periodo + Σ cobro de altas y renovaciones de membresía",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => pnlStatement(i).revenue,
  }),
);

export const pnlGrossProfit = kpiRegistry.register(
  defineKpi<PnlKpiInput>({
    id: "pnl.gross_profit",
    name: "Utilidad bruta",
    formula: "Ventas − (costo estándar de las OS + variación de insumos + egresos de costo directo)",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => pnlStatement(i).grossProfit,
  }),
);

export const pnlGrossMargin = kpiRegistry.register(
  defineKpi<PnlKpiInput>({
    id: "pnl.gross_margin",
    name: "Margen bruto",
    formula: "Utilidad bruta ÷ ventas × 100",
    sources: SOURCES,
    unit: "percent",
    scopes: ["center", "corporate"],
    compute: (i) => {
      const s = pnlStatement(i);
      return s.revenue > 0 ? round2((s.grossProfit * 100) / s.revenue) : 0;
    },
  }),
);

export const pnlOperatingProfit = kpiRegistry.register(
  defineKpi<PnlKpiInput>({
    id: "pnl.operating_profit",
    name: "Utilidad de operación",
    formula: "Utilidad bruta − gastos de personal, operativos, administrativos y de marketing aprobados",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => pnlStatement(i).operatingProfit,
  }),
);

export const pnlNetBeforeTax = kpiRegistry.register(
  defineKpi<PnlKpiInput>({
    id: "pnl.net_before_tax",
    name: "Utilidad antes de impuestos",
    formula: "Utilidad de operación − gastos financieros y otros aprobados",
    sources: SOURCES,
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => pnlStatement(i).netBeforeTax,
  }),
);

export const expensesCashOut = kpiRegistry.register(
  defineKpi<PnlKpiInput>({
    id: "expenses.cash_out",
    name: "Salidas de caja",
    formula: "Σ egresos aprobados del periodo, incluida la compra de insumos (que no es gasto del P&L)",
    sources: ["public.expenses"],
    unit: "currency",
    scopes: ["center", "corporate"],
    compute: (i) => pnlStatement(i).cashOut,
  }),
);
