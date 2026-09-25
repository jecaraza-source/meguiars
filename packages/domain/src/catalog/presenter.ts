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

/** Fila del catálogo (mismos textos en web y móvil). */
export function presentCatalogItem(item: CatalogItem) {
  const margin = standardMargin(item.price, item.directCost);
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
    reason: entry.reason ?? "—",
  };
}
