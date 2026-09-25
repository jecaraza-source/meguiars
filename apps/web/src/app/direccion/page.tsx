import { executiveKpis, sectionCopy } from "@meguiars/domain";
import { AppShell } from "@/components/app-shell";
import { CentersTable } from "@/components/centers-view";
import { Card, KpiCard } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";

export default async function DireccionPage() {
  const state = await requireScreen("direccion");
  const copy = sectionCopy.direccion;
  return (
    <AppShell state={state} screen="direccion" title={copy.title} description={copy.description}>
      <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-4">
        {executiveKpis(state.access).map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>
      <Card title="Centros">
        <CentersTable access={state.access} now={new Date()} />
      </Card>
    </AppShell>
  );
}
