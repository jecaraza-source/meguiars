import {
  activeCenterAccess,
  addDays,
  agingInputs,
  can,
  formatMoney,
  presentAging,
  presentDocumentRow,
  presentReceivableAccount,
  receivablesAging,
  receivablesCopy,
  receivablesErrorMessage,
  receivablesExportCsv,
  receivablesTotals,
  todayIn,
  usableCenters,
  type B2bBillingDocument,
  type B2bReceivableAccount,
  type B2bUnbilledOrder,
  type ViewState,
} from "@meguiars/domain";
import { createReceivablesRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useEffect, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, LinkButton } from "@/ui/controls";
import { Card, EmptyState, KpiCard, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

interface Loaded {
  accounts: B2bReceivableAccount[];
  documents: B2bBillingDocument[];
  unbilled: B2bUnbilledOrder[];
}

/** Cuentas por cobrar B2B (equivale a /finanzas/cxc en web). */
export function ReceivablesScreen({
  state,
  header,
  subnav,
  onOpenAccount,
  onOpenDocument,
}: PrivateScreenProps & { onOpenAccount: (id: string) => void; onOpenDocument: (id: string) => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const today = todayIn(center.timezone);
  const [all, setAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ key: string; view: ViewState<Loaded> } | null>(null);
  const centers = all
    ? usableCenters(state.access)
        .filter((a) => can([...a.roles, ...a.corporateRoles], "b2b.read"))
        .map((a) => a.center.id)
    : [center.id];
  const queryKey = `${all}-${center.id}`;
  const data: ViewState<Loaded> = loaded?.key === queryKey ? loaded.view : { status: "loading" };

  useEffect(() => {
    if (!client) return;
    let active = true;
    const ids = all
      ? usableCenters(state.access)
          .filter((a) => can([...a.roles, ...a.corporateRoles], "b2b.read"))
          .map((a) => a.center.id)
      : [center.id];
    const repo = createReceivablesRepository(client);
    void Promise.all([repo.accounts(ids), repo.documents(ids), repo.unbilledOrders(ids)]).then(
      ([a, d, u]) => {
        if (!active) return;
        const failed = [a, d, u].find((r) => !r.ok);
        setLoaded({
          key: queryKey,
          view:
            failed && !failed.ok
              ? { status: "error", message: receivablesErrorMessage(failed.error) }
              : {
                  status: "ready",
                  data: {
                    accounts: a.ok ? a.data : [],
                    documents: d.ok ? d.data : [],
                    unbilled: u.ok ? u.data : [],
                  },
                },
        });
      },
    );
    return () => {
      active = false;
    };
  }, [client, all, center.id, state.access, queryKey]);

  const share = async () => {
    if (!client) return;
    setExporting(true);
    setExportError(null);
    const from = addDays(today, -89);
    const r = await createReceivablesRepository(client).exportRows(centers, from, today);
    setExporting(false);
    if (!r.ok) return setExportError(receivablesErrorMessage(r.error));
    await Share.share({ title: `cxc-b2b-${from}-${today}.csv`, message: receivablesExportCsv(r.data) });
  };

  const rows =
    data.status === "ready" ? data.data.accounts.filter((a) => a.consumption > 0 || a.balance !== 0) : [];
  const totals = receivablesTotals(rows);
  const aging =
    data.status === "ready"
      ? presentAging(receivablesAging(agingInputs(data.data.documents, data.data.unbilled)))
      : null;

  return (
    <Screen title={receivablesCopy.title} description={receivablesCopy.description} header={header}>
      {subnav}
      <Card subtitle={`${all ? receivablesCopy.scopeAll : center.name} · ${receivablesCopy.notCfdi}`}>
        <LinkButton
          label={all ? receivablesCopy.scopeCenter : receivablesCopy.scopeAll}
          onPress={() => setAll((v) => !v)}
        />
      </Card>
      {data.status === "loading" ? <Skeleton lines={6} label="Cargando cuentas por cobrar" /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <Notice tone="danger" text={data.message} />
      ) : null}
      {data.status === "ready" ? (
        <>
          <KpiCard label={receivablesCopy.balance} value={formatMoney(totals.balance)} />
          <KpiCard label={receivablesCopy.unbilled} value={formatMoney(totals.unbilled)} />
          <KpiCard label={receivablesCopy.documentsBalance} value={formatMoney(totals.documents)} />
          <KpiCard label={receivablesCopy.overdue} value={formatMoney(totals.overdue)} />
          <KpiCard label={receivablesCopy.unapplied} value={formatMoney(totals.unapplied)} />
          <Text style={textStyle("caption", "muted")}>{receivablesCopy.pnlNote}</Text>

          <Card title={receivablesCopy.accounts} subtitle={receivablesCopy.traceOk}>
            <List
              caption={receivablesCopy.accounts}
              rows={rows.map(presentReceivableAccount)}
              rowKey={(r) => r.id}
              onRowPress={(r) => onOpenAccount(r.id)}
              emptyMessage={receivablesCopy.empty}
              columns={[
                { key: "name", header: receivablesCopy.account, value: (r) => r.name },
                { key: "balance", header: receivablesCopy.balance, value: (r) => r.balance },
                { key: "unbilled", header: receivablesCopy.unbilled, value: (r) => r.unbilled },
                { key: "documents", header: receivablesCopy.documentsBalance, value: (r) => r.documents },
                { key: "overdue", header: receivablesCopy.overdue, value: (r) => r.overdue },
              ]}
            />
          </Card>

          <Card title={receivablesCopy.aging} subtitle={receivablesCopy.agingHint}>
            {!aging || aging.accounts.length === 0 ? (
              <EmptyState title={receivablesCopy.empty} />
            ) : (
              <View style={styles.stack}>
                {aging.headers.map((h, i) => (
                  <View key={h} style={styles.row}>
                    <Text style={textStyle("label")}>{h}</Text>
                    <Text style={textStyle("label")}>{aging.totals[i]}</Text>
                  </View>
                ))}
                <View style={styles.row}>
                  <Text style={textStyle("label")}>{receivablesCopy.total}</Text>
                  <Text style={textStyle("label")}>{aging.total}</Text>
                </View>
                {aging.accounts.map((a) => (
                  <View key={a.id} style={styles.account}>
                    <LinkButton label={`${a.name} · ${a.total}`} onPress={() => onOpenAccount(a.id)} />
                    <Text style={textStyle("caption", "muted")}>
                      {aging.headers.map((h, i) => `${h}: ${a.amounts[i]}`).join(" · ")}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Card>

          <Card title={`${receivablesCopy.documents} · ${receivablesCopy.documentsOpen}`}>
            <List
              caption={receivablesCopy.documents}
              rows={data.data.documents.map(presentDocumentRow)}
              rowKey={(r) => r.id}
              onRowPress={(r) => onOpenDocument(r.id)}
              emptyMessage={receivablesCopy.documentsEmpty}
              columns={[
                { key: "folio", header: receivablesCopy.folio, value: (r) => r.folio },
                { key: "account", header: receivablesCopy.account, value: (r) => r.account },
                { key: "status", header: receivablesCopy.status, value: (r) => r.status },
                { key: "due", header: receivablesCopy.dueOn, value: (r) => r.dueOn },
                { key: "balance", header: receivablesCopy.balance, value: (r) => r.balance },
              ]}
            />
          </Card>

          <Card title={receivablesCopy.export} subtitle={`${receivablesCopy.exportHint} Últimos 90 días.`}>
            <Notice tone="danger" text={exportError} />
            <Button
              label={receivablesCopy.share}
              variant="secondary"
              loading={exporting}
              onPress={() => void share()}
            />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.xs },
  row: { flexDirection: "row", justifyContent: "space-between", gap: space.sm },
  account: { gap: space.xxs, paddingTop: space.sm },
});
