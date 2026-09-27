"use client";

import {
  formatMoney,
  ORDER_PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_RULES,
  paymentsCopy,
  summarizeTenders,
  type PaymentMethod,
} from "@meguiars/domain";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { registerPaymentAction, reversePaymentAction, type PaymentFormState } from "@/app/actions/payments";
import { Button } from "./ui/button";
import { Input, Select } from "./ui/field";
import { useToast } from "./ui/overlay";

function Submit({ label, variant = "primary" }: { label: string; variant?: "primary" | "danger" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" label={label} loading={pending} variant={variant} size="sm" />;
}

function useToastOnMessage(state: PaymentFormState) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

function FormError({ state }: { state: PaymentFormState }) {
  return state.error ? (
    <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
      {state.error}
    </p>
  ) : null;
}

interface TenderRow {
  method: PaymentMethod;
  amount: string;
  reference: string;
}

const parseAmount = (v: string) => {
  const n = Number(v.replace(/[$,\s]/g, ""));
  return v.trim() === "" || !Number.isFinite(n) ? 0 : n;
};

/**
 * Cobro de la OS: una o varias formas de pago (pago mixto), efectivo recibido y
 * cambio. La vista previa usa las mismas reglas que la base (sin sobrepago); la
 * base vuelve a validar. Requiere conexión: nada se guarda sin internet.
 */
export function OrderPaymentForm({
  order,
  allowed,
  requestId,
}: {
  order: { id: string; version: number; total: number; paidAmount: number; b2bAccountId: string | null };
  allowed: readonly PaymentMethod[];
  requestId: string;
}) {
  const [state, action] = useActionState(registerPaymentAction, {});
  useToastOnMessage(state);
  return (
    <form action={action} className="flex flex-col gap-md" noValidate data-testid="payment-form">
      <input type="hidden" name="orderId" value={order.id} />
      <input type="hidden" name="version" value={order.version} />
      <input type="hidden" name="requestId" value={requestId} />
      {/* Tras un cobro la OS cambia de versión: los campos se reinician con el saldo nuevo. */}
      <PaymentFields key={order.version} order={order} allowed={allowed} state={state} />
      <FormError state={state} />
      <p className="text-xs text-muted">{paymentsCopy.onlineOnly}</p>
      <div>
        <Submit label={paymentsCopy.register} />
      </div>
    </form>
  );
}

function PaymentFields({
  order,
  allowed,
  state,
}: {
  order: { total: number; paidAmount: number; b2bAccountId: string | null };
  allowed: readonly PaymentMethod[];
  state: PaymentFormState;
}) {
  const balance = Math.max(0, Math.round((order.total - order.paidAmount) * 100) / 100);
  const [rows, setRows] = useState<TenderRow[]>([
    { method: allowed[0] ?? "efectivo", amount: balance.toFixed(2), reference: "" },
  ]);
  const [cash, setCash] = useState("");
  const tenders = rows.map((r) => ({
    method: r.method,
    amount: parseAmount(r.amount),
    reference: r.reference,
  }));
  const hasCash = rows.some((r) => PAYMENT_METHOD_RULES[r.method].allowsChange);
  const preview = summarizeTenders(order, tenders, hasCash && cash.trim() ? parseAmount(cash) : null);
  const update = (i: number, patch: Partial<TenderRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const options = allowed.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }));

  return (
    <>
      {rows.map((r, i) => (
        <fieldset key={i} className="grid items-end gap-md md:grid-cols-4" data-testid="tender">
          <legend className="sr-only">
            {paymentsCopy.method} {i + 1}
          </legend>
          <Select
            name={`tenders.${i}.method`}
            label={paymentsCopy.method}
            options={options}
            value={r.method}
            onChange={(e) => update(i, { method: e.target.value as PaymentMethod })}
          />
          <Input
            name={`tenders.${i}.amount`}
            label={paymentsCopy.amount}
            inputMode="decimal"
            value={r.amount}
            onChange={(e) => update(i, { amount: e.target.value })}
          />
          <Input
            name={`tenders.${i}.reference`}
            label={
              PAYMENT_METHOD_RULES[r.method].requiresReference
                ? paymentsCopy.reference
                : paymentsCopy.referenceOptional
            }
            value={r.reference}
            onChange={(e) => update(i, { reference: e.target.value })}
          />
          {rows.length > 1 ? (
            <Button
              type="button"
              label={paymentsCopy.removeTender}
              variant="secondary"
              size="sm"
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
            />
          ) : (
            <span />
          )}
        </fieldset>
      ))}
      {allowed.length > 1 && rows.length < 5 ? (
        <div>
          <Button
            type="button"
            label={paymentsCopy.addTender}
            variant="secondary"
            size="sm"
            onClick={() =>
              setRows((rs) => [
                ...rs,
                {
                  method: allowed.find((m) => !rs.some((r) => r.method === m)) ?? allowed[0]!,
                  amount: preview.remaining > 0 ? preview.remaining.toFixed(2) : "",
                  reference: "",
                },
              ])
            }
          />
        </div>
      ) : null}
      <div className="grid gap-md md:grid-cols-2">
        {hasCash ? (
          <Input
            name="cashReceived"
            label={paymentsCopy.cashReceived}
            hint={paymentsCopy.cashReceivedHint}
            inputMode="decimal"
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            error={state.fields?.cashReceived}
          />
        ) : null}
        <Input name="notes" label={paymentsCopy.notes} maxLength={500} error={state.fields?.notes} />
      </div>
      <dl className="grid gap-sm text-sm md:grid-cols-3" data-testid="payment-preview" aria-live="polite">
        <div>
          <dt className="text-muted">{paymentsCopy.amount}</dt>
          <dd className="font-medium">{formatMoney(preview.total)}</dd>
        </div>
        <div>
          <dt className="text-muted">{paymentsCopy.remainingAfter}</dt>
          <dd>
            {formatMoney(preview.remaining)} · {ORDER_PAYMENT_STATUS_LABELS[preview.status]}
          </dd>
        </div>
        {preview.change > 0 ? (
          <div>
            <dt className="text-muted">{paymentsCopy.change}</dt>
            <dd className="font-medium" data-testid="payment-change">
              {formatMoney(preview.change)}
            </dd>
          </div>
        ) : null}
      </dl>
      {preview.error && rows.every((r) => r.amount.trim() !== "") ? (
        <p className="text-sm text-muted" data-testid="payment-preview-error">
          {preview.error}
        </p>
      ) : null}
    </>
  );
}

