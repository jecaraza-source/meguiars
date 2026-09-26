import {
  activeCenterAccess,
  canInActiveCenter,
  crmCopy,
  presentTask,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  todayIn,
} from "@meguiars/domain";
import { createCrmRepository } from "@meguiars/supabase";
import { crmTaskFilterSchema } from "@meguiars/validation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { GenerateTasksButton, TaskActions } from "@/components/crm-forms";
import { Card, EmptyState } from "@/components/ui/display";
import { Select } from "@/components/ui/field";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Cola de seguimientos del centro activo. No envía mensajes: se registra el resultado del contacto. */
export default async function CrmTasksPage({ searchParams }: PageProps<"/comercial/seguimientos">) {
  const state = await requireScreen("crmTasks");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const param = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const parsed = crmTaskFilterSchema.safeParse({
    status: param("estado") ?? "pendiente",
    due: param("vence"),
  });
  const filter = parsed.success ? parsed.data : { status: "pendiente" as const };
  const today = todayIn(center.timezone);
  const result = await createCrmRepository((await createSupabaseServerClient())!).listTasks([center.id], {
    ...filter,
    today,
  });
  const canWrite = canInActiveCenter(state, "crm.write");

  return (
    <AppShell
      state={state}
      screen="crmTasks"
      title={`${crmCopy.tasksTitle} · ${center.name}`}
      description={crmCopy.tasksDescription}
    >
      <Card actions={canWrite ? <GenerateTasksButton /> : null}>
        <form className="grid gap-sm md:grid-cols-3 md:items-end" action="/comercial/seguimientos">
          <Select
            name="estado"
            label={crmCopy.status}
            options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABELS[s] }))}
            defaultValue={filter.status ?? "pendiente"}
          />
          <Select
            name="vence"
            label={crmCopy.due}
            options={[
              { value: "", label: crmCopy.allDue },
              { value: "vencidas", label: crmCopy.dueOverdue },
              { value: "hoy", label: crmCopy.dueToday },
              { value: "proximas", label: crmCopy.dueUpcoming },
            ]}
            defaultValue={filter.due ?? ""}
          />
          <button type="submit" className="mg-btn" data-variant="secondary" data-size="md">
            {crmCopy.filter}
          </button>
        </form>
      </Card>
      {!result.ok ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {result.error.message}
        </p>
      ) : result.data.length === 0 ? (
        <EmptyState title={crmCopy.tasksEmpty} />
      ) : (
        <ul className="flex flex-col gap-md" aria-label={crmCopy.tasksTitle}>
          {result.data
            .map((t) => presentTask(t, today))
            .map((t) => (
              <li key={t.id} className="mg-card flex flex-col gap-xs" data-testid="crm-task">
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <Link href={`/comercial/clientes/${t.clientId}`} className="font-medium underline">
                    {t.client}
                  </Link>
                  <span className={`text-sm ${t.overdue ? "font-semibold" : ""}`}>
                    {t.due}
                    {t.dueCaption ? ` · ${t.dueCaption}` : ""}
                  </span>
                </div>
                <span>{t.what}</span>
                <span className="text-sm text-muted">
                  {t.source} · {t.status}
                  {t.notes ? ` · ${t.notes}` : ""}
                  {t.result ? ` · ${t.result}` : ""}
                </span>
                {t.open && canWrite ? (
                  <TaskActions taskId={t.id} clientId={t.clientId} today={today} />
                ) : null}
              </li>
            ))}
        </ul>
      )}
    </AppShell>
  );
}
