import {
  B2B_DOCUMENT_STATUS_LABELS,
  B2B_DOCUMENT_STATUS_TONES,
  B2B_PAYMENT_METHOD_LABELS,
  canInCenter,
  documentActions,
  formatAge,
  formatDateOnly,
  formatMoney,
  formatPeriod,
  receivablesCopy,
  receivablesErrorMessage,
  receivablesExportCsv,
  type B2bBillingDocumentDetail,
  type ViewState,
} from "@meguiars/domain";
import { createReceivablesRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useCallback, useEffect, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { ReceivablesReasonAction, UpdateBatchEditor } from "@/components/ReceivablesForms";
import { Button, LinkButton } from "@/ui/controls";
import { Badge, Card, EmptyState, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

/** Documento de cobro (equivale a /finanzas/cxc/documentos/[id] en web). */
export function ReceivableDocumentScreen({
  state,
  header,
  documentId,
  onBack,
}: PrivateScreenProps & { documentId: string; onBack: (accountId?: string) => void }) {
  const { client } = useAuth();
  const [data, setData] = useState<ViewState<B2bBillingDocumentDetail>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void createReceivablesRepository(client)
      .document(documentId)
      .then((r) => {
        if (!active) return;
        setData(
          r.ok
            ? { status: "ready", data: r.data }
            : { status: "error", message: receivablesErrorMessage(r.error) },
        );
      });
    return () => {
      active = false;
    };
  }, [client, documentId, version]);

  if (data.status !== "ready") {
    return (
      <Screen title={receivablesCopy.title} header={header}>
        <LinkButton label={`← ${receivablesCopy.title}`} onPress={() => onBack()} />
        {data.status === "loading" ? <Skeleton lines={6} label="Cargando documento" /> : null}
        {data.status === "error" || data.status === "permission_denied" ? (
          <EmptyState title={data.message} />
        ) : null}
      </Screen>
    );
  }
  const d = data.data;
  const actions = documentActions(d, { billing: canInCenter(state, d.homeDetailCenterId, "b2b.billing") });
  const share = async () => {
    if (!client) return;
    setExportError(null);
    const r = await createReceivablesRepository(client).exportRows(
      [d.homeDetailCenterId],
      d.issuedOn,
      d.issuedOn,
      d.accountId,
    );
    if (!r.ok) return setExportError(receivablesErrorMessage(r.error));
    await Share.share({
      title: `${d.folio.toLowerCase()}.csv`,
      message: receivablesExportCsv(r.data.filter((x) => x.folio === d.folio)),
    });
  };
  const line = (label: string, value: string) => (
    <View style={styles.line}>
      <Text style={textStyle("bodySmall", "muted")}>{label}</Text>
      <Text style={textStyle("bodySmall")}>{value}</Text>
    </View>
  );

  return (
    <Screen
      title={`${d.folio} · ${d.accountName}`}
      description={`${receivablesCopy.period}: ${formatPeriod(d.periodFrom, d.periodTo)}`}
      header={header}
    >
      <LinkButton label={`← ${d.accountName}`} onPress={() => onBack(d.accountId)} />
      <Badge label={B2B_DOCUMENT_STATUS_LABELS[d.status]} tone={B2B_DOCUMENT_STATUS_TONES[d.status]} />
      <Card title={receivablesCopy.amount} subtitle={receivablesCopy.notCfdi}>
        {line(receivablesCopy.issuedOn, formatDateOnly(d.issuedOn))}
        {line(
          receivablesCopy.dueOn,
          `${formatDateOnly(d.dueOn)}${d.daysOverdue > 0 ? ` · ${formatAge(d.daysOverdue)} vencido` : ""}`,
        )}
        {line(
          receivablesCopy.externalRef,
          d.externalRef
            ? `${d.externalRef}${d.externalInvoicedOn ? ` · ${formatDateOnly(d.externalInvoicedOn)}` : ""}`
            : "—",
        )}
        {line(receivablesCopy.age, formatAge(d.ageDays))}
        {line(receivablesCopy.orders, formatMoney(d.ordersAmount))}
        {line(receivablesCopy.fee, formatMoney(d.feeAmount))}
        {line(receivablesCopy.amount, formatMoney(d.amount))}
        {line(receivablesCopy.paid, formatMoney(d.paid))}
        {line(receivablesCopy.balance, formatMoney(d.balance))}
        {d.dueOnReason ? line(receivablesCopy.dueOnReason, d.dueOnReason) : null}
        {d.notes ? line(receivablesCopy.notes, d.notes) : null}
        {d.voidReason ? line(receivablesCopy.voidReason, d.voidReason) : null}
        <Text style={textStyle("caption", "muted")}>{receivablesCopy.pnlNote}</Text>
        <Notice tone="danger" text={exportError} />
        <Button label={receivablesCopy.share} variant="secondary" onPress={() => void share()} />
      </Card>

      <Card title={receivablesCopy.fiscal}>
        {line(receivablesCopy.legalName, d.legalName ?? "—")}
        {line(receivablesCopy.rfc, d.rfc ?? "—")}
        {line(receivablesCopy.taxRegime, d.taxRegime ?? "—")}
        {line(receivablesCopy.fiscalZip, d.fiscalZip ?? "—")}
        {line(receivablesCopy.billingEmail, d.billingEmail ?? "—")}
      </Card>

      <Card title={receivablesCopy.orders}>
        <List
          caption={receivablesCopy.orders}
          rows={d.orders}
          rowKey={(o) => o.id}
          emptyMessage="Sin OS: documento de cuota."
          columns={[
            { key: "folio", header: receivablesCopy.folio, value: (o) => o.folio },
            {
              key: "delivered",
              header: "Entrega",
              value: (o) => `${formatDateOnly(o.deliveredOn)} · ${o.centerName}`,
            },
            { key: "vehicle", header: "Vehículo", value: (o) => o.vehicleLabel },
            { key: "po", header: "Orden de compra", value: (o) => o.purchaseOrder ?? "—" },
            { key: "total", header: "Total", value: (o) => formatMoney(o.total) },
          ]}
        />
      </Card>

      <Card title={receivablesCopy.payments}>
        {d.payments.length === 0 ? (
          <Text style={textStyle("bodySmall", "muted")}>{receivablesCopy.paymentsEmpty}</Text>
        ) : null}
        {d.payments.map((p, i) => (
          <Text key={`${p.paymentId}-${i}`} style={textStyle("bodySmall", p.voided ? "muted" : "foreground")}>
            {formatDateOnly(p.paidOn)} · {B2B_PAYMENT_METHOD_LABELS[p.method]}
            {p.reference ? ` · ${p.reference}` : ""} · {formatMoney(p.amount)}
            {p.voided ? ` (${receivablesCopy.voidedTag})` : ""}
          </Text>
        ))}
        {actions.pay ? (
          <LinkButton label={`${receivablesCopy.newPayment} →`} onPress={() => onBack(d.accountId)} />
        ) : null}
      </Card>

      {actions.edit ? (
        <Card title={receivablesCopy.edit}>
          <UpdateBatchEditor key={`edit-${version}`} document={d} onDone={reload} />
        </Card>
      ) : null}
      {actions.void ? (
        <Card title={receivablesCopy.void} subtitle={receivablesCopy.voidHint}>
          <ReceivablesReasonAction
            label={receivablesCopy.void}
            reasonLabel={receivablesCopy.voidReason}
            message={receivablesCopy.voided}
            run={(repo, reason) => repo.voidBatch(d.id, reason)}
            onDone={reload}
          />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", justifyContent: "space-between", gap: space.sm, paddingVertical: space.xxs },
});
