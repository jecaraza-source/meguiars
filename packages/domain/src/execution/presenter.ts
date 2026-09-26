import { formatDuration, formatMoney } from "../catalog/presenter";
import type { ServiceOrderStatus } from "../orders/order";
import { formatInCenterTimeZone } from "../time";
import {
  EVIDENCE_KIND_LABELS,
  EXECUTION_EVENT_LABELS,
  executionCopy,
  INCIDENT_KIND_LABELS,
  ITEM_WORK_LABELS,
  ITEM_WORK_TONES,
} from "./copy";
import type {
  Consumption,
  Evidence,
  ExecutionEvent,
  ExecutionLine,
  Incident,
  ItemWorkStatus,
} from "./execution";
import {
  canWorkItems,
  consumptionVariance,
  expectedQuantity,
  ITEM_WORK_TRANSITIONS,
  lineWorkedMinutes,
} from "./execution";

const ACTION_LABEL = (from: ItemWorkStatus, to: ItemWorkStatus) =>
  to === "en_proceso"
    ? from === "pausada"
      ? executionCopy.resume
      : executionCopy.start
    : to === "pausada"
      ? executionCopy.pause
      : executionCopy.finish;

/** Acciones de una línea (vacío si la OS no está en proceso). */
export function lineWorkActions(line: Pick<ExecutionLine, "workStatus">, orderStatus: ServiceOrderStatus) {
  if (!canWorkItems(orderStatus)) return [];
  return ITEM_WORK_TRANSITIONS[line.workStatus]
    .filter((to): to is Exclude<ItemWorkStatus, "pendiente"> => to !== "pendiente")
    .map((to) => ({ to, label: ACTION_LABEL(line.workStatus, to), primary: to === "en_proceso" }));
}

const unitCostFormat = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** Costo por unidad de insumo (hasta 4 decimales: $0.0625 por ml). */
export const formatUnitCost = (amount: number): string => unitCostFormat.format(amount);

const qty = (n: number, unit: string) =>
  `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(n)} ${unit}`;

export function presentLine(line: ExecutionLine, technicianName: (id: string) => string, now = new Date()) {
  return {
    id: line.id,
    name: `${line.serviceName} · ${line.serviceCode}` + (line.quantity > 1 ? ` × ${line.quantity}` : ""),
    status: ITEM_WORK_LABELS[line.workStatus],
    tone: ITEM_WORK_TONES[line.workStatus],
    worked: formatDuration(lineWorkedMinutes(line, now)),
    technician: line.technicianId ? technicianName(line.technicianId) : executionCopy.noTechnician,
    running: line.workStatus === "en_proceso",
  };
}

/** Filas de consumo por línea: cada insumo configurado con su estándar y, si existe, el real. */
export function consumptionRows(lines: readonly ExecutionLine[], consumptions: readonly Consumption[]) {
  return lines.flatMap((line) =>
    line.standards.map((std) => {
      const recorded = consumptions.find(
        (c) => c.itemId === line.id && c.inventoryItemId === std.inventoryItemId,
      );
      const standard = recorded?.standardQuantity ?? expectedQuantity(std, line.quantity);
      const variance = recorded ? consumptionVariance(recorded) : null;
      return {
        key: `${line.id}:${std.inventoryItemId}`,
        itemId: line.id,
        inventoryItemId: std.inventoryItemId,
        line: line.serviceName,
        supply: `${std.name} · ${std.code}`,
        unit: std.unit,
        standard: qty(standard, std.unit),
        actual: recorded ? qty(recorded.actualQuantity, std.unit) : "—",
        actualValue: recorded ? String(recorded.actualQuantity) : "",
        variance: variance
          ? `${variance.quantity > 0 ? "+" : ""}${qty(variance.quantity, std.unit)} (${variance.percent > 0 ? "+" : ""}${variance.percent}%) · ${formatMoney(variance.cost)}`
          : "—",
        over: variance ? variance.quantity > 0 : false,
      };
    }),
  );
}

export function presentEvidence(e: Evidence, lineName: (id: string) => string, timeZone: string) {
  return {
    id: e.id,
    url: e.signedUrl,
    kind: EVIDENCE_KIND_LABELS[e.kind],
    caption: [EVIDENCE_KIND_LABELS[e.kind], e.itemId ? lineName(e.itemId) : null, e.note]
      .filter(Boolean)
      .join(" · "),
    when: formatInCenterTimeZone(e.createdAt, timeZone),
    size: `${Math.round(e.sizeBytes / 1024)} KB` + (e.width && e.height ? ` · ${e.width}×${e.height}` : ""),
  };
}

export function presentIncident(i: Incident, lineName: (id: string) => string, timeZone: string) {
  return {
    id: i.id,
    title: `${INCIDENT_KIND_LABELS[i.kind]}${i.itemId ? ` · ${lineName(i.itemId)}` : ""}`,
    description: i.description,
    status: i.status === "abierta" ? executionCopy.incidentOpen : executionCopy.incidentResolved,
    tone: i.status === "abierta" ? ("danger" as const) : ("success" as const),
    resolution: i.resolution,
    when: formatInCenterTimeZone(i.createdAt, timeZone),
    open: i.status === "abierta",
  };
}

export function presentEvent(
  e: ExecutionEvent,
  names: { line: (id: string) => string; technician: (id: string) => string },
  timeZone: string,
) {
  return {
    key: String(e.id),
    when: formatInCenterTimeZone(e.occurredAt, timeZone),
    what: [
      EXECUTION_EVENT_LABELS[e.kind],
      e.itemId ? names.line(e.itemId) : null,
      e.technicianId ? names.technician(e.technicianId) : null,
    ]
      .filter(Boolean)
      .join(" · "),
    note: e.note ?? "—",
  };
}
