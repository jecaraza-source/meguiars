import {
  activeCenterAccess,
  authCopy,
  canInActiveCenter,
  centersCopy,
  formatInCenterTimeZone,
  presentCenterAccess,
  type SignedInState,
} from "@meguiars/domain";
import { createDetailCenterRepository } from "@meguiars/supabase";
import { fieldErrors, updateDetailCenterSchema } from "@meguiars/validation";
import { useState } from "react";
import { Text } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { CentersView } from "@/components/CentersView";
import { Header } from "@/ui/Header";
import { Button, Card, Field, Message, Screen, text } from "@/ui/kit";

function EditCenterForm({ state }: { state: SignedInState }) {
  const { client, reload } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [name, setName] = useState(center.name);
  const [timezone, setTimezone] = useState(center.timezone);
  const [reason, setReason] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ tone: "danger" | "success"; text: string } | null>(null);
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
    if (!res.ok) return setResult({ tone: "danger", text: res.error.message });
    setReason("");
    setResult({ tone: "success", text: authCopy.saved });
    await reload();
  };

  return (
    <Card>
      <Text style={text.strong}>{authCopy.editCenterTitle}</Text>
      <Field label={authCopy.centerNameLabel} value={name} onChangeText={setName} error={fields.name} />
      <Field
        label={authCopy.timezoneLabel}
        value={timezone}
        onChangeText={setTimezone}
        autoCapitalize="none"
        error={fields.timezone}
      />
      <Field label={authCopy.reasonLabel} value={reason} onChangeText={setReason} error={fields.reason} />
      <Message tone={result?.tone} text={result?.text} />
      <Button label={authCopy.submitEditCenter} onPress={() => void submit()} busy={busy} />
    </Card>
  );
}

export function HomeScreen({
  state,
  onChangeCenter,
  onTeam,
}: {
  state: SignedInState;
  onChangeCenter: () => void;
  onTeam: () => void;
}) {
  const item = presentCenterAccess(activeCenterAccess(state)!);
  const now = new Date();
  return (
    <Screen title={item.title}>
      <Header state={state} onChangeCenter={onChangeCenter} />
      <Card>
        <Text style={text.muted}>{authCopy.activeCenterLabel}</Text>
        <Text style={text.strong}>{item.title}</Text>
        <Text style={text.muted}>{item.subtitle}</Text>
        <Text style={text.body}>
          {centersCopy.rolesLabel}: {item.rolesText}
        </Text>
        <Text style={text.muted}>
          {centersCopy.localTimeLabel}: {formatInCenterTimeZone(now, item.timezone)} ({item.timezone})
        </Text>
        {/* La UI oculta lo que el rol no permite; RLS lo bloquea de todos modos. */}
        {canInActiveCenter(state, "members.read") ? (
          <Button variant="link" label={authCopy.teamTitle} onPress={onTeam} />
        ) : null}
      </Card>
      {canInActiveCenter(state, "center.manage") ? <EditCenterForm key={item.id} state={state} /> : null}
      <Text style={text.section}>{centersCopy.title}</Text>
      <CentersView state={{ status: "ready", data: state.access }} now={now} onRetry={() => undefined} />
    </Screen>
  );
}
