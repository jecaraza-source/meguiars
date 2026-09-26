import {
  activeCenterAccess,
  activeRoles,
  canInActiveCenter,
  executionCopy,
  formatDateOnly,
  membershipsCopy,
  membershipStatus,
  newRequestId,
  presentBalance,
  presentRedemption,
  presentStatus,
  redeemableLines,
  renewalCaption,
  todayIn,
  formatDateInCenterTimeZone,
  orderStatusActions,
  ordersCopy,
  presentDiscount,
  presentHistory,
  presentOrder,
  utcToZoned,
  type BenefitBalance,
  type Membership,
  type MembershipRedemption,
  type Result,
  type ServiceOrder,
} from "@meguiars/domain";
import {
  createAgendaRepository,
  createCatalogRepository,
  createMembershipRepository,
  createServiceOrderRepository,
} from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import {
  OrderDetailsForm,
  OrderDiscounts,
  OrderLines,
  OrderStatusPanel,
  PaymentForm,
} from "@/components/order-forms";
import { OrderMembershipRedeem, VoidRedemptionForm } from "@/components/membership-forms";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState, KpiCard, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OrderPage({ params, searchParams }: PageProps<"/ordenes/[id]">) {
  const state = await requireScreen("orderDetail");
  const center = activeCenterAccess(state)!.center;
  const { id } = await params;
  const created = (await searchParams).nueva === "1";
  const supabase = (await createSupabaseServerClient())!;
  const result = await createServiceOrderRepository(supabase).get(id);
  if (!result.ok || result.data.detailCenterId !== center.id) {
    return (
      <AppShell state={state} screen="orderDetail" title={ordersCopy.folio}>
        <EmptyState
          title={ordersCopy.notFound}
          action={<ButtonLink href="/ordenes" label={ordersCopy.title} />}
        />
      </AppShell>
    );
  }
  const order = result.data;
  const view = presentOrder(order);
  const canWrite = canInActiveCenter(state, "orders.write");
  const agenda = createAgendaRepository(supabase);
  const [catalog, bays, technicians] = canWrite
    ? await Promise.all([
        createCatalogRepository(supabase).listForCenter(center.id),
        agenda.listBays(center.id),
        agenda.listTechnicians(center.id),
      ])
    : [null, null, null];
  const canMemberships = canInActiveCenter(state, "memberships.read");
  const memberships = createMembershipRepository(supabase);
  const [membership, redemptions] = canMemberships
    ? await Promise.all([memberships.forVehicle(order.vehicleId), memberships.redemptionsForOrder(order.id)])
    : [null, null];
  const lineName = (itemId: string) => order.items.find((i) => i.id === itemId)?.serviceName ?? "—";
  const promised = order.promisedAt ? utcToZoned(order.promisedAt, center.timezone) : null;

  return (
    <AppShell
      state={state}
      screen="orderDetail"
      title={view.title}
      description={`${view.subtitle} · ${view.channel} · ${formatDateInCenterTimeZone(order.createdAt, center.timezone)}`}
    >
      <Link href="/ordenes" className="text-sm underline">
        ← {ordersCopy.title}
      </Link>
      {created ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
          {ordersCopy.created}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-sm">
        <Badge label={view.status} tone={view.tone} />
        {order.appointmentId ? (
          <Link href={`/agenda/${order.appointmentId}`} className="text-sm underline">
            Cita de origen
          </Link>
        ) : null}
        <ButtonLink href={`/ordenes/${order.id}/ejecucion`} label={executionCopy.open} size="sm" />
      </div>
      <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-4">
        {view.kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} caption={k.caption} />
        ))}
      </div>

      {canWrite ? (
        <Card title={ordersCopy.statusTitle}>
          <OrderStatusPanel order={order} actions={orderStatusActions(order, activeRoles(state))} />
        </Card>
      ) : null}

      <Card title={ordersCopy.linesTitle}>
        <OrderLines
          order={order}
          services={catalog?.ok ? catalog.data : []}
          editable={canWrite && view.canEditItems}
          needsReason={view.itemsNeedReason}
        />
      </Card>

      {canMemberships ? (
        <Card title={membershipsCopy.orderCardTitle}>
          <OrderMembershipCard
            order={order}
            canWrite={canWrite}
            membership={membership}
            redemptions={redemptions}
            today={todayIn(center.timezone)}
            timeZone={center.timezone}
          />
        </Card>
      ) : null}

      <Card title={ordersCopy.discountsTitle}>
        <OrderDiscounts
          order={order}
          rows={order.discounts.map((d) => presentDiscount(d, lineName))}
          editable={canWrite && view.canDiscount}
        />
      </Card>

      {canWrite && view.canPay ? (
        <Card title={ordersCopy.paymentTitle}>
          <PaymentForm order={order} balance={view.balance} />
        </Card>
      ) : null}

      <Card title={ordersCopy.detailsTitle}>
        {canWrite && view.canEditDetails && bays?.ok && technicians?.ok && catalog?.ok ? (
          <OrderDetailsForm
            order={order}
            canChangeChannel={view.canChangeChannel}
            bays={bays.data}
            technicians={technicians.data}
            services={catalog.data}
            initial={{ promisedDate: promised?.date ?? "", promisedTime: promised?.time ?? "" }}
          />
        ) : (
          <dl className="grid gap-sm text-sm md:grid-cols-2">
            <dt className="text-muted">{ordersCopy.diagnosisLabel}</dt>
            <dd>{order.diagnosis ?? "—"}</dd>
            <dt className="text-muted">{ordersCopy.recommendationsLabel}</dt>
            <dd>{order.recommendations ?? "—"}</dd>
            <dt className="text-muted">{ordersCopy.nextVisitTitle}</dt>
            <dd>{order.nextVisitOn ?? "—"}</dd>
          </dl>
        )}
      </Card>

      <Card title={ordersCopy.historyTitle}>
        <Table
          caption={ordersCopy.historyTitle}
          rows={order.history.map((h) => presentHistory(h, center.timezone))}
          rowKey={(h) => h.key}
          emptyMessage="—"
          columns={[
            { key: "when", header: "Fecha", value: (h) => h.when },
            { key: "change", header: ordersCopy.statusFilter, value: (h) => h.change },
            { key: "reason", header: ordersCopy.reasonLabel, value: (h) => h.reason },
          ]}
        />
      </Card>
    </AppShell>
  );
}

