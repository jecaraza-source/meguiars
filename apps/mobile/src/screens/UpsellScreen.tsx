import {
  upsellAcceptanceRate,
  upsellByRule,
  upsellIncrementalRevenue,
  upsellIncrementPerOrder,
  upsellMembershipValue,
  upsellOffered,
  type UpsellFact,
} from "@meguiars/analytics";
import {
  activeCenterAccess,
  addDays,
  can,
  formatMoney,
  presentRule,
  RULE_STAGE_LABELS,
  RULE_STAGES,
  SALES_CHANNELS,
  todayIn,
  upsellCopy,
  upsellErrorMessage,
  usableCenters,
  type CatalogItem,
  type MembershipPlan,
  type RuleStage,
  type SalesChannel,
  type UpsellRule,
  type ViewState,
} from "@meguiars/domain";
import {
  createCatalogRepository,
  createMembershipRepository,
  createUpsellRepository,
} from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { fieldErrors, upsellRuleSchema } from "@meguiars/validation";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Checkbox, Field, LinkButton, Select } from "@/ui/controls";
import { Badge, Card, EmptyState, KpiCard, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

interface Loaded {
  facts: UpsellFact[];
  rules: UpsellRule[];
  services: CatalogItem[];
  plans: MembershipPlan[];
}

/** Recomendaciones de venta: conversión y reglas (equivale a /comercial/recomendaciones en web). */
export function UpsellScreen({ state, header, subnav }: PrivateScreenProps) {
  const { client } = useAuth();
  const access = activeCenterAccess(state)!;
  const center = access.center;
  const today = todayIn(center.timezone);
  const canManage = can(access.corporateRoles, "upsell.manage");
  const [all, setAll] = useState(false);
  const [editing, setEditing] = useState<UpsellRule | "new" | null>(null);
  const [data, setData] = useState<ViewState<Loaded>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const centers = all ? usableCenters(state.access).map((a) => a.center.id) : [center.id];
    const repo = createUpsellRepository(client);
    void Promise.all([
      repo.metricFacts(centers, addDays(today, -29), today),
      repo.listRules(center.organizationId),
      canManage ? createCatalogRepository(client).listForCenter(center.id) : null,
      canManage ? createMembershipRepository(client).listPlans(center.organizationId) : null,
    ]).then(([f, r, c, p]) => {
      if (!active) return;
      if (!r.ok) return setData({ status: "error", message: upsellErrorMessage(r.error) });
      setData({
        status: "ready",
        data: {
          facts: f.ok ? f.data : [],
          rules: r.data,
          services: c?.ok ? c.data : [],
          plans: p?.ok ? p.data : [],
        },
      });
    });
    return () => {
      active = false;
    };
  }, [client, all, center.id, center.organizationId, today, canManage, state.access, version]);

  const orgCenters = state.access
    .filter((a) => a.center.organizationId === center.organizationId && a.center.active)
    .map((a) => ({ id: a.center.id, name: a.center.name }));

  return (
    <Screen title={upsellCopy.title} description={upsellCopy.description} header={header}>
      {subnav}
      {data.status === "loading" ? <Skeleton lines={5} label="Cargando recomendaciones" /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" ? (
        <>
          <Card
            title={upsellCopy.metricsTitle}
            subtitle={`${upsellCopy.metricsRange} · ${all ? upsellCopy.scopeAll : center.name}`}
          >
            <LinkButton
              label={all ? upsellCopy.scopeCenter : upsellCopy.scopeAll}
              onPress={() => setAll((v) => !v)}
            />
            {data.data.facts.length === 0 ? (
              <Text style={textStyle("bodySmall", "muted")}>{upsellCopy.metricsEmpty}</Text>
            ) : (
              <View style={styles.stack}>
                <KpiCard
                  label="Tasa de aceptación"
                  value={`${upsellAcceptanceRate.compute({ facts: data.data.facts })} %`}
                  caption={`${upsellOffered.compute({ facts: data.data.facts })} ofrecidas`}
                />
                <KpiCard
                  label="Ingreso incremental"
                  value={formatMoney(upsellIncrementalRevenue.compute({ facts: data.data.facts }))}
                  caption="Líneas agregadas vigentes"
                />
                <KpiCard
                  label="Incremento por OS"
                  value={formatMoney(upsellIncrementPerOrder.compute({ facts: data.data.facts }))}
                  caption="OS con sugerencias"
                />
                <KpiCard
                  label="Membresías aceptadas"
                  value={formatMoney(upsellMembershipValue.compute({ facts: data.data.facts }))}
                  caption="Valor del plan (intención)"
                />
                <List
                  caption="Conversión por regla"
                  rows={upsellByRule(data.data.facts)}
                  rowKey={(r) => r.ruleId}
                  emptyMessage={upsellCopy.metricsEmpty}
                  columns={[
                    { key: "rule", header: "Regla", value: (r) => r.ruleName },
                    {
                      key: "rate",
                      header: "Aceptación",
                      value: (r) => `${r.accepted}/${r.offered} · ${r.acceptanceRate} %`,
                    },
                    {
                      key: "value",
                      header: "Ingreso",
                      value: (r) =>
                        formatMoney(r.targetKind === "membresia" ? r.membershipValue : r.incrementalRevenue),
                    },
                  ]}
                />
              </View>
            )}
          </Card>
          <Card title={upsellCopy.rulesTitle}>
            {data.data.rules.length === 0 ? (
              <Text style={textStyle("bodySmall", "muted")}>{upsellCopy.rulesEmpty}</Text>
            ) : null}
            {data.data.rules.map((r) => {
              const v = presentRule(r, today);
              return (
                <View key={r.id} style={styles.rule}>
                  <Text style={textStyle("label")}>{v.name}</Text>
                  <Badge label={v.state} tone={v.stateTone} />
                  <Text style={textStyle("bodySmall")}>
                    {v.flow} · {v.stage} · prioridad {v.priority}
                  </Text>
                  <Text style={textStyle("caption", "muted")}>{r.pitch}</Text>
                  {canManage ? (
                    <LinkButton label={upsellCopy.editRule} onPress={() => setEditing(r)} />
                  ) : null}
                </View>
              );
            })}
            {canManage && editing === null ? (
              <Button label={upsellCopy.newRule} variant="secondary" onPress={() => setEditing("new")} />
            ) : null}
          </Card>
          {canManage && editing !== null ? (
            <Card title={editing === "new" ? upsellCopy.newRule : `${upsellCopy.editRule}: ${editing.name}`}>
              <RuleEditor
                key={editing === "new" ? "new" : editing.id}
                organizationId={center.organizationId}
                rule={editing === "new" ? undefined : editing}
                services={data.data.services}
                plans={data.data.plans}
                centers={orgCenters}
                today={today}
                onDone={() => {
                  setEditing(null);
                  reload();
                }}
              />
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function RuleEditor({
  organizationId,
  rule,
  services,
  plans,
  centers,
  today,
  onDone,
}: {
  organizationId: string;
  rule?: UpsellRule;
  services: CatalogItem[];
  plans: MembershipPlan[];
  centers: { id: string; name: string }[];
  today: string;
  onDone: () => void;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const [v, setV] = useState({
    name: rule?.name ?? "",
    sourceServiceId: rule?.sourceServiceId ?? "",
    targetKind: rule?.targetPlanId ? "membresia" : "servicio",
    targetServiceId: rule?.targetServiceId ?? "",
    targetPlanId: rule?.targetPlanId ?? "",
    stage: (rule?.stage ?? "diagnostico") as RuleStage,
    priority: String(rule?.priority ?? 50),
    pitch: rule?.pitch ?? "",
    minOrderTotal: rule?.minOrderTotal != null ? String(rule.minOrderTotal) : "",
    startsOn: rule?.startsOn ?? today,
    endsOn: rule?.endsOn ?? "",
    reason: "",
  });
  const [channels, setChannels] = useState<SalesChannel[]>(rule?.channels ?? [...SALES_CHANNELS]);
  const [centerIds, setCenterIds] = useState<string[]>(rule?.centerIds ?? []);
  const [active, setActive] = useState(rule?.active ?? true);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  const serviceOptions = services.map((s) => ({ value: s.id, label: s.name }));

  async function save() {
    if (!client) return;
    const input = {
      ...v,
      organizationId,
      id: rule?.id,
      targetServiceId: v.targetKind === "membresia" ? "" : v.targetServiceId,
      targetPlanId: v.targetKind === "membresia" ? v.targetPlanId : "",
      channels,
      centerIds,
      active,
    };
    const parsed = upsellRuleSchema.safeParse(input);
    if (!parsed.success) return setFields(fieldErrors(parsed.error));
    setFields({});
    setBusy(true);
    const r = await createUpsellRepository(client).upsertRule(parsed.data);
    setBusy(false);
    if (!r.ok) return setError(upsellErrorMessage(r.error));
    toast({ message: upsellCopy.saved, tone: "success" });
    onDone();
  }

  return (
    <View style={styles.stack}>
      <Field label={upsellCopy.name} required value={v.name} onChangeText={set("name")} error={fields.name} />
      <Select
        label={upsellCopy.source}
        options={[{ value: "", label: upsellCopy.anySource }, ...serviceOptions]}
        value={v.sourceServiceId}
        onChange={set("sourceServiceId")}
      />
      <Select
        label={upsellCopy.targetKind}
        options={[
          { value: "servicio", label: "Servicio o producto" },
          { value: "membresia", label: "Membresía" },
        ]}
        value={v.targetKind}
        onChange={set("targetKind")}
      />
      {v.targetKind === "membresia" ? (
        <Select
          label={upsellCopy.targetPlan}
          placeholder="Elige el plan"
          options={plans.map((p) => ({ value: p.id, label: p.name }))}
          value={v.targetPlanId}
          onChange={set("targetPlanId")}
          error={fields.targetServiceId}
        />
      ) : (
        <Select
          label={upsellCopy.targetService}
          placeholder="Elige el servicio"
          options={serviceOptions}
          value={v.targetServiceId}
          onChange={set("targetServiceId")}
          error={fields.targetServiceId}
        />
      )}
      <Select
        label={upsellCopy.stage}
        options={RULE_STAGES.map((s) => ({ value: s, label: RULE_STAGE_LABELS[s] }))}
        value={v.stage}
        onChange={set("stage")}
      />
      <Field
        label={upsellCopy.priority}
        value={v.priority}
        onChangeText={set("priority")}
        keyboardType="number-pad"
        error={fields.priority}
      />
      <Field
        label={upsellCopy.pitch}
        hint={upsellCopy.pitchHint}
        required
        value={v.pitch}
        onChangeText={set("pitch")}
        error={fields.pitch}
      />
      <Text style={textStyle("label")}>{upsellCopy.channels}</Text>
      {SALES_CHANNELS.map((c) => (
        <Checkbox
          key={c}
          label={c === "b2c" ? "Mostrador (B2C)" : c === "b2b" ? "B2B" : "Membresía"}
          checked={channels.includes(c)}
          onChange={(on) => setChannels((list) => (on ? [...list, c] : list.filter((x) => x !== c)))}
        />
      ))}
      {fields.channels ? <Notice tone="danger" text={fields.channels} /> : null}
      <Text style={textStyle("label")}>{upsellCopy.centers}</Text>
      {centers.map((c) => (
        <Checkbox
          key={c.id}
          label={c.name}
          checked={centerIds.includes(c.id)}
          onChange={(on) => setCenterIds((list) => (on ? [...list, c.id] : list.filter((x) => x !== c.id)))}
        />
      ))}
      <Field
        label={upsellCopy.minOrderTotal}
        value={v.minOrderTotal}
        onChangeText={set("minOrderTotal")}
        keyboardType="decimal-pad"
      />
      <Field
        label={`${upsellCopy.startsOn} (AAAA-MM-DD)`}
        value={v.startsOn}
        onChangeText={set("startsOn")}
        error={fields.startsOn}
      />
      <Field
        label={`${upsellCopy.endsOn} (AAAA-MM-DD)`}
        value={v.endsOn}
        onChangeText={set("endsOn")}
        error={fields.endsOn}
      />
      <Checkbox label={upsellCopy.active} checked={active} onChange={setActive} />
      <Field
        label={upsellCopy.reason}
        required
        value={v.reason}
        onChangeText={set("reason")}
        error={fields.reason}
      />
      <Notice tone="danger" text={error} />
      <Button label={upsellCopy.save} loading={busy} onPress={() => void save()} />
      <LinkButton label="Cancelar" onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  rule: { gap: space.xs, paddingVertical: space.xs },
});
