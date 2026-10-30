import type { CenterAccess } from "../access/access";
import { formatDateInCenterTimeZone } from "../time";
import type { ClientDetail, ClientHistoryEntry, ClientListItem, ClientSearchResult } from "./client";
import {
  CLIENT_KIND_LABELS,
  clientsCopy,
  HISTORY_KIND_LABELS,
  MARKETING_CHANNEL_LABELS,
  SEARCH_MATCH_LABELS,
} from "./copy";
import { formatPhone } from "./normalize";

/** Nombre de un centro visible para el usuario (o genérico si no lo ve). */
export function centerName(access: readonly CenterAccess[], id: string | null): string {
  if (!id) return "—";
  return access.find((a) => a.center.id === id)?.center.name ?? "Otro centro";
}

const date = (utc: string | null, timeZone: string) =>
  utc ? formatDateInCenterTimeZone(utc, timeZone) : clientsCopy.noVisits;

/** Fila de resultados de búsqueda (mismos textos en web y móvil). */
export function presentSearchResult(result: ClientSearchResult, timeZone: string) {
  return { ...presentClientListItem(result, timeZone), match: SEARCH_MATCH_LABELS[result.matchedOn] };
}

/** Fila del catálogo completo (igual que la búsqueda, sin «coincide por»). */
export function presentClientListItem(result: ClientListItem, timeZone: string) {
  return {
    id: result.id,
    name: result.fullName,
    phone: formatPhone(result.phone),
    plates: result.plates.join(", ") || "—",
    home: result.homeCenterName ?? "Otro centro",
    lastVisit: date(result.lastVisitAt, timeZone),
  };
}

/** «Mostrando 51–100 de 230» y si hay página anterior o siguiente. */
export function clientPageInfo(page: number, total: number, pageSize: number) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return {
    label: total === 0 ? "Sin clientes" : `Mostrando ${from}–${to} de ${total}`,
    hasPrev: page > 1,
    hasNext: page * pageSize < total,
  };
}

/** Resumen del expediente; las fechas se muestran en la zona del centro activo. */
export function presentClientDetail(detail: ClientDetail, access: readonly CenterAccess[], timeZone: string) {
  const activeVehicles = detail.vehicles.filter((v) => v.active);
  return {
    title: detail.fullName,
    subtitle: `${CLIENT_KIND_LABELS[detail.kind]} · ${formatPhone(detail.phone)}${detail.email ? ` · ${detail.email}` : ""}`,
    homeCenter: centerName(access, detail.homeDetailCenterId),
    lastVisit: date(detail.lastVisitAt, timeZone),
    lastVisitCenter: detail.lastVisitDetailCenterId
      ? centerName(access, detail.lastVisitDetailCenterId)
      : null,
    vehiclesCount: activeVehicles.length,
    centers: detail.centerIds.map((id) => centerName(access, id)).join(", "),
    consent: detail.marketing.optIn
      ? detail.marketing.channels.map((c) => MARKETING_CHANNEL_LABELS[c]).join(", ")
      : clientsCopy.consentNo,
  };
}

export function presentHistoryEntry(entry: ClientHistoryEntry, timeZone: string) {
  return {
    key: `${entry.kind}-${entry.occurredAt}-${entry.vehicleId ?? entry.detailCenterId}`,
    date: formatDateInCenterTimeZone(entry.occurredAt, timeZone),
    kind: HISTORY_KIND_LABELS[entry.kind],
    title: entry.title,
    center: entry.detailCenterName,
  };
}
