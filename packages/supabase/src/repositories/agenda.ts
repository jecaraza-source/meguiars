import type {
  AgendaRepository,
  AppointmentDetail,
  AppointmentListItem,
  Bay,
  ServiceOrderDraft,
  Technician,
} from "@meguiars/domain";
import {
  agendaFilterSchema,
  createAppointmentSchema,
  setStatusSchema,
  updateAppointmentSchema,
  upsertResourceSchema,
} from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import type { Database, Tables } from "../database.types";
import { invalid, run } from "./shared";

type ListRow = Database["public"]["Functions"]["list_appointments"]["Returns"][number];

const toListItem = (row: ListRow): AppointmentListItem => ({
  id: row.id,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  durationMinutes: row.duration_minutes,
  status: row.status,
  isWalkIn: row.is_walk_in,
  conflictOverride: row.conflict_override,
  clientId: row.client_id,
  clientName: row.client_name,
  clientPhone: row.client_phone,
  vehicleId: row.vehicle_id,
  vehicleLabel: row.vehicle_label,
  bayId: row.bay_id,
  bayName: row.bay_name,
  technicianId: row.technician_id,
  technicianName: row.technician_name,
  services: row.services,
  notes: row.notes,
  serviceOrderId: row.service_order_id,
});

type DetailRow = Tables<"appointments"> & {
  appointment_services: { service_id: string; position: number; services: { name: string } | null }[];
  clients: { full_name: string; phone: string } | null;
  vehicles: { make: string; model: string; year: number; plate: string } | null;
  bays: { name: string } | null;
  technicians: { full_name: string } | null;
};

const toDetail = (row: DetailRow): AppointmentDetail => {
  const services = [...row.appointment_services].sort((a, b) => a.position - b.position);
  const v = row.vehicles;
  return {
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    durationMinutes: row.duration_minutes,
    status: row.status,
    isWalkIn: row.is_walk_in,
    conflictOverride: row.conflict_override,
    clientId: row.client_id,
    clientName: row.clients?.full_name ?? null,
    clientPhone: row.clients?.phone ?? null,
    vehicleId: row.vehicle_id,
    vehicleLabel: v ? `${v.make} ${v.model} ${v.year} · ${v.plate}` : null,
    bayId: row.bay_id,
    bayName: row.bays?.name ?? null,
    technicianId: row.technician_id,
    technicianName: row.technicians?.full_name ?? null,
    services: services.map((s) => s.services?.name ?? ""),
    serviceIds: services.map((s) => s.service_id),
    notes: row.notes,
    serviceOrderId: row.service_order_id,
    receivedAt: row.received_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    deliveredAt: row.delivered_at,
    cancelledAt: row.cancelled_at,
  };
};

const toBay = (row: Tables<"bays">): Bay => ({
  id: row.id,
  detailCenterId: row.detail_center_id,
  name: row.name,
  active: row.active,
});

const toTechnician = (row: Tables<"technicians">): Technician => ({
  id: row.id,
  detailCenterId: row.detail_center_id,
  fullName: row.full_name,
  active: row.active,
});

/**
 * Adaptador Supabase del puerto `AgendaRepository`. Las escrituras van por RPC
 * (conflictos, transiciones, motivo y auditoría en la base); RLS limita la
 * lectura a los centros del usuario.
 */
