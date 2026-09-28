import {
  DASHBOARD_CHANNEL_KEYS,
  DASHBOARD_CHANNEL_LABELS,
  DASHBOARD_ENGINE_KEYS,
  DASHBOARD_ENGINE_LABELS,
  dashboardFilterParams,
  dashboardFiltersLabel,
  dashboardsCopy,
  dashboardsErrorMessage,
  dashboardSnapshotCsv,
  PNL_PERIOD_LABELS,
  PNL_PERIODS,
  ROLE_LABELS,
  savedFiltersOf,
} from "@meguiars/domain";
import { createDashboardRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DashboardViewEditor } from "@/components/dashboard-forms";
import { DashboardGrid } from "@/components/dashboard-widgets";
import { CsvExport } from "@/components/pnl-export";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { canManageDashboards, loadDashboardView } from "@/lib/dashboards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Visor del tablero: filtros globales (centros, periodo, canal, motor) que se
 * propagan a los widgets compatibles, drill-down, vista personal y exportación
 * CSV / PDF (impresión) del snapshot.
 */
export default async function DashboardPage({ params, searchParams }: PageProps<"/direccion/tableros/[id]">) {
  const state = await requireScreen("dashboardDetail");
  const { id } = await params;
  const query = await searchParams;
  const repo = createDashboardRepository((await createSupabaseServerClient())!);
  const [result, prefsList] = await Promise.all([repo.get(id), repo.preferences()]);
  if (!result.ok) {
    return (
      <AppShell state={state} screen="dashboardDetail" title={dashboardsCopy.title}>
        <EmptyState
          title={dashboardsErrorMessage(result.error)}
          action={<ButtonLink href="/direccion/tableros" label={dashboardsCopy.title} />}
        />
      </AppShell>
    );
  }
  const d = result.data;
  const prefs = (prefsList.ok ? prefsList.data : []).find((p) => p.dashboardId === d.id) ?? null;
  const view = await loadDashboardView(state, repo, d, prefs, query);
  const { filters, centers } = view;
  const allowedIds = centers.map((c) => c.id);
  const customize = query.personalizar === "1";
  const base = `/direccion/tableros/${d.id}`;
  const withFilters = (extra: Record<string, string> = {}) =>
    `${base}?${new URLSearchParams({ ...dashboardFilterParams(filters, allowedIds), ...extra }).toString()}`;
  const csv = dashboardSnapshotCsv(d.name, filters, view.centerName, view.widgets);

  return (
    <AppShell
      state={state}
      screen="dashboardDetail"
      title={d.name}
      description={d.description ?? dashboardFiltersLabel(filters, view.centerName)}
    >
      <div className="flex flex-wrap items-center gap-sm text-sm print:hidden">
        <Link href="/direccion/tableros" className="underline">
          ← {dashboardsCopy.title}
        </Link>
        {d.isDefault ? <Badge label={dashboardsCopy.corporate} tone="info" /> : null}
        <Badge label={d.audienceRole ? ROLE_LABELS[d.audienceRole] : dashboardsCopy.audienceAll} />
      </div>
      {query.hecho === "guardado" ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
          {dashboardsCopy.saved}
        </p>
      ) : null}

      <form
        method="get"
        action={base}
        className="mg-card flex flex-col gap-md print:hidden"
        aria-label={dashboardsCopy.filters}
      >
        <div className="grid gap-md md:grid-cols-2 lg:grid-cols-4">
          <label className="mg-field">
            <span className="mg-label">{dashboardsCopy.period}</span>
            <select name="periodo" defaultValue={filters.period} className="mg-input">
              {PNL_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {PNL_PERIOD_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="mg-field">
            <span className="mg-label">{dashboardsCopy.from}</span>
            <input type="date" name="desde" defaultValue={filters.from} className="mg-input" />
          </label>
          <label className="mg-field">
            <span className="mg-label">{dashboardsCopy.to}</span>
            <input type="date" name="hasta" defaultValue={filters.to} className="mg-input" />
          </label>
          <label className="mg-field">
            <span className="mg-label">{dashboardsCopy.channel}</span>
            <select name="canal" defaultValue={filters.channel ?? ""} className="mg-input">
              <option value="">{dashboardsCopy.all}</option>
              {DASHBOARD_CHANNEL_KEYS.map((c) => (
                <option key={c} value={c}>
                  {DASHBOARD_CHANNEL_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="mg-field">
            <span className="mg-label">{dashboardsCopy.engine}</span>
            <select name="motor" defaultValue={filters.engine ?? ""} className="mg-input">
              <option value="">{dashboardsCopy.all}</option>
              {DASHBOARD_ENGINE_KEYS.map((e) => (
                <option key={e} value={e}>
                  {DASHBOARD_ENGINE_LABELS[e]}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-col gap-xs lg:col-span-3">
            <legend className="mg-label">{dashboardsCopy.centers}</legend>
            <div className="flex flex-wrap gap-md">
              {centers.map((c) => (
                <label key={c.id} className="flex items-center gap-sm text-sm">
                  <input
                    type="checkbox"
                    name="centros"
                    value={c.id}
                    defaultChecked={filters.centerIds.includes(c.id)}
                    className="size-lg accent-brand"
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div>
          <button type="submit" className="mg-btn" data-variant="primary" data-size="sm">
            {dashboardsCopy.apply}
          </button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="text-sm text-muted" data-testid="dashboard-filters">
          {dashboardFiltersLabel(filters, view.centerName)}
        </p>
        <div className="flex flex-wrap gap-sm print:hidden">
          <CsvExport
            csv={csv}
            filename={`tablero-${filters.from}-${filters.to}.csv`}
            label={dashboardsCopy.exportCsv}
            printLabel={dashboardsCopy.exportPdf}
          />
          <ButtonLink
            href={customize ? withFilters() : withFilters({ personalizar: "1" })}
            label={customize ? dashboardsCopy.done : dashboardsCopy.customize}
            size="sm"
          />
          {canManageDashboards(state) ? (
            <ButtonLink href={`${base}/editar`} label={dashboardsCopy.edit} size="sm" />
          ) : null}
        </div>
      </div>

      {customize ? (
        <Card title={dashboardsCopy.myView} subtitle={dashboardsCopy.hiddenWidgets}>
          <DashboardViewEditor
            dashboardId={d.id}
            visible={view.visible.map((w) => ({
              id: w.id,
              title: view.widgets.find((p) => p.id === w.id)?.title ?? w.metricId,
            }))}
            hidden={view.hidden.map((w) => ({ id: w.id, title: w.title ?? w.metricId }))}
            filters={savedFiltersOf(filters, allowedIds)}
            isFavorite={prefs?.isFavorite ?? false}
          />
        </Card>
      ) : null}

      {view.error ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {view.error}
        </p>
      ) : view.widgets.length === 0 ? (
        <EmptyState title={dashboardsCopy.noData} />
      ) : (
        <DashboardGrid widgets={view.widgets} />
      )}
    </AppShell>
  );
}
