import { addMonths } from "../memberships/membership";
import type { SalesChannel } from "../orders/order";
import type { Result } from "../result";

/**
 * Comercial / B2B (C3): cuentas empresariales, convenios con vigencia y
 * centros habilitados, tarifas convenidas, vehículos autorizados, estado de
 * cuenta y rentabilidad. La base aplica la tarifa al agregar cada línea de la
 * OS (private.b2b_line_price); aquí viven sus espejos para la UI y las pruebas
 * de paridad (schema-parity.test.ts).
 */

export const B2B_ACCOUNT_STATUSES = ["activa", "suspendida", "baja"] as const;
export type B2bAccountStatus = (typeof B2B_ACCOUNT_STATUSES)[number];

/** Modelo de cobro del convenio. */
export const BILLING_MODELS = ["por_vehiculo", "volumen_mensual", "paquete", "iguala"] as const;
export type BillingModel = (typeof BILLING_MODELS)[number];
/** Modelos con cuota (paquete único o iguala mensual) y unidades incluidas. */
export const FEE_MODELS: readonly BillingModel[] = ["paquete", "iguala"];

export const AGREEMENT_STATUSES = ["activo", "suspendido", "cancelado"] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

/** Estado efectivo (espejo de private.b2b_agreement_state). */
export const AGREEMENT_STATES = ["programado", "vigente", "vencido", "suspendido", "cancelado"] as const;
export type AgreementState = (typeof AGREEMENT_STATES)[number];

export const VEHICLE_RULES = ["lista", "cualquiera"] as const;
export type VehicleRule = (typeof VEHICLE_RULES)[number];

export const PRICE_RULE_KINDS = ["precio_fijo", "descuento_pct", "incluido"] as const;
export type PriceRuleKind = (typeof PRICE_RULE_KINDS)[number];

export const B2B_PAYMENT_METHODS = ["transferencia", "cheque", "tarjeta", "efectivo", "otro"] as const;
export type B2bPaymentMethod = (typeof B2B_PAYMENT_METHODS)[number];