export function createAgendaRepository(client: MeguiarsSupabaseClient): AgendaRepository {
  return {
    listDay(detailCenterId, day, filter = {}) {
      const parsed = agendaFilterSchema.safeParse({ day, ...filter });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const f = parsed.data;
      return run(
        () =>
          client.rpc("list_appointments", {
            p_detail_center_id: detailCenterId,
            p_day: f.day,
            ...(f.status ? { p_status: f.status } : {}),
            ...(f.bayId ? { p_bay_id: f.bayId } : {}),
            ...(f.technicianId ? { p_technician_id: f.technicianId } : {}),
          }),
        (rows) => rows.map(toListItem),
      );
    },

    get(id) {
      return run(
        () =>
          client
            .from("appointments")
            .select(
              "*, appointment_services(service_id, position, services(name)), clients(full_name, phone), vehicles(make, model, year, plate), bays(name), technicians(full_name)",
            )
            .eq("id", id)
            .maybeSingle(),
        (row) => toDetail(row as unknown as DetailRow),
      );
    },

    create(command) {
      const parsed = createAppointmentSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("create_appointment", {
            p_detail_center_id: c.detailCenterId,
            p_request_id: c.requestId,
            p_client_id: c.clientId,
            p_vehicle_id: c.vehicleId,
            p_service_ids: c.serviceIds,
            p_starts_at: c.startsAt ?? null,
            ...(c.durationMinutes ? { p_duration_minutes: c.durationMinutes } : {}),
            ...(c.bayId ? { p_bay_id: c.bayId } : {}),
            ...(c.technicianId ? { p_technician_id: c.technicianId } : {}),
            ...(c.notes ? { p_notes: c.notes } : {}),
            p_walk_in: c.walkIn,
            ...(c.overrideReason ? { p_override_reason: c.overrideReason } : {}),
          }),
        (row) => ({ id: row.id }),
      );
    },

    update(command) {
      const parsed = updateAppointmentSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("update_appointment", {
            p_id: c.id,
            p_service_ids: c.serviceIds,
            p_starts_at: c.startsAt,
            p_duration_minutes: c.durationMinutes,
            p_bay_id: c.bayId ?? null,
            p_technician_id: c.technicianId ?? null,
            p_notes: c.notes ?? null,
            p_reason: c.reason,
            ...(c.overrideReason ? { p_override_reason: c.overrideReason } : {}),
          }),
        (row) => ({ id: row.id }),
      );
    },

    setStatus(command) {
      const parsed = setStatusSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () =>
          client.rpc("set_appointment_status", {
            p_id: parsed.data.id,
            p_status: parsed.data.status,
            ...(parsed.data.reason ? { p_reason: parsed.data.reason } : {}),
          }),
        (row) => ({ id: row.id, status: row.status }),
      );
    },

    orderDraft(id) {
      return run(
        () => client.rpc("appointment_order_draft", { p_appointment_id: id }),
        (rows): ServiceOrderDraft => ({
          appointmentId: id,
          detailCenterId: rows[0]?.detail_center_id ?? "",
          clientId: rows[0]?.client_id ?? "",
          vehicleId: rows[0]?.vehicle_id ?? "",
          lines: rows.map((r) => ({
            serviceId: r.service_id,
            serviceCode: r.service_code,
            serviceName: r.service_name,
            revenueEngine: r.revenue_engine,
            unitPrice: Number(r.unit_price),
            unitDirectCost: Number(r.unit_direct_cost),
            durationMinutes: r.duration_minutes,
          })),
        }),
      );
    },

    listBays(detailCenterId) {
      return run(
        () => client.from("bays").select("*").eq("detail_center_id", detailCenterId).order("name"),
        (rows) => rows.map(toBay),
      );
    },

    listTechnicians(detailCenterId) {
      return run(
        () =>
          client.from("technicians").select("*").eq("detail_center_id", detailCenterId).order("full_name"),
        (rows) => rows.map(toTechnician),
      );
    },

    upsertBay(command) {
      const parsed = upsertResourceSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("upsert_bay", {
            p_detail_center_id: c.detailCenterId,
            p_id: c.id ?? null,
            p_name: c.name,
            p_active: c.active,
            p_reason: c.reason,
          }),
        toBay,
      );
    },

    upsertTechnician(command) {
      const parsed = upsertResourceSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("upsert_technician", {
            p_detail_center_id: c.detailCenterId,
            p_id: c.id ?? null,
            p_full_name: c.name,
            p_active: c.active,
            p_reason: c.reason,
          }),
        toTechnician,
      );
    },
  };
}
