import {
  activeCenterAccess,
  canInCenter,
  commercialErrorMessage,
  CONVERSATION_STATUS_LABELS,
  formatInCenterTimeZone,
  INBOX_CHANNEL_LABELS,
  INBOX_CHANNELS,
  INBOX_COPY,
  MESSAGE_STATUS_LABELS,
  newRequestId,
  replyBlocker,
  usableCenters,
  windowRemaining,
  type Conversation,
  type ConversationStatus,
  type InboxChannel,
  type InboxMessage,
  type LeadOwner,
  type ViewState,
} from "@meguiars/domain";
import { createCommercialRepository, createInboxRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { sendFromApp, WEB_URL } from "@/lib/inbox";
import { Button, Checkbox, Field, LinkButton, Select } from "@/ui/controls";
import { Badge, Card, EmptyState, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

/** Bandeja (equivale a /comercial/bandeja en web). */
export function InboxScreen({
  state,
  header,
  subnav,
  onOpen,
}: PrivateScreenProps & { onOpen: (id: string) => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [status, setStatus] = useState<ConversationStatus>("abierta");
  const [channel, setChannel] = useState<InboxChannel | "">("");
  const [mine, setMine] = useState(false);
  const [data, setData] = useState<ViewState<Conversation[]>>({ status: "loading" });

  useEffect(() => {
    if (!client) return;
    let active = true;
    void createInboxRepository(client)
      .conversations([center.id], {
        status,
        channel: channel || undefined,
        assignedTo: mine ? state.user.id : undefined,
      })
      .then((r) => {
        if (!active) return;
        setData(
          r.ok
            ? { status: "ready", data: r.data }
            : { status: "error", message: commercialErrorMessage(r.error) },
        );
      });
    return () => {
      active = false;
    };
  }, [client, center.id, status, channel, mine, state.user.id]);

  return (
    <Screen title={INBOX_COPY.title} description={center.name} header={header}>
      {subnav}
      <Card>
        <View style={styles.stack}>
          <Select
            label="Estado"
            options={(["abierta", "cerrada"] as const).map((s) => ({
              value: s,
              label: CONVERSATION_STATUS_LABELS[s],
            }))}
            value={status}
            onChange={(v) => setStatus(v as ConversationStatus)}
          />
          <Select
            label="Canal"
            options={[
              { value: "", label: "Todos" },
              ...INBOX_CHANNELS.map((c) => ({ value: c, label: INBOX_CHANNEL_LABELS[c] })),
            ]}
            value={channel}
            onChange={(v) => setChannel(v as InboxChannel | "")}
          />
          <Checkbox label="Sólo mías" checked={mine} onChange={setMine} />
        </View>
      </Card>
      {data.status === "loading" ? <Skeleton lines={5} label="Cargando conversaciones" /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" ? (
        <List
          caption={INBOX_COPY.title}
          rows={data.data}
          rowKey={(c) => c.id}
          emptyMessage={INBOX_COPY.empty}
          onRowPress={(c) => onOpen(c.id)}
          columns={[
            {
              key: "who",
              header: "Contacto",
              value: (c) => c.contactName ?? c.contactPhone ?? INBOX_CHANNEL_LABELS[c.channel],
            },
            { key: "channel", header: "Canal", value: (c) => INBOX_CHANNEL_LABELS[c.channel] },
            { key: "last", header: "Último", value: (c) => c.lastMessagePreview ?? "—" },
            {
              key: "unread",
              header: "Sin leer",
              value: (c) => (c.unreadCount ? String(c.unreadCount) : "—"),
            },
          ]}
        />
      ) : null}
    </Screen>
  );
}

interface Loaded {
  conversation: Conversation;
  messages: InboxMessage[];
  owners: LeadOwner[];
}

/** Conversación (equivale a /comercial/bandeja/[id]); responder pasa por el servidor. */
export function ConversationScreen({
  state,
  header,
  subnav,
  conversationId,
  onBack,
  onLead,
}: PrivateScreenProps & { conversationId: string; onBack: () => void; onLead: (id: string) => void }) {
  const { client } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<ViewState<Loaded>>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((x) => x + 1), []);
  const [body, setBody] = useState("");
  const [requestId, setRequestId] = useState(newRequestId());
  const [leadName, setLeadName] = useState("");
  const [handle, setHandle] = useState("");
  const [owner, setOwner] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const repo = createInboxRepository(client);
    void repo
      .conversation(
        conversationId,
        usableCenters(state.access).map((a) => a.center.id),
      )
      .then(async (r) => {
        if (!active) return;
        if (!r.ok) return setData({ status: "error", message: commercialErrorMessage(r.error) });
        const [messages, owners] = await Promise.all([
          repo.messages(r.data.id),
          createCommercialRepository(client).leadOwners(r.data.detailCenterId),
        ]);
        if (!active) return;
        setOwner(r.data.assignedTo ?? "");
        setLeadName((n) => n || (r.data.contactName ?? ""));
        setData({
          status: "ready",
          data: {
            conversation: r.data,
            messages: messages.ok ? messages.data : [],
            owners: owners.ok ? owners.data : [],
          },
        });
      });
    return () => {
      active = false;
    };
  }, [client, conversationId, state.access, tick]);

  if (data.status !== "ready") {
    return (
      <Screen title={INBOX_COPY.title} header={header}>
        {subnav}
        <LinkButton label="← Bandeja" onPress={onBack} />
        {data.status === "loading" ? (
          <Skeleton lines={5} />
        ) : (
          <EmptyState title={"message" in data ? data.message : INBOX_COPY.empty} />
        )}
      </Screen>
    );
  }
  const { conversation: c, messages, owners } = data.data;
  const repo = createInboxRepository(client!);
  const tz =
    usableCenters(state.access).find((a) => a.center.id === c.detailCenterId)?.center.timezone ??
    "America/Mexico_City";
  const canWrite = canInCenter(state, c.detailCenterId, "leads.use");
  const blocker = replyBlocker(c);
  const remaining = windowRemaining(c.lastInboundAt);
  const run = async (
    fn: () => Promise<{ ok: boolean; error?: { kind: string; message: string } }>,
    done: string,
  ) => {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setError(commercialErrorMessage(r.error!));
    toast({ message: done, tone: "success" });
    reload();
  };
  const send = async () => {
    setBusy(true);
    setError(null);
    const r = await sendFromApp(client!, { conversationId: c.id, requestId, body });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    if (r.status === "fallido") return setError(`Meta no aceptó el mensaje: ${r.error ?? "error"}`);
    toast({ message: "Mensaje enviado", tone: "success" });
    setBody("");
    setRequestId(newRequestId());
    reload();
  };

  return (
    <Screen
      title={c.contactName ?? c.contactPhone ?? INBOX_CHANNEL_LABELS[c.channel]}
      description={`${INBOX_CHANNEL_LABELS[c.channel]} · ${c.accountLabel}`}
      header={header}
    >
      {subnav}
      <LinkButton label="← Bandeja" onPress={onBack} />
      <Card title="Mensajes">
        {messages.map((m) => (
          <View key={m.id} style={[styles.bubble, m.direction === "saliente" ? styles.out : styles.in]}>
            <Text style={textStyle("bodySmall")}>{m.body ?? INBOX_COPY.mediaNotice}</Text>
            <Text style={textStyle("caption", "muted")}>
              {formatInCenterTimeZone(m.occurredAt, tz)}
              {m.direction === "saliente" ? ` · ${MESSAGE_STATUS_LABELS[m.status]}` : ""}
            </Text>
            {m.error ? <Text style={textStyle("caption")}>{m.error}</Text> : null}
          </View>
        ))}
      </Card>
      {canWrite ? (
        <Card title="Responder">
          {blocker ? (
            <Notice text={blocker} tone="warning" />
          ) : !WEB_URL ? (
            <Notice text={INBOX_COPY.sendUnavailable} tone="warning" />
          ) : (
            <View style={styles.stack}>
              <Text style={textStyle("caption", "muted")}>
                Quedan {remaining!.hours} h {remaining!.minutes} min de ventana.
              </Text>
              <Field label="Respuesta" value={body} onChangeText={setBody} multiline />
              <Button
                label={`Enviar por ${INBOX_CHANNEL_LABELS[c.channel]}`}
                loading={busy}
                disabled={!body.trim()}
                onPress={() => void send()}
              />
            </View>
          )}
          <Text style={textStyle("caption", "muted")}>{INBOX_COPY.notMirrored}</Text>
        </Card>
      ) : null}
      <Card title="Contacto" subtitle={CONVERSATION_STATUS_LABELS[c.status]}>
        <View style={styles.stack}>
          <Text style={textStyle("bodySmall")}>Teléfono: {c.contactPhone ?? "No compartido por Meta"}</Text>
          {c.leadId ? (
            <LinkButton label={`Prospecto: ${c.leadName}`} onPress={() => onLead(c.leadId!)} />
          ) : null}
          {c.windowOpen ? (
            <Badge label="Ventana abierta" tone="success" />
          ) : (
            <Badge label="Ventana cerrada" tone="warning" />
          )}
          {canWrite ? (
            <>
              <Select
                label="Responsable"
                options={[
                  { value: "", label: "Sin asignar" },
                  ...owners.map((o) => ({ value: o.userId, label: o.fullName })),
                ]}
                value={owner}
                onChange={setOwner}
              />
              <Button
                label="Asignar"
                variant="secondary"
                onPress={() =>
                  void run(() => repo.assign(c.id, c.version, owner || null), "Responsable actualizado")
                }
              />
              <Button
                label={c.status === "abierta" ? "Marcar como atendida" : "Reabrir"}
                variant="secondary"
                onPress={() =>
                  void run(
                    () => repo.setStatus(c.id, c.version, c.status === "abierta" ? "cerrada" : "abierta"),
                    "Conversación actualizada",
                  )
                }
              />
            </>
          ) : null}
        </View>
      </Card>
      {canWrite && !c.leadId ? (
        <Card title="Registrar como prospecto">
          <View style={styles.stack}>
            <Field label="Nombre" value={leadName} onChangeText={setLeadName} />
            {!c.contactPhone ? (
              <Field
                label="Usuario en redes (@)"
                autoCapitalize="none"
                value={handle}
                onChangeText={setHandle}
              />
            ) : null}
            <Button
              label="Registrar como prospecto"
              loading={busy}
              onPress={async () => {
                setBusy(true);
                setError(null);
                const r = await repo.createLead({
                  conversationId: c.id,
                  version: c.version,
                  requestId: newRequestId(),
                  fullName: leadName,
                  socialHandle: handle || undefined,
                  interestServiceIds: [],
                });
                setBusy(false);
                if (!r.ok) return setError(commercialErrorMessage(r.error));
                toast({ message: "Prospecto registrado", tone: "success" });
                onLead(r.data.leadId);
              }}
            />
          </View>
        </Card>
      ) : null}
      <Notice text={error} tone="danger" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  bubble: { gap: space.xs, marginBottom: space.sm, padding: space.sm },
  in: { alignSelf: "flex-start" },
  out: { alignSelf: "flex-end" },
});
