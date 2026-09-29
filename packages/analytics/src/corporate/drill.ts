import {
  CHANNEL_LABELS,
  DASHBOARD_CHANNELS,
  ENGINE_LABELS,
  pnlChannelOf,
  type DashboardChannel,
  type DashboardFacts,
  type PnlBucketFact,
} from "../dashboards/catalog";
import { resolveWidget, type ResolveContext } from "../dashboards/resolve";
import { pnlStatement, type PnlDrill } from "../pnl";
import { serviceKeyOf, type ServiceFact } from "../services";
import { corporateCardById, type CorporateCard } from "./cards";
import { cardValue, cardWidget, type CorporateContext } from "./board";

/**
 * Drill-down del tablero corporativo (D3): KPI → centro → canal/motor →
 * servicio → OS, o KPI → centro → renglón del P&L → movimientos. Cada nivel
 * explica la cifra del nivel anterior con la misma fórmula (métricas
 * registradas) y, si la métrica es aditiva, muestra la conciliación: Σ filas =
 * cifra del nivel anterior (diferencia 0).
 */

export type DrillDim = "canal" | "motor";

/** Posición en el drill-down (misma forma en la URL web y en la navegación móvil). */
export interface DrillPath {
  cardId: string;
  /** Centro elegido o "*" (consolidado de los centros del filtro). */
  center?: string | undefined;
  dim?: DrillDim | undefined;
  /** Canal o motor elegido. */
  value?: string | undefined;
  /** Servicio elegido ("descuento_os" = descuento general de la OS). */
  service?: string | undefined;
}

export const ALL_CENTERS = "*";

export interface DrillRow {
  key: string;
  label: string;
  value: number;
  /** % del nivel anterior (null si no es aditiva o no hay base). */
  share: number | null;
  /** Siguiente nivel dentro del tablero. */
  next: DrillPath | null;
  /** Movimientos del P&L que explican la fila (pantalla de detalle del P&L). */
  pnl: (PnlDrill & { detailCenterIds: string[] }) | null;
  /** Detalle adicional (cantidad, folio, costo…). */
  detail: string | null;
  /** Nivel del renglón (estado de resultados: 0 = total, 1 = detalle). */
  level: 0 | 1;
}

export type DrillLevelKind = "centro" | "canal" | "motor" | "servicio" | "pnl" | "os";

export interface DrillLevel {
  kind: DrillLevelKind;
  title: string;
  unit: string;
  /** Cifra que se explica (la del nivel anterior). */
  parent: { label: string; value: number };
  rows: DrillRow[];
  /** Σ filas debe dar la cifra del nivel anterior. */
  additive: boolean;
  sum: number | null;
  difference: number | null;
  note: string | null;
}

export interface OrderLinesQuery {
  detailCenterIds: string[];
  channel: string | null;
  engine: string | null;
  serviceId: string | null;
  /** Filtra productos (venta de productos) sobre las líneas. */
  productsOnly: boolean;
}

export interface Breadcrumb {
  label: string;
  path: DrillPath;
}

export type DrillView =
  | { status: "unknown" }
  | { status: "forbidden"; card: CorporateCard }
  | {
      status: "ok";
      card: CorporateCard;
      path: DrillPath;
      breadcrumbs: Breadcrumb[];
      /** Tablas del nivel actual (el nivel de centro puede traer canal y motor). */
      levels: DrillLevel[];
      /** Último nivel: líneas de OS que debe traer el cargador (corporate_order_lines). */
      orderLines: (OrderLinesQuery & { parent: { label: string; value: number } }) | null;
      /** Sin más detalle para esta tarjeta en el tablero. */
      note: string | null;
    };

const round2 = (n: number) => Math.round(n * 100) / 100;
const TOLERANCE = 0.01;

function level(
  kind: DrillLevelKind,
  title: string,
  unit: string,
  parent: { label: string; value: number },
  rows: DrillRow[],
  additive: boolean,
  note: string | null = null,
): DrillLevel {
  const sum = additive ? round2(rows.reduce((t, r) => t + r.value, 0)) : null;
  const difference = sum === null ? null : round2(parent.value - sum);
  return {
    kind,
    title,
    unit,
    parent,
    rows: additive
      ? rows.map((r) => ({
          ...r,
          share: parent.value > 0 ? round2((r.value * 100) / parent.value) : null,
        }))
      : rows,
    additive,
    sum,
    difference: difference !== null && Math.abs(difference) < TOLERANCE ? 0 : difference,
    note,
  };
}

