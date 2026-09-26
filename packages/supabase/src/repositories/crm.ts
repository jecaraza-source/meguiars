import {
  fail,
  taskDueRange,
  type ContactChannel,
  type ContactPreference,
  type CrmCustomer,
  type CrmRepository,
  type CrmTask,
  type CustomerSegment,
  type NextVisitState,
  type TaskChannel,
  type TaskKind,
  type TaskOutcome,
  type TaskSource,
  type TaskStatus,
} from "@meguiars/domain";
import {
  cancelTaskSchema,
  completeTaskSchema,
  contactPreferenceSchema,
  createTaskSchema,
  rescheduleTaskSchema,
} from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import type { Database, Tables } from "../database.types";
import { toRepoError } from "../errors";
import { invalid, run } from "./shared";

type CustomerRow = Database["public"]["Functions"]["crm_customers"]["Returns"][number];

const toCustomer = (r: CustomerRow): CrmCustomer => ({
  clientId: r.client_id,
  fullName: r.full_name,
  phone: r.phone,
  email: r.email,
  kind: r.kind,
  segment: r.segment as CustomerSegment,
  visits: r.visits,
  lastVisitAt: r.last_visit_at,
  servicesValue: Number(r.services_value),
  membershipValue: Number(r.membership_value),
  lifetimeValue: Number(r.lifetime_value),
  membershipId: r.membership_id,
  membershipNumber: r.membership_number,
  membershipPlan: r.membership_plan,
  membershipStatus: r.membership_status,
  membershipEndsOn: r.membership_ends_on,
  nextVisitOn: r.next_visit_on,
  nextVisitState: r.next_visit_state as NextVisitState | null,
  nextVisitService: r.next_visit_service,
  nextVisitOrderId: r.next_visit_order_id,
  nextVisitFolio: r.next_visit_folio,
  openTasks: r.open_tasks,
  optedInChannels: (r.opted_in_channels ?? []) as ContactChannel[],
});

type TaskRow = Tables<"crm_tasks"> & {
  clients: { full_name: string; phone: string | null; email: string | null } | null;
};

const toTask = (r: TaskRow): CrmTask => ({
  id: r.id,
  detailCenterId: r.detail_center_id,
  clientId: r.client_id,
  clientName: r.clients?.full_name ?? "—",
  clientPhone: r.clients?.phone ?? null,
  clientEmail: r.clients?.email ?? null,
  kind: r.kind as TaskKind,
  channel: r.channel as TaskChannel,
  status: r.status as TaskStatus,
  dueOn: r.due_on,
  notes: r.notes,
  source: r.source as TaskSource,
  serviceOrderId: r.service_order_id,
  membershipId: r.membership_id,
  outcome: r.outcome as TaskOutcome | null,
  outcomeNotes: r.outcome_notes,
  completedAt: r.completed_at,
  cancelReason: r.cancel_reason,
  createdAt: r.created_at,
});

async function done(call: PromiseLike<{ error: unknown }>) {
  try {
    const { error } = await call;
    return error ? { ok: false as const, error: toRepoError(error) } : { ok: true as const, data: undefined };
  } catch (error) {
    return { ok: false as const, error: toRepoError(error) };
  }
}

/** Adaptador Supabase del puerto `CrmRepository`. Métricas derivadas por RPC; mutaciones por RPC con motivo. */
export function createCrmRepository(client: MeguiarsSupabaseClient): CrmRepository {
  return {
    listCustomers(detailCenterIds, filter = {}) {
      return run(
        () =>
          client.rpc("crm_customers", {
            p_detail_center_ids: detailCenterIds,
            ...(filter.segment ? { p_segment: filter.segment } : {}),
            ...(filter.due ? { p_due: filter.due } : {}),
            ...(filter.query ? { p_query: filter.query } : {}),
          }),
        (rows) => rows.map(toCustomer),
      );
    },

    async getCustomer(clientId, detailCenterIds) {
      const r = await run(
        () => client.rpc("crm_customers", { p_detail_center_ids: detailCenterIds, p_client_id: clientId }),
        (rows) => rows.map(toCustomer),
      );
      if (!r.ok) return r;
      return r.data[0]
        ? { ok: true, data: r.data[0] }
        : fail("not_found", "El cliente no existe o no tienes acceso.");
    },

    listTasks(detailCenterIds, filter) {
      return run(
        () => {
          let q = client
            .from("crm_tasks")
            .select("*, clients(full_name, phone, email)")
            .in("detail_center_id", detailCenterIds);
          if (filter.status) q = q.eq("status", filter.status);
          if (filter.clientId) q = q.eq("client_id", filter.clientId);
          if (filter.due) {
            const range = taskDueRange(filter.due, filter.today);
            if (range.before) q = q.lt("due_on", range.before);
            if (range.from) q = q.gte("due_on", range.from);
            if (range.to) q = q.lte("due_on", range.to);
          }
          return q.order("due_on").order("created_at").limit(300);
        },
        (rows) => (rows as unknown as TaskRow[]).map(toTask),
      );
    },

    preferences(clientId) {
      return run(
        () => client.from("contact_preferences").select("*").eq("client_id", clientId),
        (rows): ContactPreference[] =>
          rows.map((p) => ({
            channel: p.channel as ContactChannel,
            optedIn: p.opted_in,
            source: p.source,
            updatedAt: p.updated_at,
          })),
      );
    },

    createTask(command) {
      const parsed = createTaskSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("create_crm_task", {
            p_detail_center_id: c.detailCenterId,
            p_request_id: c.requestId,
            p_client_id: c.clientId,
            p_kind: c.kind,
            p_channel: c.channel ?? null,
            p_due_on: c.dueOn,
            ...(c.notes ? { p_notes: c.notes } : {}),
            ...(c.vehicleId ? { p_vehicle_id: c.vehicleId } : {}),
          }),
        (row) => ({ id: row.id }),
      );
    },

    async completeTask(command) {
      const parsed = completeTaskSchema.safeParse(command);
      if (!parsed.success) return invalid(parsed.error);
      const c = parsed.data;
      return done(
        client.rpc("complete_crm_task", {
          p_task_id: c.taskId,
          p_outcome: c.outcome,
          ...(c.notes ? { p_notes: c.notes } : {}),
        }),
      );
    },

    async cancelTask(taskId, reason) {
      const parsed = cancelTaskSchema.safeParse({ taskId, reason });
      if (!parsed.success) return invalid(parsed.error);
      return done(
        client.rpc("cancel_crm_task", { p_task_id: parsed.data.taskId, p_reason: parsed.data.reason }),
      );
    },

    async rescheduleTask(taskId, dueOn, reason) {
      const parsed = rescheduleTaskSchema.safeParse({ taskId, dueOn, reason });
      if (!parsed.success) return invalid(parsed.error);
      return done(
        client.rpc("reschedule_crm_task", {
          p_task_id: parsed.data.taskId,
          p_due_on: parsed.data.dueOn,
          p_reason: parsed.data.reason,
        }),
      );
    },

    generateTasks(detailCenterId) {
      return run(
        () => client.rpc("generate_crm_tasks", { p_detail_center_id: detailCenterId }),
        (n) => Number(n),
      );
    },

    async setPreference(command) {
      const parsed = contactPreferenceSchema.safeParse(command);
      if (!parsed.success) return invalid(parsed.error);
      const c = parsed.data;
      return done(
        client.rpc("set_contact_preference", {
          p_client_id: c.clientId,
          p_channel: c.channel,
          p_opted_in: c.optedIn,
          p_source: c.source,
          p_reason: c.reason,
        }),
      );
    },
  };
}
