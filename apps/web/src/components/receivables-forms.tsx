"use client";

import {
  autoAllocation,
  B2B_PAYMENT_METHOD_LABELS,
  B2B_PAYMENT_METHODS,
  formatDateOnly,
  formatMoney,
  previewAllocation,
  receivablesCopy,
  type OpenDocumentRef,
} from "@meguiars/domain";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  allocatePaymentAction,
  createBatchAction,
  registerPaymentAction,
  updateBatchAction,
  voidBatchAction,
  voidPaymentAction,
  type ReceivablesFormState,
} from "@/app/actions/receivables";
import { Button } from "./ui/button";
import { Checkbox, Input, Select } from "./ui/field";
import { useToast } from "./ui/overlay";

function Submit({
  label,
  variant = "primary",
}: {
  label: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { pending } = useFormStatus();
  return <Button type="submit" label={label} loading={pending} variant={variant} size="sm" />;
}

const valueOf = (state: ReceivablesFormState, key: string, fallback = "") => {
  const v = state.values?.[key];
  return typeof v === "string" ? v : fallback;
};
const valuesOf = (state: ReceivablesFormState, key: string, fallback: string[]) => {
  const v = state.values?.[key];
  return Array.isArray(v) ? v : typeof v === "string" ? [v] : fallback;
};

function FormError({ state }: { state: ReceivablesFormState }) {
  return state.error ? (
    <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
      {state.error}
    </p>
  ) : null;
}

function useSuccessToast(state: ReceivablesFormState) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

const parseMoney = (v: string) => {
  const n = Number(v.replace(/[$,\s]/g, ""));
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};

/** Agrupar OS entregadas (y cuota) de la cuenta en un documento de cobro. */
export function BatchForm({
  accountId,
  requestId,
  today,
  unbilled,
  feePending,
}: {
  accountId: string;
  requestId: string;
  today: string;
  unbilled: { id: string; folio: string; total: number; deliveredOn: string }[];
  feePending: number;
}) {
  const [state, action] = useActionState(createBatchAction, {});
  const f = state.fields ?? {};
  const oldest = unbilled.reduce((min, o) => (o.deliveredOn < min ? o.deliveredOn : min), today);
  const selected = valuesOf(
    state,
    "orderIds",
    unbilled.map((o) => o.id),
  );
  return (
    <form
      key={state.at ?? 0}
      action={action}
      className="flex flex-col gap-md"
      noValidate
      data-testid="cxc-batch"
    >
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="requestId" value={requestId} />
      <p className="text-sm text-muted">{receivablesCopy.newBatchHint}</p>
      <div className="grid gap-md md:grid-cols-3">
        <Input
          name="periodFrom"
          type="date"
          label={receivablesCopy.periodFrom}
          required
          defaultValue={valueOf(state, "periodFrom", oldest)}
          error={f.periodFrom}
        />
        <Input
          name="periodTo"
          type="date"
          label={receivablesCopy.periodTo}
          required
          defaultValue={valueOf(state, "periodTo", today)}
          error={f.periodTo}
        />
        <Input
          name="dueOn"
          type="date"
          label={receivablesCopy.batchDue}
          defaultValue={valueOf(state, "dueOn")}
          error={f.dueOn}
        />
      </div>
      <fieldset className="flex flex-col gap-xs">
        <legend className="mg-label">{receivablesCopy.unbilledOrders}</legend>
        {unbilled.length === 0 ? (
          <span className="text-sm text-muted">{receivablesCopy.unbilledEmpty}</span>
        ) : null}
        {unbilled.map((o) => (
          <div key={o.id}>
            <input type="hidden" name="offeredIds" value={o.id} />
            <Checkbox
              name="orderIds"
              value={o.id}
              label={`${o.folio} · ${formatDateOnly(o.deliveredOn)} · ${formatMoney(o.total)}`}
              checked={selected.includes(o.id)}
            />
          </div>
        ))}
      </fieldset>
      <div className="grid gap-md md:grid-cols-3">
        {feePending > 0 ? (
          <Input
            name="feeAmount"
            label={`${receivablesCopy.batchFee} · pendiente ${formatMoney(feePending)}`}
            inputMode="decimal"
            defaultValue={valueOf(state, "feeAmount", String(feePending))}
            error={f.feeAmount}
          />
        ) : null}
        <Input
          name="externalRef"
          label={receivablesCopy.externalRef}
          hint={receivablesCopy.externalRefHint}
          maxLength={80}
          defaultValue={valueOf(state, "externalRef")}
          error={f.externalRef}
        />
        <Input
          name="externalInvoicedOn"
          type="date"
          label={receivablesCopy.externalInvoicedOn}
          defaultValue={valueOf(state, "externalInvoicedOn")}
          error={f.externalInvoicedOn}
        />
      </div>
      <Input
        name="notes"
        label={`${receivablesCopy.notes} (opcional)`}
        maxLength={1000}
        defaultValue={valueOf(state, "notes")}
        error={f.notes}
      />
      <p className="text-xs text-muted">
        {receivablesCopy.notCfdi} {receivablesCopy.pnlNote}
      </p>
      <FormError state={state} />
      <div>
        <Submit label={receivablesCopy.newBatch} />
      </div>
    </form>
  );
}

/** Factura externa (referencia y fecha) y fecha compromiso de un documento, con motivo. */
export function UpdateBatchForm({
  document,
}: {
  document: {
    id: string;
    accountId: string;
    externalRef: string | null;
    externalInvoicedOn: string | null;
    dueOn: string;
  };
}) {
  const [state, action] = useActionState(updateBatchAction, {});
  useSuccessToast(state);
  const f = state.fields ?? {};
  return (
    <form
      key={state.at ?? 0}
      action={action}
      className="flex flex-col gap-md"
      noValidate
      data-testid="cxc-update"
    >
      <input type="hidden" name="invoiceId" value={document.id} />
      <input type="hidden" name="accountId" value={document.accountId} />
      <p className="text-sm text-muted">{receivablesCopy.editHint}</p>
      <div className="grid gap-md md:grid-cols-3">
        <Input
          name="externalRef"
          label={receivablesCopy.externalRef}
          hint={receivablesCopy.externalRefHint}
          maxLength={80}
          defaultValue={valueOf(state, "externalRef", document.externalRef ?? "")}
          error={f.externalRef}
        />
        <Input
          name="externalInvoicedOn"
          type="date"
          label={receivablesCopy.externalInvoicedOn}
          defaultValue={valueOf(state, "externalInvoicedOn", document.externalInvoicedOn ?? "")}
          error={f.externalInvoicedOn}
        />
        <Input
          name="dueOn"
          type="date"
          label={receivablesCopy.dueOn}
          required
          defaultValue={valueOf(state, "dueOn", document.dueOn)}
          error={f.dueOn}
        />
      </div>
      <Input
        name="reason"
        label={receivablesCopy.reason}
        required
        maxLength={500}
        defaultValue={valueOf(state, "reason")}
        error={f.reason}
      />
      <FormError state={state} />
      <div>
        <Submit label={receivablesCopy.edit} />
      </div>
    </form>
  );
}

/** Motivo + confirmación (anular documento o pago). */
function ReasonForm({
  label,
  reasonLabel,
  hidden,
  action: serverAction,
  testId,
}: {
  label: string;
  reasonLabel: string;
  hidden: Record<string, string>;
  action: typeof voidBatchAction;
  testId: string;
}) {
  const [state, action] = useActionState(serverAction, {});
  useSuccessToast(state);
  const [open, setOpen] = useState(false);
  if (!open) return <Button label={label} variant="secondary" size="sm" onClick={() => setOpen(true)} />;
  return (
    <form
      key={state.at ?? 0}
      action={action}
      className="flex flex-wrap items-end gap-sm"
      noValidate
      data-testid={testId}
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="flex-1">
        <Input
          name="reason"
          id={`${testId}-${Object.values(hidden)[0]}`}
          label={reasonLabel}
          required
          maxLength={500}
          error={state.fields?.reason}
        />
      </div>
      <Submit label={label} variant="danger" />
      <FormError state={state} />
    </form>
  );
}

export function VoidDocumentForm({ documentId, accountId }: { documentId: string; accountId: string }) {
  return (
    <ReasonForm
      label={receivablesCopy.void}
      reasonLabel={receivablesCopy.voidReason}
      hidden={{ invoiceId: documentId, accountId }}
      action={voidBatchAction}
      testId="cxc-void"
    />
  );
}

export function VoidPaymentForm({ paymentId, accountId }: { paymentId: string; accountId: string }) {
  return (
    <ReasonForm
      label={receivablesCopy.voidPayment}
      reasonLabel={receivablesCopy.voidPaymentReason}
      hidden={{ paymentId, accountId }}
      action={voidPaymentAction}
      testId="cxc-void-payment"
    />
  );
}

export function AllocatePaymentButton({ paymentId, accountId }: { paymentId: string; accountId: string }) {
  const [state, action] = useActionState(allocatePaymentAction, {});
  useSuccessToast(state);
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-xs">
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="accountId" value={accountId} />
      <div>
        <Submit label={receivablesCopy.allocate} variant="secondary" />
      </div>
      <FormError state={state} />
    </form>
  );
}

