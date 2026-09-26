import {
  activeCenterAccess,
  clientErrorMessage,
  clientsCopy,
  describeMatch,
  isPossibleDuplicate,
  newRequestId,
  type ClientMatch,
  type MarketingChannel,
} from "@meguiars/domain";
import { createClientRepository } from "@meguiars/supabase";
import { fieldErrors, newClientFormSchema, toCreateClientCommand } from "@meguiars/validation";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { space } from "@meguiars/ui-tokens";
import { useAuth } from "@/auth/AuthProvider";
import {
  ClientFields,
  ConsentFields,
  VehicleFields,
  type FieldErrors,
  type FormValues,
} from "@/components/ClientFields";
import { Button, Field, LinkButton } from "@/ui/controls";
import { Card } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

export function ClientNewScreen({
  state,
  header,
  onOpen,
  onCancel,
}: PrivateScreenProps & { onOpen: (id: string) => void; onCancel: () => void }) {
  const { client } = useAuth();
  const toast = useToast();
  const center = activeCenterAccess(state)!.center;
  // Llave de idempotencia de este formulario: la misma en reintentos (red lenta, doble toque).
  const [requestId] = useState(newRequestId);
  const [values, setValues] = useState<FormValues>({ kind: "person" });
  const [channels, setChannels] = useState<MarketingChannel[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<ClientMatch[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const submit = async () => {
    if (!client) return;
    const parsed = newClientFormSchema.safeParse({ ...values, marketingChannels: channels });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setError(null);
    setBusy(true);
    const repo = createClientRepository(client);
    const command = toCreateClientCommand(parsed.data, {
      detailCenterId: center.id,
      requestId,
      source: "mobile",
    });
    // Mismo flujo que la web: aviso de duplicados antes de registrar.
    if (!command.duplicateReason) {
      const found = await repo.findMatches({
        detailCenterId: center.id,
        phone: command.phone,
        email: command.email,
        plates: command.vehicles.map((v) => v.plate),
        identifiers: command.vehicles.flatMap((v) => (v.identifier ? [v.identifier] : [])),
      });
      if (!found.ok || found.data.length > 0) {
        setBusy(false);
        if (!found.ok) return setError(clientErrorMessage(found.error));
        return setMatches(found.data);
      }
    }
    const result = await repo.create(command);
    setBusy(false);
    if (!result.ok) {
      if (isPossibleDuplicate(result.error)) {
        const found = await repo.findMatches({ detailCenterId: center.id, phone: command.phone });
        return setMatches(found.ok ? found.data : []);
      }
      return setError(clientErrorMessage(result.error));
    }
    toast({ message: clientsCopy.created, tone: "success" });
    onOpen(result.data.id);
  };

  const link = async (match: ClientMatch) => {
    if (!client) return;
    if (match.visible) return onOpen(match.clientId);
    setBusy(true);
    const result = await createClientRepository(client).linkToCenter(
      match.clientId,
      center.id,
      clientsCopy.linkReasonDefault,
    );
    setBusy(false);
    if (!result.ok) return setError(clientErrorMessage(result.error));
    toast({ message: clientsCopy.linked, tone: "success" });
    onOpen(match.clientId);
  };

  return (
    <Screen title={clientsCopy.newTitle} description={clientsCopy.newDescription} header={header}>
      <LinkButton label={`← ${clientsCopy.title}`} onPress={onCancel} />
      {matches.length > 0 ? (
        <Card title={clientsCopy.duplicateTitle} subtitle={clientsCopy.duplicateMessage}>
          {matches.map((m) => (
            <View key={m.clientId} style={styles.match}>
              <Text style={textStyle("label")}>{m.displayName}</Text>
              <Text style={textStyle("caption", "muted")}>{describeMatch(m)}</Text>
              <Button
                size="sm"
                variant="secondary"
                label={m.visible ? clientsCopy.useExisting : clientsCopy.linkExisting}
                loading={busy}
                onPress={() => void link(m)}
              />
            </View>
          ))}
        </Card>
      ) : null}
      <Card>
        <ClientFields values={values} errors={errors} set={set} />
        <ConsentFields channels={channels} onChange={setChannels} />
      </Card>
      <Card title={clientsCopy.vehicleTitle}>
        <VehicleFields values={values} errors={errors} set={set} />
      </Card>
      {matches.length > 0 || errors.duplicateReason ? (
        <Field
          label={clientsCopy.duplicateReasonLabel}
          hint={clientsCopy.duplicateReasonHint}
          value={values.duplicateReason ?? ""}
          onChangeText={(v) => set("duplicateReason", v)}
          error={errors.duplicateReason}
        />
      ) : null}
      <Notice tone="danger" text={error} />
      <Button
        label={matches.length > 0 ? clientsCopy.createAnyway : clientsCopy.submitCreate}
        loading={busy}
        onPress={() => void submit()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  match: { gap: space.xs },
});
