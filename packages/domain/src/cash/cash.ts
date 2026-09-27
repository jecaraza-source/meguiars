import type { Result } from "../result";

/**
 * Administración y Finanzas / Corte de caja (AF3). Reglas espejo de la
 * migración 20261009000000_cash_sessions.sql; schema-parity.test.ts compara las
 * listas.
 *
 * Efectivo esperado (reproducible desde los pagos):
 *   fondo inicial + efectivo de los recibos emitidos en la ventana del corte
 *   − efectivo de los reversos ejecutados en la ventana.
 * Tarjeta y transferencia se resumen aparte (conciliación informativa); la
 * membresía y el crédito B2B no entran a caja.
 */

export const CASH_SHIFTS = ["unico", "matutino", "vespertino", "nocturno"] as const;
export type CashShift = (typeof CASH_SHIFTS)[number];

/** abierta → cerrada → (reabierta → cerrada)… Sólo una abierta por centro. */
export const CASH_SESSION_STATUSES = ["abierta", "cerrada", "reabierta"] as const;
export type CashSessionStatus = (typeof CASH_SESSION_STATUSES)[number];

export type CashDifferenceKind = "cuadrado" | "faltante" | "sobrante";

export const CASH_NOTES_MAX = 500;
export const CASH_NOTE_MIN = 3;
export const REOPEN_REASON_MIN = 3;
export const REOPEN_REASON_MAX = 500;

const cents = (amount: number) => Math.round(amount * 100);
const money = (c: number) => c / 100;

/** Una forma de pago en la ventana del corte (private.cash_window_facts). */
export interface CashMethodFact {
  method: string;
  name: string;
  kind: "efectivo" | "electronico" | "beneficio" | "credito" | "otro";
  collectsCash: boolean;
  /** Σ de los recibos emitidos en la ventana (aunque después se revirtieran). */
  collected: number;
  collectedCount: number;
  /** Σ de los reversos ejecutados en la ventana. */
  refunded: number;
  refundedCount: number;
}

export interface CashTotals {
  openingFloat: number;
  cashCollected: number;
  cashRefunded: number;
  expectedCash: number;
  cardTotal: number;
  transferTotal: number;
  nonCashTotal: number;
  paymentsCount: number;
  reversalsCount: number;
  breakdown: CashMethodFact[];
}

/** Espejo de private.cash_window_totals. */
export function cashTotals(
  openingFloat: number,
  breakdown: readonly CashMethodFact[],
  counts: { paymentsCount: number; reversalsCount: number },
): CashTotals {
  const sum = (pick: (f: CashMethodFact) => boolean, value: (f: CashMethodFact) => number) =>
    money(breakdown.filter(pick).reduce((acc, f) => acc + cents(value(f)), 0));
  const net = (f: CashMethodFact) => f.collected - f.refunded;
  const cashCollected = sum(
    (f) => f.kind === "efectivo",
    (f) => f.collected,
  );
  const cashRefunded = sum(
    (f) => f.kind === "efectivo",
    (f) => f.refunded,
  );
  return {
    openingFloat,
    cashCollected,
    cashRefunded,
    expectedCash: money(cents(openingFloat) + cents(cashCollected) - cents(cashRefunded)),
    cardTotal: sum((f) => f.method === "tarjeta", net),
    transferTotal: sum((f) => f.method === "transferencia", net),
    nonCashTotal: sum((f) => !f.collectsCash, net),
    paymentsCount: counts.paymentsCount,
    reversalsCount: counts.reversalsCount,
    breakdown: [...breakdown],
  };
}

/** Diferencia = contado − esperado (la calcula la base; este es su espejo). */
export function cashDifference(
  counted: number,
  expected: number,
): { difference: number; kind: CashDifferenceKind } {
  const diff = cents(counted) - cents(expected);
  return { difference: money(diff), kind: diff === 0 ? "cuadrado" : diff < 0 ? "faltante" : "sobrante" };
}

/** Un faltante o sobrante exige nota (mismo criterio que close_cash_session). */
export const closeNoteRequired = (counted: number, expected: number) => cents(counted) !== cents(expected);

/** Acciones según estado y permisos (espejo de las RPC). */
export function cashSessionActions(
  status: CashSessionStatus,
  can: { operate: boolean; reopen: boolean },
): { close: boolean; reopen: boolean } {
  return { close: status !== "cerrada" && can.operate, reopen: status === "cerrada" && can.reopen };
}