/**
 * Pago de la cuenta: aplicación automática (vista previa del orden) o por
 * documento. La base valida saldos y permisos.
 */
export function PaymentForm(props: {
  accountId: string;
  requestId: string;
  today: string;
  documents: OpenDocumentRef[];
  receivable: number;
}) {
  const [state, action] = useActionState(registerPaymentAction, {});
  useSuccessToast(state);
  // Tras registrar el pago se vuelve a montar vacío (la página ya trae los saldos nuevos).
  return <PaymentFields key={state.message ? state.at : "draft"} {...props} state={state} action={action} />;
}

function PaymentFields({
  accountId,
  requestId,
  today,
  documents,
  receivable,
  state: submitted,
  action,
}: {
  accountId: string;
  requestId: string;
  today: string;
  documents: OpenDocumentRef[];
  receivable: number;
  state: ReceivablesFormState;
  action: (form: FormData) => void;
}) {
  // Tras un éxito no se repintan los valores enviados.
  const state: ReceivablesFormState = submitted.message ? {} : submitted;
  const f = state.fields ?? {};
  const [amount, setAmount] = useState(valueOf(state, "amount"));
  const [mode, setMode] = useState(valueOf(state, "mode", "auto"));
  const [alloc, setAlloc] = useState<Record<string, string>>(() =>
    Object.fromEntries(documents.map((d) => [d.id, valueOf(state, `alloc:${d.id}`)])),
  );
  const n = parseMoney(amount);
  const auto = n !== null && n > 0 ? autoAllocation(n, documents) : [];
  const manual = documents
    .map((d) => ({ invoiceId: d.id, amount: parseMoney(alloc[d.id] ?? "") ?? 0 }))
    .filter((a) => a.amount > 0);
  const preview =
    n !== null ? previewAllocation(n, mode === "manual" ? manual : auto, documents, receivable) : null;
  return (
    <form
      key={submitted.at ?? 0}
      action={action}
      className="flex flex-col gap-md"
      noValidate
      data-testid="cxc-payment"
    >
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="requestId" value={requestId} />
      <p className="text-sm text-muted">{receivablesCopy.newPaymentHint}</p>
      <div className="grid gap-md md:grid-cols-4">
        <Input
          name="amount"
          label={receivablesCopy.paymentAmount}
          inputMode="decimal"
          required
          value={amount}
          onChange={(e) => setAmount(e.currentTarget.value)}
          error={f.amount}
        />
        <Select
          name="method"
          label={receivablesCopy.paymentMethod}
          options={B2B_PAYMENT_METHODS.map((m) => ({ value: m, label: B2B_PAYMENT_METHOD_LABELS[m] }))}
          defaultValue={valueOf(state, "method", "transferencia")}
          error={f.method}
        />
        <Input
          name="paidOn"
          type="date"
          label={receivablesCopy.paidOn}
          defaultValue={valueOf(state, "paidOn", today)}
          max={today}
          error={f.paidOn}
        />
        <Input
          name="reference"
          id="cxc-payment-reference"
          label={receivablesCopy.paymentReference}
          maxLength={120}
          defaultValue={valueOf(state, "reference")}
          error={f.reference}
        />
      </div>
      <Select
        name="mode"
        label={receivablesCopy.allocation}
        options={[
          { value: "auto", label: receivablesCopy.allocationAuto },
          { value: "manual", label: receivablesCopy.allocationManual },
        ]}
        value={mode}
        onChange={(e) => setMode(e.currentTarget.value)}
      />
      {mode === "manual" ? (
        <fieldset className="flex flex-col gap-xs">
          <legend className="mg-label">{receivablesCopy.allocation}</legend>
          {documents.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-sm">
              <label htmlFor={`alloc-${d.id}`} className="text-sm">
                {d.folio} · saldo {formatMoney(d.balance)} · {receivablesCopy.dueOn.toLowerCase()}{" "}
                {formatDateOnly(d.dueOn)}
              </label>
              <input
                id={`alloc-${d.id}`}
                name={`alloc:${d.id}`}
                inputMode="decimal"
                aria-label={`${receivablesCopy.applied}: ${d.folio}`}
                placeholder="0"
                size={10}
                className="mg-input text-right"
                value={alloc[d.id] ?? ""}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  setAlloc((a) => ({ ...a, [d.id]: v }));
                }}
              />
            </div>
          ))}
        </fieldset>
      ) : auto.length > 0 ? (
        <p className="text-sm" data-testid="cxc-auto-preview">
          {receivablesCopy.applied}:{" "}
          {auto
            .map(
              (a) => `${documents.find((d) => d.id === a.invoiceId)?.folio ?? ""} ${formatMoney(a.amount)}`,
            )
            .join(" · ")}
        </p>
      ) : null}
      {preview ? (
        <p className="text-sm text-muted" data-testid="cxc-payment-preview">
          {receivablesCopy.applied} {formatMoney(preview.applied)} · {receivablesCopy.unapplied.toLowerCase()}{" "}
          {formatMoney(preview.unapplied)}
        </p>
      ) : null}
      {preview && preview.issues.length > 0 ? (
        <ul className="mg-tone rounded-md border p-sm text-sm" data-tone="warning">
          {preview.issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : null}
      <FormError state={state} />
      <div>
        <Submit label={receivablesCopy.newPayment} />
      </div>
    </form>
  );
}
