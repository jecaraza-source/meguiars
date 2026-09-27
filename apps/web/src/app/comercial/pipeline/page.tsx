import {
  activeCenterAccess,
  activeRoles,
  boardColumns,
  formatDateOnly,
  formatMoney,
  OPPORTUNITY_KIND_LABELS,
  OPPORTUNITY_KINDS,
  pipelineCopy,
  pipelineErrorMessage,
  presentOpportunityCard,
  weightedValue,
  writableOpportunityKinds,
  type OpportunityKind,
  type OpportunityStatus,
} from "@meguiars/domain";
import { createPipelineRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState, KpiCard, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STATUS_FILTERS: { value: OpportunityStatus; label: string }[] = [
  { value: "abierta", label: pipelineCopy.filterOpen },
  { value: "ganada", label: pipelineCopy.filterWon },
  { value: "perdida", label: pipelineCopy.filterLost },
];

/** Tablero del pipeline del centro activo: columnas por etapa abierta; ganadas y perdidas en lista. */
export default async function PipelinePage({ searchParams }: PageProps<"/comercial/pipeline">) {
  const state = await requireScreen("pipeline");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const param = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const status = (STATUS_FILTERS.find((s) => s.value === param("estado"))?.value ??
    "abierta") as OpportunityStatus;
  const kind = OPPORTUNITY_KINDS.find((k) => k === param("tipo")) as OpportunityKind | undefined;
  const mine = param("mias") === "1" ? state.user.id : undefined;
  const supabase = (await createSupabaseServerClient())!;
  const repo = createPipelineRepository(supabase);
  const [list, stages] = await Promise.all([
    repo.list([center.id], { status, kind, ownerId: mine }),
    repo.stages(center.organizationId),
  ]);
  const canCreate = writableOpportunityKinds(activeRoles(state)).length > 0;
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const next = { estado: status, tipo: kind, mias: mine ? "1" : undefined, ...patch };
    for (const [k, v] of Object.entries(next)) if (v && !(k === "estado" && v === "abierta")) q.set(k, v);
    const s = q.toString();
    return s ? `/comercial/pipeline?${s}` : "/comercial/pipeline";
  };
  const chip = (active: boolean, label: string, to: string) => (
    <Link
      key={label}
      href={to}
      className="mg-badge"
      data-tone={active ? "brand" : "neutral"}
      aria-current={active || undefined}
    >
      {label}
    </Link>
  );
  const open = list.ok ? list.data : [];
  const total = open.reduce((t, o) => t + o.estimatedValue, 0);
  const weighted = open.reduce((t, o) => t + weightedValue(o.estimatedValue, o.stageProbability), 0);
  const overdue = open.filter((o) => presentOpportunityCard(o).nextActionState === "vencida").length;

  return (
    <AppShell
      state={state}
      screen="pipeline"
      title={pipelineCopy.title}
      description={pipelineCopy.description}
    >
      <Card
        actions={
          <div className="flex flex-wrap gap-sm">
            <ButtonLink href="/comercial/pipeline/indicadores" label={pipelineCopy.metricsTitle} />
            {canCreate ? (
              <ButtonLink
                href="/comercial/pipeline/nueva"
                label={pipelineCopy.newOpportunity}
                variant="primary"
              />
            ) : null}
          </div>
        }
      >
        <nav aria-label="Filtros" className="flex flex-wrap gap-sm">
          {STATUS_FILTERS.map((s) => chip(status === s.value, s.label, href({ estado: s.value })))}
          <span aria-hidden="true">·</span>
          {chip(!kind, pipelineCopy.filterAll, href({ tipo: undefined }))}
          {OPPORTUNITY_KINDS.map((k) => chip(kind === k, OPPORTUNITY_KIND_LABELS[k], href({ tipo: k })))}
          <span aria-hidden="true">·</span>
          {chip(!!mine, pipelineCopy.filterMine, href({ mias: mine ? undefined : "1" }))}
        </nav>
      </Card>

      {!list.ok || !stages.ok ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {!list.ok
            ? pipelineErrorMessage(list.error)
            : !stages.ok
              ? pipelineErrorMessage(stages.error)
              : null}
        </p>
      ) : status === "abierta" ? (
        <>
          <div className="grid gap-lg md:grid-cols-3">
            <KpiCard label="Abiertas" value={String(open.length)} caption={formatMoney(total)} />
            <KpiCard
              label="Pipeline ponderado"
              value={formatMoney(weighted)}
              caption="Valor × probabilidad de la etapa"
            />
            <KpiCard
              label="Acciones vencidas"
              value={String(overdue)}
              caption="Siguiente acción con fecha pasada"
            />
          </div>
          {open.length === 0 ? (
            <EmptyState title={pipelineCopy.empty} />
          ) : (
            <div className="grid gap-md md:grid-cols-2 xl:grid-cols-4" data-testid="pipeline-board">
              {boardColumns(stages.data, open).map((col) => (
                <section
                  key={col.id}
                  className="mg-card flex flex-col gap-sm"
                  aria-label={col.name}
                  data-testid="pipeline-column"
                >
                  <header className="flex flex-col gap-xxs">
                    <h2 className="font-semibold">
                      {col.name} <span className="text-muted">({col.count})</span>
                    </h2>
                    <span className="text-xs text-muted">
                      {col.total} · {col.probability} % → {col.weighted}
                    </span>
                  </header>
                  {col.items.length === 0 ? (
                    <p className="text-sm text-muted">{pipelineCopy.emptyStage}</p>
                  ) : (
                    <ul className="flex flex-col gap-sm">
                      {col.items.map((o) => {
                        const v = presentOpportunityCard(o);
                        return (
                          <li key={o.id} data-testid="opportunity-card">
                            <Link
                              href={`/comercial/pipeline/${o.id}`}
                              className="flex flex-col gap-xxs rounded-md border border-border p-sm hover:bg-surface-muted"
                            >
                              <strong className="text-sm">{v.title}</strong>
                              <span className="text-xs">
                                {v.company} · {v.kind}
                              </span>
                              <span className="text-sm font-medium">{v.value}</span>
                              {v.nextAction ? (
                                <span className="flex flex-wrap items-center gap-xs text-xs">
                                  {v.nextActionState !== "proxima" && v.nextActionLabel ? (
                                    <Badge label={v.nextActionLabel} tone={v.nextActionTone} />
                                  ) : null}
                                  {v.nextActionState === "sin_accion" ? null : v.nextAction}
                                </span>
                              ) : null}
                              <span className="text-xs text-muted">
                                {v.owner} · {v.ageDays} días{v.openTasks ? ` · ${v.openTasks} tarea(s)` : ""}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          )}
        </>
      ) : (
        <Table
          caption={status === "ganada" ? pipelineCopy.filterWon : pipelineCopy.filterLost}
          rows={list.data}
          rowKey={(o) => o.id}
          rowHref={(o) => `/comercial/pipeline/${o.id}`}
          emptyMessage={pipelineCopy.metricsEmpty}
          columns={[
            { key: "title", header: "Oportunidad", value: (o) => o.title },
            { key: "company", header: "Empresa / cliente", value: (o) => o.displayName },
            { key: "kind", header: pipelineCopy.kind, value: (o) => OPPORTUNITY_KIND_LABELS[o.kind] },
            {
              key: "value",
              header: status === "ganada" ? "Valor ganado" : "Valor estimado",
              value: (o) => formatMoney(o.wonValue ?? o.estimatedValue),
              align: "end",
            },
            { key: "closed", header: "Cierre", value: (o) => formatDateOnly(o.closedAt?.slice(0, 10)) },
          ]}
        />
      )}
    </AppShell>
  );
}
