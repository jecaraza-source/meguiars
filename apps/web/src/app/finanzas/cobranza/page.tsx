import {
  consolidateReconciliation,
  paymentsByMethod,
  paymentsCashIn,
  paymentsChangeGiven,
  paymentsCollected,
  paymentsCollectionRate,
  paymentsNonCash,
  paymentsReversed,
} from "@meguiars/analytics";
import {
  activeCenterAccess,
  can,
  canInActiveCenter,
  formatMoney,
  PAYMENT_RANGE_LABELS,
  PAYMENT_RANGES,
  paymentErrorMessage,
  paymentRange,
  paymentsCopy,
  presentPaymentListItem,
  presentReceivable,
  todayIn,
  usableCenters,
  type PaymentRangeKey,
} from "@meguiars/domain";
import { createPaymentRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Card, EmptyState, KpiCard, Table } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Corte de caja, recibos, por cobrar y conciliación contra ventas (OS entregadas). */
export default async function PaymentsPage({ searchParams }: PageProps<"/finanzas/cobranza">) {
  const state = await requireScreen("payments");
  const center = activeCenterAccess(state)!.center;
  const params = await searchParams;
  const all = params.alcance === "todos";
  const key: PaymentRangeKey = PAYMENT_RANGES.includes(params.rango as PaymentRangeKey)
    ? (params.rango as PaymentRangeKey)
    : "hoy";
  const centers = all
    ? usableCenters(state.access)
        .filter((a) => can([...a.roles, ...a.corporateRoles], "payments.read"))
        .map((a) => a.center.id)
    : [center.id];
  const names = new Map(usableCenters(state.access).map((a) => [a.center.id, a.center]));
  const { from, to } = paymentRange(key, todayIn(center.timezone));
  const range = { detailCenterIds: centers, from, to };
  const repo = createPaymentRepository((await createSupabaseServerClient())!);
  const [facts, receipts, receivables, reconciliation] = await Promise.all([
    repo.facts(range),
    repo.list(range),
    repo.receivables(centers),
    repo.reconciliation(range),
  ]);
  const input = { facts: facts.ok ? facts.data : [] };
  const rec = consolidateReconciliation(reconciliation.ok ? reconciliation.data : []);
  // Enlace a la OS sólo en el centro activo y para quien opera órdenes (el contador no).
  const canOpenOrders = !all && canInActiveCenter(state, "orders.read");
  const tzOf = (id: string) => names.get(id)?.timezone ?? center.timezone;
  const link = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const next = { alcance: all ? "todos" : undefined, rango: key === "hoy" ? undefined : key, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/finanzas/cobranza?${s}` : "/finanzas/cobranza";
  };

  return (
    <AppShell
      state={state}
      screen="payments"
      title={paymentsCopy.title}
      description={paymentsCopy.description}
    >
      <Card
        title={paymentsCopy.kpis}
        subtitle={`${PAYMENT_RANGE_LABELS[key]} · ${all ? paymentsCopy.scopeAll : center.name}`}
        actions={
          <nav className="flex flex-wrap gap-md text-sm" aria-label={paymentsCopy.rangeLabel}>
            {PAYMENT_RANGES.map((r) =>
              r === key ? (
                <strong key={r}>{PAYMENT_RANGE_LABELS[r]}</strong>
              ) : (
                <Link key={r} href={link({ rango: r === "hoy" ? undefined : r })} className="underline">
                  {PAYMENT_RANGE_LABELS[r]}
                </Link>
              ),
            )}
            <Link href={link({ alcance: all ? undefined : "todos" })} className="underline">
              {all ? paymentsCopy.scopeCenter : paymentsCopy.scopeAll}
            </Link>
          </nav>
        }
      >
        {!facts.ok ? (
          <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
            {paymentErrorMessage(facts.error)}
          </p>
        ) : input.facts.length === 0 ? (
          <EmptyState title={paymentsCopy.empty} />
        ) : (
          <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-4" data-testid="payments-kpis">
            <KpiCard
              label={paymentsCollected.name}
              value={formatMoney(paymentsCollected.compute(input))}
              caption="Recibos válidos"
            />
            <KpiCard
              label={paymentsCashIn.name}
              value={formatMoney(paymentsCashIn.compute(input))}
              caption={`Cambio entregado ${formatMoney(paymentsChangeGiven.compute(input))}`}
            />
            <KpiCard
              label={paymentsNonCash.name}
              value={formatMoney(paymentsNonCash.compute(input))}
              caption="Membresía y crédito B2B"
            />
            <KpiCard
              label={paymentsReversed.name}
              value={formatMoney(paymentsReversed.compute(input))}
              caption="Recibos revertidos"
            />
          </div>
        )}
      </Card>

      {facts.ok && input.facts.length > 0 ? (
        <Card title={paymentsCopy.byMethod}>
          <Table
            caption={paymentsCopy.byMethod}
            rows={paymentsByMethod(input)}
            rowKey={(r) => r.method}
            emptyMessage={paymentsCopy.empty}
            columns={[
              { key: "method", header: paymentsCopy.method, value: (r) => r.name },
              { key: "cash", header: "Caja", value: (r) => (r.collectsCash ? "Sí" : "No") },
              { key: "amount", header: "Cobrado", value: (r) => formatMoney(r.amount), align: "end" },
              { key: "count", header: "Recibos", value: (r) => String(r.count), align: "end" },
              { key: "share", header: "%", value: (r) => `${r.share} %`, align: "end" },
              { key: "reversed", header: "Revertido", value: (r) => formatMoney(r.reversed), align: "end" },
            ]}
          />
        </Card>
      ) : null}

      <Card title={paymentsCopy.reconciliation} subtitle={paymentsCopy.reconciliationHint}>
        {!reconciliation.ok ? (
          <p role="alert" className="text-sm">
            {paymentErrorMessage(reconciliation.error)}
          </p>
        ) : (
          <dl className="grid gap-sm text-sm md:grid-cols-3" data-testid="payments-reconciliation">
            <div>
              <dt className="text-muted">OS entregadas (ventas)</dt>
              <dd className="font-medium">
                {rec.deliveredOrders} · {formatMoney(rec.salesTotal)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Cobrado de esas ventas</dt>
              <dd className="font-medium">
                {formatMoney(rec.collectedForSales)} ·{" "}
                {paymentsCollectionRate.compute({ rows: reconciliation.data })} %
              </dd>
            </div>
            <div>
              <dt className="text-muted">Pendiente de esas ventas</dt>
              <dd className="font-medium">{formatMoney(rec.pendingForSales)}</dd>
            </div>
            <div>
              <dt className="text-muted">Cobranza del periodo</dt>
              <dd>{formatMoney(rec.collectedInRange)}</dd>
            </div>
            <div>
              <dt className="text-muted">En caja y banco</dt>
              <dd>{formatMoney(rec.cashInRange)}</dd>
            </div>
            <div>
              <dt className="text-muted">Revertido</dt>
              <dd>{formatMoney(rec.reversedInRange)}</dd>
            </div>
          </dl>
        )}
      </Card>

      <Card title={paymentsCopy.receipts}>
        {!receipts.ok ? (
          <p role="alert" className="text-sm">
            {paymentErrorMessage(receipts.error)}
          </p>
        ) : (
          <Table
            caption={paymentsCopy.receipts}
            rows={receipts.data.map((p) => presentPaymentListItem(p, tzOf(p.detailCenterId)))}
            rowKey={(r) => r.id}
            rowHref={(r) => `/finanzas/cobranza/recibos/${r.id}`}
            emptyMessage={paymentsCopy.empty}
            columns={[
              { key: "folio", header: paymentsCopy.receipt, value: (r) => r.folio },
              { key: "when", header: paymentsCopy.receivedAt, value: (r) => r.when },
              { key: "client", header: paymentsCopy.client, value: (r) => r.client },
              { key: "orders", header: "OS", value: (r) => r.orders },
              { key: "methods", header: paymentsCopy.method, value: (r) => r.methods },
              { key: "amount", header: paymentsCopy.amount, value: (r) => r.amount, align: "end" },
              { key: "status", header: "Estado", value: (r) => r.status },
            ]}
          />
        )}
      </Card>

      <Card title={paymentsCopy.receivables}>
        {!receivables.ok ? (
          <p role="alert" className="text-sm">
            {paymentErrorMessage(receivables.error)}
          </p>
        ) : (
          <Table
            caption={paymentsCopy.receivables}
            rows={receivables.data.map(presentReceivable)}
            rowKey={(r) => r.id}
            {...(canOpenOrders ? { rowHref: (r: { id: string }) => `/ordenes/${r.id}` } : {})}
            emptyMessage={paymentsCopy.receivablesEmpty}
            columns={[
              { key: "folio", header: "OS", value: (r) => r.folio },
              { key: "client", header: paymentsCopy.client, value: (r) => r.client },
              { key: "total", header: paymentsCopy.total, value: (r) => r.total, align: "end" },
              { key: "paid", header: paymentsCopy.paid, value: (r) => r.paid, align: "end" },
              { key: "balance", header: paymentsCopy.balance, value: (r) => r.balance, align: "end" },
              {
                key: "status",
                header: paymentsCopy.status,
                value: (r) => (r.b2b ? `${r.status} · B2B` : r.status),
              },
            ]}
          />
        )}
      </Card>
    </AppShell>
  );
}
