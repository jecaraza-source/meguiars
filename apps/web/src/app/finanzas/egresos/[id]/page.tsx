import {
  canInCenter,
  expenseActions,
  expenseErrorMessage,
  expensesCopy,
  formatBytes,
  newRequestId,
  presentApprovalEvent,
  presentExpense,
  todayIn,
} from "@meguiars/domain";
import { createExpenseRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DecisionForm, ExpenseForm, ReceiptUploadForm, RemoveReceiptForm } from "@/components/expense-forms";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Ficha del egreso: datos, comprobantes, historial de aprobación y acciones según permiso. */
export default async function ExpensePage({ params, searchParams }: PageProps<"/finanzas/egresos/[id]">) {
  const state = await requireScreen("expenseDetail");
  const { id } = await params;
  const query = await searchParams;
  const repo = createExpenseRepository((await createSupabaseServerClient())!);
  const result = await repo.get(id);
  if (!result.ok) {
    return (
      <AppShell state={state} screen="expenseDetail" title={expensesCopy.title}>
        <Link href="/finanzas/egresos" className="text-sm underline">
          ← {expensesCopy.title}
        </Link>
        <EmptyState title={expensesCopy.notFound} message={expenseErrorMessage(result.error)} />
      </AppShell>
    );
  }
  const e = result.data;
  const view = presentExpense(e);
  // Los permisos se evalúan en el centro del egreso (puede no ser el activo).
  const can = {
    write: canInCenter(state, e.detailCenterId, "expenses.write"),
    approve: canInCenter(state, e.detailCenterId, "expenses.approve"),
  };
  const actions = expenseActions(e.status, can);
  const [categories, vendors, threshold] = actions.edit
    ? await Promise.all([
        repo.categories(e.organizationId),
        repo.vendors(e.organizationId),
        repo.threshold(e.detailCenterId),
      ])
    : [null, null, null];

  return (
    <AppShell
      state={state}
      screen="expenseDetail"
      title={view.title}
      description={`${view.amount} · ${view.date}`}
    >
      <Link href="/finanzas/egresos" className="text-sm underline">
        ← {expensesCopy.title}
      </Link>
      {query.creado ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
          {query.creado === "pendiente" ? expensesCopy.createdPending : expensesCopy.created}
        </p>
      ) : null}
      {query.hecho === "aprobado" || query.hecho === "rechazado" || query.hecho === "anulado" ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm" data-tone="success">
          {query.hecho === "aprobado"
            ? expensesCopy.approved
            : query.hecho === "rechazado"
              ? expensesCopy.rejected
              : expensesCopy.voided}
        </p>
      ) : null}
      {query.comprobante === "error" ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="warning">
          El egreso se registró, pero el comprobante no se pudo subir: adjúntalo de nuevo.
        </p>
      ) : null}

      <Card title={view.title} actions={<Badge label={view.status} tone={view.statusTone} />}>
        <dl className="grid gap-sm text-sm md:grid-cols-2" data-testid="expense-summary">
          <div>
            <dt className="text-muted">{expensesCopy.amount}</dt>
            <dd className="font-medium">{view.amount}</dd>
          </div>
          <div>
            <dt className="text-muted">{expensesCopy.paidOn}</dt>
            <dd>{view.date}</dd>
          </div>
          <div>
            <dt className="text-muted">{expensesCopy.category}</dt>
            <dd>
              {view.category} · {view.group}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Proveedor</dt>
            <dd>{view.vendor}</dd>
          </div>
          <div>
            <dt className="text-muted">{expensesCopy.paymentMethod}</dt>
            <dd>
              {view.method} · {view.reference}
            </dd>
          </div>
          <div>
            <dt className="text-muted">{expensesCopy.createdBy}</dt>
            <dd>{view.createdBy}</dd>
          </div>
          {view.approvedBy ? (
            <div>
              <dt className="text-muted">{expensesCopy.approvedBy}</dt>
              <dd>{view.approvedBy}</dd>
            </div>
          ) : null}
          {e.notes ? (
            <div>
              <dt className="text-muted">{expensesCopy.notes}</dt>
              <dd>{e.notes}</dd>
            </div>
          ) : null}
        </dl>
        {view.voided ? (
          <p className="mt-md text-sm font-medium" data-testid="expense-voided">
            {view.voided}
          </p>
        ) : null}
        {!can.write && !can.approve ? (
          <p className="mt-md text-sm text-muted">{expensesCopy.readOnly}</p>
        ) : null}
      </Card>

      {actions.approve || actions.reject ? (
        <Card title={expensesCopy.status}>
          <div className="grid gap-lg md:grid-cols-2">
            <DecisionForm expense={e} decision="approve" />
            <DecisionForm expense={e} decision="reject" />
          </div>
        </Card>
      ) : null}

      <Card title={expensesCopy.receipts}>
        {e.attachments.length === 0 ? (
          <p className="text-sm text-muted">{expensesCopy.receiptsEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-sm" data-testid="expense-receipts">
            {e.attachments.map((a) => (
              <li key={a.id} className="flex flex-col gap-xs border-b border-border pb-sm text-sm">
                <span className="flex flex-wrap items-center gap-sm">
                  <strong>{a.fileName ?? a.contentType}</strong> · {formatBytes(a.sizeBytes)} ·{" "}
                  {a.uploadedByName ?? "—"}
                  {a.signedUrl ? (
                    <a href={a.signedUrl} target="_blank" rel="noreferrer" className="underline">
                      {expensesCopy.openReceipt}
                    </a>
                  ) : null}
                </span>
                {actions.attach ? <RemoveReceiptForm expenseId={e.id} attachmentId={a.id} /> : null}
              </li>
            ))}
          </ul>
        )}
        {actions.attach ? (
          <div className="mt-md">
            <ReceiptUploadForm expenseId={e.id} fileId={newRequestId()} />
          </div>
        ) : null}
      </Card>

      <Card title={expensesCopy.history}>
        {e.events.length === 0 ? (
          <p className="text-sm text-muted">{expensesCopy.historyEmpty}</p>
        ) : (
          <ol className="flex flex-col gap-sm" data-testid="expense-history">
            {e.events.map((ev, i) => {
              const v = presentApprovalEvent(ev, e.centerTimezone);
              return (
                <li key={i} className="flex flex-col gap-xxs border-b border-border pb-sm text-sm">
                  <span>
                    <strong>{v.what}</strong> · {v.amount}
                    {v.note ? ` · ${v.note}` : ""}
                  </span>
                  <span className="text-xs text-muted">
                    {v.who} · {v.when}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {actions.edit && categories?.ok ? (
        <Card>
          <details>
            <summary className="cursor-pointer font-medium">{expensesCopy.edit}</summary>
            <div className="mt-sm">
              <ExpenseForm
                expense={e}
                categories={categories.data}
                vendors={vendors?.ok ? vendors.data : []}
                threshold={threshold?.ok ? threshold.data : null}
                isApprover={can.approve}
                today={todayIn(e.centerTimezone)}
              />
            </div>
          </details>
        </Card>
      ) : null}

      {actions.void ? (
        <Card>
          <details>
            <summary className="cursor-pointer font-medium">{expensesCopy.void}</summary>
            <div className="mt-sm">
              <DecisionForm expense={e} decision="void" />
            </div>
          </details>
        </Card>
      ) : null}
    </AppShell>
  );
}
