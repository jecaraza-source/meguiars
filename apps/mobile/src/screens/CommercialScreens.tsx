import {
  activeCenterAccess,
  canInCenter,
  COMMERCIAL_COPY,
  commercialErrorMessage,
  DUPLICATE_MATCH_LABELS,
  estimateQuote,
  formatDateOnly,
  formatMoney,
  INTEGRATION_STATUS_LABELS,
  INTEGRATIONS,
  integrationState,
  LEAD_CONSENT_CHANNELS,
  LEAD_CONSENT_LABELS,
  LEAD_CONTACT_CHANNEL_LABELS,
  LEAD_CONTACT_CHANNELS,
  LEAD_EVENT_LABELS,
  LEAD_LOSS_REASON_LABELS,
  LEAD_LOSS_REASONS,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  LEAD_STATUS_LABELS,
  marginPct,
  newRequestId,
  PILOT_PERIODS,
  presentLead,
  presentQuote,
  QUOTE_STATUS_ACTIONS,
  quoteShareText,
  todayIn,
  usableCenters,
  zonedToUtc,
  type CatalogItem,
  type ChannelAccount,
  type DuplicatePair,
  type Lead,
  type LeadConsentChannel,
  type LeadContactChannel,
  type LeadEvent,
  type LeadLossReason,
  type LeadOwner,
  type LeadSource,
  type LeadStage,
  type LeadStatus,
  type Quote,
  type SegmentRow,
  type ViewState,
} from "@meguiars/domain";
import {
  createCatalogRepository,
  createClientRepository,
  createCommercialRepository,
  createInboxRepository,
} from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { commercialCenters, loadCommercialReport, loadLeadsBoard } from "@/lib/commercial";
import { Button, Checkbox, Field, LinkButton, Select } from "@/ui/controls";
import { Badge, Card, EmptyState, KpiCard, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import { ApplyPromotionCard } from "./MarketingScreens";
import type { PrivateScreenProps } from "./types";

type Board = Awaited<ReturnType<typeof loadLeadsBoard>>;
type Report = Awaited<ReturnType<typeof loadCommercialReport>>;

/** Prospectos por etapa (equivale a /comercial/prospectos en web). */
export function LeadsScreen({
  state,
  header,
  subnav,
  onOpen,
  onNew,
  onQuotes,
  onReports,
}: PrivateScreenProps & {
  onOpen: (id: string) => void;
  onNew: () => void;
  onQuotes: () => void;
  onReports: () => void;
}) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [status, setStatus] = useState<LeadStatus>("abierta");
  const [source, setSource] = useState<LeadSource | "">("");
  const [mine, setMine] = useState(false);
  const [data, setData] = useState<ViewState<Board>>({ status: "loading" });

  useEffect(() => {
    if (!client) return;
    let active = true;
    void loadLeadsBoard(createCommercialRepository(client), center.organizationId, [center.id], {
      status,
      source: source || undefined,
      ownerId: mine ? state.user.id : undefined,
    }).then((b) => {
      if (!active) return;
      setData(b.error ? { status: "error", message: b.error } : { status: "ready", data: b });
    });
    return () => {
      active = false;
    };
  }, [client, center.id, center.organizationId, status, source, mine, state.user.id]);

  const canReports = canInCenter(state, center.id, "commercial.metrics.read");
  return (
    <Screen title={COMMERCIAL_COPY.leadsTitle} description={center.name} header={header}>
      {subnav}
      <Card>
        <View style={styles.stack}>
          <Button label={COMMERCIAL_COPY.newLead} onPress={onNew} />
          <Button label={COMMERCIAL_COPY.quotesTitle} variant="secondary" onPress={onQuotes} />
          {canReports ? (
            <Button label={COMMERCIAL_COPY.reportsTitle} variant="secondary" onPress={onReports} />
          ) : null}
          <Select
            label="Estado"
            options={(["abierta", "ganada", "perdida"] as const).map((s) => ({
              value: s,
              label: LEAD_STATUS_LABELS[s],
            }))}
            value={status}
            onChange={(v) => setStatus(v as LeadStatus)}
          />
          <Select
            label="Canal de origen"
            options={[
              { value: "", label: "Todos" },
              ...LEAD_SOURCES.map((s) => ({ value: s, label: LEAD_SOURCE_LABELS[s] })),
            ]}
            value={source}
            onChange={(v) => setSource(v as LeadSource | "")}
          />
          <Checkbox label="Sólo míos" checked={mine} onChange={setMine} />
        </View>
      </Card>
      {data.status === "loading" ? <Skeleton lines={5} label="Cargando prospectos" /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" ? (
        <>
          {status === "abierta" && data.data.counters ? (
            <>
              <KpiCard
                label="Sin contactar"
                value={String(data.data.counters.uncontacted)}
                caption="Responde primero a estos"
              />
              <KpiCard label="Acción vencida" value={String(data.data.counters.overdue)} />
            </>
          ) : null}
          {data.data.leads.length === 0 ? <EmptyState title={COMMERCIAL_COPY.leadsEmpty} /> : null}
          {status === "abierta"
            ? data.data.columns
                .filter((c) => c.stage.kind === "abierta" && c.leads.length > 0)
                .map((c) => (
                  <Card key={c.stage.id} title={`${c.stage.name} (${c.leads.length})`}>
                    <List
                      caption={c.stage.name}
                      rows={c.leads}
                      rowKey={(l) => l.id}
                      emptyMessage=""
                      onRowPress={(l) => onOpen(l.id)}
                      columns={[
                        { key: "name", header: "Prospecto", value: (l) => l.fullName },
                        { key: "source", header: "Canal", value: (l) => l.sourceLabel },
                        {
                          key: "state",
                          header: "Estado",
                          value: (l) =>
                            l.uncontacted ? "Sin contactar" : (l.nextActionLabel ?? "Contactado"),
                        },
                      ]}
                    />
                  </Card>
                ))
            : null}
          {status !== "abierta" && data.data.leads.length > 0 ? (
            <List
              caption="Prospectos cerrados"
              rows={data.data.leads}
              rowKey={(l) => l.id}
              emptyMessage=""
              onRowPress={(l) => onOpen(l.id)}
              columns={[
                { key: "name", header: "Prospecto", value: (l) => l.fullName },
                { key: "source", header: "Canal", value: (l) => l.sourceLabel },
                { key: "result", header: "Resultado", value: (l) => l.wonLabel ?? l.lossLabel ?? "—" },
              ]}
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

/** Registrar un prospecto (equivale a /comercial/prospectos/nuevo en web). */
export function LeadNewScreen({
  state,
  header,
  subnav,
  onCreated,
  onCancel,
}: PrivateScreenProps & { onCreated: (id: string) => void; onCancel: () => void }) {
  const { client } = useAuth();
  const toast = useToast();
  const center = activeCenterAccess(state)!.center;
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [owners, setOwners] = useState<LeadOwner[]>([]);
  const [form, setForm] = useState({
    fullName: "",
    source: "" as LeadSource | "",
    phone: "",
    email: "",
    socialHandle: "",
    sourceDetail: "",
    vehicleDescription: "",
    notes: "",
    nextAction: "",
    ownerId: state.user.id,
  });
  const [interest, setInterest] = useState<string[]>([]);
  const [consent, setConsent] = useState<LeadConsentChannel[]>([]);
  const [requestId] = useState(newRequestId());
  const [matches, setMatches] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!client) return;
    void createCatalogRepository(client)
      .listForCenter(center.id)
      .then((r) => r.ok && setCatalog(r.data));
    void createCommercialRepository(client)
      .leadOwners(center.id)
      .then((r) => r.ok && setOwners(r.data));
  }, [client, center.id]);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    if (!client) return;
    setBusy(true);
    setError(null);
    const repo = createCommercialRepository(client);
    if (!confirm && (form.phone || form.email)) {
      const m = await repo.leadMatches(center.id, form.phone || undefined, form.email || undefined);
      if (m.ok && m.data.length > 0) {
        setBusy(false);
        return setMatches(
          `Ya hay registros con ese teléfono o email: ${m.data.map((x) => `${x.displayName} (${x.detail})`).join("; ")}.`,
        );
      }
    }
    const r = await repo.createLead({
      detailCenterId: center.id,
      requestId,
      fullName: form.fullName,
      source: form.source as LeadSource,
      phone: form.phone || undefined,
      email: form.email || undefined,
      socialHandle: form.socialHandle || undefined,
      sourceDetail: form.sourceDetail || undefined,
      interestServiceIds: interest,
      vehicleDescription: form.vehicleDescription || undefined,
      notes: form.notes || undefined,
      consentChannels: consent,
      ownerId: owners.some((o) => o.userId === form.ownerId) ? form.ownerId : undefined,
      nextAction: form.nextAction || undefined,
    });
    setBusy(false);
    if (!r.ok) return setError(commercialErrorMessage(r.error));
    toast({ message: "Prospecto registrado", tone: "success" });
    onCreated(r.data.id);
  };

  return (
    <Screen title={COMMERCIAL_COPY.newLead} description={center.name} header={header}>
      {subnav}
      <LinkButton label="← Prospectos" onPress={onCancel} />
      <Card title="Datos de la consulta">
        <View style={styles.stack}>
          <Field label="Nombre" value={form.fullName} onChangeText={set("fullName")} />
          <Select
            label="Canal de origen"
            placeholder="¿Por dónde llegó?"
            options={LEAD_SOURCES.map((s) => ({ value: s, label: LEAD_SOURCE_LABELS[s] }))}
            value={form.source}
            onChange={set("source")}
          />
          <Field label="Teléfono" keyboardType="phone-pad" value={form.phone} onChangeText={set("phone")} />
          <Field
            label="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            value={form.email}
            onChangeText={set("email")}
          />
          <Field
            label="Usuario en redes"
            hint="@usuario"
            autoCapitalize="none"
            value={form.socialHandle}
            onChangeText={set("socialHandle")}
          />
          <Field
            label={form.source === "recomendacion" ? "¿Quién recomendó?" : "Detalle del origen"}
            value={form.sourceDetail}
            onChangeText={set("sourceDetail")}
          />
          <Field label="Vehículo" value={form.vehicleDescription} onChangeText={set("vehicleDescription")} />
          <Text style={textStyle("label")}>Servicios de interés</Text>
          {catalog.map((s) => (
            <Checkbox
              key={s.id}
              label={s.name}
              checked={interest.includes(s.id)}
              onChange={(on) => setInterest((xs) => (on ? [...xs, s.id] : xs.filter((x) => x !== s.id)))}
            />
          ))}
          <Text style={textStyle("label")}>Acepta promociones por</Text>
          {LEAD_CONSENT_CHANNELS.map((c) => (
            <Checkbox
              key={c}
              label={LEAD_CONSENT_LABELS[c]}
              checked={consent.includes(c)}
              onChange={(on) => setConsent((xs) => (on ? [...xs, c] : xs.filter((x) => x !== c)))}
            />
          ))}
          <Select
            label="Responsable"
            options={[
              { value: "", label: "Sin asignar" },
              ...owners.map((o) => ({ value: o.userId, label: o.fullName })),
            ]}
            value={owners.some((o) => o.userId === form.ownerId) ? form.ownerId : ""}
            onChange={set("ownerId")}
          />
          <Field label="Siguiente acción" value={form.nextAction} onChangeText={set("nextAction")} />
          <Field label="Notas" value={form.notes} onChangeText={set("notes")} multiline />
          {matches ? (
            <>
              <Notice text={matches} tone="warning" />
              <Checkbox
                label="Es otra persona: registrar de todos modos"
                checked={confirm}
                onChange={setConfirm}
              />
            </>
          ) : null}
          <Notice text={error} tone="danger" />
          <Button label={COMMERCIAL_COPY.newLead} loading={busy} onPress={() => void submit()} />
        </View>
      </Card>
    </Screen>
  );
}

interface LeadLoaded {
  lead: Lead;
  events: LeadEvent[];
  stages: LeadStage[];
  quotes: Quote[];
}

/** Ficha del prospecto (equivale a /comercial/prospectos/[id] en web). */
export function LeadScreen({
  state,
  header,
  subnav,
  leadId,
  onBack,
  onQuote,
  onNewQuote,
}: PrivateScreenProps & {
  leadId: string;
  onBack: () => void;
  onQuote: (id: string) => void;
  onNewQuote: (leadId: string) => void;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<ViewState<LeadLoaded>>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((x) => x + 1), []);
  const [channel, setChannel] = useState<LeadContactChannel>("whatsapp");
  const [note, setNote] = useState("");
  const [stageId, setStageId] = useState("");
  const [loss, setLoss] = useState<LeadLossReason | "">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const repo = createCommercialRepository(client);
    void repo
      .lead(
        leadId,
        usableCenters(state.access).map((a) => a.center.id),
      )
      .then(async (r) => {
        if (!active) return;
        if (!r.ok) return setData({ status: "error", message: commercialErrorMessage(r.error) });
        const center = usableCenters(state.access).find((a) => a.center.id === r.data.detailCenterId)!.center;
        const [events, stages, quotes] = await Promise.all([
          repo.leadTimeline(r.data.id),
          repo.stages(center.organizationId),
          repo.quotes([r.data.detailCenterId], { leadId: r.data.id }),
        ]);
        if (!active) return;
        setData({
          status: "ready",
          data: {
            lead: r.data,
            events: events.ok ? events.data : [],
            stages: stages.ok ? stages.data : [],
            quotes: quotes.ok ? quotes.data : [],
          },
        });
      });
    return () => {
      active = false;
    };
  }, [client, leadId, state.access, tick]);

  const run = async (
    fn: () => Promise<{ ok: boolean; error?: { kind: string; message: string } }>,
    done: string,
  ) => {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setError(commercialErrorMessage(r.error!));
    toast({ message: done, tone: "success" });
    setNote("");
    reload();
  };

  if (data.status !== "ready") {
    return (
      <Screen title={COMMERCIAL_COPY.leadsTitle} header={header}>
        {subnav}
        <LinkButton label="← Prospectos" onPress={onBack} />
        {data.status === "loading" ? (
          <Skeleton lines={5} />
        ) : (
          <EmptyState title={"message" in data ? data.message : COMMERCIAL_COPY.noData} />
        )}
      </Screen>
    );
  }
  const { lead, events, stages, quotes } = data.data;
  const view = presentLead(lead);
  const repo = createCommercialRepository(client!);
  const canWrite = canInCenter(state, lead.detailCenterId, "leads.use");
  const open = lead.status === "abierta";
  const moveOptions = stages.filter((s) => s.kind === "abierta" && s.active && s.id !== lead.stageId);

  return (
    <Screen title={lead.fullName} description={`${view.sourceLabel} · ${lead.centerName}`} header={header}>
      {subnav}
      <LinkButton label="← Prospectos" onPress={onBack} />
      <Card title={open ? lead.stageName : view.statusLabel} subtitle={view.contact}>
        <View style={styles.stack}>
          <Text style={textStyle("bodySmall")}>Interés: {view.interestLabel}</Text>
          <Text style={textStyle("bodySmall")}>Primera respuesta: {view.firstResponse}</Text>
          <Text style={textStyle("bodySmall")}>Responsable: {lead.ownerName ?? "Sin asignar"}</Text>
          {view.nextActionLabel ? (
            <Badge label={view.nextActionLabel} tone={view.nextActionTone ?? "neutral"} />
          ) : null}
          {lead.nextAction ? <Text style={textStyle("bodySmall")}>{lead.nextAction}</Text> : null}
          <Text style={textStyle("bodySmall")}>
            Cliente: {lead.clientName ?? "Aún no registrado (liga o registra en web)"}
          </Text>
          {lead.status === "ganada" ? <Text style={textStyle("label")}>Compró: {view.wonLabel}</Text> : null}
          {lead.status === "perdida" ? (
            <Text style={textStyle("label")}>Perdido: {view.lossLabel}</Text>
          ) : null}
        </View>
      </Card>
      {canWrite && open ? (
        <Card title="Seguimiento">
          <View style={styles.stack}>
            <Select
              label="Canal del contacto"
              options={LEAD_CONTACT_CHANNELS.map((c) => ({
                value: c,
                label: LEAD_CONTACT_CHANNEL_LABELS[c],
              }))}
              value={channel}
              onChange={(v) => setChannel(v as LeadContactChannel)}
            />
            <Field label="¿Qué pasó?" value={note} onChangeText={setNote} />
            <Button
              label="Registrar contacto"
              loading={busy}
              onPress={() =>
                void run(
                  () => repo.logContact(lead.id, lead.version, channel, note || undefined),
                  "Contacto registrado",
                )
              }
            />
            {moveOptions.length > 0 ? (
              <>
                <Select
                  label="Mover a"
                  options={moveOptions.map((s) => ({ value: s.id, label: s.name }))}
                  value={stageId}
                  onChange={setStageId}
                />
                <Button
                  label="Mover"
                  variant="secondary"
                  disabled={!stageId}
                  onPress={() =>
                    void run(
                      () => repo.moveLead(lead.id, lead.version, stageId, note || undefined),
                      "Etapa actualizada",
                    )
                  }
                />
              </>
            ) : null}
            <Button
              label={COMMERCIAL_COPY.newQuote}
              variant="secondary"
              onPress={() => onNewQuote(lead.id)}
            />
            <Select
              label="Marcar como perdido"
              placeholder="Motivo"
              options={LEAD_LOSS_REASONS.map((r) => ({ value: r, label: LEAD_LOSS_REASON_LABELS[r] }))}
              value={loss}
              onChange={(v) => setLoss(v as LeadLossReason)}
            />
            {loss ? (
              <Button
                label="Confirmar pérdida"
                variant="secondary"
                onPress={() =>
                  void run(
                    () => repo.loseLead(lead.id, lead.version, loss, note || undefined),
                    "Prospecto perdido",
                  )
                }
              />
            ) : null}
            <Notice text={error} tone="danger" />
          </View>
        </Card>
      ) : null}
      <Card title="Cotizaciones">
        {quotes.length === 0 ? (
          <Text style={textStyle("bodySmall", "muted")}>Sin cotizaciones.</Text>
        ) : (
          <List
            caption="Cotizaciones"
            rows={quotes.map(presentQuote)}
            rowKey={(q) => q.id}
            emptyMessage=""
            onRowPress={(q) => onQuote(q.id)}
            columns={[
              { key: "folio", header: "Folio", value: (q) => q.folio },
              { key: "total", header: "Total", value: (q) => formatMoney(q.total) },
              { key: "status", header: "Estado", value: (q) => q.statusLabel },
            ]}
          />
        )}
      </Card>
      <Card title="Historial">
        {events.map((e) => (
          <View key={e.seq} style={styles.event}>
            <Text style={textStyle("label")}>
              {LEAD_EVENT_LABELS[e.kind]}
              {e.toStageName ? ` · ${e.toStageName}` : ""}
              {e.quoteFolio ? ` · ${e.quoteFolio}` : ""}
            </Text>
            {e.note ? <Text style={textStyle("bodySmall")}>{e.note}</Text> : null}
            <Text style={textStyle("caption", "muted")}>
              {e.actorName ?? "Sistema"} · {e.occurredAt.slice(0, 16).replace("T", " ")}
            </Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

/** Cotizaciones del centro (equivale a /comercial/cotizaciones en web). */
export function QuotesScreen({
  state,
  header,
  subnav,
  onOpen,
}: PrivateScreenProps & { onOpen: (id: string) => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [data, setData] = useState<ViewState<Quote[]>>({ status: "loading" });
  useEffect(() => {
    if (!client) return;
    let active = true;
    void createCommercialRepository(client)
      .quotes([center.id])
      .then((r) => {
        if (!active) return;
        setData(
          r.ok
            ? { status: "ready", data: r.data }
            : { status: "error", message: commercialErrorMessage(r.error) },
        );
      });
    return () => {
      active = false;
    };
  }, [client, center.id]);
  return (
    <Screen title={COMMERCIAL_COPY.quotesTitle} description={center.name} header={header}>
      {subnav}
      {data.status === "loading" ? <Skeleton lines={4} /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" ? (
        <List
          caption={COMMERCIAL_COPY.quotesTitle}
          rows={data.data.map(presentQuote)}
          rowKey={(q) => q.id}
          emptyMessage={COMMERCIAL_COPY.quotesEmpty}
          onRowPress={(q) => onOpen(q.id)}
          columns={[
            { key: "folio", header: "Folio", value: (q) => q.folio },
            { key: "who", header: "Para", value: (q) => q.who },
            { key: "status", header: "Estado", value: (q) => q.statusLabel },
            { key: "total", header: "Total", value: (q) => formatMoney(q.total) },
            { key: "margin", header: "Margen", value: (q) => q.marginLabel },
          ]}
        />
      ) : null}
    </Screen>
  );
}

/** Nueva cotización para un prospecto o cliente (equivale a /comercial/cotizaciones/nueva). */
export function QuoteNewScreen({
  state,
  header,
  subnav,
  leadId,
  clientId,
  onCreated,
  onCancel,
}: PrivateScreenProps & {
  leadId?: string | undefined;
  clientId?: string | undefined;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [requestId] = useState(newRequestId());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!client) return;
    void createCatalogRepository(client)
      .listForCenter(center.id)
      .then((r) => r.ok && setCatalog(r.data));
    if (leadId)
      void createCommercialRepository(client)
        .lead(leadId, [center.id])
        .then((r) => r.ok && setPicked(r.data.interestServiceIds));
  }, [client, center.id, leadId]);
  const estimate = useMemo(
    () =>
      estimateQuote(
        catalog
          .filter((c) => picked.includes(c.id))
          .map((c) => ({
            quantity: 1,
            unitPrice: c.price,
            unitDirectCost: c.directCost,
            operatorCommissionPct: c.operatorCommissionPct,
          })),
      ),
    [catalog, picked],
  );
  const pct = marginPct(estimate.contributionMargin, estimate.total);
  const submit = async () => {
    if (!client) return;
    setBusy(true);
    const r = await createCommercialRepository(client).createQuote({
      detailCenterId: center.id,
      requestId,
      items: picked.map((serviceId) => ({ serviceId, quantity: 1 })),
      leadId,
      clientId,
    });
    setBusy(false);
    if (!r.ok) return setError(commercialErrorMessage(r.error));
    onCreated(r.data.id);
  };
  return (
    <Screen title={COMMERCIAL_COPY.newQuote} description={center.name} header={header}>
      {subnav}
      <LinkButton label="← Volver" onPress={onCancel} />
      <Card title="Servicios">
        <View style={styles.stack}>
          {catalog.map((c) => (
            <Checkbox
              key={c.id}
              label={`${c.name} · ${formatMoney(c.price)}${c.operatorCommissionPct != null ? ` · operador ${c.operatorCommissionPct} %` : ""}`}
              checked={picked.includes(c.id)}
              onChange={(on) => setPicked((xs) => (on ? [...xs, c.id] : xs.filter((x) => x !== c.id)))}
            />
          ))}
          <KpiCard label="Total" value={formatMoney(estimate.total)} />
          <KpiCard
            label="Margen de contribución"
            value={`${formatMoney(estimate.contributionMargin)}${pct == null ? "" : ` (${pct} %)`}`}
            caption={`Otros costos ${formatMoney(estimate.standardCostTotal)} + operador ${formatMoney(estimate.operatorPayTotal)}`}
          />
          <Text style={textStyle("caption", "muted")}>{COMMERCIAL_COPY.marginNote}</Text>
          <Notice text={error} tone="danger" />
          <Button
            label={COMMERCIAL_COPY.newQuote}
            loading={busy}
            disabled={picked.length === 0}
            onPress={() => void submit()}
          />
        </View>
      </Card>
    </Screen>
  );
}

/** Cotización: estado, descuentos, compartir y reservar (equivale a /comercial/cotizaciones/[id]). */
export function QuoteScreen({
  state,
  header,
  subnav,
  quoteId,
  onBack,
}: PrivateScreenProps & { quoteId: string; onBack: () => void }) {
  const { client } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<ViewState<{ quote: Quote; vehicles: { value: string; label: string }[] }>>(
    {
      status: "loading",
    },
  );
  const [tick, setTick] = useState(0);
  const [discount, setDiscount] = useState({
    kind: "percent" as "percent" | "amount",
    value: "",
    reason: "",
  });
  const [reason, setReason] = useState("");
  const [book, setBook] = useState({ date: "", time: "10:00", vehicleId: "" });
  const [requestId] = useState(newRequestId());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!client) return;
    let active = true;
    void createCommercialRepository(client)
      .quote(
        quoteId,
        usableCenters(state.access).map((a) => a.center.id),
      )
      .then(async (r) => {
        if (!active) return;
        if (!r.ok) return setData({ status: "error", message: commercialErrorMessage(r.error) });
        const c = r.data.clientId ? await createClientRepository(client).get(r.data.clientId) : null;
        if (!active) return;
        const vehicles = (c?.ok ? c.data.vehicles : [])
          .filter((v) => v.active)
          .map((v) => ({ value: v.id, label: `${v.make} ${v.model} · ${v.plate}` }));
        setData({ status: "ready", data: { quote: r.data, vehicles } });
        setBook((b) => ({ ...b, vehicleId: b.vehicleId || r.data.vehicleId || vehicles[0]?.value || "" }));
      });
    return () => {
      active = false;
    };
  }, [client, quoteId, state.access, tick]);

  if (data.status !== "ready") {
    return (
      <Screen title={COMMERCIAL_COPY.quotesTitle} header={header}>
        {subnav}
        <LinkButton label="← Volver" onPress={onBack} />
        {data.status === "loading" ? (
          <Skeleton lines={5} />
        ) : (
          <EmptyState title={"message" in data ? data.message : COMMERCIAL_COPY.noData} />
        )}
      </Screen>
    );
  }
  const q = presentQuote(data.data.quote);
  const center = usableCenters(state.access).find((a) => a.center.id === q.detailCenterId)!.center;
  const repo = createCommercialRepository(client!);
  const canWrite = canInCenter(state, q.detailCenterId, "leads.use");
  const today = todayIn(center.timezone);
  const run = async (
    fn: () => Promise<{ ok: boolean; error?: { kind: string; message: string } }>,
    done: string,
  ) => {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setError(commercialErrorMessage(r.error!));
    toast({ message: done, tone: "success" });
    setTick((x) => x + 1);
  };
  return (
    <Screen title={`Cotización ${q.folio}`} description={q.who} header={header}>
      {subnav}
      <LinkButton label="← Volver" onPress={onBack} />
      <Card title={q.statusLabel} subtitle={`Vigente hasta ${formatDateOnly(q.validUntil)}`}>
        <View style={styles.stack}>
          {q.items.map((i) => (
            <Text key={i.id} style={textStyle("bodySmall")}>
              {i.serviceName} × {i.quantity}: {formatMoney(i.lineSubtotal - i.lineDiscount)} · operador{" "}
              {formatMoney(i.operatorPay)}
            </Text>
          ))}
          <KpiCard
            label="Total"
            value={formatMoney(q.total)}
            caption={q.discountTotal ? `Descuentos −${formatMoney(q.discountTotal)}` : undefined}
          />
          <KpiCard
            label="Margen de contribución"
            value={q.marginLabel}
            caption={COMMERCIAL_COPY.marginNote}
          />
          {q.drift.length > 0 && q.status !== "convertida" ? (
            <Notice
              text={`${COMMERCIAL_COPY.priceDrift} ${q.drift.map((i) => i.serviceName).join(", ")}.`}
              tone="warning"
            />
          ) : null}
          {q.appointmentStartsAt ? (
            <Text style={textStyle("label")}>
              Reservada: {q.appointmentStartsAt.slice(0, 16).replace("T", " ")}
            </Text>
          ) : null}
        </View>
      </Card>
      <Card title="Compartir">
        <View style={styles.stack}>
          <Text style={textStyle("caption", "muted")}>{COMMERCIAL_COPY.noSocialSend}</Text>
          <Button
            label="Compartir texto"
            variant="secondary"
            onPress={() => void Share.share({ message: quoteShareText(data.data.quote, center.name) })}
          />
          {canWrite
            ? q.statusActions.map((s) =>
                s === "borrador" || s === "convertida" ? null : (
                  <Button
                    key={s}
                    label={QUOTE_STATUS_ACTIONS[s]}
                    variant={s === "aceptada" ? "primary" : "secondary"}
                    onPress={() =>
                      void run(
                        () => repo.setQuoteStatus(q.id, q.version, s, reason || undefined),
                        "Estado actualizado",
                      )
                    }
                  />
                ),
              )
            : null}
          {canWrite && q.statusActions.some((s) => s === "rechazada" || s === "cancelada") ? (
            <Field label="Motivo (para rechazar o cancelar)" value={reason} onChangeText={setReason} />
          ) : null}
        </View>
      </Card>
      {canWrite && q.editable ? (
        <ApplyPromotionCard
          target="quote"
          documentId={q.id}
          version={q.version}
          onApplied={() => setTick((x) => x + 1)}
        />
      ) : null}
      {canWrite && q.editable ? (
        <Card title="Descuento">
          <View style={styles.stack}>
            <Select
              label="Tipo"
              options={[
                { value: "percent", label: "Porcentaje" },
                { value: "amount", label: "Importe" },
              ]}
              value={discount.kind}
              onChange={(v) => setDiscount((d) => ({ ...d, kind: v as "percent" | "amount" }))}
            />
            <Field
              label="Valor"
              keyboardType="decimal-pad"
              value={discount.value}
              onChangeText={(v) => setDiscount((d) => ({ ...d, value: v }))}
            />
            <Field
              label="Motivo"
              value={discount.reason}
              onChangeText={(v) => setDiscount((d) => ({ ...d, reason: v }))}
            />
            <Button
              label="Aplicar descuento"
              variant="secondary"
              loading={busy}
              onPress={() =>
                void run(
                  () =>
                    repo.addQuoteDiscount({
                      quoteId: q.id,
                      version: q.version,
                      kind: discount.kind,
                      value: Number(discount.value),
                      reason: discount.reason,
                    }),
                  "Descuento aplicado",
                )
              }
            />
          </View>
        </Card>
      ) : null}
      {canWrite ? (
        <Card title={COMMERCIAL_COPY.book}>
          {q.bookingBlocker ? (
            <Text style={textStyle("bodySmall")}>{q.bookingBlocker}</Text>
          ) : (
            <View style={styles.stack}>
              <Field
                label="Fecha (AAAA-MM-DD)"
                placeholder={today}
                value={book.date}
                onChangeText={(v) => setBook((b) => ({ ...b, date: v }))}
              />
              <Field
                label="Hora (HH:MM)"
                value={book.time}
                onChangeText={(v) => setBook((b) => ({ ...b, time: v }))}
              />
              <Select
                label="Vehículo"
                options={data.data.vehicles}
                value={book.vehicleId}
                onChange={(v) => setBook((b) => ({ ...b, vehicleId: v }))}
              />
              <Text style={textStyle("caption", "muted")}>{COMMERCIAL_COPY.quotePriceHonored}</Text>
              <Button
                label={COMMERCIAL_COPY.book}
                loading={busy}
                disabled={!book.date || !book.vehicleId}
                onPress={() =>
                  void run(
                    () =>
                      repo.bookQuote({
                        quoteId: q.id,
                        version: q.version,
                        requestId,
                        startsAt: zonedToUtc(book.date, book.time, center.timezone),
                        vehicleId: book.vehicleId,
                      }),
                    "Reserva creada en la agenda",
                  )
                }
              />
            </View>
          )}
        </Card>
      ) : null}
      <Notice text={error} tone="danger" />
    </Screen>
  );
}

