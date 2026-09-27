import { formatMoney } from "../catalog/presenter";
import { formatDateOnly } from "../memberships/presenter";
import { PNL_ITEM_LABELS, PNL_SECTION_LABELS, PNL_SOURCE_LABELS } from "./copy";
import { PNL_SECTIONS, type PnlDrillQuery, type PnlMovement, type PnlSectionKey } from "./pnl";

export const formatPercent = (p: number | null) => (p === null ? "—" : `${p.toFixed(1)} %`);

/** Etiqueta de una línea o dimensión del P&L. */
export const pnlItemLabel = (key: string | null | undefined) =>
  key ? (PNL_ITEM_LABELS[key] ?? key) : "Sin clasificar";

/** Título del drill-down: "Ventas · Ventas B2C (OS) · Premium". */
export function pnlDrillTitle(q: Pick<PnlDrillQuery, "section" | "line" | "dimension">): string {
  return [
    PNL_SECTION_LABELS[q.section],
    q.line ? pnlItemLabel(q.line) : null,
    q.dimension && q.dimension !== "-" ? pnlItemLabel(q.dimension) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Parámetros del drill-down (URL web y navegación móvil). */
export function pnlDrillParams(
  drill: { section: string; line?: string | undefined; dimension?: string | undefined },
  period: { from: string; to: string; all: boolean },
): string {
  const q = new URLSearchParams({ seccion: drill.section, desde: period.from, hasta: period.to });
  if (drill.line) q.set("linea", drill.line);
  if (drill.dimension) q.set("dimension", drill.dimension);
  if (period.all) q.set("alcance", "todos");
  return q.toString();
}

/** Lee el drill-down desde la URL (null si la sección no es válida). */
export function parsePnlDrill(params: Record<string, string | string[] | undefined>) {
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const section = one("seccion");
  if (!section || !(PNL_SECTIONS as readonly string[]).includes(section)) return null;
  return {
    section: section as PnlSectionKey,
    line: one("linea"),
    dimension: one("dimension"),
    from: one("desde"),
    to: one("hasta"),
    all: one("alcance") === "todos",
  };
}

export function presentPnlMovement(m: PnlMovement, centerName: string, href: string | null) {
  return {
    key: `${m.source}:${m.sourceId}:${m.line}:${m.dimension ?? ""}:${m.description}`,
    date: formatDateOnly(m.occurredOn),
    center: centerName,
    source: PNL_SOURCE_LABELS[m.source],
    reference: m.reference,
    description: m.description,
    item: m.dimension ? pnlItemLabel(m.dimension) : pnlItemLabel(m.line),
    amount: formatMoney(m.amount),
    href,
  };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n");
/** Importe para CSV: sin símbolo ni separador de miles, punto decimal (Excel-friendly). */
const num = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/**
 * CSV del estado de resultados: una fila por línea y dos columnas (importe y %)
 * por centro y consolidado. Mismo contenido en web (descarga) y móvil (compartir).
 */
export function pnlStatementCsv(
  columns: readonly {
    name: string;
    lines: readonly { key: string; label: string; amount: number; percent: number | null }[];
  }[],
  period: { from: string; to: string },
): string {
  const keys = columns[0]?.lines.map((l) => [l.key, l.label] as const) ?? [];
  const header = [
    "concepto",
    "clave",
    ...columns.flatMap((c) => [`${c.name} importe`, `${c.name} % ventas`]),
  ];
  const rows = keys.map(([key, label]) => [
    label,
    key,
    ...columns.flatMap((c) => {
      const l = c.lines.find((x) => x.key === key);
      return [
        num(l?.amount ?? 0),
        l?.percent === null || l?.percent === undefined ? "" : l.percent.toFixed(2),
      ];
    }),
  ]);
  return csv([[`Estado de resultados ${period.from} a ${period.to}`], header, ...rows]);
}

/** CSV de los movimientos de una cifra (drill-down). */
export function pnlMovementsCsv(
  rows: readonly PnlMovement[],
  centerName: (id: string) => string,
  title: string,
): string {
  return csv([
    [title],
    ["fecha", "centro", "origen", "referencia", "detalle", "seccion", "linea", "dimension", "importe"],
    ...rows.map((m) => [
      m.occurredOn,
      centerName(m.detailCenterId),
      PNL_SOURCE_LABELS[m.source],
      m.reference,
      m.description,
      m.section,
      m.line,
      m.dimension ?? "",
      num(m.amount),
    ]),
  ]);
}

/** Mensaje de error del P&L para la UI. */
export function pnlErrorMessage(error: { kind: string; message: string }): string {
  if (error.kind === "unavailable") return "Sin conexión: el estado de resultados requiere internet.";
  if (error.kind === "permission_denied" && !error.message)
    return "Sin permiso para ver el estado de resultados.";
  return error.message;
}
