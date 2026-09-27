import { pnlGrossMargin, pnlStatement } from "@meguiars/analytics";
import {
  activeCenterAccess,
  can,
  expenseErrorMessage,
  expensesCopy,
  formatMoney,
  PNL_RANGE_LABELS,
  PNL_RANGES,
  pnlRange,
  todayIn,
  usableCenters,
  type PnlFact,
  type PnlRangeKey,
  type ViewState,
} from "@meguiars/domain";
import { createExpenseRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { LinkButton } from "@/ui/controls";
import { Card, EmptyState, KpiCard, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

/** Estado de resultados (equivale a /finanzas/resultados en web). */
export function PnlScreen({ state, header, subnav }: PrivateScreenProps) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [all, setAll] = useState(false);
  const [key, setKey] = useState<PnlRangeKey>("mes");
  const { from, to } = pnlRange(key, todayIn(center.timezone));
  const queryKey = `${all}-${from}-${to}-${center.id}`;
  const [loaded, setLoaded] = useState<{ key: string; view: ViewState<PnlFact[]> } | null>(null);
  const data: ViewState<PnlFact[]> = loaded?.key === queryKey ? loaded.view : { status: "loading" };

  useEffect(() => {
    if (!client) return;
    let active = true;
    const centers = all
      ? usableCenters(state.access)
          .filter((a) => can([...a.roles, ...a.corporateRoles], "expenses.read"))
          .map((a) => a.center.id)
      : [center.id];
    void createExpenseRepository(client)
      .pnlFacts(centers, from, to)
      .then((r) => {
        if (active)
          setLoaded({
            key: queryKey,
            view: r.ok
              ? { status: "ready", data: r.data }
              : { status: "error", message: expenseErrorMessage(r.error) },
          });
      });
    return () => {
      active = false;
    };
  }, [client, all, from, to, center.id, state.access, queryKey]);

  const input = data.status === "ready" ? { facts: data.data } : null;
  const s = input ? pnlStatement(input) : null;

  return (
    <Screen title={expensesCopy.pnlTitle} description={expensesCopy.pnlDescription} header={header}>
      {subnav}
      <Card
        subtitle={`${PNL_RANGE_LABELS[key]} (${from} a ${to}) · ${all ? expensesCopy.scopeAll : center.name}`}
      >
        <View style={styles.row}>
          {PNL_RANGES.filter((r) => r !== key).map((r) => (
            <LinkButton key={r} label={PNL_RANGE_LABELS[r]} onPress={() => setKey(r)} />
          ))}
          <LinkButton
            label={all ? expensesCopy.scopeCenter : expensesCopy.scopeAll}
            onPress={() => setAll((v) => !v)}
          />
        </View>
      </Card>
      {data.status === "loading" ? <Skeleton lines={6} label="Cargando estado de resultados" /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {input && input.facts.length === 0 ? <EmptyState title={expensesCopy.pnlEmpty} /> : null}
      {input && s && input.facts.length > 0 ? (
        <>
          <KpiCard label="Ventas" value={formatMoney(s.revenue)} />
          <KpiCard
            label="Utilidad bruta"
            value={formatMoney(s.grossProfit)}
            caption={`Margen ${pnlGrossMargin.compute(input)} %`}
          />
          <KpiCard label="Utilidad de operación" value={formatMoney(s.operatingProfit)} />
          <KpiCard label="Utilidad antes de impuestos" value={formatMoney(s.netBeforeTax)} />
          <Card title={expensesCopy.pnlTitle} subtitle={expensesCopy.modelNote}>
            {s.lines.map((l) => (
              <View key={l.key} style={[styles.line, l.level === 1 ? styles.detail : null]}>
                <Text style={textStyle(l.level === 0 ? "label" : "bodySmall")}>{l.label}</Text>
                <Text style={textStyle(l.level === 0 ? "label" : "bodySmall")}>
                  {formatMoney(l.amount)}
                  {l.percent === null ? "" : ` · ${l.percent} %`}
                </Text>
              </View>
            ))}
          </Card>
          <Card title={expensesCopy.cashOut}>
            <Text style={textStyle("bodySmall")}>
              {expensesCopy.cashOut}: {formatMoney(s.cashOut)}
            </Text>
            <Text style={textStyle("bodySmall")}>
              {expensesCopy.pending}: {formatMoney(s.pending)}
            </Text>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  line: { flexDirection: "row", justifyContent: "space-between", gap: space.sm, paddingVertical: space.xxs },
  detail: { paddingLeft: space.lg },
});
