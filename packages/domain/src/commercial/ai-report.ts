import { utcToZoned } from "../agenda/zoned-time";
import type { Result } from "../result";

/**
 * Reporte comercial redactado por IA (ADR 0051). Claude recibe sólo las cifras
 * ya calculadas con @meguiars/analytics (las mismas que muestra la pantalla de
 * Reportes comerciales) y escribe el resumen, hallazgos, riesgos y acciones.
 * No calcula KPIs nuevos ni inventa cifras.
 */

export const COMMERCIAL_AI_MODEL = "claude-opus-5-5";
export const COMMERCIAL_AI_MAX_ITEMS = 5;

/** Fila de un desglose (canal, responsable o centro) con valores ya formateados. */
export interface CommercialSnapshotRow {
  label: string;
  leads: number;
  quoted: number;
  booked: number;
  won: number;
  leadToBooking: string;
  firstResponse: string;
  sales: string;
  margin: string;
}

/** Lo que la IA lee: periodo, KPIs con su fórmula y desgloses. */
export interface CommercialReportSnapshot {
  periodLabel: string;
  from: string;
  to: string;
  centers: string[];
  kpis: { name: string; formula: string; value: string }[];
  bySource: CommercialSnapshotRow[];
  byOwner: CommercialSnapshotRow[];
  byCenter: CommercialSnapshotRow[];
  losses: { label: string; count: number }[];
}

export interface CommercialAiContent {
  summary: string;
  highlights: string[];
  risks: string[];
  actions: string[];
}

export type CommercialAiStatus = "pendiente" | "listo" | "fallido";

export interface CommercialAiReport extends CommercialAiContent {
  id: string;
  detailCenterId: string;
  periodLabel: string;
  periodFrom: string;
  periodTo: string;
  scopeLabel: string;
  status: CommercialAiStatus;
  error: string | null;
  model: string | null;
  createdAt: string;
}

export interface StartCommercialAiReportCommand {
  detailCenterId: string;
  centerIds: string[];
  from: string;
  to: string;
  periodLabel: string;
  scopeLabel: string;
  requestId: string;
}

export interface CommercialAiReportRepository {
  /** Últimos reportes visibles del centro (RLS: métricas de todos los centros del alcance). */
  list(detailCenterId: string, limit?: number): Promise<Result<CommercialAiReport[]>>;
  /** Paso 1 con la sesión del usuario: valida permisos y deja el reporte pendiente. */
  start(command: StartCommercialAiReportCommand): Promise<Result<{ id: string }>>;
}

const SYSTEM_PROMPT = `Eres analista comercial de Meguiar's Detail Center (lavado y detallado automotriz en México).
Escribes el reporte comercial del periodo para el dueño y los encargados, en español de México, claro y directo.

Reglas:
- Usa sólo las cifras del bloque de datos, tal como vienen. No calcules KPIs nuevos, no estimes ni inventes números, clientes o causas que los datos no muestren.
- Cuando cites una cifra, cópiala igual (con su formato) y di de qué es.
- Si hay pocos datos (por ejemplo, menos de 10 prospectos) dilo en el resumen y no saques conclusiones fuertes.
- "Sin datos" significa que no hubo casos; no lo trates como cero ni como mala señal.
- summary: 2 a 4 oraciones con lo más importante del periodo.
- highlights: hasta ${COMMERCIAL_AI_MAX_ITEMS} hallazgos concretos (qué canal, responsable o centro destaca y por qué).
- risks: hasta ${COMMERCIAL_AI_MAX_ITEMS} riesgos o focos rojos (respuesta lenta, conversión baja, motivos de pérdida repetidos).
- actions: hasta ${COMMERCIAL_AI_MAX_ITEMS} acciones concretas para la próxima semana, cada una con a quién le toca (rol o responsable) y qué medir.
- Cada elemento de una lista es una oración corta, sin viñetas ni numeración.`;

/** Instrucciones (fijas) y datos del periodo para la IA. */
export function commercialAiPrompt(snapshot: CommercialReportSnapshot): { system: string; user: string } {
  return {
    system: SYSTEM_PROMPT,
    user: `Datos comerciales del periodo (JSON):\n${JSON.stringify(snapshot)}`,
  };
}

/** Recorta la respuesta de la IA a los límites que guarda la base. */
export function normalizeCommercialAiContent(content: CommercialAiContent): CommercialAiContent {
  const list = (xs: string[]) =>
    xs
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, COMMERCIAL_AI_MAX_ITEMS)
      .map((x) => x.slice(0, 400));
  return {
    summary: content.summary.trim().slice(0, 2000),
    highlights: list(content.highlights),
    risks: list(content.risks),
    actions: list(content.actions),
  };
}

export const COMMERCIAL_AI_COPY = {
  title: "Reporte con IA",
  description:
    "La IA lee los KPIs de este reporte (mismo periodo y alcance) y escribe el resumen, hallazgos, riesgos y acciones. No calcula cifras propias.",
  generate: "Generar reporte con IA",
  generating: "Generando reporte… (tarda unos segundos)",
  summary: "Resumen",
  highlights: "Hallazgos",
  risks: "Riesgos",
  actions: "Acciones sugeridas",
  history: "Reportes anteriores",
  empty: "Aún no hay reportes con IA de este centro.",
  failed: "No se pudo generar",
  pending: "En proceso",
  notConfigured: "La IA no está configurada en el servidor (ANTHROPIC_API_KEY).",
  disclaimer: "Texto generado por IA a partir de los KPIs; revisa las cifras en la tabla antes de decidir.",
} as const;

/** Reporte listo para mostrar con la fecha en la zona del centro. */
export function presentCommercialAiReport(report: CommercialAiReport, timeZone: string) {
  const at = utcToZoned(report.createdAt, timeZone);
  return {
    ...report,
    createdLabel: `${at.date} ${at.time}`,
    heading: `${report.periodLabel} · ${report.scopeLabel}`,
    statusLabel:
      report.status === "listo"
        ? null
        : report.status === "pendiente"
          ? COMMERCIAL_AI_COPY.pending
          : `${COMMERCIAL_AI_COPY.failed}${report.error ? `: ${report.error}` : ""}`,
  };
}
