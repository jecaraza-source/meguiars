import { addDays } from "../agenda/zoned-time";
import type { Capability } from "../roles";
import type { Result } from "../result";

/**
 * Administración y Finanzas / P&L multicentro (AF4). Espejo de la migración
 * 20261010000000_pnl.sql: public.pnl_lines (cifras por centro) y
 * public.pnl_drilldown (movimientos que las explican). Las fórmulas del estado
 * de resultados viven en @meguiars/analytics (pnlStatement).
 */

export const PNL_SECTIONS = ["ingreso", "costo_directo", "gasto", "fuera_pnl"] as const;
export type PnlSectionKey = (typeof PNL_SECTIONS)[number];

/** Periodos: hoy, semana (lunes a hoy), mes, año (a la fecha) y personalizado. */
export const PNL_PERIODS = ["hoy", "semana", "mes", "anio", "personalizado"] as const;
export type PnlPeriodKey = (typeof PNL_PERIODS)[number];

/** Máximo del periodo (igual que private.check_pnl_range). */
export const PNL_MAX_DAYS = 1100;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (s: string | undefined): s is string =>
  !!s &&
  DAY.test(s) &&
  !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()) &&
  new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * Rango del periodo en el calendario del centro (AAAA-MM-DD). El resultado se
 * muestra y viaja en la URL, así el mismo filtro siempre da el mismo reporte.
 */
export function pnlPeriod(
  key: PnlPeriodKey,
  today: string,
  custom?: { from?: string | undefined; to?: string | undefined },
): { from: string; to: string } {
  switch (key) {
    case "hoy":
      return { from: today, to: today };
    case "semana": {
      const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = domingo
      return { from: addDays(today, -((weekday + 6) % 7)), to: today };
    }
    case "mes":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "anio":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "personalizado":
      return { from: custom?.from ?? today, to: custom?.to ?? today };
  }
}

/** Error del periodo (mismo criterio que la base) o null. */
export function pnlPeriodError(from: string, to: string): string | null {
  if (!isDay(from) || !isDay(to)) return "Usa fechas válidas (AAAA-MM-DD)";
  if (to < from) return "La fecha final debe ser igual o posterior a la inicial";
  if (daysBetween(from, to) > PNL_MAX_DAYS) return "El periodo no puede exceder 3 años";
  return null;
}

/** Fila de public.pnl_lines (mismo contrato que PnlLineFact de @meguiars/analytics). */
export interface PnlLineRow {
  detailCenterId: string;
  section: PnlSectionKey;
  line: string;
  dimension: string | null;
  amount: number;
  movements: number;
}

/** Movimiento fuente (public.pnl_drilldown). */
export interface PnlMovement {
  detailCenterId: string;
  section: PnlSectionKey;
  line: string;
  dimension: string | null;
  source: "service_orders" | "memberships" | "b2b_agreements" | "expenses";
  sourceId: string;
  reference: string;
  /** AAAA-MM-DD (día del centro). */
  occurredOn: string;
  description: string;
  amount: number;
}

export interface PnlDrillQuery {
  detailCenterIds: string[];
  from: string;
  to: string;
  section: PnlSectionKey;
  line?: string | undefined;
  /** "-" = sin dimensión. */
  dimension?: string | undefined;
}

/** A dónde lleva cada movimiento (sólo si el usuario puede ver el origen en su centro). */
export const PNL_SOURCE_TARGETS: Record<
  PnlMovement["source"],
  {
    capability: Capability;
    href: (id: string) => string;
    screen: "orderDetail" | "membershipDetail" | "b2bAgreementDetail" | "expenseDetail";
  }
> = {
  service_orders: { capability: "orders.read", href: (id) => `/ordenes/${id}`, screen: "orderDetail" },
  memberships: {
    capability: "memberships.read",
    href: (id) => `/comercial/membresias/${id}`,
    screen: "membershipDetail",
  },
  b2b_agreements: {
    capability: "b2b.read",
    href: (id) => `/comercial/b2b/convenios/${id}`,
    screen: "b2bAgreementDetail",
  },
  expenses: { capability: "expenses.read", href: (id) => `/finanzas/egresos/${id}`, screen: "expenseDetail" },
};

/** Suma de los movimientos (debe coincidir con la cifra de la línea). */
export const pnlMovementsTotal = (rows: readonly Pick<PnlMovement, "amount">[]) =>
  Math.round(rows.reduce((t, r) => t + Math.round(r.amount * 100), 0)) / 100;

/** Puerto del P&L. Web y móvil usan el mismo adaptador (`@meguiars/supabase`). */
export interface PnlRepository {
  lines(detailCenterIds: string[], from: string, to: string): Promise<Result<PnlLineRow[]>>;
  drilldown(query: PnlDrillQuery): Promise<Result<PnlMovement[]>>;
}
