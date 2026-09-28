import { dashboardsCopy, dashboardsErrorMessage } from "@meguiars/domain";
import { createDashboardRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ArchiveDashboardForm, DashboardBuilder } from "@/components/dashboard-forms";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { builderContext } from "@/lib/dashboards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Constructor: edita la rejilla, audiencia, centros y periodo (con motivo); archiva. */
export default async function EditDashboardPage({ params }: PageProps<"/direccion/tableros/[id]/editar">) {
  const state = await requireScreen("dashboardEdit");
  const { id } = await params;
  const repo = createDashboardRepository((await createSupabaseServerClient())!);
  const [result, ctx] = await Promise.all([repo.get(id), builderContext(state, repo)]);
  if (!result.ok || !ctx.organizationId) {
    return (
      <AppShell state={state} screen="dashboardEdit" title={dashboardsCopy.edit}>
        <EmptyState
          title={result.ok ? dashboardsCopy.forbiddenDashboard : dashboardsErrorMessage(result.error)}
          action={<ButtonLink href="/direccion/tableros" label={dashboardsCopy.title} />}
        />
      </AppShell>
    );
  }
  const d = result.data;
  return (
    <AppShell
      state={state}
      screen="dashboardEdit"
      title={`${dashboardsCopy.edit} · ${d.name}`}
      description={dashboardsCopy.noSqlNote}
    >
      <Link href={`/direccion/tableros/${d.id}`} className="text-sm underline">
        ← {d.name}
      </Link>
      <DashboardBuilder
        organizationId={d.organizationId}
        requestId={d.id}
        dashboard={d}
        metrics={ctx.metrics}
        centers={ctx.centers}
      />
      {d.isDefault ? null : (
        <Card title={dashboardsCopy.archive}>
          <ArchiveDashboardForm id={d.id} version={d.version} />
        </Card>
      )}
    </AppShell>
  );
}
