import type {
  OrderMutation,
  ServiceOrder,
  ServiceOrderListItem,
  ServiceOrderRepository,
} from "@meguiars/domain";
import {
  addDiscountSchema,
  createFromAppointmentSchema,
  createServiceOrderSchema,
  orderFilterSchema,
  recordPaymentSchema,
  setOrderItemSchema,
  setOrderStatusSchema,
  updateOrderDetailsSchema,
  voidDiscountSchema,
} from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import type { Database, Tables } from "../database.types";
import { invalid, run } from "./shared";

type ListRow = Database["public"]["Functions"]["list_service_orders"]["Returns"][number];

const toListItem = (row: ListRow): ServiceOrderListItem => ({
  id: row.id,
  folio: row.folio,
  status: row.status,
  channel: row.channel,
  clientName: row.client_name,
  vehicleLabel: row.vehicle_label,
  bayName: row.bay_name,
  technicianName: row.technician_name,
  total: Number(row.total),
  paidAmount: Number(row.paid_amount),
  estimatedMinutes: row.estimated_minutes,
  promisedAt: row.promised_at,
  appointmentId: row.appointment_id,
  createdAt: row.created_at,
});

type DetailRow = Tables<"service_orders"> & {
  service_order_items: Tables<"service_order_items">[];
  service_order_discounts: Tables<"service_order_discounts">[];
  service_order_status_history: Tables<"service_order_status_history">[];
  bays: { name: string } | null;
  technicians: { full_name: string } | null;
};

const num = (v: number | string | null) => (v === null ? null : Number(v));

export const toServiceOrder = (row: DetailRow): ServiceOrder => ({
  id: row.id,
  detailCenterId: row.detail_center_id,
  folio: row.folio,
  status: row.status,
  version: row.version,
  channel: row.channel,
  channelReference: row.channel_reference,
  appointmentId: row.appointment_id,
  clientId: row.client_id,
  vehicleId: row.vehicle_id,
  clientName: row.client_name,
  clientPhone: row.client_phone,
  clientEmail: row.client_email,
  vehicleLabel: `${row.vehicle_make} ${row.vehicle_model} ${row.vehicle_year} · ${row.vehicle_plate}`,
  odometerKm: row.odometer_km,
  bayId: row.bay_id,
  bayName: row.bays?.name ?? null,
  technicianId: row.technician_id,
  technicianName: row.technicians?.full_name ?? null,
  diagnosis: row.diagnosis,
  observations: row.observations,
  recommendations: row.recommendations,
  nextVisitOn: row.next_visit_on,
  nextVisitServiceId: row.next_visit_service_id,
  nextVisitNotes: row.next_visit_notes,
  subtotal: Number(row.subtotal),
  discountTotal: Number(row.discount_total),
  total: Number(row.total),
  costTotal: Number(row.cost_total),
  estimatedMinutes: row.estimated_minutes,
  paidAmount: Number(row.paid_amount),
  authorizedAt: row.authorized_at,
  authorizedTotal: num(row.authorized_total),
  promisedAt: row.promised_at,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  deliveredAt: row.delivered_at,
  cancelledAt: row.cancelled_at,
  workStartedAt: row.work_started_at,
  workedMinutes: row.worked_minutes,
  createdAt: row.created_at,
  items: [...row.service_order_items]
    .sort((a, b) => a.position - b.position)
    .map((i) => ({
      id: i.id,
      position: i.position,
      kind: i.kind as "servicio" | "producto",
      serviceId: i.service_id,
      serviceCode: i.service_code,
      serviceName: i.service_name,
      revenueEngine: i.revenue_engine,
      unitPrice: Number(i.unit_price),
      unitDirectCost: Number(i.unit_direct_cost),
      durationMinutes: i.duration_minutes,
      priceSource: i.price_source as "base" | "center",
      quantity: i.quantity,
      lineSubtotal: Number(i.line_subtotal),
      lineDiscount: Number(i.line_discount),
    })),
  discounts: [...row.service_order_discounts]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((d) => ({
      id: d.id,
      itemId: d.item_id,
      kind: d.kind as "percent" | "amount",
      value: Number(d.value),
      amount: Number(d.amount),
      reason: d.reason,
      authorizationLevel: d.authorization_level,
      authorizedBy: d.authorized_by,
      createdAt: d.created_at,
      voidedAt: d.voided_at,
      voidReason: d.void_reason,
    })),
  history: [...row.service_order_status_history]
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id - b.id)
    .map((h) => ({
      id: h.id,
      fromStatus: h.from_status,
      toStatus: h.to_status,
      reason: h.reason,
      actorId: h.actor_id,
      occurredAt: h.occurred_at,
    })),
});

const toMutation = (row: Tables<"service_orders">): OrderMutation => ({
  id: row.id,
  version: row.version,
  status: row.status,
});

