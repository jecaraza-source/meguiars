import {
  autoAllocation,
  B2B_PAYMENT_METHOD_LABELS,
  B2B_PAYMENT_METHODS,
  formatDateOnly,
  formatMoney,
  newRequestId,
  previewAllocation,
  receivablesCopy,
  receivablesErrorMessage,
  type OpenDocumentRef,
  type Result,
} from "@meguiars/domain";
import { createReceivablesRepository } from "@meguiars/supabase";
import {
  billingBatchSchema,
  fieldErrors,
  registerB2bPaymentSchema,
  updateBillingBatchSchema,
} from "@meguiars/validation";
import { space } from "@meguiars/ui-tokens";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { z } from "zod";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Checkbox, Field, Select } from "@/ui/controls";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";

/**
 * Formularios de cuentas por cobrar B2B en móvil (equivalen a
 * components/receivables-forms.tsx de web). Mismos esquemas y RPC; la base
 * vuelve a validar permisos y saldos. Requieren conexión (sin cola offline).
 */

type Repo = ReturnType<typeof createReceivablesRepository>;

const parseMoney = (v: string) => {
  const n = Number(v.replace(/[$,\s]/g, ""));
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};

function useSubmit() {
  const { client } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  async function submit<T>(
    schema: z.ZodType | null,
    input: unknown,
    call: (repo: Repo) => Promise<Result<T>>,
    message: string,
    onOk: (data: T) => void,
  ) {
    if (!client) return;
    if (schema) {
      const parsed = schema.safeParse(input);
      if (!parsed.success) {
        const f = fieldErrors(parsed.error);
        setFields(f);
        const hidden = Object.entries(f).find(([k]) => k.startsWith("allocations") || k === "orderIds");
        setError(hidden ? hidden[1] : null);
        return;
      }
    }
    setFields({});
    setError(null);
    setBusy(true);
    const r = await call(createReceivablesRepository(client));
    setBusy(false);
    if (!r.ok) return setError(receivablesErrorMessage(r.error));
    toast({ message, tone: "success" });
    onOk(r.data);
  }
  return { busy, error, fields, submit };
}

/** Agrupar OS entregadas (todas las del periodo o las elegidas) y la cuota. */
export function BatchEditor({
  accountId,
  today,
  unbilled,
  feePending,
  onCreated,
}: {
  accountId: string;
  today: string;
  unbilled: { id: string; folio: string; total: number; deliveredOn: string }[];
  feePending: number;
  onCreated: (documentId: string) => void;
}) {
  const { busy, error, fields, submit } = useSubmit();
  const [requestId] = useState(newRequestId);
  const oldest = unbilled.reduce((min, o) => (o.deliveredOn < min ? o.deliveredOn : min), today);
  const [v, setV] = useState({
    periodFrom: oldest,
    periodTo: today,
    dueOn: "",
    feeAmount: feePending > 0 ? String(feePending) : "",
    externalRef: "",
    externalInvoicedOn: "",
    notes: "",
  });
  const [selected, setSelected] = useState<string[]>(unbilled.map((o) => o.id));
  const set = (k: keyof typeof v) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  // Todas marcadas = todas las del periodo (igual que web).
  const command = {
    ...v,
    accountId,
    requestId,
    orderIds: selected.length === unbilled.length ? undefined : selected,
  };
  return (
    <View style={styles.stack}>
      <Text style={textStyle("bodySmall", "muted")}>{receivablesCopy.newBatchHint}</Text>
      <Field
        label={`${receivablesCopy.periodFrom} (AAAA-MM-DD)`}
        value={v.periodFrom}
        onChangeText={set("periodFrom")}
        error={fields.periodFrom}
      />
      <Field
        label={`${receivablesCopy.periodTo} (AAAA-MM-DD)`}
        value={v.periodTo}
        onChangeText={set("periodTo")}
        error={fields.periodTo}
      />
      <Text style={textStyle("label")}>{receivablesCopy.unbilledOrders}</Text>
      {unbilled.map((o) => (
        <Checkbox
          key={o.id}
          label={`${o.folio} · ${formatDateOnly(o.deliveredOn)} · ${formatMoney(o.total)}`}
          checked={selected.includes(o.id)}
          onChange={(on) => setSelected((ids) => (on ? [...ids, o.id] : ids.filter((x) => x !== o.id)))}
        />
      ))}
      {feePending > 0 ? (
        <Field
          label={`${receivablesCopy.batchFee} · pendiente ${formatMoney(feePending)}`}
          value={v.feeAmount}
          onChangeText={set("feeAmount")}
          keyboardType="decimal-pad"
          error={fields.feeAmount}
        />
      ) : null}
      <Field
        label={`${receivablesCopy.batchDue} (AAAA-MM-DD)`}
        value={v.dueOn}
        onChangeText={set("dueOn")}
        error={fields.dueOn}
      />
      <Field
        label={receivablesCopy.externalRef}
        hint={receivablesCopy.externalRefHint}
        value={v.externalRef}
        onChangeText={set("externalRef")}
        maxLength={80}
        error={fields.externalRef}
      />
      <Field
        label={`${receivablesCopy.externalInvoicedOn} (AAAA-MM-DD)`}
        value={v.externalInvoicedOn}
        onChangeText={set("externalInvoicedOn")}
        error={fields.externalInvoicedOn}
      />
      <Field label={`${receivablesCopy.notes} (opcional)`} value={v.notes} onChangeText={set("notes")} />
      <Text style={textStyle("caption", "muted")}>
        {receivablesCopy.notCfdi} {receivablesCopy.pnlNote}
      </Text>
      <Notice tone="danger" text={error} />
      <Button
        label={receivablesCopy.newBatch}
        loading={busy}
        onPress={() =>
          void submit(
            billingBatchSchema,
            command,
            (repo) => repo.createBatch(command as unknown as Parameters<Repo["createBatch"]>[0]),
            receivablesCopy.batchCreated,
            (d) => onCreated(d.id),
          )
        }
      />
    </View>
  );
}

