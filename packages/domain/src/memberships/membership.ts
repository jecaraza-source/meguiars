import { addDays } from "../agenda/zoned-time";
import type { Result } from "../result";

/**
 * Membresías de clientes (C1). Reglas espejo de la migración
 * 20261002000000_memberships.sql; schema-parity.test.ts compara las listas.
 * No confundir con `members.*` (equipo del centro).
 */

/** Estado guardado. Coincide con `public.membership_state`. */
export const MEMBERSHIP_STATES = ["activa", "suspendida", "cancelada"] as const;
export type MembershipState = (typeof MEMBERSHIP_STATES)[number];

/** Estado efectivo (derivado de las fechas): private.membership_status. */
export const MEMBERSHIP_STATUSES = [
  "activa",
  "proxima_a_vencer",
  "vencida",
  "suspendida",
  "cancelada",
] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const PLAN_TIERS = ["care", "plus", "premium"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

/** Periodicidad en meses: mensual, trimestral, semestral, anual. */
export const PERIOD_MONTHS = [1, 3, 6, 12] as const;
export type PeriodMonths = (typeof PERIOD_MONTHS)[number];

export const REDEEM_SCOPES = ["centro_origen", "cualquier_centro"] as const;
export type RedeemScope = (typeof REDEEM_SCOPES)[number];

export const MEMBERSHIP_EVENT_KINDS = [
  "alta",
  "renovacion",
  "suspension",
  "reactivacion",
  "cancelacion",
  "redencion",
  "redencion_anulada",
] as const;
export type MembershipEventKind = (typeof MEMBERSHIP_EVENT_KINDS)[number];

/** Transiciones de estado guardado permitidas (set_membership_state). */
export const MEMBERSHIP_STATE_TRANSITIONS: Record<MembershipState, readonly MembershipState[]> = {
  activa: ["suspendida", "cancelada"],
  suspendida: ["activa", "cancelada"],
  cancelada: [],
};

// ---------------------------------------------------------------------------
// Fechas (YYYY-MM-DD, en la zona del centro de origen)
// ---------------------------------------------------------------------------

const parse = (date: string) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return { y, m, d };
};
const iso = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const toDays = (date: string) => {
  const { y, m, d } = parse(date);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/** Fecha + meses con el recorte de fin de mes de Postgres (31-ene + 1 mes = 28-feb). */
export function addMonths(date: string, months: number): string {
  const { y, m, d } = parse(date);
  const index = y * 12 + (m - 1) + months;
  const ty = Math.floor(index / 12);
  const tm = (index % 12) + 1;
  return iso(ty, tm, Math.min(d, daysInMonth(ty, tm)));
}

/** Días de `from` a `to` (negativo si `to` es anterior). */
export const daysBetween = (from: string, to: string) => toDays(to) - toDays(from);

/** Estado efectivo (espejo de private.membership_status). */
export function membershipStatus(
  m: { state: MembershipState; endsOn: string; renewalNoticeDays: number },
  today: string,
): MembershipStatus {
  if (m.state === "cancelada") return "cancelada";
  if (m.state === "suspendida") return "suspendida";
  if (today > m.endsOn) return "vencida";
  if (daysBetween(today, m.endsOn) <= m.renewalNoticeDays) return "proxima_a_vencer";
  return "activa";
}

/**
 * Periodo de uso que contiene `day`: bloques de `periodMonths` desde el ancla
 * (espejo de private.membership_period). null antes del ancla.
 */
export function membershipPeriod(
  anchor: string,
  periodMonths: number,
  day: string,
): { start: string; end: string } | null {
  if (day < anchor) return null;
  let k = 0;
  while (addMonths(anchor, (k + 1) * periodMonths) <= day) k++;
  return {
    start: addMonths(anchor, k * periodMonths),
    end: addDays(addMonths(anchor, (k + 1) * periodMonths), -1),
  };
}

/** Se redime con la membresía activa o próxima a vencer (y ya iniciada). */
export const canRedeem = (status: MembershipStatus) => status === "activa" || status === "proxima_a_vencer";
/** Se renueva próxima a vencer (mismas condiciones) o vencida (reinicio, admite cambio de plan). */
export const canRenew = (status: MembershipStatus) => status === "proxima_a_vencer" || status === "vencida";
export const canChangePlanOnRenewal = (status: MembershipStatus) => status === "vencida";

/** Precio mensualizado: la aportación de una membresía al MRR. */
export const monthlyValue = (m: { price: number; periodMonths: number }) =>
  Math.round((m.price / m.periodMonths) * 100) / 100;

// ---------------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------------

export interface MembershipBenefit {
  id: string;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  quantityPerPeriod: number;
  notes: string | null;
}

export interface MembershipPlan {
  id: string;
  organizationId: string;
  code: string;
  tier: PlanTier;
  name: string;
  description: string | null;
  price: number;
  periodMonths: PeriodMonths;
  redeemScope: RedeemScope;
  restrictions: string | null;
  renewalNoticeDays: number;
  availableFrom: string;
  availableUntil: string | null;
  active: boolean;
  benefits: MembershipBenefit[];
}

/** Beneficio congelado en la membresía al adquirir el plan. */
export interface FrozenBenefit {
  benefitId: string;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  quantityPerPeriod: number;
}

export interface MembershipListItem {
  id: string;
  number: string;
  state: MembershipState;
  status: MembershipStatus;
  planCode: string;
  planName: string;
  planTier: PlanTier;
  price: number;
  periodMonths: PeriodMonths;
  clientId: string;
  clientName: string;
  vehicleId: string;
  vehicleLabel: string;
  startedOn: string;
  endsOn: string;
  renewals: number;
}

export interface Membership {
  id: string;
  organizationId: string;
  detailCenterId: string;
  number: string;
  planId: string;
  clientId: string;
  vehicleId: string;
  state: MembershipState;
  planCode: string;
  planName: string;
  planTier: PlanTier;
  price: number;
  periodMonths: PeriodMonths;
  redeemScope: RedeemScope;
  renewalNoticeDays: number;
  benefits: FrozenBenefit[];
  startedOn: string;
  periodAnchor: string;
  endsOn: string;
  renewals: number;
  autoRenew: boolean;
  cancelReason: string | null;
  createdAt: string;
}

/** Saldo del periodo vigente por servicio incluido (public.membership_balance). */
export interface BenefitBalance {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  quantityPerPeriod: number;
  used: number;
  remaining: number;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface MembershipRedemption {
  id: string;
  membershipId: string;
  detailCenterId: string;
  serviceOrderId: string;
  itemId: string | null;
  serviceCode: string;
  serviceName: string;
  quantity: number;
  amount: number;
  periodStart: string;
  periodEnd: string;
  redeemedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface MembershipEvent {
  id: number;
  kind: MembershipEventKind;
  detailCenterId: string;
  fromState: string | null;
  toState: string | null;
  planCode: string | null;
  amount: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  reason: string | null;
  data: Record<string, unknown> | null;
  actorId: string | null;
  occurredAt: string;
}

export interface MembershipDetail {
  membership: Membership;
  clientName: string;
  vehicleLabel: string;
  balance: BenefitBalance[];
  redemptions: MembershipRedemption[];
  events: MembershipEvent[];
}

/** Hechos por membresía para KPIs (public.membership_metric_facts; sin datos personales). */
export interface MembershipMetricFact {
  detailCenterId: string;
  membershipId: string;
  status: MembershipStatus;
  price: number;
  periodMonths: number;
  startedOn: string;
  endsOn: string;
  entitledUnits: number;
  usedUnits: number;
  newInRange: boolean;
  renewalsInRange: number;
  cancelledInRange: boolean;
  expiredInRange: boolean;
  revenueInRange: number;
}

// ---------------------------------------------------------------------------
// Comandos y puertos
// ---------------------------------------------------------------------------

export interface UpsertPlanCommand {
  organizationId: string;
  id?: string | undefined;
  code: string;
  tier: PlanTier;
  name: string;
  description?: string | undefined;
  price: number;
  periodMonths: PeriodMonths;
  redeemScope: RedeemScope;
  restrictions?: string | undefined;
  renewalNoticeDays: number;
  availableFrom?: string | undefined;
  availableUntil?: string | undefined;
  active: boolean;
  reason: string;
}

export interface SetBenefitCommand {
  planId: string;
  serviceId: string;
  /** undefined = quitar el servicio del plan. */
  quantityPerPeriod?: number | undefined;
  notes?: string | undefined;
  reason: string;
}

export interface CreateMembershipCommand {
  detailCenterId: string;
  requestId: string;
  planId: string;
  clientId: string;
  vehicleId: string;
  startsOn?: string | undefined;
  paymentReference?: string | undefined;
}

export interface RenewMembershipCommand {
  membershipId: string;
  requestId: string;
  /** Sólo al renovar una membresía vencida. */
  planId?: string | undefined;
  paymentReference?: string | undefined;
}

export interface SetMembershipStateCommand {
  membershipId: string;
  state: MembershipState;
  reason: string;
}

export interface RedeemBenefitCommand {
  orderId: string;
  version: number;
  itemId: string;
  membershipId: string;
  quantity: number;
  requestId: string;
}

export interface MembershipRepository {
  listPlans(
    organizationId: string,
    options?: { includeInactive?: boolean },
  ): Promise<Result<MembershipPlan[]>>;
  getPlan(planId: string): Promise<Result<MembershipPlan>>;
  upsertPlan(command: UpsertPlanCommand): Promise<Result<MembershipPlan>>;
  setBenefit(command: SetBenefitCommand): Promise<Result<void>>;
  list(
    detailCenterId: string,
    filter?: { status?: MembershipStatus | undefined; query?: string | undefined },
  ): Promise<Result<MembershipListItem[]>>;
  get(membershipId: string): Promise<Result<MembershipDetail>>;
  /** Membresía no cancelada del vehículo (visible para el usuario), con su saldo. */
  forVehicle(
    vehicleId: string,
  ): Promise<Result<{ membership: Membership; balance: BenefitBalance[] } | null>>;
  redemptionsForOrder(orderId: string): Promise<Result<MembershipRedemption[]>>;
  create(command: CreateMembershipCommand): Promise<Result<Membership>>;
  renew(command: RenewMembershipCommand): Promise<Result<Membership>>;
  setState(command: SetMembershipStateCommand): Promise<Result<Membership>>;
  redeem(command: RedeemBenefitCommand): Promise<Result<MembershipRedemption>>;
  voidRedemption(
    redemptionId: string,
    version: number,
    reason: string,
  ): Promise<Result<MembershipRedemption>>;
  metricFacts(detailCenterIds: string[], from: string, to: string): Promise<Result<MembershipMetricFact[]>>;
}

/**
 * Interfaz del cobro recurrente futuro (hoy la renovación es manual). Un
 * proveedor de pagos implementará este puerto y llamará a `renew` con su
 * referencia de cobro; `memberships.auto_renew` y `payment_method_ref` ya existen.
 */
export interface MembershipBillingPort {
  /** Cobra el siguiente periodo y devuelve la referencia del cargo. */
  chargeRenewal(input: {
    membershipId: string;
    amount: number;
    paymentMethodRef: string;
  }): Promise<Result<{ paymentReference: string }>>;
}
