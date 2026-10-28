import {
  activeCenterAccess,
  canInActiveCenter,
  canSellMemberships,
  formatDateOnly,
  guardScreen,
  membershipActions,
  membershipPaymentsCopy,
  membershipsCopy,
  membershipStatus,
  newRequestId,
  paymentErrorMessage,
  PLAN_TIER_LABELS,
  presentBalance,
  presentMembershipEvent,
  presentMembershipPayment,
  presentRedemption,
  presentStatus,
  pricePerPeriod,
  REDEEM_SCOPE_LABELS,
  renewalCaption,
  todayIn,
} from "@meguiars/domain";
import { createMembershipRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { MembershipActions } from "@/components/membership-forms";
import { ReversePaymentForm } from "@/components/payment-forms";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState, KpiCard, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function MembershipPage({
  params,
  searchParams,
}: PageProps<"/comercial/membresias/[id]">) {
  const state = await requireScreen("membershipDetail");
  const center = activeCenterAccess(state)!.center;
  const { id } = await params;
  const query = await searchParams;
  const created = query.nueva === "1";
  const receiptFolio = typeof query.recibo === "string" ? query.recibo : null;
  const repo = createMembershipRepository((await createSupabaseServerClient())!);
  const result = await repo.get(id);
  if (!result.ok) {
    return (
      <AppShell state={state} screen="membershipDetail" title={membershipsCopy.title}>
        <EmptyState
          title={membershipsCopy.notFound}
          action={
            guardScreen(state, "memberships").allow ? (
              <ButtonLink href="/comercial/membresias" label={membershipsCopy.title} />
            ) : undefined
          }
        />
      </AppShell>
    );
  }
  const { membership: m, balance, redemptions, events, clientName, vehicleLabel } = result.data;
  const today = todayIn(center.timezone);
  const status = membershipStatus(m, today);
  const badge = presentStatus(status);
  // Renovar y cambiar el estado es del centro de origen.
  const origin = m.detailCenterId === center.id;
  const actions = origin
    ? membershipActions(status, {
        write: canSellMemberships((c) => canInActiveCenter(state, c)),
        manage: canInActiveCenter(state, "memberships.manage"),
      })
    : [];
  const canReadPayments = canInActiveCenter(state, "payments.read");
  const canReverse = canInActiveCenter(state, "payments.reverse");
  const [plans, payments] = await Promise.all([
    actions.some((a) => a.kind === "renew") ? repo.listPlans(m.organizationId) : null,
    canReadPayments ? repo.payments(m.id) : null,
  ]);
  const folios = new Map(
    events
      .filter((e) => e.kind === "redencion" && typeof e.data?.["redemption_id"] === "string")
      .map((e) => [e.data!["redemption_id"] as string, String(e.data!["folio"] ?? "")]),
  );

  return (
    <AppShell
      state={state}
      screen="membershipDetail"
      title={`${m.number} · ${clientName}`}
      description={`${vehicleLabel} · ${PLAN_TIER_LABELS[m.planTier]} · ${m.planName}`}
    >
      {guardScreen(state, "memberships").allow ? (
        <Link href="/comercial/membresias" className="text-sm underline">
          ← {membershipsCopy.title}
        </Link>
      ) : (
        <Link href={`/clientes/${m.clientId}`} className="text-sm underline">
          ← {clientName}
        </Link>
      )}
      {created ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
          {receiptFolio ? membershipPaymentsCopy.sold(receiptFolio) : membershipsCopy.created}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-sm">
        <Badge label={badge.label} tone={badge.tone} />
        <span className="text-sm text-muted">{REDEEM_SCOPE_LABELS[m.redeemScope]}</span>
      </div>
      <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={membershipsCopy.plan}
          value={`${PLAN_TIER_LABELS[m.planTier]} · ${m.planName}`}
          caption={m.planCode}
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
        <KpiCard
          label="Renovaciones"
          value={String(m.renewals)}
          caption={`Alta ${formatDateOnly(m.startedOn)}`}
        />
      </div>

      <Card title={membershipsCopy.balanceTitle}>
        <Table
          caption={membershipsCopy.balanceTitle}
          rows={balance.map(presentBalance)}
          rowKey={(b) => b.key}
          emptyMessage={membershipsCopy.balanceEmpty}
          columns={[
            { key: "service", header: "Servicio", value: (b) => b.service },
            { key: "usage", header: membershipsCopy.used, value: (b) => b.usage },
            {
              key: "remaining",
              header: membershipsCopy.remaining,
              value: (b) => String(b.remaining),
              align: "end",
            },
            { key: "period", header: membershipsCopy.period, value: (b) => b.period },
          ]}
        />
      </Card>

      {actions.length > 0 || origin ? (
        <Card title={membershipsCopy.actionsTitle}>
          <MembershipActions
            membershipId={m.id}
            status={status}
            actions={actions}
            plans={plans?.ok ? plans.data : []}
            currentPlanId={m.planId}
            currentPrice={m.price}
            requestId={newRequestId()}
          />
        </Card>
      ) : null}

      {payments ? (
        <Card title={membershipPaymentsCopy.receiptsTitle}>
          {!payments.ok ? (
            <p role="alert" className="text-sm">
              {paymentErrorMessage(payments.error)}
            </p>
          ) : payments.data.length === 0 ? (
            <p className="text-sm text-muted">{membershipPaymentsCopy.receiptsEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-sm">
              {payments.data.map((p) => {
                const r = presentMembershipPayment(p, center.timezone);
                return (
                  <li
                    key={r.id}
                    className="flex flex-col gap-xs border-b border-border pb-sm text-sm"
                    data-testid="membership-receipt"
                  >
                    <span className="flex flex-wrap items-center gap-xs">
                      <Link href={`/finanzas/cobranza/recibos/${r.id}`} className="font-medium underline">
                        {r.folio}
                      </Link>
                      · {r.kind} · {r.amount}
                      <Badge label={r.status} tone={r.statusTone} />
                    </span>
                    <span>
                      {r.methods} · {r.period}
                    </span>
                    <span className="text-xs text-muted">{r.when}</span>
                    {canReverse ? (
                      <ReversePaymentForm
                        paymentId={r.id}
                        membershipId={m.id}
                        hint={membershipPaymentsCopy.refundHint}
                        reversed={!r.valid}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}

      <Card title={membershipsCopy.redemptionsTitle}>
        <Table
          caption={membershipsCopy.redemptionsTitle}
          rows={redemptions.map((r) => presentRedemption(r, center.timezone, folios.get(r.id)))}
          rowKey={(r) => r.id}
          emptyMessage={membershipsCopy.redemptionsEmpty}
          columns={[
            { key: "when", header: "Fecha", value: (r) => r.when },
            { key: "service", header: "Servicio", value: (r) => r.service },
            { key: "order", header: "OS", value: (r) => r.order || "—" },
            { key: "amount", header: "Importe", value: (r) => r.amount, align: "end" },
            { key: "status", header: "Estado", value: (r) => r.status },
          ]}
        />
      </Card>

      <Card title={membershipsCopy.historyTitle}>
        <Table
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
    </AppShell>
  );
}
