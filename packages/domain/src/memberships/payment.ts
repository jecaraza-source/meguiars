import { formatMoney } from "../catalog/presenter";
import { RECEIPT_STATUS_LABELS, RECEIPT_STATUS_TONES } from "../payments/copy";
import { allowedPaymentMethods, summarizeTenders } from "../payments/payments";
import type { PaymentMethod, ReceiptStatus, TenderInput, TenderSummary } from "../payments/payments";
import type { Capability } from "../roles";
import type { Result } from "../result";
import { formatInCenterTimeZone } from "../time";
import type { Membership } from "./membership";
import { formatDateOnly } from "./presenter";

/**
 * Cobro de la venta y la renovación de membresías (ADR 0043). Espejo de
 * private.create_membership_payment (20261103000000_membership_payments.sql):
 * se cobra el precio completo en efectivo, tarjeta o transferencia (nunca
 * crédito B2B); sólo el efectivo admite recibido mayor (cambio). La base vuelve
 * a validar todo.
 */

/** Formas de pago con las que se cobra una membresía. */
export function membershipPaymentMethods(): PaymentMethod[] {
  return allowedPaymentMethods({ b2bAccountId: null });
}

/** Vista previa del cobro de una membresía: debe cubrir exactamente su precio. */
export function summarizeMembershipTenders(
  price: number,
  tenders: readonly TenderInput[],
  cashReceived?: number | null,
): TenderSummary {
  const summary = summarizeTenders(
    { total: price, paidAmount: 0, b2bAccountId: null },
    tenders,
    cashReceived,
  );
  if (!summary.error && tenders.some((t) => !membershipPaymentMethods().includes(t.method)))
    return { ...summary, error: "Forma de pago inválida para una membresía" };
  if (!summary.error && summary.remaining > 0)
    return { ...summary, error: "El cobro debe cubrir el precio de la membresía" };
  return summary;
}

export interface MembershipPaymentInput {
  tenders: TenderInput[];
  cashReceived?: number | undefined;
  notes?: string | undefined;
}

/** Alta con cobro completo (sell_membership). */
export interface SellMembershipCommand extends MembershipPaymentInput {
  detailCenterId: string;
  requestId: string;
  planId: string;
  clientId: string;
  vehicleId: string;
  startsOn?: string | undefined;
}

/** Renovación con cobro completo (renew_membership_paid). */
export interface RenewMembershipPaidCommand extends MembershipPaymentInput {
  membershipId: string;
  requestId: string;
  /** Sólo al renovar una membresía vencida. */
  planId?: string | undefined;
}

/** Recibo emitido al vender o renovar. */
export interface MembershipReceipt {
  id: string;
  receiptFolio: string;
  amount: number;
  changeAmount: number;
}

export interface MembershipSale {
  membership: Membership;
  receipt: MembershipReceipt;
}

/** Recibo de una membresía (membership_payments). */
export interface MembershipPayment {
  id: string;
  receiptFolio: string;
  amount: number;
  status: ReceiptStatus;
  receivedAt: string;
  kind: "alta" | "renovacion";
  periodStart: string | null;
  periodEnd: string | null;
  methods: string;
}

/** Puerto del cobro de membresías (lo implementa @meguiars/supabase). */
export interface MembershipPaymentRepository {
  sell(command: SellMembershipCommand): Promise<Result<MembershipSale>>;
  renewPaid(command: RenewMembershipPaidCommand): Promise<Result<MembershipSale>>;
  payments(membershipId: string): Promise<Result<MembershipPayment[]>>;
}

/** Vender y renovar incluyen el cobro: exige vender membresías y cobrar (ADR 0043). */
export const canSellMemberships = (can: (capability: Capability) => boolean) =>
  can("memberships.write") && can("payments.write");

export const membershipPaymentsCopy = {
  paymentTitle: "Cobro de la membresía",
  priceToCollect: "Precio a cobrar",
  receiptsTitle: "Recibos de la membresía",
  receiptsEmpty: "Sin recibos: venta registrada antes del cobro con recibo.",
  noPaymentPermission: "Vender o renovar incluye el cobro: lo hace recepción, el encargado o el admin.",
  refundHint:
    "El reembolso cancela la membresía si no se usó en el periodo cobrado; si ya se usó, primero cancélala con su motivo.",
  sold: (folio: string) => `Membresía contratada y cobrada · recibo ${folio}.`,
  renewed: (folio: string) => `Membresía renovada y cobrada · recibo ${folio}.`,
  kind: { alta: "Alta", renovacion: "Renovación" } as const,
};

/** Fila de recibo de la membresía (web y móvil dicen lo mismo). */
export function presentMembershipPayment(p: MembershipPayment, timeZone: string) {
  return {
    id: p.id,
    folio: p.receiptFolio,
    kind: membershipPaymentsCopy.kind[p.kind],
    period:
      p.periodStart && p.periodEnd
        ? `${formatDateOnly(p.periodStart)} – ${formatDateOnly(p.periodEnd)}`
        : "—",
    amount: formatMoney(p.amount),
    methods: p.methods,
    when: formatInCenterTimeZone(p.receivedAt, timeZone),
    status: RECEIPT_STATUS_LABELS[p.status],
    statusTone: RECEIPT_STATUS_TONES[p.status],
    valid: p.status === "valido",
  };
}