const row = (key: string, label: string, value: number, extra: Partial<DrillRow> = {}): DrillRow => ({
  key,
  label,
  value,
  share: null,
  next: null,
  pnl: null,
  detail: null,
  level: 1,
  ...extra,
});

const NON_ADDITIVE_NOTE =
  "No es aditiva: cada fila aplica la misma fórmula a su subconjunto (no se suman para dar el total).";

/**
 * Nivel actual del drill-down con los mismos filtros del tablero (centros y
 * periodo). Los permisos son los de la métrica en cada centro; los niveles de
 * servicio y OS sólo traen datos de centros con pnl.read (la base filtra igual).
 */
export function corporateDrill(
  path: DrillPath,
  facts: DashboardFacts,
  ctx: Pick<CorporateContext, "from" | "to" | "centers" | "allowedCenters">,
): DrillView {
  const card = corporateCardById(path.cardId);
  if (!card) return { status: "unknown" };
  const { metric } = card;
  const permitted = new Set(ctx.allowedCenters(metric.capability));
  const allowed = ctx.centers.filter((c) => permitted.has(c.id));
  if (allowed.length === 0) return { status: "forbidden", card };
  const { additive } = card;
  const unit = metric.unit;
  const crumbs: Breadcrumb[] = [{ label: card.name, path: { cardId: card.id } }];

  // Nivel 1: por centro, explica el consolidado.
  const consolidated = cardValue(card, facts, ctx, ctx.from, ctx.to) ?? 0;
  const inCenter = path.center === ALL_CENTERS ? null : allowed.find((c) => c.id === path.center);
  if (!path.center || (path.center !== ALL_CENTERS && !inCenter)) {
    const bars = resolveWidget(cardWidget(card, "bars"), facts, rctx(ctx, allowed));
    const rows =
      bars.status === "ok" && bars.data.kind === "bars"
        ? bars.data.rows.map((r) =>
            row(r.key, r.label, r.value, {
              next: card.drill === "none" ? null : { cardId: card.id, center: r.key },
            }),
          )
        : [];
    return {
      status: "ok",
      card,
      path: { cardId: card.id },
      breadcrumbs: crumbs,
      levels: [
        level(
          "centro",
          "Por centro",
          unit,
          { label: "Consolidado", value: consolidated },
          rows,
          additive,
          additive ? null : NON_ADDITIVE_NOTE,
        ),
      ],
      orderLines: null,
      note:
        card.drill === "none"
          ? "Este KPI se explica por centro; el detalle de cada membresía está en su módulo."
          : null,
    };
  }

  const scope = inCenter ? [inCenter] : allowed;
  const scopeIds = scope.map((c) => c.id);
  const scopeLabel = inCenter ? inCenter.name : "Consolidado";
  const scopeValue = cardValue(card, facts, { ...ctx, centers: scope }, ctx.from, ctx.to) ?? 0;
  const centerPath: DrillPath = { cardId: card.id, center: path.center };
  crumbs.push({ label: scopeLabel, path: centerPath });
  const scopeParent = { label: `${card.name} · ${scopeLabel}`, value: scopeValue };
  const pnlFacts = (facts.pnl ?? []).filter((f) => scopeIds.includes(f.detailCenterId));

  // Nivel 2: canal / motor / renglones del P&L.
  if (!path.dim || card.drill === "pnl" || card.drill === "channel" || card.drill === "none") {
    const levels: DrillLevel[] = [];
    if (card.drill === "revenue") {
      const byDim = (dim: DrillDim) => {
        const r = resolveWidget(
          {
            ...cardWidget(card, "distribution"),
            options: { ...cardWidget(card, "kpi").options, breakdown: dim },
          },
          facts,
          rctx(ctx, scope),
        );
        const rows = r.status === "ok" && r.data.kind === "distribution" ? r.data.rows : [];
        return rows.map((x) => row(x.key, x.label, x.value, { next: { ...centerPath, dim, value: x.key } }));
      };
      if (!card.channel) levels.push(level("canal", "Por canal", unit, scopeParent, byDim("canal"), true));
      levels.push(level("motor", "Por motor de ingreso", unit, scopeParent, byDim("motor"), true));
    } else if (card.drill === "channel" || card.drill === "products") {
      const rows = DASHBOARD_CHANNELS.map((ch) =>
        row(ch, CHANNEL_LABELS[ch], channelValue(card, facts, ctx, scope, ch), {
          next: card.drill === "products" ? { ...centerPath, dim: "canal", value: ch } : null,
        }),
      ).filter((r) => r.value !== 0 || !additive);
      levels.push(
        level("canal", "Por canal", unit, scopeParent, rows, additive, additive ? null : NON_ADDITIVE_NOTE),
      );
    } else if (card.drill === "pnl") {
      const st = pnlStatement({ facts: pnlFacts });
      const rows = st.lines.map((l) =>
        row(l.key, l.label, l.amount, {
          level: l.level,
          detail: l.percent === null ? null : `${l.percent.toFixed(2)} % de ventas`,
          pnl: l.drill ? { ...l.drill, detailCenterIds: scopeIds } : null,
        }),
      );
      levels.push(
        level(
          "pnl",
          "Estado de resultados",
          "currency",
          scopeParent,
          rows,
          false,
          "La cifra sale de estos renglones con las fórmulas del estado de resultados; cada renglón abre sus movimientos.",
        ),
      );
    }
    return {
      status: "ok",
      card,
      path: centerPath,
      breadcrumbs: crumbs,
      levels,
      orderLines: null,
      note: card.drill === "none" ? "Este KPI no tiene más detalle en el tablero." : null,
    };
  }

  // Nivel 3: servicios (o productos) del canal / motor elegido.
  const channel = (card.channel ?? (path.dim === "canal" ? path.value : null)) as DashboardChannel | null;
  const engine = path.dim === "motor" ? (path.value ?? null) : null;
  const dimLabel =
    path.dim === "canal"
      ? (CHANNEL_LABELS[path.value as DashboardChannel] ?? path.value ?? "")
      : (ENGINE_LABELS[path.value ?? "-"] ?? path.value ?? "");
  const dimPath: DrillPath = { ...centerPath, dim: path.dim, value: path.value };
  crumbs.push({ label: dimLabel, path: dimPath });
  const productsOnly = card.drill === "products";
  const parentValue =
    card.drill === "products"
      ? channelValue(card, facts, ctx, scope, channel as DashboardChannel)
      : revenueOf(pnlFacts, channel, engine);
  const dimParent = { label: `${card.name} · ${scopeLabel} · ${dimLabel}`, value: parentValue };
  const pnlCenters = new Set(ctx.allowedCenters("pnl.read"));
  const services = (facts.services ?? []).filter(
    (f) =>
      scopeIds.includes(f.detailCenterId) &&
      pnlCenters.has(f.detailCenterId) &&
      (!channel || f.channel === channel) &&
      (!engine || f.engine === engine) &&
      (!productsOnly || f.kind === "producto"),
  );
  const serviceRows = groupServices(services).map((s) =>
    row(s.key, s.label, s.revenue, {
      detail: s.quantity > 0 ? `${s.quantity} u. · ${s.orders} OS` : null,
      next: { ...dimPath, service: s.key },
    }),
  );

  if (!path.service) {
    // Ingresos que no vienen de OS (venta de membresías y cuotas B2B) completan la cifra.
    const extra = productsOnly ? [] : nonOrderRevenue(pnlFacts, channel, engine, scopeIds);
    return {
      status: "ok",
      card,
      path: dimPath,
      breadcrumbs: crumbs,
      levels: [
        level(
          "servicio",
          productsOnly ? "Por producto" : "Por servicio",
          unit,
          dimParent,
          [...serviceRows.sort((a, b) => b.value - a.value), ...extra],
          true,
        ),
      ],
      orderLines: null,
      note: null,
    };
  }

  // Nivel 4: líneas de OS del servicio (las trae el cargador con corporate_order_lines).
  const chosen = serviceRows.find((r) => r.key === path.service);
  crumbs.push({ label: chosen?.label ?? "Servicio", path: { ...dimPath, service: path.service } });
  const isDiscount = path.service === "descuento_os";
  return {
    status: "ok",
    card,
    path: { ...dimPath, service: path.service },
    breadcrumbs: crumbs,
    levels: [],
    orderLines: {
      detailCenterIds: scopeIds.filter((id) => pnlCenters.has(id)),
      channel,
      engine: isDiscount ? "descuento_os" : engine,
      serviceId: isDiscount ? null : path.service,
      productsOnly,
      parent: { label: `${dimParent.label} · ${chosen?.label ?? "Servicio"}`, value: chosen?.value ?? 0 },
    },
    note: null,
  };
}

