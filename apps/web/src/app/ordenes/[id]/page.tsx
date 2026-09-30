import {
  b2bCopy,
  BILLING_MODEL_LABELS,
  formatMoney,
  upsellStage,
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
  PAYABLE_ORDER_STATUSES,
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
  createB2bRepository,
  createMembershipRepository,
  createPaymentRepository,
  createUpsellRepository,
  createServiceOrderRepository,
} from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { OrderDetailsForm, OrderDiscounts, OrderLines, OrderStatusPanel } from "@/components/order-forms";
import { OrderPaymentsCard } from "@/components/order-payments";
import { ApplyB2bForm } from "@/components/b2b-forms";
import { UpsellCard } from "@/components/upsell-forms";
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
  // B2B: cuenta y convenio de la OS; o cuentas aplicables si la OS abierta es de una empresa con convenio.
  const b2b = createB2bRepository(supabase);
  const b2bInfo = await b2b.orderInfo(order.id);
  const applicable =
    canWrite && order.status === "abierta" && b2bInfo.ok && !b2bInfo.data
      ? await b2b
          .accountsForCenter(center.id)
          .then((r) => (r.ok ? r.data.filter((a) => a.clientId === order.clientId) : []))
      : [];
  // Sugerencias de venta: opcionales; si fallan, la tarjeta no se muestra (nunca bloquean la OS).
  const suggestions =
    canWrite && upsellStage(order.status)
      ? await createUpsellRepository(supabase)
          .suggestions(order.id)
          .then((r) => (r.ok ? r.data : []))
          .catch(() => [])
      : [];
  // Cobranza: recibos de la OS y, para cobrar, si la membresía aplica como forma de pago.
  const paymentsRepo = createPaymentRepository(supabase);
  const canReadPayments = canInActiveCenter(state, "payments.read");
  // Se evalúa por estatus (no por saldo): el formulario sigue montado tras el cobro que salda la OS.
  const canPay = canInActiveCenter(state, "payments.write") && PAYABLE_ORDER_STATUSES.includes(order.status);
  const [payments, hasMembership] = await Promise.all([
    canReadPayments ? paymentsRepo.orderPayments(order.id) : Promise.resolve(null),
    canPay && !order.b2bAccountId
      ? paymentsRepo.hasActiveMembership(order.clientId, todayIn(center.timezone)).then((r) => r.ok && r.data)
      : Promise.resolve(false),
  ]);
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

      <UpsellCard
        suggestions={suggestions}
        orderId={order.id}
        version={order.version}
        clientId={order.clientId}
      />

      {(b2bInfo.ok && b2bInfo.data) || applicable.length > 0 ? (
        <Card title={b2bCopy.orderCardTitle}>
          {b2bInfo.ok && b2bInfo.data ? (
            <div className="flex flex-col gap-xs text-sm" data-testid="order-b2b">
              <span>
                {b2bCopy.orderAccount}:{" "}
                {canInActiveCenter(state, "b2b.read") ? (
                  <Link href={`/comercial/b2b/${b2bInfo.data.accountId}`} className="underline">
                    {b2bInfo.data.accountName}
                  </Link>
                ) : (
                  <strong>{b2bInfo.data.accountName}</strong>
                )}
              </span>
              <span>
                {b2bCopy.orderAgreement}: {b2bInfo.data.agreementName ?? "—"}
                {b2bInfo.data.billingModel ? ` · ${BILLING_MODEL_LABELS[b2bInfo.data.billingModel]}` : ""}
              </span>
              {order.items
                .filter((i) => i.priceSource === "convenio")
                .map((i) => (
                  <span key={i.id} className="text-muted">
                    {i.serviceName}: {formatMoney(i.unitPrice)} {b2bCopy.convenio.toLowerCase()}
                    {i.listUnitPrice != null
                      ? ` (${b2bCopy.listPrice.toLowerCase()} ${formatMoney(i.listUnitPrice)})`
                      : ""}
                  </span>
                ))}
            </div>
          ) : (
            <ApplyB2bForm
              orderId={order.id}
              version={order.version}
              accounts={applicable}
              purchaseOrder={order.channelReference}
            />
          )}
        </Card>
      ) : null}

      {order.items.some((i) => i.priceSource === "cotizacion") ? (
        <Card title="Precio cotizado">
          <div className="flex flex-col gap-xs text-sm" data-testid="order-quoted-prices">
            <p className="text-muted">
              Esta OS viene de una reserva cotizada: se respeta el precio y los descuentos autorizados de la
              cotización.
            </p>
            {order.items
              .filter((i) => i.priceSource === "cotizacion")
              .map((i) => (
                <span key={i.id}>
                  {i.serviceName}: {formatMoney(i.unitPrice)} cotizado
                  {i.listUnitPrice != null && i.listUnitPrice !== i.unitPrice
                    ? ` (lista hoy ${formatMoney(i.listUnitPrice)})`
                    : ""}
                </span>
              ))}
          </div>
        </Card>
      ) : null}

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

      {order.status !== "abierta" ? (
        <OrderPaymentsCard
          order={order}
          timeZone={center.timezone}
          payments={payments}
          canRead={canReadPayments}
          canWrite={canPay}
          canReverse={canInActiveCenter(state, "payments.reverse")}
          hasActiveMembership={hasMembership}
          requestId={newRequestId()}
        />
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
