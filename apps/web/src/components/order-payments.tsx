import {
  allowedPaymentMethods,
  paymentErrorMessage,
  paymentsCopy,
  presentOrderPayment,
  presentOrderPaymentRow,
  type OrderPayment,
  type RepoError,
  type Result,
  type ServiceOrder,
} from "@meguiars/domain";
import Link from "next/link";
import { OrderPaymentForm, ReversePaymentForm } from "./payment-forms";
import { Badge, Card } from "./ui/display";

/** Cobro de la OS: estado de pago, formulario (pago mixto), recibos y reversos. */
export function OrderPaymentsCard({
  order,
  timeZone,
  payments,
  canRead,
  canWrite,
  canReverse,
  hasActiveMembership,
  requestId,
}: {
  order: ServiceOrder;
  timeZone: string;
  payments: Result<OrderPayment[]> | { ok: false; error: RepoError } | null;
  canRead: boolean;
  canWrite: boolean;
  canReverse: boolean;
  hasActiveMembership: boolean;
  requestId: string;
}) {
  const view = presentOrderPayment(order);
  const allowed = allowedPaymentMethods({ b2bAccountId: order.b2bAccountId, hasActiveMembership });
  return (
    <Card
      title={paymentsCopy.orderTitle}
      subtitle={paymentsCopy.discountsNote}
      actions={<Badge label={view.statusLabel} tone={view.statusTone} />}
    >
      <dl className="grid gap-sm text-sm md:grid-cols-3" data-testid="order-payment-summary">
        <div>
          <dt className="text-muted">{paymentsCopy.total}</dt>
          <dd className="font-medium">{view.total}</dd>
        </div>
        <div>
          <dt className="text-muted">{paymentsCopy.paid}</dt>
          <dd>{view.paid}</dd>
        </div>
        <div>
          <dt className="text-muted">{paymentsCopy.balance}</dt>
          <dd className="font-medium" data-testid="order-balance">
            {view.balance}
          </dd>
        </div>
      </dl>
      {view.hint ? <p className="mt-sm text-sm text-muted">{view.hint}</p> : null}

      {canWrite ? (
        <div className="mt-md">
          {view.payable ? (
            <OrderPaymentForm order={order} allowed={allowed} requestId={requestId} />
          ) : (
            <p className="text-sm text-muted">{view.blocked}</p>
          )}
        </div>
      ) : null}

      {canRead ? (
        <section className="mt-lg" aria-label={paymentsCopy.receipts}>
          <h3 className="mb-sm font-medium">{paymentsCopy.receipts}</h3>
          {!payments ? null : !payments.ok ? (
            <p role="alert" className="text-sm">
              {paymentErrorMessage(payments.error)}
            </p>
          ) : payments.data.length === 0 ? (
            <p className="text-sm text-muted">{paymentsCopy.receiptsEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-sm">
              {payments.data.map((p) => {
                const r = presentOrderPaymentRow(p, timeZone);
                return (
                  <li
                    key={p.id}
                    className="flex flex-col gap-xs border-b border-border pb-sm text-sm"
                    data-testid="receipt"
                  >
                    <span className="flex flex-wrap items-center gap-xs">
                      <Link href={`/finanzas/cobranza/recibos/${p.id}`} className="font-medium underline">
                        {r.folio}
                      </Link>
                      · {r.amount}
                      <Badge label={r.status} tone={r.statusTone} />
                    </span>
                    <span>
                      {r.tenders}
                      {r.change ? ` · ${r.change}` : ""}
                    </span>
                    <span className="text-xs text-muted">
                      {r.who} · {r.when}
                    </span>
                    {r.reversal ? <span className="text-muted">{r.reversal}</span> : null}
                    {canReverse && r.valid ? (
                      <ReversePaymentForm paymentId={p.id} orderId={order.id} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </Card>
  );
}
