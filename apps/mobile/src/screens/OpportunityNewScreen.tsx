import {
  activeCenterAccess,
  activeRoles,
  newRequestId,
  OPPORTUNITY_KIND_HINTS,
  OPPORTUNITY_KIND_LABELS,
  pipelineCopy,
  pipelineErrorMessage,
  todayIn,
  writableOpportunityKinds,
  type OpportunityKind,
  type PipelineOwner,
  type PipelineStage,
  type ViewState,
} from "@meguiars/domain";
import { createB2bRepository, createCrmRepository, createPipelineRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { createOpportunitySchema } from "@meguiars/validation";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import {
  B2bOpportunityFields,
  CommonOpportunityFields,
  flatErrors,
  initialOpportunityValues,
  opportunityInput,
  type OpportunityValues,
} from "@/components/OpportunityFields";
import { Button, LinkButton, Select } from "@/ui/controls";
import { Card, EmptyState, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import type { PrivateScreenProps } from "./types";

type Option = { value: string; label: string };
interface Loaded {
  stages: PipelineStage[];
  owners: Record<OpportunityKind, PipelineOwner[]>;
  accounts: Option[];
  companies: Option[];
  clients: Option[];
}

/** Alta de oportunidad (equivale a /comercial/pipeline/nueva en web). */
export function OpportunityNewScreen({
  state,
  header,
  subnav,
  defaults,
  onCreated,
  onCancel,
}: PrivateScreenProps & {
  defaults?: { kind?: OpportunityKind; clientId?: string; accountId?: string };
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const center = activeCenterAccess(state)!.center;
  const today = todayIn(center.timezone);
  const kinds = writableOpportunityKinds(activeRoles(state));
  const [kind, setKind] = useState<OpportunityKind>(
    kinds.find((k) => k === defaults?.kind) ?? kinds[0] ?? "b2c_premium",
  );
  const [data, setData] = useState<ViewState<Loaded>>({ status: "loading" });
  const [requestId] = useState(newRequestId);
  const [v, setV] = useState<OpportunityValues>(() => initialOpportunityValues(undefined, state.user.id));
  const [link, setLink] = useState({
    stageId: "",
    clientId: defaults?.clientId ?? "",
    accountId: defaults?.accountId ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof OpportunityValues) => (x: string) => setV((s) => ({ ...s, [k]: x }));

  useEffect(() => {
    if (!client) return;
    let active = true;
    const pipeline = createPipelineRepository(client);
    const b2b = kinds.includes("b2b") ? createB2bRepository(client) : null;
    void Promise.all([
      pipeline.stages(center.organizationId),
      pipeline.owners(center.id, "b2b"),
      pipeline.owners(center.id, "b2c_premium"),
      b2b ? b2b.listAccounts(today, { status: "activa" }) : null,
      b2b ? b2b.companiesWithoutAccount() : null,
      kinds.includes("b2c_premium") ? createCrmRepository(client).listCustomers([center.id]) : null,
    ]).then(([stages, ob, oc, accounts, companies, customers]) => {
      if (!active) return;
      if (!stages.ok) return setData({ status: "error", message: pipelineErrorMessage(stages.error) });
      setData({
        status: "ready",
        data: {
          stages: stages.data,
          owners: { b2b: ob.ok ? ob.data : [], b2c_premium: oc.ok ? oc.data : [] },
          accounts: accounts?.ok ? accounts.data.map((a) => ({ value: a.id, label: a.name })) : [],
          companies: companies?.ok ? companies.data.map((c) => ({ value: c.id, label: c.name })) : [],
          clients: customers?.ok
            ? customers.data
                .filter((c) => c.kind === "person")
                .sort((a, b) => b.lifetimeValue - a.lifetimeValue)
                .map((c) => ({ value: c.clientId, label: c.fullName }))
            : [],
        },
      });
    });
    return () => {
      active = false;
    };
    // `kinds` se deriva del estado de sesión (estable mientras no cambie el centro).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, center.id, center.organizationId, today]);

  async function save() {
    if (!client || data.status !== "ready") return;
    const openStages = data.data.stages.filter((s) => s.kind === "abierta" && s.active);
    const parsed = createOpportunitySchema.safeParse({
      detailCenterId: center.id,
      requestId,
      kind,
      clientId: link.clientId,
      b2bAccountId: kind === "b2b" ? link.accountId : "",
      stageId: link.stageId || openStages[0]?.id,
      ...opportunityInput(v, kind === "b2b"),
      prospect: kind === "b2b" ? opportunityInput(v, true).prospect : undefined,
    });
    if (!parsed.success) return setErrors(flatErrors(parsed.error.issues));
    setErrors({});
    setBusy(true);
    const r = await createPipelineRepository(client).create(parsed.data);
    setBusy(false);
    if (!r.ok) return setError(pipelineErrorMessage(r.error));
    toast({ message: pipelineCopy.created, tone: "success" });
    onCreated(r.data.id);
  }

  return (
    <Screen title={pipelineCopy.newOpportunity} description={pipelineCopy.description} header={header}>
      {subnav}
      <LinkButton label={`← ${pipelineCopy.title}`} onPress={onCancel} />
      {data.status === "loading" ? <Skeleton lines={6} label="Cargando formulario" /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" ? (
        <Card>
          <View style={styles.stack}>
            <Select
              label={pipelineCopy.kind}
              hint={OPPORTUNITY_KIND_HINTS[kind]}
              options={kinds.map((k) => ({ value: k, label: OPPORTUNITY_KIND_LABELS[k] }))}
              value={kind}
              onChange={(x) => setKind(x as OpportunityKind)}
            />
            <Select
              label={pipelineCopy.stage}
              options={data.data.stages
                .filter((s) => s.kind === "abierta" && s.active)
                .map((s) => ({ value: s.id, label: s.name }))}
              value={
                link.stageId || (data.data.stages.find((s) => s.kind === "abierta" && s.active)?.id ?? "")
              }
              onChange={(x) => setLink((l) => ({ ...l, stageId: x }))}
            />
            {kind === "b2b" ? (
              <>
                <Select
                  label={pipelineCopy.linkAccount}
                  options={[{ value: "", label: "—" }, ...data.data.accounts]}
                  value={link.accountId}
                  onChange={(x) => setLink((l) => ({ ...l, accountId: x }))}
                />
                <Select
                  label={pipelineCopy.linkClient}
                  options={[{ value: "", label: "—" }, ...data.data.companies]}
                  value={link.clientId}
                  onChange={(x) => setLink((l) => ({ ...l, clientId: x }))}
                />
                <B2bOpportunityFields v={v} set={set} errors={errors} />
              </>
            ) : (
              <Select
                label={pipelineCopy.linkClient}
                placeholder="Elige el cliente"
                options={data.data.clients}
                value={link.clientId}
                onChange={(x) => setLink((l) => ({ ...l, clientId: x }))}
                error={errors.clientId}
              />
            )}
            <CommonOpportunityFields v={v} set={set} errors={errors} owners={data.data.owners[kind]} />
            <Notice tone="danger" text={error} />
            <Button label={pipelineCopy.create} loading={busy} onPress={() => void save()} />
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({ stack: { gap: space.md } });
