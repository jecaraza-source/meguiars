import {
  activeCenterAccess,
  addDays,
  agingInputs,
  can,
  formatMoney,
  presentAging,
  presentDocumentRow,
  presentReceivableAccount,
  receivablesAging,
  receivablesCopy,
  receivablesErrorMessage,
  receivablesExportCsv,
  receivablesTotals,
  todayIn,
  usableCenters,
} from "@meguiars/domain";
import { createReceivablesRepository } from "@meguiars/supabase";
import { receivablesExportSchema } from "@meguiars/validation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CsvExport } from "@/components/pnl-export";
import { Card, EmptyState, KpiCard, Table } from "@/components/ui/display";
import { Input } from "@/components/ui/field";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Cuentas por cobrar B2B: saldo por cuenta (trazable), antigüedad, documentos
 * abiertos y export de soporte para el contador. La cartera es del centro gestor
 * de cada cuenta.
 */
export default async function ReceivablesPage({ searchParams }: PageProps<"/finanzas/cxc">) {
  const state = await requireScreen("receivables");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const all = params.alcance === "todos";
  const today = todayIn(center.timezone);
  const centers = all
    ? usableCenters(state.access)
        .filter((a) => can([...a.roles, ...a.corporateRoles], "b2b.read"))
        .map((a) => a.center.id)
    : [center.id];
  const range = receivablesExportSchema.safeParse({
    from: typeof params.desde === "string" ? params.desde : addDays(today, -89),
    to: typeof params.hasta === "string" ? params.hasta : today,
  });
  const from = range.success ? range.data.from : addDays(today, -89);
  const to = range.success ? range.data.to : today;
  const repo = createReceivablesRepository((await createSupabaseServerClient())!);
  const [accounts, documents, unbilled, exportRows] = await Promise.all([
    repo.accounts(centers),
    repo.documents(centers),
    repo.unbilledOrders(centers),
    repo.exportRows(centers, from, to),
  ]);
  const scopeLink = all ? "/finanzas/cxc" : "/finanzas/cxc?alcance=todos";
  const error = [accounts, documents, unbilled].find((r) => !r.ok);
  const rows = accounts.ok ? accounts.data.filter((a) => a.consumption > 0 || a.balance !== 0) : [];
  const totals = receivablesTotals(rows);
  const aging = presentAging(
    receivablesAging(agingInputs(documents.ok ? documents.data : [], unbilled.ok ? unbilled.data : [])),
  );

  return (
    <AppShell
      state={state}
      screen="receivables"
      title={receivablesCopy.title}
      description={receivablesCopy.description}
    >
      <Card
        subtitle={`${all ? receivablesCopy.scopeAll : center.name} · ${receivablesCopy.notCfdi}`}
        actions={
          <Link href={scopeLink} className="text-sm underline">
            {all ? receivablesCopy.scopeCenter : receivablesCopy.scopeAll}
          </Link>
        }
      >
        {error && !error.ok ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {receivablesErrorMessage(error.error)}
          </p>
        ) : (
          <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-5" data-testid="cxc-kpis">
            <KpiCard label={receivablesCopy.balance} value={formatMoney(totals.balance)} />
            <KpiCard label={receivablesCopy.unbilled} value={formatMoney(totals.unbilled)} />
            <KpiCard label={receivablesCopy.documentsBalance} value={formatMoney(totals.documents)} />
            <KpiCard label={receivablesCopy.overdue} value={formatMoney(totals.overdue)} />
            <KpiCard label={receivablesCopy.unapplied} value={formatMoney(totals.unapplied)} />
          </div>
        )}
        <p className="mt-md text-xs text-muted">{receivablesCopy.pnlNote}</p>
      </Card>

      <Card title={receivablesCopy.accounts} subtitle={receivablesCopy.traceOk}>
        <Table
          caption={receivablesCopy.accounts}
          rows={rows.map(presentReceivableAccount)}
          rowKey={(r) => r.id}
          rowHref={(r) => `/finanzas/cxc/cuentas/${r.id}`}
          emptyMessage={receivablesCopy.empty}
          columns={[
            { key: "name", header: receivablesCopy.account, value: (r) => r.name },
            {
              key: "consumption",
              header: receivablesCopy.consumption,
              value: (r) => r.consumption,
              align: "end",
            },
            { key: "paid", header: receivablesCopy.paid, value: (r) => r.paid, align: "end" },
            { key: "unbilled", header: receivablesCopy.unbilled, value: (r) => r.unbilled, align: "end" },
            {
              key: "documents",
              header: receivablesCopy.documentsBalance,
              value: (r) => r.documents,
              align: "end",
            },
            { key: "overdue", header: receivablesCopy.overdue, value: (r) => r.overdue, align: "end" },
            { key: "unapplied", header: receivablesCopy.unapplied, value: (r) => r.unapplied, align: "end" },
            { key: "balance", header: receivablesCopy.balance, value: (r) => r.balance, align: "end" },
          ]}
        />
      </Card>

      <Card title={receivablesCopy.aging} subtitle={receivablesCopy.agingHint}>
        {aging.accounts.length === 0 ? (
          <EmptyState title={receivablesCopy.empty} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" data-testid="cxc-aging">
              <caption className="sr-only">{receivablesCopy.aging}</caption>
              <thead className="bg-surface">
                <tr>
                  <th scope="col" className="px-md py-sm text-left font-medium">
                    {receivablesCopy.account}
                  </th>
                  {aging.headers.map((h) => (
                    <th key={h} scope="col" className="px-md py-sm text-right font-medium">
                      {h}
                    </th>
                  ))}
                  <th scope="col" className="px-md py-sm text-right font-medium">
                    {receivablesCopy.total}
                  </th>
                </tr>
              </thead>
              <tbody>
                {aging.accounts.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <th scope="row" className="px-md py-sm text-left font-normal">
                      <Link href={`/finanzas/cxc/cuentas/${a.id}`} className="underline">
                        {a.name}
                      </Link>
                    </th>
                    {a.amounts.map((v, i) => (
                      <td key={aging.headers[i]} className="px-md py-sm text-right">
                        {v}
                      </td>
                    ))}
                    <td className="px-md py-sm text-right">{a.total}</td>
                  </tr>
                ))}
                <tr className="border-t border-border text-muted">
                  <th scope="row" className="px-md py-sm text-left font-normal">
                    {receivablesCopy.agingDocuments}
                  </th>
                  {aging.documents.map((v, i) => (
                    <td key={aging.headers[i]} className="px-md py-sm text-right">
                      {v}
                    </td>
                  ))}
                  <td />
                </tr>
                <tr className="text-muted">
                  <th scope="row" className="px-md py-sm text-left font-normal">
                    {receivablesCopy.agingUnbilled}
                  </th>
                  {aging.unbilled.map((v, i) => (
                    <td key={aging.headers[i]} className="px-md py-sm text-right">
                      {v}
                    </td>
                  ))}
                  <td />
                </tr>
                <tr className="border-t border-border font-semibold">
                  <th scope="row" className="px-md py-sm text-left">
                    {receivablesCopy.total}
                  </th>
                  {aging.totals.map((v, i) => (
                    <td key={aging.headers[i]} className="px-md py-sm text-right">
                      {v}
                    </td>
                  ))}
                  <td className="px-md py-sm text-right">{aging.total}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`${receivablesCopy.documents} · ${receivablesCopy.documentsOpen}`}>
        <Table
          caption={receivablesCopy.documents}
          rows={documents.ok ? documents.data.map(presentDocumentRow) : []}
          rowKey={(r) => r.id}
          rowHref={(r) => `/finanzas/cxc/documentos/${r.id}`}
          emptyMessage={receivablesCopy.documentsEmpty}
          columns={[
            { key: "folio", header: receivablesCopy.folio, value: (r) => r.folio },
            { key: "account", header: receivablesCopy.account, value: (r) => r.account },
            { key: "period", header: receivablesCopy.period, value: (r) => r.period },
            { key: "ref", header: receivablesCopy.externalRef, value: (r) => r.externalRef },
            { key: "due", header: receivablesCopy.dueOn, value: (r) => r.dueOn },
            { key: "status", header: receivablesCopy.status, value: (r) => r.status },
            { key: "amount", header: receivablesCopy.amount, value: (r) => r.amount, align: "end" },
            { key: "balance", header: receivablesCopy.balance, value: (r) => r.balance, align: "end" },
            { key: "age", header: receivablesCopy.age, value: (r) => r.age, align: "end" },
          ]}
        />
      </Card>

      <Card
        title={receivablesCopy.export}
        subtitle={receivablesCopy.exportHint}
        actions={
          exportRows.ok && exportRows.data.length > 0 ? (
            <CsvExport
              csv={receivablesExportCsv(exportRows.data)}
              filename={`cxc-b2b-${from}-${to}.csv`}
              label={receivablesCopy.exportCsv}
            />
          ) : null
        }
      >
        <form method="get" className="flex flex-wrap items-end gap-sm" data-testid="cxc-export-range">
          {all ? <input type="hidden" name="alcance" value="todos" /> : null}
          <Input name="desde" type="date" label={receivablesCopy.exportFrom} defaultValue={from} />
          <Input name="hasta" type="date" label={receivablesCopy.exportTo} defaultValue={to} />
          <button type="submit" className="mb-sm text-sm underline">
            Aplicar
          </button>
        </form>
        {!range.success ? (
          <p role="alert" className="mt-sm text-sm">
            {range.error.issues[0]?.message}
          </p>
        ) : null}
        <p className="mt-sm text-sm text-muted" data-testid="cxc-export-count">
          {exportRows.ok ? `${exportRows.data.length} filas` : receivablesErrorMessage(exportRows.error)}
        </p>
      </Card>
    </AppShell>
  );
}
