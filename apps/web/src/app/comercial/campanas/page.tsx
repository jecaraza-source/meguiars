import {
  activeCenterAccess,
  CAMPAIGN_OBJECTIVE_LABELS,
  CAMPAIGN_STATUS_LABELS,
  canInCenter,
  formatMoney,
  MARKETING_COPY,
  PILOT_PERIODS,
  todayIn,
  usableCenters,
} from "@meguiars/domain";
import { createMarketingRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CampaignForm } from "@/components/marketing-forms";
import { Badge, Card, EmptyState, KpiCard } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { loadCampaignReport } from "@/lib/marketing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Campañas: indicadores del periodo con su fórmula y una fila por campaña. */
export default async function CampaignsPage({ searchParams }: PageProps<"/comercial/campanas">) {
  const state = await requireScreen("campaigns");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const periodId = typeof params.periodo === "string" ? params.periodo : "30";
  const today = todayIn(center.timezone);
  const repo = createMarketingRepository((await createSupabaseServerClient())!);
  const canMetrics = canInCenter(state, center.id, "commercial.metrics.read");
  const [campaigns, report] = await Promise.all([
    repo.campaigns(center.organizationId),
    canMetrics
      ? loadCampaignReport(repo, center.organizationId, [center.id], periodId, today)
      : Promise.resolve(null),
  ]);
  const canManage = canInCenter(state, center.id, "marketing.manage");
  const centers = usableCenters(state.access)
    .filter(
      (a) =>
        a.center.organizationId === center.organizationId &&
        canInCenter(state, a.center.id, "marketing.manage"),
    )
    .map((a) => ({ value: a.center.id, label: a.center.name }));
  const factsById = new Map((report?.rows ?? []).map((r) => [r.campaignId, r]));

  return (
    <AppShell
      state={state}
      screen="campaigns"
      title={MARKETING_COPY.campaignsTitle}
      description={center.name}
    >
      {report ? (
        <>
          <div className="flex flex-wrap gap-xs" aria-label="Periodo">
            {PILOT_PERIODS.map((p) => (
              <Link
                key={p.id}
                href={`/comercial/campanas?periodo=${p.id}`}
                className="mg-badge"
                data-tone={p.id === report.period.id ? "brand" : "neutral"}
              >
                {p.label}
              </Link>
            ))}
          </div>
          <p className="text-sm text-muted">
            Del {report.period.from} al {report.period.to}. {MARKETING_COPY.attributionNote}
          </p>
          {report.error ? <EmptyState title={report.error} /> : null}
          <div className="grid gap-md md:grid-cols-4" data-testid="campaign-kpis">
            {report.kpis.map((k) => (
              <KpiCard key={k.id} label={k.name} value={k.display} caption={k.formula} />
            ))}
          </div>
          <p className="text-xs text-muted">{MARKETING_COPY.salesPerPesoNote}</p>
        </>
      ) : null}
      {!campaigns.ok ? (
        <EmptyState title={campaigns.error.message} />
      ) : campaigns.data.length === 0 ? (
        <EmptyState title={MARKETING_COPY.noCampaigns} />
      ) : (
        <Card>
          <table className="w-full text-sm" data-testid="campaign-table">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-xs">Campaña</th>
                <th>Estado</th>
                <th>Periodo</th>
                <th className="text-right">Inversión</th>
                <th className="text-right">Prospectos</th>
                <th className="text-right">Costo/prospecto</th>
                <th className="text-right">Ventas</th>
                <th className="text-right">Margen tras inversión</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.data.map((c) => {
                const f = factsById.get(c.id);
                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="py-xs">
                      <Link href={`/comercial/campanas/${c.id}`} className="font-medium underline">
                        {c.name}
                      </Link>
                      <div className="text-xs text-muted">
                        {CAMPAIGN_OBJECTIVE_LABELS[c.objective]} · {c.centerName ?? "Toda la organización"}
                      </div>
                    </td>
                    <td>
                      <Badge
                        label={CAMPAIGN_STATUS_LABELS[c.status]}
                        tone={c.status === "activa" ? "success" : "neutral"}
                      />
                    </td>
                    <td>
                      {c.startsOn} – {c.endsOn}
                    </td>
                    <td className="text-right">{formatMoney(c.spend)}</td>
                    <td className="text-right">{f ? f.leads : c.leads}</td>
                    <td className="text-right">{f?.costPerLeadLabel ?? "—"}</td>
                    <td className="text-right">{f?.salesLabel ?? "—"}</td>
                    <td className="text-right">{f?.marginAfterSpendLabel ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      {canManage ? (
        <Card title={MARKETING_COPY.newCampaign}>
          <CampaignForm centers={centers} defaultCenterId={center.id} today={today} />
        </Card>
      ) : null}
    </AppShell>
  );
}
