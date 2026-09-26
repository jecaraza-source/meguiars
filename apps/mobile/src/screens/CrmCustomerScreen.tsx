import {
  activeCenterAccess,
  allowedTaskChannels,
  allowedTaskKinds,
  canInActiveCenter,
  channelForKind,
  CONTACT_CHANNEL_LABELS,
  CONTACT_CHANNELS,
  contactLinks,
  crmCopy,
  newRequestId,
  presentCrmCustomer,
  presentTask,
  TASK_CHANNEL_LABELS,
  TASK_KIND_LABELS,
  todayIn,
  usableCenters,
  type ContactChannel,
  type ContactPreference,
  type CrmCustomer,
  type CrmTask,
  type TaskKind,
  type ViewState,
} from "@meguiars/domain";
import { createCrmRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { contactPreferenceSchema, createTaskSchema, fieldErrors } from "@meguiars/validation";
import { useCallback, useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { CrmTaskCard } from "@/components/CrmTaskCard";
import { Button, Field, LinkButton, Select } from "@/ui/controls";
import { Badge, Card, EmptyState, KpiCard, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

interface Profile {
  customer: CrmCustomer;
  tasks: CrmTask[];
  preferences: ContactPreference[];
}

/** Ficha comercial (equivale a /comercial/clientes/[id] en web). */
export function CrmCustomerScreen({
  state,
  header,
  clientId,
  onBack,
}: PrivateScreenProps & { clientId: string; onBack: () => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const today = todayIn(center.timezone);
  const canWrite = canInActiveCenter(state, "crm.write");
  const [data, setData] = useState<ViewState<Profile>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const repo = createCrmRepository(client);
    const centers = usableCenters(state.access).map((a) => a.center.id);
    void Promise.all([
      repo.getCustomer(clientId, centers),
      repo.listTasks(centers, { clientId, today }),
      repo.preferences(clientId),
    ]).then(([c, t, p]) => {
      if (!active) return;
      if (!c.ok) return setData({ status: "permission_denied", message: crmCopy.notFound });
      if (!t.ok) return setData({ status: "error", message: t.error.message });
      if (!p.ok) return setData({ status: "error", message: p.error.message });
      setData({ status: "ready", data: { customer: c.data, tasks: t.data, preferences: p.data } });
    });
    return () => {
      active = false;
    };
  }, [client, clientId, today, state.access, version]);

  if (data.status !== "ready") {
    return (
      <Screen title={crmCopy.profileTitle} header={header}>
        <LinkButton label={`← ${crmCopy.customersTitle}`} onPress={onBack} />
        {data.status === "loading" ? <Skeleton lines={5} label="Cargando ficha" /> : null}
        {data.status === "error" || data.status === "permission_denied" ? (
          <EmptyState title={data.message} />
        ) : null}
      </Screen>
    );
  }
  const c = data.data.customer;
  const view = presentCrmCustomer(c, center.timezone);
  const links = contactLinks(c);

  return (
    <Screen
      title={`${crmCopy.profileTitle} · ${c.fullName}`}
      description={[c.phone, c.email].filter(Boolean).join(" · ")}
      header={header}
    >
      <LinkButton label={`← ${crmCopy.customersTitle}`} onPress={onBack} />
      <Badge label={view.segment} tone={view.segmentTone} />
      <View style={styles.kpis}>
        <KpiCard
          label={crmCopy.lastVisit}
          value={view.lastVisit}
          caption={`${view.visits} ${crmCopy.visits.toLowerCase()}`}
        />
        <KpiCard label={crmCopy.recommendation} value={view.nextVisit} caption={view.nextVisitLabel} />
        <KpiCard
          label={crmCopy.membership}
          value={view.membership}
          caption={c.membershipEndsOn ? `Vence ${c.membershipEndsOn}` : ""}
        />
        <KpiCard label={crmCopy.lifetimeValue} value={view.lifetimeValue} caption={view.valueBreakdown} />
      </View>
      {c.nextVisitFolio ? (
        <Text style={textStyle("bodySmall", "muted")}>Recomendado en {c.nextVisitFolio}</Text>
      ) : null}

      <Card title={crmCopy.consentTitle}>
        <ConsentEditor
          clientId={c.clientId}
          preferences={data.data.preferences}
          canWrite={canWrite}
          onDone={reload}
        />
        {links.length > 0 ? (
          <View style={styles.row}>
            <Text style={textStyle("bodySmall", "muted")}>{crmCopy.contactManual}:</Text>
            {links.map((l) => (
              <LinkButton key={l.channel} label={l.label} onPress={() => void Linking.openURL(l.href)} />
            ))}
          </View>
        ) : null}
      </Card>

      {canWrite ? (
        <Card title={crmCopy.newTask}>
          <NewTask
            centerId={center.id}
            clientId={c.clientId}
            optedIn={c.optedInChannels}
            today={today}
            onDone={reload}
          />
        </Card>
      ) : null}

      <Text accessibilityRole="header" style={textStyle("heading")}>
        {`${crmCopy.tasksTitle} (${c.openTasks} abiertos)`}
      </Text>
      {data.data.tasks.length === 0 ? <EmptyState title={crmCopy.tasksEmpty} /> : null}
      {data.data.tasks.map((t) => (
        <CrmTaskCard
          key={t.id}
          task={presentTask(t, today)}
          today={today}
          canWrite={canWrite}
          onDone={reload}
        />
      ))}
    </Screen>
  );
}

function ConsentEditor({
  clientId,
  preferences,
  canWrite,
  onDone,
}: {
  clientId: string;
  preferences: ContactPreference[];
  canWrite: boolean;
  onDone: () => void;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState<ContactChannel | null>(null);
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const opted = (ch: ContactChannel) => preferences.some((p) => p.channel === ch && p.optedIn);

  async function save() {
    if (!client || !editing) return;
    const parsed = contactPreferenceSchema.safeParse({
      clientId,
      channel: editing,
      optedIn: !opted(editing),
      source: "mobile",
      reason,
    });
    if (!parsed.success) return setFieldError(fieldErrors(parsed.error).reason);
    setBusy(true);
    setError(null);
    const r = await createCrmRepository(client).setPreference(parsed.data);
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    toast({ message: crmCopy.saved, tone: "success" });
    setEditing(null);
    setReason("");
    setFieldError(undefined);
    onDone();
  }

  return (
    <View style={styles.stack}>
      <Text style={textStyle("bodySmall", "muted")}>{crmCopy.consentHint}</Text>
      {CONTACT_CHANNELS.map((ch) => (
        <View key={ch} style={styles.row}>
          <Text style={textStyle("body")}>
            {CONTACT_CHANNEL_LABELS[ch]}: {opted(ch) ? crmCopy.optIn : crmCopy.optOut}
          </Text>
          {canWrite ? (
            <LinkButton
              label={
                opted(ch) ? `Retirar ${CONTACT_CHANNEL_LABELS[ch]}` : `Aceptar ${CONTACT_CHANNEL_LABELS[ch]}`
              }
              onPress={() => setEditing(ch)}
            />
          ) : null}
        </View>
      ))}
      {editing ? (
        <>
          <Field
            label={`${crmCopy.reason} (${CONTACT_CHANNEL_LABELS[editing]})`}
            required
            value={reason}
            onChangeText={setReason}
            error={fieldError}
          />
          <Button
            label={crmCopy.saveConsent}
            variant={opted(editing) ? "danger" : "primary"}
            loading={busy}
            onPress={() => void save()}
          />
        </>
      ) : null}
      <Notice tone="danger" text={error} />
    </View>
  );
}

function NewTask({
  centerId,
  clientId,
  optedIn,
  today,
  onDone,
}: {
  centerId: string;
  clientId: string;
  optedIn: readonly string[];
  today: string;
  onDone: () => void;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const kinds = allowedTaskKinds(optedIn);
  const channels = allowedTaskChannels(optedIn);
  const [requestId, setRequestId] = useState(newRequestId);
  const [kind, setKind] = useState<TaskKind>(kinds[0] ?? "ofrecer_mantenimiento");
  const [channel, setChannel] = useState<string>(channels[0] ?? "presencial");
  const [dueOn, setDueOn] = useState(today);
  const [notes, setNotes] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fixed = kind === "llamar" || kind === "whatsapp" || kind === "email";

  async function create() {
    if (!client) return;
    const parsed = createTaskSchema.safeParse({
      detailCenterId: centerId,
      requestId,
      clientId,
      kind,
      channel: fixed ? channelForKind(kind) : channel,
      dueOn,
      notes,
    });
    if (!parsed.success) return setFields(fieldErrors(parsed.error));
    setBusy(true);
    setError(null);
    const r = await createCrmRepository(client).createTask(parsed.data);
    setBusy(false);
    setFields({});
    if (!r.ok) return setError(r.error.message);
    toast({ message: crmCopy.created, tone: "success" });
    setRequestId(newRequestId());
    setNotes("");
    onDone();
  }

  return (
    <View style={styles.stack}>
      {channels.length === 1 ? (
        <Text style={textStyle("bodySmall", "muted")}>{crmCopy.noConsent}</Text>
      ) : null}
      <Select
        label={crmCopy.taskKind}
        options={kinds.map((k) => ({ value: k, label: TASK_KIND_LABELS[k] }))}
        value={kind}
        onChange={(v) => setKind(v as TaskKind)}
        error={fields.kind}
      />
      {fixed ? null : (
        <Select
          label={crmCopy.taskChannel}
          options={channels.map((ch) => ({ value: ch, label: TASK_CHANNEL_LABELS[ch] }))}
          value={channel}
          onChange={setChannel}
        />
      )}
      <Field
        label={`${crmCopy.dueOn} (AAAA-MM-DD)`}
        value={dueOn}
        onChangeText={setDueOn}
        error={fields.dueOn}
      />
      <Field label={crmCopy.notes} value={notes} onChangeText={setNotes} />
      <Notice tone="danger" text={error} />
      <Button label={crmCopy.create} loading={busy} onPress={() => void create()} />
    </View>
  );
}

const styles = StyleSheet.create({
  kpis: { gap: space.md },
  stack: { gap: space.sm },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
});
