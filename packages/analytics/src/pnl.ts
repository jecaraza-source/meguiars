import { defineKpi, kpiRegistry } from "./kpi";

/**
 * Estado de resultados gerencial (AF4) por centro y consolidado. Fuente:
 * public.pnl_lines, que agrega private.pnl_movements (cada cifra se rastrea a
 * sus movimientos con public.pnl_drilldown). Las fórmulas viven sólo aquí y
 * las usan el P&L, Dirección, web y móvil.
 *
 * Diccionario (docs/modules/pnl.md):
 * - Ventas: OS ENTREGADAS en el periodo por su total (no los cobros), por canal
 *   y por motor; + venta de membresías (altas y renovaciones cobradas) + cuotas
 *   B2B devengadas.
 * - Costo directo: costo estándar congelado de esas OS + variación real de
 *   insumos + egresos del grupo costo_directo.
 * - Utilidad bruta = ventas − costo directo.
 * - Gastos de personal: egresos aprobados del grupo personal.
 * - Gastos operativos: operativo + administrativo + marketing + otros.
 * - EBITDA gerencial = utilidad bruta − personal − operativos (sin
 *   depreciación, intereses ni impuestos; no hay activos fijos modelados).
 * - Financieros (comisiones bancarias e intereses) debajo del EBITDA.
 * - Utilidad antes de impuestos = EBITDA − financieros.
 * - Fuera del P&L: compra de insumos (salida de caja; su costo está en la OS)
 *   y egresos pendientes de aprobación.
 */

export type PnlSection = "ingreso" | "costo_directo" | "gasto" | "fuera_pnl";

/** Fila de public.pnl_lines. */
export interface PnlLineFact {
  detailCenterId: string;
  section: PnlSection;
  line: string;
  /** Motor de ingreso (ingreso), grupo (pendiente) o null. */
  dimension: string | null;
  amount: number;
  movements: number;
}

export interface PnlKpiInput {
  facts: readonly PnlLineFact[];
}

/** Destino del drill-down de una cifra. */
export interface PnlDrill {
  section: PnlSection;
  line?: string;
  /** "-" = sin dimensión. */
  dimension?: string;
}

export interface PnlLine {
  key: string;
  label: string;
  amount: number;
  /** 0 = total o subtotal; 1 = detalle. */
  level: 0 | 1;
  /** % sobre ventas (null si no hay ventas). */
  percent: number | null;
  /** Subtotales calculados (utilidades) no tienen drill-down directo. */
  drill: PnlDrill | null;
}

export interface PnlStatement {
  revenue: number;
  directCost: number;
  grossProfit: number;
  grossMargin: number | null;
  personnel: number;
  operatingExpenses: number;
  ebitda: number;
  ebitdaMargin: number | null;
  financial: number;
  netBeforeTax: number;
  /** Compra de insumos aprobada (salida de caja, fuera del P&L). */
  suppliesPurchases: number;
  /** Egresos pendientes de aprobación (no cuentan). */
  pending: number;
  /** Salidas de caja aprobadas del periodo (todos los egresos aprobados, incluidos insumos). */
  cashOut: number;
  lines: PnlLine[];
  /** Ventas por motor de ingreso (incluye el descuento general de las OS). */
  revenueByEngine: { engine: string; amount: number; percent: number | null; drill: PnlDrill }[];
}

export const REVENUE_LINES = ["b2c", "membresia", "b2b", "membresias", "cuotas_b2b"] as const;
export const OPERATING_GROUPS = ["operativo", "administrativo", "marketing", "otros"] as const;
export const ENGINE_ORDER = [
  "recurrente",
  "valor_medio",
  "premium",
  "producto_complemento",
  "membresia",
  "cuota_b2b",
  "descuento_os",
] as const;

const LABELS: Record<string, string> = {
  revenue: "Ventas",
  "revenue.b2c": "Ventas B2C (OS)",
  "revenue.membresia": "Ventas con membresía (OS)",
  "revenue.b2b": "Ventas B2B (OS)",
  "revenue.membresias": "Venta de membresías",
  "revenue.cuotas_b2b": "Cuotas B2B",
  direct_cost: "Costo directo",
  "direct_cost.estandar": "Costo estándar de las OS",
  "direct_cost.variacion_insumos": "Variación real de insumos",
  "direct_cost.egresos_costo_directo": "Costos directos no capturados en la OS",
  gross_profit: "Utilidad bruta",
  personnel: "Gastos de personal",
  operating: "Gastos operativos",
  "operating.operativo": "Operativo (renta, servicios, mantenimiento)",
  "operating.administrativo": "Administrativo",
  "operating.marketing": "Marketing",
  "operating.otros": "Otros",
  ebitda: "EBITDA gerencial",
  financial: "Gastos financieros",
  net_before_tax: "Utilidad antes de impuestos",
};

