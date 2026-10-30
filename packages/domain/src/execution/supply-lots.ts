import { daysBetween } from "../memberships/membership";
import type { Result } from "../result";
import type { InventoryUnit } from "./execution";

/**
 * Lotes de insumos con caducidad (ADR 0052). Sin existencias ni almacén
 * (ADR 0012): sólo qué lote llegó, cuándo caduca y si ya se terminó o se sacó.
 * El estado lo calcula la base con la fecha del centro (private.supply_lot_state);
 * supplyLotState es su espejo para vistas previas y pruebas.
 */

/** Días antes de caducar en que el lote pasa a «por caducar». Espejo de private.supply_lot_state. */
export const SUPPLY_EXPIRY_WARNING_DAYS = 30;

export const SUPPLY_LOT_STATES = ["vigente", "por_caducar", "caducado"] as const;
export type SupplyLotState = (typeof SUPPLY_LOT_STATES)[number];

export const SUPPLY_LOT_OUTCOMES = ["agotado", "retirado"] as const;
export type SupplyLotOutcome = (typeof SUPPLY_LOT_OUTCOMES)[number];
export type SupplyLotStatus = "activo" | SupplyLotOutcome;

export function supplyLotState(expiresOn: string, today: string): SupplyLotState {
  const left = daysBetween(today, expiresOn);
  if (left < 0) return "caducado";
  return left <= SUPPLY_EXPIRY_WARNING_DAYS ? "por_caducar" : "vigente";
}

export interface SupplyLot {
  id: string;
  inventoryItemId: string;
  itemCode: string;
  itemName: string;
  itemUnit: InventoryUnit;
  lotCode: string;
  expiresOn: string;
  receivedOn: string;
  quantity: number | null;
  notes: string | null;
  status: SupplyLotStatus;
  /** Sólo en lotes activos. */
  state: SupplyLotState | null;
  daysLeft: number;
  closedReason: string | null;
  closedAt: string | null;
  version: number;
}

export interface RegisterSupplyLotCommand {
  detailCenterId: string;
  requestId: string;
  inventoryItemId: string;
  lotCode: string;
  expiresOn: string;
  receivedOn?: string | undefined;
  quantity?: number | undefined;
  notes?: string | undefined;
}

export interface CloseSupplyLotCommand {
  id: string;
  version: number;
  outcome: SupplyLotOutcome;
  reason: string;
}

export interface SupplyLotRepository {
  list(detailCenterId: string, includeClosed?: boolean): Promise<Result<SupplyLot[]>>;
  register(command: RegisterSupplyLotCommand): Promise<Result<{ id: string }>>;
  close(command: CloseSupplyLotCommand): Promise<Result<{ version: number }>>;
}

export const SUPPLY_LOT_STATE_LABELS: Record<SupplyLotState, string> = {
  vigente: "Vigente",
  por_caducar: "Por caducar",
  caducado: "Caducado",
};
export const SUPPLY_LOT_STATE_TONES: Record<SupplyLotState, "success" | "warning" | "danger"> = {
  vigente: "success",
  por_caducar: "warning",
  caducado: "danger",
};
export const SUPPLY_LOT_OUTCOME_LABELS: Record<SupplyLotOutcome, string> = {
  agotado: "Se terminó",
  retirado: "Se sacó (caducado o dañado)",
};

export const supplyLotsCopy = {
  title: "Lotes y caducidad",
  description: `Registra cada lote de insumo que llega con su fecha de caducidad. Avisamos ${SUPPLY_EXPIRY_WARNING_DAYS} días antes para usarlo primero y cuando ya caducó para sacarlo o reemplazarlo.`,
  add: "Registrar lote",
  item: "Insumo",
  lotCode: "Lote",
  expiresOn: "Caduca el",
  receivedOn: "Recibido el",
  quantity: "Cantidad recibida (opcional)",
  notes: "Notas (opcional)",
  close: "Cerrar lote",
  outcome: "¿Qué pasó?",
  reason: "Motivo",
  empty: "No hay lotes activos.",
  history: "Lotes cerrados",
  noItems: "Primero da de alta los insumos en Catálogo → Insumos.",
  alertLink: "Ver lotes",
} as const;

/** «Caducó hace 3 días», «Caduca hoy», «Caduca en 10 días». */
export function expiryLabel(daysLeft: number): string {
  if (daysLeft < 0) return `Caducó hace ${-daysLeft} ${-daysLeft === 1 ? "día" : "días"}`;
  if (daysLeft === 0) return "Caduca hoy";
  return `Caduca en ${daysLeft} ${daysLeft === 1 ? "día" : "días"}`;
}

/** Aviso para Operación del día: qué sacar y qué usar primero. Null si no hay nada. */
export function supplyLotAlert(lots: readonly SupplyLot[]) {
  const active = lots.filter((l) => l.status === "activo");
  const expired = active.filter((l) => l.state === "caducado");
  const soon = active.filter((l) => l.state === "por_caducar");
  if (!expired.length && !soon.length) return null;
  const parts = [
    expired.length
      ? `${expired.length} ${expired.length === 1 ? "lote caducado" : "lotes caducados"}: ${expired.length === 1 ? "sácalo o reemplázalo" : "sácalos o reemplázalos"} (${expired
          .slice(0, 3)
          .map((l) => `${l.itemName} ${l.lotCode}`)
          .join(", ")}${expired.length > 3 ? "…" : ""})`
      : null,
    soon.length
      ? `${soon.length} por caducar en ${SUPPLY_EXPIRY_WARNING_DAYS} días o menos: ${soon.length === 1 ? "úsalo" : "úsalos"} primero`
      : null,
  ].filter(Boolean);
  return { tone: expired.length ? ("danger" as const) : ("warning" as const), text: `${parts.join(". ")}.` };
}

export function presentSupplyLot(lot: SupplyLot) {
  return {
    ...lot,
    stateLabel: lot.state
      ? SUPPLY_LOT_STATE_LABELS[lot.state]
      : SUPPLY_LOT_OUTCOME_LABELS[lot.status as SupplyLotOutcome],
    tone: lot.state ? SUPPLY_LOT_STATE_TONES[lot.state] : ("neutral" as const),
    expiry: lot.status === "activo" ? expiryLabel(lot.daysLeft) : lot.expiresOn,
    item: `${lot.itemName} (${lot.itemCode})`,
    quantityLabel: lot.quantity == null ? "—" : `${lot.quantity} ${lot.itemUnit}`,
  };
}
