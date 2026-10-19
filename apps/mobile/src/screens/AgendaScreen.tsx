import {
  activeCenterAccess,
  activeTone,
  addDays,
  agendaCopy,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUSES,
  type AppointmentListItem,
  type AppointmentStatus,
  type Bay,
  canInActiveCenter,
  daySummary,
  formatDateInCenterTimeZone,
  agendaBadgeTone,
  loadAgendaWeek,
  type AgendaView,
  type AgendaWeekDay,
  presentAppointment,
  statusActions,
  type Technician,
  todayIn,
  type ViewState,
  zonedToUtc,
} from "@meguiars/domain";
import { createAgendaRepository, type MeguiarsSupabaseClient } from "@meguiars/supabase";
import { colors, radius, space } from "@meguiars/ui-tokens";
import { upsertResourceSchema } from "@meguiars/validation";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, LinkButton, Select } from "@/ui/controls";
import { Badge, Card, EmptyState, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

interface Loaded {
  items: AppointmentListItem[];
  /** Vista de 7 días: el día elegido y los 6 siguientes. */
  week: (AgendaWeekDay & { items: AppointmentListItem[] })[] | null;
  bays: Bay[];
  technicians: Technician[];
}

async function fetchDay(
  client: MeguiarsSupabaseClient,
  centerId: string,
  day: string,
  filter: { status: string; bayId: string; technicianId: string },
  view: AgendaView,
  today: string,
): Promise<ViewState<Loaded>> {
  const repo = createAgendaRepository(client);
  const f = {
    status: (filter.status || undefined) as AppointmentStatus | undefined,
    bayId: filter.bayId || undefined,
    technicianId: filter.technicianId || undefined,
  };
  const [items, week, bays, technicians] = await Promise.all([
    view === "dia" ? repo.listDay(centerId, day, f) : Promise.resolve({ ok: true as const, data: [] }),
    view === "semana" ? loadAgendaWeek(repo, centerId, day, today, f) : null,
    repo.listBays(centerId),
    repo.listTechnicians(centerId),
  ]);
  if (!items.ok) return { status: "error", message: items.error.message };
  if (week && !week.ok) return { status: "error", message: week.error.message };
  return {
    status: "ready",
    data: {
      items: items.data,
      week: week?.ok ? week.data : null,
      bays: bays.ok ? bays.data : [],
      technicians: technicians.ok ? technicians.data : [],
    },
  };
}

export function AgendaScreen({
  state,
  header,
  subnav,
  onOpen,
  onNew,
}: PrivateScreenProps & { onOpen: (id: string) => void; onNew: (walkIn: boolean, day: string) => void }) {
  const { client } = useAuth();
  const toast = useToast();
  const center = activeCenterAccess(state)!.center;
  // Día del centro (su zona horaria), no del teléfono.
  const [day, setDay] = useState(() => todayIn(center.timezone));
  // Por omisión, los 7 días (hoy y los 6 siguientes); «Día» muestra un solo día con acciones rápidas.
  const [view, setView] = useState<AgendaView>("semana");
  const step = view === "semana" ? 7 : 1;
  const [filter, setFilter] = useState({ status: "", bayId: "", technicianId: "" });
  const [data, setData] = useState<ViewState<Loaded>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const canWrite = canInActiveCenter(state, "agenda.write");

  useEffect(() => {
    if (!client) return;
    let active = true;
    void fetchDay(client, center.id, day, filter, view, todayIn(center.timezone)).then((next) => {
      if (active) setData(next);
    });
    return () => {
      active = false;
    };
  }, [client, center.id, center.timezone, day, filter, view, version]);

  // Acción rápida: el siguiente paso del flujo sin abrir la cita (recibir, iniciar, terminar, entregar).
  const advance = async (id: string, to: AppointmentStatus) => {
    if (!client) return;
    setBusyId(id);
    const result = await createAgendaRepository(client).setStatus({ id, status: to });
    setBusyId(null);
    if (!result.ok) return toast({ message: result.error.message, tone: "danger" });
    toast({ message: `${APPOINTMENT_STATUS_LABELS[to]}.`, tone: "success" });
    reload();
  };

  const bays = data.status === "ready" ? data.data.bays : [];
  const technicians = data.status === "ready" ? data.data.technicians : [];
  const all = { value: "", label: agendaCopy.all };

  return (
    <Screen title={`${agendaCopy.title} · ${center.name}`} header={header}>
      {subnav}
      <View style={styles.row}>
        <Button
          label="7 días"
          size="sm"
          variant={view === "semana" ? "primary" : "secondary"}
          onPress={() => setView("semana")}
        />
        <Button
          label="Día"
          size="sm"
          variant={view === "dia" ? "primary" : "secondary"}
          onPress={() => setView("dia")}
        />
      </View>
      <View style={styles.dayNav}>
        <LinkButton
          label={`← ${view === "semana" ? "7 días antes" : agendaCopy.previousDay}`}
          onPress={() => setDay(addDays(day, -step))}
        />
        <Text accessibilityRole="header" style={textStyle("label")}>
          {formatDateInCenterTimeZone(zonedToUtc(day, "12:00", center.timezone), center.timezone)}
          {view === "semana" ? " y 6 días siguientes" : ""}
        </Text>
        <LinkButton
          label={`${view === "semana" ? "7 días después" : agendaCopy.nextDay} →`}
          onPress={() => setDay(addDays(day, step))}
        />
      </View>
      <LinkButton label={agendaCopy.today} onPress={() => setDay(todayIn(center.timezone))} />
      {canWrite ? (
        <View style={styles.row}>
          <Button label={agendaCopy.newAppointment} onPress={() => onNew(false, day)} />
          <Button label={agendaCopy.walkIn} variant="secondary" onPress={() => onNew(true, day)} />
        </View>
      ) : null}
      <Card>
        <Select
          label={agendaCopy.statusFilter}
          options={[
            all,
            ...APPOINTMENT_STATUSES.map((s) => ({ value: s, label: APPOINTMENT_STATUS_LABELS[s] })),
          ]}
          value={filter.status}
          onChange={(v) => setFilter((f) => ({ ...f, status: v }))}
        />
        <Select
          label={agendaCopy.bayFilter}
          options={[all, ...bays.map((b) => ({ value: b.id, label: b.name }))]}
          value={filter.bayId}
          onChange={(v) => setFilter((f) => ({ ...f, bayId: v }))}
        />
        <Select
          label={agendaCopy.technicianFilter}
          options={[all, ...technicians.map((t) => ({ value: t.id, label: t.fullName }))]}
          value={filter.technicianId}
          onChange={(v) => setFilter((f) => ({ ...f, technicianId: v }))}
        />
      </Card>

      {data.status === "loading" ? <Skeleton lines={4} label="Cargando agenda" /> : null}
      {data.status === "error" ? <Notice tone="danger" text={data.message} /> : null}
      {data.status === "ready" && data.data.week
        ? data.data.week.map((d) => (
            <Card key={d.day} title={`${d.label} · ${d.items.length}`}>
              <LinkButton
                label="Ver el día"
                onPress={() => {
                  setDay(d.day);
                  setView("dia");
                }}
              />
              {d.items.length === 0 ? (
                <Text style={textStyle("caption", "muted")}>Sin citas</Text>
              ) : (
                d.items.map((item) => {
                  const v = presentAppointment(item, center.timezone);
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${v.time} ${v.client}`}
                      onPress={() => onOpen(item.id)}
                      style={[styles.card, v.fromWhatsapp ? styles.whatsapp : null]}
                    >
                      <Text style={textStyle("label")}>
                        {v.time} · {v.client}
                      </Text>
                      <Text style={textStyle("caption", "muted")}>{v.services}</Text>
                      <View style={styles.row}>
                        <Badge label={v.status} tone={v.tone} />
                        {v.badges.map((b) => (
                          <Badge key={b} label={b} tone={agendaBadgeTone(b)} />
                        ))}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </Card>
          ))
        : null}
      {data.status === "ready" && !data.data.week && data.data.items.length === 0 ? (
        <EmptyState title={agendaCopy.empty} />
      ) : null}
      {data.status === "ready" && !data.data.week && data.data.items.length > 0 ? (
        <>
          <View style={styles.row}>
            {daySummary(data.data.items).map((s) => (
              <Badge key={s.status} label={`${s.label}: ${s.count}`} />
            ))}
          </View>
          {data.data.items.map((item) => {
            const view = presentAppointment(item, center.timezone);
            const next = statusActions(item.status).find((a) => !a.needsReason);
            return (
              <View key={item.id} style={[styles.card, view.fromWhatsapp ? styles.whatsapp : null]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${view.time} ${view.client}`}
                  onPress={() => onOpen(item.id)}
                >
                  <Card title={`${view.time} · ${view.client}`} subtitle={view.vehicle}>
                    <View style={styles.row}>
                      {view.badges.map((b) => (
                        <Badge key={b} label={b} tone={agendaBadgeTone(b)} />
                      ))}
                      <Badge label={view.status} tone={view.tone} />
                    </View>
                    <Text style={textStyle("bodySmall", "muted")}>
                      {view.services} · {view.bay} · {view.technician}
                    </Text>
                  </Card>
                </Pressable>
                {canWrite && next ? (
                  <Button
                    label={next.label}
                    loading={busyId === item.id}
                    onPress={() => void advance(item.id, next.to)}
                  />
                ) : null}
              </View>
            );
          })}
        </>
      ) : null}

      {canInActiveCenter(state, "agenda.manage") && data.status === "ready" ? (
        <Resources centerId={center.id} bays={bays} technicians={technicians} onDone={reload} />
      ) : null}
    </Screen>
  );
}

function Resources({
  centerId,
  bays,
  technicians,
  onDone,
}: {
  centerId: string;
  bays: Bay[];
  technicians: Technician[];
  onDone: () => void;
}) {
  const { client } = useAuth();
  const [bayName, setBayName] = useState("");
  const [techName, setTechName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = async (kind: "bay" | "tech", input: { id?: string; name: string; active: boolean }) => {
    if (!client) return;
    const parsed = upsertResourceSchema.safeParse({
      detailCenterId: centerId,
      ...input,
      reason: input.id ? "Cambio de recurso" : "Alta de recurso",
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Nombre inválido");
    const repo = createAgendaRepository(client);
    const result =
      kind === "bay" ? await repo.upsertBay(parsed.data) : await repo.upsertTechnician(parsed.data);
    if (!result.ok)
      return setError(result.error.code === "23505" ? "Ya existe con ese nombre." : result.error.message);
    setError(null);
    setBayName("");
    setTechName("");
    onDone();
  };

  return (
    <Card title={agendaCopy.resourcesTitle}>
      <Text style={textStyle("label")}>{agendaCopy.bays}</Text>
      {bays.map((b) => (
        <View key={b.id} style={styles.resource}>
          <View style={styles.resourceName}>
            <Text style={textStyle("body")}>{b.name}</Text>
            <Badge label={b.active ? "Activa" : "Inactiva"} tone={activeTone(b.active)} />
          </View>
          <LinkButton
            label={b.active ? agendaCopy.deactivate : agendaCopy.activate}
            onPress={() => void save("bay", { id: b.id, name: b.name, active: !b.active })}
          />
        </View>
      ))}
      <Field label={agendaCopy.resourceName} value={bayName} onChangeText={setBayName} />
      <Button
        label={agendaCopy.addBay}
        variant="secondary"
        onPress={() => void save("bay", { name: bayName, active: true })}
      />
      <Text style={textStyle("label")}>{agendaCopy.technicians}</Text>
      {technicians.map((t) => (
        <View key={t.id} style={styles.resource}>
          <View style={styles.resourceName}>
            <Text style={textStyle("body")}>{t.fullName}</Text>
            <Badge label={t.active ? "Activo" : "Inactivo"} tone={activeTone(t.active)} />
          </View>
          <LinkButton
            label={t.active ? agendaCopy.deactivate : agendaCopy.activate}
            onPress={() => void save("tech", { id: t.id, name: t.fullName, active: !t.active })}
          />
        </View>
      ))}
      <Field label={agendaCopy.resourceName} value={techName} onChangeText={setTechName} />
      <Button
        label={agendaCopy.addTechnician}
        variant="secondary"
        onPress={() => void save("tech", { name: techName, active: true })}
      />
      <Notice tone="danger" text={error} />
    </Card>
  );
}

const styles = StyleSheet.create({
  dayNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  card: { gap: space.xs },
  // Reservada por el cliente en WhatsApp: franja y fondo verdes.
  whatsapp: {
    borderLeftWidth: space.xs,
    borderLeftColor: colors.success,
    backgroundColor: colors.successSurface,
    paddingLeft: space.xs,
    borderRadius: radius.md,
  },
  resource: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resourceName: { flexDirection: "row", alignItems: "center", gap: space.xs, flexShrink: 1 },
});
