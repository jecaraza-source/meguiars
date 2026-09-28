import {
  B2B_DOCUMENT_STATUS_LABELS,
  B2B_DOCUMENT_STATUS_TONES,
  B2B_PAYMENT_METHOD_LABELS,
  canInCenter,
  documentActions,
  formatAge,
  formatDateOnly,
  formatMoney,
  formatPeriod,
  receivablesCopy,
  receivablesErrorMessage,
  receivablesExportCsv,
} from "@meguiars/domain";
import { createReceivablesRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CsvExport } from "@/components/pnl-export";
import { UpdateBatchForm, VoidDocumentForm } from "@/components/receivables-forms";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, EmptyState, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Documento de cobro: OS agrupadas, factura externa, compromiso, pagos aplicados y export. */
export default async function ReceivableDocumentPage({
  params,
  searchParams,
}: PageProps<"/finanzas/cxc/documentos/[id]">) {
  const state = await requireScreen("receivableDocument");
  const { id } = await params;
  const created = (await searchParams).hecho === "creado";
  const repo = createReceivablesRepository((await createSupabaseServerClient())!);
  const result = await repo.document(id);
  if (!result.ok) {
    return (
      <AppShell state={state} screen="receivableDocument" title={receivablesCopy.title}>
        <EmptyState
          title={receivablesErrorMessage(result.error)}
          action={<ButtonLink href="/finanzas/cxc" label={receivablesCopy.title} />}
        />
      </AppShell>
    );
  }
  const d = result.data;
  const actions = documentActions(d, { billing: canInCenter(state, d.homeDetailCenterId, "b2b.billing") });
  const exportRows = await repo.exportRows([d.homeDetailCenterId], d.issuedOn, d.issuedOn, d.accountId);
  const csvRows = exportRows.ok ? exportRows.data.filter((r) => r.folio === d.folio) : [];

  return (
    <AppShell
      state={state}
      screen="receivableDocument"
      title={`${d.folio} · ${d.accountName}`}
      description={`${receivablesCopy.period}: ${formatPeriod(d.periodFrom, d.periodTo)}`}
    >
      <div className="flex flex-wrap items-center gap-md text-sm">
        <Link href={`/finanzas/cxc/cuentas/${d.accountId}`} className="underline">
          ← {d.accountName}
        </Link>
        <Badge label={B2B_DOCUMENT_STATUS_LABELS[d.status]} tone={B2B_DOCUMENT_STATUS_TONES[d.status]} />
      </div>
      {created ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
          {receivablesCopy.batchCreated}
        </p>
      ) : null}

      <Card
        title={receivablesCopy.amount}
        subtitle={receivablesCopy.notCfdi}
        actions={
          csvRows.length > 0 ? (
            <CsvExport
              csv={receivablesExportCsv(csvRows)}
              filename={`${d.folio.toLowerCase()}.csv`}
              label={receivablesCopy.exportCsv}
            />
          ) : null
        }
      >
        <dl className="grid grid-cols-2 gap-xs text-sm md:grid-cols-4" data-testid="cxc-document">
          <dt className="text-muted">{receivablesCopy.issuedOn}</dt>
          <dd>{formatDateOnly(d.issuedOn)}</dd>
          <dt className="text-muted">{receivablesCopy.dueOn}</dt>
          <dd>
            {formatDateOnly(d.dueOn)}
            {d.daysOverdue > 0 ? ` · ${formatAge(d.daysOverdue)} vencido` : ""}
          </dd>
          <dt className="text-muted">{receivablesCopy.externalRef}</dt>
          <dd>
            {d.externalRef
              ? `${d.externalRef}${d.externalInvoicedOn ? ` · ${formatDateOnly(d.externalInvoicedOn)}` : ""}`
              : "—"}
          </dd>
          <dt className="text-muted">{receivablesCopy.age}</dt>
          <dd>{formatAge(d.ageDays)}</dd>
          <dt className="text-muted">{receivablesCopy.orders}</dt>
          <dd>{formatMoney(d.ordersAmount)}</dd>
          <dt className="text-muted">{receivablesCopy.fee}</dt>
          <dd>{formatMoney(d.feeAmount)}</dd>
          <dt className="text-muted">{receivablesCopy.amount}</dt>
          <dd>
            <strong>{formatMoney(d.amount)}</strong>
          </dd>
          <dt className="text-muted">{receivablesCopy.paid}</dt>
          <dd>{formatMoney(d.paid)}</dd>
          <dt className="text-muted">{receivablesCopy.balance}</dt>
          <dd>
            <strong>{formatMoney(d.balance)}</strong>
          </dd>
          {d.dueOnReason ? (
            <>
              <dt className="text-muted">{receivablesCopy.dueOnReason}</dt>
              <dd>{d.dueOnReason}</dd>
            </>
          ) : null}
          {d.notes ? (
            <>
              <dt className="text-muted">{receivablesCopy.notes}</dt>
              <dd>{d.notes}</dd>
            </>
          ) : null}
          {d.voidReason ? (
            <>
              <dt className="text-muted">{receivablesCopy.voidReason}</dt>
              <dd>{d.voidReason}</dd>
            </>
          ) : null}
        </dl>
        <p className="mt-md text-xs text-muted">{receivablesCopy.pnlNote}</p>
      </Card>

      <Card title={receivablesCopy.fiscal}>
        <dl className="grid grid-cols-2 gap-xs text-sm">
          <dt className="text-muted">{receivablesCopy.legalName}</dt>
          <dd>{d.legalName ?? "—"}</dd>
          <dt className="text-muted">{receivablesCopy.rfc}</dt>
          <dd>{d.rfc ?? "—"}</dd>
          <dt className="text-muted">{receivablesCopy.taxRegime}</dt>
          <dd>{d.taxRegime ?? "—"}</dd>
          <dt className="text-muted">{receivablesCopy.fiscalZip}</dt>
          <dd>{d.fiscalZip ?? "—"}</dd>
          <dt className="text-muted">{receivablesCopy.billingEmail}</dt>
          <dd>{d.billingEmail ?? "—"}</dd>
        </dl>
      </Card>

      <Card title={receivablesCopy.orders}>
        <Table
          caption={receivablesCopy.orders}
          rows={d.orders}
          rowKey={(o) => o.id}
          emptyMessage="Sin OS: documento de cuota."
          columns={[
            { key: "folio", header: receivablesCopy.folio, value: (o) => o.folio },
            { key: "center", header: "Centro", value: (o) => o.centerName },
            { key: "delivered", header: "Entrega", value: (o) => formatDateOnly(o.deliveredOn) },
            { key: "vehicle", header: "Vehículo", value: (o) => o.vehicleLabel },
            { key: "po", header: "Orden de compra", value: (o) => o.purchaseOrder ?? "—" },
            { key: "total", header: "Total", value: (o) => formatMoney(o.total), align: "end" },
          ]}
        />
      </Card>

      <Card title={receivablesCopy.payments}>
        {d.payments.length === 0 ? (
          <p className="text-sm text-muted">{receivablesCopy.paymentsEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-xs text-sm" aria-label={receivablesCopy.payments}>
            {d.payments.map((p, i) => (
              <li key={`${p.paymentId}-${i}`} className={p.voided ? "text-muted line-through" : ""}>
                {formatDateOnly(p.paidOn)} · {B2B_PAYMENT_METHOD_LABELS[p.method]}
                {p.reference ? ` · ${p.reference}` : ""} · {formatMoney(p.amount)}
                {p.voided ? ` (${receivablesCopy.voidedTag})` : ""}
              </li>
            ))}
          </ul>
        )}
        {actions.pay ? (
          <p className="mt-md text-sm">
            <Link href={`/finanzas/cxc/cuentas/${d.accountId}`} className="underline">
              {receivablesCopy.newPayment} →
            </Link>
          </p>
        ) : null}
      </Card>

      {actions.edit ? (
        <Card title={receivablesCopy.edit}>
          <UpdateBatchForm document={d} />
        </Card>
      ) : null}

      {actions.void ? (
        <Card title={receivablesCopy.void} subtitle={receivablesCopy.voidHint}>
          <VoidDocumentForm documentId={d.id} accountId={d.accountId} />
        </Card>
      ) : null}
    </AppShell>
  );
}