/** Factura externa y fecha compromiso (con motivo). */
export function UpdateBatchEditor({
  document,
  onDone,
}: {
  document: { id: string; externalRef: string | null; externalInvoicedOn: string | null; dueOn: string };
  onDone: () => void;
}) {
  const { busy, error, fields, submit } = useSubmit();
  const [v, setV] = useState({
    externalRef: document.externalRef ?? "",
    externalInvoicedOn: document.externalInvoicedOn ?? "",
    dueOn: document.dueOn,
    reason: "",
  });
  const set = (k: keyof typeof v) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  const command = { ...v, invoiceId: document.id };
  return (
    <View style={styles.stack}>
      <Text style={textStyle("bodySmall", "muted")}>{receivablesCopy.editHint}</Text>
      <Field
        label={receivablesCopy.externalRef}
        value={v.externalRef}
        onChangeText={set("externalRef")}
        maxLength={80}
        error={fields.externalRef}
      />
      <Field
        label={`${receivablesCopy.externalInvoicedOn} (AAAA-MM-DD)`}
        value={v.externalInvoicedOn}
        onChangeText={set("externalInvoicedOn")}
        error={fields.externalInvoicedOn}
      />
      <Field
        label={`${receivablesCopy.dueOn} (AAAA-MM-DD)`}
        required
        value={v.dueOn}
        onChangeText={set("dueOn")}
        error={fields.dueOn}
      />
      <Field
        label={receivablesCopy.reason}
        required
        value={v.reason}
        onChangeText={set("reason")}
        error={fields.reason}
      />
      <Notice tone="danger" text={error} />
      <Button
        label={receivablesCopy.edit}
        loading={busy}
        onPress={() =>
          void submit(
            updateBillingBatchSchema,
            command,
            (repo) => repo.updateBatch(command as unknown as Parameters<Repo["updateBatch"]>[0]),
            receivablesCopy.saved,
            () => {
              setV((s) => ({ ...s, reason: "" }));
              onDone();
            },
          )
        }
      />
    </View>
  );
}

/** Acción con motivo (anular documento o pago). */
export function ReceivablesReasonAction({
  label,
  reasonLabel,
  message,
  run,
  onDone,
}: {
  label: string;
  reasonLabel: string;
  message: string;
  run: (repo: Repo, reason: string) => Promise<Result<void>>;
  onDone: () => void;
}) {
  const { busy, error, submit } = useSubmit();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) return <Button label={label} variant="secondary" onPress={() => setOpen(true)} />;
  return (
    <View style={styles.stack}>
      <Field label={reasonLabel} required value={reason} onChangeText={setReason} maxLength={500} />
      <Notice tone="danger" text={error} />
      <Button
        label={label}
        variant="danger"
        loading={busy}
        onPress={() =>
          void submit(
            null,
            null,
            (repo) => run(repo, reason),
            message,
            () => {
              setOpen(false);
              setReason("");
              onDone();
            },
          )
        }
      />
    </View>
  );
}

