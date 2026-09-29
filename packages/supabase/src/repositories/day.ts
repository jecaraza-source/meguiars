import type {
  AppointmentStatus,
  DayActiveOrder,
  DayAppointment,
  DayRepository,
  DaySummary,
  ServiceOrderStatus,
} from "@meguiars/domain";
import type { MeguiarsSupabaseClient } from "../client";
import { run } from "./shared";

type J = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const list = (v: unknown) => (Array.isArray(v) ? (v as J[]) : []);
const counts = (v: unknown) =>
  Object.fromEntries(Object.entries((v ?? {}) as J).map(([k, n]) => [k, num(n)]));

/** Convierte la respuesta de public.center_day_summary. */
export function toDaySummary(raw: J): DaySummary {
  const o = raw.orders as J | null;
  const a = raw.agenda as J | null;
  const p = raw.payments as J | null;
  const delivered = (o?.delivered_today ?? {}) as J;
  return {
    day: String(raw.day),
    orders: o
      ? {
          byStatus: counts(o.by_status) as Partial<Record<ServiceOrderStatus, number>>,
          active: list(o.active).map((r): DayActiveOrder => ({
            id: String(r.id),
            folio: String(r.folio),
            status: r.status as ServiceOrderStatus,
            clientName: String(r.client_name),
            vehicle: String(r.vehicle ?? ""),
            total: num(r.total),
            paidAmount: num(r.paid_amount),
            promisedAt: str(r.promised_at),
            bayName: str(r.bay_name),
            technicianName: str(r.technician_name),
          })),
          deliveredToday: {
            count: num(delivered.count),
            total: num(delivered.total),
            pending: num(delivered.pending),
          },
          openedToday: num(o.opened_today),
        }
      : null,
    agenda: a
      ? {
          byStatus: counts(a.by_status) as Partial<Record<AppointmentStatus, number>>,
          upcoming: list(a.upcoming).map((r): DayAppointment => ({
            id: String(r.id),
            startsAt: String(r.starts_at),
            status: r.status as AppointmentStatus,
            clientName: String(r.client_name),
            vehicle: String(r.vehicle ?? ""),
            bayName: str(r.bay_name),
          })),
        }
      : null,
    payments: p ? { count: num(p.count), total: num(p.total) } : null,
  };
}

export function createDayRepository(client: MeguiarsSupabaseClient): DayRepository {
  return {
    summary(detailCenterId) {
      return run(
        () => client.rpc("center_day_summary", { p_detail_center_id: detailCenterId }),
        (raw) => toDaySummary(raw as J),
      );
    },
  };
}
