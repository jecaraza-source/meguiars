import {
  type Automation,
  type AutomationExecution,
  type AutomationOutcome,
  type AutomationPurpose,
  type AutomationRun,
  type AutomationRunMode,
  type AutomationsRepository,
  type AutomationTrigger,
  type LeadSource,
} from "@meguiars/domain";
import { automationActiveSchema, automationSchema } from "@meguiars/validation";
import type { MeguiarsSupabaseClient } from "../client";
import type { Database } from "../database.types";
import { toRepoError } from "../errors";
import { invalid, run } from "./shared";

type RunRow = Database["public"]["Tables"]["automation_runs"]["Row"];

export const toAutomationRun = (r: RunRow): AutomationRun => ({
  id: r.id,
  mode: r.mode as AutomationRunMode,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  evaluated: r.evaluated,
  created: r.created,
  stopped: r.stopped,
  skipped: (r.skipped ?? {}) as AutomationRun["skipped"],
  error: r.error,
});

/** Adaptador Supabase del puerto `AutomationsRepository`. Escrituras por RPC. */
export function createAutomationsRepository(client: MeguiarsSupabaseClient): AutomationsRepository {
  return {
    list(organizationId) {
      return run(
        () => client.rpc("list_automations", { p_organization_id: organizationId }),
        (rows): Automation[] =>
          rows.map((a) => ({
            id: a.id,
            detailCenterId: a.detail_center_id,
            centerName: a.detail_center_name,
            name: a.name,
            trigger: a.trigger as AutomationTrigger,
            purpose: a.purpose as AutomationPurpose,
            delayDays: a.delay_days,
            serviceIds: a.service_ids ?? [],
            serviceNames: a.service_names ?? [],
            leadSources: (a.lead_sources ?? []) as LeadSource[],
            assignTo: a.assign_to,
            assignToName: a.assign_to_name,
            dueInDays: a.due_in_days,
            messageTemplate: a.message_template,
            cooldownDays: a.cooldown_days,
            maxPerRun: a.max_per_run,
            contactFrom: a.contact_from,
            contactTo: a.contact_to,
            active: a.active,
            activatedAt: a.activated_at,
            version: a.version,
            lastRunAt: a.last_run_at,
            lastRunMode: a.last_run_mode as AutomationRunMode | null,
            lastRunCreated: a.last_run_created,
            lastRunError: a.last_run_error,
            tasksCreated: a.tasks_created,
            tasksPending: a.tasks_pending,
            tasksDone: a.tasks_done,
            tasksStopped: a.tasks_stopped,
            canManage: a.can_manage,
          })),
      );
    },

    save(command) {
      const parsed = automationSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("upsert_automation", {
            p_organization_id: c.organizationId,
            p_id: c.id ?? null,
            p_version: c.version ?? null,
            p_detail_center_id: c.detailCenterId ?? null,
            p_name: c.name,
            p_trigger: c.trigger,
            p_delay_days: c.delayDays,
            p_service_ids: c.serviceIds,
            p_lead_sources: c.leadSources,
            p_assign_to: c.assignTo ?? null,
            p_due_in_days: c.dueInDays,
            p_message_template: c.messageTemplate ?? null,
            p_cooldown_days: c.cooldownDays,
            p_max_per_run: c.maxPerRun,
            p_contact_from: c.contactFrom,
            p_contact_to: c.contactTo,
            p_reason: c.reason,
          }),
        (row) => ({ id: row.id }),
      );
    },

    async setActive(id, version, active, reason) {
      const parsed = automationActiveSchema.safeParse({ id, version, active, reason });
      if (!parsed.success) return invalid(parsed.error);
      try {
        const { error } = await client.rpc("set_automation_active", {
          p_id: id,
          p_version: parsed.data.version,
          p_active: parsed.data.active,
          p_reason: parsed.data.reason,
        });
        return error ? { ok: false, error: toRepoError(error) } : { ok: true, data: undefined };
      } catch (error) {
        return { ok: false, error: toRepoError(error) };
      }
    },

    run(id, preview) {
      return run(() => client.rpc("run_automation_now", { p_id: id, p_preview: preview }), toAutomationRun);
    },

    runs(automationId, limit = 20) {
      return run(
        () => client.rpc("automation_runs_list", { p_automation_id: automationId, p_limit: limit }),
        (rows) => rows.map(toAutomationRun),
      );
    },

    executions(automationId, limit = 50) {
      return run(
        () => client.rpc("automation_executions_list", { p_automation_id: automationId, p_limit: limit }),
        (rows): AutomationExecution[] =>
          rows.map((e) => ({
            id: e.id,
            createdAt: e.created_at,
            centerName: e.detail_center_name,
            outcome: e.outcome as AutomationOutcome,
            detail: e.detail,
            contactName: e.contact_name,
            clientId: e.client_id,
            leadId: e.lead_id,
            taskStatus: e.task_status,
            taskOutcome: e.task_outcome,
            taskDueOn: e.task_due_on,
            taskChannel: e.task_channel,
            assignedToName: e.assigned_to_name,
          })),
      );
    },
  };
}