export function AllocateAction({ paymentId, onDone }: { paymentId: string; onDone: () => void }) {
  const { busy, error, submit } = useSubmit();
  return (
    <View style={styles.stack}>
      <Notice tone="danger" text={error} />
      <Button
        label={receivablesCopy.allocate}
        variant="secondary"
        loading={busy}
        onPress={() =>
          void submit(
            null,
            null,
            (repo) => repo.allocatePayment({ paymentId }),
            receivablesCopy.allocated,
            onDone,
          )
        }
      />
    </View>
  );
}

/** Pago de la cuenta con aplicación automática (vista previa) o por documento. */
export function PaymentEditor({
  accountId,
  today,
  documents,
  receivable,
  onDone,
}: {
  accountId: string;
  today: string;
  documents: OpenDocumentRef[];
  receivable: number;
  onDone: () => void;
}) {
  const { busy, error, fields, submit } = useSubmit();
  const [requestId, setRequestId] = useState(newRequestId);
  const [v, setV] = useState({
    amount: "",
    method: "transferencia",
    reference: "",
    paidOn: today,
    mode: "auto",
  });
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const set = (k: keyof typeof v) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  const n = parseMoney(v.amount);
  const auto = n !== null && n > 0 ? autoAllocation(n, documents) : [];
  const manual = documents
    .map((d) => ({ invoiceId: d.id, amount: parseMoney(alloc[d.id] ?? "") ?? 0 }))
    .filter((a) => a.amount > 0);
  const preview =
    n !== null ? previewAllocation(n, v.mode === "manual" ? manual : auto, documents, receivable) : null;
  const command = {
    accountId,
    requestId,
    amount: v.amount,
    method: v.method,
    reference: v.reference,
    paidOn: v.paidOn,
    allocations: v.mode === "manual" ? manual : undefined,
  };
  return (
    <View style={styles.stack}>
      <Text style={textStyle("bodySmall", "muted")}>{receivablesCopy.newPaymentHint}</Text>
      <Field
        label={receivablesCopy.paymentAmount}
        required
        value={v.amount}
        onChangeText={set("amount")}
        keyboardType="decimal-pad"
        error={fields.amount}
      />
      <Select
        label={receivablesCopy.paymentMethod}
        options={B2B_PAYMENT_METHODS.map((m) => ({ value: m, label: B2B_PAYMENT_METHOD_LABELS[m] }))}
        value={v.method}
        onChange={set("method")}
      />
      <Field
        label={`${receivablesCopy.paidOn} (AAAA-MM-DD)`}
        value={v.paidOn}
        onChangeText={set("paidOn")}
        error={fields.paidOn}
      />
      <Field label={receivablesCopy.paymentReference} value={v.reference} onChangeText={set("reference")} />
      <Select
        label={receivablesCopy.allocation}
        options={[
          { value: "auto", label: receivablesCopy.allocationAuto },
          { value: "manual", label: receivablesCopy.allocationManual },
        ]}
        value={v.mode}
        onChange={set("mode")}
      />
      {v.mode === "manual" ? (
        documents.map((d) => (
          <Field
            key={d.id}
            label={`${d.folio} · saldo ${formatMoney(d.balance)}`}
            value={alloc[d.id] ?? ""}
            onChangeText={(x) => setAlloc((a) => ({ ...a, [d.id]: x }))}
            keyboardType="decimal-pad"
          />
        ))
      ) : auto.length > 0 ? (
        <Text style={textStyle("bodySmall")}>
          {receivablesCopy.applied}:{" "}
          {auto
            .map(
              (a) => `${documents.find((d) => d.id === a.invoiceId)?.folio ?? ""} ${formatMoney(a.amount)}`,
            )
            .join(" · ")}
        </Text>
      ) : null}
      {preview ? (
        <Text style={textStyle("caption", "muted")}>
          {receivablesCopy.applied} {formatMoney(preview.applied)} · {receivablesCopy.unapplied.toLowerCase()}{" "}
          {formatMoney(preview.unapplied)}
        </Text>
      ) : null}
      {preview && preview.issues.length > 0 ? (
        <Notice tone="warning" text={preview.issues.join(" ")} />
      ) : null}
      <Notice tone="danger" text={error} />
      <Button
        label={receivablesCopy.newPayment}
        loading={busy}
        onPress={() =>
          void submit(
            registerB2bPaymentSchema,
            command,
            (repo) => repo.registerPayment(command as unknown as Parameters<Repo["registerPayment"]>[0]),
            receivablesCopy.paymentRecorded,
            () => {
              setRequestId(newRequestId());
              setV((s) => ({ ...s, amount: "", reference: "" }));
              setAlloc({});
              onDone();
            },
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
});
