import {
  dashboardsCopy,
  dashboardsErrorMessage,
  DASHBOARD_RANGE_LABELS,
  ROLE_LABELS,
  type DashboardDefinition,
} from "@meguiars/domain";
import { createDashboardRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { canManageDashboards } from "@/lib/dashboards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Tableros visibles para el usuario (su rol y sus centros), con su favorito primero. */
export default async function DashboardsPage({ searchParams }: PageProps<"/direccion/tableros">) {
  const state = await requireScreen("dashboards");
  const archived = (await searchParams).hecho === "archivado";
  const repo = createDashboardRepository((await createSupabaseServerClient())!);
  const [list, prefs] = await Promise.all([repo.list(), repo.preferences()]);
  const favorite = prefs.ok ? prefs.data.find((p) => p.isFavorite)?.dashboardId : undefined;
  const manage = canManageDashboards(state);
  const dashboards = list.ok
    ? [...list.data].sort((a, b) => Number(b.id === favorite) - Number(a.id === favorite))
    : [];
  const audience = (d: DashboardDefinition) =>
    d.audienceRole ? ROLE_LABELS[d.audienceRole] : dashboardsCopy.audienceAll;
  return (
    <AppShell
      state={state}
      screen="dashboards"
      title={dashboardsCopy.title}
      description={dashboardsCopy.description}
    >
      {archived ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
          {dashboardsCopy.archived}
        </p>
      ) : null}
      {manage ? (
        <div>
          <ButtonLink
            href="/direccion/tableros/nuevo"
            label={dashboardsCopy.newDashboard}
            variant="primary"
          />
        </div>
      ) : null}
      {!list.ok ? (
        <EmptyState title={dashboardsErrorMessage(list.error)} />
      ) : dashboards.length === 0 ? (
        <EmptyState title={dashboardsCopy.empty} />
      ) : (
        <ul className="grid gap-md md:grid-cols-2 lg:grid-cols-3" aria-label={dashboardsCopy.title}>
          {dashboards.map((d) => (
            <li key={d.id} className="mg-card flex flex-col gap-sm">
              <h2 className="text-lg font-bold text-accent">
                <Link href={`/direccion/tableros/${d.id}`} className="underline">
                  {d.name}
                </Link>
              </h2>
              {d.description ? <p className="text-sm text-muted">{d.description}</p> : null}
              <div className="flex flex-wrap gap-xs">
                {d.isDefault ? <Badge label={dashboardsCopy.corporate} tone="info" /> : null}
                {d.id === favorite ? <Badge label={dashboardsCopy.favorite} tone="success" /> : null}
                <Badge label={audience(d)} />
              </div>
              <p className="text-xs text-muted">
                {d.widgets.length} widgets · {DASHBOARD_RANGE_LABELS[d.defaultRange]}
              </p>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
