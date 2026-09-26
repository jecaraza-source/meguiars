import {
  activeCenterAccess,
  authCopy,
  ROLE_LABELS,
  usableCenters,
  type SignedInState,
} from "@meguiars/domain";
import { colors, fontSize, space } from "@meguiars/ui-tokens";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "./kit";

/** Perfil básico y centro activo, visibles en todas las pantallas privadas. */
export function Header({ state, onChangeCenter }: { state: SignedInState; onChangeCenter: () => void }) {
  const { signOut } = useAuth();
  const active = activeCenterAccess(state);
  return (
    <View style={styles.header}>
      <Text style={styles.user}>{state.user.fullName ?? state.user.email}</Text>
      {active ? (
        <Text style={styles.center}>
          {authCopy.activeCenterLabel}: {active.center.name} (
          {active.roles.map((r) => ROLE_LABELS[r]).join(", ")})
        </Text>
      ) : null}
      <View style={styles.actions}>
        {usableCenters(state.access).length > 1 ? (
          <Button variant="link" label={authCopy.changeCenter} onPress={onChangeCenter} />
        ) : null}
        <Button variant="link" label={authCopy.logout} onPress={() => void signOut()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.xs, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  user: { fontSize: fontSize.sm, color: colors.muted },
  center: { fontSize: fontSize.sm, color: colors.foreground },
  actions: { flexDirection: "row", gap: space.lg },
});
