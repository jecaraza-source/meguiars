import { formatMoney } from "../catalog/presenter";
import { formatDateOnly } from "../memberships/presenter";
import {
  agreementState,
  type B2bAccountListItem,
  type B2bAccountOrder,
  type B2bAgreement,
  type B2bPriceRule,
  type B2bStatement,
} from "./b2b";
import {
  AGREEMENT_STATE_LABELS,
  AGREEMENT_STATE_TONES,
  b2bCopy,
  B2B_ACCOUNT_STATUS_LABELS,
  B2B_ACCOUNT_STATUS_TONES,
  BILLING_MODEL_LABELS,
  PRICE_RULE_KIND_LABELS,
  VEHICLE_RULE_LABELS,
} from "./copy";

export function presentAccountListItem(a: B2bAccountListItem) {
  return {
    id: a.id,
    name: a.name,
    rfc: a.rfc ?? "—",
    status: B2B_ACCOUNT_STATUS_LABELS[a.status],
    statusTone: B2B_ACCOUNT_STATUS_TONES[a.status],
    homeCenter: a.homeCenterName ?? "—",
    agreement: a.agreementName
      ? `${a.agreementName} · ${a.agreementState ? AGREEMENT_STATE_LABELS[a.agreementState] : ""}${
          a.agreementEndsOn ? ` hasta ${formatDateOnly(a.agreementEndsOn)}` : ""
        }`
      : "Sin convenio",
  };
}

export function presentAgreement(g: B2bAgreement, today: string, centerName: (id: string) => string) {
  const state = agreementState(g.status, g.startsOn, g.endsOn, today);
  return {
    id: g.id,
    name: g.name,
    model: BILLING_MODEL_LABELS[g.billingModel],
    state: AGREEMENT_STATE_LABELS[state],
    stateTone: AGREEMENT_STATE_TONES[state],
    applies: state === "vigente",
    validity: `${formatDateOnly(g.startsOn)} – ${formatDateOnly(g.endsOn)}`,
    vehicles: VEHICLE_RULE_LABELS[g.vehicleRule],
    terms: `${g.paymentTermsDays} días${g.creditLimit != null ? ` · límite ${formatMoney(g.creditLimit)}` : ""}`,
    fee:
      g.feeAmount != null
        ? `${formatMoney(g.feeAmount)}${g.billingModel === "iguala" ? " al mes" : " único"} · ${g.includedUnits ?? 0} servicio(s) incluido(s)`
        : "—",
    centers: g.centerIds.map(centerName).join(", ") || "—",
  };
}

export function presentPriceRule(r: B2bPriceRule) {
  return {
    id: r.id,
    service: r.serviceName ?? b2bCopy.allServices,
    kind: PRICE_RULE_KIND_LABELS[r.kind],
    value:
      r.kind === "precio_fijo"
        ? formatMoney(r.value ?? 0)
        : r.kind === "descuento_pct"
          ? `${r.value ?? 0} %`
          : "Incluido",
    volume: r.minMonthlyOrders > 0 ? `Desde ${r.minMonthlyOrders} OS/mes` : "—",
    active: r.active,
    status: r.active ? "Activa" : "Inactiva",
  };
}

export function statementCards(s: B2bStatement) {
  return [
    {
      label: b2bCopy.consumption,
      value: formatMoney(s.consumption),
      caption: "OS entregadas + cuotas devengadas",
    },
    {
      label: b2bCopy.toInvoice,
      value: formatMoney(s.toInvoice),
      caption: `OS ${formatMoney(s.ordersToInvoice)} · cuotas ${formatMoney(Math.max(0, s.feesAccrued - s.feesInvoiced))}`,
    },
    {
      label: b2bCopy.receivable,
      value: formatMoney(s.receivable),
      caption:
        s.overdue > 0 ? `${b2bCopy.overdue}: ${formatMoney(s.overdue)}` : `Cobrado ${formatMoney(s.paid)}`,
    },
    {
      label: b2bCopy.creditAvailable,
      value: s.creditLimit == null ? b2bCopy.noCreditLimit : formatMoney(s.creditAvailable ?? 0),
      caption: `${b2bCopy.openOrders}: ${formatMoney(s.openOrders)}`,
    },
  ];
}

export function presentAccountOrder(o: B2bAccountOrder, timeZoneDate: (iso: string) => string) {
  return {
    id: o.id,
    folio: o.folio,
    date: timeZoneDate(o.createdAt),
    center: o.centerName,
    vehicle: o.vehicleLabel,
    status: o.status,
    purchaseOrder: o.purchaseOrder ?? "—",
    total: formatMoney(o.total),
    invoice: o.invoiceReference ?? (o.status === "entregada" ? b2bCopy.toInvoice : "—"),
    evidences: String(o.evidenceCount),
    invoiceable: o.status === "entregada" && o.invoiceId === null,
  };
}

/** Mensaje visible de un error del repositorio B2B. */
export function b2bErrorMessage(error: { kind: string; code?: string; message: string }): string {
  if (error.code === "40001") return "La OS cambió en otro dispositivo; recarga para ver la versión actual";
  if (error.kind === "permission_denied" && !error.message) return b2bCopy.forbidden;
  return error.message;
}
