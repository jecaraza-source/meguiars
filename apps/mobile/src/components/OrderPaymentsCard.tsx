import {
  allowedPaymentMethods,
  canInActiveCenter,
  formatMoney,
  newRequestId,
  ORDER_PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_RULES,
  paymentErrorMessage,
  paymentsCopy,
  presentOrderPayment,
  presentOrderPaymentRow,
  summarizeTenders,
  todayIn,
  type OrderPayment,
  type PaymentMethod,
  type ServiceOrder,
  type SignedInState,
  type ViewState,
} from "@meguiars/domain";
import { createPaymentRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { paymentFormSchema, reversePaymentSchema } from "@meguiars/validation";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, LinkButton, Select } from "@/ui/controls";
import { Badge, Card } from "@/ui/display";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";

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
 * Cobro de la OS (equivale a la tarjeta de cobro de /ordenes/[id] en web):
 * estado de pago, pago mixto con efectivo recibido y cambio, recibos y reverso.
 * Requiere conexión; el requestId se conserva en los reintentos (idempotente).
 */
export function OrderPaymentsCard({
  state,
  order,
  timeZone,
  canPay,
  onChanged,
  onOpenReceipt,
}: {
  state: SignedInState;
  order: ServiceOrder;
  timeZone: string;
  canPay: boolean;
  onChanged: () => void;
  onOpenReceipt: (id: string) => void;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const view = presentOrderPayment(order);
  const canRead = canInActiveCenter(state, "payments.read");
  const canWrite = canPay && canInActiveCenter(state, "payments.write");
  const canReverse = canInActiveCenter(state, "payments.reverse");
  const [payments, setPayments] = useState<ViewState<OrderPayment[]>>({ status: "loading" });
  const [membership, setMembership] = useState(false);
  const [requestId] = useState(newRequestId);
  const [rows, setRows] = useState<TenderRow[]>([]);
  const [cash, setCash] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reversing, setReversing] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!client) return;
    let active = true;
    const repo = createPaymentRepository(client);
    void Promise.all([
      canRead ? repo.orderPayments(order.id) : Promise.resolve(null),
      canWrite && !order.b2bAccountId
        ? repo.hasActiveMembership(order.clientId, todayIn(timeZone)).then((r) => r.ok && r.data)
        : Promise.resolve(false),
    ]).then(([list, hasMembership]) => {
      if (!active) return;
      if (list)
        setPayments(
          list.ok
            ? { status: "ready", data: list.data }
            : { status: "error", message: paymentErrorMessage(list.error) },
        );
      setMembership(hasMembership);
    });
    return () => {
      active = false;
    };
  }, [client, order.id, order.clientId, order.b2bAccountId, canRead, canWrite, timeZone]);

  const allowed = allowedPaymentMethods({
    b2bAccountId: order.b2bAccountId,
    hasActiveMembership: membership,
  });
  const tenderRows =
    rows.length > 0
      ? rows
      : [{ method: allowed[0] ?? "efectivo", amount: view.balanceValue.toFixed(2), reference: "" }];
  const tenders = tenderRows.map((r) => ({
    method: r.method,
    amount: parseAmount(r.amount),
    reference: r.reference,
  }));
  const hasCash = tenderRows.some((r) => PAYMENT_METHOD_RULES[r.method].allowsChange);
  const preview = summarizeTenders(order, tenders, hasCash && cash.trim() ? parseAmount(cash) : null);
  const update = (i: number, patch: Partial<TenderRow>) =>
    setRows(tenderRows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    if (!client) return;
    const parsed = paymentFormSchema.safeParse({
      tenders: tenderRows,
      cashReceived: hasCash ? cash : "",
      notes,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? paymentsCopy.forbidden);
    setBusy(true);
    const result = await createPaymentRepository(client).register({
      ...parsed.data,
      orderId: order.id,
      version: order.version,
      requestId,
    });
    setBusy(false);
    if (!result.ok) {
      setError(paymentErrorMessage(result.error));
      if (result.error.code === "40001") onChanged();
      return;
    }
    toast({ message: `${paymentsCopy.registered} ${result.data.receiptFolio}`, tone: "success" });
    onChanged();
  };

  const reverse = async (paymentId: string) => {
    if (!client) return;
    const parsed = reversePaymentSchema.safeParse({ paymentId, reason });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? null);
    setBusy(true);
    const result = await createPaymentRepository(client).reverse(parsed.data);
    setBusy(false);
    if (!result.ok) return setError(paymentErrorMessage(result.error));
    toast({ message: paymentsCopy.reverseDone, tone: "success" });
    onChanged();
  };

  return (
    <Card title={paymentsCopy.orderTitle} subtitle={paymentsCopy.discountsNote}>
      <Badge label={view.statusLabel} tone={view.statusTone} />
      <Text style={textStyle("bodySmall")}>
        {paymentsCopy.total} {view.total} · {paymentsCopy.paid} {view.paid} · {paymentsCopy.balance}{" "}
        {view.balance}
      </Text>
      {view.hint ? <Text style={textStyle("bodySmall", "muted")}>{view.hint}</Text> : null}

      {canWrite && !view.payable ? <Text style={textStyle("bodySmall", "muted")}>{view.blocked}</Text> : null}
      {canWrite && view.payable ? (
        <View style={styles.form}>
          {tenderRows.map((r, i) => (
            <View key={i} style={styles.tender}>
              <Select
                label={paymentsCopy.method}
                options={allowed.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))}
                value={r.method}
                onChange={(v) => update(i, { method: v as PaymentMethod })}
              />
              <Field
                label={paymentsCopy.amount}
                keyboardType="decimal-pad"
                value={r.amount}
                onChangeText={(v) => update(i, { amount: v })}
              />
              <Field
                label={
                  PAYMENT_METHOD_RULES[r.method].requiresReference
                    ? paymentsCopy.reference
                    : paymentsCopy.referenceOptional
                }
                value={r.reference}
                onChangeText={(v) => update(i, { reference: v })}
              />
              {tenderRows.length > 1 ? (
                <LinkButton
                  label={paymentsCopy.removeTender}
                  onPress={() => setRows(tenderRows.filter((_, j) => j !== i))}
                />
              ) : null}
            </View>
          ))}
          {allowed.length > 1 && tenderRows.length < 5 ? (
            <LinkButton
              label={paymentsCopy.addTender}
              onPress={() =>
                setRows([
                  ...tenderRows,
                  {
                    method: allowed.find((m) => !tenderRows.some((r) => r.method === m)) ?? allowed[0]!,
                    amount: preview.remaining > 0 ? preview.remaining.toFixed(2) : "",
                    reference: "",
                  },
                ])
              }
            />
          ) : null}
          {hasCash ? (
            <Field
              label={paymentsCopy.cashReceived}
              hint={paymentsCopy.cashReceivedHint}
              keyboardType="decimal-pad"
              value={cash}
              onChangeText={setCash}
            />
          ) : null}
          <Field label={paymentsCopy.notes} value={notes} onChangeText={setNotes} maxLength={500} />
          <Text style={textStyle("label")}>
            {paymentsCopy.amount} {formatMoney(preview.total)} · {paymentsCopy.remainingAfter}{" "}
            {formatMoney(preview.remaining)} ({ORDER_PAYMENT_STATUS_LABELS[preview.status]})
          </Text>
          {preview.change > 0 ? (
            <Text style={textStyle("label")}>
              {paymentsCopy.change} {formatMoney(preview.change)}
            </Text>
          ) : null}
          {preview.error ? <Text style={textStyle("bodySmall", "muted")}>{preview.error}</Text> : null}
          <Notice tone="danger" text={error} />
          <Text style={textStyle("caption", "muted")}>{paymentsCopy.onlineOnly}</Text>
          <Button label={paymentsCopy.register} loading={busy} onPress={() => void submit()} />
        </View>
      ) : null}

      {canRead ? (
        <View style={styles.form}>
          <Text style={textStyle("label")}>{paymentsCopy.receipts}</Text>
          {payments.status === "loading" ? <Text style={textStyle("bodySmall", "muted")}>…</Text> : null}
          {payments.status === "error" ? <Notice tone="danger" text={payments.message} /> : null}
          {payments.status === "ready" && payments.data.length === 0 ? (
            <Text style={textStyle("bodySmall", "muted")}>{paymentsCopy.receiptsEmpty}</Text>
          ) : null}
          {payments.status === "ready"
            ? payments.data.map((p) => {
                const r = presentOrderPaymentRow(p, timeZone);
                return (
                  <View key={p.id} style={styles.receipt}>
                    <LinkButton label={`${r.folio} · ${r.amount}`} onPress={() => onOpenReceipt(p.id)} />
                    <Badge label={r.status} tone={r.statusTone} />
                    <Text style={textStyle("bodySmall")}>
                      {r.tenders}
                      {r.change ? ` · ${r.change}` : ""}
                    </Text>
                    <Text style={textStyle("caption", "muted")}>
                      {r.who} · {r.when}
                    </Text>
                    {r.reversal ? <Text style={textStyle("bodySmall", "muted")}>{r.reversal}</Text> : null}
                    {canReverse && r.valid && reversing !== p.id ? (
                      <LinkButton label={paymentsCopy.reverse} onPress={() => setReversing(p.id)} />
                    ) : null}
                    {canReverse && reversing === p.id ? (
                      <View style={styles.form}>
                        <Text style={textStyle("bodySmall", "muted")}>{paymentsCopy.reverseHint}</Text>
                        <Field
                          label={paymentsCopy.reverseReason}
                          value={reason}
                          onChangeText={setReason}
                          maxLength={500}
                        />
                        <Button
                          label={paymentsCopy.reverseConfirm}
                          variant="danger"
                          loading={busy}
                          onPress={() => void reverse(p.id)}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })
            : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.md },
  tender: { gap: space.sm },
  receipt: { gap: space.xs },
});
