import {
  activeCenterAccess,
  authCopy,
  canInActiveCenter,
  centersCopy,
  formatDateInCenterTimeZone,
  formatTimeInCenterTimeZone,
  presentCenterAccess,
  type SignedInState,
} from "@meguiars/domain";
import { createDetailCenterRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { fieldErrors, updateDetailCenterSchema } from "@meguiars/validation";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { CentersList } from "@/components/CentersView";
import { Button, Field } from "@/ui/controls";
import { Card, KpiCard } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import type { PrivateScreenProps } from "./types";

function EditCenterForm({ state }: { state: SignedInState }) {
  const { client, reload } = useAuth();
  const toast = useToast();
  const center = activeCenterAccess(state)!.center;
  const [name, setName] = useState(center.name);
  const [timezone, setTimezone] = useState(center.timezone);
  const [reason, setReason] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = updateDetailCenterSchema.safeParse({ id: center.id, name, timezone, reason });
    if (!parsed.success) return setFields(fieldErrors(parsed.error));
    if (!client) return;
    setFields({});
    setBusy(true);
    // RLS vuelve a validar: sin admin_socio la RPC devuelve permission_denied.
    const res = await createDetailCenterRepository(client).update(parsed.data);
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    setError(null);
    setReason("");
    toast({ message: authCopy.saved, tone: "success" });
    await reload();
  };

  return (
    <Card
      title={authCopy.editCenterTitle}
      subtitle="Los cambios quedan en la bitácora de auditoría con su motivo."
    >
      <Field label={authCopy.centerNameLabel} value={name} onChangeText={setName} error={fields.name} />
      <Field
        label={authCopy.timezoneLabel}
        hint="Por ejemplo America/Mexico_City."
        value={timezone}
        onChangeText={setTimezone}
        autoCapitalize="none"
        error={fields.timezone}
      />
      <Field
        label={authCopy.reasonLabel}
        required
        value={reason}
        onChangeText={setReason}
        error={fields.reason}
      />
      <Notice tone="danger" text={error} />
      <Button label={authCopy.submitEditCenter} onPress={() => void submit()} loading={busy} />
    </Card>
  );
}

export function HomeScreen({ state, header, subnav }: PrivateScreenProps) {
  const active = activeCenterAccess(state)!;
  const item = presentCenterAccess(active);
  const now = new Date();
  return (
    <Screen title={item.title} description={item.subtitle} header={header}>
      {subnav}
      <View style={styles.kpis}>
        <KpiCard
          label={centersCopy.rolesLabel}
          value={String(active.roles.length)}
          caption={item.rolesText}
        />
        <KpiCard
          label={centersCopy.localTimeLabel}
          value={formatTimeInCenterTimeZone(now, item.timezone)}
          caption={`${formatDateInCenterTimeZone(now, item.timezone)} · ${item.timezone}`}
        />
        <KpiCard
          label="Centros con acceso"
          value={String(state.access.length)}
          caption="en todas tus organizaciones"
        />
      </View>
      {/* La UI oculta lo que el rol no permite; RLS lo bloquea de todos modos. */}
      {canInActiveCenter(state, "center.manage") ? (
        <EditCenterForm key={active.center.id} state={state} />
      ) : null}
      <Card title={centersCopy.title} subtitle={centersCopy.subtitle}>
        <CentersList access={state.access} now={now} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
});
