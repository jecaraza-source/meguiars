import {
  activeCenterAccess,
  canAddEvidence,
  canInActiveCenter,
  canRecordConsumption,
  consumptionRows,
  EVIDENCE_KIND_LABELS,
  EVIDENCE_KINDS,
  executionCopy,
  INCIDENT_KIND_LABELS,
  INCIDENT_KINDS,
  lineWorkActions,
  newRequestId,
  orderErrorMessage,
  ordersCopy,
  presentEvent,
  presentEvidence,
  presentIncident,
  presentLine,
  presentOrder,
  type ExecutionRepository,
  type OrderExecution,
  type Result,
  type ServiceOrder,
  type Technician,
  type ViewState,
} from "@meguiars/domain";
import {
  createAgendaRepository,
  createExecutionRepository,
  createServiceOrderRepository,
  type MeguiarsSupabaseClient,
} from "@meguiars/supabase";
import { colors, radius, space } from "@meguiars/ui-tokens";
import {
  consumptionFormSchema,
  fieldErrors,
  incidentFormSchema,
  removeEvidenceSchema,
  resolveIncidentSchema,
} from "@meguiars/validation";
import { useCallback, useEffect, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { capturePhoto, type PreparedPhoto } from "@/lib/photo";
import { Button, Checkbox, Field, LinkButton, Select } from "@/ui/controls";
import { Badge, Card, EmptyState, List, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

interface Loaded {
  order: ServiceOrder;
  execution: OrderExecution;
  technicians: Technician[];
}

async function fetchExecution(
  client: MeguiarsSupabaseClient,
  id: string,
  centerId: string,
): Promise<ViewState<Loaded>> {
  const [order, execution, technicians] = await Promise.all([
    createServiceOrderRepository(client).get(id),
    createExecutionRepository(client).get(id),
    createAgendaRepository(client).listTechnicians(centerId),
  ]);
  if (!order.ok || order.data.detailCenterId !== centerId)
    return { status: "permission_denied", message: ordersCopy.notFound };
  if (!execution.ok) return { status: "error", message: execution.error.message };
  return {
    status: "ready",
    data: {
      order: order.data,
      execution: execution.data,
      technicians: technicians.ok ? technicians.data : [],
    },
  };
}

/** Ejecuta una operación: éxito recarga; el error queda visible en la tarjeta. */
type Mutate = (run: () => Promise<Result<unknown>>, message?: string) => Promise<string | null>;

type Option = { value: string; label: string };

/** Ejecución, evidencias y consumos (equivale a /ordenes/[id]/ejecucion en web). */
export function OrderExecutionScreen({
  state,
  header,
  orderId,
  onBack,
}: PrivateScreenProps & { orderId: string; onBack: () => void }) {
  const { client } = useAuth();
  const toast = useToast();
  const center = activeCenterAccess(state)!.center;
  const [data, setData] = useState<ViewState<Loaded>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void fetchExecution(client, orderId, center.id).then((next) => {
      if (active) setData(next);
    });
    return () => {
      active = false;
    };
  }, [client, orderId, center.id, version]);

  const mutate: Mutate = async (run, message = executionCopy.saved) => {
    const result = await run();
    if (!result.ok) {
      return result.error.kind === "permission_denied"
        ? executionCopy.forbidden
        : orderErrorMessage(result.error);
    }
    toast({ message, tone: "success" });
    reload();
    return null;
  };

  const back = <LinkButton label={`← ${executionCopy.back}`} onPress={onBack} />;
  if (data.status !== "ready") {
    return (
      <Screen title={executionCopy.title} header={header}>
        {back}
        {data.status === "loading" ? <Skeleton lines={5} label="Cargando ejecución" /> : null}
        {data.status === "error" || data.status === "permission_denied" ? (
          <EmptyState title={data.message} />
        ) : null}
      </Screen>
    );
  }

  const { order, execution, technicians } = data.data;
  const view = presentOrder(order);
  const canWrite = canInActiveCenter(state, "orders.write");
  const repo = client ? createExecutionRepository(client) : null;
  const techName = (id: string) => technicians.find((t) => t.id === id)?.fullName ?? "—";
  const lineName = (id: string) => execution.lines.find((l) => l.id === id)?.serviceName ?? "—";
  const techOptions = technicians.filter((t) => t.active).map((t) => ({ value: t.id, label: t.fullName }));
  const lineOptions = execution.lines.map((l) => ({ value: l.id, label: l.serviceName }));
  const open = canWrite && canAddEvidence(order.status) && repo !== null;
  // key = versión de datos: cada tarjeta se vuelve a montar con lo vigente.
  const k = String(version);

  return (
    <Screen title={executionCopy.title} description={view.title} header={header}>
      {back}
      <Badge label={view.status} tone={view.tone} />
      {!canAddEvidence(order.status) ? <Notice text={executionCopy.closed} /> : null}

      {/* La foto va primero: es lo más usado en piso. */}
      <Card title={executionCopy.evidenceTitle}>
        {open ? (
          <EvidenceCapture key={`e-${k}`} order={order} lines={lineOptions} repo={repo} mutate={mutate} />
        ) : null}
        <EvidenceGallery
          key={`g-${k}`}
          rows={execution.evidence.map((e) => presentEvidence(e, lineName, center.timezone))}
          editable={open}
          repo={repo}
          mutate={mutate}
        />
      </Card>

      <Card
        title={executionCopy.linesTitle}
        subtitle={order.status === "en_proceso" ? undefined : executionCopy.needsInProgress}
      >
        {execution.lines.map((line) => (
          <LineCard
            key={`${line.id}-${k}`}
            line={line}
            view={presentLine(line, techName)}
            actions={canWrite ? lineWorkActions(line, order.status) : []}
            technicians={techOptions}
            repo={repo}
            mutate={mutate}
          />
        ))}
      </Card>

      <Card title={executionCopy.staffTitle}>
        {open ? (
          <StaffCard
            key={`s-${k}`}
            orderId={order.id}
            technicians={techOptions}
            staffIds={execution.staffIds}
            mainTechnicianId={order.technicianId}
            repo={repo}
            mutate={mutate}
          />
        ) : (
          <Text style={textStyle("bodySmall")}>{execution.staffIds.map(techName).join(", ") || "—"}</Text>
        )}
      </Card>

      <Card
        title={executionCopy.consumptionTitle}
        subtitle={canRecordConsumption(order.status) ? undefined : executionCopy.consumptionClosed}
      >
        <ConsumptionCard
          key={`c-${k}`}
          rows={consumptionRows(execution.lines, execution.consumptions)}
          editable={canWrite && canRecordConsumption(order.status) && repo !== null}
          repo={repo}
          mutate={mutate}
        />
      </Card>

      <Card title={executionCopy.incidentsTitle}>
        <IncidentsCard
          key={`i-${k}`}
          orderId={order.id}
          rows={execution.incidents.map((i) => presentIncident(i, lineName, center.timezone))}
          lines={lineOptions}
          editable={open}
          repo={repo}
          mutate={mutate}
        />
      </Card>

      <Card title={executionCopy.timelineTitle}>
        <List
          caption={executionCopy.timelineTitle}
          rows={[...execution.events]
            .reverse()
            .map((e) => presentEvent(e, { line: lineName, technician: techName }, center.timezone))}
          rowKey={(e) => e.key}
          emptyMessage="—"
          columns={[
            { key: "when", header: "Fecha", value: (e) => e.when },
            { key: "what", header: "Evento", value: (e) => e.what },
            { key: "note", header: "Nota", value: (e) => e.note },
          ]}
        />
      </Card>
    </Screen>
  );
}

