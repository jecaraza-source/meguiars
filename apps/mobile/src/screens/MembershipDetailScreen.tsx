import {
  activeCenterAccess,
  canChangePlanOnRenewal,
  canInActiveCenter,
  canSellMemberships,
  formatDateOnly,
  membershipActions,
  membershipErrorMessage,
  membershipPaymentsCopy,
  membershipsCopy,
  membershipStatus,
  newRequestId,
  paymentErrorMessage,
  paymentsCopy,
  PLAN_TIER_LABELS,
  presentBalance,
  presentMembershipEvent,
  presentMembershipPayment,
  presentPlan,
  presentRedemption,
  presentStatus,
  pricePerPeriod,
  REDEEM_SCOPE_LABELS,
  renewalCaption,
  todayIn,
  type MembershipAction,
  type MembershipDetail,
  type MembershipPayment,
  type MembershipPlan,
  type MembershipStatus,
  type ViewState,
} from "@meguiars/domain";
import {
  createMembershipRepository,
  createPaymentRepository,
  type MeguiarsSupabaseClient,
} from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import {
  fieldErrors,
  membershipStateSchema,
  renewMembershipPaidSchema,
  reversePaymentSchema,
} from "@meguiars/validation";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { MembershipPaymentFields, useMembershipPayment } from "@/components/MembershipPaymentFields";
import { Button, Field, LinkButton, Select } from "@/ui/controls";
import { Badge, Card, EmptyState, KpiCard, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
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
        write: canSellMemberships((c) => canInActiveCenter(state, c)),
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
          price={m.price}
          organizationId={m.organizationId}
          status={status}
          actions={actions}
          onDone={reload}
        />
      ) : null}
      {canInActiveCenter(state, "payments.read") ? (
        <ReceiptsCard
          key={`receipts-${version}`}
          membershipId={m.id}
          timeZone={center.timezone}
          canReverse={canInActiveCenter(state, "payments.reverse")}
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

/** Recibos de la membresía y reembolso (equivale a la tarjeta de recibos en web). */
function ReceiptsCard({
  membershipId,
  timeZone,
  canReverse,
  onDone,
}: {
  membershipId: string;
  timeZone: string;
  canReverse: boolean;
  onDone: () => void;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const [list, setList] = useState<ViewState<MembershipPayment[]>>({ status: "loading" });
  const [reversing, setReversing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void createMembershipRepository(client)
      .payments(membershipId)
      .then((r) => {
        if (!active) return;
        setList(
          r.ok
            ? { status: "ready", data: r.data }
            : { status: "error", message: paymentErrorMessage(r.error) },
        );
      });
    return () => {
      active = false;
    };
  }, [client, membershipId]);

  const reverse = async (paymentId: string) => {
    if (!client) return;
    const parsed = reversePaymentSchema.safeParse({ paymentId, reason });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? null);
    setBusy(true);
    const r = await createPaymentRepository(client).reverse(parsed.data);
    setBusy(false);
    if (!r.ok) return setError(paymentErrorMessage(r.error));
    toast({ message: paymentsCopy.reverseDone, tone: "success" });
    onDone();
  };

  return (
    <Card title={membershipPaymentsCopy.receiptsTitle}>
      {list.status === "loading" ? <Skeleton lines={2} label="Cargando recibos" /> : null}
      {list.status === "error" ? <Notice tone="danger" text={list.message} /> : null}
      {list.status === "ready" && list.data.length === 0 ? (
        <Text style={textStyle("bodySmall", "muted")}>{membershipPaymentsCopy.receiptsEmpty}</Text>
      ) : null}
      {list.status === "ready"
        ? list.data.map((p) => {
            const r = presentMembershipPayment(p, timeZone);
            return (
              <View key={r.id} style={styles.receipt}>
                <Text style={textStyle("label")}>
                  {r.folio} · {r.kind} · {r.amount}
                </Text>
                <Badge label={r.status} tone={r.statusTone} />
                <Text style={textStyle("bodySmall")}>
                  {r.methods} · {r.period}
                </Text>
                <Text style={textStyle("caption", "muted")}>{r.when}</Text>
                {canReverse && r.valid && reversing !== r.id ? (
                  <LinkButton label={paymentsCopy.reverse} onPress={() => setReversing(r.id)} />
                ) : null}
                {canReverse && reversing === r.id ? (
                  <View style={styles.receipt}>
                    <Text style={textStyle("bodySmall", "muted")}>{membershipPaymentsCopy.refundHint}</Text>
                    <Field
                      label={paymentsCopy.reverseReason}
                      value={reason}
                      onChangeText={setReason}
                      maxLength={500}
                    />
                    <Button
                      label={paymentsCopy.reverseConfirm}
                      variant="danger"
                      loading={busy}
                      onPress={() => void reverse(r.id)}
                    />
                  </View>
                ) : null}
              </View>
            );
          })
        : null}
      <Notice tone="danger" text={error} />
    </Card>
  );
}

function ActionsCard({
  membershipId,
  planId,
  price,
  organizationId,
  status,
  actions,
  onDone,
}: {
  membershipId: string;
  planId: string;
  /** Precio congelado: se cobra al renovar antes de vencer. */
  price: number;
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
  const [open, setOpen] = useState<MembershipAction | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const renew = actions.find((a) => a.kind === "renew");
  // Vencida: se reinicia con el precio vigente del plan elegido (o del mismo plan).
  const renewPrice = canChangePlanOnRenewal(status)
    ? (plans.find((p) => p.id === (newPlan || planId))?.price ?? price)
    : price;
  const payment = useMembershipPayment(renewPrice);

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
    const parsed = renewMembershipPaidSchema.safeParse({
      membershipId,
      requestId,
      planId: newPlan,
      ...payment.payload,
    });
    if (!parsed.success) return setError(Object.values(fieldErrors(parsed.error))[0] ?? "Datos inválidos");
    setBusy(true);
    const r = await createMembershipRepository(client).renewPaid(parsed.data);
    setBusy(false);
    if (!r.ok) return setError(membershipErrorMessage(r.error));
    done(membershipPaymentsCopy.renewed(r.data.receipt.receiptFolio));
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
          <MembershipPaymentFields price={renewPrice} values={payment.values} onChange={payment.setValues} />
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

const styles = StyleSheet.create({ kpis: { gap: space.md }, receipt: { gap: space.xs } });
