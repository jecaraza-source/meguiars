import {
  addDays,
  can,
  canInCenter,
  formatMoney,
  guardScreen,
  newRequestId,
  presentAccountPayment,
  presentDocumentRow,
  presentReceivableAccount,
  presentUnbilledOrder,
  receivablesCopy,
  receivablesErrorMessage,
  receivablesExportCsv,
  todayIn,
  usableCenters,
} from "@meguiars/domain";
import { createReceivablesRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CsvExport } from "@/components/pnl-export";
import {
  AllocatePaymentButton,
  BatchForm,
  PaymentForm,
  VoidPaymentForm,
} from "@/components/receivables-forms";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, KpiCard, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Cuenta por cobrar B2B: saldo trazable, OS por agrupar, documentos, pagos y export. */
export default async function ReceivableAccountPage({ params }: PageProps<"/finanzas/cxc/cuentas/[id]">) {
  const state = await requireScreen("receivableAccount");
  const { id } = await params;
  const readable = usableCenters(state.access).filter((a) =>
    can([...a.roles, ...a.corporateRoles], "b2b.read"),
  );
  const centers = readable.map((a) => a.center.id);
  const repo = createReceivablesRepository((await createSupabaseServerClient())!);
  const accounts = await repo.accounts(centers);
  const account = accounts.ok ? accounts.data.find((a) => a.accountId === id) : undefined;
  if (!account) {
    return (
      <AppShell state={state} screen="receivableAccount" title={receivablesCopy.title}>
        {!accounts.ok ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {receivablesErrorMessage(accounts.error)}
          </p>
        ) : (
          <EmptyState
            title="La cuenta no existe o no tienes acceso a su centro gestor."
            action={<ButtonLink href="/finanzas/cxc" label={receivablesCopy.title} />}
          />
        )}
      </AppShell>
    );
  }
  const home = readable.find((a) => a.center.id === account.homeDetailCenterId)!.center;
  const today = todayIn(home.timezone);
  const scope = [account.homeDetailCenterId];
  const [documents, unbilled, payments, exportRows] = await Promise.all([
    repo.documents(scope, { accountId: id, includeClosed: true, from: addDays(today, -365), to: today }),
    repo.unbilledOrders(scope, id),
    repo.payments(id),
    repo.exportRows(scope, addDays(today, -365), today, id),
  ]);
  const canBill = canInCenter(state, account.homeDetailCenterId, "b2b.billing");
  const p = presentReceivableAccount(account);
  const openDocs = documents.ok
    ? documents.data
        .filter((d) => d.status !== "anulado" && d.balance > 0)
        .map((d) => ({ id: d.id, folio: d.folio, issuedOn: d.issuedOn, dueOn: d.dueOn, balance: d.balance }))
    : [];
  // Lo que la base acepta como pago: saldo de documentos menos lo ya pagado sin aplicar.
  const receivable = Math.max(0, account.documentsBalance - account.unapplied);

  return (
    <AppShell
      state={state}
      screen="receivableAccount"
      title={account.accountName}
      description={`${receivablesCopy.title} · ${home.name}`}
    >
      <div className="flex flex-wrap items-center gap-md text-sm">
        <Link href="/finanzas/cxc" className="underline">
          ← {receivablesCopy.title}
        </Link>
        {guardScreen(state, "b2bAccountDetail").allow ? (
          <Link href={`/comercial/b2b/${account.accountId}`} className="underline">
            {receivablesCopy.openAccount}
          </Link>
        ) : null}
      </div>

      <Card title={receivablesCopy.balance} subtitle={p.formula}>
        <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-5" data-testid="cxc-account-kpis">
          <KpiCard label={receivablesCopy.balance} value={p.balance} />
          <KpiCard label={receivablesCopy.unbilled} value={p.unbilledValue} caption={p.unbilledCaption} />
          <KpiCard label={receivablesCopy.documentsBalance} value={p.documents} />
          <KpiCard label={receivablesCopy.overdue} value={p.overdue} />
          <KpiCard label={receivablesCopy.unapplied} value={p.unapplied} />
        </div>
        <p
          className="mg-tone mt-md rounded-md border p-sm text-sm"
          data-tone={p.traceOk ? "success" : "danger"}
          data-testid="cxc-trace"
        >
          {p.trace}
        </p>
      </Card>

      <Card title={receivablesCopy.unbilledOrders}>
        <Table
          caption={receivablesCopy.unbilledOrders}
          rows={unbilled.ok ? unbilled.data.map(presentUnbilledOrder) : []}
          rowKey={(r) => r.id}
          emptyMessage={unbilled.ok ? receivablesCopy.unbilledEmpty : receivablesErrorMessage(unbilled.error)}
          columns={[
            { key: "folio", header: receivablesCopy.folio, value: (r) => r.folio },
            { key: "center", header: "Centro", value: (r) => r.center },
            { key: "delivered", header: "Entrega", value: (r) => r.deliveredOn },
            { key: "vehicle", header: "Vehículo", value: (r) => r.vehicle },
            { key: "po", header: "Orden de compra", value: (r) => r.purchaseOrder },
            { key: "age", header: receivablesCopy.age, value: (r) => r.age, align: "end" },
            { key: "total", header: "Total", value: (r) => r.total, align: "end" },
          ]}
        />
        {canBill && unbilled.ok && (unbilled.data.length > 0 || account.unbilledFees > 0) ? (
          <details className="mt-md" open>
            <summary className="cursor-pointer text-sm font-medium">{receivablesCopy.newBatch}</summary>
            <div className="mt-md">
              <BatchForm
                accountId={account.accountId}
                requestId={newRequestId()}
                today={today}
                unbilled={unbilled.data.map((o) => ({
                  id: o.id,
                  folio: o.folio,
                  total: o.total,
                  deliveredOn: o.deliveredOn,
                }))}
                feePending={account.unbilledFees}
              />
            </div>
          </details>
        ) : null}
      </Card>

      <Card
        title={receivablesCopy.documents}
        subtitle="Último año, incluidos cobrados y anulados"
        actions={
          exportRows.ok && exportRows.data.length > 0 ? (
            <CsvExport
              csv={receivablesExportCsv(exportRows.data)}
              filename={`cxc-${account.accountName.replace(/\W+/g, "-").toLowerCase()}-${today}.csv`}
              label={receivablesCopy.exportCsv}
            />
          ) : null
        }
      >
        <Table
          caption={receivablesCopy.documents}
          rows={documents.ok ? documents.data.map(presentDocumentRow) : []}
          rowKey={(r) => r.id}
          rowHref={(r) => `/finanzas/cxc/documentos/${r.id}`}
          emptyMessage={
            documents.ok ? receivablesCopy.documentsEmpty : receivablesErrorMessage(documents.error)
          }
          columns={[
            { key: "folio", header: receivablesCopy.folio, value: (r) => r.folio },
            { key: "period", header: receivablesCopy.period, value: (r) => r.period },
            { key: "ref", header: receivablesCopy.externalRef, value: (r) => r.externalRef },
            { key: "due", header: receivablesCopy.dueOn, value: (r) => r.dueOn },
            { key: "status", header: receivablesCopy.status, value: (r) => r.status },
            { key: "amount", header: receivablesCopy.amount, value: (r) => r.amount, align: "end" },
            { key: "paid", header: receivablesCopy.paid, value: (r) => r.paid, align: "end" },
            { key: "balance", header: receivablesCopy.balance, value: (r) => r.balance, align: "end" },
          ]}
        />
      </Card>

      <Card title={receivablesCopy.payments}>
        {!payments.ok ? (
          <p role="alert" className="text-sm">
            {receivablesErrorMessage(payments.error)}
          </p>
        ) : payments.data.length === 0 ? (
          <p className="text-sm text-muted">{receivablesCopy.paymentsEmpty}</p>
        ) : (
          <ul
            className="flex flex-col gap-sm"
            aria-label={receivablesCopy.payments}
            data-testid="cxc-payments"
          >
            {payments.data.map((raw) => {
              const pay = presentAccountPayment(raw);
              return (
                <li key={pay.id} className="flex flex-col gap-xs border-b border-border pb-sm">
                  <div className="flex flex-wrap items-center justify-between gap-sm">
                    <span className={pay.voided ? "line-through" : ""}>{pay.title}</span>
                    <strong>{pay.amount}</strong>
                  </div>
                  <span className="text-sm text-muted">
                    {receivablesCopy.applied}: {pay.allocations}
                    {pay.unapplied ? ` · ${receivablesCopy.unapplied.toLowerCase()} ${pay.unapplied}` : ""}
                    {pay.voided ? ` · ${receivablesCopy.voidedTag} (${pay.voidReason})` : ""}
                  </span>
                  {canBill && !pay.voided ? (
                    <div className="flex flex-wrap gap-sm">
                      {pay.unapplied && openDocs.length > 0 ? (
                        <AllocatePaymentButton paymentId={pay.id} accountId={account.accountId} />
                      ) : null}
                      <VoidPaymentForm paymentId={pay.id} accountId={account.accountId} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {canBill && receivable > 0 ? (
          <details className="mt-md">
            <summary className="cursor-pointer text-sm font-medium">
              {receivablesCopy.newPayment} · por cobrar {formatMoney(receivable)}
            </summary>
            <div className="mt-md">
              <PaymentForm
                accountId={account.accountId}
                requestId={newRequestId()}
                today={today}
                documents={openDocs}
                receivable={receivable}
              />
            </div>
          </details>
        ) : null}
      </Card>
    </AppShell>
  );
}