export interface CashSessionListItem {
  id: string;
  detailCenterId: string;
  folio: string;
  /** AAAA-MM-DD (día del centro). */
  businessDate: string;
  shift: CashShift;
  status: CashSessionStatus;
  openingFloat: number;
  openedAt: string;
  openedByName: string | null;
  windowEnd: string | null;
  closedAt: string | null;
  closedByName: string | null;
  /** Al momento si está abierta; si no, el del último cierre. */
  expectedCash: number;
  countedCash: number | null;
  difference: number | null;
  cardTotal: number;
  transferTotal: number;
  closingsCount: number;
  reopeningsCount: number;
  version: number;
}

/** Versión de un cierre (inmutable). */
export interface CashClosing extends CashTotals {
  id: string;
  sequence: number;
  windowFrom: string;
  windowTo: string;
  countedCash: number;
  difference: number;
  notes: string | null;
  closedByName: string | null;
  closedAt: string;
}

export interface CashReopening {
  reason: string;
  reopenedByName: string | null;
  reopenedAt: string;
  /** Versión del cierre que se reabrió. */
  sequence: number;
}

/** Cobro o reverso dentro de la ventana del corte. */
export interface CashMovement {
  kind: "cobro" | "reverso";
  at: string;
  folio: string;
  /** Estado actual del recibo. */
  status: "valido" | "revertido";
  amount: number;
  /** Parte en efectivo del recibo. */
  cash: number;
  methods: string;
}

export interface CashSession {
  id: string;
  organizationId: string;
  detailCenterId: string;
  centerName: string;
  centerTimezone: string;
  folio: string;
  businessDate: string;
  shift: CashShift;
  status: CashSessionStatus;
  openingFloat: number;
  openedAt: string;
  openedByName: string | null;
  windowEnd: string | null;
  closedAt: string | null;
  closedByName: string | null;
  notes: string | null;
  version: number;
  /** Recalculado desde los pagos sobre la ventana (hasta ahora si está abierta). */
  live: CashTotals;
  closings: CashClosing[];
  reopenings: CashReopening[];
  movements: CashMovement[];
}

/** Último cierre (vigente si el corte está cerrado). */
export const currentClosing = (s: Pick<CashSession, "closings">): CashClosing | null =>
  s.closings.length > 0 ? s.closings[s.closings.length - 1]! : null;

/**
 * Verificación: el esperado del último cierre coincide con el recalculado
 * desde los pagos (null si no hay cierre). Un corte cerrado no admite cobros
 * ni reversos en su ventana, así que siempre debería coincidir.
 */
export function closingVerified(s: Pick<CashSession, "closings" | "live" | "status">): boolean | null {
  const last = currentClosing(s);
  if (!last || s.status === "abierta") return null;
  return cents(last.expectedCash) === cents(s.live.expectedCash);
}

export interface CashUncovered {
  detailCenterId: string;
  day: string;
  cashAmount: number;
  paymentsCount: number;
}

export interface OpenCashCommand {
  detailCenterId: string;
  requestId: string;
  shift: CashShift;
  openingFloat: number;
  notes?: string | undefined;
}

export interface CloseCashCommand {
  sessionId: string;
  version: number;
  requestId: string;
  countedCash: number;
  notes?: string | undefined;
}

export interface ReopenCashCommand {
  sessionId: string;
  version: number;
  reason: string;
}

export interface CashClosingResult {
  id: string;
  sequence: number;
  expectedCash: number;
  countedCash: number;
  difference: number;
}

/** Puerto del corte de caja. Web y móvil usan el mismo adaptador (`@meguiars/supabase`). */
export interface CashRepository {
  list(detailCenterIds: string[], from: string, to: string): Promise<Result<CashSessionListItem[]>>;
  get(id: string): Promise<Result<CashSession>>;
  uncovered(detailCenterIds: string[], from: string, to: string): Promise<Result<CashUncovered[]>>;
  open(command: OpenCashCommand): Promise<Result<{ id: string; folio: string }>>;
  close(command: CloseCashCommand): Promise<Result<CashClosingResult>>;
  reopen(command: ReopenCashCommand): Promise<Result<{ id: string; version: number }>>;
}
