import {
  activeCenterAccess,
  can,
  canInActiveCenter,
  clientErrorMessage,
  clientsCopy,
  crmCopy,
  isPossibleDuplicate,
  newRequestId,
  presentClientDetail,
  presentHistoryEntry,
  vehicleLabel,
  type ClientDetail,
  type ClientHistoryEntry,
  type MarketingChannel,
  type ViewState,
} from "@meguiars/domain";
import { createClientRepository, type MeguiarsSupabaseClient } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { addVehicleSchema, fieldErrors, updateClientSchema, updateVehicleSchema } from "@meguiars/validation";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import {
  ClientFields,
  ConsentFields,
  VehicleFields,
  type FieldErrors,
  type FormValues,
} from "@/components/ClientFields";
import { Button, Field, LinkButton, Select } from "@/ui/controls";
import { Badge, Card, EmptyState, KpiCard, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

interface Loaded {
  detail: ClientDetail;
  history: ClientHistoryEntry[] | string;
}

async function fetchClient(client: MeguiarsSupabaseClient, clientId: string): Promise<ViewState<Loaded>> {
  const repo = createClientRepository(client);
  const [detail, history] = await Promise.all([repo.get(clientId), repo.history(clientId)]);
  if (!detail.ok) {
    return detail.error.kind === "not_found" || detail.error.kind === "permission_denied"
      ? { status: "permission_denied", message: clientsCopy.notFound }
      : { status: "error", message: clientErrorMessage(detail.error) };
  }
  return {
    status: "ready",
    data: { detail: detail.data, history: history.ok ? history.data : clientErrorMessage(history.error) },
  };
}

export function ClientDetailScreen({
  state,
  header,
  clientId,
  onBack,
  onCrm,
}: PrivateScreenProps & { clientId: string; onBack: () => void; onCrm?: (id: string) => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [data, setData] = useState<ViewState<Loaded>>({ status: "loading" });

  // `version` vuelve a cargar tras una edición.
  const [version, setVersion] = useState(0);
  const load = useCallback(async () => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void fetchClient(client, clientId).then((next) => {
      if (active) setData(next);
    });
    return () => {
      active = false;
    };
  }, [client, clientId, version]);

  const back = <LinkButton label={`← ${clientsCopy.title}`} onPress={onBack} />;
  if (data.status !== "ready") {
    return (
      <Screen title={clientsCopy.detailTitle} header={header}>
        {back}
        {data.status === "loading" ? <Skeleton lines={4} label="Cargando expediente" /> : null}
        {data.status === "error" || data.status === "permission_denied" ? (
          <EmptyState title={data.message} />
        ) : null}
      </Screen>
    );
  }

  const { detail, history } = data.data;
  const view = presentClientDetail(detail, state.access, center.timezone);
  const canWrite = canInActiveCenter(state, "clients.write");

  return (
    <Screen title={view.title} description={view.subtitle} header={header}>
      {back}
      <View style={styles.kpis}>
        <KpiCard label={clientsCopy.homeCenterLabel} value={view.homeCenter} />
        <KpiCard
          label={clientsCopy.lastVisitLabel}
          value={view.lastVisit}
          {...(view.lastVisitCenter ? { caption: view.lastVisitCenter } : {})}
        />
        <KpiCard label={clientsCopy.vehiclesTitle} value={String(view.vehiclesCount)} caption="activos" />
        <KpiCard label="Promociones" value={view.consent} caption={view.centers} />
      </View>
      {onCrm && canInActiveCenter(state, "crm.read") ? (
        <LinkButton label={crmCopy.openProfile} onPress={() => onCrm(clientId)} />
      ) : null}
      <Card title={clientsCopy.vehiclesTitle}>
        <List
          caption={clientsCopy.vehiclesTitle}
          rows={detail.vehicles}
          rowKey={(v) => v.id}
          emptyMessage={clientsCopy.noVehicles}
          columns={[
            { key: "vehicle", header: "Vehículo", value: (v) => vehicleLabel(v) },
            { key: "identifier", header: "Identificador", value: (v) => v.identifier ?? "—" },
            {
              key: "status",
              header: "Estado",
              value: (v) => (v.active ? "Activo" : clientsCopy.vehicleInactive),
            },
          ]}
        />
      </Card>
      {canWrite ? <AddVehicle clientId={detail.id} centerId={center.id} onDone={load} /> : null}
      {canWrite ? <DeactivateVehicle detail={detail} onDone={load} /> : null}
      <Card title={clientsCopy.historyTitle} subtitle={clientsCopy.historyNote}>
        {typeof history === "string" ? <Notice tone="danger" text={history} /> : null}
        {Array.isArray(history) && history.length === 0 ? (
          <EmptyState title={clientsCopy.historyEmpty} />
        ) : null}
        {Array.isArray(history)
          ? history.map((entry) => {
              const e = presentHistoryEntry(entry, center.timezone);
              return (
                <View key={e.key} style={styles.entry}>
                  <View style={styles.entryHead}>
                    <Badge label={e.kind} />
                    <Text style={textStyle("caption", "muted")}>
                      {e.date} · {e.center}
                    </Text>
                  </View>
                  <Text style={textStyle("bodySmall")}>{e.title}</Text>
                </View>
              );
            })
          : null}
      </Card>
      {canWrite ? <EditClient detail={detail} state={state} onDone={load} /> : null}
    </Screen>
  );
}

function AddVehicle({
  clientId,
  centerId,
  onDone,
}: {
  clientId: string;
  centerId: string;
  onDone: () => Promise<void>;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const [requestId, setRequestId] = useState(newRequestId);
  const [values, setValues] = useState<FormValues>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const submit = async () => {
    if (!client) return;
    const parsed = addVehicleSchema.safeParse({
      ...values,
      notes: values.vehicleNotes,
      clientId,
      detailCenterId: centerId,
      requestId,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const result = await createClientRepository(client).addVehicle(parsed.data);
    setBusy(false);
    if (!result.ok) return setError(clientErrorMessage(result.error));
    setError(null);
    setValues({});
    setRequestId(newRequestId());
    toast({ message: clientsCopy.vehicleAdded, tone: "success" });
    await onDone();
  };

  return (
    <Card title={clientsCopy.addVehicle}>
      <VehicleFields values={values} errors={errors} set={set} />
      <Notice tone="danger" text={error} />
      <Button
        label={clientsCopy.addVehicle}
        variant="secondary"
        loading={busy}
        onPress={() => void submit()}
      />
    </Card>
  );
}

function DeactivateVehicle({ detail, onDone }: { detail: ClientDetail; onDone: () => Promise<void> }) {
  const { client } = useAuth();
  const toast = useToast();
  const active = detail.vehicles.filter((v) => v.active);
  const [vehicleId, setVehicleId] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (active.length === 0) return null;

  const submit = async () => {
    if (!client) return;
    const vehicle = active.find((v) => v.id === vehicleId);
    if (!vehicle) return setErrors({ vehicleId: "Elige un vehículo" });
    const parsed = updateVehicleSchema.safeParse({
      ...vehicle,
      identifier: vehicle.identifier ?? undefined,
      notes: vehicle.notes ?? undefined,
      active: false,
      reason,
    });
    if (!parsed.success) return setErrors({ reason: fieldErrors(parsed.error).reason });
    setErrors({});
    setBusy(true);
    const result = await createClientRepository(client).updateVehicle(parsed.data);
    setBusy(false);
    if (!result.ok) return setError(clientErrorMessage(result.error));
    setReason("");
    setVehicleId("");
    toast({ message: clientsCopy.vehicleUpdated, tone: "success" });
    await onDone();
  };

  return (
    <Card title={clientsCopy.deactivateVehicle}>
      <Select
        label="Vehículo"
        placeholder="Elige un vehículo"
        options={active.map((v) => ({ value: v.id, label: vehicleLabel(v) }))}
        value={vehicleId}
        onChange={setVehicleId}
        error={errors.vehicleId}
      />
      <Field
        label={clientsCopy.reasonLabel}
        required
        value={reason}
        onChangeText={setReason}
        error={errors.reason}
      />
      <Notice tone="danger" text={error} />
      <Button
        label={clientsCopy.deactivateVehicle}
        variant="secondary"
        loading={busy}
        onPress={() => void submit()}
      />
    </Card>
  );
}

function EditClient({
  detail,
  state,
  onDone,
}: {
  detail: ClientDetail;
  state: PrivateScreenProps["state"];
  onDone: () => Promise<void>;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const [values, setValues] = useState<FormValues>({
    fullName: detail.fullName,
    kind: detail.kind,
    phone: detail.phone,
    email: detail.email ?? "",
    notes: detail.notes ?? "",
    homeDetailCenterId: detail.homeDetailCenterId,
    reason: "",
  });
  const [channels, setChannels] = useState<MarketingChannel[]>(detail.marketing.channels);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  // Centro habitual: centros de la organización donde el usuario puede registrar clientes (igual que la web).
  const centers = state.access
    .filter((a) => a.center.active && a.center.organizationId === detail.organizationId)
    .filter((a) => can([...a.roles, ...a.corporateRoles], "clients.write"))
    .map((a) => ({ value: a.center.id, label: a.center.name }));
  if (!centers.some((c) => c.value === detail.homeDetailCenterId)) {
    centers.unshift({
      value: detail.homeDetailCenterId,
      label: presentClientDetail(detail, state.access, "UTC").homeCenter,
    });
  }

  const submit = async () => {
    if (!client) return;
    const parsed = updateClientSchema.safeParse({
      ...values,
      id: detail.id,
      marketingChannels: channels,
      source: "mobile",
      confirmDuplicate: confirm,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const result = await createClientRepository(client).update(parsed.data);
    setBusy(false);
    if (!result.ok) {
      if (isPossibleDuplicate(result.error)) {
        setConfirm(true);
        return setError(clientsCopy.editDuplicateConfirm);
      }
      return setError(clientErrorMessage(result.error));
    }
    setError(null);
    setConfirm(false);
    set("reason", "");
    toast({ message: clientsCopy.saved, tone: "success" });
    await onDone();
  };

  return (
    <Card title={clientsCopy.editTitle} subtitle={clientsCopy.editSubtitle}>
      <ClientFields values={values} errors={errors} set={set} />
      <Select
        label={clientsCopy.homeCenterLabel}
        options={centers}
        value={values.homeDetailCenterId ?? ""}
        onChange={(v) => set("homeDetailCenterId", v)}
        error={errors.homeDetailCenterId}
      />
      <ConsentFields channels={channels} onChange={setChannels} />
      <Field
        label={clientsCopy.reasonLabel}
        required
        value={values.reason ?? ""}
        onChangeText={(v) => set("reason", v)}
        error={errors.reason}
      />
      <Notice tone={confirm ? "warning" : "danger"} text={error} />
      <Button label={clientsCopy.submitUpdate} loading={busy} onPress={() => void submit()} />
    </Card>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  entry: { gap: space.xxs, paddingVertical: space.xs },
  entryHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
