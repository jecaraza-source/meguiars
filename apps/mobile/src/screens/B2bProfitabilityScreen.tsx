import { b2bProfitability, type B2bProfitabilityRow } from "@meguiars/analytics";
import {
  activeCenterAccess,
  addDays,
  b2bCopy,
  formatMoney,
  todayIn,
  usableCenters,
  type ViewState,
} from "@meguiars/domain";
import { createB2bRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { LinkButton } from "@/ui/controls";
import { Card, EmptyState, KpiCard, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import type { PrivateScreenProps } from "./types";

/** Rentabilidad B2B (equivale a /comercial/b2b/rentabilidad en web). */
export function B2bProfitabilityScreen({
  state,
  header,
  subnav,
  onOpen,
}: PrivateScreenProps & { onOpen: (accountId: string) => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [all, setAll] = useState(false);
  const [data, setData] = useState<ViewState<ReturnType<typeof b2bProfitability>>>({ status: "loading" });
  const names = new Map(state.access.map((a) => [a.center.id, a.center.name]));

  useEffect(() => {
    if (!client) return;
    let active = true;
    const centers = all ? usableCenters(state.access).map((a) => a.center.id) : [center.id];
    const to = todayIn(center.timezone);
    void createB2bRepository(client)
      .profitabilityFacts(centers, addDays(to, -29), to)
      .then((r) => {
        if (!active) return;
        if (!r.ok) return setData({ status: "error", message: r.error.message });
        const report = b2bProfitability(r.data);
        setData(report.rows.length === 0 ? { status: "empty" } : { status: "ready", data: report });
      });
    return () => {
      active = false;
    };
  }, [client, all, center.id, center.timezone, state.access]);

  return (
    <Screen title={b2bCopy.profitabilityTitle} description={b2bCopy.profitabilityDescription} header={header}>
      {subnav}
      <Card subtitle={`${b2bCopy.range} · ${all ? b2bCopy.scopeAll : center.name}`}>
        <LinkButton
          label={all ? b2bCopy.scopeCenter : b2bCopy.scopeAll}
          onPress={() => {
            setData({ status: "loading" });
            setAll((v) => !v);
          }}
        />
      </Card>
      {data.status === "loading" ? <Skeleton lines={4} label="Cargando rentabilidad" /> : null}
      {data.status === "empty" ? <EmptyState title={b2bCopy.profitabilityEmpty} /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" ? (
        <>
          <View style={styles.kpis}>
            <KpiCard
              label="Ingreso B2B"
              value={formatMoney(data.data.total.income)}
              caption="OS terminadas + cuotas"
            />
            <KpiCard
              label="Costo directo"
              value={formatMoney(data.data.total.cost)}
              caption="Costo congelado de las OS"
            />
            <KpiCard
              label="Margen"
              value={formatMoney(data.data.total.margin)}
              caption={`${data.data.total.marginPercent} %`}
            />
          </View>
          <List
            caption={b2bCopy.profitabilityTitle}
            rows={data.data.rows}
            rowKey={(r: B2bProfitabilityRow) => r.key}
            onRowPress={(r) => onOpen(r.accountId)}
            emptyMessage={b2bCopy.profitabilityEmpty}
            columns={[
              { key: "account", header: "Cuenta", value: (r) => r.accountName },
              {
                key: "center",
                header: "Centro",
                value: (r) =>
                  r.detailCenterId ? (names.get(r.detailCenterId) ?? "Otro centro") : "Consolidado",
              },
              { key: "orders", header: "OS", value: (r) => String(r.orders) },
              { key: "income", header: "Ingreso", value: (r) => formatMoney(r.income) },
              { key: "cost", header: "Costo", value: (r) => formatMoney(r.cost) },
              {
                key: "margin",
                header: "Margen",
                value: (r) => `${formatMoney(r.margin)} · ${r.marginPercent} %`,
              },
            ]}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({ kpis: { gap: space.md } });
