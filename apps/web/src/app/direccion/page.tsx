import { CORPORATE_CARDS, sortMix, type MixSort } from "@meguiars/analytics";
import {
  corporateCopy,
  corporatePeriodLabel,
  corporateSnapshotCsv,
  dashboardFilterParams,
  presentMixRows,
  presentReconciliation,
  presentThreshold,
} from "@meguiars/domain";
import { createDashboardRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CentersTable } from "@/components/centers-view";
import { BarList, LineChart } from "@/components/charts";
import { ComparisonTable, CorporateCardTile } from "@/components/corporate-board";
import { DeleteThresholdForm, KpiThresholdForm } from "@/components/corporate-forms";
import { DashboardFiltersForm } from "@/components/dashboard-filters";
import { CsvExport } from "@/components/pnl-export";
import { Card, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { loadCorporateCharts } from "@/lib/charts";
import { loadCorporateView } from "@/lib/corporate";
import { canManageDashboards } from "@/lib/dashboards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Dirección → Tablero corporativo (D3): tablero predeterminado para comparar
 * centros (1..N) y el consolidado, ver la tendencia contra el periodo
 * anterior, las alertas de umbral, el ranking de motores y servicios, y bajar
 * de cada KPI hasta la OS o el movimiento que lo explica.
 */
export default async function DireccionPage({ searchParams }: PageProps<"/direccion">) {
  const state = await requireScreen("direccion");
  const params = await searchParams;
  const repo = createDashboardRepository((await createSupabaseServerClient())!);
  const view = await loadCorporateView(state, repo, params);
  const charts = await loadCorporateCharts(state, repo, view);
  const { filters } = view;
  const sort: MixSort = params.orden === "margen" ? "margin" : "revenue";
  const sortHref = (orden: string) =>
    `/direccion?${new URLSearchParams({ ...dashboardFilterParams(filters, view.allowedCenterIds), orden }).toString()}`;
  const csv = corporateSnapshotCsv(filters, view.centerName, view.board);
  const cardOf = (metricId: string, channel: string | null) =>
    CORPORATE_CARDS.find((c) => c.metricId === metricId && c.channel === channel);
  const mix = view.mix;
  const manage = canManageDashboards(state);

  return (
    <AppShell
      state={state}
      screen="direccion"
      title={corporateCopy.title}
      description={corporateCopy.description}
    >
      <DashboardFiltersForm
        action="/direccion"
        filters={filters}
        centers={view.centers}
        channelAndEngine={false}
      />
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="text-sm text-muted" data-testid="corporate-filters">
          {corporatePeriodLabel(filters.from, filters.to)} · {view.chosen.map((c) => c.name).join(", ")} ·{" "}
          {corporateCopy.vsPrevious(corporatePeriodLabel(view.previous.from, view.previous.to))}
        </p>
        <CsvExport
          csv={csv}
          filename={`tablero-corporativo-${filters.from}-${filters.to}.csv`}
          label={corporateCopy.exportCsv}
          printLabel="Imprimir / PDF"
        />
      </div>
      <p className="text-xs text-muted">{corporateCopy.filtersNote}</p>
      {view.error ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {view.error}
        </p>
      ) : null}
      {!view.error && view.cards.length === 0 ? <EmptyState title={corporateCopy.title} /> : null}
      {view.cards.length > 0 ? (
        <>
          <section aria-label={corporateCopy.executiveSummary} className="flex flex-col gap-md">
            <div className="grid gap-md md:grid-cols-2 lg:grid-cols-5" data-testid="corporate-cards">
              {view.cards.map((card) => (
                <CorporateCardTile key={card.id} card={card} />
              ))}
            </div>
          </section>
          <Card
            title={corporateCopy.comparison}
            subtitle={corporateCopy.vsPrevious(corporatePeriodLabel(view.previous.from, view.previous.to))}
          >
            <ComparisonTable cards={view.cards} centers={view.chosen} />
          </Card>
          {charts.trend ? (
            <Card
              title="Tendencia de ventas"
              subtitle={`${corporatePeriodLabel(filters.from, filters.to)} · ${charts.trendNote}`}
            >
              <div data-testid="chart-trend">
                <LineChart
                  data={charts.trend}
                  caption="Ventas por periodo"
                  labelEvery={Math.max(1, Math.ceil(charts.trend.categories.length / 8))}
                />
              </div>
            </Card>
          ) : null}
        </>
      ) : null}
      {mix ? (
        <Card
          title={corporateCopy.mixTitle}
          actions={
            <nav aria-label={corporateCopy.sortBy} className="flex gap-sm text-sm">
              <span className="text-muted">{corporateCopy.sortBy}:</span>
              <Link
                href={sortHref("ingreso")}
                aria-current={sort === "revenue" ? "true" : undefined}
                className="underline"
              >
                {corporateCopy.sortRevenue}
              </Link>
              <Link
                href={sortHref("margen")}
                aria-current={sort === "margin" ? "true" : undefined}
                className="underline"
              >
                {corporateCopy.sortMargin}
              </Link>
            </nav>
          }
        >
          {mix.status === "forbidden" ? (
            <p className="text-sm text-muted">{corporateCopy.mixForbidden}</p>
          ) : (
            <div className="grid gap-lg lg:grid-cols-2" data-testid="mix">
              {charts.engines.length > 0 ? (
                <div data-testid="chart-engines" className="flex flex-col gap-sm">
                  <p className="text-sm font-bold">{corporateCopy.byEngine}</p>
                  <BarList rows={charts.engines} caption={`Ingreso ${corporateCopy.byEngine}`} />
                </div>
              ) : null}
              {charts.services.length > 0 ? (
                <div data-testid="chart-services" className="flex flex-col gap-sm">
                  <p className="text-sm font-bold">{corporateCopy.byService} (8 con más ingreso)</p>
                  <BarList rows={charts.services} caption={`Ingreso ${corporateCopy.byService}`} />
                </div>
              ) : null}
              {(
                [
                  ["engines", corporateCopy.byEngine, mix.byEngine],
                  ["services", corporateCopy.byService, mix.byService],
                ] as const
              ).map(([key, title, rows]) => (
                <div key={key} className="relative min-w-0 overflow-x-auto" data-testid={`mix-${key}`}>
                  <table className="w-full border-collapse text-sm">
                    <caption className="pb-xs text-left font-bold">{title}</caption>
                    <thead className="bg-surface">
                      <tr>
                        <th scope="col" className="px-sm py-xs text-left font-medium">
                          {title}
                        </th>
                        <th scope="col" className="px-sm py-xs text-right font-medium">
                          {corporateCopy.revenue}
                        </th>
                        <th scope="col" className="px-sm py-xs text-right font-medium">
                          {corporateCopy.margin}
                        </th>
                        <th scope="col" className="px-sm py-xs text-right font-medium">
                          {corporateCopy.marginPct}
                        </th>
                        <th scope="col" className="px-sm py-xs text-right font-medium">
                          {corporateCopy.share}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {presentMixRows(sortMix(rows, sort)).map((r) => (
                        <tr
                          key={r.key}
                          className={`border-t border-border ${r.negative ? "text-danger" : ""}`}
                        >
                          <th scope="row" className="px-sm py-xs text-left font-normal">
                            {r.label}
                            {r.quantity !== "—" ? (
                              <span className="text-xs text-muted"> · {r.quantity} u.</span>
                            ) : null}
                          </th>
                          <td className="px-sm py-xs text-right">{r.revenue}</td>
                          <td className="px-sm py-xs text-right">{r.margin}</td>
                          <td className="px-sm py-xs text-right">{r.marginPct}</td>
                          <td className="px-sm py-xs text-right">{r.share}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              {(
                [
                  ["revenue", mix.revenueReconciliation, mix.revenueDifference],
                  ["margin", mix.marginReconciliation, mix.marginDifference],
                ] as const
              ).map(([key, lines, diff]) => {
                const r = presentReconciliation(lines, diff);
                return (
                  <dl
                    key={key}
                    className="flex flex-col gap-xxs text-sm"
                    data-testid={`reconciliation-${key}`}
                  >
                    {r.lines.map((l) => (
                      <div
                        key={l.label}
                        className={`flex justify-between ${l.total ? "border-t border-border pt-xxs font-bold" : ""}`}
                      >
                        <dt>{l.label}</dt>
                        <dd>{l.amount}</dd>
                      </div>
                    ))}
                    <dd
                      className="mg-tone rounded-md border p-xs text-xs"
                      data-tone={r.ok ? "success" : "warning"}
                    >
                      {r.status}
                    </dd>
                  </dl>
                );
              })}
            </div>
          )}
        </Card>
      ) : null}
      <Card title={corporateCopy.thresholds} subtitle={corporateCopy.thresholdsHint}>
        {view.thresholds.length === 0 ? (
          <p className="text-sm text-muted">{corporateCopy.noThresholds}</p>
        ) : null}
        <ul className="flex flex-col gap-sm" data-testid="thresholds">
          {view.thresholds.map((t) => {
            const card = cardOf(t.metricId, t.channel);
            const p = presentThreshold(
              t,
              card?.name ?? t.metricId,
              card?.metric.unit ?? "currency",
              view.centerName,
            );
            return (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-sm border-t border-border pt-sm text-sm"
              >
                <span>
                  <span className="font-medium">{p.card}</span> · {p.center} · {p.limits}
                </span>
                {manage ? <DeleteThresholdForm id={t.id} /> : null}
              </li>
            );
          })}
        </ul>
        {manage ? (
          <KpiThresholdForm
            organizationId={view.organizationId}
            cards={CORPORATE_CARDS.map((c) => ({ id: c.id, name: c.name }))}
            centers={view.centers}
          />
        ) : null}
      </Card>
      <Card title="Centros">
        <CentersTable access={state.access} now={new Date()} />
      </Card>
    </AppShell>
  );
}