function rctx(
  ctx: Pick<CorporateContext, "from" | "to" | "allowedCenters">,
  centers: readonly { id: string; name: string }[],
): ResolveContext {
  return {
    from: ctx.from,
    to: ctx.to,
    filters: { channel: null, engine: null },
    centers,
    allowedCenters: ctx.allowedCenters,
  };
}

/** Misma fórmula de la tarjeta sobre un canal (filtro global de la métrica). */
function channelValue(
  card: CorporateCard,
  facts: DashboardFacts,
  ctx: Pick<CorporateContext, "from" | "to" | "allowedCenters">,
  scope: readonly { id: string; name: string }[],
  channel: DashboardChannel,
): number {
  const r = resolveWidget(cardWidget(card, "kpi"), facts, {
    ...rctx(ctx, scope),
    filters: { channel, engine: null },
  });
  return r.status === "ok" && r.data.kind === "kpi" ? r.data.value : 0;
}

/** Ventas del P&L con canal / motor (mismo criterio que pnl.revenue). */
function revenueOf(facts: readonly PnlBucketFact[], channel: string | null, engine: string | null): number {
  return round2(
    facts
      .filter(
        (f) =>
          f.section === "ingreso" &&
          (!channel || pnlChannelOf(f.line) === channel) &&
          (!engine || (f.dimension ?? "-") === engine),
      )
      .reduce((t, f) => t + f.amount, 0),
  );
}

