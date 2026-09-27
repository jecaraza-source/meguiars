import type { StatusTone } from "../agenda/copy";
import type { OrderPaymentStatus, PaymentMethodCode, ReceiptStatus } from "./payments";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodCode, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  membresia: "Membresía",
  credito_b2b: "Crédito B2B",
  otro: "Otro",
};

export const ORDER_PAYMENT_STATUS_LABELS: Record<OrderPaymentStatus, string> = {
  pendiente: "Pendiente de pago",
  parcial: "Pago parcial",
  pagada: "Pagada",
};

export const ORDER_PAYMENT_STATUS_TONES: Record<OrderPaymentStatus, StatusTone> = {
  pendiente: "warning",
  parcial: "info",
  pagada: "success",
};

export const RECEIPT_STATUS_LABELS: Record<ReceiptStatus, string> = {
  valido: "Válido",
  revertido: "Revertido",
};

export const RECEIPT_STATUS_TONES: Record<ReceiptStatus, StatusTone> = {
  valido: "success",
  revertido: "danger",
};

/** Textos de cobranza, idénticos en web y móvil. */
export const paymentsCopy = {
  title: "Cobranza",
  description: "Corte de caja, recibos, saldos por cobrar y conciliación contra ventas.",
  forbidden: "Sin permiso para esta acción.",
  notFound: "El recibo no existe o no tienes acceso.",
  // Cobro en la OS
  orderTitle: "Cobro",
  status: "Estado de pago",
  total: "Total de la OS",
  paid: "Cobrado",
  balance: "Saldo",
  discountsNote: "El total ya refleja los descuentos autorizados y las redenciones de membresía.",
  method: "Forma de pago",
  amount: "Importe",
  reference: "Referencia",
  referenceOptional: "Referencia (opcional)",
  addTender: "Agregar otra forma de pago",
  removeTender: "Quitar",
  payBalance: "Cobrar el saldo",
  cashReceived: "Efectivo recibido (opcional)",
  cashReceivedHint: "Si el cliente entrega más efectivo, se calcula el cambio.",
  change: "Cambio",
  remainingAfter: "Saldo después del cobro",
  notes: "Notas (opcional)",
  register: "Registrar cobro",
  registered: "Cobro registrado.",
  onlineOnly: "Los cobros requieren conexión: no se guardan sin internet.",
  notPayable: "La OS se cobra cuando está autorizada.",
  settled: "La OS está pagada.",
  b2bHint: "OS a cuenta B2B: se liquida a crédito de la cuenta y se cobra en su estado de cuenta.",
  membershipHint: "Membresía: sólo con una membresía vigente del cliente.",
  // Recibos
  receipts: "Recibos",
  receiptsEmpty: "Sin cobros registrados.",
  receipt: "Recibo",
  receiptTitle: "Recibo interno de cobro",
  notCfdi: "Comprobante interno. No es un CFDI ni tiene validez fiscal.",
  print: "Imprimir",
  share: "Compartir",
  viewReceipt: "Ver recibo",
  receivedBy: "Recibió",
  receivedAt: "Fecha",
  client: "Cliente",
  orders: "Órdenes de servicio",
  applied: "Aplicado",
  tenders: "Formas de pago",
  reversed: "Recibo revertido",
  // Reverso
  reverse: "Revertir cobro",
  reverseTitle: "Revertir recibo",
  reverseHint:
    "Úsalo para reembolsos o capturas erróneas. El recibo completo queda revertido (con motivo y quién lo hizo) y el saldo vuelve a la OS.",
  reverseReason: "Motivo del reverso",
  reverseConfirm: "Confirmar reverso",
  reverseDone: "Recibo revertido.",
  // Corte y conciliación
  rangeLabel: "Periodo",
  rangeToday: "Hoy",
  range7: "Últimos 7 días",
  range30: "Últimos 30 días",
  scopeCenter: "Centro activo",
  scopeAll: "Todos mis centros",
  kpis: "Corte de caja",
  byMethod: "Por forma de pago",
  receivables: "Por cobrar",
  receivablesEmpty: "Sin saldos pendientes.",
  reconciliation: "Conciliación",
  reconciliationHint:
    "Ventas = OS entregadas en el periodo (la venta es la OS); los recibos sólo cobran ese total.",
  empty: "Sin cobros en el periodo.",
  noClientData: "—",
} as const;
