import type { SalesChannel, ServiceOrderStatus } from "../orders/order";
import type { Result } from "../result";
import { PAYMENT_METHOD_LABELS } from "./copy";

/**
 * Administración y Finanzas / Ingresos y cobranza (AF1). La venta es la OS
 * (total con descuentos autorizados y redenciones); un recibo sólo representa
 * la cobranza de ese total. Reglas espejo de la migración
 * 20261007000000_payments.sql (private.create_order_payment);
 * schema-parity.test.ts compara el catálogo de formas de pago.
 */

/** Formas de pago que se capturan hoy (payment_methods activas, en orden). */
export const PAYMENT_METHODS = ["efectivo", "tarjeta", "transferencia", "membresia", "credito_b2b"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Todas las del catálogo; "otro" sólo existe en cobros previos al módulo. */
export const PAYMENT_METHOD_CODES = [...PAYMENT_METHODS, "otro"] as const;
export type PaymentMethodCode = (typeof PAYMENT_METHOD_CODES)[number];

export type PaymentMethodKind = "efectivo" | "electronico" | "beneficio" | "credito" | "otro";

export interface PaymentMethodRule {
  kind: PaymentMethodKind;
  /** Entra a caja o banco (membresía y crédito B2B liquidan sin efectivo). */
  collectsCash: boolean;
  requiresReference: boolean;
  /** Admite recibido mayor al importe y entrega cambio. */
  allowsChange: boolean;
  active: boolean;
}

/** Espejo de las filas de public.payment_methods. */
export const PAYMENT_METHOD_RULES: Record<PaymentMethodCode, PaymentMethodRule> = {
  efectivo: {
    kind: "efectivo",
    collectsCash: true,
    requiresReference: false,
    allowsChange: true,
    active: true,
  },
  tarjeta: {
    kind: "electronico",
    collectsCash: true,
    requiresReference: false,
    allowsChange: false,
    active: true,
  },
  transferencia: {
    kind: "electronico",
    collectsCash: true,
    requiresReference: true,
    allowsChange: false,
    active: true,
  },
  membresia: {
    kind: "beneficio",
    collectsCash: false,
    requiresReference: false,
    allowsChange: false,
    active: true,
  },
  credito_b2b: {
    kind: "credito",
    collectsCash: false,
    requiresReference: false,
    allowsChange: false,
    active: true,
  },
  otro: { kind: "otro", collectsCash: true, requiresReference: false, allowsChange: false, active: false },
};

/** Estado de pago de la OS (columna generada service_orders.payment_status). */
export const ORDER_PAYMENT_STATUSES = ["pendiente", "parcial", "pagada"] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

/** Estado del recibo. */
export const RECEIPT_STATUSES = ["valido", "revertido"] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

/** Una OS se cobra desde que se autoriza hasta después de entregarse (B2B entrega con saldo). */
export const PAYABLE_ORDER_STATUSES: readonly ServiceOrderStatus[] = [
  "autorizada",
  "en_proceso",
  "pausada",
  "terminada",
  "entregada",
];

export const REVERSAL_REASON_MIN = 3;
export const REVERSAL_REASON_MAX = 500;
export const PAYMENT_NOTES_MAX = 500;
export const PAYMENT_REFERENCE_MAX = 80;

const cents = (amount: number) => Math.round(amount * 100);
const money = (c: number) => c / 100;

/** Espejo de la columna generada: pagada si cubre el total, parcial si hay algo cobrado. */
export function orderPaymentStatus(total: number, paidAmount: number): OrderPaymentStatus {
  if (cents(paidAmount) >= cents(total)) return "pagada";
  return cents(paidAmount) > 0 ? "parcial" : "pendiente";
}

/**
 * Formas de pago que admite la OS: una OS a cuenta B2B sólo a crédito de la
 * cuenta (su cobranza va en el estado de cuenta, no en caja: así no se cuenta
 * dos veces); el crédito B2B sólo para OS a cuenta. La membresía sólo si el
 * cliente tiene una vigente.
 */
export function allowedPaymentMethods(order: {
  b2bAccountId: string | null;
  hasActiveMembership?: boolean;
}): PaymentMethod[] {
  if (order.b2bAccountId) return ["credito_b2b"];
  return PAYMENT_METHODS.filter(
    (m) => m !== "credito_b2b" && (m !== "membresia" || order.hasActiveMembership === true),
  );
}

export interface TenderInput {
  method: PaymentMethod;
  amount: number;
  reference?: string | undefined;
}

export interface TenderSummary {
  /** Σ de las formas de pago = importe del recibo. */
  total: number;
  /** Parte en efectivo. */
  cash: number;
  /** Cambio a entregar (recibido − efectivo). */
  change: number;
  /** Saldo que quedaría después del cobro. */
  remaining: number;
  status: OrderPaymentStatus;
  /** Primer problema (mismo criterio que la base) o null. */
  error: string | null;
}

/**
 * Vista previa del cobro (espejo de private.create_order_payment): sin
 * sobrepago salvo el cambio del efectivo, referencia cuando se exige y
 * efectivo recibido suficiente. La base vuelve a validar todo.
 */
export function summarizeTenders(
  order: { total: number; paidAmount: number; b2bAccountId: string | null },
  tenders: readonly TenderInput[],
  cashReceived?: number | null,
): TenderSummary {
  const balance = Math.max(0, cents(order.total) - cents(order.paidAmount));
  let total = 0;
  let cash = 0;
  let error: string | null = null;
  const allowed = allowedPaymentMethods({ b2bAccountId: order.b2bAccountId, hasActiveMembership: true });
  for (const t of tenders) {
    const rule = PAYMENT_METHOD_RULES[t.method];
    const amount = cents(t.amount);
    if (!error && (!Number.isFinite(t.amount) || amount <= 0 || Math.abs(t.amount * 100 - amount) > 1e-6))
      error = "Importe inválido";
    if (!error && !allowed.includes(t.method))
      error = order.b2bAccountId
        ? "Una OS a cuenta B2B se cobra a crédito de la cuenta"
        : "El crédito B2B sólo aplica a OS a cuenta de una empresa";
    if (!error && rule.requiresReference && !t.reference?.trim())
      error = `Captura la referencia de ${PAYMENT_METHOD_LABELS[t.method].toLowerCase()}`;
    total += amount;
    if (rule.allowsChange) cash += amount;
  }
  if (!error && tenders.length === 0) error = "Indica al menos una forma de pago";
  if (!error && total > balance) error = "El cobro excede el saldo pendiente";
  const received = cashReceived == null ? null : cents(cashReceived);
  if (!error && received !== null && (cash === 0 || received < cash))
    error = "El efectivo recibido debe cubrir el importe en efectivo";
  const paidAfter = cents(order.paidAmount) + Math.min(total, balance);
  return {
    total: money(total),
    cash: money(cash),
    change: received !== null && received > cash && cash > 0 ? money(received - cash) : 0,
    remaining: money(Math.max(0, balance - total)),
    status: orderPaymentStatus(order.total, money(paidAfter)),
    error,
  };
}

/** Recibo tal como lo lista la OS (order_payments). */
export interface OrderPayment {
  id: string;
  receiptFolio: string;
  amount: number;
  /** Importe aplicado a esta OS. */
  applied: number;
  status: ReceiptStatus;
  receivedAt: string;
  receivedByName: string | null;
  cashReceived: number | null;
  changeAmount: number;
  tenders: ReceiptTender[];
  reversalReason: string | null;
  reversedAt: string | null;
  reversedByName: string | null;
}

export interface ReceiptTender {
  method: PaymentMethodCode;
  name: string;
  amount: number;
  reference: string | null;
}

/** Recibo interno completo (payment_receipt). No es un CFDI. */
export interface PaymentReceipt {
  id: string;
  receiptFolio: string;
  status: ReceiptStatus;
  amount: number;
  cashReceived: number | null;
  changeAmount: number;
  notes: string | null;
  receivedAt: string;
  receivedBy: string | null;
  detailCenterId: string;
  centerName: string;
  centerTimezone: string;
  organizationName: string;
  /** null si quien consulta no ve datos de clientes (contador). */
  clientName: string | null;
  tenders: ReceiptTender[];
  orders: {
    id: string;
    folio: string;
    total: number;
    applied: number;
    paid: number;
    balance: number;
    paymentStatus: OrderPaymentStatus;
  }[];
  reversal: { reason: string; reversedAt: string; reversedBy: string | null } | null;
}

/** Fila del listado de recibos (list_payments). */
export interface PaymentListItem {
  id: string;
  detailCenterId: string;
  receiptFolio: string;
  receivedAt: string;
  amount: number;
  status: ReceiptStatus;
  clientName: string | null;
  orderFolios: string | null;
  methods: string | null;
  receivedByName: string | null;
}

/** Hecho del corte de caja por centro, día y forma de pago (payment_facts). */
export interface PaymentFact {
  detailCenterId: string;
  /** AAAA-MM-DD (fecha del centro). */
  day: string;
  method: PaymentMethodCode;
  methodName: string;
  collectsCash: boolean;
  validAmount: number;
  validCount: number;
  reversedAmount: number;
  reversedCount: number;
  changeAmount: number;
}

/** OS con saldo (receivable_orders). */
export interface ReceivableOrder {
  id: string;
  detailCenterId: string;
  folio: string;
  clientName: string | null;
  channel: SalesChannel;
  status: ServiceOrderStatus;
  b2bAccountId: string | null;
  total: number;
  paidAmount: number;
  balance: number;
  paymentStatus: OrderPaymentStatus;
  createdAt: string;
}

/** Conciliación por centro (sales_reconciliation). */
export interface SalesReconciliation {
  detailCenterId: string;
  deliveredOrders: number;
  salesTotal: number;
  collectedForSales: number;
  pendingForSales: number;
  collectedInRange: number;
  cashInRange: number;
  reversedInRange: number;
}

export interface RegisterPaymentCommand {
  orderId: string;
  version: number;
  /** Idempotencia: un reintento con el mismo id devuelve el mismo recibo. */
  requestId: string;
  tenders: TenderInput[];
  cashReceived?: number | undefined;
  notes?: string | undefined;
}

export interface ReversePaymentCommand {
  paymentId: string;
  reason: string;
}

export interface PaymentMutation {
  id: string;
  receiptFolio: string;
  status: ReceiptStatus;
}

export interface PaymentRange {
  detailCenterIds: string[];
  /** AAAA-MM-DD, inclusive (fecha de cada centro). */
  from: string;
  to: string;
}

/** Puerto de cobranza. Web y móvil usan el mismo adaptador (`@meguiars/supabase`). */
export interface PaymentRepository {
  orderPayments(orderId: string): Promise<Result<OrderPayment[]>>;
  register(command: RegisterPaymentCommand): Promise<Result<PaymentMutation>>;
  reverse(command: ReversePaymentCommand): Promise<Result<PaymentMutation>>;
  receipt(id: string): Promise<Result<PaymentReceipt>>;
  list(range: PaymentRange): Promise<Result<PaymentListItem[]>>;
  facts(range: PaymentRange): Promise<Result<PaymentFact[]>>;
  receivables(detailCenterIds: string[]): Promise<Result<ReceivableOrder[]>>;
  reconciliation(range: PaymentRange): Promise<Result<SalesReconciliation[]>>;
  /** ¿El cliente tiene membresía vigente a `today` (AAAA-MM-DD del centro)? Habilita "membresía". */
  hasActiveMembership(clientId: string, today: string): Promise<Result<boolean>>;
}
