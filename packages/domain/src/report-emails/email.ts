import type { PresentedCard, PresentedCell, TrendTone } from "../corporate/presenter";
import {
  REPORT_FREQUENCY_LABELS,
  reportPeriodLabel,
  type ReportFrequency,
  type ReportPeriod,
} from "./report-emails";

/**
 * Correo del reporte de Dirección: HTML con estilos en línea (los clientes de
 * correo ignoran hojas de estilo) y versión de texto. Las cifras son las del
 * Tablero corporativo ya presentadas (presentCorporateCard), así que el correo
 * dice exactamente lo mismo que la pantalla. Los colores llegan como
 * parámetro desde @meguiars/ui-tokens (el dominio no depende del design system).
 */

export interface ReportEmailPalette {
  background: string;
  surface: string;
  foreground: string;
  muted: string;
  border: string;
  brand: string;
  brandForeground: string;
  accent: string;
  success: string;
  danger: string;
  dangerSurface: string;
}

export interface ReportEmailSizes {
  space: { xs: number; sm: number; md: number; lg: number; xl: number };
  fontSize: { xs: number; sm: number; md: number; lg: number; xl: number };
  radius: { md: number };
  content: number;
}

export interface ReportEmailInput {
  name: string;
  frequency: ReportFrequency;
  period: ReportPeriod;
  previous: ReportPeriod;
  centers: readonly { id: string; name: string }[];
  cards: readonly PresentedCard[];
  /** Enlace al tablero con el mismo periodo y centros (null si no hay URL pública). */
  boardUrl: string | null;
}

/** Más centros que esto: sólo el consolidado (el detalle queda en el tablero). */
export const REPORT_EMAIL_MAX_CENTER_COLUMNS = 6;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const toneColor = (tone: TrendTone, p: ReportEmailPalette) =>
  tone === "good" ? p.success : tone === "bad" ? p.danger : p.muted;

