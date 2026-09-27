import {
  canInCenter,
  cashCopy,
  cashErrorMessage,
  cashSessionActions,
  newRequestId,
  presentCashSession,
  presentClosing,
  presentMovement,
} from "@meguiars/domain";
import { createCashRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { CashExport, CloseCashForm, ReopenCashForm } from "@/components/cash-forms";
import { Badge, Card, EmptyState, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DONE: Record<string, string> = {
  abierta: cashCopy.opened,
  cerrada: cashCopy.closed,
  reabierta: cashCopy.reopened,
};

/** Ficha del corte: totales, conciliación, cierre, reapertura, versiones, movimientos y exportación. */
export default async function CashSessionPage({ params, searchParams }: PageProps<"/finanzas/caja/[id]">) {
  const state = await requireScreen("cashSession");
  const { id } = await params;
  const query = await searchParams;
  const repo = createCashRepository((await createSupabaseServerClient())!);
  const result = await repo.get(id);
  if (!result.ok) {
    return (
      <AppShell state={state} screen="cashSession" title={cashCopy.title}>
        <Link href="/finanzas/caja" className="text-sm underline">
          ← {cashCopy.title}
        </Link>
        <EmptyState title={cashCopy.notFound} message={cashErrorMessage(result.error)} />
      </AppShell>
    );
  }
  const s = result.data;
  const view = presentCashSession(s);
  // Los permisos se evalúan en el centro del corte (puede no ser el activo).
  const actions = cashSessionActions(s.status, {
    operate: canInCenter(state, s.detailCenterId, "cash.operate"),
    reopen: canInCenter(state, s.detailCenterId, "cash.reopen"),
  });
  const done = typeof query.hecho === "string" ? DONE[query.hecho] : undefined;

  return (
    <AppShell
      state={state}
      screen="cashSession"
      title={view.title}
      description={`${view.center} · ${view.day}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-sm print:hidden">
        <Link href="/finanzas/caja" className="text-sm underline">
          ← {cashCopy.title}
        </Link>
        <CashExport session={s} />
      </div>
      {done ? (
        <p role="status" className="mg-tone rounded-md border p-md text-sm print:hidden" data-tone="success">
          {done}
        </p>
      ) : null}

      <Card
        title={cashCopy.summaryTitle}
        subtitle={`${view.window}`}
        actions={<Badge label={view.status} tone={view.statusTone} />}
      >
        <dl className="grid gap-sm text-sm md:grid-cols-3" data-testid="cash-summary">
          <div>
            <dt className="text-muted">{cashCopy.openedBy}</dt>
            <dd>{view.openedBy}</dd>
          </div>
          <div>
            <dt className="text-muted">{cashCopy.closedBy}</dt>
            <dd>{view.closedBy ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">{cashCopy.openingFloat.replace(" (MXN)", "")}</dt>
            <dd>{view.totals.openingFloat}</dd>
          </div>
          <div>
            <dt className="text-muted">{cashCopy.cashCollected}</dt>
            <dd>{view.totals.cashCollected}</dd>
          </div>
          <div>
            <dt className="text-muted">{cashCopy.cashRefunded}</dt>
            <dd>−{view.totals.cashRefunded}</dd>
          </div>
          <div>
            <dt className="text-muted">
              {cashCopy.expected}
              {s.status === "abierta" ? ` (${cashCopy.live.toLowerCase()})` : ""}
            </dt>
            <dd className="text-lg font-bold" data-testid="cash-summary-expected">
              {view.totals.expected}
            </dd>
          </div>
          {view.counted ? (
            <div>
              <dt className="text-muted">{cashCopy.counted}</dt>
              <dd className="text-lg font-bold" data-testid="cash-summary-counted">
                {view.counted}
              </dd>
            </div>
          ) : null}
          {view.difference ? (
            <div>
              <dt className="text-muted">{cashCopy.difference}</dt>
              <dd>
                <span
                  className="mg-tone rounded-sm px-xs text-lg font-bold"
                  data-tone={view.difference.tone}
                  data-testid="cash-summary-difference"
                >
                  {view.difference.text}
                </span>
              </dd>
            </div>
          ) : null}
          {view.closingNotes ? (
            <div className="md:col-span-3">
              <dt className="text-muted">{cashCopy.closeNotes}</dt>
              <dd>{view.closingNotes}</dd>
            </div>
          ) : null}
        </dl>
        {view.verified ? (
          <p
            className="mg-tone mt-md rounded-md border p-sm text-xs"
            data-tone={view.verified.ok ? "success" : "danger"}
            data-testid="cash-verified"
          >
            {view.verified.text}
          </p>
        ) : null}
      </Card>

      <Card title={cashCopy.reconciliation} subtitle={view.totals.counts}>
        <dl className="mb-md grid gap-sm text-sm md:grid-cols-3" data-testid="cash-reconciliation">
          <div>
            <dt className="text-muted">{cashCopy.card}</dt>
            <dd className="font-medium">{view.totals.card}</dd>
          </div>
          <div>
            <dt className="text-muted">{cashCopy.transfer}</dt>
            <dd className="font-medium">{view.totals.transfer}</dd>
          </div>
          <div>
            <dt className="text-muted">{cashCopy.nonCash}</dt>
            <dd className="font-medium">{view.totals.nonCash}</dd>
          </div>
        </dl>
        <Table
          caption={cashCopy.byMethod}
          rows={view.totals.methods}
          rowKey={(r) => r.method}
          emptyMessage={cashCopy.movementsEmpty}
          columns={[
            { key: "name", header: cashCopy.method, value: (r) => r.name },
            { key: "collected", header: cashCopy.collected, value: (r) => r.collected, align: "end" },
            { key: "refunded", header: cashCopy.refunded, value: (r) => r.refunded, align: "end" },
            { key: "net", header: cashCopy.net, value: (r) => r.net, align: "end" },
          ]}
        />
      </Card>

      {actions.close ? (
        <div className="print:hidden">
          <Card title={cashCopy.closeTitle}>
            <CloseCashForm session={s} requestId={newRequestId()} />
          </Card>
        </div>
      ) : null}
      {actions.reopen ? (
        <div className="print:hidden">
          <Card title={cashCopy.reopen}>
            <ReopenCashForm session={s} />
          </Card>
        </div>
      ) : null}

      {s.closings.length > 0 ? (
        <Card title={cashCopy.history}>
          <ol className="flex flex-col gap-sm text-sm" data-testid="cash-closings">
            {s.closings.map((c) => {
              const p = presentClosing(c, s.centerTimezone);
              return (
                <li key={c.id} className="rounded-md border border-border p-sm">
                  <strong>{p.title}</strong> · {p.who} · {cashCopy.expected} {p.expected} · {cashCopy.counted}{" "}
                  {p.counted} · {p.difference.text}
                  {p.notes ? ` · ${p.notes}` : ""}
                </li>
              );
            })}
          </ol>
          {s.reopenings.length > 0 ? (
            <>
              <h3 className="mb-xs mt-md font-medium">{cashCopy.reopenings}</h3>
              <ul className="flex flex-col gap-xs text-sm" data-testid="cash-reopenings">
                {s.reopenings.map((r, i) => (
                  <li key={i}>
                    v{r.sequence} · {r.reopenedByName ?? "—"}: {r.reason}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>
      ) : null}

      <Card title={cashCopy.movements}>
        <Table
          caption={cashCopy.movements}
          rows={s.movements.map((m, i) => ({ ...presentMovement(m, s.centerTimezone), key: String(i) }))}
          rowKey={(r) => r.key}
          emptyMessage={cashCopy.movementsEmpty}
          columns={[
            { key: "when", header: "Hora", value: (r) => r.when },
            {
              key: "what",
              header: "Recibo",
              value: (r) => (r.reversedLater ? `${r.what} (revertido después)` : r.what),
            },
            { key: "methods", header: cashCopy.method, value: (r) => r.methods },
            { key: "amount", header: "Importe", value: (r) => r.amount, align: "end" },
            { key: "cash", header: "Efectivo", value: (r) => r.cash, align: "end" },
          ]}
        />
      </Card>
    </AppShell>
  );
}
