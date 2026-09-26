import {
  activeCenterAccess,
  agendaCopy,
  canInActiveCenter,
  canReschedule,
  presentAppointment,
  presentOrderDraft,
  statusActions,
  utcToZoned,
  type AppointmentDetail,
  type AppointmentStatus,
  type Bay,
  type CatalogItem,
  type ServiceOrderDraft,
  type Technician,
  type ViewState,
} from "@meguiars/domain";
import {
  createAgendaRepository,
  createCatalogRepository,
  type MeguiarsSupabaseClient,
} from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import {
  fieldErrors,
  rescheduleFormSchema,
  setStatusSchema,
  toUpdateAppointmentCommand,
} from "@meguiars/validation";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { DateTimeFields, ScheduleFields } from "@/components/AgendaFields";
import type { FieldErrors, FormValues } from "@/components/ClientFields";
import { Button, Field, LinkButton } from "@/ui/controls";
import { Badge, Card, EmptyState, KpiCard, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

interface Loaded {
  appointment: AppointmentDetail;
  draft: ServiceOrderDraft | null;
  services: CatalogItem[];
  bays: Bay[];
  technicians: Technician[];
}

async function fetchAppointment(
  client: MeguiarsSupabaseClient,
  id: string,
  centerId: string,
): Promise<ViewState<Loaded>> {
  const repo = createAgendaRepository(client);
  const detail = await repo.get(id);
  if (!detail.ok) return { status: "permission_denied", message: agendaCopy.notFound };
  const a = detail.data;
  const received = !["programada", "cancelada", "no_show"].includes(a.status);
  const [draft, catalog, bays, technicians] = await Promise.all([
    received ? repo.orderDraft(id) : null,
    createCatalogRepository(client).listForCenter(centerId),
    repo.listBays(centerId),
    repo.listTechnicians(centerId),
  ]);
  return {
    status: "ready",
    data: {
      appointment: a,
      draft: draft?.ok ? draft.data : null,
      services: catalog.ok ? catalog.data : [],
      bays: bays.ok ? bays.data : [],
      technicians: technicians.ok ? technicians.data : [],
    },
  };
}

export function AppointmentDetailScreen({
  state,
  header,
  appointmentId,
  onBack,
}: PrivateScreenProps & { appointmentId: string; onBack: () => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [data, setData] = useState<ViewState<Loaded>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void fetchAppointment(client, appointmentId, center.id).then((next) => {
      if (active) setData(next);
    });
    return () => {
      active = false;
    };
  }, [client, appointmentId, center.id, version]);

  const back = <LinkButton label={`← ${agendaCopy.title}`} onPress={onBack} />;
  if (data.status !== "ready") {
    return (
      <Screen title={agendaCopy.detailTitle} header={header}>
        {back}
        {data.status === "loading" ? <Skeleton lines={4} label="Cargando cita" /> : null}
        {data.status === "error" || data.status === "permission_denied" ? (
          <EmptyState title={data.message} />
        ) : null}
      </Screen>
    );
  }

  const { appointment: a, draft } = data.data;
  const view = presentAppointment(a, center.timezone);
  const canWrite = canInActiveCenter(state, "agenda.write");
  return (
    <Screen title={`${view.client} · ${view.time}`} description={view.vehicle} header={header}>
      {back}
      <View style={styles.kpis}>
        <KpiCard
          label={agendaCopy.statusFilter}
          value={view.status}
          caption={view.badges.join(" · ") || undefined}
        />
        <KpiCard label={agendaCopy.servicesLabel} value={String(a.services.length)} caption={view.services} />
        <KpiCard label={agendaCopy.bayFilter} value={view.bay} />
        <KpiCard label={agendaCopy.technicianFilter} value={view.technician} />
      </View>
      {a.notes ? <Text style={textStyle("bodySmall")}>{a.notes}</Text> : null}
      {canWrite ? (
        <StatusCard
          key={`${a.status}-${version}`}
          id={a.id}
          status={a.status}
          tone={view.tone}
          label={view.status}
          onDone={reload}
        />
      ) : null}
      {draft ? (
        <Card title={agendaCopy.draftTitle} subtitle={agendaCopy.draftSubtitle}>
          <Text style={textStyle("bodySmall")}>
            {view.client} · {view.vehicle}
          </Text>
          <List
            caption={agendaCopy.draftTitle}
            rows={presentOrderDraft(draft).lines}
            rowKey={(l) => l.key}
            emptyMessage="—"
            columns={[
              { key: "name", header: "Servicio", value: (l) => l.name },
              { key: "price", header: "Precio", value: (l) => l.price },
            ]}
          />
          <Text style={textStyle("label")}>Total {presentOrderDraft(draft).total}</Text>
        </Card>
      ) : null}
      {canWrite && canReschedule(a.status) ? (
        <Reschedule
          key={version}
          loaded={data.data}
          timeZone={center.timezone}
          canOverride={canInActiveCenter(state, "agenda.manage")}
          onDone={reload}
        />
      ) : null}
    </Screen>
  );
}

