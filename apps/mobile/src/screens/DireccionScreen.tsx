import { pnlByCenter } from "@meguiars/analytics";
import {
  activeCenterAccess,
  can,
  executiveKpis,
  formatMoney,
  formatPercent,
  pnlCopy,
  pnlPeriod,
  pnlSummaryKpis,
  sectionCopy,
  todayIn,
  usableCenters,
  type PnlLineRow,
} from "@meguiars/domain";
import { createPnlRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { CentersList } from "@/components/CentersView";
import { Card, KpiCard } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

export function DireccionScreen({ state, header, subnav }: PrivateScreenProps) {
  const copy = sectionCopy.direccion;
  const { client } = useAuth();
  // Resultados del mes con las mismas fórmulas que el estado de resultados (AF4).
  const center = activeCenterAccess(state)?.center;
  const allowed = usableCenters(state.access).filter((a) =>
    can([...a.roles, ...a.corporateRoles], "pnl.read"),
  );
  const ids = allowed.map((a) => a.center.id);
  const period = center ? pnlPeriod("mes", todayIn(center.timezone)) : null;
  const [facts, setFacts] = useState<PnlLineRow[] | null>(null);
  const idsKey = ids.join(",");
  const from = period?.from;
  const to = period?.to;

  useEffect(() => {
    if (!client || !from || !to || !idsKey) return;
    let active = true;
    void createPnlRepository(client)
      .lines(idsKey.split(","), from, to)
      .then((r) => {
        if (active) setFacts(r.ok ? r.data : null);
      });
    return () => {
      active = false;
    };
  }, [client, idsKey, from, to]);

  const pnl = facts ? pnlByCenter(facts, ids) : null;
  return (
    <Screen title={copy.title} description={copy.description} header={header}>
      {subnav}
      <View style={styles.kpis}>
        {executiveKpis(state.access).map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </View>
      {pnl && period ? (
        <Card
          title={`Resultados del mes · ${pnlCopy.consolidated}`}
          subtitle={`${period.from} a ${period.to} · ${pnlCopy.formulasNote}`}
        >
          <View style={styles.kpis}>
            {pnlSummaryKpis(pnl.consolidated).map((kpi) => (
              <KpiCard key={kpi.label} {...kpi} />
            ))}
          </View>
          {pnl.centers.map((c) => (
            <Text key={c.detailCenterId} style={textStyle("bodySmall")}>
              {allowed.find((a) => a.center.id === c.detailCenterId)?.center.name}: Ventas{" "}
              {formatMoney(c.statement.revenue)} · EBITDA {formatMoney(c.statement.ebitda)} (
              {formatPercent(c.statement.ebitdaMargin)})
            </Text>
          ))}
        </Card>
      ) : null}
      <Card title="Centros">
        <CentersList access={state.access} now={new Date()} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
});
