import type { CatalogItem, PriceHistoryEntry } from "./catalog";
import { catalogCopy, REVENUE_ENGINE_LABELS } from "./copy";
import { formatInCenterTimeZone } from "../time";

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export const formatMoney = (amount: number): string => mxn.format(amount);

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Margen estándar (única definición): precio − costo directo estándar, y su
 * porcentaje sobre el precio. Con precio 0 el porcentaje es 0.
 */
export function standardMargin(price: number, directCost: number): { amount: number; percent: number } {
  const amount = Math.round((price - directCost) * 100) / 100;
  const percent = price > 0 ? Math.round((amount / price) * 1000) / 10 : 0;
  return { amount, percent };
}

const cents = (amount: number) => Math.round(amount * 100);

/**
 * Pago al operador: % del precio aplicado, redondeado a centavos (igual que
 * round(numeric, 2) de Postgres en service_order_items.operator_commission_amount).
 * Sin porcentaje o con precio 0, el pago es 0.
 */
export function operatorPayOf(appliedPrice: number, percent: number | null): number {
  if (percent === null || appliedPrice <= 0) return 0;
  return Math.floor((cents(appliedPrice) * Math.round(percent * 100) + 5000) / 10000) / 100;
}

export interface ServiceCostBreakdown {
  price: number;
  operatorPct: number | null;
  operatorPay: number;
  otherDirectCost: number;
  totalCost: number;
  /** Margen de contribución (antes de gastos generales; no es utilidad neta). */
  margin: number;
  /** null con precio 0 (no hay porcentaje que calcular). */
  marginPct: number | null;
}

/**
 * Costo y margen de un servicio con pago al operador (CR1):
 * pago = precio × % ÷ 100; costo total = pago + otros costos directos;
 * margen de contribución = precio − costo total; margen % = margen ÷ precio × 100.
 */
export function serviceCostBreakdown(
  price: number,
  operatorPct: number | null,
  otherDirectCost: number,
): ServiceCostBreakdown {
  const operatorPay = operatorPayOf(price, operatorPct);
  const totalCost = (cents(operatorPay) + cents(otherDirectCost)) / 100;
  const margin = (cents(price) - cents(totalCost)) / 100;
  return {
    price,
    operatorPct,
    operatorPay,
    otherDirectCost,
    totalCost,
    margin,
    marginPct: price > 0 ? Math.round((margin / price) * 10000) / 100 : null,
  };
}

const pctText = (p: number | null) => (p === null ? "—" : `${p.toFixed(2)} %`);

/** Desglose listo para mostrar (mismos textos en web y móvil). */
export function presentCostBreakdown(b: ServiceCostBreakdown) {
  return [
    { key: "price", label: catalogCopy.salePrice, value: formatMoney(b.price) },
    {
      key: "pct",
      label: catalogCopy.operatorPct,
      value: b.operatorPct === null ? "—" : pctText(b.operatorPct),
    },
    { key: "pay", label: catalogCopy.operatorPay, value: formatMoney(b.operatorPay) },
    { key: "other", label: catalogCopy.otherCosts, value: formatMoney(b.otherDirectCost) },
    { key: "total", label: catalogCopy.totalCost, value: formatMoney(b.totalCost) },
    { key: "margin", label: catalogCopy.contributionMargin, value: formatMoney(b.margin) },
    { key: "marginPct", label: catalogCopy.contributionMarginPct, value: pctText(b.marginPct) },
  ];
}

/** Fila del catálogo (mismos textos en web y móvil). */
export function presentCatalogItem(item: CatalogItem) {
  const b = serviceCostBreakdown(item.price, item.operatorCommissionPct, item.directCost);
  const margin = standardMargin(item.price, b.totalCost);
  const status = !item.active
    ? catalogCopy.inactive
    : !item.available
      ? catalogCopy.unavailable
      : "Disponible";
  return {
    id: item.id,
    name: `${item.name} · ${item.code}`,
    engine: REVENUE_ENGINE_LABELS[item.revenueEngine],
    duration: formatDuration(item.standardDurationMinutes),
    price: formatMoney(item.price) + (item.priceSource === "center" ? " (centro)" : ""),
    cost: formatMoney(item.directCost),
    operatorPay:
      item.operatorCommissionPct === null
        ? "—"
        : `${formatMoney(b.operatorPay)} (${pctText(item.operatorCommissionPct)})`,
    margin: `${formatMoney(margin.amount)} · ${margin.percent}%`,
    status,
  };
}

export function presentPriceHistory(
  entry: PriceHistoryEntry,
  centerName: (id: string) => string,
  timeZone: string,
) {
  return {
    key: String(entry.id),
    date: formatInCenterTimeZone(entry.validFrom, timeZone),
    scope: entry.detailCenterId ? centerName(entry.detailCenterId) : catalogCopy.historyBase,
    price: entry.price === null ? catalogCopy.backToBase : formatMoney(entry.price),
    cost: entry.directCost === null ? "—" : formatMoney(entry.directCost),
    operatorPct: entry.operatorCommissionPct === null ? "—" : pctText(entry.operatorCommissionPct),
    reason: entry.reason ?? "—",
  };
}
