import {
  canInCenter,
  paymentErrorMessage,
  paymentsCopy,
  presentReceipt,
  type PaymentReceipt,
  type ViewState,
} from "@meguiars/domain";
import { createPaymentRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { reversePaymentSchema } from "@meguiars/validation";
import { useCallback, useEffect, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, LinkButton } from "@/ui/controls";
import { Badge, Card, EmptyState, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

/** Recibo interno (no es CFDI); se comparte como texto (equivale a /finanzas/cobranza/recibos/[id] en web). */
export function ReceiptScreen({
  state,
  header,
  paymentId,
  onBack,
}: PrivateScreenProps & { paymentId: string; onBack: () => void }) {
  const { client } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<ViewState<PaymentReceipt>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void createPaymentRepository(client)
      .receipt(paymentId)
      .then((r) => {
        if (!active) return;
        setData(
          r.ok
            ? { status: "ready", data: r.data }
            : { status: "error", message: paymentErrorMessage(r.error) },
        );
      });
    return () => {
      active = false;
    };
  }, [client, paymentId, version]);

  const back = <LinkButton label={`← ${paymentsCopy.title}`} onPress={onBack} />;
  if (data.status !== "ready") {
    return (
      <Screen title={paymentsCopy.receipt} header={header}>
        {back}
        {data.status === "loading" ? <Skeleton lines={5} label="Cargando recibo" /> : null}
        {data.status === "error" || data.status === "permission_denied" ? (
          <EmptyState title={paymentsCopy.notFound} message={data.message} />
        ) : null}
      </Screen>
    );
  }

  const receipt = data.data;
  const r = presentReceipt(receipt);
  const canReverse =
    receipt.status === "valido" && canInCenter(state, receipt.detailCenterId, "payments.reverse");
  const asText = [
    `${r.title} ${r.folio}`,
    `${r.organization} · ${r.center}`,
    `${paymentsCopy.receivedAt}: ${r.when}`,
    `${paymentsCopy.client}: ${r.client}`,
    ...r.orders.map(
      (o) => `OS ${o.folio}: ${paymentsCopy.applied} ${o.applied} · ${paymentsCopy.balance} ${o.balance}`,
    ),
    ...r.tenders.map((t) => `${t.label}: ${t.amount}${t.reference ? ` · ${t.reference}` : ""}`),
    `Total ${r.amount}`,
    ...(r.change ? [`${paymentsCopy.change} ${r.change}`] : []),
    ...(r.reversal ? [`${paymentsCopy.reversed}: ${r.reversal}`] : []),
    r.legend,
  ].join("\n");

  const reverse = async () => {
    if (!client) return;
    const parsed = reversePaymentSchema.safeParse({ paymentId: receipt.id, reason });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? null);
    setBusy(true);
    const result = await createPaymentRepository(client).reverse(parsed.data);
    setBusy(false);
    if (!result.ok) return setError(paymentErrorMessage(result.error));
    toast({ message: paymentsCopy.reverseDone, tone: "success" });
    reload();
  };

  return (
    <Screen title={`${paymentsCopy.receipt} ${r.folio}`} header={header}>
      {back}
      <Card title={r.title} subtitle={`${r.organization} · ${r.center}`}>
        <Badge label={r.status} tone={r.statusTone} />
        <Text style={textStyle("bodySmall")}>
          {paymentsCopy.receivedAt}: {r.when} · {paymentsCopy.receivedBy}: {r.who}
        </Text>
        <Text style={textStyle("bodySmall")}>
          {paymentsCopy.client}: {r.client}
        </Text>
        <Text style={textStyle("label")}>{paymentsCopy.orders}</Text>
        {r.orders.map((o) => (
          <Text key={o.id} style={textStyle("bodySmall")}>
            {o.folio} · {paymentsCopy.total} {o.total} · {paymentsCopy.applied} {o.applied} ·{" "}
            {paymentsCopy.balance} {o.balance} ({o.status})
          </Text>
        ))}
        <Text style={textStyle("label")}>{paymentsCopy.tenders}</Text>
        {r.tenders.map((t, i) => (
          <Text key={i} style={textStyle("bodySmall")}>
            {t.label}: {t.amount}
            {t.reference ? ` · ${t.reference}` : ""}
          </Text>
        ))}
        <Text style={textStyle("title")}>Total {r.amount}</Text>
        {r.change ? (
          <Text style={textStyle("bodySmall")}>
            {paymentsCopy.change} {r.change}
          </Text>
        ) : null}
        {r.notes ? <Text style={textStyle("bodySmall")}>{r.notes}</Text> : null}
        {r.reversal ? <Notice tone="danger" text={`${paymentsCopy.reversed}: ${r.reversal}`} /> : null}
        <Text style={textStyle("caption", "muted")}>{r.legend}</Text>
        <Button
          label={paymentsCopy.share}
          variant="secondary"
          onPress={() => void Share.share({ message: asText })}
        />
      </Card>
      {canReverse ? (
        <Card title={paymentsCopy.reverseTitle} subtitle={paymentsCopy.reverseHint}>
          <View style={styles.form}>
            <Field
              label={paymentsCopy.reverseReason}
              value={reason}
              onChangeText={setReason}
              maxLength={500}
            />
            <Notice tone="danger" text={error} />
            <Button
              label={paymentsCopy.reverseConfirm}
              variant="danger"
              loading={busy}
              onPress={() => void reverse()}
            />
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({ form: { gap: space.md } });
