import {
  canInCenter,
  OPPORTUNITY_TASK_KIND_LABELS,
  pipelineCopy,
  pipelineErrorMessage,
  presentOpportunity,
  presentOpportunityEvent,
  presentOpportunityTask,
  newRequestId,
  usableCenters,
} from "@meguiars/domain";
import { createPipelineRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import {
  CompleteTaskButton,
  EditOpportunityForm,
  LoseForm,
  MoveStageForm,
  NoteForm,
  ReopenForm,
  TaskForm,
  WinForm,
} from "@/components/pipeline-forms";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Ficha de la oportunidad: datos, etapa, ganar/perder, tareas, notas e historial. */
export default async function OpportunityPage({
  params,
  searchParams,
}: PageProps<"/comercial/pipeline/[id]">) {
  const state = await requireScreen("opportunityDetail");
  const { id } = await params;
  const query = await searchParams;
  const repo = createPipelineRepository((await createSupabaseServerClient())!);
  const result = await repo.get(
    id,
    usableCenters(state.access).map((a) => a.center.id),
  );
  if (!result.ok) {
    return (
      <AppShell state={state} screen="opportunityDetail" title={pipelineCopy.title}>
        <Link href="/comercial/pipeline" className="text-sm underline">
          ← {pipelineCopy.title}
        </Link>
        <EmptyState title={pipelineCopy.notFound} message={pipelineErrorMessage(result.error)} />
      </AppShell>
    );
  }
  const o = result.data;
  const [timeline, tasks, stages, owners] = await Promise.all([
    repo.timeline(o.id),
    repo.tasks(o.id),
    repo.stages(o.organizationId),
    repo.owners(o.detailCenterId, o.kind),
  ]);
  const canWrite =
    canInCenter(state, o.detailCenterId, "pipeline.write") &&
    (o.kind === "b2c_premium" || canInCenter(state, o.detailCenterId, "b2b.write"));
  const view = presentOpportunity(o);
  const open = o.status === "abierta";
  const stageList = stages.ok ? stages.data : [];

  return (
    <AppShell
      state={state}
      screen="opportunityDetail"
      title={o.title}
      description={`${view.company} · ${view.kind}`}
    >
      <Link href="/comercial/pipeline" className="text-sm underline">
        ← {pipelineCopy.title}
      </Link>
      {query.creada === "1" ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
          {pipelineCopy.created}
        </p>
      ) : null}
      {query.ganada === "1" ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
          {pipelineCopy.won}
        </p>
      ) : null}

      <Card
        title={view.company}
        subtitle={`${view.center} · ${view.linked}`}
        actions={<Badge label={open ? view.stage : view.status} tone={view.statusTone} />}
      >
        <dl className="grid gap-sm text-sm md:grid-cols-2" data-testid="opportunity-summary">
          <div>
            <dt className="text-muted">{pipelineCopy.estimatedValue}</dt>
            <dd className="font-medium">
              {view.value} · {view.probability} → {view.weighted}
            </dd>
          </div>
          <div>
            <dt className="text-muted">{pipelineCopy.owner}</dt>
            <dd>{view.owner}</dd>
          </div>
          {open ? (
            <div>
              <dt className="text-muted">{pipelineCopy.nextAction}</dt>
              <dd className="flex flex-wrap items-center gap-xs">
                {view.nextActionLabel && view.nextActionState !== "proxima" ? (
                  <Badge label={view.nextActionLabel} tone={view.nextActionTone} />
                ) : null}
                {view.nextActionState === "sin_accion" ? null : view.nextAction}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-muted">{pipelineCopy.expectedCloseOn}</dt>
            <dd>{view.expectedClose}</dd>
          </div>
          <div>
            <dt className="text-muted">{pipelineCopy.contactName}</dt>
            <dd>
              {view.contact} · {view.phone} · {view.email}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Datos fiscales</dt>
            <dd>{view.fiscal}</dd>
          </div>
          {o.kind === "b2b" ? (
            <div className="md:col-span-2">
              <dt className="text-muted">{pipelineCopy.proposalLabel}</dt>
              <dd>{view.proposal}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-muted">{pipelineCopy.source}</dt>
            <dd>{view.source}</dd>
          </div>
          {o.notes ? (
            <div>
              <dt className="text-muted">{pipelineCopy.notes}</dt>
              <dd>{o.notes}</dd>
            </div>
          ) : null}
        </dl>
        {view.closed ? (
          <p className="mt-md text-sm font-medium" data-testid="opportunity-closed">
            {view.closed}
          </p>
        ) : null}
        <div className="mt-md flex flex-wrap gap-md text-sm">
          {o.convertedAccountId || o.b2bAccountId ? (
            <Link href={`/comercial/b2b/${o.convertedAccountId ?? o.b2bAccountId}`} className="underline">
              {pipelineCopy.goToAccount}
            </Link>
          ) : null}
          {o.convertedAgreementId ? (
            <Link href={`/comercial/b2b/convenios/${o.convertedAgreementId}`} className="underline">
              {pipelineCopy.goToAgreement}
            </Link>
          ) : null}
          {o.clientId && o.kind === "b2c_premium" ? (
            <Link href={`/comercial/clientes/${o.clientId}`} className="underline">
              {pipelineCopy.goToClient}
            </Link>
          ) : null}
        </div>
        {!canWrite ? <p className="mt-md text-sm text-muted">{pipelineCopy.readOnly}</p> : null}
      </Card>

      {canWrite && open ? (
        <Card title={pipelineCopy.stage}>
          <MoveStageForm opportunity={o} stages={stageList} />
          <details className="mt-md">
            <summary className="cursor-pointer font-medium">{pipelineCopy.winTitle}</summary>
            <div className="mt-sm">
              <WinForm opportunity={o} today={o.today} />
            </div>
          </details>
          <details className="mt-md">
            <summary className="cursor-pointer font-medium">{pipelineCopy.loseTitle}</summary>
            <div className="mt-sm">
              <LoseForm opportunity={o} />
            </div>
          </details>
        </Card>
      ) : null}
      {canWrite && o.status === "perdida" ? (
        <Card title={pipelineCopy.reopenTitle}>
          <ReopenForm opportunity={o} stages={stageList} />
        </Card>
      ) : null}

      <Card title={pipelineCopy.tasks}>
        {!tasks.ok ? (
          <p role="alert" className="text-sm">
            {tasks.error.message}
          </p>
        ) : tasks.data.length === 0 ? (
          <p className="text-sm text-muted">{pipelineCopy.tasksEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-sm" aria-label={pipelineCopy.tasks}>
            {tasks.data.map((t) => {
              const v = presentOpportunityTask(t, o.today);
              return (
                <li
                  key={t.id}
                  className="flex flex-col gap-xs border-b border-border pb-sm"
                  data-testid="opportunity-task"
                >
                  <span className="flex flex-wrap items-center gap-xs text-sm">
                    <strong>{OPPORTUNITY_TASK_KIND_LABELS[t.kind]}</strong> · {v.due}
                    <Badge label={v.status} tone={v.done ? "neutral" : v.overdue ? "danger" : "info"} />
                  </span>
                  {v.notes ? <span className="text-sm text-muted">{v.notes}</span> : null}
                  {canWrite && !v.done ? <CompleteTaskButton opportunityId={o.id} taskId={t.id} /> : null}
                </li>
              );
            })}
          </ul>
        )}
        {canWrite && open ? (
          <div className="mt-md">
            <TaskForm opportunityId={o.id} requestId={newRequestId()} today={o.today} />
          </div>
        ) : null}
      </Card>

      <Card title={pipelineCopy.history}>
        {canWrite ? <NoteForm opportunityId={o.id} /> : null}
        {!timeline.ok ? (
          <p role="alert" className="text-sm">
            {timeline.error.message}
          </p>
        ) : timeline.data.length === 0 ? (
          <p className="text-sm text-muted">{pipelineCopy.historyEmpty}</p>
        ) : (
          <ol
            className="mt-md flex flex-col gap-sm"
            aria-label={pipelineCopy.history}
            data-testid="opportunity-history"
          >
            {timeline.data.map((e) => {
              const v = presentOpportunityEvent(e);
              return (
                <li key={e.id} className="flex flex-col gap-xxs border-b border-border pb-sm text-sm">
                  <span>
                    <strong>{v.what}</strong>
                    {v.detail ? ` · ${v.detail}` : ""}
                  </span>
                  {v.note ? <span>{v.note}</span> : null}
                  <span className="text-xs text-muted">
                    {v.who} · {v.when}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {canWrite && open ? (
        <Card>
          <details>
            <summary className="cursor-pointer font-medium">{pipelineCopy.edit}</summary>
            <div className="mt-sm">
              <EditOpportunityForm opportunity={o} owners={owners.ok ? owners.data : []} today={o.today} />
            </div>
          </details>
        </Card>
      ) : null}
    </AppShell>
  );
}
