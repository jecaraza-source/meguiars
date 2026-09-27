import { addDays } from "../agenda/zoned-time";
import { formatMoney } from "../catalog/presenter";
import { formatDateOnly } from "../memberships/presenter";
import { formatInCenterTimeZone, formatTimeInCenterTimeZone } from "../time";
import {
  cashDifference,
  closingVerified,
  currentClosing,
  type CashClosing,
  type CashMovement,
  type CashSession,
  type CashSessionListItem,
  type CashTotals,
} from "./cash";
import {
  CASH_DIFFERENCE_LABELS,
  CASH_DIFFERENCE_TONES,
  CASH_SESSION_STATUS_LABELS,
  CASH_SESSION_STATUS_TONES,
  CASH_SHIFT_LABELS,
  cashCopy,
} from "./copy";

/** Diferencia con signo: "−$50.00 · Faltante". */
export function formatDifference(difference: number) {
  const { kind } = cashDifference(difference, 0);
  const sign = difference > 0 ? "+" : difference < 0 ? "−" : "";
  return {
    text: `${sign}${formatMoney(Math.abs(difference))} · ${CASH_DIFFERENCE_LABELS[kind]}`,
    tone: CASH_DIFFERENCE_TONES[kind],
    kind,
  };
}

export function presentCashRow(s: CashSessionListItem) {
  const diff = s.difference === null ? null : formatDifference(s.difference);
  return {
    id: s.id,
    folio: s.folio,
    day: formatDateOnly(s.businessDate),
    shift: CASH_SHIFT_LABELS[s.shift],
    status: CASH_SESSION_STATUS_LABELS[s.status],
    statusTone: CASH_SESSION_STATUS_TONES[s.status],
    expected: formatMoney(s.expectedCash),
    counted: s.countedCash === null ? "—" : formatMoney(s.countedCash),
    difference: diff?.text ?? "—",
    differenceTone: diff?.tone ?? "neutral",
    card: formatMoney(s.cardTotal),
    transfer: formatMoney(s.transferTotal),
    versions: s.reopeningsCount > 0 ? `v${s.closingsCount} · ${s.reopeningsCount} reapertura(s)` : null,
  };
}

export function presentCashTotals(t: CashTotals) {
  return {
    openingFloat: formatMoney(t.openingFloat),
    cashCollected: formatMoney(t.cashCollected),
    cashRefunded: formatMoney(t.cashRefunded),
    expected: formatMoney(t.expectedCash),
    card: formatMoney(t.cardTotal),
    transfer: formatMoney(t.transferTotal),
    nonCash: formatMoney(t.nonCashTotal),
    counts: `${t.paymentsCount} ${cashCopy.payments.toLowerCase()} · ${t.reversalsCount} ${cashCopy.reversals.toLowerCase()}`,
    methods: t.breakdown
      .filter((f) => f.collected !== 0 || f.refunded !== 0)
      .map((f) => ({
        method: f.method,
        name: f.name,
        collected: formatMoney(f.collected),
        refunded: f.refunded ? formatMoney(f.refunded) : "—",
        net: formatMoney(f.collected - f.refunded),
        inDrawer: f.kind === "efectivo",
      })),
  };
}

export function presentCashSession(s: CashSession) {
  const tz = s.centerTimezone;
  const last = currentClosing(s);
  const verified = closingVerified(s);
  const windowText = `${formatInCenterTimeZone(s.openedAt, tz)} – ${
    s.windowEnd ? formatTimeInCenterTimeZone(s.windowEnd, tz) : cashCopy.live.toLowerCase()
  }`;
  return {
    title: `${s.folio} · ${CASH_SHIFT_LABELS[s.shift]}`,
    center: s.centerName,
    day: formatDateOnly(s.businessDate),
    shift: CASH_SHIFT_LABELS[s.shift],
    status: CASH_SESSION_STATUS_LABELS[s.status],
    statusTone: CASH_SESSION_STATUS_TONES[s.status],
    window: windowText,
    openedBy: `${s.openedByName ?? "—"} · ${formatInCenterTimeZone(s.openedAt, tz)}`,
    closedBy: s.closedAt ? `${s.closedByName ?? "—"} · ${formatInCenterTimeZone(s.closedAt, tz)}` : null,
    totals: presentCashTotals(last && s.status !== "abierta" ? last : s.live),
    counted: last && s.status !== "abierta" ? formatMoney(last.countedCash) : null,
    difference: last && s.status !== "abierta" ? formatDifference(last.difference) : null,
    closingNotes: last?.notes ?? null,
    verified:
      verified === null ? null : { ok: verified, text: verified ? cashCopy.verified : cashCopy.notVerified },
  };
}

export function presentClosing(c: CashClosing, timeZone: string) {
  return {
    title: `v${c.sequence} · ${formatInCenterTimeZone(c.closedAt, timeZone)}`,
    who: c.closedByName ?? "—",
    expected: formatMoney(c.expectedCash),
    counted: formatMoney(c.countedCash),
    difference: formatDifference(c.difference),
    notes: c.notes,
  };
}

