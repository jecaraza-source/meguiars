import {
  AUTOMATIONS_COPY,
  AUTOMATION_OUTCOME_LABELS,
  AUTOMATION_PURPOSE_LABELS,
  AUTOMATION_RUN_MODE_LABELS,
  AUTOMATION_SKIP_LABELS,
  AUTOMATION_TRIGGER_LABELS,
  activeCenterAccess,
  canInCenter,
  formatInCenterTimeZone,
  usableCenters,
  type AutomationSkipReason,
} from "@meguiars/domain";
import {
  createAutomationsRepository,
  createCatalogRepository,
  createCommercialRepository,
} from "@meguiars/supabase";
import { AppShell } from "@/components/app-shell";
import { AutomationForm, AutomationRunButtons, AutomationToggle } from "@/components/automation-forms";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Automatizaciones: reglas con disparador, condiciones, acción, límites e historial de ejecución. */
export default async function AutomationsPage() {
  const state = await requireScreen("automations");
  const center = activeCenterAccess(state)!.center;
  const supabase = (await createSupabaseServerClient())!;
  const repo = createAutomationsRepository(supabase);
  const list = await repo.list(center.organizationId);
  const canManage = canInCenter(state, center.id, "automations.manage");
  const [catalog, owners, histories] = await Promise.all([
    canManage ? createCatalogRepository(supabase).listForCenter(center.id) : Promise.resolve(null),
    canManage ? createCommercialRepository(supabase).leadOwners(center.id) : Promise.resolve(null),
    Promise.all(
      (list.ok ? list.data : []).map(async (a) => {
        const [runs, executions] = await Promise.all([repo.runs(a.id, 5), repo.executions(a.id, 10)]);
        return { id: a.id, runs: runs.ok ? runs.data : [], executions: executions.ok ? executions.data : [] };
      }),
    ),
  ]);
  const centers = usableCenters(state.access)
    .filter(
      (a) =>
        a.center.organizationId === center.organizationId &&
        canInCenter(state, a.center.id, "automations.manage"),
    )
    .map((a) => ({ value: a.center.id, label: a.center.name }));
  const services = (catalog?.ok ? catalog.data : []).map((s) => ({ value: s.id, label: s.name }));
  const ownerOptions = (owners?.ok ? owners.data : []).map((o) => ({ value: o.userId, label: o.fullName }));
  const when = (iso: string) => formatInCenterTimeZone(iso, center.timezone);

  return (
    <AppShell state={state} screen="automations" title={AUTOMATIONS_COPY.title} description={center.name}>
      <Card>
        <ul
          className="flex list-disc flex-col gap-xs pl-lg text-sm text-muted"
          data-testid="automation-notes"
        >
          <li>{AUTOMATIONS_COPY.actionNote}</li>
          <li>{AUTOMATIONS_COPY.scheduleNote}</li>
          <li>{AUTOMATIONS_COPY.stopNote}</li>
          <li>{AUTOMATIONS_COPY.promotionalNote}</li>
        </ul>
      </Card>
      {!list.ok ? (
        <EmptyState title={list.error.message} />
      ) : list.data.length === 0 ? (
        <EmptyState title={AUTOMATIONS_COPY.empty} />
      ) : (
        <div className="flex flex-col gap-md" data-testid="automation-list">
          {list.data.map((a) => {
            const h = histories.find((x) => x.id === a.id);
            return (
              <Card
                key={a.id}
                title={a.name}
                subtitle={`${AUTOMATION_TRIGGER_LABELS[a.trigger]} · ${a.centerName ?? "Todos los centros"}`}
              >
                <div className="flex flex-col gap-sm" data-testid={`automation-${a.id}`}>
                  <div className="flex flex-wrap gap-xs">
                    <Badge label={a.active ? "Activa" : "Inactiva"} tone={a.active ? "success" : "neutral"} />
                    <Badge
                      label={AUTOMATION_PURPOSE_LABELS[a.purpose]}
                      tone={a.purpose === "promocional" ? "warning" : "info"}
                    />
                    <Badge
                      label={`Tareas: ${a.tasksCreated} · pendientes ${a.tasksPending} · hechas ${a.tasksDone} · detenidas ${a.tasksStopped}`}
                    />
                  </div>
                  <p className="text-sm text-muted">
                    Condiciones: {a.delayDays} días
                    {a.serviceNames.length ? ` · servicios: ${a.serviceNames.join(", ")}` : ""}
                    {a.leadSources.length ? ` · canales: ${a.leadSources.join(", ")}` : ""} · no repetir en{" "}
                    {a.cooldownDays} días · tope {a.maxPerRun} por corrida · contactar {a.contactFrom}–
                    {a.contactTo}
                    {a.assignToName ? ` · responsable: ${a.assignToName}` : ""}
                  </p>
                  {a.messageTemplate ? <p className="text-sm">Mensaje: «{a.messageTemplate}»</p> : null}
                  <p className="text-sm text-muted">
                    Última corrida:{" "}
                    {a.lastRunAt
                      ? `${when(a.lastRunAt)} (${AUTOMATION_RUN_MODE_LABELS[a.lastRunMode ?? "programada"]}) · ${a.lastRunCreated ?? 0} tareas${a.lastRunError ? ` · error: ${a.lastRunError}` : ""}`
                      : AUTOMATIONS_COPY.noRuns}
                  </p>
                  {a.canManage ? (
                    <div className="flex flex-wrap items-start gap-lg">
                      <AutomationRunButtons automation={a} />
                      <AutomationToggle automation={a} />
                    </div>
                  ) : null}
                  <details>
                    <summary className="cursor-pointer text-sm underline">Historial</summary>
                    <div
                      className="mt-sm flex flex-col gap-sm text-sm"
                      data-testid={`automation-history-${a.id}`}
                    >
                      <ul className="flex flex-col gap-xs">
                        {(h?.runs ?? []).length === 0 ? (
                          <li className="text-muted">{AUTOMATIONS_COPY.noRuns}</li>
                        ) : null}
                        {(h?.runs ?? []).map((r) => (
                          <li key={r.id}>
                            {when(r.startedAt)} · {AUTOMATION_RUN_MODE_LABELS[r.mode]} · {r.created} creadas ·{" "}
                            {r.stopped} detenidas
                            {Object.entries(r.skipped)
                              .filter(([, n]) => n)
                              .map(([k, n]) => ` · ${n} ${AUTOMATION_SKIP_LABELS[k as AutomationSkipReason]}`)
                              .join("")}
                            {r.error ? ` · error: ${r.error}` : ""}
                          </li>
                        ))}
                      </ul>
                      <ul className="flex flex-col gap-xs">
                        {(h?.executions ?? []).length === 0 ? (
                          <li className="text-muted">{AUTOMATIONS_COPY.noExecutions}</li>
                        ) : null}
                        {(h?.executions ?? []).map((e) => (
                          <li key={e.id}>
                            {when(e.createdAt)} · {AUTOMATION_OUTCOME_LABELS[e.outcome]} ·{" "}
                            {e.contactName ?? "—"}
                            {e.detail ? ` · ${e.detail}` : ""}
                            {e.taskStatus
                              ? ` · tarea ${e.taskStatus}${e.taskDueOn ? ` para ${e.taskDueOn}` : ""}`
                              : ""}
                            {e.assignedToName ? ` · ${e.assignedToName}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                  {a.canManage ? (
                    <details>
                      <summary className="cursor-pointer text-sm underline">Editar</summary>
                      <AutomationForm
                        automation={a}
                        centers={centers}
                        services={services}
                        owners={ownerOptions}
                        centerName={center.name}
                      />
                    </details>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {canManage ? (
        <Card title={AUTOMATIONS_COPY.newAutomation}>
          <AutomationForm
            centers={centers}
            services={services}
            owners={ownerOptions}
            defaultCenterId={center.id}
            centerName={center.name}
          />
        </Card>
      ) : null}
    </AppShell>
  );
}