export function renderReportEmail(
  input: ReportEmailInput,
  p: ReportEmailPalette,
  z: ReportEmailSizes,
): { html: string; text: string } {
  const px = (n: number) => `${n}px`;
  const periodLabel = reportPeriodLabel(input.period);
  const previousLabel = reportPeriodLabel(input.previous);
  const okCards = input.cards.filter((c) => c.status === "ok" && c.consolidated);
  const withCenters = input.centers.length > 1 && input.centers.length <= REPORT_EMAIL_MAX_CENTER_COLUMNS;
  const alerts = okCards.flatMap((c) =>
    [c.consolidated!, ...c.centers]
      .filter((cell) => cell.alert)
      .map((cell) => ({ card: c.name, cell: cell.label, text: cell.alert!.text, value: cell.value })),
  );
  const notes = [...new Set(input.cards.flatMap((c) => c.notes))];
  const forbidden = input.cards.filter((c) => c.status !== "ok").map((c) => c.name);

  const cellStyle = `padding:${px(z.space.sm)} ${px(z.space.md)};border-bottom:1px solid ${p.border};`;
  const head = `${cellStyle}text-align:left;font-size:${px(z.fontSize.xs)};color:${p.muted};font-weight:600;`;
  const num = `${cellStyle}text-align:right;white-space:nowrap;`;
  const trend = (c: PresentedCell) =>
    `<div style="font-size:${px(z.fontSize.xs)};color:${toneColor(c.trend.tone, p)}">${esc(c.trend.text)}</div>`;
  const valueCell = (c: PresentedCell | undefined) =>
    c
      ? `<td style="${num}${c.alert ? `background:${p.dangerSurface};` : ""}"><strong>${esc(c.value)}</strong>${trend(c)}</td>`
      : `<td style="${num}color:${p.muted}">Sin datos</td>`;

  const summaryRows = okCards
    .map((c) => {
      const byCenter = new Map(c.centers.map((cell) => [cell.key, cell]));
      const centerCells = withCenters
        ? input.centers.map((ctr) => valueCell(byCenter.get(ctr.id))).join("")
        : "";
      return `<tr><td style="${cellStyle}">${esc(c.name)}</td>${valueCell(c.consolidated!)}${centerCells}</tr>`;
    })
    .join("");
  const centerHeads = withCenters
    ? input.centers.map((ctr) => `<th style="${head}text-align:right">${esc(ctr.name)}</th>`).join("")
    : "";

  const alertsHtml =
    alerts.length === 0
      ? ""
      : `<h2 style="font-size:${px(z.fontSize.md)};margin:${px(z.space.xl)} 0 ${px(z.space.sm)};color:${p.danger}">Alertas de umbral (${alerts.length})</h2>
<ul style="margin:0;padding-left:${px(z.space.lg)};color:${p.foreground}">${alerts
          .map((a) => `<li>${esc(a.card)} · ${esc(a.cell)}: ${esc(a.value)} — ${esc(a.text)}</li>`)
          .join("")}</ul>`;
  const notesHtml = [...notes, ...(forbidden.length ? [`Sin permiso: ${forbidden.join(", ")}`] : [])]
    .map(
      (n) =>
        `<p style="font-size:${px(z.fontSize.xs)};color:${p.muted};margin:${px(z.space.xs)} 0">${esc(n)}</p>`,
    )
    .join("");
  const button = input.boardUrl
    ? `<p style="margin:${px(z.space.xl)} 0"><a href="${esc(input.boardUrl)}" style="background:${p.brand};color:${p.brandForeground};padding:${px(z.space.md)} ${px(z.space.lg)};border-radius:${px(z.radius.md)};text-decoration:none;font-weight:600">Abrir el Tablero corporativo</a></p>`
    : "";
  const centersText =
    input.centers.length > REPORT_EMAIL_MAX_CENTER_COLUMNS
      ? `${input.centers.length} centros (consolidado; el detalle por centro está en el tablero)`
      : input.centers.map((c) => c.name).join(", ");

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(input.name)}</title></head>
<body style="margin:0;background:${p.surface};font-family:Arial,Helvetica,sans-serif;color:${p.foreground}">
<div style="max-width:${px(z.content)};margin:0 auto;padding:${px(z.space.lg)}">
<div style="background:${p.background};border:1px solid ${p.border};border-radius:${px(z.radius.md)};padding:${px(z.space.xl)}">
<p style="margin:0;font-size:${px(z.fontSize.xs)};font-weight:700;letter-spacing:1px;color:${p.accent}">MEGUIAR'S · REPORTE ${esc(REPORT_FREQUENCY_LABELS[input.frequency].toUpperCase())}</p>
<h1 style="margin:${px(z.space.xs)} 0 0;font-size:${px(z.fontSize.xl)}">${esc(input.name)}</h1>
<p style="margin:${px(z.space.sm)} 0 0;color:${p.muted};font-size:${px(z.fontSize.sm)}">${esc(periodLabel)} · comparado con ${esc(previousLabel)}<br>${esc(centersText)}</p>
${
  okCards.length === 0
    ? `<p style="margin:${px(z.space.xl)} 0">Sin datos para este periodo.</p>`
    : `<div style="overflow-x:auto;margin-top:${px(z.space.lg)}"><table role="presentation" style="border-collapse:collapse;width:100%;font-size:${px(z.fontSize.sm)}">
<thead><tr><th style="${head}">Indicador</th><th style="${head}text-align:right">Consolidado</th>${centerHeads}</tr></thead>
<tbody>${summaryRows}</tbody></table></div>`
}
<p style="font-size:${px(z.fontSize.xs)};color:${p.muted};margin:${px(z.space.sm)} 0 0">▲▼ contra ${esc(previousLabel)}: verde = mejor, rojo = peor. Fondo rojo = fuera del umbral configurado.</p>
${alertsHtml}
${notesHtml}
${button}
<p style="font-size:${px(z.fontSize.xs)};color:${p.muted};margin:${px(z.space.lg)} 0 0;border-top:1px solid ${p.border};padding-top:${px(z.space.md)}">Correo automático para Dirección. Destinatarios y frecuencia: Dirección → Reportes por correo.</p>
</div></div></body></html>`;

  const lines = [
    `MEGUIAR'S · REPORTE ${REPORT_FREQUENCY_LABELS[input.frequency].toUpperCase()}`,
    input.name,
    `${periodLabel} · comparado con ${previousLabel}`,
    centersText,
    "",
    ...(okCards.length === 0
      ? ["Sin datos para este periodo."]
      : okCards.map((c) => {
          const centers = withCenters
            ? c.centers.map((cell) => `\n    ${cell.label}: ${cell.value} (${cell.trend.text})`).join("")
            : "";
          return `- ${c.name}: ${c.consolidated!.value} (${c.consolidated!.trend.text})${c.consolidated!.alert ? " ⚠" : ""}${centers}`;
        })),
    ...(alerts.length
      ? ["", "Alertas de umbral:", ...alerts.map((a) => `- ${a.card} · ${a.cell}: ${a.text}`)]
      : []),
    ...(notes.length || forbidden.length
      ? ["", ...notes, ...(forbidden.length ? [`Sin permiso: ${forbidden.join(", ")}`] : [])]
      : []),
    ...(input.boardUrl ? ["", `Tablero corporativo: ${input.boardUrl}`] : []),
    "",
    "Correo automático para Dirección. Destinatarios y frecuencia: Dirección → Reportes por correo.",
  ];
  return { html, text: lines.join("\n") };
}