export function presentMovement(m: CashMovement, timeZone: string) {
  const sign = m.kind === "reverso" ? "−" : "";
  return {
    when: formatTimeInCenterTimeZone(m.at, timeZone),
    what: m.kind === "reverso" ? `Reverso ${m.folio}` : m.folio,
    methods: m.methods,
    amount: `${sign}${formatMoney(m.amount)}`,
    cash: m.cash ? `${sign}${formatMoney(m.cash)}` : "—",
    reversedLater: m.kind === "cobro" && m.status === "revertido",
  };
}

/**
 * Resumen del corte para compartir o imprimir (texto plano, idéntico en web y
 * móvil). Usa el último cierre si el corte está cerrado; si no, los totales al momento.
 */
export function cashSummaryText(s: CashSession): string {
  const p = presentCashSession(s);
  const lines = [
    `${cashCopy.summaryTitle} ${s.folio}`,
    `${s.centerName} · ${p.day} · ${p.shift}`,
    `${cashCopy.status}: ${p.status}`,
    `${cashCopy.window}: ${p.window}`,
    `${cashCopy.openedBy}: ${p.openedBy}`,
    ...(p.closedBy ? [`${cashCopy.closedBy}: ${p.closedBy}`] : []),
    "",
    `${cashCopy.openingFloat.replace(" (MXN)", "")}: ${p.totals.openingFloat}`,
    `${cashCopy.cashCollected}: ${p.totals.cashCollected}`,
    `${cashCopy.cashRefunded}: −${p.totals.cashRefunded}`,
    `${cashCopy.expected}: ${p.totals.expected}`,
    ...(p.counted ? [`${cashCopy.counted}: ${p.counted}`] : []),
    ...(p.difference ? [`${cashCopy.difference}: ${p.difference.text}`] : []),
    ...(p.closingNotes ? [`Nota: ${p.closingNotes}`] : []),
    "",
    `${cashCopy.reconciliation}:`,
    `  ${cashCopy.card}: ${p.totals.card}`,
    `  ${cashCopy.transfer}: ${p.totals.transfer}`,
    `  ${cashCopy.nonCash}: ${p.totals.nonCash}`,
    `  ${p.totals.counts}`,
  ];
  if (s.reopenings.length > 0) {
    lines.push("", `${cashCopy.reopenings}:`);
    for (const r of s.reopenings) {
      lines.push(
        `  v${r.sequence} · ${formatInCenterTimeZone(r.reopenedAt, s.centerTimezone)} · ${r.reopenedByName ?? "—"}: ${r.reason}`,
      );
    }
  }
  if (p.verified) lines.push("", p.verified.text);
  return lines.join("\n");
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV del corte: una fila por versión del cierre y por forma de pago (web y móvil). */
export function cashSummaryCsv(s: CashSession): string {
  const rows: (string | number)[][] = [
    ["folio", "centro", "dia", "turno", "estado", "concepto", "detalle", "importe"],
  ];
  const base = [s.folio, s.centerName, s.businessDate, s.shift, s.status];
  const totals = currentClosing(s) && s.status !== "abierta" ? currentClosing(s)! : s.live;
  rows.push([...base, "fondo_inicial", "", totals.openingFloat]);
  rows.push([...base, "efectivo_cobrado", "", totals.cashCollected]);
  rows.push([...base, "reembolsos_efectivo", "", -totals.cashRefunded]);
  rows.push([...base, "efectivo_esperado", "", totals.expectedCash]);
  for (const f of totals.breakdown) {
    if (f.collected === 0 && f.refunded === 0) continue;
    rows.push([...base, "forma_de_pago", f.method, Math.round((f.collected - f.refunded) * 100) / 100]);
  }
  for (const c of s.closings) {
    rows.push([...base, `cierre_v${c.sequence}_contado`, c.notes ?? "", c.countedCash]);
    rows.push([...base, `cierre_v${c.sequence}_diferencia`, c.closedAt, c.difference]);
  }
  for (const r of s.reopenings) {
    rows.push([...base, `reapertura_v${r.sequence}`, r.reason, 0]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

export const CASH_RANGES = ["hoy", "7", "30"] as const;
export type CashRangeKey = (typeof CASH_RANGES)[number];
export const CASH_RANGE_LABELS: Record<CashRangeKey, string> = {
  hoy: cashCopy.rangeToday,
  "7": cashCopy.range7,
  "30": cashCopy.range30,
};

/** Rango del listado a partir de la fecha del centro (AAAA-MM-DD). */
export function cashRange(key: CashRangeKey, today: string): { from: string; to: string } {
  if (key === "hoy") return { from: today, to: today };
  return { from: addDays(today, key === "7" ? -6 : -29), to: today };
}

/** Mensaje de error del corte para la UI. */
export function cashErrorMessage(error: { kind: string; code?: string; message: string }): string {
  if (error.code === "40001" && !error.message)
    return "El corte cambió en otro dispositivo; recarga para ver la versión actual";
  if (error.kind === "unavailable") return cashCopy.onlineOnly;
  if (error.kind === "permission_denied" && !error.message) return cashCopy.forbidden;
  return error.message;
}
