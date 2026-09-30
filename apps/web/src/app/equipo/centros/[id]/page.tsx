import { BASELINE_METRIC_INFO, formatPilotMetric, PILOT_COPY } from "@meguiars/domain";
import { createPilotRepository } from "@meguiars/supabase";
import Link from "next/link";
import { selectCenterAction } from "@/app/actions/auth";
import { AppShell } from "@/components/app-shell";
import { BaselineForm } from "@/components/pilot-forms";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { loadCenterSetup } from "@/lib/pilot";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Activación de un centro: checklist de datos maestros, línea base y errores recientes. */
export default async function CenterSetupPage({ params, searchParams }: PageProps<"/equipo/centros/[id]">) {
  const state = await requireScreen("centerSetup");
  const { id } = await params;
  const created = (await searchParams).nuevo === "1";
  const view = await loadCenterSetup(state, createPilotRepository((await createSupabaseServerClient())!), id);
  if (!view.center)
    return (
      <AppShell state={state} screen="centerSetup" title={PILOT_COPY.setupTitle}>
        <EmptyState
          title="Centro inexistente o sin permiso"
          action={<ButtonLink href="/equipo/centros" label={PILOT_COPY.centersTitle} />}
        />
      </AppShell>
    );
  const { center, readiness } = view;
  return (
    <AppShell
      state={state}
      screen="centerSetup"
      title={`${PILOT_COPY.setupTitle}: ${center.name}`}
      description={`${center.code} · ${center.timezone}`}
    >
      {created ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
          Centro creado. Completa el checklist para que pueda operar.
        </p>
      ) : null}
      {view.error ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {view.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-sm">
        {readiness ? <Badge label={readiness.readyLabel} tone={readiness.readyTone} /> : null}
        {readiness ? <span className="text-sm text-muted">{readiness.progress}</span> : null}
        <ButtonLink href={`/equipo/centros/${center.id}/importar`} label={PILOT_COPY.importer} />
        {!view.isActive ? (
          <form action={selectCenterAction}>
            <input type="hidden" name="detailCenterId" value={center.id} />
            <input type="hidden" name="next" value={`/equipo/centros/${center.id}`} />
            <Button type="submit" label={PILOT_COPY.switchTo} size="sm" variant="secondary" />
          </form>
        ) : null}
      </div>
      <Card title={PILOT_COPY.checklist}>
        <ul className="flex flex-col gap-sm" data-testid="readiness">
          {readiness?.rows.map((r) => (
            <li
              key={r.key}
              className="flex flex-col gap-xxs border-b border-border pb-sm"
              data-testid={`readiness-${r.key}`}
            >
              <div className="flex flex-wrap items-center gap-xs">
                <span className="font-medium">{r.label}</span>
                <Badge label={r.status} tone={r.tone} />
                <span className="text-xs text-muted">{r.requiredLabel}</span>
              </div>
              <span className="text-sm">{r.detail}</span>
              {r.fix ? (
                <span className="text-sm text-muted">
                  {r.fix}{" "}
                  {r.href && view.isActive ? (
                    <Link href={r.href} className="underline">
                      Ir
                    </Link>
                  ) : null}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
      <Card title={PILOT_COPY.baselineTitle} subtitle={PILOT_COPY.baselineHelp}>
        <Table
          caption={PILOT_COPY.baselineTitle}
          emptyMessage={PILOT_COPY.baselineEmpty}
          rows={view.baselines}
          rowKey={(b) => b.metric}
          columns={[
            { key: "m", header: "Indicador", value: (b) => BASELINE_METRIC_INFO[b.metric].label },
            { key: "v", header: "Valor", value: (b) => formatPilotMetric(b.metric, b.value), align: "end" },
            {
              key: "p",
              header: "Periodo",
              value: (b) => (b.periodFrom ? `${b.periodFrom} a ${b.periodTo ?? "—"}` : "—"),
            },
            { key: "s", header: PILOT_COPY.baselineSource, value: (b) => b.source },
          ]}
        />
        <BaselineForm centerId={center.id} baselines={view.baselines} />
      </Card>
      <Card title={PILOT_COPY.errorsTitle}>
        <Table
          caption={PILOT_COPY.errorsTitle}
          emptyMessage={PILOT_COPY.errorsEmpty}
          rows={view.errors}
          rowKey={(e) => String(e.id)}
          columns={[
            { key: "t", header: "Cuándo", value: (e) => e.occurredAt.slice(0, 16).replace("T", " ") },
            { key: "o", header: "App", value: (e) => (e.source === "mobile" ? "Móvil" : "Web") },
            { key: "r", header: "Pantalla", value: (e) => e.route ?? "—" },
            { key: "m", header: "Error", value: (e) => `${e.name}: ${e.message}` },
            { key: "d", header: "Referencia", value: (e) => e.digest ?? "—" },
          ]}
        />
      </Card>
    </AppShell>
  );
}