interface SectionProps {
  repo: ExecutionRepository | null;
  mutate: Mutate;
}

function EvidenceCapture({
  order,
  lines,
  repo,
  mutate,
}: SectionProps & { order: ServiceOrder; lines: Option[] }) {
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [fileId, setFileId] = useState(newRequestId);
  const [kind, setKind] = useState<(typeof EVIDENCE_KINDS)[number]>("antes");
  const [itemId, setItemId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"capture" | "upload" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const take = async (source: "camera" | "library") => {
    setBusy("capture");
    setError(null);
    const result = await capturePhoto(source);
    setBusy(null);
    if (result.ok) {
      setPhoto(result.photo);
      setFileId(newRequestId());
    } else if (!result.canceled) setError(result.message);
  };

  const upload = async () => {
    if (!photo || !repo) return setError(executionCopy.photoRequired);
    setBusy("upload");
    // Mismo fileId en reintentos: la ruta se repite y el registro es idempotente.
    const message = await mutate(
      () =>
        repo.uploadEvidence({
          order,
          fileId,
          file: photo.data,
          contentType: "image/jpeg",
          sizeBytes: photo.sizeBytes,
          width: photo.width,
          height: photo.height,
          kind,
          itemId: itemId || undefined,
          note: note || undefined,
        }),
      executionCopy.uploaded,
    );
    setBusy(null);
    setError(message);
  };

  return (
    <View style={styles.stack}>
      <View style={styles.row}>
        <Button
          label={executionCopy.takePhoto}
          onPress={() => void take("camera")}
          loading={busy === "capture"}
        />
        <Button
          label={executionCopy.pickPhoto}
          variant="secondary"
          onPress={() => void take("library")}
          disabled={busy !== null}
        />
      </View>
      <Text style={textStyle("caption", "muted")}>{executionCopy.photoHint}</Text>
      {photo ? (
        <Image
          source={{ uri: photo.uri }}
          accessibilityLabel={executionCopy.photoFile}
          style={styles.preview}
          resizeMode="contain"
        />
      ) : null}
      <Select
        label={executionCopy.kind}
        options={EVIDENCE_KINDS.map((k) => ({ value: k, label: EVIDENCE_KIND_LABELS[k] }))}
        value={kind}
        onChange={(v) => setKind(v as typeof kind)}
      />
      <Select
        label={executionCopy.line}
        options={[{ value: "", label: executionCopy.wholeOrder }, ...lines]}
        value={itemId}
        onChange={setItemId}
      />
      <Field label={executionCopy.note} value={note} onChangeText={setNote} />
      <Notice text={error} tone="danger" />
      <Button
        label={busy === "upload" ? executionCopy.uploading : executionCopy.upload}
        onPress={() => void upload()}
        loading={busy === "upload"}
        disabled={!photo || busy === "capture"}
      />
    </View>
  );
}

function EvidenceGallery({
  rows,
  editable,
  repo,
  mutate,
}: SectionProps & { rows: ReturnType<typeof presentEvidence>[]; editable: boolean }) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (rows.length === 0)
    return <Text style={textStyle("bodySmall", "muted")}>{executionCopy.evidenceEmpty}</Text>;

  const remove = async (id: string) => {
    const parsed = removeEvidenceSchema.safeParse({ evidenceId: id, reason });
    if (!parsed.success) return setError(fieldErrors(parsed.error).reason ?? "Datos inválidos");
    if (!repo) return;
    setError(await mutate(() => repo.removeEvidence(parsed.data.evidenceId, parsed.data.reason)));
  };

  return (
    <View style={styles.grid}>
      {rows.map((e) => (
        <View key={e.id} style={styles.tile}>
          {e.url ? (
            <Pressable accessibilityRole="imagebutton" onPress={() => void Linking.openURL(e.url!)}>
              <Image source={{ uri: e.url }} accessibilityLabel={e.caption} style={styles.thumb} />
            </Pressable>
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]} />
          )}
          <Text style={textStyle("caption")}>{e.caption}</Text>
          <Text style={textStyle("caption", "muted")}>
            {e.when} · {e.size}
          </Text>
          {editable ? (
            removing === e.id ? (
              <>
                <Field label={executionCopy.removeReason} value={reason} onChangeText={setReason} />
                <Notice text={error} tone="danger" />
                <Button
                  label={executionCopy.removeEvidence}
                  variant="danger"
                  size="sm"
                  onPress={() => void remove(e.id)}
                />
              </>
            ) : (
              <Button
                label={executionCopy.removeEvidence}
                variant="secondary"
                size="sm"
                onPress={() => setRemoving(e.id)}
              />
            )
          ) : null}
        </View>
      ))}
    </View>
  );
}

