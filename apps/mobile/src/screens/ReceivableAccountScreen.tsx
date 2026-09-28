import {
  addDays,
  can,
  canInCenter,
  formatMoney,
  presentAccountPayment,
  presentDocumentRow,
  presentReceivableAccount,
  presentUnbilledOrder,
  receivablesCopy,
  receivablesErrorMessage,
  receivablesExportCsv,
  todayIn,
  usableCenters,
  type B2bAccountPayment,
  type B2bBillingDocument,
  type B2bReceivableAccount,
  type B2bUnbilledOrder,
  type ViewState,
} from "@meguiars/domain";
import { createReceivablesRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useCallback, useEffect, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import {
  AllocateAction,
  BatchEditor,
  PaymentEditor,
  ReceivablesReasonAction,
} from "@/components/ReceivablesForms";
import { Button, LinkButton } from "@/ui/controls";
import { Card, EmptyState, KpiCard, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

interface Loaded {
  account: B2bReceivableAccount;
  timezone: string;
  documents: B2bBillingDocument[];
  unbilled: B2bUnbilledOrder[];
  payments: B2bAccountPayment[];
  errors: string[];
}

/** Cuenta por cobrar B2B (equivale a /finanzas/cxc/cuentas/[id] en web). */
export function ReceivableAccountScreen({
  state,
  header,
  accountId,
  onBack,
  onOpenDocument,
  onOpenB2bAccount,
}: PrivateScreenProps & {
  accountId: string;
  onBack: () => void;
  onOpenDocument: (id: string) => void;
  onOpenB2bAccount?: (id: string) => void;
}) {
  const { client } = useAuth();
  const [data, setData] = useState<ViewState<Loaded>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const readable = usableCenters(state.access).filter((a) =>
      can([...a.roles, ...a.corporateRoles], "b2b.read"),
    );
    const repo = createReceivablesRepository(client);
    void (async () => {
      const accounts = await repo.accounts(readable.map((a) => a.center.id));
      if (!active) return;
      const account = accounts.ok ? accounts.data.find((a) => a.accountId === accountId) : undefined;
      if (!account) {
        return setData({
          status: "permission_denied",
          message: accounts.ok
            ? "La cuenta no existe o no tienes acceso a su centro gestor."
            : receivablesErrorMessage(accounts.error),
        });
      }
      const home = readable.find((a) => a.center.id === account.homeDetailCenterId)!.center;
      const today = todayIn(home.timezone);
      const scope = [account.homeDetailCenterId];
      const [d, u, p] = await Promise.all([
        repo.documents(scope, { accountId, includeClosed: true, from: addDays(today, -365), to: today }),
        repo.unbilledOrders(scope, accountId),
        repo.payments(accountId),
      ]);
      if (!active) return;
      setData({
        status: "ready",
        data: {
          account,
          timezone: home.timezone,
          documents: d.ok ? d.data : [],
          unbilled: u.ok ? u.data : [],
          payments: p.ok ? p.data : [],
          errors: [d, u, p].flatMap((r) => (r.ok ? [] : [receivablesErrorMessage(r.error)])),
        },
      });
    })();
    return () => {
      active = false;
    };
  }, [client, accountId, state.access, version]);

  if (data.status !== "ready") {
    return (
      <Screen title={receivablesCopy.title} header={header}>
        <LinkButton label={`← ${receivablesCopy.title}`} onPress={onBack} />
        {data.status === "loading" ? <Skeleton lines={6} label="Cargando cuenta" /> : null}
        {data.status === "error" || data.status === "permission_denied" ? (
          <EmptyState title={data.message} />
        ) : null}
      </Screen>
    );
  }
  const { account, documents, unbilled, payments, errors, timezone } = data.data;
  const today = todayIn(timezone);
  const canBill = canInCenter(state, account.homeDetailCenterId, "b2b.billing");
  const p = presentReceivableAccount(account);
  const openDocs = documents
    .filter((d) => d.status !== "anulado" && d.balance > 0)
    .map((d) => ({ id: d.id, folio: d.folio, issuedOn: d.issuedOn, dueOn: d.dueOn, balance: d.balance }));
  const receivable = Math.max(0, account.documentsBalance - account.unapplied);

  const share = async () => {
    if (!client) return;
    setExportError(null);
    const r = await createReceivablesRepository(client).exportRows(
      [account.homeDetailCenterId],
      addDays(today, -365),
      today,
      account.accountId,
    );
    if (!r.ok) return setExportError(receivablesErrorMessage(r.error));
    await Share.share({ title: `cxc-${today}.csv`, message: receivablesExportCsv(r.data) });
  };

  return (
    <Screen title={account.accountName} description={receivablesCopy.title} header={header}>
      <LinkButton label={`← ${receivablesCopy.title}`} onPress={onBack} />
      {onOpenB2bAccount ? (
        <LinkButton label={receivablesCopy.openAccount} onPress={() => onOpenB2bAccount(account.accountId)} />
      ) : null}
      {errors.map((e) => (
        <Notice key={e} tone="danger" text={e} />
      ))}
      <KpiCard label={receivablesCopy.balance} value={p.balance} caption={p.formula} />
      <KpiCard label={receivablesCopy.unbilled} value={p.unbilledValue} caption={p.unbilledCaption} />
      <KpiCard label={receivablesCopy.documentsBalance} value={p.documents} />
      <KpiCard label={receivablesCopy.overdue} value={p.overdue} />
      <KpiCard label={receivablesCopy.unapplied} value={p.unapplied} />
      <Notice tone={p.traceOk ? "success" : "danger"} text={p.trace} />

      <Card title={receivablesCopy.unbilledOrders}>
        <List
          caption={receivablesCopy.unbilledOrders}
          rows={unbilled.map(presentUnbilledOrder)}
          rowKey={(r) => r.id}
          emptyMessage={receivablesCopy.unbilledEmpty}
          columns={[
            { key: "folio", header: receivablesCopy.folio, value: (r) => r.folio },
            { key: "delivered", header: "Entrega", value: (r) => `${r.deliveredOn} · ${r.center}` },
            { key: "vehicle", header: "Vehículo", value: (r) => r.vehicle },
            { key: "age", header: receivablesCopy.age, value: (r) => r.age },
            { key: "total", header: "Total", value: (r) => r.total },
          ]}
        />
      </Card>
      {canBill && (unbilled.length > 0 || account.unbilledFees > 0) ? (
        <Card title={receivablesCopy.newBatch}>
          <BatchEditor
            key={`batch-${version}`}
            accountId={account.accountId}
            today={today}
            unbilled={unbilled.map((o) => ({
              id: o.id,
              folio: o.folio,
              total: o.total,
              deliveredOn: o.deliveredOn,
            }))}
            feePending={account.unbilledFees}
            onCreated={onOpenDocument}
          />
        </Card>
      ) : null}

      <Card title={receivablesCopy.documents} subtitle="Último año, incluidos cobrados y anulados">
        <List
          caption={receivablesCopy.documents}
          rows={documents.map(presentDocumentRow)}
          rowKey={(r) => r.id}
          onRowPress={(r) => onOpenDocument(r.id)}
          emptyMessage={receivablesCopy.documentsEmpty}
          columns={[
            { key: "folio", header: receivablesCopy.folio, value: (r) => r.folio },
            { key: "period", header: receivablesCopy.period, value: (r) => r.period },
            { key: "status", header: receivablesCopy.status, value: (r) => r.status },
            { key: "due", header: receivablesCopy.dueOn, value: (r) => r.dueOn },
            { key: "balance", header: receivablesCopy.balance, value: (r) => r.balance },
          ]}
        />
        <Notice tone="danger" text={exportError} />
        <Button label={receivablesCopy.share} variant="secondary" onPress={() => void share()} />
      </Card>

      <Card title={receivablesCopy.payments}>
        {payments.length === 0 ? (
          <Text style={textStyle("bodySmall", "muted")}>{receivablesCopy.paymentsEmpty}</Text>
        ) : null}
        {payments.map((raw) => {
          const pay = presentAccountPayment(raw);
          return (
            <View key={pay.id} style={styles.row}>
              <Text style={textStyle("label")}>
                {pay.title} · {pay.amount}
              </Text>
              <Text style={textStyle("caption", "muted")}>
                {receivablesCopy.applied}: {pay.allocations}
                {pay.unapplied ? ` · ${receivablesCopy.unapplied.toLowerCase()} ${pay.unapplied}` : ""}
                {pay.voided ? ` · ${receivablesCopy.voidedTag} (${pay.voidReason})` : ""}
              </Text>
              {canBill && !pay.voided ? (
                <>
                  {pay.unapplied && openDocs.length > 0 ? (
                    <AllocateAction paymentId={pay.id} onDone={reload} />
                  ) : null}
                  <ReceivablesReasonAction
                    label={receivablesCopy.voidPayment}
                    reasonLabel={receivablesCopy.voidPaymentReason}
                    message={receivablesCopy.paymentVoided}
                    run={(repo, reason) => repo.voidPayment(pay.id, reason)}
                    onDone={reload}
                  />
                </>
              ) : null}
            </View>
          );
        })}
      </Card>
      {canBill && receivable > 0 ? (
        <Card title={`${receivablesCopy.newPayment} · por cobrar ${formatMoney(receivable)}`}>
          <PaymentEditor
            key={`pay-${version}`}
            accountId={account.accountId}
            today={today}
            documents={openDocs}
            receivable={receivable}
            onDone={reload}
          />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.xs, paddingVertical: space.xs },
});
