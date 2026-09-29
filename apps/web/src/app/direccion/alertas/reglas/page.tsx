import { ALERTS_COPY } from "@meguiars/domain";
import { createAlertsRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AlertRuleForm, EvaluateNowForm } from "@/components/alert-forms";
import { AppShell } from "@/components/app-shell";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { loadAlertRules } from "@/lib/alerts";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

/** Reglas de alerta (admin corporativo): KPI, condición, periodo, ámbito, severidad y cooldown. */
export default async function AlertRulesPage({ searchParams }: PageProps<"/direccion/alertas/reglas">) {
  const state = await requireScreen("alertRules");
  const params = await searchParams;
  const view = await loadAlertRules(state, createAlertsRepository((await createSupabaseServerClient())!));
  const editId = typeof params.editar === "string" ? params.editar : null;
  const editing = editId ? (view.rules.find((r) => r.raw.id === editId)?.raw ?? null) : null;
  return (
    <AppShell
      state={state}
      screen="alertRules"
      title={ALERTS_COPY.rulesTitle}
      description={ALERTS_COPY.scheduleHelp}
    >
      <p className="text-sm">
        <Link href="/direccion/alertas" className="underline">
          ← {ALERTS_COPY.title}
        </Link>
      </p>
      {params.hecho === "guardada" ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
          Regla guardada.
        </p>
      ) : null}
      {view.error ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {view.error}
        </p>
      ) : null}
      <Card title="Evaluación" subtitle="Diaria (Vercel Cron) o manual con los mismos cálculos.">
        <EvaluateNowForm />
        {view.runs.length ? (
          <ul className="flex flex-col gap-xxs text-xs text-muted" data-testid="alert-runs">
            {view.runs.map((r) => (
              <li key={r.id}>
                {dateTime.format(new Date(r.startedAt))} · {r.source === "cron" ? "Programada" : "Manual"} ·{" "}
                {r.rulesEvaluated} reglas · {r.created} nuevas · {r.updated} repetidas · {r.suppressed} en
                cooldown
                {r.error ? ` · error: ${r.error}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
      {view.rules.length === 0 && !view.error ? <EmptyState title={ALERTS_COPY.emptyRules} /> : null}
      <ul className="flex flex-col gap-sm" data-testid="rule-list">
        {view.rules.map(({ view: r }) => (
          <li key={r.id} className="mg-card flex flex-col gap-xxs" data-testid={`rule-${r.id}`}>
            <div className="flex flex-wrap items-center gap-xs">
              <Badge label={r.severity} tone={r.severityTone} />
              {r.active ? null : <Badge label="Inactiva" tone="neutral" />}
              <span className="font-medium">{r.name}</span>
              <Link href={`/direccion/alertas/reglas?editar=${r.id}`} className="text-sm underline">
                Editar
              </Link>
            </div>
            <p className="text-sm">
              {r.metric} {r.condition}
            </p>
            <p className="text-xs text-muted">
              {r.period} · {r.scope} · {r.cooldown}
            </p>
            {r.warning ? <p className="text-xs text-danger">{r.warning}</p> : null}
          </li>
        ))}
      </ul>
      <Card title={editing ? `Editar: ${editing.name}` : ALERTS_COPY.newRule}>
        <AlertRuleForm
          key={editing?.id ?? "nueva"}
          organizationId={view.scope.organizationId}
          rule={editing}
          metrics={view.metrics}
          centers={view.centers}
        />
      </Card>
    </AppShell>
  );
}
