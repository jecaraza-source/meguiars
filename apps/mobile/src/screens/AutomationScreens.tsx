import {
  activeCenterAccess,
  AUTOMATION_PURPOSE_LABELS,
  AUTOMATION_SKIP_LABELS,
  AUTOMATION_TRIGGER_LABELS,
  AUTOMATIONS_COPY,
  canInCenter,
  commercialErrorMessage,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  PANEL_COPY,
  PANEL_ORIGIN_LABELS,
  PILOT_PERIODS,
  skippedTotal,
  todayIn,
  type Automation,
  type AutomationSkipReason,
  type ViewState,
} from "@meguiars/domain";
import {
  createAutomationsRepository,
  createCommercialRepository,
  createMarketingRepository,
} from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { loadCommercialPanel } from "@/lib/commercial-panel";
import { Button, Select } from "@/ui/controls";
import { Badge, Card, EmptyState, KpiCard, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

type Panel = Awaited<ReturnType<typeof loadCommercialPanel>>;

/** Panel comercial (equivale a /comercial/panel): mismos KPIs, fórmulas y origen del dato. */
export function CommercialPanelScreen({ state, header, subnav }: PrivateScreenProps) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [periodId, setPeriodId] = useState("30");
  const [channel, setChannel] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [campaigns, setCampaigns] = useState<{ value: string; label: string }[]>([]);
  const [data, setData] = useState<ViewState<Panel>>({ status: "loading" });
  useEffect(() => {
    if (!client) return;
    let active = true;
    void createMarketingRepository(client)
      .campaigns(center.organizationId)
      .then((r) => active && r.ok && setCampaigns(r.data.map((c) => ({ value: c.id, label: c.name }))));
    return () => {
      active = false;
    };
  }, [client, center.organizationId]);
  useEffect(() => {
    if (!client) return;
    let active = true;
    void loadCommercialPanel(
      createCommercialRepository(client),
      createMarketingRepository(client),
      center.organizationId,
      [center.id],
      periodId,
      todayIn(center.timezone),
      { channel: channel || undefined, campaignId: campaignId || undefined },
    ).then((p) => {
      if (!active) return;
      setData(p.error ? { status: "error", message: p.error } : { status: "ready", data: p });
    });
    return () => {
      active = false;
    };
  }, [client, center.organizationId, center.id, center.timezone, periodId, channel, campaignId]);
  return (
    <Screen title={PANEL_COPY.title} description={center.name} header={header}>
      {subnav}
      <Select
        label="Periodo"
        options={PILOT_PERIODS.map((p) => ({ value: p.id, label: p.label }))}
        value={periodId}
        onChange={setPeriodId}
      />
      <Select
        label="Canal"
        options={[
          { value: "", label: "Todos" },
          ...LEAD_SOURCES.map((s) => ({ value: s, label: LEAD_SOURCE_LABELS[s] })),
        ]}
        value={channel}
        onChange={setChannel}
      />
      <Select
        label="Campaña"
        options={[{ value: "", label: "Todas" }, ...campaigns]}
        value={campaignId}
        onChange={setCampaignId}
      />
      <Text style={textStyle("caption", "muted")}>{PANEL_COPY.attribution}</Text>
      {data.status === "loading" ? <Skeleton lines={6} /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" ? (
        <>
          {data.data.kpis.map((k) => (
            <View key={k.id} style={styles.stack}>
              <KpiCard label={k.name} value={k.display} caption={k.formula} />
              <Badge
                label={PANEL_ORIGIN_LABELS[k.origin]}
                tone={k.origin === "manual" ? "warning" : "neutral"}
              />
            </View>
          ))}
          <Text style={textStyle("caption", "muted")}>
            {PANEL_COPY.roasNote} {PANEL_COPY.providerNote}
          </Text>
          <Card title="Prospectos por etapa">
            <Text style={textStyle("bodySmall")}>
              {data.data.stages.length
                ? data.data.stages.map((s) => `${s.stage}: ${s.leads}`).join(" · ")
                : "Sin datos"}
            </Text>
          </Card>
          <List
            caption="Por canal"
            rows={data.data.channels}
            rowKey={(r) => r.channel}
            emptyMessage="Sin datos"
            columns={[
              {
                key: "channel",
                header: "Canal",
                value: (r) => LEAD_SOURCE_LABELS[r.channel as keyof typeof LEAD_SOURCE_LABELS] ?? r.channel,
              },
              { key: "leads", header: "Prospectos", value: (r) => String(r.leads) },
              { key: "won", header: "Compraron", value: (r) => String(r.won) },
              { key: "revenue", header: "Ingresos atribuidos", value: (r) => r.revenueLabel },
              { key: "spend", header: "Inversión", value: (r) => r.spendLabel },
            ]}
          />
        </>
      ) : null}
    </Screen>
  );
}