export const INVOICE_STATUSES = ["emitida", "anulada"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** RFC (persona moral o física), en mayúsculas. */
export const RFC_PATTERN = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;

// ---------------------------------------------------------------------------
// Reglas (espejo de la base)
// ---------------------------------------------------------------------------

/** Estado efectivo del convenio (espejo de private.b2b_agreement_state). Fechas inclusive. */
export function agreementState(
  status: AgreementStatus,
  startsOn: string,
  endsOn: string,
  today: string,
): AgreementState {
  if (status === "cancelado" || status === "suspendido") return status;
  if (today < startsOn) return "programado";
  if (today > endsOn) return "vencido";
  return "vigente";
}

/** Sólo un convenio vigente se aplica al abrir OS o agregar líneas. */
export const agreementApplies = (state: AgreementState) => state === "vigente";

/**
 * Cuotas devengadas en [from, to] (espejo de private.b2b_fee_accrued): paquete,
 * una vez al iniciar; iguala, una por cada mes iniciado dentro de la vigencia.
 */
export function agreementFees(
  a: { billingModel: BillingModel; feeAmount: number | null; startsOn: string; endsOn: string },
  from: string,
  to: string,
): number {
  if (a.feeAmount == null) return 0;
  if (a.billingModel === "paquete") return a.startsOn >= from && a.startsOn <= to ? a.feeAmount : 0;
  if (a.billingModel !== "iguala") return 0;
  const last = to < a.endsOn ? to : a.endsOn;
  let months = 0;
  for (let k = 0; k <= 1200; k++) {
    const start = addMonths(a.startsOn, k);
    if (start > last) break;
    if (start >= from) months++;
  }
  return Math.round(months * a.feeAmount * 100) / 100;
}

export interface PriceRuleLike {
  id: string;
  serviceId: string | null;
  kind: PriceRuleKind;
  value: number | null;
  minMonthlyOrders: number;
  active: boolean;
}

/**
 * Precio convenido de una línea (espejo de private.b2b_line_price): la regla
 * del servicio gana a la general; "incluido" mientras queden unidades; el
 * escalón de volumen más alto alcanzado. Sin regla, el precio de lista.
 */
export function resolveB2bPrice(
  rules: readonly PriceRuleLike[],
  input: {
    serviceId: string;
    listPrice: number;
    quantity: number;
    monthlyVolume: number;
    usedUnits: number;
    includedUnits: number | null;
  },
): { price: number; ruleId: string | null } {
  const candidates = rules
    .filter(
      (r) =>
        r.active &&
        (r.serviceId === input.serviceId || r.serviceId === null) &&
        r.minMonthlyOrders <= input.monthlyVolume,
    )
    .sort(
      (a, b) =>
        Number(a.serviceId === null) - Number(b.serviceId === null) ||
        Number(b.kind === "incluido") - Number(a.kind === "incluido") ||
        b.minMonthlyOrders - a.minMonthlyOrders,
    );
  for (const r of candidates) {
    if (r.kind === "incluido") {
      if (input.usedUnits + input.quantity <= (input.includedUnits ?? 0)) return { price: 0, ruleId: r.id };
      continue;
    }
    if (r.kind === "precio_fijo") return { price: r.value ?? input.listPrice, ruleId: r.id };
    return { price: Math.round(input.listPrice * (1 - (r.value ?? 0) / 100) * 100) / 100, ruleId: r.id };
  }
  return { price: input.listPrice, ruleId: null };
}

// ---------------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------------

export interface B2bAccount {
  id: string;
  organizationId: string;
  homeDetailCenterId: string;
  clientId: string;
  name: string;
  legalName: string | null;
  rfc: string | null;
  taxRegime: string | null;
  fiscalZip: string | null;
  billingEmail: string | null;
  status: B2bAccountStatus;
  notes: string | null;
  createdAt: string;
}

export interface B2bContact {
  id: string;
  fullName: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  active: boolean;
}

export interface B2bAgreement {
  id: string;
  accountId: string;
  name: string;
  billingModel: BillingModel;
  startsOn: string;
  endsOn: string;
  status: AgreementStatus;
  vehicleRule: VehicleRule;
  paymentTermsDays: number;
  creditLimit: number | null;
  feeAmount: number | null;
  includedUnits: number | null;
  notes: string | null;
  centerIds: string[];
}

export interface B2bPriceRule extends PriceRuleLike {
  agreementId: string;
  serviceName: string | null;
  notes: string | null;
}

export interface B2bVehicle {
  vehicleId: string;
  label: string;
  plate: string;
  /** Autorización en el convenio (lista); null = no está en la lista. */
  authorized: boolean;
  costCenter: string | null;
  driverName: string | null;
}

export interface B2bAccountListItem extends B2bAccount {
  homeCenterName: string | null;
  agreementName: string | null;
  agreementState: AgreementState | null;
  agreementEndsOn: string | null;
}

export interface B2bAccountDetail {
  account: B2bAccount;
  contacts: B2bContact[];
  agreements: B2bAgreement[];
  vehicles: B2bVehicle[];
}

export interface B2bAgreementDetail {
  agreement: B2bAgreement;
  accountName: string;
  /** Centro gestor de la cuenta (decide quién edita el convenio). */
  accountHomeCenterId: string | null;
  rules: B2bPriceRule[];
}

export interface B2bStatement {
  consumption: number;
  ordersToInvoice: number;
  feesAccrued: number;
  feesInvoiced: number;
  toInvoice: number;
  invoiced: number;
  paid: number;
  receivable: number;
  overdue: number;
  openOrders: number;
  exposure: number;
  creditLimit: number | null;
  creditAvailable: number | null;
}

export interface B2bAccountOrder {
  id: string;
  folio: string;
  detailCenterId: string;
  centerName: string;
  status: string;
  createdAt: string;
  finishedAt: string | null;
  vehicleLabel: string;
  purchaseOrder: string | null;
  agreementName: string | null;
  total: number;
  costTotal: number;
  invoiceId: string | null;
  invoiceReference: string | null;
  evidenceCount: number;
}

/** Cuenta con convenio vigente en el centro, para abrir una OS (lo ve el operador). */
export interface B2bAccountForOrder {
  accountId: string;
  accountName: string;
  clientId: string;
  agreementId: string;
  agreementName: string;
  billingModel: BillingModel;
  vehicleRule: VehicleRule;
  endsOn: string;
  vehicles: {
    id: string;
    make: string;
    model: string;
    year: number;
    plate: string;
    identifier: string | null;
  }[];
}

/** Hecho de rentabilidad por cuenta y centro (sin datos personales). */
export interface B2bProfitabilityFact {
  accountId: string;
  accountName: string;
  detailCenterId: string;
  orders: number;
  revenue: number;
  cost: number;
  feeRevenue: number;
}

/** Información B2B de una OS (tarjeta en el detalle). */
export interface OrderB2bInfo {
  accountId: string;
  accountName: string;
  agreementId: string | null;
  agreementName: string | null;
  billingModel: BillingModel | null;
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

export interface UpsertAccountCommand {
  id?: string | undefined;
  requestId: string;
  homeDetailCenterId: string;
  clientId: string;
  name: string;
  legalName?: string | undefined;
  rfc?: string | undefined;
  taxRegime?: string | undefined;
  fiscalZip?: string | undefined;
  billingEmail?: string | undefined;
  status: B2bAccountStatus;
  notes?: string | undefined;
  reason: string;
}

export interface UpsertContactCommand {
  accountId: string;
  id?: string | undefined;
  fullName: string;
  title?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  isPrimary: boolean;
  active: boolean;
  reason: string;
}

export interface UpsertAgreementCommand {
  accountId: string;
  id?: string | undefined;
  requestId: string;
  name: string;
  billingModel: BillingModel;
  startsOn: string;
  endsOn: string;
  status: AgreementStatus;
  vehicleRule: VehicleRule;
  paymentTermsDays: number;
  creditLimit?: number | undefined;
  feeAmount?: number | undefined;
  includedUnits?: number | undefined;
  centerIds: string[];
  notes?: string | undefined;
  reason: string;
}

export interface SetPriceRuleCommand {
  agreementId: string;
  id?: string | undefined;
  serviceId?: string | undefined;
  kind: PriceRuleKind;
  value?: number | undefined;
  minMonthlyOrders: number;
  active: boolean;
  notes?: string | undefined;
  reason: string;
}

export interface SetVehicleCommand {
  accountId: string;
  vehicleId: string;
  active: boolean;
  costCenter?: string | undefined;
  driverName?: string | undefined;
  notes?: string | undefined;
  reason: string;
}

export interface CreateB2bOrderCommand {
  detailCenterId: string;
  requestId: string;
  accountId: string;
  vehicleId: string;
  items: { serviceId: string; quantity: number }[];
  purchaseOrder?: string | undefined;
  observations?: string | undefined;
}

export interface OrderMutationRef {
  id: string;
  version: number;
  channel: SalesChannel;
}

/** Puerto del módulo B2B (adaptador Supabase en @meguiars/supabase). */
export interface B2bRepository {
  /** `today` (YYYY-MM-DD, zona del centro) decide el estado efectivo del convenio mostrado. */
  listAccounts(
    today: string,
    filter?: { query?: string | undefined; status?: B2bAccountStatus | undefined },
  ): Promise<Result<B2bAccountListItem[]>>;
  /** Clientes empresa sin cuenta B2B (para dar de alta una cuenta). */
  companiesWithoutAccount(): Promise<Result<{ id: string; name: string }[]>>;
  getAccount(id: string): Promise<Result<B2bAccountDetail>>;
  upsertAccount(command: UpsertAccountCommand): Promise<Result<{ id: string }>>;
  upsertContact(command: UpsertContactCommand): Promise<Result<void>>;
  getAgreement(id: string): Promise<Result<B2bAgreementDetail>>;
  upsertAgreement(command: UpsertAgreementCommand): Promise<Result<{ id: string }>>;
  setPriceRule(command: SetPriceRuleCommand): Promise<Result<void>>;
  setVehicle(command: SetVehicleCommand): Promise<Result<void>>;
  accountsForCenter(detailCenterId: string): Promise<Result<B2bAccountForOrder[]>>;
  createOrder(command: CreateB2bOrderCommand): Promise<Result<{ id: string }>>;
  applyAccount(
    orderId: string,
    version: number,
    accountId: string,
    purchaseOrder?: string,
  ): Promise<Result<void>>;
  orderInfo(orderId: string): Promise<Result<OrderB2bInfo | null>>;
  statement(accountId: string): Promise<Result<B2bStatement>>;
  accountOrders(accountId: string, from: string, to: string): Promise<Result<B2bAccountOrder[]>>;
  profitabilityFacts(
    detailCenterIds: string[],
    from: string,
    to: string,
  ): Promise<Result<B2bProfitabilityFact[]>>;
}
