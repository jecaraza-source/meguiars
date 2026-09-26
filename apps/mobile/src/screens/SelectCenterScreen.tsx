import { authCopy, presentCenterAccess, usableCenters, type SignedInState } from "@meguiars/domain";
import { colors, radius, space } from "@meguiars/ui-tokens";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Badge } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { textStyle } from "@/ui/theme";

export function SelectCenterScreen({ state, onDone }: { state: SignedInState; onDone: () => void }) {
  const { selectCenter } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const choose = async (id: string) => {
    setBusyId(id);
    const err = await selectCenter(id);
    setBusyId(null);
    if (err) setError(err);
    else onDone();
  };

  return (
    <Screen title={authCopy.selectCenterTitle} description={authCopy.selectCenterHelp}>
      <Notice tone="danger" text={error} />
      {usableCenters(state.access)
        .map(presentCenterAccess)
        .map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ selected: item.id === state.activeCenterId, busy: busyId === item.id }}
            onPress={() => void choose(item.id)}
            style={[styles.option, item.id === state.activeCenterId ? styles.selected : null]}
          >
            <Text style={textStyle("heading")}>{item.title}</Text>
            <Text style={textStyle("bodySmall", "muted")}>{item.subtitle}</Text>
            <View style={styles.badges}>
              <Badge label={item.rolesText} />
              {item.badges.map((b) => (
                <Badge key={b.kind} label={b.label} tone={b.kind === "corporate" ? "brand" : "neutral"} />
              ))}
            </View>
          </Pressable>
        ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: {
    gap: space.xs,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
  },
  selected: { borderColor: colors.brand },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
});