function LineCard({
  line,
  view,
  actions,
  technicians,
  repo,
  mutate,
}: SectionProps & {
  line: OrderExecution["lines"][number];
  view: ReturnType<typeof presentLine>;
  actions: ReturnType<typeof lineWorkActions>;
  technicians: Option[];
}) {
  const [technicianId, setTechnicianId] = useState(line.technicianId ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = async (to: (typeof actions)[number]["to"]) => {
    if (!repo) return;
    setBusy(to);
    setError(
      await mutate(() =>
        repo.setItemWork({
          itemId: line.id,
          status: to,
          technicianId: technicianId || undefined,
          note: note || undefined,
        }),
      ),
    );
    setBusy(null);
  };

  return (
    <View style={styles.line}>
      <Text style={textStyle("label")}>{view.name}</Text>
      <View style={styles.row}>
        <Badge label={view.status} tone={view.tone} />
        <Text style={textStyle("bodySmall")}>
          {executionCopy.worked}: {view.worked}
        </Text>
      </View>
      <Text style={textStyle("bodySmall", "muted")}>
        {executionCopy.technician}: {view.technician}
      </Text>
      {actions.length > 0 ? (
        <>
          <Select
            label={executionCopy.technician}
            options={[{ value: "", label: executionCopy.noTechnician }, ...technicians]}
            value={technicianId}
            onChange={setTechnicianId}
          />
          <Field label={executionCopy.note} value={note} onChangeText={setNote} />
          <View style={styles.row}>
            {actions.map((a) => (
              <Button
                key={a.to}
                label={a.label}
                variant={a.primary ? "primary" : a.to === "terminada" ? "secondary" : "danger"}
                loading={busy === a.to}
                disabled={busy !== null}
                onPress={() => void apply(a.to)}
              />
            ))}
          </View>
          <Notice text={error} tone="danger" />
        </>
      ) : null}
    </View>
  );
}

function StaffCard({
  orderId,
  technicians,
  staffIds,
  mainTechnicianId,
  repo,
  mutate,
}: SectionProps & {
  orderId: string;
  technicians: Option[];
  staffIds: string[];
  mainTechnicianId: string | null;
}) {
  const [selected, setSelected] = useState<string[]>(() =>
    mainTechnicianId && !staffIds.includes(mainTechnicianId) ? [...staffIds, mainTechnicianId] : staffIds,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));
  const save = async () => {
    if (!repo) return;
    setBusy(true);
    setError(await mutate(() => repo.setStaff(orderId, selected)));
    setBusy(false);
  };
  return (
    <View style={styles.stack}>
      {technicians.map((t) => (
        <Checkbox
          key={t.value}
          label={t.value === mainTechnicianId ? `${t.label} (${executionCopy.mainTechnician})` : t.label}
          checked={selected.includes(t.value)}
          onChange={(on) => toggle(t.value, on)}
        />
      ))}
      <Notice text={error} tone="danger" />
      <Button
        label={executionCopy.saveStaff}
        variant="secondary"
        loading={busy}
        onPress={() => void save()}
      />
    </View>
  );
}

