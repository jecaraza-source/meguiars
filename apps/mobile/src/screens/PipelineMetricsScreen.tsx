import {
  pipelineAvgCycleDays,
  pipelineByKind,
  pipelineConversionRate,
  pipelineCreated,
  pipelineFunnel,
  pipelineLost,
  pipelineOpenByStage,
  pipelineOpenValue,
  pipelineWeightedValue,
  pipelineWon,
  pipelineWonValue,
} from "@meguiars/analytics";
import {
  activeCenterAccess,
  addDays,
  can,
  formatMoney,
  OPPORTUNITY_KIND_LABELS,
  pipelineCopy,
  pipelineErrorMessage,
  todayIn,
  usableCenters,
  type PipelineMetricFact,
  type PipelineStage,
  type ViewState,
} from "@meguiars/domain";
import { createPipelineRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { pipelineStageSchema } from "@meguiars/validation";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Checkbox, Field, LinkButton } from "@/ui/controls";
import { Badge, Card, EmptyState, KpiCard, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

interface Loaded {
  facts: PipelineMetricFact[];
  stages: PipelineStage[];
}

/** Indicadores del pipeline desde eventos y etapas (equivale a /comercial/pipeline/indicadores en web). */
export function PipelineMetricsScreen({ state, header, subnav }: PrivateScreenProps) {
  const { client } = useAuth();
  const access = activeCenterAccess(state)!;
  const center = access.center;
  const canManage = can(access.corporateRoles, "pipeline.manage");
  const [all, setAll] = useState(false);
  const [days, setDays] = useState<30 | 90>(30);
  const [editing, setEditing] = useState<PipelineStage | "new" | null>(null);
  const [data, setData] = useState<ViewState<Loaded>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const to = todayIn(center.timezone);
  const from = addDays(to, -(days - 1));

  useEffect(() => {
    if (!client) return;
    let active = true;
    const centers = all
      ? usableCenters(state.access)
          .filter((a) => can([...a.roles, ...a.corporateRoles], "pipeline.metrics.read"))
          .map((a) => a.center.id)
      : [center.id];
    const repo = createPipelineRepository(client);
    void Promise.all([repo.metricFacts(centers, from, to), repo.stages(center.organizationId)]).then(
      ([f, s]) => {
        if (!active) return;
        if (!f.ok) return setData({ status: "error", message: pipelineErrorMessage(f.error) });
        setData({ status: "ready", data: { facts: f.data, stages: s.ok ? s.data : [] } });
      },
    );
    return () => {
      active = false;
    };
  }, [client, all, from, to, center.id, center.organizationId, state.access, version]);

  const input =
    data.status === "ready" ? { facts: data.data.facts, from, to, stages: data.data.stages } : null;

  return (
    <Screen title={pipelineCopy.metricsTitle} description={pipelineCopy.metricsDescription} header={header}>
      {subnav}
      <Card
        subtitle={`${days === 90 ? pipelineCopy.range90 : pipelineCopy.range30} · ${all ? pipelineCopy.scopeAll : center.name}`}
      >
        <LinkButton
          label={days === 90 ? pipelineCopy.range30 : pipelineCopy.range90}
          onPress={() => setDays(days === 90 ? 30 : 90)}
        />
        <LinkButton
          label={all ? pipelineCopy.scopeCenter : pipelineCopy.scopeAll}
          onPress={() => setAll((v) => !v)}
        />
      </Card>
      {data.status === "loading" ? <Skeleton lines={6} label="Cargando indicadores" /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {input && input.facts.length === 0 ? <EmptyState title={pipelineCopy.metricsEmpty} /> : null}
      {input && input.facts.length > 0 ? (
        <>
          <KpiCard
            label="Oportunidades nuevas"
            value={String(pipelineCreated.compute(input))}
            caption="Altas del periodo"
          />
          <KpiCard
            label="Conversión"
            value={`${pipelineConversionRate.compute(input)} %`}
            caption={`${pipelineWon.compute(input)} ganadas · ${pipelineLost.compute(input)} perdidas`}
          />
          <KpiCard
            label="Valor ganado"
            value={formatMoney(pipelineWonValue.compute(input))}
            caption="Cierres del periodo"
          />
          <KpiCard
            label="Ciclo promedio"
            value={`${pipelineAvgCycleDays.compute(input)} días`}
            caption="De alta a ganada"
          />
          <KpiCard
            label="Pipeline abierto"
            value={formatMoney(pipelineOpenValue.compute(input))}
            caption="Último valor"
          />
          <KpiCard
            label="Pipeline ponderado"
            value={formatMoney(pipelineWeightedValue.compute(input))}
            caption="Valor × probabilidad"
          />
          <Card title={pipelineCopy.funnel}>
            <List
              caption={pipelineCopy.funnel}
              rows={pipelineFunnel(input)}
              rowKey={(r) => r.stageId}
              emptyMessage={pipelineCopy.metricsEmpty}
              columns={[
                { key: "stage", header: pipelineCopy.stage, value: (r) => r.name },
                { key: "reached", header: "Llegaron", value: (r) => `${r.reached} · ${r.percent} %` },
              ]}
            />
          </Card>
          <Card title={pipelineCopy.openByStage}>
            <List
              caption={pipelineCopy.openByStage}
              rows={pipelineOpenByStage(input)}
              rowKey={(r) => r.stageId}
              emptyMessage={pipelineCopy.metricsEmpty}
              columns={[
                { key: "stage", header: pipelineCopy.stage, value: (r) => r.name },
                { key: "open", header: "Abiertas", value: (r) => `${r.count} · ${formatMoney(r.value)}` },
              ]}
            />
          </Card>
          <Card title={pipelineCopy.byKind}>
            <List
              caption={pipelineCopy.byKind}
              rows={pipelineByKind(input)}
              rowKey={(r) => r.kind}
              emptyMessage={pipelineCopy.metricsEmpty}
              columns={[
                { key: "kind", header: pipelineCopy.kind, value: (r) => OPPORTUNITY_KIND_LABELS[r.kind] },
                {
                  key: "flow",
                  header: "Nuevas · ganadas · perdidas",
                  value: (r) => `${r.created} · ${r.won} · ${r.lost}`,
                },
                { key: "rate", header: "Conversión", value: (r) => `${r.conversionRate} %` },
                { key: "value", header: "Valor ganado", value: (r) => formatMoney(r.wonValue) },
                { key: "cycle", header: "Ciclo (días)", value: (r) => String(r.avgCycleDays) },
              ]}
            />
          </Card>
        </>
      ) : null}
      {data.status === "ready" ? (
        <Card title={pipelineCopy.stagesTitle} subtitle={canManage ? pipelineCopy.stagesHint : undefined}>
          {data.data.stages.map((s) => (
            <View key={s.id} style={styles.stage}>
              <Text style={textStyle("label")}>
                {s.name} · posición {s.position} · {s.probability} %
              </Text>
              {!s.active ? <Badge label="Inactiva" tone="neutral" /> : null}
              {canManage ? <LinkButton label={pipelineCopy.saveStage} onPress={() => setEditing(s)} /> : null}
            </View>
          ))}
          {canManage && editing === null ? (
            <Button label={pipelineCopy.newStage} variant="secondary" onPress={() => setEditing("new")} />
          ) : null}
          {canManage && editing !== null ? (
            <StageEditor
              key={editing === "new" ? "new" : editing.id}
              organizationId={center.organizationId}
              stage={editing === "new" ? undefined : editing}
              onDone={() => {
                setEditing(null);
                reload();
              }}
            />
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}

function StageEditor({
  organizationId,
  stage,
  onDone,
}: {
  organizationId: string;
  stage?: PipelineStage;
  onDone: () => void;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const closing = !!stage && stage.kind !== "abierta";
  const [v, setV] = useState({
    name: stage?.name ?? "",
    position: String(stage?.position ?? ""),
    probability: String(stage?.probability ?? 50),
    reason: "",
  });
  const [active, setActive] = useState(stage?.active ?? true);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (x: string) => setV((s) => ({ ...s, [k]: x }));

  async function save() {
    if (!client) return;
    const parsed = pipelineStageSchema.safeParse({
      organizationId,
      id: stage?.id,
      name: v.name,
      position: closing ? 1 : v.position,
      probability: v.probability,
      active: closing ? true : active,
      reason: v.reason,
    });
    if (!parsed.success) {
      const out: Record<string, string> = {};
      for (const i of parsed.error.issues) out[String(i.path[0])] ??= i.message;
      return setFields(out);
    }
    setFields({});
    setBusy(true);
    const r = await createPipelineRepository(client).upsertStage(parsed.data);
    setBusy(false);
    if (!r.ok) return setError(pipelineErrorMessage(r.error));
    toast({ message: pipelineCopy.stageSaved, tone: "success" });
    onDone();
  }

  return (
    <View style={styles.stack}>
      <Field label={pipelineCopy.stageName} value={v.name} onChangeText={set("name")} error={fields.name} />
      {closing ? null : (
        <>
          <Field
            label={pipelineCopy.position}
            value={v.position}
            onChangeText={set("position")}
            keyboardType="number-pad"
            error={fields.position}
          />
          <Field
            label={pipelineCopy.probability}
            value={v.probability}
            onChangeText={set("probability")}
            keyboardType="number-pad"
            error={fields.probability}
          />
          <Checkbox label={pipelineCopy.active} checked={active} onChange={setActive} />
        </>
      )}
      <Field
        label={pipelineCopy.reason}
        required
        value={v.reason}
        onChangeText={set("reason")}
        error={fields.reason}
      />
      <Notice tone="danger" text={error} />
      <Button
        label={stage ? pipelineCopy.saveStage : pipelineCopy.newStage}
        loading={busy}
        onPress={() => void save()}
      />
      <LinkButton label="Cancelar" onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  stage: { gap: space.xs, paddingVertical: space.xs },
});
