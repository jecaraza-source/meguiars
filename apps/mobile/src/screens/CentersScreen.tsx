import { APP_NAME, centersCopy, type CenterAccess, type ViewState } from "@meguiars/domain";
import { colors, fontSize, fontWeight, space } from "@meguiars/ui-tokens";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CentersView } from "@/components/CentersView";
import { loadMyCenters } from "@/lib/centers";

export function CentersScreen() {
  const [state, setState] = useState<ViewState<CenterAccess[]>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    loadMyCenters().then(
      (next) => active && setState(next),
      (error: unknown) =>
        active &&
        setState({ status: "error", message: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{APP_NAME.toUpperCase()}</Text>
          <Text style={styles.title}>{centersCopy.title}</Text>
          <Text style={styles.subtitle}>{centersCopy.subtitle}</Text>
        </View>
        <CentersView state={state} now={new Date()} onRetry={retry} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: space.xl, gap: space.xl },
  header: { gap: space.xs },
  eyebrow: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.accent },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, color: colors.foreground },
  subtitle: { fontSize: fontSize.md, color: colors.muted },
});
