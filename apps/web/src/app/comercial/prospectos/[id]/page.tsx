import {
  canInCenter,
  COMMERCIAL_COPY,
  commercialErrorMessage,
  formatDateOnly,
  formatInCenterTimeZone,
  formatMoney,
  LEAD_CONSENT_LABELS,
  LEAD_CONTACT_CHANNEL_LABELS,
  LEAD_EVENT_LABELS,
  LEAD_TASK_KIND_LABELS,
  newRequestId,
  presentLead,
  presentQuote,
  usableCenters,
} from "@meguiars/domain";
import {
  createCatalogRepository,
  createCommercialRepository,
  createMarketingRepository,
} from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { LeadCampaignForm } from "@/components/marketing-forms";
import {
  CompleteLeadTaskButton,
  EditLeadForm,
  LeadContactForm,
  LeadNoteForm,
  LeadTaskForm,
  LinkClientForm,
  LoseLeadForm,
  MoveLeadForm,
  ReopenLeadForm,
  WinLeadForm,
} from "@/components/commercial-forms";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Ficha del prospecto: contacto, etapa, cotizaciones, tareas, cliente ligado e historial. */
export default async function LeadPage({ params, searchParams }: PageProps<"/comercial/prospectos/[id]">) {
  const state = await requireScreen("leadDetail");
  const { id } = await params;
  const query = await searchParams;
  const supabase = (await createSupabaseServerClient())!;
  const repo = createCommercialRepository(supabase);
  const centers = usableCenters(state.access).map((a) => a.center);
  const result = await repo.lead(
    id,
    centers.map((c) => c.id),
  );
  if (!result.ok) {
    return (
      <AppShell state={state} screen="leadDetail" title={COMMERCIAL_COPY.leadsTitle}>
        <Link href="/comercial/prospectos" className="text-sm underline">
          ← {COMMERCIAL_COPY.leadsTitle}
        </Link>
        <EmptyState title="Prospecto no encontrado" message={commercialErrorMessage(result.error)} />
      </AppShell>
    );
  }
  const lead = result.data;
  const view = presentLead(lead);
  const center = centers.find((c) => c.id === lead.detailCenterId)!;
  const organizationId = center.organizationId;
  const marketing = createMarketingRepository(supabase);
  const [campaignId, campaignList] = await Promise.all([
    marketing.leadCampaignId(lead.id),
    marketing.campaigns(organizationId),
  ]);
  const campaignOptions = (campaignList.ok ? campaignList.data : [])
    .filter(
      (c) =>
        (c.detailCenterId === null || c.detailCenterId === lead.detailCenterId) && c.status !== "cancelada",
    )
    .map((c) => ({ value: c.id, label: c.name }));
  const [timeline, tasks, stages, owners, quotes, catalog, matches, orders] = await Promise.all([
    repo.leadTimeline(lead.id),
    repo.leadTasks(lead.id),
    repo.stages(organizationId),
    repo.leadOwners(lead.detailCenterId),
    repo.quotes([lead.detailCenterId], { leadId: lead.id }),
    createCatalogRepository(supabase).listForCenter(lead.detailCenterId),
    lead.clientId
      ? Promise.resolve(null)
      : repo.leadMatches(lead.detailCenterId, lead.phone ?? undefined, lead.email ?? undefined, lead.id),
    lead.clientId && lead.status === "abierta"
      ? supabase
          .from("service_orders")
          .select("id, folio, total, delivered_at")
          .eq("client_id", lead.clientId)
          .eq("status", "entregada")
          .order("delivered_at", { ascending: false })
          .limit(20)
      : Promise.resolve(null),
  ]);
  const canWrite = canInCenter(state, lead.detailCenterId, "leads.use");
  const open = lead.status === "abierta";
  const stageList = stages.ok ? stages.data : [];
  const ownerList = owners.ok ? owners.data : [];
  const clientMatches = matches && matches.ok ? matches.data.filter((m) => m.kind === "cliente") : [];
  const leadMatches = matches && matches.ok ? matches.data.filter((m) => m.kind === "prospecto") : [];
  const orderOptions = (orders?.data ?? []).map((o) => ({
    value: o.id,
    label: `${o.folio} · ${formatMoney(Number(o.total))}`,
  }));

  return (
    <AppShell
      state={state}
      screen="leadDetail"
      title={lead.fullName}
      description={`${view.sourceLabel} · ${lead.centerName}`}
    >
      <Link href="/comercial/prospectos" className="text-sm underline">
        ← {COMMERCIAL_COPY.leadsTitle}
      </Link>
      {query.cliente === "1" ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
          Cliente registrado y ligado al prospecto. Ya puedes cotizar con su vehículo y reservar.
        </p>
      ) : null}
      {query.nuevo === "1" ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
          Prospecto registrado. Registra el primer contacto en cuanto le respondas.
        </p>
      ) : null}

      <Card
        title={lead.fullName}
        subtitle={`${view.contact} · ${lead.centerName}`}
        actions={<Badge label={open ? lead.stageName : view.statusLabel} tone={view.statusTone} />}
      >
        <dl className="grid gap-sm text-sm md:grid-cols-2" data-testid="lead-summary">
          <div>
            <dt className="text-muted">Canal de origen</dt>
            <dd>
              {view.sourceLabel}
              {lead.sourceDetail ? ` · ${lead.sourceDetail}` : ""}
              {lead.referredByName ? ` · recomendó ${lead.referredByName}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Servicios de interés</dt>
            <dd>{view.interestLabel}</dd>
          </div>
          <div>
            <dt className="text-muted">Primera respuesta</dt>
            <dd>{view.firstResponse}</dd>
          </div>
          <div>
            <dt className="text-muted">Responsable</dt>
            <dd>{lead.ownerName ?? "Sin asignar"}</dd>
          </div>
          {open ? (
            <div>
              <dt className="text-muted">Siguiente acción</dt>
              <dd className="flex flex-wrap items-center gap-xs">
                {view.nextActionLabel ? (
                  <Badge label={view.nextActionLabel} tone={view.nextActionTone ?? "neutral"} />
                ) : null}
                {lead.nextAction
                  ? `${lead.nextAction}${lead.nextActionOn ? ` · ${formatDateOnly(lead.nextActionOn)}` : ""}`
                  : null}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-muted">Promociones</dt>
            <dd>
              {lead.consentChannels.length
                ? lead.consentChannels.map((c) => LEAD_CONSENT_LABELS[c]).join(", ")
                : "Sin consentimiento"}
            </dd>
          </div>
          {lead.vehicleDescription ? (
            <div>
              <dt className="text-muted">Vehículo</dt>
              <dd>{lead.vehicleDescription}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-muted">Cliente</dt>
            <dd>
              {lead.clientId ? (
                <Link href={`/comercial/clientes/${lead.clientId}`} className="underline">
                  {lead.clientName}
                </Link>
              ) : (
                "Aún no es cliente registrado"
              )}
            </dd>
          </div>
          {lead.notes ? (
            <div className="md:col-span-2">
              <dt className="text-muted">Notas</dt>
              <dd>{lead.notes}</dd>
            </div>
          ) : null}
        </dl>
        {lead.status === "ganada" ? (
          <p className="mt-md text-sm font-medium" data-testid="lead-won">
            Compró: {view.wonLabel}
            {lead.serviceOrderFolio ? (
              <>
                {" "}
                ·{" "}
                <Link href={`/ordenes/${lead.serviceOrderId}`} className="underline">
                  {lead.serviceOrderFolio}
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
        {lead.status === "perdida" ? (
          <p className="mt-md text-sm font-medium">
            Perdido: {view.lossLabel}
            {lead.lossNotes ? ` · ${lead.lossNotes}` : ""}
          </p>
        ) : null}
      </Card>

      {canWrite && open ? (
        <Card title="Seguimiento">
          <div className="flex flex-col gap-md">
            <LeadContactForm lead={lead} />
            <MoveLeadForm lead={lead} stages={stageList} />
            {campaignOptions.length ? (
              <LeadCampaignForm
                leadId={lead.id}
                version={lead.version}
                campaignId={campaignId.ok ? campaignId.data : null}
                campaigns={campaignOptions}
              />
            ) : null}
            <div className="flex flex-wrap gap-sm">
              <ButtonLink
                href={`/comercial/cotizaciones/nueva?prospecto=${lead.id}`}
                label={COMMERCIAL_COPY.newQuote}
              />
              {!lead.clientId ? (
                <ButtonLink
                  href={`/clientes/nuevo?prospecto=${lead.id}`}
                  label="Registrar como cliente"
                  variant="secondary"
                />
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      {canWrite && open && !lead.clientId ? (
        <Card title={COMMERCIAL_COPY.matchesTitle}>
          <p className="text-sm text-muted">{COMMERCIAL_COPY.matchesHint}</p>
          {clientMatches.length === 0 && leadMatches.length === 0 ? (
            <p className="mt-sm text-sm">Sin coincidencias por teléfono o email.</p>
          ) : (
            <div className="mt-sm flex flex-col gap-sm" data-testid="lead-client-matches">
              {leadMatches.map((m) => (
                <p key={m.id} className="text-sm">
                  Otro prospecto abierto:{" "}
                  <Link href={`/comercial/prospectos/${m.id}`} className="underline">
                    {m.displayName}
                  </Link>{" "}
                  ({m.detail})
                </p>
              ))}
              <LinkClientForm
                lead={lead}
                clients={clientMatches.map((m) => ({ value: m.id, label: `${m.displayName} · ${m.detail}` }))}
              />
            </div>
          )}
        </Card>
      ) : null}

      <Card title="Cotizaciones">
        {!quotes.ok ? (
          <p role="alert" className="text-sm">
            {commercialErrorMessage(quotes.error)}
          </p>
        ) : quotes.data.length === 0 ? (
          <p className="text-sm text-muted">Sin cotizaciones.</p>
        ) : (
          <ul className="flex flex-col gap-xs" data-testid="lead-quotes">
            {quotes.data.map(presentQuote).map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-xs text-sm">
                <Link href={`/comercial/cotizaciones/${q.id}`} className="font-medium underline">
                  {q.folio}
                </Link>
                · {formatMoney(q.total)}
                <Badge label={q.statusLabel} tone={q.statusTone} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canWrite && open && lead.clientId ? (
        <details className="mg-card">
          <summary className="cursor-pointer font-medium">Atribuir una venta ya entregada</summary>
          <p className="mt-sm text-sm text-muted">
            Si compró sin reservar desde la cotización, elige su OS entregada. Una venta se atribuye a un solo
            prospecto.
          </p>
          <div className="mt-sm">
            <WinLeadForm lead={lead} orders={orderOptions} />
          </div>
        </details>
      ) : null}

      <Card title="Tareas y recordatorios">
        {!tasks.ok ? (
          <p role="alert" className="text-sm">
            {commercialErrorMessage(tasks.error)}
          </p>
        ) : tasks.data.length === 0 ? (
          <p className="text-sm text-muted">Sin tareas.</p>
        ) : (
          <ul className="flex flex-col gap-sm">
            {tasks.data.map((t) => (
              <li
                key={t.id}
                className="flex flex-col gap-xs border-b border-border pb-sm text-sm"
                data-testid="lead-task"
              >
                <span className="flex flex-wrap items-center gap-xs">
                  <strong>{LEAD_TASK_KIND_LABELS[t.kind]}</strong> · {formatDateOnly(t.dueOn)}
                  <Badge
                    label={
                      t.status === "pendiente"
                        ? t.dueOn < lead.today
                          ? "Vencida"
                          : "Pendiente"
                        : t.status === "hecha"
                          ? "Hecha"
                          : "Cancelada"
                    }
                    tone={t.status !== "pendiente" ? "neutral" : t.dueOn < lead.today ? "danger" : "info"}
                  />
                </span>
                {t.notes ? <span className="text-muted">{t.notes}</span> : null}
                {canWrite && t.status === "pendiente" ? (
                  <CompleteLeadTaskButton leadId={lead.id} taskId={t.id} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canWrite && open ? (
          <div className="mt-md">
            <LeadTaskForm leadId={lead.id} requestId={newRequestId()} today={lead.today} owners={ownerList} />
          </div>
        ) : null}
      </Card>

      {canWrite && open ? (
        <>
          <details className="mg-card">
            <summary className="cursor-pointer font-medium">Editar datos</summary>
            <div className="mt-sm">
              <EditLeadForm
                lead={lead}
                services={(catalog.ok ? catalog.data : []).map((s) => ({ value: s.id, label: s.name }))}
                owners={ownerList}
              />
            </div>
          </details>
          <details className="mg-card">
            <summary className="cursor-pointer font-medium">Marcar como perdido</summary>
            <div className="mt-sm">
              <LoseLeadForm lead={lead} />
            </div>
          </details>
        </>
      ) : null}
      {canWrite && lead.status === "perdida" ? (
        <Card title="Reabrir">
          <ReopenLeadForm lead={lead} stages={stageList} />
        </Card>
      ) : null}

      <Card title="Historial">
        {canWrite ? <LeadNoteForm leadId={lead.id} /> : null}
        {!timeline.ok ? (
          <p role="alert" className="text-sm">
            {commercialErrorMessage(timeline.error)}
          </p>
        ) : (
          <ol className="mt-md flex flex-col gap-sm" data-testid="lead-history">
            {timeline.data.map((e) => (
              <li key={e.seq} className="flex flex-col gap-xxs border-b border-border pb-sm text-sm">
                <span>
                  <strong>{LEAD_EVENT_LABELS[e.kind]}</strong>
                  {e.fromStageName || e.toStageName
                    ? ` · ${e.fromStageName ?? "—"} → ${e.toStageName ?? "—"}`
                    : ""}
                  {e.channel ? ` · ${LEAD_CONTACT_CHANNEL_LABELS[e.channel]}` : ""}
                  {e.value != null ? ` · ${formatMoney(e.value)}` : ""}
                  {e.quoteFolio ? ` · ${e.quoteFolio}` : ""}
                  {e.serviceOrderFolio ? ` · ${e.serviceOrderFolio}` : ""}
                </span>
                {e.note ? <span>{e.note}</span> : null}
                <span className="text-xs text-muted">
                  {e.actorName ?? "Sistema"} · {formatInCenterTimeZone(e.occurredAt, center.timezone)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </AppShell>
  );
}
