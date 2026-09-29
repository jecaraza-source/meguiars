import { ALERTS_COPY } from "@meguiars/domain";
import { createAlertsRepository } from "@meguiars/supabase";
import Link from "next/link";
import { ResolveAlertForm, ReviewAlertForm } from "@/components/alert-forms";
import { AppShell } from "@/components/app-shell";
import { Badge, Card } from "@/components/ui/display";
import { loadAlertDetail } from "@/lib/alerts";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

/** Detalle de una alerta: dato que la originó, enlaces, historial y acciones. */
export default async function AlertDetailPage({ params }: PageProps<"/direccion/alertas/[id]">) {
  const state = await requireScreen("alertDetail");
  const { id } = await params;
  const view = await loadAlertDetail(
    state,
    createAlertsRepository((await createSupabaseServerClient())!),
    id,
  );
  const a = view.alert;
  return (
    <AppShell state={state} screen="alertDetail" title={a ? a.view.title : ALERTS_COPY.title}>
      <p className="text-sm">
        <Link href="/direccion/alertas" className="underline">
          ← {ALERTS_COPY.title}
        </Link>
      </p>
      {view.error ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {view.error}
        </p>
      ) : null}
      {a ? (
        <>
          <Card title={a.view.metric} subtitle={`${a.view.condition} · ${a.view.scope}`}>
            <div className="flex flex-wrap gap-xs">
              <Badge label={a.view.severity} tone={a.view.severityTone} />
              <Badge label={a.view.status} tone={a.view.statusTone} />
            </div>
            <dl className="grid gap-sm text-sm md:grid-cols-2" data-testid="alert-trace">
              <div>
                <dt className="text-muted">Periodo que la originó</dt>
                <dd>{a.view.period}</dd>
              </div>
              <div>
                <dt className="text-muted">Valor</dt>
                <dd data-testid="alert-value">{a.view.value}</dd>
              </div>
              {a.view.previous ? (
                <div>
                  <dt className="text-muted">Periodo anterior</dt>
                  <dd>
                    {a.view.previous}
                    {a.view.change ? ` · ${a.view.change}` : ""}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted">Detecciones</dt>
                <dd>
                  {a.view.occurrences}
                  {a.view.last ? ` · última: ${a.view.last}` : ""}
                </dd>
              </div>
              {a.view.resolutionNote ? (
                <div>
                  <dt className="text-muted">Resolución</dt>
                  <dd>{a.view.resolutionNote}</dd>
                </div>
              ) : null}
            </dl>
            {a.view.cleared ? <p className="text-sm text-muted">{a.view.cleared}</p> : null}
            <p className="flex flex-wrap gap-sm text-sm">
              {a.links.kpis ? (
                <Link href={a.links.kpis} className="underline">
                  {ALERTS_COPY.viewKpi}
                </Link>
              ) : null}
              {a.links.drill ? (
                <Link href={a.links.drill} className="underline">
                  {ALERTS_COPY.viewDrill}
                </Link>
              ) : null}
            </p>
          </Card>
          {a.canManage && (a.view.canReview || a.view.canResolve) ? (
            <Card title="Gestionar">
              <div className="grid gap-md md:grid-cols-2">
                {a.view.canReview ? <ReviewAlertForm id={a.view.id} /> : null}
                {a.view.canResolve ? <ResolveAlertForm id={a.view.id} /> : null}
              </div>
            </Card>
          ) : null}
          <Card title={ALERTS_COPY.history}>
            <ol className="flex flex-col gap-xs text-sm" data-testid="alert-history">
              {view.events.map((e) => (
                <li key={e.id}>
                  <span className="font-medium">{e.label}</span>
                  {e.detail ? ` · ${e.detail}` : ""}{" "}
                  <span className="text-muted">({dateTime.format(new Date(e.at))})</span>
                </li>
              ))}
            </ol>
          </Card>
        </>
      ) : null}
    </AppShell>
  );
}
