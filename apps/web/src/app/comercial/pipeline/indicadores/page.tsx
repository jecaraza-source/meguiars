import {
  pipelineAvgCycleDays,
  pipelineByKind,
  pipelineConversionRate,
  pipelineCreated,
  pipelineFunnel,
  pipelineLost,
  pipelineOpenByStage,
  pipelineOpenValue,
  pipelineWeightedValue,
  pipelineWon,
  pipelineWonValue,
} from "@meguiars/analytics";
import {
  activeCenterAccess,
  addDays,
  can,
  formatMoney,
  OPPORTUNITY_KIND_LABELS,
  pipelineCopy,
  pipelineErrorMessage,
  todayIn,
  usableCenters,
} from "@meguiars/domain";
import { createPipelineRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { StageForm } from "@/components/pipeline-forms";
import { Badge, Card, EmptyState, KpiCard, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Indicadores del pipeline (sólo desde el historial de eventos) y configuración de etapas. */
export default async function PipelineMetricsPage({
  searchParams,
}: PageProps<"/comercial/pipeline/indicadores">) {
  const state = await requireScreen("pipelineMetrics");
  const access = activeCenterAccess(state)!;
  const center = access.center;
  const params = await searchParams;
  const all = params.alcance === "todos";
  const days = params.dias === "90" ? 90 : 30;
  const repo = createPipelineRepository((await createSupabaseServerClient())!);
  const centers = all
    ? usableCenters(state.access)
        .filter((a) => can([...a.roles, ...a.corporateRoles], "pipeline.metrics.read"))
        .map((a) => a.center.id)
    : [center.id];
  const to = todayIn(center.timezone);
  const from = addDays(to, -(days - 1));
  const canManage = can(access.corporateRoles, "pipeline.manage");
  const [facts, stages] = await Promise.all([
    repo.metricFacts(centers, from, to),
    repo.stages(center.organizationId),
  ]);
  const input = { facts: facts.ok ? facts.data : [], from, to, stages: stages.ok ? stages.data : [] };
  const link = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const next = { alcance: all ? "todos" : undefined, dias: days === 90 ? "90" : undefined, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/comercial/pipeline/indicadores?${s}` : "/comercial/pipeline/indicadores";
  };

  return (
    <AppShell
      state={state}
      screen="pipelineMetrics"
      title={pipelineCopy.metricsTitle}
      description={pipelineCopy.metricsDescription}
    >
      <Card
        subtitle={`${days === 90 ? pipelineCopy.range90 : pipelineCopy.range30} · ${all ? pipelineCopy.scopeAll : center.name}`}
        actions={
          <div className="flex flex-wrap gap-md text-sm">
            <Link href={link({ dias: days === 90 ? undefined : "90" })} className="underline">
              {days === 90 ? pipelineCopy.range30 : pipelineCopy.range90}
            </Link>
            <Link href={link({ alcance: all ? undefined : "todos" })} className="underline">
              {all ? pipelineCopy.scopeCenter : pipelineCopy.scopeAll}
            </Link>
          </div>
        }
      >
        {!facts.ok ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {pipelineErrorMessage(facts.error)}
          </p>
        ) : input.facts.length === 0 ? (
          <EmptyState title={pipelineCopy.metricsEmpty} />
        ) : (
          <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-4" data-testid="pipeline-kpis">
            <KpiCard
              label="Oportunidades nuevas"
              value={String(pipelineCreated.compute(input))}
              caption="Altas del periodo"
            />
            <KpiCard
              label="Conversión"
              value={`${pipelineConversionRate.compute(input)} %`}
              caption={`${pipelineWon.compute(input)} ganadas · ${pipelineLost.compute(input)} perdidas`}
            />
            <KpiCard
              label="Valor ganado"
              value={formatMoney(pipelineWonValue.compute(input))}
              caption="Cierres del periodo"
            />
            <KpiCard
              label="Ciclo promedio"
              value={`${pipelineAvgCycleDays.compute(input)} días`}
              caption="De alta a ganada"
            />
            <KpiCard
              label="Pipeline abierto"
              value={formatMoney(pipelineOpenValue.compute(input))}
              caption="Último valor"
            />
            <KpiCard
              label="Pipeline ponderado"
              value={formatMoney(pipelineWeightedValue.compute(input))}
              caption="Valor × probabilidad"
            />
          </div>
        )}
      </Card>

      {facts.ok && input.facts.length > 0 ? (
        <>
          <Card title={pipelineCopy.funnel}>
            <Table
              caption={pipelineCopy.funnel}
              rows={pipelineFunnel(input)}
              rowKey={(r) => r.stageId}
              emptyMessage={pipelineCopy.metricsEmpty}
              columns={[
                { key: "stage", header: pipelineCopy.stage, value: (r) => r.name },
                { key: "reached", header: "Llegaron", value: (r) => String(r.reached), align: "end" },
                { key: "percent", header: "% de las nuevas", value: (r) => `${r.percent} %`, align: "end" },
              ]}
            />
          </Card>
          <Card title={pipelineCopy.openByStage}>
            <Table
              caption={pipelineCopy.openByStage}
              rows={pipelineOpenByStage(input)}
              rowKey={(r) => r.stageId}
              emptyMessage={pipelineCopy.metricsEmpty}
              columns={[
                { key: "stage", header: pipelineCopy.stage, value: (r) => r.name },
                { key: "count", header: "Abiertas", value: (r) => String(r.count), align: "end" },
                { key: "value", header: "Valor", value: (r) => formatMoney(r.value), align: "end" },
              ]}
            />
          </Card>
          <Card title={pipelineCopy.byKind}>
            <Table
              caption={pipelineCopy.byKind}
              rows={pipelineByKind(input)}
              rowKey={(r) => r.kind}
              emptyMessage={pipelineCopy.metricsEmpty}
              columns={[
                { key: "kind", header: pipelineCopy.kind, value: (r) => OPPORTUNITY_KIND_LABELS[r.kind] },
                { key: "created", header: "Nuevas", value: (r) => String(r.created), align: "end" },
                { key: "won", header: "Ganadas", value: (r) => String(r.won), align: "end" },
                { key: "lost", header: "Perdidas", value: (r) => String(r.lost), align: "end" },
                { key: "rate", header: "Conversión", value: (r) => `${r.conversionRate} %`, align: "end" },
                { key: "value", header: "Valor ganado", value: (r) => formatMoney(r.wonValue), align: "end" },
                { key: "cycle", header: "Ciclo (días)", value: (r) => String(r.avgCycleDays), align: "end" },
              ]}
            />
          </Card>
        </>
      ) : null}

      <Card title={pipelineCopy.stagesTitle} subtitle={canManage ? pipelineCopy.stagesHint : undefined}>
        {!stages.ok ? (
          <p role="alert" className="text-sm">
            {stages.error.message}
          </p>
        ) : (
          <ul className="flex flex-col gap-sm" aria-label={pipelineCopy.stagesTitle}>
            {stages.data.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-xs border-b border-border pb-sm"
                data-testid="pipeline-stage"
              >
                <span className="flex flex-wrap items-center gap-xs text-sm">
                  <strong>{s.name}</strong> · posición {s.position} · {s.probability} %
                  {!s.active ? <Badge label="Inactiva" tone="neutral" /> : null}
                  {s.kind !== "abierta" ? (
                    <Badge label={s.kind === "ganada" ? "Cierre ganado" : "Cierre perdido"} tone="info" />
                  ) : null}
                </span>
                {canManage ? <StageForm stage={s} /> : null}
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <div className="mt-md">
            <h3 className="mb-sm font-medium">{pipelineCopy.newStage}</h3>
            <StageForm />
          </div>
        ) : null}
      </Card>
    </AppShell>
  );
}
