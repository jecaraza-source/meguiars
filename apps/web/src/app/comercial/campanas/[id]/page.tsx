import {
  activeCenterAccess,
  CAMPAIGN_CHANNEL_LABELS,
  CAMPAIGN_OBJECTIVE_LABELS,
  CAMPAIGN_STATUS_LABELS,
  canInCenter,
  CONTENT_STATUS_LABELS,
  formatMoney,
  MARKETING_COPY,
  PILOT_PERIODS,
  PROMOTION_STATE_LABELS,
  promotionState,
  todayIn,
  usableCenters,
} from "@meguiars/domain";
import { createMarketingRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CampaignForm, SpendForm, UtmBuilder, VoidSpendForm } from "@/components/marketing-forms";
import { Badge, Card, EmptyState, KpiCard } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { loadCampaignReport } from "@/lib/marketing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Campaña: indicadores, enlace UTM, gasto, promociones y publicaciones. */
export default async function CampaignPage({ params, searchParams }: PageProps<"/comercial/campanas/[id]">) {
  const state = await requireScreen("campaignDetail");
  const { id } = await params;
  const sp = await searchParams;
  const periodId = typeof sp.periodo === "string" ? sp.periodo : "90";
  const center = activeCenterAccess(state)!.center;
  const today = todayIn(center.timezone);
  const repo = createMarketingRepository((await createSupabaseServerClient())!);
  const r = await repo.campaign(center.organizationId, id);
  if (!r.ok) {
    return (
      <AppShell state={state} screen="campaignDetail" title={MARKETING_COPY.campaignsTitle}>
        <Link href="/comercial/campanas" className="text-sm underline">
          ← Campañas
        </Link>
        <EmptyState title={r.error.message} />
      </AppShell>
    );
  }
  const c = r.data;
  const visibleCenters = usableCenters(state.access).filter(
    (a) => a.center.organizationId === center.organizationId,
  );
  const metricCenters = visibleCenters
    .filter((a) => canInCenter(state, a.center.id, "commercial.metrics.read"))
    .map((a) => a.center.id);
  const [spend, promos, posts, expenses, report] = await Promise.all([
    repo.spendEntries(c.id),
    repo.promotions(center.organizationId),
    repo.posts(
      center.organizationId,
      c.startsOn,
      c.endsOn < c.startsOn
        ? c.startsOn
        : c.endsOn > addDays(c.startsOn, 185)
          ? addDays(c.startsOn, 185)
          : c.endsOn,
      { campaignId: c.id },
    ),
    c.canManage ? repo.marketingExpenses(center.organizationId) : Promise.resolve(null),
    metricCenters.length
      ? loadCampaignReport(repo, center.organizationId, metricCenters, periodId, today)
      : Promise.resolve(null),
  ]);
  const facts = report?.rows.find((x) => x.campaignId === c.id);
  const centers = visibleCenters
    .filter((a) => canInCenter(state, a.center.id, "marketing.manage"))
    .map((a) => ({ value: a.center.id, label: a.center.name }));
  const myPromos = promos.ok ? promos.data.filter((p) => p.campaignId === c.id) : [];

  return (
    <AppShell
      state={state}
      screen="campaignDetail"
      title={c.name}
      description={`${CAMPAIGN_OBJECTIVE_LABELS[c.objective]} · ${c.centerName ?? "Toda la organización"}`}
    >
      <Link href="/comercial/campanas" className="text-sm underline">
        ← Campañas
      </Link>
      <div className="flex flex-wrap items-center gap-xs">
        <Badge
          label={CAMPAIGN_STATUS_LABELS[c.status]}
          tone={c.status === "activa" ? "success" : "neutral"}
        />
        <span className="text-sm text-muted">
          {c.startsOn} – {c.endsOn} ·{" "}
          {c.channels.map((x) => CAMPAIGN_CHANNEL_LABELS[x]).join(", ") || "Sin canales"} · presupuesto{" "}
          {c.budget != null ? formatMoney(c.budget) : "sin definir"}
        </span>
      </div>
      {report ? (
        <>
          <div className="flex flex-wrap gap-xs" aria-label="Periodo">
            {PILOT_PERIODS.map((p) => (
              <Link
                key={p.id}
                href={`/comercial/campanas/${c.id}?periodo=${p.id}`}
                className="mg-badge"
                data-tone={p.id === report.period.id ? "brand" : "neutral"}
              >
                {p.label}
              </Link>
            ))}
          </div>
          <div className="grid gap-md md:grid-cols-4" data-testid="campaign-detail-kpis">
            <KpiCard
              label="Inversión del periodo"
              value={facts?.spendLabel ?? "Sin datos"}
              caption="Σ gasto sin anulados"
            />
            <KpiCard
              label="Prospectos"
              value={String(facts?.leads ?? 0)}
              caption={`Cotizados ${facts?.quoted ?? 0} · reservaron ${facts?.booked ?? 0} · compraron ${facts?.won ?? 0}`}
            />
            <KpiCard
              label="Costo por prospecto"
              value={facts?.costPerLeadLabel ?? "Sin datos"}
              caption="Inversión ÷ prospectos atribuidos"
            />
            <KpiCard
              label="Ventas atribuidas"
              value={facts?.salesLabel ?? "Sin datos"}
              caption="OS entregadas que ganaron a sus prospectos"
            />
            <KpiCard
              label="Ventas por peso invertido"
              value={facts?.salesPerPesoLabel ?? "Sin datos"}
              caption="Ventas ÷ inversión. No es utilidad"
            />
            <KpiCard
              label="Margen después de la inversión"
              value={facts?.marginAfterSpendLabel ?? "Sin datos"}
              caption="Margen de contribución de las ventas − inversión"
            />
            <KpiCard
              label="Usos de promociones"
              value={String(facts?.promoUses ?? 0)}
              caption={facts?.promoUses ? `Descuento ${formatMoney(facts.promoDiscount)}` : "Sin usos"}
            />
          </div>
        </>
      ) : null}
      <Card title="Enlace con UTM">
        <p className="text-sm text-muted">
          utm_source={c.utmSource} · utm_medium={c.utmMedium} · utm_campaign={c.utmCampaign}
        </p>
        <UtmBuilder campaign={c} />
      </Card>
      <Card title="Gasto">
        <p className="text-sm text-muted">{MARKETING_COPY.spendNote}</p>
        {!spend.ok ? (
          <EmptyState title={spend.error.message} />
        ) : spend.data.length === 0 ? (
          <p className="text-sm">Sin gasto registrado.</p>
        ) : (
          <ul className="flex flex-col gap-sm" data-testid="spend-list">
            {spend.data.map((s) => (
              <li key={s.id} className="flex flex-col gap-xs border-b border-border pb-sm">
                <div className="flex flex-wrap items-center gap-sm text-sm">
                  <span className={s.voidedAt ? "line-through" : "font-medium"}>{formatMoney(s.amount)}</span>
                  <span>{s.spentOn}</span>
                  <Badge label={CAMPAIGN_CHANNEL_LABELS[s.channel]} tone="neutral" />
                  {s.expenseFolio ? (
                    <Badge label={`Egreso ${s.expenseFolio}`} tone="info" />
                  ) : (
                    <Badge label="Sin egreso" tone="warning" />
                  )}
                  {s.voidedAt ? <Badge label={`Anulado: ${s.voidReason}`} tone="danger" /> : null}
                </div>
                {s.note ? <p className="text-sm text-muted">{s.note}</p> : null}
                {c.canManage && !s.voidedAt ? <VoidSpendForm campaignId={c.id} spendId={s.id} /> : null}
              </li>
            ))}
          </ul>
        )}
        {c.canManage ? (
          <SpendForm
            campaignId={c.id}
            expenses={(expenses?.ok ? expenses.data : []).map((e) => ({ value: e.id, label: e.label }))}
            today={today}
          />
        ) : null}
      </Card>
      <Card title="Promociones de la campaña">
        {myPromos.length === 0 ? (
          <p className="text-sm">
            Sin promociones.{" "}
            <Link href="/comercial/promociones" className="underline">
              Promociones
            </Link>
          </p>
        ) : (
          <ul className="flex flex-col gap-xs text-sm" data-testid="campaign-promotions">
            {myPromos.map((p) => (
              <li key={p.id}>
                <span className="font-medium">{p.code}</span> · {p.name} ·{" "}
                {PROMOTION_STATE_LABELS[promotionState(p, today)]} · {p.uses} usos
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Publicaciones">
        {!posts.ok || posts.data.length === 0 ? (
          <p className="text-sm">
            Sin publicaciones.{" "}
            <Link href="/comercial/calendario" className="underline">
              Calendario
            </Link>
          </p>
        ) : (
          <ul className="flex flex-col gap-xs text-sm">
            {posts.data.map((p) => (
              <li key={p.id}>
                {p.plannedAt.slice(0, 10)} · {p.title} · {CONTENT_STATUS_LABELS[p.status]}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {c.canManage ? (
        <details>
          <summary className="cursor-pointer text-sm underline">Editar campaña</summary>
          <Card>
            <CampaignForm campaign={c} centers={centers} today={today} />
          </Card>
        </details>
      ) : null}
    </AppShell>
  );
}

function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 864e5).toISOString().slice(0, 10);
}
