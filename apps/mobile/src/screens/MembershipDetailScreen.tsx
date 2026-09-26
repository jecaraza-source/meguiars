import {
  activeCenterAccess,
  canChangePlanOnRenewal,
  canInActiveCenter,
  formatDateOnly,
  membershipActions,
  membershipErrorMessage,
  membershipsCopy,
  membershipStatus,
  newRequestId,
  PLAN_TIER_LABELS,
  presentBalance,
  presentMembershipEvent,
  presentPlan,
  presentRedemption,
  presentStatus,
  pricePerPeriod,
  REDEEM_SCOPE_LABELS,
  renewalCaption,
  todayIn,
  type MembershipAction,
  type MembershipDetail,
  type MembershipPlan,
  type MembershipStatus,
  type ViewState,
} from "@meguiars/domain";
import { createMembershipRepository, type MeguiarsSupabaseClient } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { fieldErrors, membershipStateSchema, renewMembershipSchema } from "@meguiars/validation";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, LinkButton, Select } from "@/ui/controls";
import { Badge, Card, EmptyState, KpiCard, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import type { PrivateScreenProps } from "./types";

async function fetchDetail(client: MeguiarsSupabaseClient, id: string): Promise<ViewState<MembershipDetail>> {
  const r = await createMembershipRepository(client).get(id);
  return r.ok
    ? { status: "ready", data: r.data }
    : { status: "permission_denied", message: membershipsCopy.notFound };
}

/** Detalle de la membresía (equivale a /comercial/membresias/[id] en web). */
export function MembershipDetailScreen({
  state,
  header,
  membershipId,
  onBack,
}: PrivateScreenProps & { membershipId: string; onBack: () => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [data, setData] = useState<ViewState<MembershipDetail>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void fetchDetail(client, membershipId).then((next) => {
      if (active) setData(next);
    });
    return () => {
      active = false;
    };
  }, [client, membershipId, version]);

  const back = <LinkButton label={`← ${membershipsCopy.title}`} onPress={onBack} />;
  if (data.status !== "ready") {
    return (
      <Screen title={membershipsCopy.title} header={header}>
        {back}
        {data.status === "loading" ? <Skeleton lines={5} label="Cargando membresía" /> : null}
        {data.status === "error" || data.status === "permission_denied" ? (
          <EmptyState title={data.message} />
        ) : null}
      </Screen>
    );
  }

  const { membership: m, balance, redemptions, events, clientName, vehicleLabel } = data.data;
  const today = todayIn(center.timezone);
  const status = membershipStatus(m, today);
  const badge = presentStatus(status);
  const origin = m.detailCenterId === center.id;
  const actions = origin
    ? membershipActions(status, {
        write: canInActiveCenter(state, "memberships.write"),
        manage: canInActiveCenter(state, "memberships.manage"),
      })
    : [];
  const folios = new Map(
    events
      .filter((e) => e.kind === "redencion" && typeof e.data?.["redemption_id"] === "string")
      .map((e) => [e.data!["redemption_id"] as string, String(e.data!["folio"] ?? "")]),
  );

  return (
    <Screen
      title={`${m.number} · ${clientName}`}
      description={`${vehicleLabel} · ${m.planName}`}
      header={header}
    >
      {back}
      <Badge label={badge.label} tone={badge.tone} />
      <View style={styles.kpis}>
        <KpiCard
          label={membershipsCopy.plan}
          value={`${PLAN_TIER_LABELS[m.planTier]} · ${m.planName}`}
          caption={REDEEM_SCOPE_LABELS[m.redeemScope]}
        />
        <KpiCard
          label={membershipsCopy.price}
          value={pricePerPeriod(m.price, m.periodMonths)}
          caption="Condiciones congeladas"
        />
        <KpiCard
          label={membershipsCopy.nextRenewal}
          value={formatDateOnly(m.endsOn)}
          caption={
            status === "cancelada" || status === "suspendida" ? badge.label : renewalCaption(m.endsOn, today)
          }
        />
      </View>
      <Card title={membershipsCopy.balanceTitle}>
        <List
          caption={membershipsCopy.balanceTitle}
          rows={balance.map(presentBalance)}
          rowKey={(b) => b.key}
          emptyMessage={membershipsCopy.balanceEmpty}
          columns={[
            { key: "service", header: "Servicio", value: (b) => b.service },
            { key: "usage", header: membershipsCopy.used, value: (b) => b.usage },
            { key: "remaining", header: membershipsCopy.remaining, value: (b) => String(b.remaining) },
            { key: "period", header: membershipsCopy.period, value: (b) => b.period },
          ]}
        />
      </Card>
      {actions.length > 0 ? (
        <ActionsCard
          key={version}
          membershipId={m.id}
          planId={m.planId}
          organizationId={m.organizationId}
          status={status}
          actions={actions}
          onDone={reload}
        />
      ) : null}
      <Card title={membershipsCopy.redemptionsTitle}>
        <List
          caption={membershipsCopy.redemptionsTitle}
          rows={redemptions.map((r) => presentRedemption(r, center.timezone, folios.get(r.id)))}
          rowKey={(r) => r.id}
          emptyMessage={membershipsCopy.redemptionsEmpty}
          columns={[
            { key: "when", header: "Fecha", value: (r) => r.when },
            { key: "service", header: "Servicio", value: (r) => r.service },
            { key: "order", header: "OS", value: (r) => r.order || "—" },
            { key: "amount", header: "Importe", value: (r) => r.amount },
            { key: "status", header: "Estado", value: (r) => r.status },
          ]}
        />
      </Card>
      <Card title={membershipsCopy.historyTitle}>
        <List
          caption={membershipsCopy.historyTitle}
          rows={events.map((e) => presentMembershipEvent(e, center.timezone))}
          rowKey={(e) => e.key}
          emptyMessage="—"
          columns={[
            { key: "when", header: "Fecha", value: (e) => e.when },
            { key: "what", header: "Evento", value: (e) => e.what },
            { key: "detail", header: "Detalle", value: (e) => e.detail },
          ]}
        />
      </Card>
    </Screen>
  );
}