/**
 * Adaptador Supabase del puerto `ServiceOrderRepository`. Toda escritura va
 * por RPC: la base recalcula totales, congela precios, valida transiciones,
 * niveles de descuento, reglas por canal y la versión (concurrencia); RLS
 * limita la lectura a los centros del usuario.
 */
export function createServiceOrderRepository(client: MeguiarsSupabaseClient): ServiceOrderRepository {
  return {
    list(detailCenterId, filter = {}) {
      const parsed = orderFilterSchema.safeParse(filter);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const f = parsed.data;
      return run(
        () =>
          client.rpc("list_service_orders", {
            p_detail_center_id: detailCenterId,
            ...(f.status ? { p_status: f.status } : {}),
            ...(f.query ? { p_query: f.query } : {}),
          }),
        (rows) => rows.map(toListItem),
      );
    },

    get(id) {
      return run(
        () =>
          client
            .from("service_orders")
            .select(
              "*, service_order_items(*), service_order_discounts(*), service_order_status_history(*), bays(name), technicians(full_name)",
            )
            .eq("id", id)
            .maybeSingle(),
        (row) => toServiceOrder(row as unknown as DetailRow),
      );
    },

    create(command) {
      const parsed = createServiceOrderSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("create_service_order", {
            p_detail_center_id: c.detailCenterId,
            p_request_id: c.requestId,
            p_client_id: c.clientId,
            p_vehicle_id: c.vehicleId,
            p_items: c.items.map((i) => ({ service_id: i.serviceId, quantity: i.quantity })),
            p_channel: c.channel,
            ...(c.channelReference ? { p_channel_reference: c.channelReference } : {}),
            ...(c.bayId ? { p_bay_id: c.bayId } : {}),
            ...(c.technicianId ? { p_technician_id: c.technicianId } : {}),
            ...(c.observations ? { p_observations: c.observations } : {}),
            ...(c.odometerKm !== undefined ? { p_odometer_km: c.odometerKm } : {}),
            ...(c.promisedAt ? { p_promised_at: c.promisedAt } : {}),
          }),
        toMutation,
      );
    },

    createFromAppointment(command) {
      const parsed = createFromAppointmentSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("create_service_order_from_appointment", {
            p_appointment_id: c.appointmentId,
            p_request_id: c.requestId,
            p_channel: c.channel,
            ...(c.channelReference ? { p_channel_reference: c.channelReference } : {}),
            ...(c.odometerKm !== undefined ? { p_odometer_km: c.odometerKm } : {}),
            ...(c.promisedAt ? { p_promised_at: c.promisedAt } : {}),
          }),
        toMutation,
      );
    },

    setItem(command) {
      const parsed = setOrderItemSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("set_service_order_item", {
            p_order_id: c.orderId,
            p_version: c.version,
            p_service_id: c.serviceId,
            p_quantity: c.quantity,
            ...(c.reason ? { p_reason: c.reason } : {}),
          }),
        toMutation,
      );
    },

    addDiscount(command) {
      const parsed = addDiscountSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("add_service_order_discount", {
            p_order_id: c.orderId,
            p_version: c.version,
            p_item_id: c.itemId ?? null,
            p_kind: c.kind,
            p_value: c.value,
            p_reason: c.reason,
          }),
        toMutation,
      );
    },

    voidDiscount(command) {
      const parsed = voidDiscountSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("void_service_order_discount", {
            p_discount_id: c.discountId,
            p_version: c.version,
            p_reason: c.reason,
          }),
        toMutation,
      );
    },

    setStatus(command) {
      const parsed = setOrderStatusSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("set_service_order_status", {
            p_order_id: c.orderId,
            p_version: c.version,
            p_status: c.status,
            ...(c.reason ? { p_reason: c.reason } : {}),
          }),
        toMutation,
      );
    },

    updateDetails(command) {
      const parsed = updateOrderDetailsSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("update_service_order_details", {
            p_order_id: c.orderId,
            p_version: c.version,
            p_channel: c.channel,
            p_channel_reference: c.channelReference ?? null,
            p_bay_id: c.bayId ?? null,
            p_technician_id: c.technicianId ?? null,
            p_diagnosis: c.diagnosis ?? null,
            p_observations: c.observations ?? null,
            p_recommendations: c.recommendations ?? null,
            p_next_visit_on: c.nextVisitOn ?? null,
            p_next_visit_service_id: c.nextVisitServiceId ?? null,
            p_next_visit_notes: c.nextVisitNotes ?? null,
            p_odometer_km: c.odometerKm ?? null,
            p_promised_at: c.promisedAt ?? null,
          }),
        toMutation,
      );
    },

    recordPayment(command) {
      const parsed = recordPaymentSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("record_service_order_payment", {
            p_order_id: c.orderId,
            p_version: c.version,
            p_amount: c.amount,
            p_method: c.method,
            ...(c.reference ? { p_reference: c.reference } : {}),
          }),
        toMutation,
      );
    },
  };
}