/** Reportes comerciales (equivale a /comercial/reportes en web). */
export function CommercialReportsScreen({ state, header, subnav }: PrivateScreenProps) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [periodId, setPeriodId] = useState("30");
  const [data, setData] = useState<ViewState<Report>>({ status: "loading" });
  useEffect(() => {
    if (!client) return;
    let active = true;
    const centers = commercialCenters(state, "commercial.metrics.read").filter((c) => c.id === center.id);
    void loadCommercialReport(
      createCommercialRepository(client),
      centers,
      periodId,
      todayIn(center.timezone),
    ).then((r) => {
      if (!active) return;
      setData(
        r.error && r.kpis.length === 0 ? { status: "error", message: r.error } : { status: "ready", data: r },
      );
    });
    return () => {
      active = false;
    };
  }, [client, center.id, center.timezone, periodId, state]);
  return (
    <Screen title={COMMERCIAL_COPY.reportsTitle} description={center.name} header={header}>
      {subnav}
      <Select
        label="Periodo"
        options={PILOT_PERIODS.map((p) => ({ value: p.id, label: p.label }))}
        value={periodId}
        onChange={setPeriodId}
      />
      {data.status === "loading" ? <Skeleton lines={6} /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" ? (
        <>
          <Text style={textStyle("caption", "muted")}>
            Cohorte de prospectos registrados del {data.data.period.from} al {data.data.period.to}; cada venta
            se atribuye una sola vez.
          </Text>
          {data.data.kpis.map((k) => (
            <KpiCard key={k.id} label={k.name} value={k.display} caption={k.formula} />
          ))}
          <Card title="Por canal de origen">
            <List
              caption="Por canal"
              rows={data.data.bySource}
              rowKey={(r) => r.key}
              emptyMessage={COMMERCIAL_COPY.noData}
              columns={[
                { key: "label", header: "Canal", value: (r) => r.label },
                { key: "leads", header: "Prospectos", value: (r) => String(r.leads) },
                { key: "conv", header: "→ reserva", value: (r) => r.leadToBookingLabel },
                { key: "sales", header: "Ventas", value: (r) => r.salesLabel },
              ]}
            />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

/** Segmentos predefinidos (la segmentación libre está en web). */
export function SegmentsScreen({ state, header, subnav }: PrivateScreenProps) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const presets = [
    {
      id: "inactivos",
      label: "Inactivos 90+ días con WhatsApp",
      filter: { minDaysSinceVisit: 90, consentChannel: "whatsapp" as const },
    },
    { id: "alto", label: "Alto gasto (≥ $5,000)", filter: { minSpend: 5000 } },
    { id: "recurrentes", label: "Recurrentes (3+ visitas)", filter: { minVisits: 3 } },
  ];
  const [preset, setPreset] = useState("inactivos");
  const [data, setData] = useState<ViewState<SegmentRow[]>>({ status: "loading" });
  useEffect(() => {
    if (!client) return;
    let active = true;
    const p = presets.find((x) => x.id === preset)!;
    void createCommercialRepository(client)
      .segment([center.id], p.filter)
      .then((r) => {
        if (!active) return;
        setData(
          r.ok
            ? { status: "ready", data: r.data }
            : { status: "error", message: commercialErrorMessage(r.error) },
        );
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, center.id, preset]);
  return (
    <Screen title={COMMERCIAL_COPY.segmentsTitle} description={center.name} header={header}>
      {subnav}
      <Select
        label="Segmento"
        options={presets.map((p) => ({ value: p.id, label: p.label }))}
        value={preset}
        onChange={setPreset}
      />
      {data.status === "loading" ? <Skeleton lines={4} /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" ? (
        <List
          caption="Clientes"
          rows={data.data}
          rowKey={(r) => r.clientId}
          emptyMessage="Ningún cliente cumple el segmento."
          columns={[
            { key: "name", header: "Cliente", value: (r) => r.fullName },
            { key: "visits", header: "Visitas", value: (r) => String(r.visits) },
            { key: "spend", header: "Gasto", value: (r) => formatMoney(r.totalSpend) },
            {
              key: "last",
              header: "Días sin visita",
              value: (r) => (r.daysSinceLastVisit == null ? "—" : String(r.daysSinceLastVisit)),
            },
          ]}
        />
      ) : null}
    </Screen>
  );
}

/** Duplicados (consulta); la fusión supervisada se hace en web. */
export function DuplicatesScreen({ state, header, subnav }: PrivateScreenProps) {
  const { client } = useAuth();
  const [data, setData] = useState<ViewState<DuplicatePair[]>>({ status: "loading" });
  useEffect(() => {
    if (!client) return;
    let active = true;
    void createCommercialRepository(client)
      .duplicates(commercialCenters(state, "clients.merge").map((c) => c.id))
      .then((r) => {
        if (!active) return;
        setData(
          r.ok
            ? { status: "ready", data: r.data }
            : { status: "error", message: commercialErrorMessage(r.error) },
        );
      });
    return () => {
      active = false;
    };
  }, [client, state]);
  return (
    <Screen title={COMMERCIAL_COPY.duplicatesTitle} header={header}>
      {subnav}
      <Notice text="Revisa aquí los pares; la fusión (con motivo) se hace en la web." />
      {data.status === "loading" ? <Skeleton lines={4} /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" ? (
        <List
          caption={COMMERCIAL_COPY.duplicatesTitle}
          rows={data.data}
          rowKey={(p) => `${p.a.clientId}-${p.b.clientId}`}
          emptyMessage={COMMERCIAL_COPY.duplicatesEmpty}
          columns={[
            { key: "a", header: "Cliente", value: (p) => `${p.a.name} (${p.a.orders} OS)` },
            { key: "b", header: "Posible duplicado", value: (p) => `${p.b.name} (${p.b.orders} OS)` },
            {
              key: "why",
              header: "Coinciden",
              value: (p) => p.matchedOn.map((m) => DUPLICATE_MATCH_LABELS[m]).join(", "),
            },
          ]}
        />
      ) : null}
    </Screen>
  );
}

/** Estado real de las integraciones (equivale a /comercial/integraciones). La configuración de cuentas es en web. */
export function IntegrationsScreen({ state, header, subnav }: PrivateScreenProps) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [accounts, setAccounts] = useState<ChannelAccount[] | null>(null);
  useEffect(() => {
    if (!client) return;
    let active = true;
    void createInboxRepository(client)
      .accounts(center.organizationId)
      .then((r) => active && setAccounts(r.ok ? r.data : []));
    return () => {
      active = false;
    };
  }, [client, center.organizationId]);
  return (
    <Screen title={COMMERCIAL_COPY.integrationsTitle} header={header}>
      {subnav}
      <Text style={textStyle("bodySmall", "muted")}>
        Conexiones oficiales de Meta. «Conectada» sólo cuando el servidor verificó la cuenta con Meta; los
        tokens nunca están en la app y nunca se piden contraseñas de redes sociales. Las cuentas se registran
        en la web.
      </Text>
      {accounts === null ? <Skeleton lines={4} /> : null}
      {accounts !== null
        ? INTEGRATIONS.map((i) => {
            const s = integrationState(i, accounts);
            return (
              <Card key={i.channel} title={i.label} subtitle={INTEGRATION_STATUS_LABELS[s.status]}>
                <Text style={textStyle("bodySmall")}>{s.detail}</Text>
                {s.status !== "conectada" ? (
                  <Text style={textStyle("bodySmall", "muted")}>Mientras tanto: {i.manualFlow}</Text>
                ) : null}
              </Card>
            );
          })
        : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  event: { gap: space.xs, marginBottom: space.sm },
});
