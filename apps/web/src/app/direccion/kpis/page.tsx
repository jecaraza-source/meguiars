import { KPI_CATALOG, KPI_CATEGORIES, KPI_CATEGORY_LABELS, kpiValidFilters } from "@meguiars/analytics";
import {
  activeCenterAccess,
  dashboardFiltersLabel,
  dashboardSnapshotCsv,
  kpisCopy,
  kpiSheet,
} from "@meguiars/domain";
import { createDashboardRepository } from "@meguiars/supabase";
import { AppShell } from "@/components/app-shell";
import { DashboardFiltersForm } from "@/components/dashboard-filters";
import { DashboardWidgetCard } from "@/components/dashboard-widgets";
import { KpiSettingsForm } from "@/components/kpi-forms";
import { CsvExport } from "@/components/pnl-export";
import { Card, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { canManageDashboards, kpiDefinition, loadDashboardView } from "@/lib/dashboards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Dirección → KPIs: registro de KPIs financieros, operativos, comerciales y de
 * cliente con los filtros globales. Cada KPI es una vista de una métrica
 * registrada (una fórmula) y muestra su ficha de negocio.
 */
export default async function KpisPage({ searchParams }: PageProps<"/direccion/kpis">) {
  const state = await requireScreen("kpis");
  const params = await searchParams;
  const organizationId = activeCenterAccess(state)!.center.organizationId;
  const repo = createDashboardRepository((await createSupabaseServerClient())!);
  const [view, settings] = await Promise.all([
    loadDashboardView(state, repo, kpiDefinition(organizationId), null, params),
    repo.kpiSettings(organizationId),
  ]);
  const byId = new Map(view.widgets.map((w) => [w.id, w]));
  const csv = dashboardSnapshotCsv(kpisCopy.title, view.filters, view.centerName, view.widgets);
  const s = settings.ok ? settings.data : null;

  return (
    <AppShell state={state} screen="kpis" title={kpisCopy.title} description={kpisCopy.description}>
      <DashboardFiltersForm action="/direccion/kpis" filters={view.filters} centers={view.centers} />
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="text-sm text-muted" data-testid="kpi-filters">
          {dashboardFiltersLabel(view.filters, view.centerName)}
        </p>
        <CsvExport
          csv={csv}
          filename={`kpis-${view.filters.from}-${view.filters.to}.csv`}
          label="Exportar CSV"
          printLabel="Imprimir / PDF"
        />
      </div>
      {view.error ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {view.error}
        </p>
      ) : null}
      {!view.error && view.widgets.length === 0 ? <EmptyState title={kpisCopy.title} /> : null}
      {view.widgets.length > 0
        ? KPI_CATEGORIES.map((category) => (
            <section
              key={category}
              className="flex flex-col gap-md"
              aria-label={KPI_CATEGORY_LABELS[category]}
            >
              <h2 className="text-lg font-bold text-accent">{KPI_CATEGORY_LABELS[category]}</h2>
              <div className="grid gap-md md:grid-cols-2 lg:grid-cols-4" data-testid={`kpis-${category}`}>
                {KPI_CATALOG.filter((k) => k.category === category).map((k) => {
                  const w = byId.get(k.id);
                  if (!w) return null;
                  return (
                    <DashboardWidgetCard key={k.id} widget={w}>
                      <details className="text-xs text-muted" data-testid={`sheet-${k.id}`}>
                        <summary className="cursor-pointer">{kpisCopy.sheet}</summary>
                        <dl className="mt-xs flex flex-col gap-xxs">
                          {kpiSheet({ ...k, validFilters: kpiValidFilters(k) }).map((row) => (
                            <div key={row.label}>
                              <dt className="font-medium">{row.label}</dt>
                              <dd>{row.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    </DashboardWidgetCard>
                  );
                })}
              </div>
            </section>
          ))
        : null}
      {s ? (
        <Card
          title={kpisCopy.settings}
          subtitle={`${kpisCopy.settingsHint} ${kpisCopy.settingsSummary(s.ltvLifetimeYears, s.operatingHoursPerDay, s.operatingDaysPerWeek)}`}
        >
          {canManageDashboards(state) ? <KpiSettingsForm settings={s} /> : null}
        </Card>
      ) : null}
    </AppShell>
  );
}
