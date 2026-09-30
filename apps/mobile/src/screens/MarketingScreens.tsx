import {
  activeCenterAccess,
  buildUtmUrl,
  CAMPAIGN_CHANNEL_LABELS,
  CAMPAIGN_OBJECTIVE_LABELS,
  CAMPAIGN_STATUS_LABELS,
  canInCenter,
  commercialErrorMessage,
  CONTENT_FORMAT_LABELS,
  CONTENT_STATUS_LABELS,
  contentStatusActions,
  formatMoney,
  formatTimeInCenterTimeZone,
  groupPostsByDay,
  MARKETING_COPY,
  PILOT_PERIODS,
  PROMOTION_STATE_LABELS,
  promotionState,
  todayIn,
  type Campaign,
  type ContentPost,
  type ContentStatus,
  type Promotion,
  type ViewState,
} from "@meguiars/domain";
import { createMarketingRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useCallback, useEffect, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { calendarWeek, loadCampaignReport } from "@/lib/marketing";
import { Button, Field, LinkButton, Select } from "@/ui/controls";
import { Badge, Card, EmptyState, KpiCard, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

type Report = Awaited<ReturnType<typeof loadCampaignReport>>;

/** Calendario de la semana (equivale a /comercial/calendario); planear es en web. */
export function CalendarScreen({ state, header, subnav }: PrivateScreenProps) {
  const { client } = useAuth();
  const toast = useToast();
  const center = activeCenterAccess(state)!.center;
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(0);
  const [data, setData] = useState<ViewState<ContentPost[]>>({ status: "loading" });
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const week = calendarWeek(todayIn(center.timezone), offset);
  useEffect(() => {
    if (!client) return;
    let active = true;
    void createMarketingRepository(client)
      .posts(center.organizationId, week.from, week.to, { detailCenterId: center.id })
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
  }, [client, center.organizationId, center.id, week.from, week.to, tick]);
  const move = async (p: ContentPost, status: ContentStatus) => {
    setError(null);
    const r = await createMarketingRepository(client!).setPostStatus(p.id, p.version, status, urls[p.id]);
    if (!r.ok) return setError(commercialErrorMessage(r.error));
    toast({ message: "Publicación actualizada", tone: "success" });
    setTick((x) => x + 1);
  };
  const days =
    data.status === "ready"
      ? groupPostsByDay(data.data, center.timezone).filter((d) => d.day >= week.from && d.day <= week.to)
      : [];
  return (
    <Screen
      title={MARKETING_COPY.calendarTitle}
      description={`Del ${week.from} al ${week.to}`}
      header={header}
    >
      {subnav}
      <View style={styles.row}>
        <Button label="← Semana anterior" variant="secondary" onPress={() => setOffset((o) => o - 1)} />
        <Button label="Siguiente →" variant="secondary" onPress={() => setOffset((o) => o + 1)} />
      </View>
      <Text style={textStyle("caption", "muted")}>{MARKETING_COPY.publishNote}</Text>
      {data.status === "loading" ? <Skeleton lines={4} /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" && days.length === 0 ? <EmptyState title={MARKETING_COPY.noPosts} /> : null}
      {days.map((d) => (
        <Card key={d.day} title={d.day}>
          {d.posts.map((p) => (
            <View key={p.id} style={styles.stack}>
              <Text style={textStyle("label")}>{p.title}</Text>
              <Text style={textStyle("caption", "muted")}>
                {formatTimeInCenterTimeZone(p.plannedAt, center.timezone)} ·{" "}
                {CAMPAIGN_CHANNEL_LABELS[p.channel]} · {CONTENT_FORMAT_LABELS[p.format]}
                {p.campaignName ? ` · ${p.campaignName}` : ""}
              </Text>
              <Badge
                label={
                  p.overdue
                    ? `${CONTENT_STATUS_LABELS[p.status]} · atrasada`
                    : CONTENT_STATUS_LABELS[p.status]
                }
                tone={p.status === "publicada" ? "success" : p.overdue ? "warning" : "info"}
              />
              {p.linkUrl ? (
                <Button
                  label="Compartir enlace con UTM"
                  variant="secondary"
                  onPress={() => void Share.share({ message: p.linkUrl! })}
                />
              ) : null}
              {p.canManage && contentStatusActions(p.status).includes("publicada") ? (
                <>
                  <Field
                    label="Enlace de la publicación"
                    autoCapitalize="none"
                    value={urls[p.id] ?? ""}
                    onChangeText={(v) => setUrls((u) => ({ ...u, [p.id]: v }))}
                  />
                  <Button label="Marcar publicada" onPress={() => void move(p, "publicada")} />
                </>
              ) : null}
            </View>
          ))}
        </Card>
      ))}
      <Notice text={error} tone="danger" />
    </Screen>
  );
}

/** Campañas con indicadores (equivale a /comercial/campanas); crear y editar es en web. */
export function CampaignsScreen({
  state,
  header,
  subnav,
  onOpen,
}: PrivateScreenProps & { onOpen: (id: string) => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [periodId, setPeriodId] = useState("30");
  const [data, setData] = useState<ViewState<{ campaigns: Campaign[]; report: Report | null }>>({
    status: "loading",
  });
  useEffect(() => {
    if (!client) return;
    let active = true;
    const repo = createMarketingRepository(client);
    const metrics = canInCenter(state, center.id, "commercial.metrics.read");
    void Promise.all([
      repo.campaigns(center.organizationId),
      metrics
        ? loadCampaignReport(repo, center.organizationId, [center.id], periodId, todayIn(center.timezone))
        : null,
    ]).then(([c, report]) => {
      if (!active) return;
      setData(
        c.ok
          ? { status: "ready", data: { campaigns: c.data, report } }
          : { status: "error", message: commercialErrorMessage(c.error) },
      );
    });
    return () => {
      active = false;
    };
  }, [client, center.organizationId, center.id, center.timezone, periodId, state]);
  const facts = new Map(
    (data.status === "ready" ? (data.data.report?.rows ?? []) : []).map((r) => [r.campaignId, r]),
  );
  return (
    <Screen title={MARKETING_COPY.campaignsTitle} description={center.name} header={header}>
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
          {data.data.report?.kpis.map((k) => (
            <KpiCard key={k.id} label={k.name} value={k.display} caption={k.formula} />
          ))}
          {data.data.report ? (
            <Text style={textStyle("caption", "muted")}>{MARKETING_COPY.salesPerPesoNote}</Text>
          ) : null}
          <List
            caption={MARKETING_COPY.campaignsTitle}
            rows={data.data.campaigns}
            rowKey={(c) => c.id}
            emptyMessage={MARKETING_COPY.noCampaigns}
            onRowPress={(c) => onOpen(c.id)}
            columns={[
              { key: "name", header: "Campaña", value: (c) => c.name },
              { key: "status", header: "Estado", value: (c) => CAMPAIGN_STATUS_LABELS[c.status] },
              { key: "spend", header: "Inversión", value: (c) => formatMoney(c.spend) },
              {
                key: "cpl",
                header: "Costo/prospecto",
                value: (c) => facts.get(c.id)?.costPerLeadLabel ?? "—",
              },
              {
                key: "margin",
                header: "Margen tras inversión",
                value: (c) => facts.get(c.id)?.marginAfterSpendLabel ?? "—",
              },
            ]}
          />
        </>
      ) : null}
    </Screen>
  );
}

/** Campaña: datos, enlace UTM para compartir, gasto y promociones (consulta). */
export function CampaignScreen({
  state,
  header,
  subnav,
  campaignId,
  onBack,
}: PrivateScreenProps & { campaignId: string; onBack: () => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [data, setData] = useState<ViewState<{ campaign: Campaign; promos: Promotion[]; spend: number }>>({
    status: "loading",
  });
  const [content, setContent] = useState("");
  useEffect(() => {
    if (!client) return;
    let active = true;
    const repo = createMarketingRepository(client);
    void Promise.all([
      repo.campaign(center.organizationId, campaignId),
      repo.promotions(center.organizationId),
    ]).then(([c, p]) => {
      if (!active) return;
      if (!c.ok) return setData({ status: "error", message: commercialErrorMessage(c.error) });
      setData({
        status: "ready",
        data: {
          campaign: c.data,
          promos: p.ok ? p.data.filter((x) => x.campaignId === campaignId) : [],
          spend: c.data.spend,
        },
      });
    });
    return () => {
      active = false;
    };
  }, [client, center.organizationId, campaignId]);
  if (data.status !== "ready") {
    return (
      <Screen title={MARKETING_COPY.campaignsTitle} header={header}>
        {subnav}
        <LinkButton label="← Campañas" onPress={onBack} />
        {data.status === "loading" ? (
          <Skeleton lines={5} />
        ) : (
          <EmptyState title={"message" in data ? data.message : MARKETING_COPY.noCampaigns} />
        )}
      </Screen>
    );
  }
  const c = data.data.campaign;
  const url = c.landingUrl
    ? buildUtmUrl(c.landingUrl, {
        source: c.utmSource,
        medium: c.utmMedium,
        campaign: c.utmCampaign,
        content: content || undefined,
      })
    : null;
  const today = todayIn(center.timezone);
  return (
    <Screen
      title={c.name}
      description={`${CAMPAIGN_OBJECTIVE_LABELS[c.objective]} · ${c.centerName ?? "Toda la organización"}`}
      header={header}
    >
      {subnav}
      <LinkButton label="← Campañas" onPress={onBack} />
      <Card title={CAMPAIGN_STATUS_LABELS[c.status]} subtitle={`${c.startsOn} – ${c.endsOn}`}>
        <Text style={textStyle("bodySmall")}>
          Inversión {formatMoney(c.spend)}
          {c.budget != null ? ` de ${formatMoney(c.budget)}` : ""} · {c.leads} prospectos · {c.posts}{" "}
          publicaciones
        </Text>
        <Text style={textStyle("caption", "muted")}>
          {c.channels.map((x) => CAMPAIGN_CHANNEL_LABELS[x]).join(", ") || "Sin canales"}
        </Text>
      </Card>
      <Card title="Enlace con UTM">
        <View style={styles.stack}>
          <Field
            label="Pieza (utm_content)"
            value={content}
            onChangeText={setContent}
            autoCapitalize="none"
          />
          {url ? (
            <>
              <Text style={textStyle("caption")}>{url}</Text>
              <Button
                label="Compartir enlace"
                variant="secondary"
                onPress={() => void Share.share({ message: url })}
              />
            </>
          ) : (
            <Text style={textStyle("caption", "muted")}>La campaña no tiene página de destino https.</Text>
          )}
        </View>
      </Card>
      <Card title="Promociones">
        {data.data.promos.length === 0 ? (
          <Text style={textStyle("bodySmall", "muted")}>Sin promociones.</Text>
        ) : (
          data.data.promos.map((p) => (
            <Text key={p.id} style={textStyle("bodySmall")}>
              {p.code} · {p.name} · {PROMOTION_STATE_LABELS[promotionState(p, today)]} · {p.uses} usos
            </Text>
          ))
        )}
      </Card>
      <Text style={textStyle("caption", "muted")}>
        {MARKETING_COPY.spendNote} El gasto y la edición se capturan en la web.
      </Text>
    </Screen>
  );
}

/** Promociones vigentes (equivale a /comercial/promociones); crearlas es en web (admin). */
export function PromotionsScreen({ state, header, subnav }: PrivateScreenProps) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [data, setData] = useState<ViewState<Promotion[]>>({ status: "loading" });
  useEffect(() => {
    if (!client) return;
    let active = true;
    void createMarketingRepository(client)
      .promotions(center.organizationId)
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
  }, [client, center.organizationId]);
  const today = todayIn(center.timezone);
  return (
    <Screen title={MARKETING_COPY.promotionsTitle} description={center.name} header={header}>
      {subnav}
      <Text style={textStyle("caption", "muted")}>{MARKETING_COPY.promotionNote}</Text>
      {data.status === "loading" ? <Skeleton lines={4} /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" ? (
        <List
          caption={MARKETING_COPY.promotionsTitle}
          rows={data.data}
          rowKey={(p) => p.id}
          emptyMessage={MARKETING_COPY.noPromotions}
          columns={[
            { key: "code", header: "Código", value: (p) => p.code },
            {
              key: "discount",
              header: "Descuento",
              value: (p) => (p.kind === "percent" ? `${p.value} %` : formatMoney(p.value)),
            },
            {
              key: "state",
              header: "Estado",
              value: (p) => PROMOTION_STATE_LABELS[promotionState(p, today)],
            },
            { key: "uses", header: "Usos", value: (p) => `${p.uses}${p.maxUses ? `/${p.maxUses}` : ""}` },
          ]}
        />
      ) : null}
    </Screen>
  );
}

/** Aplicar un código de promoción en una cotización u OS (se usa en sus pantallas). */
export function ApplyPromotionCard({
  target,
  documentId,
  version,
  onApplied,
}: {
  target: "quote" | "order";
  documentId: string;
  version: number;
  onApplied: () => void;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const apply = useCallback(async () => {
    if (!client) return;
    setBusy(true);
    setError(null);
    const repo = createMarketingRepository(client);
    const r =
      target === "order"
        ? await repo.applyPromotionToOrder(documentId, version, code)
        : await repo.applyPromotionToQuote(documentId, version, code);
    setBusy(false);
    if (!r.ok) return setError(commercialErrorMessage(r.error));
    toast({ message: `Promoción ${code.toUpperCase()} aplicada`, tone: "success" });
    setCode("");
    onApplied();
  }, [client, target, documentId, version, code, toast, onApplied]);
  return (
    <Card title="Promoción">
      <View style={styles.stack}>
        <Field label="Código de promoción" autoCapitalize="characters" value={code} onChangeText={setCode} />
        <Button
          label="Aplicar"
          variant="secondary"
          loading={busy}
          disabled={code.trim().length < 3}
          onPress={() => void apply()}
        />
        <Notice text={error} tone="danger" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.sm, marginBottom: space.md },
  row: { flexDirection: "row", gap: space.sm },
});
