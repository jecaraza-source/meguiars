import { dashboardsCopy } from "@meguiars/domain";
import { createDashboardRepository } from "@meguiars/supabase";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DashboardBuilder } from "@/components/dashboard-forms";
import { EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { builderContext } from "@/lib/dashboards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Constructor: tablero nuevo con métricas registradas. */
export default async function NewDashboardPage() {
  const state = await requireScreen("dashboardNew");
  const repo = createDashboardRepository((await createSupabaseServerClient())!);
  const ctx = await builderContext(state, repo);
  return (
    <AppShell
      state={state}
      screen="dashboardNew"
      title={dashboardsCopy.newDashboard}
      description={dashboardsCopy.noSqlNote}
    >
      <Link href="/direccion/tableros" className="text-sm underline">
        ← {dashboardsCopy.title}
      </Link>
      {ctx.organizationId ? (
        <DashboardBuilder
          organizationId={ctx.organizationId}
          requestId={randomUUID()}
          dashboard={null}
          metrics={ctx.metrics}
          centers={ctx.centers}
        />
      ) : (
        <EmptyState title={dashboardsCopy.forbiddenDashboard} />
      )}
    </AppShell>
  );
}