/** Venta de membresías y cuotas B2B (no vienen de OS) que caen en el canal / motor. */
function nonOrderRevenue(
  facts: readonly PnlBucketFact[],
  channel: string | null,
  engine: string | null,
  detailCenterIds: string[],
): DrillRow[] {
  const LINES: Record<string, string> = { membresias: "Venta de membresías", cuotas_b2b: "Cuotas B2B" };
  return Object.entries(LINES)
    .map(([line, label]) => {
      const rows = facts.filter(
        (f) =>
          f.section === "ingreso" &&
          f.line === line &&
          (!channel || pnlChannelOf(f.line) === channel) &&
          (!engine || (f.dimension ?? "-") === engine),
      );
      const value = round2(rows.reduce((t, f) => t + f.amount, 0));
      return row(`linea:${line}`, label, value, {
        pnl: { section: "ingreso", line, detailCenterIds },
        detail: "Movimientos del estado de resultados",
      });
    })
    .filter((r) => r.value !== 0);
}

function groupServices(facts: readonly ServiceFact[]) {
  const map = new Map<
    string,
    { key: string; label: string; revenue: number; quantity: number; orders: number }
  >();
  for (const f of facts) {
    const key = serviceKeyOf(f);
    const g = map.get(key) ?? { key, label: f.serviceName, revenue: 0, quantity: 0, orders: 0 };
    g.revenue = round2(g.revenue + f.revenue);
    g.quantity += f.quantity;
    g.orders += f.orders;
    map.set(key, g);
  }
  return [...map.values()];
}

/** Línea de OS (public.corporate_order_lines). */
export interface OrderLineFact {
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
}

/** Último nivel: cada OS que forma la cifra del servicio (Σ = cifra del servicio). */
export function orderLinesLevel(
  lines: readonly OrderLineFact[],
  query: OrderLinesQuery & { parent: { label: string; value: number } },
  centerName: (id: string) => string,
): DrillLevel {
  const rows = lines
    .filter((l) => !query.productsOnly || l.kind === "producto")
    .map((l) =>
      row(`${l.serviceOrderId}:${l.serviceId ?? "descuento"}`, l.folio, l.revenue, {
        detail: `${l.deliveredOn} · ${centerName(l.detailCenterId)}${l.quantity > 0 ? ` · ${l.quantity} u.` : ""}`,
      }),
    );
  return level("os", "Órdenes de servicio", "currency", query.parent, rows, true);
}
