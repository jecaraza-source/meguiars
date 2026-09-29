import {
  resolveDashboardFilters,
  dashboardFilterParams,
  type DashboardChannelKey,
  type DashboardFilters,
} from "../dashboards/dashboards";

/**
 * Dirección / Tablero corporativo (D3). Espejo de la migración
 * 20261016000000_corporate_board.sql. El cálculo (tarjetas, comparativo,
 * tendencia, ranking y drill-down) vive en @meguiars/analytics
 * (corporateBoard, corporateMix, corporateDrill); aquí están los umbrales, la
 * navegación del drill-down (URL web = parámetros de la pantalla móvil), los
 * filtros y el puerto, iguales en web y móvil.
 */

/** Umbral de alerta visual (public.kpi_thresholds). */
export interface KpiThreshold {
  id: string;
  organizationId: string;
  metricId: string;
  /** Canal fijo de la tarjeta (p. ej. Venta B2B). */
  channel: DashboardChannelKey | null;
  /** null = cada centro y el consolidado. */
  detailCenterId: string | null;
  minValue: number | null;
  maxValue: number | null;
  version: number;
}

export interface KpiThresholdInput {
  organizationId: string;
  id?: string | undefined;
  version?: number | undefined;
  metricId: string;
  channel: DashboardChannelKey | null;
  detailCenterId: string | null;
  minValue: number | null;
  maxValue: number | null;
  reason: string;
}

/** Consulta del último nivel del drill-down (public.corporate_order_lines). */
export interface CorporateOrderLinesQuery {
  detailCenterIds: string[];
  from: string;
  to: string;
  channel: string | null;
  engine: string | null;
  serviceId: string | null;
}

/** Línea de OS (mismo contrato que OrderLineFact de @meguiars/analytics). */
export interface CorporateOrderLine {
  detailCenterId: string;
  serviceOrderId: string;
  folio: string;
  deliveredOn: string;
  channel: string;
  engine: string;
  serviceId: string | null;
  serviceName: string;
  kind: "servicio" | "producto" | "descuento";
  quantity: number;
  revenue: number;
  standardCost: number;
  /** % y pago al operador de la línea (CR1) y quién la realizó. */
  operatorPct: number | null;
  operatorPay: number;
  technicianName: string | null;
}

// ---------------------------------------------------------------------------
// Filtros: centros y periodo, iguales en todas las tarjetas
// ---------------------------------------------------------------------------

type Params = Record<string, string | string[] | undefined>;

/**
 * Filtros del tablero corporativo: centros (1..N permitidos) y periodo
 * (Hoy/Semana/Mes/Año/Rango). Canal y motor no son filtros globales aquí: se
 * eligen en el drill-down, así todas las tarjetas usan exactamente los mismos
 * filtros.
 */
export function corporateFilters(input: {
  params: Params;
  allowedCenterIds: readonly string[];
  today: string;
}): { filters: DashboardFilters; periodError: string | null } {
  const { canal: _c, motor: _m, ...params } = input.params;
  const r = resolveDashboardFilters({
    params,
    saved: null,
    defaultRange: "mes",
    allowedCenterIds: input.allowedCenterIds,
    today: input.today,
  });
  return { filters: { ...r.filters, channel: null, engine: null }, periodError: r.periodError };
}

// ---------------------------------------------------------------------------
// Navegación del drill-down
// ---------------------------------------------------------------------------

/** Posición en el drill-down (mismo contrato que DrillPath de @meguiars/analytics). */
export interface CorporateDrillPath {
  cardId: string;
  center?: string | undefined;
  dim?: "canal" | "motor" | undefined;
  value?: string | undefined;
  service?: string | undefined;
}

const KEY = /^[a-z0-9_]{1,40}$/;
const ID = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|descuento_os)$/;
const CENTER = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\*)$/;
const one = (p: Params, k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined);

/** Lee la posición del drill-down (URL web o parámetros móviles); null si no hay tarjeta válida. */
export function parseCorporateDrill(params: Params): CorporateDrillPath | null {
  const cardId = one(params, "tarjeta");
  if (!cardId || !KEY.test(cardId)) return null;
  const center = one(params, "centro");
  const path: CorporateDrillPath = { cardId };
  if (!center || !CENTER.test(center)) return path;
  path.center = center;
  const dim = one(params, "dim");
  const value = one(params, "valor");
  if ((dim !== "canal" && dim !== "motor") || !value || !(KEY.test(value) || value === "-")) return path;
  path.dim = dim;
  path.value = value;
  const service = one(params, "servicio");
  if (service && ID.test(service)) path.service = service;
  return path;
}

/** Parámetros de la posición del drill-down (sin filtros). */
export function corporatePathParams(path: CorporateDrillPath): Record<string, string> {
  const out: Record<string, string> = { tarjeta: path.cardId };
  if (path.center) out.centro = path.center;
  if (path.dim && path.value) {
    out.dim = path.dim;
    out.valor = path.value;
  }
  if (path.service) out.servicio = path.service;
  return out;
}

/** Parámetros del drill-down con los filtros del tablero (centros y periodo). */
export function corporateDrillParams(
  path: CorporateDrillPath,
  filters: DashboardFilters,
  allowedCenterIds: readonly string[],
): Record<string, string> {
  return {
    ...dashboardFilterParams({ ...filters, channel: null, engine: null }, allowedCenterIds),
    ...corporatePathParams(path),
  };
}

export const corporateDrillHref = (
  path: CorporateDrillPath,
  filters: DashboardFilters,
  allowedCenterIds: readonly string[],
) =>
  `/direccion/detalle?${new URLSearchParams(corporateDrillParams(path, filters, allowedCenterIds)).toString()}`;

/** Parámetros del tablero (volver al tablero con los mismos filtros). */
export const corporateBoardHref = (filters: DashboardFilters, allowedCenterIds: readonly string[]) => {
  const qs = new URLSearchParams(
    dashboardFilterParams({ ...filters, channel: null, engine: null }, allowedCenterIds),
  ).toString();
  return `/direccion${qs ? `?${qs}` : ""}`;
};