function ConsumptionCard({
  rows,
  editable,
  repo,
  mutate,
}: SectionProps & { rows: ReturnType<typeof consumptionRows>; editable: boolean }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.key, r.actualValue])),
  );
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  if (rows.length === 0)
    return <Text style={textStyle("bodySmall", "muted")}>{executionCopy.consumptionEmpty}</Text>;

  const record = async (r: (typeof rows)[number]) => {
    const parsed = consumptionFormSchema.safeParse({
      itemId: r.itemId,
      inventoryItemId: r.inventoryItemId,
      actualQuantity: values[r.key] ?? "",
    });
    if (!parsed.success) {
      const f = fieldErrors(parsed.error);
      return setErrors((e) => ({ ...e, [r.key]: f.actualQuantity ?? "Datos inválidos" }));
    }
    if (!repo) return;
    setBusy(r.key);
    const message = await mutate(() => repo.recordConsumption(parsed.data));
    setErrors((e) => ({ ...e, [r.key]: message }));
    setBusy(null);
  };

  return (
    <View style={styles.stack}>
      {rows.map((r) => (
        <View key={r.key} style={styles.line}>
          <Text style={textStyle("label")}>
            {r.supply} · {r.line}
          </Text>
          <Text style={textStyle("bodySmall")}>
            {executionCopy.standard}: {r.standard} · {executionCopy.actual}: {r.actual}
          </Text>
          <Text style={textStyle("bodySmall", r.over ? "danger" : "muted")}>
            {executionCopy.variance}: {r.variance}
          </Text>
          {editable ? (
            <>
              <Field
                label={`${executionCopy.actual} (${r.unit})`}
                keyboardType="decimal-pad"
                value={values[r.key] ?? ""}
                onChangeText={(v) => setValues((s) => ({ ...s, [r.key]: v }))}
                error={errors[r.key] ?? undefined}
              />
              <Button
                label={executionCopy.record}
                variant="secondary"
                size="sm"
                loading={busy === r.key}
                onPress={() => void record(r)}
              />
            </>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function IncidentsCard({
  orderId,
  rows,
  lines,
  editable,
  repo,
  mutate,
}: SectionProps & {
  orderId: string;
  rows: ReturnType<typeof presentIncident>[];
  lines: Option[];
  editable: boolean;
}) {
  const [kind, setKind] = useState<(typeof INCIDENT_KINDS)[number]>("incidencia");
  const [itemId, setItemId] = useState("");
  const [description, setDescription] = useState("");
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const report = async () => {
    const parsed = incidentFormSchema.safeParse({ orderId, kind, description, itemId });
    if (!parsed.success) return setError(Object.values(fieldErrors(parsed.error))[0] ?? "Datos inválidos");
    if (!repo) return;
    setBusy(true);
    setError(await mutate(() => repo.reportIncident(parsed.data)));
    setBusy(false);
  };
  const resolve = async (incidentId: string) => {
    const parsed = resolveIncidentSchema.safeParse({ incidentId, resolution: resolutions[incidentId] ?? "" });
    if (!parsed.success) return setError(fieldErrors(parsed.error).resolution ?? "Datos inválidos");
    if (!repo) return;
    setError(await mutate(() => repo.resolveIncident(parsed.data.incidentId, parsed.data.resolution)));
  };

  return (
    <View style={styles.stack}>
      {rows.length === 0 ? (
        <Text style={textStyle("bodySmall", "muted")}>{executionCopy.incidentsEmpty}</Text>
      ) : null}
      {rows.map((i) => (
        <View key={i.id} style={styles.line}>
          <View style={styles.row}>
            <Text style={textStyle("label")}>{i.title}</Text>
            <Badge label={i.status} tone={i.tone} />
          </View>
          <Text style={textStyle("bodySmall")}>{i.description}</Text>
          <Text style={textStyle("caption", "muted")}>{i.when}</Text>
          {i.resolution ? (
            <Text style={textStyle("bodySmall")}>
              {executionCopy.resolution}: {i.resolution}
            </Text>
          ) : null}
          {editable && i.open ? (
            <>
              <Field
                label={executionCopy.resolution}
                value={resolutions[i.id] ?? ""}
                onChangeText={(v) => setResolutions((s) => ({ ...s, [i.id]: v }))}
              />
              <Button
                label={executionCopy.resolve}
                variant="secondary"
                size="sm"
                onPress={() => void resolve(i.id)}
              />
            </>
          ) : null}
        </View>
      ))}
      {editable ? (
        <>
          <Select
            label="Tipo"
            options={INCIDENT_KINDS.map((k) => ({ value: k, label: INCIDENT_KIND_LABELS[k] }))}
            value={kind}
            onChange={(v) => setKind(v as typeof kind)}
          />
          <Select
            label={executionCopy.line}
            options={[{ value: "", label: executionCopy.wholeOrder }, ...lines]}
            value={itemId}
            onChange={setItemId}
          />
          <Field
            label={executionCopy.incidentDescription}
            value={description}
            onChangeText={setDescription}
            multiline
          />
          <Button
            label={executionCopy.report}
            variant="danger"
            loading={busy}
            onPress={() => void report()}
          />
        </>
      ) : null}
      <Notice text={error} tone="danger" />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm },
  line: {
    gap: space.xs,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  preview: { width: "100%", height: 200, borderRadius: radius.md, backgroundColor: colors.surface },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm },
  tile: { width: "47%", gap: space.xxs },
  thumb: { width: "100%", aspectRatio: 1, borderRadius: radius.md, backgroundColor: colors.surface },
  thumbEmpty: { borderWidth: 1, borderStyle: "dashed", borderColor: colors.border },
});