function ActionsCard({
  membershipId,
  planId,
  organizationId,
  status,
  actions,
  onDone,
}: {
  membershipId: string;
  planId: string;
  organizationId: string;
  status: MembershipStatus;
  actions: MembershipAction[];
  onDone: () => void;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const [requestId] = useState(newRequestId);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [newPlan, setNewPlan] = useState("");
  const [payment, setPayment] = useState("");
  const [open, setOpen] = useState<MembershipAction | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const renew = actions.find((a) => a.kind === "renew");

  useEffect(() => {
    if (!client || !renew || !canChangePlanOnRenewal(status)) return;
    void createMembershipRepository(client)
      .listPlans(organizationId)
      .then((r) => r.ok && setPlans(r.data));
  }, [client, renew, status, organizationId]);

  const done = (message: string) => {
    toast({ message, tone: "success" });
    onDone();
  };

  const doRenew = async () => {
    if (!client) return;
    const parsed = renewMembershipSchema.safeParse({
      membershipId,
      requestId,
      planId: newPlan,
      paymentReference: payment,
    });
    if (!parsed.success) return setError(Object.values(fieldErrors(parsed.error))[0] ?? "Datos inválidos");
    setBusy(true);
    const r = await createMembershipRepository(client).renew(parsed.data);
    setBusy(false);
    if (!r.ok) return setError(membershipErrorMessage(r.error));
    done(membershipsCopy.renewed);
  };

  const doState = async (a: MembershipAction) => {
    if (!client || !a.state) return;
    const parsed = membershipStateSchema.safeParse({ membershipId, state: a.state, reason });
    if (!parsed.success) return setError(fieldErrors(parsed.error).reason ?? "Datos inválidos");
    setBusy(true);
    const r = await createMembershipRepository(client).setState(parsed.data);
    setBusy(false);
    if (!r.ok) return setError(membershipErrorMessage(r.error));
    done(membershipsCopy.saved);
  };

  return (
    <Card title={membershipsCopy.actionsTitle}>
      {renew ? (
        <>
          {canChangePlanOnRenewal(status) && plans.length > 0 ? (
            <Select
              label={membershipsCopy.renewChangePlan}
              options={plans.map((p) => ({
                value: p.id === planId ? "" : p.id,
                label: `${presentPlan(p).name} · ${presentPlan(p).price}${p.id === planId ? ` (${membershipsCopy.samePlan})` : ""}`,
              }))}
              value={newPlan}
              onChange={setNewPlan}
            />
          ) : null}
          <Field
            label={membershipsCopy.paymentReference}
            hint={membershipsCopy.paymentHint}
            value={payment}
            onChangeText={setPayment}
          />
          <Button label={renew.label} loading={busy} onPress={() => void doRenew()} />
        </>
      ) : null}
      {actions
        .filter((a) => a.kind !== "renew")
        .map((a) => (
          <Button
            key={a.kind}
            label={a.label}
            variant={a.variant}
            disabled={busy}
            onPress={() => setOpen(a)}
          />
        ))}
      {open ? (
        <>
          <Field label={membershipsCopy.reason} value={reason} onChangeText={setReason} />
          <Button
            label={open.label}
            variant={open.variant}
            loading={busy}
            onPress={() => void doState(open)}
          />
        </>
      ) : null}
      <Notice tone="danger" text={error} />
    </Card>
  );
}

const styles = StyleSheet.create({ kpis: { gap: space.md } });
