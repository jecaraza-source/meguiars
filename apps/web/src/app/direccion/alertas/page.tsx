import {
  ALERT_INBOX_STATUS_LABELS,
  ALERT_INBOX_STATUSES,
  ALERT_SEVERITIES,
  ALERT_SEVERITY_LABELS,
  ALERTS_COPY,
  alertInboxParams,
} from "@meguiars/domain";
import { createAlertsRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/display";
import { loadAlertsInbox } from "@/lib/alerts";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Dirección → Alertas: bandeja de gestión por excepción. Cada alerta dice qué
 * KPI, en qué centro(s) y periodo, con qué valor se disparó, y enlaza al KPI y
 * al drill-down. La bandeja sólo muestra alertas de centros con permiso (RLS).
 */
export default async function AlertsPage({ searchParams }: PageProps<"/direccion/alertas">) {
  const state = await requireScreen("alerts");
  const view = await loadAlertsInbox(
    state,
    createAlertsRepository((await createSupabaseServerClient())!),
    await searchParams,
  );
  const href = (patch: Partial<typeof view.filters>) => {
    const qs = new URLSearchParams(alertInboxParams({ ...view.filters, ...patch })).toString();
    return `/direccion/alertas${qs ? `?${qs}` : ""}`;
  };
  const chip = (active: boolean, label: string, to: string) => (
    <li key={label}>
      <Link
        href={to}
        className="mg-badge"
        data-tone={active ? "brand" : "neutral"}
        aria-current={active || undefined}
      >
        {label}
      </Link>
    </li>
  );
  return (
    <AppShell
      state={state}
      screen="alerts"
      title={ALERTS_COPY.title}
      description="Gestión por excepción: KPIs fuera de lo esperado, con el dato que las originó."
    >
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="flex flex-wrap gap-xs text-sm" data-testid="alert-counts">
          <span>Abiertas: {view.counts.total}</span>
          {ALERT_SEVERITIES.map((s) =>
            view.counts[s] ? (
              <Badge
                key={s}
                label={`${ALERT_SEVERITY_LABELS[s]}: ${view.counts[s]}`}
                tone={s === "critica" ? "danger" : s === "atencion" ? "warning" : "info"}
              />
            ) : null,
          )}
        </p>
        {view.scope.isAdmin ? (
          <ButtonLink
            href="/direccion/alertas/reglas"
            label={ALERTS_COPY.rulesTitle}
            variant="secondary"
            size="sm"
          />
        ) : null}
      </div>
      <nav
        aria-label="Filtros de alertas"
        className="flex flex-col gap-xs text-sm"
        data-testid="alert-filters"
      >
        <ul className="flex flex-wrap gap-xs">
          {ALERT_INBOX_STATUSES.map((s) =>
            chip(view.filters.status === s, ALERT_INBOX_STATUS_LABELS[s], href({ status: s })),
          )}
        </ul>
        <ul className="flex flex-wrap gap-xs">
          {chip(!view.filters.severity, "Todas las severidades", href({ severity: null }))}
          {ALERT_SEVERITIES.map((s) =>
            chip(view.filters.severity === s, ALERT_SEVERITY_LABELS[s], href({ severity: s })),
          )}
        </ul>
        {view.scope.centers.length > 1 ? (
          <ul className="flex flex-wrap gap-xs">
            {chip(!view.filters.centerId, "Todos los centros", href({ centerId: null }))}
            {view.scope.centers.map((c) =>
              chip(view.filters.centerId === c.id, c.name, href({ centerId: c.id })),
            )}
          </ul>
        ) : null}
      </nav>
      {view.error ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {view.error}
        </p>
      ) : null}
      {!view.error && view.alerts.length === 0 ? <EmptyState title={ALERTS_COPY.empty} /> : null}
      <ul className="flex flex-col gap-sm" data-testid="alert-list">
        {view.alerts.map(({ view: a, links }) => (
          <li key={a.id} className="mg-card flex flex-col gap-xs" data-testid={`alert-${a.id}`}>
            <div className="flex flex-wrap items-center gap-xs">
              <Badge label={a.severity} tone={a.severityTone} />
              <Badge label={a.status} tone={a.statusTone} />
              <Link href={`/direccion/alertas/${a.id}`} className="font-medium underline">
                {a.title}
              </Link>
            </div>
            <p className="text-sm">
              <strong>{a.metric}</strong> {a.condition} · {a.scope}
            </p>
            <p className="text-sm text-muted">
              {a.period}: <span data-testid="alert-value">{a.value}</span>
              {a.change ? ` (${a.change})` : ""} · {a.occurrences}
              {a.last ? ` · última: ${a.last}` : ""}
            </p>
            {a.cleared ? <p className="text-xs text-muted">{a.cleared}</p> : null}
            <p className="flex flex-wrap gap-sm text-sm">
              {links.kpis ? (
                <Link href={links.kpis} className="underline">
                  {ALERTS_COPY.viewKpi}
                </Link>
              ) : null}
              {links.drill ? (
                <Link href={links.drill} className="underline">
                  {ALERTS_COPY.viewDrill}
                </Link>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
