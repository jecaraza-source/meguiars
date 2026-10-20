import {
  activeCenterAccess,
  agendaCopy,
  canInActiveCenter,
  canReschedule,
  clientErrorMessage,
  clientsCopy,
  newRequestId,
  orderErrorMessage,
  ordersCopy,
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
  type Vehicle,
  type ViewState,
} from "@meguiars/domain";
import {
  createAgendaRepository,
  createCatalogRepository,
  createClientRepository,
  createServiceOrderRepository,
  type MeguiarsSupabaseClient,
} from "@meguiars/supabase";
import { colors, radius, space } from "@meguiars/ui-tokens";
import {
  fieldErrors,
  fromAppointmentFormSchema,
  updateVehicleSchema,
  rescheduleFormSchema,
  setStatusSchema,
  toUpdateAppointmentCommand,
} from "@meguiars/validation";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { DateTimeFields, ScheduleFields } from "@/components/AgendaFields";
import type { FieldErrors, FormValues } from "@/components/ClientFields";
import { ChannelFields } from "@/components/OrderFields";
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
  onOpenOrder,
}: PrivateScreenProps & { appointmentId: string; onBack: () => void; onOpenOrder: (id: string) => void }) {
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
      {a.serviceOrderId && canInActiveCenter(state, "orders.read") ? (
        <Card title={ordersCopy.title}>
          <Button label={ordersCopy.viewOrder} onPress={() => onOpenOrder(a.serviceOrderId!)} />
        </Card>
      ) : !a.serviceOrderId &&
        (a.status === "programada" || a.status === "recibida" || a.status === "en_servicio") &&
        canInActiveCenter(state, "orders.write") ? (
        <>
          {view.missingPlate ? (
            <CapturePlateCard clientId={a.clientId} vehicleId={a.vehicleId} onDone={reload} />
          ) : null}
          <OpenOrderCard
            appointmentId={a.id}
            label={a.status === "programada" ? ordersCopy.receiveAndOpen : ordersCopy.fromAppointment}
            onOpenOrder={onOpenOrder}
          />
        </>
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

/**
 * El auto llegó sin placa (p. ej. cita de WhatsApp): se captura aquí mismo.
 * Marca, modelo y año ya vienen del alta; sólo se pide lo que falta (sombreado).
 */
function CapturePlateCard({
  clientId,
  vehicleId,
  onDone,
}: {
  clientId: string;
  vehicleId: string;
  onDone: () => void;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [plate, setPlate] = useState("");
  const [reason, setReason] = useState("Captura de placa");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!client) return;
    let alive = true;
    void createClientRepository(client)
      .get(clientId)
      .then((r) => {
        if (alive && r.ok) setVehicle(r.data.vehicles.find((v) => v.id === vehicleId) ?? null);
      });
    return () => {
      alive = false;
    };
  }, [client, clientId, vehicleId]);

  const submit = async () => {
    if (!client || !vehicle) return;
    const parsed = updateVehicleSchema.safeParse({
      ...vehicle,
      identifier: vehicle.identifier ?? undefined,
      notes: vehicle.notes ?? undefined,
      plate,
      active: true,
      reason,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const result = await createClientRepository(client).updateVehicle(parsed.data);
    setBusy(false);
    if (!result.ok) return setError(clientErrorMessage(result.error));
    toast({ message: clientsCopy.vehicleUpdated, tone: "success" });
    onDone();
  };

  return (
    <Card title="Falta la placa" subtitle={agendaCopy.noPlateHint}>
      {vehicle ? (
        <Text style={textStyle("bodySmall")}>
          {vehicle.make} {vehicle.model} {vehicle.year}
        </Text>
      ) : null}
      <View style={styles.missing}>
        <Field
          label={clientsCopy.plateLabel}
          hint="Falta: captúrala para poder abrir la OS."
          required
          autoCapitalize="characters"
          value={plate}
          onChangeText={setPlate}
          error={errors.plate}
        />
      </View>
      <Field
        label={clientsCopy.reasonLabel}
        required
        value={reason}
        onChangeText={setReason}
        error={errors.reason}
      />
      <Notice tone="danger" text={error} />
      <Button label="Guardar placa" loading={busy} onPress={() => void submit()} />
    </Card>
  );
}

/** Abrir la OS desde la cita; si sigue programada, la recibe en el mismo paso (igual que la web). */
function OpenOrderCard({
  appointmentId,
  label,
  onOpenOrder,
}: {
  appointmentId: string;
  label: string;
  onOpenOrder: (id: string) => void;
}) {
  const { client } = useAuth();
  const [requestId] = useState(newRequestId);
  const [values, setValues] = useState<FormValues>({ channel: "b2c" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const submit = async () => {
    if (!client) return;
    const parsed = fromAppointmentFormSchema.safeParse(values);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const result = await createServiceOrderRepository(client).createFromAppointment({
      ...parsed.data,
      appointmentId,
      requestId,
    });
    setBusy(false);
    if (!result.ok) return setError(orderErrorMessage(result.error));
    onOpenOrder(result.data.id);
  };

  return (
    <Card title={label} subtitle={agendaCopy.draftSubtitle}>
      <ChannelFields values={values} errors={errors} set={set} />
      <Field
        label={ordersCopy.odometerLabel}
        keyboardType="number-pad"
        value={values.odometerKm ?? ""}
        onChangeText={(v) => set("odometerKm", v)}
        error={errors.odometerKm}
      />
      <Notice tone="danger" text={error} />
      <Button label={label} loading={busy} onPress={() => void submit()} />
    </Card>
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
  // Lo que falta capturar, sombreado (mismo tono de advertencia que en la web).
  missing: {
    backgroundColor: colors.warningSurface,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.sm,
  },
});
