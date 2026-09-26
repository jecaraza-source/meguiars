import {
  activeCenterAccess,
  authCopy,
  ROLE_LABELS,
  type CenterMember,
  type SignedInState,
  type ViewState,
} from "@meguiars/domain";
import { createAccessRepository } from "@meguiars/supabase";
import { colors, space } from "@meguiars/ui-tokens";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Header } from "@/ui/Header";
import { Button, Card, Message, Screen, text } from "@/ui/kit";

export function TeamScreen({
  state,
  onBack,
  onChangeCenter,
}: {
  state: SignedInState;
  onBack: () => void;
  onChangeCenter: () => void;
}) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [members, setMembers] = useState<ViewState<CenterMember[]>>({ status: "loading" });

  // Sólo el centro activo; al cambiar de centro se descarta la respuesta anterior.
  useEffect(() => {
    if (!client) return;
    let active = true;
    createAccessRepository(client)
      .listCenterMembers(center.id)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setMembers(
            result.error.kind === "permission_denied"
              ? { status: "permission_denied", message: authCopy.forbidden }
              : { status: "error", message: result.error.message },
          );
        } else {
          setMembers(result.data.length ? { status: "ready", data: result.data } : { status: "empty" });
        }
      });
    return () => {
      active = false;
    };
  }, [client, center.id]);

  return (
    <Screen title={`${authCopy.teamTitle} · ${center.name}`}>
      <Header state={state} onChangeCenter={onChangeCenter} />
      <Button variant="link" label="← Inicio" onPress={onBack} />
      {members.status === "loading" ? <ActivityIndicator color={colors.brand} /> : null}
      {members.status === "empty" ? <Message text={authCopy.teamEmpty} /> : null}
      {members.status === "error" || members.status === "permission_denied" ? (
        <Message tone="danger" text={members.message} />
      ) : null}
      {members.status === "ready" ? (
        <Card>
          {members.data.map((m) => (
            <View key={m.userId} style={styles.row}>
              <Text style={text.body}>{m.fullName ?? m.userId}</Text>
              <Text style={text.muted}>
                {ROLE_LABELS[m.role]}
                {m.active ? "" : " · inactivo"}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", gap: space.md, paddingVertical: space.xs },
});