/** Membresía del vehículo: saldo, próxima renovación, redimir y anular redenciones de esta OS. */
function OrderMembershipCard({
  order,
  canWrite,
  membership,
  redemptions,
  today,
  timeZone,
}: {
  order: ServiceOrder;
  canWrite: boolean;
  membership: Result<{ membership: Membership; balance: BenefitBalance[] } | null> | null;
  redemptions: Result<MembershipRedemption[]> | null;
  today: string;
  timeZone: string;
}) {
  if (!membership || !membership.ok) {
    return (
      <p role={membership && !membership.ok ? "alert" : undefined} className="text-sm text-muted">
        {membership && !membership.ok ? membership.error.message : membershipsCopy.orderNoMembership}
      </p>
    );
  }
  if (!membership.data) {
    return (
      <div className="flex flex-wrap items-center gap-sm text-sm">
        <span className="text-muted">{membershipsCopy.orderNoMembership}</span>
        <Link href={`/comercial/membresias/nueva?cliente=${order.clientId}`} className="underline">
          {membershipsCopy.newMembership}
        </Link>
      </div>
    );
  }
  const { membership: m, balance } = membership.data;
  const status = membershipStatus(m, today);
  const badge = presentStatus(status);
  const own = redemptions?.ok ? redemptions.data : [];
  const open = ["abierta", "autorizada", "en_proceso", "pausada", "terminada"].includes(order.status);
  const lines = canWrite && open ? redeemableLines(status, order.items, balance, own) : [];
  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-wrap items-center gap-sm text-sm">
        <Link href={`/comercial/membresias/${m.id}`} className="font-semibold underline">
          {m.number} · {m.planName}
        </Link>
        <Badge label={badge.label} tone={badge.tone} />
        <span className="text-muted">
          {membershipsCopy.nextRenewal}: {formatDateOnly(m.endsOn)} · {renewalCaption(m.endsOn, today)}
        </span>
      </div>
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
        ]}
      />
      {lines.length > 0 ? (
        <OrderMembershipRedeem
          orderId={order.id}
          version={order.version}
          membershipId={m.id}
          lines={lines}
          requestId={newRequestId()}
        />
      ) : canWrite && open ? (
        <p className="text-sm text-muted">{membershipsCopy.notRedeemable}</p>
      ) : null}
      {own.length > 0 ? (
        <ul aria-label={membershipsCopy.redemptionsTitle} className="flex flex-col gap-sm text-sm">
          {own.map((r) => {
            const view = presentRedemption(r, timeZone);
            return (
              <li key={r.id} className="mg-card flex flex-col gap-xs">
                <span className={view.voided ? "text-muted line-through" : ""}>
                  {view.service} = {view.amount}
                </span>
                <span className="text-muted">
                  {view.when} · {view.status}
                </span>
                {canWrite && open && !view.voided ? (
                  <VoidRedemptionForm orderId={order.id} version={order.version} redemptionId={r.id} />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
