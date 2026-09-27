import { pnlByCenter } from "@meguiars/analytics";
import {
  activeCenterAccess,
  can,
  executiveKpis,
  formatMoney,
  formatPercent,
  pnlCopy,
  pnlPeriod,
  pnlSummaryKpis,
  sectionCopy,
  todayIn,
  usableCenters,
} from "@meguiars/domain";
import { createPnlRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CentersTable } from "@/components/centers-view";
import { Card, KpiCard, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DireccionPage() {
  const state = await requireScreen("direccion");
  const copy = sectionCopy.direccion;
  // Resultados del mes con las mismas fórmulas que el estado de resultados (AF4).
  const center = activeCenterAccess(state)?.center;
  const allowed = usableCenters(state.access).filter((a) =>
    can([...a.roles, ...a.corporateRoles], "pnl.read"),
  );
  const period = center ? pnlPeriod("mes", todayIn(center.timezone)) : null;
  const result =
    period && allowed.length > 0
      ? await createPnlRepository((await createSupabaseServerClient())!).lines(
          allowed.map((a) => a.center.id),
          period.from,
          period.to,
        )
      : null;
  const pnl = result?.ok
    ? pnlByCenter(
        result.data,
        allowed.map((a) => a.center.id),
      )
    : null;
  return (
    <AppShell state={state} screen="direccion" title={copy.title} description={copy.description}>
      <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-4">
        {executiveKpis(state.access).map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>
      {pnl && period ? (
        <Card
          title={`Resultados del mes · ${pnlCopy.consolidated}`}
          subtitle={`${period.from} a ${period.to} · ${pnlCopy.formulasNote}`}
          actions={
            <Link href="/finanzas/resultados?alcance=todos" className="text-sm underline">
              {pnlCopy.title} →
            </Link>
          }
        >
          <div className="mb-md grid gap-lg md:grid-cols-2 lg:grid-cols-4" data-testid="direccion-pnl">
            {pnlSummaryKpis(pnl.consolidated).map((kpi) => (
              <KpiCard key={kpi.label} {...kpi} />
            ))}
          </div>
          <Table
            caption="Resultados por centro"
            rows={pnl.centers.map((c) => ({
              id: c.detailCenterId,
              name: allowed.find((a) => a.center.id === c.detailCenterId)?.center.name ?? "",
              revenue: formatMoney(c.statement.revenue),
              gross: formatMoney(c.statement.grossProfit),
              ebitda: formatMoney(c.statement.ebitda),
              margin: formatPercent(c.statement.ebitdaMargin),
            }))}
            rowKey={(r) => r.id}
            emptyMessage={pnlCopy.empty}
            columns={[
              { key: "name", header: "Centro", value: (r) => r.name },
              { key: "revenue", header: "Ventas", value: (r) => r.revenue, align: "end" },
              { key: "gross", header: "Utilidad bruta", value: (r) => r.gross, align: "end" },
              { key: "ebitda", header: "EBITDA gerencial", value: (r) => r.ebitda, align: "end" },
              { key: "margin", header: "Margen EBITDA", value: (r) => r.margin, align: "end" },
            ]}
          />
        </Card>
      ) : null}
      <Card title="Centros">
        <CentersTable access={state.access} now={new Date()} />
      </Card>
    </AppShell>
  );
}
