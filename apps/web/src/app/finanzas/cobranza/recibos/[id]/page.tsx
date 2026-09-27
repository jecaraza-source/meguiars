import { canInCenter, paymentErrorMessage, paymentsCopy, presentReceipt } from "@meguiars/domain";
import { createPaymentRepository } from "@meguiars/supabase";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PrintButton, ReversePaymentForm } from "@/components/payment-forms";
import { Badge, Card, EmptyState } from "@/components/ui/display";
import { requireScreen } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Recibo interno de cobro, imprimible. No es un CFDI. */
export default async function ReceiptPage({ params }: PageProps<"/finanzas/cobranza/recibos/[id]">) {
  const state = await requireScreen("paymentReceipt");
  const { id } = await params;
  const repo = createPaymentRepository((await createSupabaseServerClient())!);
  const result = await repo.receipt(id);
  if (!result.ok) {
    return (
      <AppShell state={state} screen="paymentReceipt" title={paymentsCopy.receipt}>
        <Link href="/finanzas/cobranza" className="text-sm underline">
          ← {paymentsCopy.title}
        </Link>
        <EmptyState title={paymentsCopy.notFound} message={paymentErrorMessage(result.error)} />
      </AppShell>
    );
  }
  const r = presentReceipt(result.data);
  // El recibo puede ser de otro centro del usuario: el permiso se evalúa en el centro del recibo.
  const canReverse = canInCenter(state, result.data.detailCenterId, "payments.reverse");

  return (
    <AppShell state={state} screen="paymentReceipt" title={`${paymentsCopy.receipt} ${r.folio}`}>
      <div className="flex flex-wrap items-center justify-between gap-sm print:hidden">
        <Link href="/finanzas/cobranza" className="text-sm underline">
          ← {paymentsCopy.title}
        </Link>
        <PrintButton />
      </div>
      <Card
        title={r.title}
        subtitle={`${r.organization} · ${r.center}`}
        actions={<Badge label={r.status} tone={r.statusTone} />}
      >
        <article className="flex flex-col gap-md text-sm" data-testid="receipt-document">
          <dl className="grid gap-sm md:grid-cols-2">
            <div>
              <dt className="text-muted">Folio</dt>
              <dd className="font-medium">{r.folio}</dd>
            </div>
            <div>
              <dt className="text-muted">{paymentsCopy.receivedAt}</dt>
              <dd>{r.when}</dd>
            </div>
            <div>
              <dt className="text-muted">{paymentsCopy.client}</dt>
              <dd>{r.client}</dd>
            </div>
            <div>
              <dt className="text-muted">{paymentsCopy.receivedBy}</dt>
              <dd>{r.who}</dd>
            </div>
          </dl>
          <section aria-label={paymentsCopy.orders}>
            <h3 className="mb-xs font-medium">{paymentsCopy.orders}</h3>
            <ul className="flex flex-col gap-xs">
              {r.orders.map((o) => (
                <li key={o.id}>
                  {o.folio} · {paymentsCopy.total} {o.total} · {paymentsCopy.applied} {o.applied} ·{" "}
                  {paymentsCopy.balance} {o.balance} ({o.status})
                </li>
              ))}
            </ul>
          </section>
          <section aria-label={paymentsCopy.tenders}>
            <h3 className="mb-xs font-medium">{paymentsCopy.tenders}</h3>
            <ul className="flex flex-col gap-xs">
              {r.tenders.map((t, i) => (
                <li key={i}>
                  {t.label}: {t.amount}
                  {t.reference ? ` · ${t.reference}` : ""}
                </li>
              ))}
            </ul>
          </section>
          <p className="text-lg font-bold" data-testid="receipt-total">
            Total {r.amount}
          </p>
          {r.cashReceived ? (
            <p>
              {paymentsCopy.cashReceived.replace(" (opcional)", "")}: {r.cashReceived}
              {r.change ? ` · ${paymentsCopy.change} ${r.change}` : ""}
            </p>
          ) : null}
          {r.notes ? <p>{r.notes}</p> : null}
          {r.reversal ? (
            <p className="mg-tone rounded-md border p-md" data-tone="danger" data-testid="receipt-reversal">
              {paymentsCopy.reversed}: {r.reversal}
            </p>
          ) : null}
          <p className="text-xs text-muted" data-testid="receipt-legend">
            {r.legend}
          </p>
        </article>
      </Card>
      {canReverse && result.data.status === "valido" ? (
        <Card title={paymentsCopy.reverseTitle}>
          <ReversePaymentForm paymentId={result.data.id} orderId={result.data.orders[0]?.id} />
        </Card>
      ) : null}
    </AppShell>
  );
}
