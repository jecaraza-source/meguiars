import type { ButtonVariant, ControlSize, Tone } from "./recipes";

/**
 * Contratos de componentes: las props que web (DOM) y móvil (React Native)
 * implementan igual. El render es propio de cada plataforma; el
 * comportamiento y la semántica son los mismos.
 */
export interface ButtonContract {
  label: string;
  variant?: ButtonVariant;
  size?: ControlSize;
  loading?: boolean;
  disabled?: boolean;
}

export interface FieldContract {
  /** Siempre visible: los campos nunca dependen sólo del placeholder. */
  label: string;
  error?: string | undefined;
  hint?: string;
  required?: boolean;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectContract extends FieldContract {
  options: readonly SelectOption[];
  value?: string;
  placeholder?: string;
}

export interface BadgeContract {
  label: string;
  tone?: Tone;
}

export interface CardContract {
  title?: string;
  subtitle?: string;
}

export interface ColumnContract<Row> {
  key: string;
  header: string;
  value: (row: Row) => string;
  align?: "start" | "end";
}

export interface TableContract<Row> {
  /** Resumen accesible de la tabla (caption). */
  caption: string;
  columns: readonly ColumnContract<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  emptyMessage: string;
}

export interface SheetContract {
  open: boolean;
  title: string;
  onClose: () => void;
}

export interface ToastContract {
  message: string;
  tone?: Tone;
  durationMs?: number;
}

export const TOAST_DURATION_MS = 4000;

export interface SkeletonContract {
  /** Líneas de texto simuladas. */
  lines?: number;
  /** Etiqueta para lectores de pantalla. */
  label?: string;
}

export interface EmptyStateContract {
  title: string;
  message?: string;
}

export type Trend = "up" | "down" | "flat";

export interface KpiContract {
  label: string;
  value: string;
  /** Variación como fracción (0.125 = +12.5 %). */
  delta?: number;
  /** Si subir es bueno (ventas) o malo (tiempos de espera). */
  higherIsBetter?: boolean;
  caption?: string;
}

export function kpiTrend(delta: number | undefined): Trend {
  if (delta === undefined || Math.abs(delta) < 0.0005) return "flat";
  return delta > 0 ? "up" : "down";
}

/** Tono del cambio según si subir es bueno o malo; plano es neutral. */
export function kpiDeltaTone(delta: number | undefined, higherIsBetter = true): Tone {
  const trend = kpiTrend(delta);
  if (trend === "flat") return "neutral";
  return (trend === "up") === higherIsBetter ? "success" : "danger";
}

export function formatKpiDelta(delta: number | undefined, locale = "es-MX"): string {
  if (delta === undefined) return "";
  const pct = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  });
  return pct.format(delta);
}

/** Símbolo accesible de tendencia (acompaña al texto, nunca lo sustituye). */
export const TREND_SYMBOL: Record<Trend, string> = { up: "▲", down: "▼", flat: "■" };