/** Automatizaciones (equivale a /comercial/automatizaciones): consulta, vista previa y ejecución; la configuración es en web. */
export function AutomationsScreen({ state, header, subnav }: PrivateScreenProps) {
  const { client } = useAuth();
  const toast = useToast();
  const center = activeCenterAccess(state)!.center;
  const [tick, setTick] = useState(0);
  const [data, setData] = useState<ViewState<Automation[]>>({ status: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, string>>({});
  const canManage = canInCenter(state, center.id, "automations.manage");
  useEffect(() => {
    if (!client) return;
    let active = true;
    void createAutomationsRepository(client)
      .list(center.organizationId)
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
  }, [client, center.organizationId, tick]);
  const run = async (a: Automation, preview: boolean) => {
    setError(null);
    const r = await createAutomationsRepository(client!).run(a.id, preview);
    if (!r.ok) return setError(commercialErrorMessage(r.error));
    const skipped = Object.entries(r.data.skipped)
      .filter(([, n]) => n)
      .map(([k, n]) => `${n} ${AUTOMATION_SKIP_LABELS[k as AutomationSkipReason]}`)
      .join(", ");
    const text = `${preview ? "Vista previa: crearía" : "Creadas:"} ${r.data.created}${skippedTotal(r.data) ? ` · omitidos: ${skipped}` : ""}`;
    setResult((x) => ({ ...x, [a.id]: text }));
    if (!preview) {
      toast({ message: "Automatización ejecutada", tone: "success" });
      setTick((t) => t + 1);
    }
  };
  return (
    <Screen title={AUTOMATIONS_COPY.title} description={center.name} header={header}>
      {subnav}
      <Text style={textStyle("caption", "muted")}>{AUTOMATIONS_COPY.actionNote}</Text>
      <Text style={textStyle("caption", "muted")}>{AUTOMATIONS_COPY.stopNote}</Text>
      {data.status === "loading" ? <Skeleton lines={5} /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" && data.data.length === 0 ? (
        <EmptyState title={AUTOMATIONS_COPY.empty} />
      ) : null}
      {data.status === "ready"
        ? data.data.map((a) => (
            <Card
              key={a.id}
              title={a.name}
              subtitle={`${AUTOMATION_TRIGGER_LABELS[a.trigger]} · ${a.centerName ?? "Todos los centros"}`}
            >
              <View style={styles.stack}>
                <View style={styles.row}>
                  <Badge label={a.active ? "Activa" : "Inactiva"} tone={a.active ? "success" : "neutral"} />
                  <Badge
                    label={AUTOMATION_PURPOSE_LABELS[a.purpose]}
                    tone={a.purpose === "promocional" ? "warning" : "info"}
                  />
                </View>
                <Text style={textStyle("bodySmall")}>
                  Tareas {a.tasksCreated} · pendientes {a.tasksPending} · hechas {a.tasksDone} · detenidas{" "}
                  {a.tasksStopped}
                </Text>
                {a.messageTemplate ? (
                  <Text style={textStyle("caption", "muted")}>«{a.messageTemplate}»</Text>
                ) : null}
                {canManage && a.canManage ? (
                  <View style={styles.row}>
                    <Button label="Vista previa" variant="secondary" onPress={() => void run(a, true)} />
                    {a.active ? (
                      <Button label="Ejecutar ahora" variant="secondary" onPress={() => void run(a, false)} />
                    ) : null}
                  </View>
                ) : null}
                {result[a.id] ? <Text style={textStyle("bodySmall")}>{result[a.id]}</Text> : null}
              </View>
            </Card>
          ))
        : null}
      <Notice text={error} tone="danger" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.sm, marginBottom: space.md },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
