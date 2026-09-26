import { authCopy, presentCenterAccess, usableCenters, type SignedInState } from "@meguiars/domain";
import { colors, radius, space } from "@meguiars/ui-tokens";
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Header } from "@/ui/Header";
import { Message, Screen, text } from "@/ui/kit";

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
    <Screen title={authCopy.selectCenterTitle}>
      <Header state={state} onChangeCenter={() => undefined} />
      <Text style={text.muted}>{authCopy.selectCenterHelp}</Text>
      <Message tone="danger" text={error} />
      {usableCenters(state.access)
        .map(presentCenterAccess)
        .map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ selected: item.id === state.activeCenterId, busy: busyId === item.id }}
            onPress={() => void choose(item.id)}
            style={[styles.option, item.id === state.activeCenterId ? { borderColor: colors.brand } : null]}
          >
            <Text style={text.strong}>{item.title}</Text>
            <Text style={text.muted}>{item.subtitle}</Text>
            <Text style={text.body}>{item.rolesText}</Text>
          </Pressable>
        ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.xs,
  },
});