/** Reverso de un recibo completo, con motivo (encargado o admin). */
export function ReversePaymentForm({ paymentId, orderId }: { paymentId: string; orderId?: string }) {
  const [state, action] = useActionState(reversePaymentAction, {});
  useToastOnMessage(state);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer underline">{paymentsCopy.reverse}</summary>
      <form key={state.at ?? 0} action={action} className="mt-sm flex flex-col gap-sm" noValidate>
        <input type="hidden" name="paymentId" value={paymentId} />
        {orderId ? <input type="hidden" name="orderId" value={orderId} /> : null}
        <p className="text-muted">{paymentsCopy.reverseHint}</p>
        <Input
          name="reason"
          id={`reason-${paymentId}`}
          label={paymentsCopy.reverseReason}
          maxLength={500}
          defaultValue={typeof state.values?.reason === "string" ? state.values.reason : ""}
          error={state.fields?.reason}
        />
        <FormError state={state} />
        <div>
          <Submit label={paymentsCopy.reverseConfirm} variant="danger" />
        </div>
      </form>
    </details>
  );
}

/** Botón de impresión del recibo interno. */
export function PrintButton() {
  return (
    <Button
      type="button"
      label={paymentsCopy.print}
      variant="secondary"
      size="sm"
      onClick={() => window.print()}
    />
  );
}
