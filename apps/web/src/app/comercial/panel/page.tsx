import {
  COMMERCIAL_COPY,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  PANEL_COPY,
  PANEL_ORIGIN_LABELS,
  PILOT_PERIODS,
  activeCenterAccess,
  canInCenter,
  formatMoney,
  todayIn,
} from "@meguiars/domain";
import {
  createCatalogRepository,
  createCommercialRepository,
  createMarketingRepository,
} from "@meguiars/supabase";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, KpiCard, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { commercialCenters } from "@/lib/commercial";
import { loadCommercialPanel } from "@/lib/commercial-panel";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

/** Panel comercial y de marketing con filtros, fórmulas, origen del dato y modelo de atribución. */
export default async function CommercialPanelPage({ searchParams }: PageProps<"/comercial/panel">) {
  const state = await requireScreen("commercialPanel");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const periodId = str(params.periodo) ?? "30";
  const scope = params.alcance === "todos" ? "todos" : "centro";
  const all = commercialCenters(state, "commercial.metrics.read");
  const centers = scope === "todos" ? all : all.filter((c) => c.id === center.id);
  const filter = {
    channel: str(params.canal),
    campaignId: str(params.campana),
    serviceId: str(params.servicio),
    ownerId: str(params.responsable),
  };
  const supabase = (await createSupabaseServerClient())!;
  const commercial = createCommercialRepository(supabase);
  const marketing = createMarketingRepository(supabase);
  const canLeads = canInCenter(state, center.id, "leads.use");
  const [panel, campaigns, catalog, owners] = await Promise.all([
    loadCommercialPanel(
      commercial,
      marketing,
      center.organizationId,
      centers.map((c) => c.id),
      periodId,
      todayIn(center.timezone),
      filter,
    ),
    marketing.campaigns(center.organizationId),
    createCatalogRepository(supabase).listForCenter(center.id),
    canLeads ? commercial.leadOwners(center.id) : Promise.resolve(null),
  ]);
  return (
    <AppShell
      state={state}
      screen="commercialPanel"
      title={PANEL_COPY.title}
      description={centers.map((c) => c.name).join(" · ")}
    >
      <form method="get" className="grid gap-md md:grid-cols-3 xl:grid-cols-6" data-testid="panel-filters">
        <label className="mg-field">
          <span className="mg-label">Periodo</span>
          <select className="mg-input" name="periodo" defaultValue={panel.period.id}>
            {PILOT_PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="mg-field">
          <span className="mg-label">Canal</span>
          <select className="mg-input" name="canal" defaultValue={filter.channel ?? ""}>
            <option value="">Todos</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {LEAD_SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="mg-field">
          <span className="mg-label">Campaña</span>
          <select className="mg-input" name="campana" defaultValue={filter.campaignId ?? ""}>
            <option value="">Todas</option>
            {(campaigns.ok ? campaigns.data : []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mg-field">
          <span className="mg-label">Servicio</span>
          <select className="mg-input" name="servicio" defaultValue={filter.serviceId ?? ""}>
            <option value="">Todos</option>
            {(catalog.ok ? catalog.data : []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {owners?.ok ? (
          <label className="mg-field">
            <span className="mg-label">Responsable</span>
            <select className="mg-input" name="responsable" defaultValue={filter.ownerId ?? ""}>
              <option value="">Todos</option>
              {owners.data.map((o) => (
                <option key={o.userId} value={o.userId}>
                  {o.fullName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {all.length > 1 ? (
          <label className="mg-field">
            <span className="mg-label">Centros</span>
            <select className="mg-input" name="alcance" defaultValue={scope}>
              <option value="centro">Centro activo</option>
              <option value="todos">Todos mis centros</option>
            </select>
          </label>
        ) : null}
        <div className="flex items-end">
          <Button type="submit" variant="secondary" label="Aplicar filtros" />
        </div>
      </form>
      <p className="text-sm text-muted">
        Del {panel.period.from} al {panel.period.to}. {PANEL_COPY.attribution}
      </p>
      {panel.error ? <EmptyState title="No se pudo calcular el panel" message={panel.error} /> : null}
      <div className="grid gap-md md:grid-cols-3 xl:grid-cols-5" data-testid="panel-kpis">
        {panel.kpis.map((k) => (
          <div key={k.id} className="flex flex-col gap-xs">
            <KpiCard label={k.name} value={k.display} caption={k.formula} />
            <Badge
              label={PANEL_ORIGIN_LABELS[k.origin]}
              tone={k.origin === "manual" ? "warning" : "neutral"}
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted" data-testid="panel-notes">
        {PANEL_COPY.roasNote} {PANEL_COPY.providerNote}{" "}
        {filter.serviceId || filter.ownerId ? PANEL_COPY.spendNotSeparable : ""}
      </p>
      {panel.spend ? (
        <p className="text-sm text-muted" data-testid="panel-spend-origin">
          Inversión ligada a egresos: {panel.spend.egreso ? formatMoney(panel.spend.egreso) : "—"} · capturada
          a mano: {panel.spend.manual ? formatMoney(panel.spend.manual) : "—"}
        </p>
      ) : null}
      <Card title="Prospectos por etapa">
        {panel.stages.length === 0 ? (
          <p className="text-sm text-muted">{COMMERCIAL_COPY.noData}</p>
        ) : (
          <ul className="flex flex-wrap gap-sm text-sm" data-testid="panel-stages">
            {panel.stages.map((s) => (
              <li key={s.stage}>
                <Badge label={`${s.stage}: ${s.leads}`} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Por canal">
        <Table
          caption="Canal"
          rows={panel.channels}
          rowKey={(r) => r.channel}
          emptyMessage={COMMERCIAL_COPY.noData}
          columns={[
            {
              key: "channel",
              header: "Canal",
              value: (r) => LEAD_SOURCE_LABELS[r.channel as keyof typeof LEAD_SOURCE_LABELS] ?? r.channel,
            },
            { key: "leads", header: "Prospectos", align: "end", value: (r) => String(r.leads) },
            { key: "booked", header: "Reservaron", align: "end", value: (r) => String(r.booked) },
            { key: "won", header: "Compraron", align: "end", value: (r) => String(r.won) },
            { key: "revenue", header: "Ingresos atribuidos", align: "end", value: (r) => r.revenueLabel },
            { key: "spend", header: "Inversión", align: "end", value: (r) => r.spendLabel },
          ]}
        />
      </Card>
    </AppShell>
  );
}
