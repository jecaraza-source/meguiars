import type { RevenueEngine } from "../catalog/catalog";
import type { Result } from "../result";
import type { AppRole } from "../roles";

/** Estatus de una Orden de Servicio. Coincide con `public.service_order_status`. */
export const SERVICE_ORDER_STATUSES = [
  "abierta",
  "autorizada",
  "en_proceso",
  "pausada",
  "terminada",
  "entregada",
  "cancelada",
] as const;
export type ServiceOrderStatus = (typeof SERVICE_ORDER_STATUSES)[number];

/**
 * Transiciones válidas (espejo de private.service_order_transition_allowed;
 * schema-parity.test.ts compara ambas definiciones).
 */
export const SERVICE_ORDER_TRANSITIONS: Record<ServiceOrderStatus, readonly ServiceOrderStatus[]> = {
  abierta: ["autorizada", "cancelada"],
  autorizada: ["en_proceso", "cancelada"],
  en_proceso: ["pausada", "terminada"],
  pausada: ["en_proceso", "cancelada"],
  terminada: ["entregada"],
  entregada: [],
  cancelada: [],
};

/** Estatus que exigen motivo al aplicarse. */
export const ORDER_STATUS_NEEDS_REASON: readonly ServiceOrderStatus[] = ["pausada", "cancelada"];

/** Las líneas cambian hasta antes de terminar; después de autorizar, con motivo. */
export const ITEM_EDITABLE_STATUSES: readonly ServiceOrderStatus[] = [
  "abierta",
  "autorizada",
  "en_proceso",
  "pausada",
];
/** Descuentos: hasta antes de entregar. */
export const DISCOUNT_EDITABLE_STATUSES: readonly ServiceOrderStatus[] = [
  ...ITEM_EDITABLE_STATUSES,
  "terminada",
];
/** Cobro: OS autorizada y no entregada. */
export const PAYABLE_STATUSES: readonly ServiceOrderStatus[] = [
  "autorizada",
  "en_proceso",
  "pausada",
  "terminada",
];
/** OS cerradas: ya no se editan. */
export const CLOSED_STATUSES: readonly ServiceOrderStatus[] = ["entregada", "cancelada"];

export const canTransitionOrder = (from: ServiceOrderStatus, to: ServiceOrderStatus): boolean =>
  SERVICE_ORDER_TRANSITIONS[from].includes(to);

/** Canal de venta. Coincide con `public.sales_channel`. */
export const SALES_CHANNELS = ["b2c", "membresia", "b2b"] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];

