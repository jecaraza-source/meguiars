import { standardMargin } from "../catalog/presenter";
import type { DiscountKind, DiscountLevel } from "./order";
import { requiredDiscountLevel } from "./order";

/**
 * Cálculo de totales de la OS. La base de datos es la fuente de verdad
 * (private.recalc_service_order): estas funciones son su espejo exacto para
 * vistas previas en web y móvil y para las pruebas (mismos ejemplos que
 * supabase/tests/service_orders.test.sql). Aritmética en centavos, redondeo
 * a 2 decimales hacia arriba en .5 (igual que round(numeric) de Postgres).
 */

export interface TotalsItem {
  id: string;
  quantity: number;
  unitPrice: number;
  unitDirectCost: number;
  durationMinutes: number;
}

export interface TotalsDiscount {
  /** null = descuento sobre la OS. */
  itemId: string | null;
  kind: DiscountKind;
  value: number;
  voided?: boolean;
}

export interface OrderTotals {
  lines: Record<string, { subtotal: number; discount: number }>;
  subtotal: number;
  lineDiscount: number;
  orderDiscount: number;
  discountTotal: number;
  total: number;
  costTotal: number;
  estimatedMinutes: number;
}

const cents = (amount: number) => Math.round(amount * 100);
const money = (c: number) => c / 100;
/** porcentaje (2 decimales) de un importe en centavos, redondeado. */
const percentOf = (baseCents: number, percent: number) =>
  Math.floor((baseCents * Math.round(percent * 100) + 5000) / 10000);
const discountCents = (d: TotalsDiscount, baseCents: number) =>
  d.kind === "percent" ? percentOf(baseCents, d.value) : cents(d.value);

export function computeOrderTotals(
  items: readonly TotalsItem[],
  discounts: readonly TotalsDiscount[],
): OrderTotals {
  const active = discounts.filter((d) => !d.voided);
  const lines: OrderTotals["lines"] = {};
  let subtotal = 0;
  let lineDiscount = 0;
  let cost = 0;
  let minutes = 0;
  for (const item of items) {
    const lineSubtotal = item.quantity * cents(item.unitPrice);
    const requested = active
      .filter((d) => d.itemId === item.id)
      .reduce((sum, d) => sum + discountCents(d, lineSubtotal), 0);
    const discount = Math.min(lineSubtotal, requested);
    lines[item.id] = { subtotal: money(lineSubtotal), discount: money(discount) };
    subtotal += lineSubtotal;
    lineDiscount += discount;
    cost += item.quantity * cents(item.unitDirectCost);
    minutes += item.quantity * item.durationMinutes;
  }
  const base = subtotal - lineDiscount;
  const orderDiscount = Math.min(
    base,
    active.filter((d) => d.itemId === null).reduce((sum, d) => sum + discountCents(d, base), 0),
  );
  return {
    lines,
    subtotal: money(subtotal),
    lineDiscount: money(lineDiscount),
    orderDiscount: money(orderDiscount),
    discountTotal: money(lineDiscount + orderDiscount),
    total: money(base - orderDiscount),
    costTotal: money(cost),
    estimatedMinutes: minutes,
  };
}

export interface DiscountPreview {
  /** Importe que se descontaría. */
  amount: number;
  /** % acumulado de la OS con este descuento (1 decimal). */
  percentAfter: number;
  requiredLevel: DiscountLevel;
  /** Motivo por el que la base lo rechazaría (excede el importe o deja saldo a favor). */
  error: string | null;
}

/** Vista previa de un descuento (espejo de add_service_order_discount). */
export function previewDiscount(
  totals: OrderTotals,
  paidAmount: number,
  discount: Omit<TotalsDiscount, "voided">,
): DiscountPreview {
  const line = discount.itemId ? totals.lines[discount.itemId] : undefined;
  const baseCents = line ? cents(line.subtotal) : cents(totals.subtotal - totals.lineDiscount);
  const remaining = line ? cents(line.subtotal - line.discount) : cents(totals.total);
  const amount = discountCents(discount, baseCents);
  const subtotal = cents(totals.subtotal);
  const percent = subtotal > 0 ? ((cents(totals.discountTotal) + amount) * 100) / subtotal : 0;
  const error =
    amount > remaining
      ? "El descuento excede el importe pendiente"
      : amount > cents(totals.total) - cents(paidAmount)
        ? "El descuento deja saldo a favor del cliente"
        : null;
  return {
    amount: money(amount),
    percentAfter: Math.round(percent * 10) / 10,
    requiredLevel: requiredDiscountLevel(percent),
    error,
  };
}

/** Margen de la OS: misma definición que el margen estándar del catálogo (total − costo congelado). */
export const orderMargin = (order: { total: number; costTotal: number }) =>
  standardMargin(order.total, order.costTotal);

/** Saldo pendiente de cobro (nunca negativo). */
export const orderBalance = (order: { total: number; paidAmount: number }) =>
  Math.max(0, money(cents(order.total) - cents(order.paidAmount)));
