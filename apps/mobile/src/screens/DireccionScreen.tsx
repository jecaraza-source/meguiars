import { executiveKpis, sectionCopy } from "@meguiars/domain";
import { space } from "@meguiars/ui-tokens";
import { StyleSheet, View } from "react-native";
import { CentersList } from "@/components/CentersView";
import { Card, KpiCard } from "@/ui/display";
import { Screen } from "@/ui/layout";
import type { PrivateScreenProps } from "./types";

export function DireccionScreen({ state, header, subnav }: PrivateScreenProps) {
  const copy = sectionCopy.direccion;
  return (
    <Screen title={copy.title} description={copy.description} header={header}>
      {subnav}
      <View style={styles.kpis}>
        {executiveKpis(state.access).map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </View>
      <Card title="Centros">
        <CentersList access={state.access} now={new Date()} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
});
