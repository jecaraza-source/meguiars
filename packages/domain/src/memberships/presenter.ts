import type { StatusTone } from "../agenda/copy";
import { formatMoney } from "../catalog/presenter";
import type { ServiceOrderItem } from "../orders/order";
import { formatInCenterTimeZone } from "../time";
import {
  MEMBERSHIP_EVENT_LABELS,
  MEMBERSHIP_STATUS_LABELS,
  MEMBERSHIP_STATUS_TONES,
  membershipsCopy,
  PERIOD_LABELS,
  PERIOD_UNIT_LABELS,
  PLAN_TIER_LABELS,
  REDEEM_SCOPE_LABELS,
} from "./copy";
import {
  canRedeem,
  canRenew,
  daysBetween,
  type BenefitBalance,
  type MembershipEvent,
  type MembershipListItem,
  type MembershipPlan,
  type MembershipRedemption,
  type MembershipState,
  type MembershipStatus,
} from "./membership";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-10-05" → "5 oct 2026" (fecha calendario, sin zona). */
export function formatDateOnly(date: string | null | undefined): string {
  if (!date) return "—";
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export const pricePerPeriod = (price: number, periodMonths: number) =>
  `${formatMoney(price)} / ${PERIOD_UNIT_LABELS[periodMonths] ?? `${periodMonths} meses`}`;

/** "Vence en 3 días", "Venció hace 2 días", "Vence hoy". */
export function renewalCaption(endsOn: string, today: string): string {
  const days = daysBetween(today, endsOn);
  if (days === 0) return "Vence hoy";
  if (days > 0) return `Vence en ${days} día${days === 1 ? "" : "s"}`;
  return `Venció hace ${-days} día${days === -1 ? "" : "s"}`;
}

export function presentStatus(status: MembershipStatus): { label: string; tone: StatusTone } {
  return { label: MEMBERSHIP_STATUS_LABELS[status], tone: MEMBERSHIP_STATUS_TONES[status] };
}

export function presentMembershipListItem(item: MembershipListItem, today: string) {
  return {
    id: item.id,
    number: item.number,
    plan: `${PLAN_TIER_LABELS[item.planTier]} · ${item.planName}`,
    client: item.clientName,
    vehicle: item.vehicleLabel,
    price: pricePerPeriod(item.price, item.periodMonths),
    endsOn: formatDateOnly(item.endsOn),
    renewal:
      item.status === "cancelada" || item.status === "suspendida" ? "—" : renewalCaption(item.endsOn, today),
    ...presentStatus(item.status),
  };
}

/** Saldo por servicio: "1 de 2 usados", disponible y periodo. */
export function presentBalance(b: BenefitBalance) {
  return {
    key: b.serviceId,
    service: `${b.serviceName} · ${b.serviceCode}`,
    usage: `${b.used} de ${b.quantityPerPeriod}`,
    remaining: b.remaining,
    period: b.periodStart ? `${formatDateOnly(b.periodStart)} – ${formatDateOnly(b.periodEnd)}` : "—",
    exhausted: b.remaining === 0,
  };
}

export function presentRedemption(r: MembershipRedemption, timeZone: string, folio?: string) {
  return {
    id: r.id,
    when: formatInCenterTimeZone(r.redeemedAt, timeZone),
    service: `${r.serviceName} × ${r.quantity}`,
    amount: formatMoney(r.amount),
    order: folio ?? "",
    status: r.voidedAt ? `Anulada: ${r.voidReason ?? ""}` : "Aplicada",
    voided: r.voidedAt !== null,
  };
}

export function presentMembershipEvent(e: MembershipEvent, timeZone: string) {
  const folio = typeof e.data?.["folio"] === "string" ? (e.data["folio"] as string) : null;
  const payment =
    typeof e.data?.["payment_reference"] === "string"
      ? `Pago: ${e.data["payment_reference"] as string}`
      : null;
  return {
    key: String(e.id),
    when: formatInCenterTimeZone(e.occurredAt, timeZone),
    what: [MEMBERSHIP_EVENT_LABELS[e.kind], e.planCode, folio].filter(Boolean).join(" · "),
    detail:
      [
        e.amount != null && (e.kind === "alta" || e.kind === "renovacion") ? formatMoney(e.amount) : null,
        e.periodStart ? `${formatDateOnly(e.periodStart)} – ${formatDateOnly(e.periodEnd)}` : null,
        payment,
        e.reason,
      ]
        .filter(Boolean)
        .join(" · ") || "—",
  };
}

export function presentPlan(plan: MembershipPlan) {
  return {
    id: plan.id,
    name: `${PLAN_TIER_LABELS[plan.tier]} · ${plan.name}`,
    code: plan.code,
    price: pricePerPeriod(plan.price, plan.periodMonths),
    period: PERIOD_LABELS[plan.periodMonths] ?? `${plan.periodMonths} meses`,
    scope: REDEEM_SCOPE_LABELS[plan.redeemScope],
    benefits:
      plan.benefits.map((b) => `${b.serviceName} × ${b.quantityPerPeriod}`).join(", ") ||
      membershipsCopy.balanceEmpty,
    status: plan.active ? "Disponible" : membershipsCopy.planInactive,
    active: plan.active,
  };
}

export interface MembershipAction {
  kind: "renew" | "suspend" | "reactivate" | "cancel";
  label: string;
  /** Estado guardado destino (acciones de estado). */
  state?: MembershipState;
  variant: "primary" | "secondary" | "danger";
}

/** Acciones disponibles según el estado efectivo y los permisos. */
export function membershipActions(
  status: MembershipStatus,
  perms: { write: boolean; manage: boolean },
): MembershipAction[] {
  const out: MembershipAction[] = [];
  if (perms.write && canRenew(status))
    out.push({ kind: "renew", label: membershipsCopy.renew, variant: "primary" });
  if (perms.manage && (status === "activa" || status === "proxima_a_vencer" || status === "vencida"))
    out.push({ kind: "suspend", label: membershipsCopy.suspend, state: "suspendida", variant: "secondary" });
  if (perms.manage && status === "suspendida")
    out.push({ kind: "reactivate", label: membershipsCopy.reactivate, state: "activa", variant: "primary" });
  if (perms.manage && status !== "cancelada")
    out.push({ kind: "cancel", label: membershipsCopy.cancel, state: "cancelada", variant: "danger" });
  return out;
}

export interface RedeemableLine {
  itemId: string;
  label: string;
  maxQuantity: number;
}

/**
 * Líneas de la OS que se pueden redimir con la membresía: servicio incluido,
 * con saldo y sin redención activa. La base vuelve a validar todo.
 */
export function redeemableLines(
  status: MembershipStatus,
  items: readonly Pick<ServiceOrderItem, "id" | "serviceId" | "serviceName" | "quantity">[],
  balance: readonly BenefitBalance[],
  redemptions: readonly Pick<MembershipRedemption, "itemId" | "voidedAt">[],
): RedeemableLine[] {
  if (!canRedeem(status)) return [];
  const redeemed = new Set(redemptions.filter((r) => !r.voidedAt).map((r) => r.itemId));
  return items.flatMap((i) => {
    const b = balance.find((x) => x.serviceId === i.serviceId);
    if (!b || b.remaining <= 0 || redeemed.has(i.id)) return [];
    return [
      {
        itemId: i.id,
        label: `${i.serviceName} (${b.remaining} disponibles)`,
        maxQuantity: Math.min(i.quantity, b.remaining),
      },
    ];
  });
}

/** Mensaje de error de membresías (reglas MG002 visibles tal cual). */
export function membershipErrorMessage(error: { kind: string; code?: string; message: string }): string {
  if (error.code === "40001") return "La OS cambió en otro dispositivo; recarga para ver la versión actual";
  if (error.code === "23505") return "Ya existe un plan con esa clave";
  if (error.kind === "permission_denied" && !error.message) return membershipsCopy.forbidden;
  return error.message;
}

/** Valores calculados por `membershipKpis` (@meguiars/analytics). */
export interface MembershipKpiValues {
  active: number;
  newCount: number;
  churn: number;
  renewals: number;
  mrr: number;
  arpm: number;
  redeemedUnits: number;
  usageRate: number;
  revenue: number;
}

/** Tarjetas de KPIs de membresías (mismo orden y textos en web y móvil). */
export function membershipKpiCards(k: MembershipKpiValues) {
  return [
    { label: "Membresías activas", value: String(k.active), caption: "Activas o próximas a vencer" },
    { label: "MRR", value: formatMoney(k.mrr), caption: "Precio mensualizado de las activas" },
    { label: "Ingreso promedio por miembro", value: formatMoney(k.arpm), caption: "MRR ÷ activas" },
    { label: "Altas", value: String(k.newCount), caption: membershipsCopy.kpisRange },
    { label: "Bajas", value: String(k.churn), caption: "Cancelaciones y vencidas sin renovar" },
    { label: "Renovaciones", value: String(k.renewals), caption: membershipsCopy.kpisRange },
    { label: "Uso", value: `${k.redeemedUnits} servicios`, caption: `Tasa de uso ${k.usageRate}%` },
    { label: "Ingreso cobrado", value: formatMoney(k.revenue), caption: "Altas y renovaciones del periodo" },
  ];
}