function StatusCard({
  id,
  status,
  tone,
  label,
  onDone,
}: {
  id: string;
  status: AppointmentStatus;
  tone: Parameters<typeof Badge>[0]["tone"];
  label: string;
  onDone: () => void;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const actions = statusActions(status);

  const apply = async (to: AppointmentStatus) => {
    if (!client) return;
    const parsed = setStatusSchema.safeParse({ id, status: to, reason });
    if (!parsed.success) return setError(fieldErrors(parsed.error).reason ?? "Datos inválidos");
    setBusy(true);
    const result = await createAgendaRepository(client).setStatus(parsed.data);
    setBusy(false);
    if (!result.ok) return setError(result.error.message);
    toast({ message: agendaCopy.saved, tone: "success" });
    onDone();
  };

  return (
    <Card title={agendaCopy.actionsTitle}>
      <Badge label={label} tone={tone} />
      {actions.some((a) => a.needsReason) ? (
        <Field
          label={agendaCopy.reasonLabel}
          hint={agendaCopy.reasonHint}
          value={reason}
          onChangeText={setReason}
        />
      ) : null}
      {actions.map((a) => (
        <Button
          key={a.to}
          label={a.label}
          variant={a.destructive ? "danger" : "primary"}
          loading={busy}
          onPress={() => void apply(a.to)}
        />
      ))}
      <Notice tone="danger" text={error} />
    </Card>
  );
}

function Reschedule({
  loaded,
  timeZone,
  canOverride,
  onDone,
}: {
  loaded: Loaded;
  timeZone: string;
  canOverride: boolean;
  onDone: () => void;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const a = loaded.appointment;
  const start = utcToZoned(a.startsAt, timeZone);
  const [values, setValues] = useState<FormValues>({
    date: start.date,
    time: start.time,
    durationMinutes: String(a.durationMinutes),
    bayId: a.bayId ?? "",
    technicianId: a.technicianId ?? "",
    notes: a.notes ?? "",
    reason: "",
  });
  const [serviceIds, setServiceIds] = useState<string[]>(a.serviceIds);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const submit = async () => {
    if (!client) return;
    const parsed = rescheduleFormSchema.safeParse({ ...values, serviceIds });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const result = await createAgendaRepository(client).update(
      toUpdateAppointmentCommand(parsed.data, { id: a.id, timeZone }),
    );
    setBusy(false);
    if (!result.ok) {
      setConflict(result.error.code === "23P01");
      return setError(result.error.code === "23P01" ? agendaCopy.conflict : result.error.message);
    }
    toast({ message: agendaCopy.saved, tone: "success" });
    onDone();
  };

  return (
    <Card title={agendaCopy.rescheduleTitle}>
      <DateTimeFields values={values} errors={errors} set={set} />
      <ScheduleFields
        values={values}
        errors={errors}
        set={set}
        serviceIds={serviceIds}
        setServiceIds={setServiceIds}
        services={loaded.services}
        bays={loaded.bays}
        technicians={loaded.technicians}
      />
      <Field
        label={agendaCopy.reasonLabel}
        required
        value={values.reason ?? ""}
        onChangeText={(v) => set("reason", v)}
        error={errors.reason}
      />
      {conflict && canOverride ? (
        <Field
          label={agendaCopy.overrideLabel}
          hint={agendaCopy.overrideHint}
          value={values.overrideReason ?? ""}
          onChangeText={(v) => set("overrideReason", v)}
        />
      ) : null}
      <Notice tone="danger" text={error} />
      <Button
        label={agendaCopy.submitReschedule}
        variant="secondary"
        loading={busy}
        onPress={() => void submit()}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
});
