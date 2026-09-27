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
  type PaymentFact,
  type PaymentListItem,
  type PaymentRangeKey,
  type ReceivableOrder,
  type SalesReconciliation,
  type ViewState,
} from "@meguiars/domain";
import { createPaymentRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { LinkButton } from "@/ui/controls";
import { Card, EmptyState, KpiCard, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

interface Loaded {
  facts: PaymentFact[];
  receipts: PaymentListItem[];
  receivables: ReceivableOrder[] | null;
  reconciliation: SalesReconciliation[] | null;
  warning: string | null;
}

/** Corte de caja, recibos, por cobrar y conciliación (equivale a /finanzas/cobranza en web). */
export function CashScreen({
  state,
  header,
  subnav,
  onOpenReceipt,
}: PrivateScreenProps & { onOpenReceipt: (id: string) => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [all, setAll] = useState(false);
  const [key, setKey] = useState<PaymentRangeKey>("hoy");
  const [loaded, setLoaded] = useState<{ key: string; view: ViewState<Loaded> } | null>(null);
  const { from, to } = paymentRange(key, todayIn(center.timezone));
  // Al cambiar periodo o alcance, lo de la consulta anterior no se muestra: se ve la carga.
  const queryKey = `${all}-${from}-${to}-${center.id}`;
  const data: ViewState<Loaded> = loaded?.key === queryKey ? loaded.view : { status: "loading" };
  const names = new Map(usableCenters(state.access).map((a) => [a.center.id, a.center]));

  useEffect(() => {
    if (!client) return;
    let active = true;
    const centers = all
      ? usableCenters(state.access)
          .filter((a) => can([...a.roles, ...a.corporateRoles], "payments.read"))
          .map((a) => a.center.id)
      : [center.id];
    const range = { detailCenterIds: centers, from, to };
    const repo = createPaymentRepository(client);
    void Promise.all([
      repo.facts(range),
      repo.list(range),
      repo.receivables(centers),
      repo.reconciliation(range),
    ]).then(([f, l, r, c]) => {
      if (!active) return;
      if (!f.ok)
        return setLoaded({ key: queryKey, view: { status: "error", message: paymentErrorMessage(f.error) } });
      const failed = [l, r, c].find((x) => !x.ok);
      setLoaded({
        key: queryKey,
        view: {
          status: "ready",
          data: {
            facts: f.data,
            receipts: l.ok ? l.data : [],
            receivables: r.ok ? r.data : null,
            reconciliation: c.ok ? c.data : null,
            warning: failed && !failed.ok ? paymentErrorMessage(failed.error) : null,
          },
        },
      });
    });
    return () => {
      active = false;
    };
  }, [client, all, from, to, center.id, state.access, queryKey]);

  const input = data.status === "ready" ? { facts: data.data.facts } : null;
  const rows = data.status === "ready" ? (data.data.reconciliation ?? []) : [];
  const rec = consolidateReconciliation(rows);

  return (
    <Screen title={paymentsCopy.title} description={paymentsCopy.description} header={header}>
      {subnav}
      <Card subtitle={`${PAYMENT_RANGE_LABELS[key]} · ${all ? paymentsCopy.scopeAll : center.name}`}>
        <View style={styles.row}>
          {PAYMENT_RANGES.filter((r) => r !== key).map((r) => (
            <LinkButton key={r} label={PAYMENT_RANGE_LABELS[r]} onPress={() => setKey(r)} />
          ))}
          <LinkButton
            label={all ? paymentsCopy.scopeCenter : paymentsCopy.scopeAll}
            onPress={() => setAll((v) => !v)}
          />
        </View>
      </Card>
      {data.status === "loading" ? <Skeleton lines={6} label="Cargando cobranza" /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" ? <Notice tone="warning" text={data.data.warning} /> : null}
      {input && input.facts.length === 0 ? <EmptyState title={paymentsCopy.empty} /> : null}
      {input && input.facts.length > 0 ? (
        <>
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
          <Card title={paymentsCopy.byMethod}>
            <List
              caption={paymentsCopy.byMethod}
              rows={paymentsByMethod(input)}
              rowKey={(r) => r.method}
              emptyMessage={paymentsCopy.empty}
              columns={[
                { key: "method", header: paymentsCopy.method, value: (r) => r.name },
                {
                  key: "amount",
                  header: "Cobrado",
                  value: (r) => `${formatMoney(r.amount)} · ${r.count} · ${r.share} %`,
                },
                { key: "reversed", header: "Revertido", value: (r) => formatMoney(r.reversed) },
              ]}
            />
          </Card>
        </>
      ) : null}
      {data.status === "ready" && data.data.reconciliation ? (
        <Card title={paymentsCopy.reconciliation} subtitle={paymentsCopy.reconciliationHint}>
          <Text style={textStyle("bodySmall")}>
            OS entregadas (ventas): {rec.deliveredOrders} · {formatMoney(rec.salesTotal)}
          </Text>
          <Text style={textStyle("bodySmall")}>
            Cobrado de esas ventas: {formatMoney(rec.collectedForSales)} ·{" "}
            {paymentsCollectionRate.compute({ rows })} %
          </Text>
          <Text style={textStyle("bodySmall")}>
            Pendiente de esas ventas: {formatMoney(rec.pendingForSales)}
          </Text>
          <Text style={textStyle("bodySmall")}>
            Cobranza del periodo: {formatMoney(rec.collectedInRange)} · En caja y banco:{" "}
            {formatMoney(rec.cashInRange)} · Revertido: {formatMoney(rec.reversedInRange)}
          </Text>
        </Card>
      ) : null}
      {data.status === "ready" ? (
        <Card title={paymentsCopy.receipts}>
          {data.data.receipts.length === 0 ? (
            <Text style={textStyle("bodySmall", "muted")}>{paymentsCopy.empty}</Text>
          ) : (
            data.data.receipts.map((p) => {
              const r = presentPaymentListItem(p, names.get(p.detailCenterId)?.timezone ?? center.timezone);
              return (
                <View key={p.id} style={styles.item}>
                  <LinkButton
                    label={`${r.folio} · ${r.amount} · ${r.status}`}
                    onPress={() => onOpenReceipt(p.id)}
                  />
                  <Text style={textStyle("caption", "muted")}>
                    {r.when} · {r.client} · {r.orders} · {r.methods}
                  </Text>
                </View>
              );
            })
          )}
        </Card>
      ) : null}
      {data.status === "ready" && data.data.receivables ? (
        <Card title={paymentsCopy.receivables}>
          <List
            caption={paymentsCopy.receivables}
            rows={data.data.receivables.map(presentReceivable)}
            rowKey={(r) => r.id}
            emptyMessage={paymentsCopy.receivablesEmpty}
            columns={[
              { key: "folio", header: "OS", value: (r) => (r.b2b ? `${r.folio} · B2B` : r.folio) },
              { key: "client", header: paymentsCopy.client, value: (r) => r.client },
              { key: "balance", header: paymentsCopy.balance, value: (r) => `${r.balance} de ${r.total}` },
              { key: "status", header: paymentsCopy.status, value: (r) => r.status },
            ]}
          />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  item: { gap: space.xxs },
});
