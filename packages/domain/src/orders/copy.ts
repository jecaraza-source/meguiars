import type { StatusTone } from "../agenda/copy";
import type { DiscountLevel, PaymentMethod, SalesChannel, ServiceOrderStatus } from "./order";

export const ORDER_STATUS_LABELS: Record<ServiceOrderStatus, string> = {
  abierta: "Abierta",
  autorizada: "Autorizada",
  en_proceso: "En proceso",
  pausada: "Pausada",
  terminada: "Terminada",
  entregada: "Entregada",
  cancelada: "Cancelada",
};

export const ORDER_STATUS_TONES: Record<ServiceOrderStatus, StatusTone> = {
  abierta: "info",
  autorizada: "brand",
  en_proceso: "warning",
  pausada: "danger",
  terminada: "success",
  entregada: "neutral",
  cancelada: "danger",
};

/** Etiqueta de la acción que lleva a cada estatus. */
export const ORDER_ACTION_LABELS: Record<ServiceOrderStatus, string> = {
  abierta: "Abrir",
  autorizada: "Autorizar (cliente aceptó)",
  en_proceso: "Iniciar / reanudar",
  pausada: "Pausar",
  terminada: "Terminar",
  entregada: "Entregar",
  cancelada: "Cancelar OS",
};

export const SALES_CHANNEL_LABELS: Record<SalesChannel, string> = {
  b2c: "Cliente final (B2C)",
  membresia: "Membresía",
  b2b: "Cuenta B2B",
};

/** Qué pide la referencia del canal. */
export const CHANNEL_REFERENCE_LABELS: Record<SalesChannel, string> = {
  b2c: "Referencia (opcional)",
  membresia: "Número de membresía",
  b2b: "Orden de compra del cliente",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  otro: "Otro",
};

export const DISCOUNT_LEVEL_LABELS: Record<DiscountLevel, string> = {
  operador: "Operador",
  encargado: "Encargado",
  admin: "Admin / socio",
};

/** Textos de la Orden de Servicio, idénticos en web y móvil. */
export const ordersCopy = {
  title: "Órdenes de servicio",
  description: "OS del centro activo: recepción, ejecución, cobro y entrega.",
  newOrder: "Nueva OS (walk-in)",
  newTitle: "Nueva orden de servicio",
  newDescription: "Elige al cliente y su vehículo; las líneas salen del catálogo del centro.",
  fromAppointment: "Abrir OS",
  viewOrder: "Ver OS",
  search: "Buscar por folio, cliente o placa",
  statusFilter: "Estatus",
  all: "Todas",
  filter: "Filtrar",
  empty: "No hay órdenes con estos filtros.",
  notFound: "La OS no existe o es de otro centro.",
  created: "OS abierta.",
  saved: "Cambios guardados.",
  stale: "La OS cambió en otro dispositivo. Se recargó la versión actual; revisa y vuelve a intentar.",
  channelLabel: "Canal",
  vehicleLabel: "Vehículo",
  itemsLabel: "Servicios y productos",
  quantity: "Cantidad",
  odometerLabel: "Kilometraje (opcional)",
  promisedDate: "Fecha prometida (opcional)",
  promisedTime: "Hora prometida",
  bayLabel: "Bahía (opcional)",
  technicianLabel: "Técnico (opcional)",
  none: "Sin asignar",
  observationsLabel: "Observaciones de recepción",
  diagnosisLabel: "Diagnóstico",
  recommendationsLabel: "Recomendaciones",
  nextVisitTitle: "Próxima visita",
  nextVisitDate: "Fecha sugerida",
  nextVisitService: "Servicio recomendado",
  nextVisitNotes: "Notas de la próxima visita",
  submitCreate: "Abrir OS",
  detailsTitle: "Datos de la OS",
  submitDetails: "Guardar datos",
  linesTitle: "Líneas",
  addLine: "Agregar",
  lineReasonHint:
    "Después de autorizar, cambiar líneas exige motivo (p. ej. adicional autorizado por el cliente).",
  remove: "Quitar",
  update: "Actualizar",
  reasonLabel: "Motivo",
  statusTitle: "Estatus",
  statusReasonHint: "Obligatorio para pausar o cancelar.",
  discountsTitle: "Descuentos",
  discountTarget: "Aplicar a",
  wholeOrder: "Toda la OS",
  discountKind: "Tipo",
  percent: "Porcentaje (%)",
  amount: "Importe ($)",
  discountValue: "Valor",
  addDiscount: "Aplicar descuento",
  voidDiscount: "Anular",
  voided: "Anulado",
  discountLevel: "Nivel exigido",
  paymentTitle: "Cobro",
  paymentMethod: "Forma de pago",
  paymentAmount: "Importe",
  paymentReference: "Referencia (opcional)",
  recordPayment: "Registrar cobro",
  paymentHint: "Interfaz mínima: el módulo de pagos agregará pagos parciales detallados y reembolsos.",
  historyTitle: "Historial de estatus",
  subtotal: "Subtotal",
  discountTotal: "Descuentos",
  total: "Total",
  paid: "Cobrado",
  balance: "Saldo",
  margin: "Margen",
  estimated: "Tiempo estimado",
  worked: "Tiempo real",
  folio: "Folio",
  client: "Cliente",
  noLines: "Sin líneas.",
  managerOnly: "Sólo encargado o admin",
  frozenHint: "Precios congelados al venderse; los cambios del catálogo no afectan esta OS.",
  taxHint: "Importes en MXN con IVA incluido.",
} as const;