export const pnlLineLabel = (key: string) => LABELS[key] ?? key;

const round2 = (n: number) => Math.round(n * 100) / 100;
const sumOf = (facts: readonly PnlLineFact[], pred: (f: PnlLineFact) => boolean) =>
  round2(facts.filter(pred).reduce((a, f) => a + f.amount, 0));
const pctOf = (n: number, revenue: number) => (revenue > 0 ? round2((n * 100) / revenue) : null);

export function pnlStatement({ facts }: PnlKpiInput): PnlStatement {
  const is = (section: PnlSection, line?: string) => (f: PnlLineFact) =>
    f.section === section && (line === undefined || f.line === line);
  const revenue = sumOf(facts, is("ingreso"));
  const byRevenueLine = REVENUE_LINES.map((l) => [l, sumOf(facts, is("ingreso", l))] as const);
  const standard = sumOf(facts, is("costo_directo", "estandar"));
  const variance = sumOf(facts, is("costo_directo", "variacion_insumos"));
  const directExpenses = sumOf(facts, is("costo_directo", "egresos_costo_directo"));
  const directCost = round2(standard + variance + directExpenses);
  const grossProfit = round2(revenue - directCost);
  const personnel = sumOf(facts, is("gasto", "personal"));
  const operating = OPERATING_GROUPS.map((g) => [g, sumOf(facts, is("gasto", g))] as const);
  const operatingExpenses = round2(operating.reduce((a, [, v]) => a + v, 0));
  const ebitda = round2(grossProfit - personnel - operatingExpenses);
  const financial = sumOf(facts, is("gasto", "financiero"));
  const netBeforeTax = round2(ebitda - financial);
  const suppliesPurchases = sumOf(facts, is("fuera_pnl", "insumos"));
  const pending = sumOf(facts, is("fuera_pnl", "pendiente"));
  const pct = (n: number) => pctOf(n, revenue);
  const line = (key: string, amount: number, level: 0 | 1, drill: PnlDrill | null): PnlLine => ({
    key,
    label: pnlLineLabel(key),
    amount,
    level,
    percent: pct(amount),
    drill,
  });
  const engines = new Map<string, number>();
  for (const f of facts.filter(is("ingreso")))
    engines.set(f.dimension ?? "-", round2((engines.get(f.dimension ?? "-") ?? 0) + f.amount));
  const engineRank = (e: string) => {
    const i = (ENGINE_ORDER as readonly string[]).indexOf(e);
    return i < 0 ? ENGINE_ORDER.length : i;
  };
  return {
    revenue,
    directCost,
    grossProfit,
    grossMargin: pct(grossProfit),
    personnel,
    operatingExpenses,
    ebitda,
    ebitdaMargin: pct(ebitda),
    financial,
    netBeforeTax,
    suppliesPurchases,
    pending,
    cashOut: round2(directExpenses + personnel + operatingExpenses + financial + suppliesPurchases),
    lines: [
      line("revenue", revenue, 0, { section: "ingreso" }),
      ...byRevenueLine
        .filter(([, v]) => v !== 0)
        .map(([l, v]) => line(`revenue.${l}`, v, 1, { section: "ingreso", line: l })),
      line("direct_cost", directCost, 0, { section: "costo_directo" }),
      line("direct_cost.estandar", standard, 1, { section: "costo_directo", line: "estandar" }),
      line("direct_cost.variacion_insumos", variance, 1, {
        section: "costo_directo",
        line: "variacion_insumos",
      }),
      line("direct_cost.egresos_costo_directo", directExpenses, 1, {
        section: "costo_directo",
        line: "egresos_costo_directo",
      }),
      line("gross_profit", grossProfit, 0, null),
      line("personnel", personnel, 0, { section: "gasto", line: "personal" }),
      line("operating", operatingExpenses, 0, null),
      ...operating.map(([g, v]) => line(`operating.${g}`, v, 1, { section: "gasto", line: g })),
      line("ebitda", ebitda, 0, null),
      line("financial", financial, 0, { section: "gasto", line: "financiero" }),
      line("net_before_tax", netBeforeTax, 0, null),
    ],
    revenueByEngine: [...engines.entries()]
      .sort(([a], [b]) => engineRank(a) - engineRank(b) || a.localeCompare(b))
      .map(([engine, amount]) => ({
        engine,
        amount,
        percent: pct(amount),
        drill: { section: "ingreso" as const, dimension: engine },
      })),
  };
}

