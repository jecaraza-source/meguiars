import {
  activeCenterAccess,
  activeRoles,
  boardColumns,
  formatDateOnly,
  formatMoney,
  OPPORTUNITY_KIND_LABELS,
  OPPORTUNITY_KINDS,
  pipelineCopy,
  pipelineErrorMessage,
  presentOpportunityCard,
  weightedValue,
  writableOpportunityKinds,
  type Opportunity,
  type OpportunityKind,
  type OpportunityStatus,
  type PipelineStage,
  type ViewState,
} from "@meguiars/domain";
import { createPipelineRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Checkbox, Select } from "@/ui/controls";
import { Badge, Card, EmptyState, KpiCard, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

interface Loaded {
  opportunities: Opportunity[];
  stages: PipelineStage[];
}

/** Pipeline del centro activo por etapa (equivale a /comercial/pipeline en web). */
export function PipelineScreen({
  state,
  header,
  subnav,
  onOpen,
  onNew,
  onMetrics,
}: PrivateScreenProps & { onOpen: (id: string) => void; onNew: () => void; onMetrics: () => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [status, setStatus] = useState<OpportunityStatus>("abierta");
  const [kind, setKind] = useState<OpportunityKind | "">("");
  const [mine, setMine] = useState(false);
  const [data, setData] = useState<ViewState<Loaded>>({ status: "loading" });
  const canCreate = writableOpportunityKinds(activeRoles(state)).length > 0;

  useEffect(() => {
    if (!client) return;
    let active = true;
    const repo = createPipelineRepository(client);
    void Promise.all([
      repo.list([center.id], { status, kind: kind || undefined, ownerId: mine ? state.user.id : undefined }),
      repo.stages(center.organizationId),
    ]).then(([list, stages]) => {
      if (!active) return;
      if (!list.ok) return setData({ status: "error", message: pipelineErrorMessage(list.error) });
      if (!stages.ok) return setData({ status: "error", message: pipelineErrorMessage(stages.error) });
      setData({ status: "ready", data: { opportunities: list.data, stages: stages.data } });
    });
    return () => {
      active = false;
    };
  }, [client, center.id, center.organizationId, status, kind, mine, state.user.id]);

  const open = data.status === "ready" ? data.data.opportunities : [];
  const total = open.reduce((t, o) => t + o.estimatedValue, 0);
  const weighted = open.reduce((t, o) => t + weightedValue(o.estimatedValue, o.stageProbability), 0);
  const overdue = open.filter((o) => presentOpportunityCard(o).nextActionState === "vencida").length;

  return (
    <Screen title={pipelineCopy.title} description={pipelineCopy.description} header={header}>
      {subnav}
      <Card>
        <View style={styles.stack}>
          {canCreate ? <Button label={pipelineCopy.newOpportunity} onPress={onNew} /> : null}
          <Button label={pipelineCopy.metricsTitle} variant="secondary" onPress={onMetrics} />
          <Select
            label="Estado"
            options={[
              { value: "abierta", label: pipelineCopy.filterOpen },
              { value: "ganada", label: pipelineCopy.filterWon },
              { value: "perdida", label: pipelineCopy.filterLost },
            ]}
            value={status}
            onChange={(v) => setStatus(v as OpportunityStatus)}
          />
          <Select
            label={pipelineCopy.kind}
            options={[
              { value: "", label: pipelineCopy.filterAll },
              ...OPPORTUNITY_KINDS.map((k) => ({ value: k, label: OPPORTUNITY_KIND_LABELS[k] })),
            ]}
            value={kind}
            onChange={(v) => setKind(v as OpportunityKind | "")}
          />
          <Checkbox label={pipelineCopy.filterMine} checked={mine} onChange={setMine} />
        </View>
      </Card>
      {data.status === "loading" ? <Skeleton lines={5} label="Cargando pipeline" /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" && status === "abierta" ? (
        <>
          <KpiCard label="Abiertas" value={String(open.length)} caption={formatMoney(total)} />
          <KpiCard
            label="Pipeline ponderado"
            value={formatMoney(weighted)}
            caption="Valor × probabilidad de la etapa"
          />
          <KpiCard
            label="Acciones vencidas"
            value={String(overdue)}
            caption="Siguiente acción con fecha pasada"
          />
          {open.length === 0 ? <EmptyState title={pipelineCopy.empty} /> : null}
          {open.length > 0
            ? boardColumns(data.data.stages, open).map((col) => (
                <Card
                  key={col.id}
                  title={`${col.name} (${col.count})`}
                  subtitle={`${col.total} · ${col.probability} % → ${col.weighted}`}
                >
                  {col.items.length === 0 ? (
                    <Text style={textStyle("bodySmall", "muted")}>{pipelineCopy.emptyStage}</Text>
                  ) : (
                    col.items.map((o) => <OpportunityRow key={o.id} opportunity={o} onOpen={onOpen} />)
                  )}
                </Card>
              ))
            : null}
        </>
      ) : null}
      {data.status === "ready" && status !== "abierta" ? (
        <List
          caption={status === "ganada" ? pipelineCopy.filterWon : pipelineCopy.filterLost}
          rows={data.data.opportunities}
          rowKey={(o) => o.id}
          emptyMessage={pipelineCopy.metricsEmpty}
          onRowPress={(o) => onOpen(o.id)}
          columns={[
            { key: "title", header: "Oportunidad", value: (o) => o.title },
            {
              key: "company",
              header: "Empresa / cliente",
              value: (o) => `${o.displayName} · ${OPPORTUNITY_KIND_LABELS[o.kind]}`,
            },
            {
              key: "value",
              header: status === "ganada" ? "Valor ganado" : "Valor estimado",
              value: (o) => formatMoney(o.wonValue ?? o.estimatedValue),
            },
            { key: "closed", header: "Cierre", value: (o) => formatDateOnly(o.closedAt?.slice(0, 10)) },
          ]}
        />
      ) : null}
    </Screen>
  );
}

function OpportunityRow({ opportunity, onOpen }: { opportunity: Opportunity; onOpen: (id: string) => void }) {
  const v = presentOpportunityCard(opportunity);
  return (
    <View style={styles.row}>
      <List
        caption={v.title}
        rows={[v]}
        rowKey={(x) => x.id}
        emptyMessage=""
        onRowPress={() => onOpen(opportunity.id)}
        columns={[
          { key: "title", header: "Oportunidad", value: (x) => x.title },
          { key: "company", header: "Empresa / cliente", value: (x) => `${x.company} · ${x.kind}` },
          { key: "value", header: "Valor", value: (x) => x.value },
          { key: "owner", header: pipelineCopy.owner, value: (x) => `${x.owner} · ${x.ageDays} días` },
        ]}
      />
      {v.nextActionState ? (
        <View style={styles.next}>
          {v.nextActionState !== "proxima" && v.nextActionLabel ? (
            <Badge label={v.nextActionLabel} tone={v.nextActionTone} />
          ) : null}
          {v.nextActionState === "sin_accion" ? null : (
            <Text style={textStyle("bodySmall")}>{v.nextAction}</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  row: { gap: space.xs, marginBottom: space.sm },
  next: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs },
});