/** Formas de pago del cobro (espejo de record_service_order_payment). */
export const PAYMENT_METHODS = ["efectivo", "tarjeta", "transferencia", "otro"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Nivel de autorización de descuentos. Coincide con `public.discount_level` (ordenado). */
export const DISCOUNT_LEVELS = ["operador", "encargado", "admin"] as const;
export type DiscountLevel = (typeof DISCOUNT_LEVELS)[number];

/**
 * % máximo de descuento acumulado de la OS que autoriza cada nivel (espejo de
 * private.discount_required_level; schema-parity.test.ts lo compara).
 */
export const DISCOUNT_LEVEL_LIMITS: Record<DiscountLevel, number> = {
  operador: 10,
  encargado: 30,
  admin: 100,
};

/** Nivel exigido por el % de descuento acumulado de la OS. */
export function requiredDiscountLevel(percent: number): DiscountLevel {
  return DISCOUNT_LEVELS.find((level) => percent <= DISCOUNT_LEVEL_LIMITS[level]) ?? "admin";
}

/** Nivel que autoriza el usuario según sus roles en el centro (espejo de private.discount_level_of). */
export function discountLevelOf(roles: readonly AppRole[]): DiscountLevel | null {
  if (roles.includes("admin_socio")) return "admin";
  if (roles.includes("encargado")) return "encargado";
  if (roles.includes("operador_recepcion")) return "operador";
  return null;
}

export const levelAllows = (mine: DiscountLevel | null, required: DiscountLevel): boolean =>
  mine !== null && DISCOUNT_LEVELS.indexOf(mine) >= DISCOUNT_LEVELS.indexOf(required);

export type OrderItemKind = "servicio" | "producto";
export type DiscountKind = "percent" | "amount";

/** OS tal como la muestra el listado del centro. */
export interface ServiceOrderListItem {
  id: string;
  folio: string;
  status: ServiceOrderStatus;
  channel: SalesChannel;
  clientName: string;
  vehicleLabel: string;
  bayName: string | null;
  technicianName: string | null;
  total: number;
  paidAmount: number;
  estimatedMinutes: number;
  promisedAt: string | null;
  appointmentId: string | null;
  createdAt: string;
}

/** Línea con precio, costo, duración y motor congelados al venderse. */
export interface ServiceOrderItem {
  id: string;
  position: number;
  kind: OrderItemKind;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  revenueEngine: RevenueEngine;
  unitPrice: number;
  unitDirectCost: number;
  durationMinutes: number;
  priceSource: "base" | "center";
  quantity: number;
  lineSubtotal: number;
  lineDiscount: number;
}

export interface ServiceOrderDiscount {
  id: string;
  /** null = descuento sobre la OS. */
  itemId: string | null;
  kind: DiscountKind;
  value: number;
  amount: number;
  reason: string;
  authorizationLevel: DiscountLevel;
  authorizedBy: string | null;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface StatusHistoryEntry {
  id: number;
  fromStatus: ServiceOrderStatus | null;
  toStatus: ServiceOrderStatus;
  reason: string | null;
  actorId: string | null;
  occurredAt: string;
}

/** OS completa (detalle). Importes en MXN con IVA incluido; horas en UTC. */
export interface ServiceOrder {
  id: string;
  detailCenterId: string;
  folio: string;
  status: ServiceOrderStatus;
  /** Versión leída: toda edición la envía (concurrencia optimista web/móvil). */
  version: number;
  channel: SalesChannel;
  channelReference: string | null;
  appointmentId: string | null;
  clientId: string;
  vehicleId: string;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  vehicleLabel: string;
  odometerKm: number | null;
  bayId: string | null;
  bayName: string | null;
  technicianId: string | null;
  technicianName: string | null;
  diagnosis: string | null;
  observations: string | null;
  recommendations: string | null;
  nextVisitOn: string | null;
  nextVisitServiceId: string | null;
  nextVisitNotes: string | null;
  subtotal: number;
  discountTotal: number;
  total: number;
  costTotal: number;
  estimatedMinutes: number;
  paidAmount: number;
  authorizedAt: string | null;
  authorizedTotal: number | null;
  promisedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  workStartedAt: string | null;
  workedMinutes: number;
  createdAt: string;
  items: ServiceOrderItem[];
  discounts: ServiceOrderDiscount[];
  history: StatusHistoryEntry[];
}

export interface OrderItemInput {
  serviceId: string;
  quantity: number;
}

export interface CreateServiceOrderCommand {
  detailCenterId: string;
  requestId: string;
  clientId: string;
  vehicleId: string;
  items: OrderItemInput[];
  channel: SalesChannel;
  channelReference?: string | undefined;
  bayId?: string | undefined;
  technicianId?: string | undefined;
  observations?: string | undefined;
  odometerKm?: number | undefined;
  /** UTC ISO. */
  promisedAt?: string | undefined;
}

export interface CreateFromAppointmentCommand {
  appointmentId: string;
  requestId: string;
  channel: SalesChannel;
  channelReference?: string | undefined;
  odometerKm?: number | undefined;
  promisedAt?: string | undefined;
}

interface VersionedCommand {
  orderId: string;
  version: number;
}

/** Agrega una línea o cambia su cantidad (0 = quitarla). */
export interface SetOrderItemCommand extends VersionedCommand {
  serviceId: string;
  quantity: number;
  reason?: string | undefined;
}

export interface AddDiscountCommand extends VersionedCommand {
  itemId?: string | undefined;
  kind: DiscountKind;
  value: number;
  reason: string;
}

export interface VoidDiscountCommand extends VersionedCommand {
  discountId: string;
  reason: string;
}

export interface SetOrderStatusCommand extends VersionedCommand {
  status: ServiceOrderStatus;
  reason?: string | undefined;
}

export interface UpdateOrderDetailsCommand extends VersionedCommand {
  channel: SalesChannel;
  channelReference?: string | undefined;
  bayId?: string | undefined;
  technicianId?: string | undefined;
  diagnosis?: string | undefined;
  observations?: string | undefined;
  recommendations?: string | undefined;
  /** AAAA-MM-DD (fecha del centro). */
  nextVisitOn?: string | undefined;
  nextVisitServiceId?: string | undefined;
  nextVisitNotes?: string | undefined;
  odometerKm?: number | undefined;
  promisedAt?: string | undefined;
}

export interface RecordPaymentCommand extends VersionedCommand {
  amount: number;
  method: PaymentMethod;
  reference?: string | undefined;
}

export interface OrderListFilter {
  status?: ServiceOrderStatus | undefined;
  query?: string | undefined;
}

/** Resultado de una mutación: la OS con su versión nueva. */
export interface OrderMutation {
  id: string;
  version: number;
  status: ServiceOrderStatus;
}

/** Puerto de Órdenes de Servicio. Web y móvil usan el mismo adaptador (`@meguiars/supabase`). */
export interface ServiceOrderRepository {
  list(detailCenterId: string, filter?: OrderListFilter): Promise<Result<ServiceOrderListItem[]>>;
  get(id: string): Promise<Result<ServiceOrder>>;
  create(command: CreateServiceOrderCommand): Promise<Result<OrderMutation>>;
  createFromAppointment(command: CreateFromAppointmentCommand): Promise<Result<OrderMutation>>;
  setItem(command: SetOrderItemCommand): Promise<Result<OrderMutation>>;
  addDiscount(command: AddDiscountCommand): Promise<Result<OrderMutation>>;
  voidDiscount(command: VoidDiscountCommand): Promise<Result<OrderMutation>>;
  setStatus(command: SetOrderStatusCommand): Promise<Result<OrderMutation>>;
  updateDetails(command: UpdateOrderDetailsCommand): Promise<Result<OrderMutation>>;
  recordPayment(command: RecordPaymentCommand): Promise<Result<OrderMutation>>;
}

type BlockerInput = Pick<ServiceOrder, "channel" | "channelReference" | "paidAmount" | "total"> & {
  items: readonly unknown[];
};

/** Qué impide autorizar (null = nada). Espejo de private.service_order_authorization_blocker. */
export function authorizationBlocker(order: BlockerInput): string | null {
  if (order.items.length === 0) return "Agrega al menos una línea antes de autorizar";
  if (order.channel === "membresia" && !order.channelReference) return "Captura el número de membresía";
  if (order.channel === "b2b" && !order.channelReference) return "Captura la orden de compra del cliente B2B";
  return null;
}

/**
 * Qué impide entregar (null = nada). Espejo de private.service_order_delivery_blocker:
 * b2c y membresía exigen el saldo cobrado; B2B se factura a la cuenta con su orden de compra.
 */
export function deliveryBlocker(order: BlockerInput): string | null {
  if ((order.channel === "b2c" || order.channel === "membresia") && order.paidAmount < order.total)
    return "Hay saldo pendiente: registra el cobro antes de entregar";
  if (order.channel === "b2b" && !order.channelReference) return "Captura la orden de compra del cliente B2B";
  return null;
}