/**
 * Estado por centro y consolidado. El consolidado se calcula con las filas de
 * todos los centros autorizados; como las fórmulas son lineales, cada cifra del
 * consolidado es la suma de la de los centros.
 */
export function pnlByCenter(facts: readonly PnlLineFact[], centerIds: readonly string[]) {
  return {
    centers: centerIds.map((id) => ({
      detailCenterId: id,
      statement: pnlStatement({ facts: facts.filter((f) => f.detailCenterId === id) }),
    })),
    consolidated: pnlStatement({ facts: facts.filter((f) => centerIds.includes(f.detailCenterId)) }),
  };
}

const SOURCES = [
  "public.service_orders",
  "public.service_order_items",
  "public.service_order_consumptions",
  "public.membership_events",
  "public.b2b_agreements",
  "public.expenses",
] as const;

const kpi = (
  id: string,
  name: string,
  formula: string,
  unit: "currency" | "percent",
  pick: (s: PnlStatement) => number,
) =>
  kpiRegistry.register(
    defineKpi<PnlKpiInput>({
      id,
      name,
      formula,
      sources: SOURCES,
      unit,
      scopes: ["center", "corporate"],
      compute: (i) => pick(pnlStatement(i)),
    }),
  );

export const pnlRevenue = kpi(
  "pnl.revenue",
  "Ventas",
  "Σ total de OS entregadas en el periodo (fecha de entrega del centro; no cobros) + altas y renovaciones de membresía cobradas + cuotas B2B devengadas",
  "currency",
  (s) => s.revenue,
);
export const pnlDirectCost = kpi(
  "pnl.direct_cost",
  "Costo directo",
  "Costo estándar congelado de las OS entregadas + variación real de insumos + egresos aprobados de costo directo",
  "currency",
  (s) => s.directCost,
);
export const pnlGrossProfit = kpi(
  "pnl.gross_profit",
  "Utilidad bruta",
  "Ventas − costo directo",
  "currency",
  (s) => s.grossProfit,
);
export const pnlGrossMargin = kpi(
  "pnl.gross_margin",
  "Margen bruto",
  "Utilidad bruta ÷ ventas × 100 (0 si no hay ventas)",
  "percent",
  (s) => s.grossMargin ?? 0,
);
export const pnlEbitda = kpi(
  "pnl.ebitda",
  "EBITDA gerencial",
  "Utilidad bruta − gastos de personal − gastos operativos (operativo, administrativo, marketing y otros) aprobados",
  "currency",
  (s) => s.ebitda,
);
export const pnlEbitdaMargin = kpi(
  "pnl.ebitda_margin",
  "Margen EBITDA",
  "EBITDA gerencial ÷ ventas × 100 (0 si no hay ventas)",
  "percent",
  (s) => s.ebitdaMargin ?? 0,
);
export const pnlNetBeforeTax = kpi(
  "pnl.net_before_tax",
  "Utilidad antes de impuestos",
  "EBITDA gerencial − gastos financieros aprobados (comisiones bancarias e intereses)",
  "currency",
  (s) => s.netBeforeTax,
);
export const pnlPersonnelRatio = kpi(
  "pnl.personnel_ratio",
  "Gasto de personal sobre ventas",
  "Gastos de personal aprobados ÷ ventas × 100 (0 si no hay ventas)",
  "percent",
  (s) => (s.revenue > 0 ? round2((s.personnel * 100) / s.revenue) : 0),
);
export const expensesCashOut = kpi(
  "expenses.cash_out",
  "Salidas de caja",
  "Σ egresos aprobados del periodo, incluida la compra de insumos (que no es gasto del P&L)",
  "currency",
  (s) => s.cashOut,
);
