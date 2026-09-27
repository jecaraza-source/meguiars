import {
  canInActiveCenter,
  pipelineCopy,
  activeCenterAccess,
  addDays,
  b2bCopy,
  b2bErrorMessage,
  B2B_ACCOUNT_STATUS_LABELS,
  B2B_ACCOUNT_STATUS_TONES,
  B2B_PAYMENT_METHOD_LABELS,
  can,
  canInCenter,
  formatDateInCenterTimeZone,
  formatDateOnly,
  formatMoney,
  INVOICE_STATUS_LABELS,
  newRequestId,
  presentAccountOrder,
  presentAgreement,
  statementCards,
  todayIn,
} from "@meguiars/domain";
import { createB2bRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import {
  AccountForm,
  AgreementForm,
  B2bPaymentForm,
  ContactForm,
  InvoiceForm,
  VehicleToggle,
  VoidBillingButton,
} from "@/components/b2b-forms";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState, KpiCard, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Ficha de la cuenta B2B: estado de cuenta, convenios, vehículos, contactos, OS y facturación. */
export default async function B2bAccountPage({ params, searchParams }: PageProps<"/comercial/b2b/[id]">) {
  const state = await requireScreen("b2bAccountDetail");
  const center = activeCenterAccess(state)!.center;
  const { id } = await params;
  const created = (await searchParams).nueva === "1";
  const repo = createB2bRepository((await createSupabaseServerClient())!);
  const today = todayIn(center.timezone);
  const [detail, statement, orders, billing] = await Promise.all([
    repo.getAccount(id),
    repo.statement(id),
    repo.accountOrders(id, addDays(today, -89), today),
    repo.billing(id),
  ]);
  if (!detail.ok) {
    return (
      <AppShell state={state} screen="b2bAccountDetail" title={b2bCopy.title}>
        <EmptyState
          title={b2bCopy.notFound}
          action={<ButtonLink href="/comercial/b2b" label={b2bCopy.title} />}
        />
      </AppShell>
    );
  }
  const { account, contacts, agreements, vehicles } = detail.data;
  // Administrar y facturar se deciden en el centro gestor de la cuenta (la base lo vuelve a validar).
  const canWrite = canInCenter(state, account.homeDetailCenterId, "b2b.write");
  const canBill = canInCenter(state, account.homeDetailCenterId, "b2b.billing");
  const centerNames = new Map(state.access.map((a) => [a.center.id, a.center.name]));
  const centerName = (cid: string) => centerNames.get(cid) ?? "Otro centro";
  const writableCenters = state.access
    .filter((a) => a.center.active && can([...a.roles, ...a.corporateRoles], "b2b.write"))
    .map((a) => ({ id: a.center.id, name: a.center.name }));
  if (!writableCenters.some((c) => c.id === account.homeDetailCenterId))
    writableCenters.unshift({ id: account.homeDetailCenterId, name: centerName(account.homeDetailCenterId) });
  const orgCenters = state.access
    .filter((a) => a.center.organizationId === account.organizationId && a.center.active)
    .map((a) => ({ id: a.center.id, name: a.center.name }));
  const orderRows = orders.ok
    ? orders.data.map((o) =>
        presentAccountOrder(o, (iso) => formatDateInCenterTimeZone(iso, center.timezone)),
      )
    : [];
  const invoiceable = orders.ok
    ? orders.data
        .filter((o) => o.status === "entregada" && !o.invoiceId)
        .map((o) => ({ id: o.id, folio: o.folio, total: o.total }))
    : [];

  return (
    <AppShell
      state={state}
      screen="b2bAccountDetail"
      title={account.name}
      description={[account.legalName, account.rfc].filter(Boolean).join(" · ")}
    >
      <div className="flex flex-wrap items-center gap-sm">
        <Link href="/comercial/b2b" className="text-sm underline">
          ← {b2bCopy.title}
        </Link>
        <Badge
          label={B2B_ACCOUNT_STATUS_LABELS[account.status]}
          tone={B2B_ACCOUNT_STATUS_TONES[account.status]}
        />
        {canWrite && canInActiveCenter(state, "pipeline.write") ? (
          <Link
            href={`/comercial/pipeline/nueva?tipo=b2b&cuenta=${account.id}`}
            className="text-sm underline"
          >
            {pipelineCopy.newOpportunity}
          </Link>
        ) : null}
      </div>
      {created ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
          {b2bCopy.created}
        </p>
      ) : null}

      <section aria-label={b2bCopy.statementTitle} className="grid gap-lg md:grid-cols-2 lg:grid-cols-4">
        {statement.ok ? (
          statementCards(statement.data).map((k) => (
            <KpiCard key={k.label} label={k.label} value={k.value} caption={k.caption} />
          ))
        ) : (
          <p role="alert" className="text-sm">
            {b2bErrorMessage(statement.error)}
          </p>
        )}
      </section>

      <Card title={b2bCopy.agreementsTitle}>
        {agreements.length === 0 ? <EmptyState title={b2bCopy.agreementsEmpty} /> : null}
        <ul className="flex flex-col gap-sm" aria-label={b2bCopy.agreementsTitle}>
          {agreements.map((g) => {
            const v = presentAgreement(g, today, centerName);
            return (
              <li key={g.id} className="mg-card flex flex-col gap-xs">
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <Link href={`/comercial/b2b/convenios/${g.id}`} className="font-medium underline">
                    {v.name}
                  </Link>
                  <Badge label={v.state} tone={v.stateTone} />
                </div>
                <span className="text-sm">
                  {v.model} · {v.validity} · {v.vehicles}
                </span>
                <span className="text-sm text-muted">
                  Pago: {v.terms} · Cuota: {v.fee} · Centros: {v.centers}
                </span>
              </li>
            );
          })}
        </ul>
        {canWrite ? (
          <details className="mt-md">
            <summary className="cursor-pointer text-sm font-medium">{b2bCopy.newAgreement}</summary>
            <div className="mt-md">
              <AgreementForm
                accountId={account.id}
                requestId={newRequestId()}
                centers={orgCenters}
                today={today}
              />
            </div>
          </details>
        ) : null}
      </Card>

      <Card title={b2bCopy.vehiclesTitle}>
        {vehicles.length === 0 ? <EmptyState title={b2bCopy.vehiclesEmpty} /> : null}
        <ul className="flex flex-col gap-sm" aria-label={b2bCopy.vehiclesTitle}>
          {vehicles.map((v) => (
            <li
              key={v.vehicleId}
              className="flex flex-col gap-xs border-b border-border pb-sm"
              data-testid="b2b-vehicle"
            >
              <div className="flex flex-wrap items-center justify-between gap-sm">
                <span>{v.label}</span>
                <Badge
                  label={v.authorized ? b2bCopy.authorized : b2bCopy.notAuthorized}
                  tone={v.authorized ? "success" : "neutral"}
                />
              </div>
              {v.costCenter || v.driverName ? (
                <span className="text-sm text-muted">
                  {[v.costCenter, v.driverName].filter(Boolean).join(" · ")}
                </span>
              ) : null}
              {canWrite ? <VehicleToggle accountId={account.id} vehicle={v} /> : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card title={b2bCopy.ordersTitle} subtitle="Últimos 90 días">
        <Table
          caption={b2bCopy.ordersTitle}
          rows={orderRows}
          rowKey={(o) => o.id}
          emptyMessage={b2bCopy.ordersEmpty}
          columns={[
            { key: "folio", header: "Folio", value: (o) => o.folio },
            { key: "date", header: "Fecha", value: (o) => `${o.date} · ${o.center}` },
            { key: "vehicle", header: "Vehículo", value: (o) => o.vehicle },
            { key: "status", header: "Estatus", value: (o) => o.status },
            { key: "po", header: b2bCopy.purchaseOrder, value: (o) => o.purchaseOrder },
            { key: "evidences", header: b2bCopy.evidences, value: (o) => o.evidences, align: "end" },
            { key: "invoice", header: "Factura", value: (o) => o.invoice },
            { key: "total", header: "Total", value: (o) => o.total, align: "end" },
          ]}
        />
      </Card>

      <Card title={b2bCopy.billingTitle}>
        {billing.ok ? (
          <div className="flex flex-col gap-md">
            <h3 className="font-medium">Cortes</h3>
            {billing.data.invoices.length === 0 ? (
              <p className="text-sm text-muted">{b2bCopy.invoicesEmpty}</p>
            ) : null}
            <ul className="flex flex-col gap-sm" aria-label="Cortes">
              {billing.data.invoices.map((i) => (
                <li key={i.id} className="flex flex-col gap-xs border-b border-border pb-sm">
                  <span>
                    <strong>{i.reference}</strong> · {formatMoney(i.amount)} · emitido{" "}
                    {formatDateOnly(i.issuedOn)} · vence {formatDateOnly(i.dueOn)} ·{" "}
                    {INVOICE_STATUS_LABELS[i.status]}
                    {i.voidReason ? ` (${i.voidReason})` : ""}
                  </span>
                  {canBill && i.status === "emitida" ? (
                    <VoidBillingButton
                      accountId={account.id}
                      kind="invoice"
                      id={i.id}
                      label={b2bCopy.voidInvoice}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
            <h3 className="font-medium">Pagos</h3>
            {billing.data.payments.length === 0 ? (
              <p className="text-sm text-muted">{b2bCopy.paymentsEmpty}</p>
            ) : null}
            <ul className="flex flex-col gap-sm" aria-label="Pagos">
              {billing.data.payments.map((p) => (
                <li key={p.id} className="flex flex-col gap-xs border-b border-border pb-sm">
                  <span>
                    {formatMoney(p.amount)} · {B2B_PAYMENT_METHOD_LABELS[p.method]} ·{" "}
                    {formatDateOnly(p.paidOn)}
                    {p.reference ? ` · ${p.reference}` : ""}
                    {p.voidedAt ? ` · Anulado (${p.voidReason})` : ""}
                  </span>
                  {canBill && !p.voidedAt ? (
                    <VoidBillingButton
                      accountId={account.id}
                      kind="payment"
                      id={p.id}
                      label={b2bCopy.voidPayment}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
            {canBill ? (
              <div className="grid gap-lg lg:grid-cols-2">
                <div>
                  <h3 className="mb-sm font-medium">{b2bCopy.newInvoice}</h3>
                  <InvoiceForm
                    accountId={account.id}
                    requestId={newRequestId()}
                    orders={invoiceable}
                    feePending={
                      statement.ok ? Math.max(0, statement.data.feesAccrued - statement.data.feesInvoiced) : 0
                    }
                    today={today}
                  />
                </div>
                <div>
                  <h3 className="mb-sm font-medium">{b2bCopy.newPayment}</h3>
                  <B2bPaymentForm
                    accountId={account.id}
                    requestId={newRequestId()}
                    invoices={billing.data.invoices}
                    today={today}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p role="alert" className="text-sm">
            {b2bErrorMessage(billing.error)}
          </p>
        )}
      </Card>

      <Card title={b2bCopy.contactsTitle}>
        {contacts.length === 0 ? <p className="text-sm text-muted">{b2bCopy.contactsEmpty}</p> : null}
        <ul className="flex flex-col gap-xs" aria-label={b2bCopy.contactsTitle}>
          {contacts
            .filter((c) => c.active)
            .map((c) => (
              <li key={c.id} className="text-sm">
                <strong>{c.fullName}</strong>
                {c.title ? ` · ${c.title}` : ""}
                {c.phone ? ` · ${c.phone}` : ""}
                {c.email ? ` · ${c.email}` : ""}
                {c.isPrimary ? " · Principal" : ""}
              </li>
            ))}
        </ul>
        {canWrite ? (
          <details className="mt-md">
            <summary className="cursor-pointer text-sm font-medium">{b2bCopy.addContact}</summary>
            <div className="mt-md">
              <ContactForm accountId={account.id} />
            </div>
          </details>
        ) : null}
      </Card>

      <Card title={b2bCopy.accountData}>
        {canWrite ? (
          <AccountForm
            requestId={newRequestId()}
            account={account}
            centers={writableCenters}
            defaultCenterId={center.id}
          />
        ) : (
          <dl className="grid grid-cols-2 gap-xs text-sm">
            <dt className="text-muted">{b2bCopy.homeCenter}</dt>
            <dd>{centerName(account.homeDetailCenterId)}</dd>
            <dt className="text-muted">RFC</dt>
            <dd>{account.rfc ?? "—"}</dd>
            <dt className="text-muted">{b2bCopy.billingEmail}</dt>
            <dd>{account.billingEmail ?? "—"}</dd>
          </dl>
        )}
      </Card>
    </AppShell>
  );
}
