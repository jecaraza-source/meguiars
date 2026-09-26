"use client";

import {
  EVIDENCE_KIND_LABELS,
  EVIDENCE_KINDS,
  EVIDENCE_MIME_TYPES,
  executionCopy,
  INCIDENT_KIND_LABELS,
  INCIDENT_KINDS,
  type ItemWorkStatus,
  type StatusTone,
} from "@meguiars/domain";
import { startTransition, useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  recordConsumptionAction,
  removeEvidenceAction,
  reportIncidentAction,
  resolveIncidentAction,
  setItemWorkAction,
  setStaffAction,
  uploadEvidenceAction,
  type ExecutionFormState,
} from "@/app/actions/execution";
import { preparePhoto, type PreparedPhoto } from "@/lib/photo";
import { Button } from "./ui/button";
import { Badge } from "./ui/display";
import { Checkbox, Input, Select } from "./ui/field";
import { useToast } from "./ui/overlay";

function Submit({
  label,
  variant,
  name,
  value,
}: {
  label: string;
  variant?: "primary" | "secondary" | "danger";
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return <Button type="submit" label={label} loading={pending} variant={variant} name={name} value={value} />;
}

function Alert({ text }: { text?: string | undefined }) {
  if (!text) return null;
  return (
    <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
      {text}
    </p>
  );
}

const valueOf = (state: ExecutionFormState, key: string, fallback = "") => {
  const v = state.values?.[key];
  return typeof v === "string" ? v : fallback;
};

function useSuccessToast(state: ExecutionFormState) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

type Option = { value: string; label: string };

// ---------------------------------------------------------------------------
// Líneas
// ---------------------------------------------------------------------------

export interface LineRow {
  id: string;
  name: string;
  status: string;
  tone: StatusTone;
  worked: string;
  technician: string;
  technicianId: string | null;
  actions: { to: Exclude<ItemWorkStatus, "pendiente">; label: string; primary: boolean }[];
}

/** Avance por línea: iniciar/pausar/terminar con técnico y nota opcional. */
export function LineWork({
  orderId,
  lines,
  technicians,
}: {
  orderId: string;
  lines: LineRow[];
  technicians: Option[];
}) {
  const [state, action] = useActionState(setItemWorkAction, {});
  useSuccessToast(state);
  const sent = (id: string) => valueOf(state, "itemId") === id;
  return (
    <div className="flex flex-col gap-sm" key={state.at ?? 0}>
      <ul aria-label={executionCopy.linesTitle} className="flex flex-col gap-sm">
        {lines.map((l) => (
          <li key={l.id} className="mg-card flex flex-col gap-sm">
            <div className="flex flex-wrap items-center justify-between gap-sm text-sm">
              <span className="font-semibold">{l.name}</span>
              <span className="flex items-center gap-sm">
                <Badge label={l.status} tone={l.tone} />
                <span>
                  {executionCopy.worked}: {l.worked}
                </span>
              </span>
            </div>
            <p className="text-sm text-muted">
              {executionCopy.technician}: {l.technician}
            </p>
            {l.actions.length > 0 ? (
              <form action={action} className="flex flex-wrap items-end gap-sm" noValidate>
                <input type="hidden" name="orderId" value={orderId} />
                <input type="hidden" name="itemId" value={l.id} />
                <div className="flex-1">
                  <Select
                    name="technicianId"
                    id={`tech-${l.id}`}
                    label={executionCopy.technician}
                    options={[{ value: "", label: executionCopy.noTechnician }, ...technicians]}
                    defaultValue={sent(l.id) ? valueOf(state, "technicianId") : (l.technicianId ?? "")}
                  />
                </div>
                <div className="flex-1">
                  <Input
                    name="note"
                    id={`note-${l.id}`}
                    label={executionCopy.note}
                    defaultValue={sent(l.id) ? valueOf(state, "note") : ""}
                    error={sent(l.id) ? state.fields?.note : undefined}
                  />
                </div>
                {l.actions.map((a) => (
                  <Submit
                    key={a.to}
                    label={a.label}
                    name="status"
                    value={a.to}
                    variant={a.primary ? "primary" : a.to === "terminada" ? "secondary" : "danger"}
                  />
                ))}
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      <Alert text={state.error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Técnicos participantes
// ---------------------------------------------------------------------------

export function StaffForm({
  orderId,
  technicians,
  staffIds,
  mainTechnicianId,
}: {
  orderId: string;
  technicians: Option[];
  staffIds: string[];
  mainTechnicianId: string | null;
}) {
  const [state, action] = useActionState(setStaffAction, {});
  useSuccessToast(state);
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-sm" noValidate>
      <input type="hidden" name="orderId" value={orderId} />
      <fieldset className="grid gap-xs md:grid-cols-2">
        <legend className="sr-only">{executionCopy.staffTitle}</legend>
        {technicians.map((t) => (
          <Checkbox
            key={t.value}
            name="technicianIds"
            value={t.value}
            label={t.value === mainTechnicianId ? `${t.label} (${executionCopy.mainTechnician})` : t.label}
            checked={staffIds.includes(t.value) || t.value === mainTechnicianId}
          />
        ))}
      </fieldset>
      <Alert text={state.error} />
      <div>
        <Submit label={executionCopy.saveStaff} variant="secondary" />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Evidencias
// ---------------------------------------------------------------------------

const kindOptions = EVIDENCE_KINDS.map((k) => ({ value: k, label: EVIDENCE_KIND_LABELS[k] }));

/**
 * Subida de foto: el navegador la redimensiona y comprime (≤ 1600 px, JPEG)
 * y la acción del servidor la sube a Storage con la sesión del usuario.
 * En teléfonos, `capture` abre la cámara trasera directamente.
 */
export function EvidenceUpload({ orderId, lines }: { orderId: string; lines: Option[] }) {
  const [state, action, pending] = useActionState(uploadEvidenceAction, {});
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [fileId, setFileId] = useState(() => crypto.randomUUID());
  useSuccessToast(state);

  // Tras subir con éxito se limpia la captura y se genera un id nuevo.
  const [handled, setHandled] = useState(state.at);
  if (state.at !== handled) {
    setHandled(state.at);
    if (state.message) {
      setPhoto(null);
      setPreview(null);
      setFileId(crypto.randomUUID());
    }
  }
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreparing(true);
    const prepared = await preparePhoto(file);
    setPhoto(prepared);
    setPreview(URL.createObjectURL(prepared.file));
    setPreparing(false);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    data.delete("source");
    if (photo) {
      data.set("photo", photo.file);
      if (photo.width) data.set("width", String(photo.width));
      if (photo.height) data.set("height", String(photo.height));
    }
    startTransition(() => action(data));
  }

  const f = state.fields ?? {};
  return (
    <form key={state.message ? state.at : 0} onSubmit={onSubmit} className="flex flex-col gap-md" noValidate>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="fileId" value={fileId} />
      <Input
        name="source"
        type="file"
        label={executionCopy.photoFile}
        hint={executionCopy.photoHint}
        accept={EVIDENCE_MIME_TYPES.join(",")}
        capture="environment"
        onChange={onFile}
        error={f.photo}
      />
      {preparing ? (
        <p role="status" className="text-sm text-muted">
          {executionCopy.resizing}
        </p>
      ) : null}
      {preview && photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
        <img
          src={preview}
          alt={executionCopy.photoFile}
          className="w-full max-w-(--mg-layout-narrow) self-start rounded-md border border-border"
        />
      ) : null}
      <div className="grid gap-md md:grid-cols-3">
        <Select
          name="kind"
          label={executionCopy.kind}
          options={kindOptions}
          defaultValue={valueOf(state, "kind", "antes")}
          error={f.kind}
        />
        <Select
          name="itemId"
          label={executionCopy.line}
          options={[{ value: "", label: executionCopy.wholeOrder }, ...lines]}
          defaultValue={valueOf(state, "itemId")}
        />
        <Input
          name="note"
          id="evidence-note"
          label={executionCopy.note}
          defaultValue={valueOf(state, "note")}
        />
      </div>
      <Alert text={state.error} />
      <div>
        <Button
          type="submit"
          label={pending ? executionCopy.uploading : executionCopy.upload}
          loading={pending || preparing}
          disabled={!photo}
        />
      </div>
    </form>
  );
}

export interface EvidenceView {
  id: string;
  url: string | null;
  caption: string;
  when: string;
  size: string;
}

export function EvidenceGallery({
  orderId,
  items,
  editable,
}: {
  orderId: string;
  items: EvidenceView[];
  editable: boolean;
}) {
  const [state, action] = useActionState(removeEvidenceAction, {});
  useSuccessToast(state);
  const [removing, setRemoving] = useState<string | null>(null);
  if (items.length === 0) return <p className="text-sm text-muted">{executionCopy.evidenceEmpty}</p>;
  return (
    <div className="flex flex-col gap-sm" key={state.at ?? 0}>
      <ul aria-label={executionCopy.evidenceTitle} className="grid grid-cols-2 gap-sm md:grid-cols-4">
        {items.map((e) => (
          <li key={e.id} className="flex flex-col gap-xs">
            {e.url ? (
              <a href={e.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de corta duración */}
                <img
                  src={e.url}
                  alt={e.caption}
                  loading="lazy"
                  className="aspect-square w-full rounded-md border border-border object-cover"
                />
              </a>
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-md border border-dashed border-border text-xs text-muted">
                —
              </div>
            )}
            <span className="text-xs">{e.caption}</span>
            <span className="text-xs text-muted">
              {e.when} · {e.size}
            </span>
            {editable ? (
              removing === e.id ? (
                <form action={action} className="flex flex-col gap-xs" noValidate>
                  <input type="hidden" name="orderId" value={orderId} />
                  <input type="hidden" name="evidenceId" value={e.id} />
                  <Input
                    name="reason"
                    id={`remove-${e.id}`}
                    label={executionCopy.removeReason}
                    required
                    defaultValue={valueOf(state, "reason")}
                    error={state.fields?.reason}
                  />
                  <Submit label={executionCopy.removeEvidence} variant="danger" />
                </form>
              ) : (
                <Button
                  label={executionCopy.removeEvidence}
                  variant="secondary"
                  size="sm"
                  onClick={() => setRemoving(e.id)}
                />
              )
            ) : null}
          </li>
        ))}
      </ul>
      <Alert text={state.error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Consumos
// ---------------------------------------------------------------------------

export interface ConsumptionView {
  key: string;
  itemId: string;
  inventoryItemId: string;
  line: string;
  supply: string;
  unit: string;
  standard: string;
  actual: string;
  actualValue: string;
  variance: string;
  over: boolean;
}

export function ConsumptionTable({
  orderId,
  rows,
  editable,
}: {
  orderId: string;
  rows: ConsumptionView[];
  editable: boolean;
}) {
  const [state, action] = useActionState(recordConsumptionAction, {});
  useSuccessToast(state);
  if (rows.length === 0) return <p className="text-sm text-muted">{executionCopy.consumptionEmpty}</p>;
  const sent = (r: ConsumptionView) =>
    valueOf(state, "itemId") === r.itemId && valueOf(state, "inventoryItemId") === r.inventoryItemId;
  return (
    <div className="flex flex-col gap-sm" key={state.at ?? 0}>
      <ul aria-label={executionCopy.consumptionTitle} className="flex flex-col gap-sm">
        {rows.map((r) => (
          <li key={r.key} className="mg-card flex flex-col gap-xs text-sm">
            <div className="flex flex-wrap justify-between gap-sm">
              <span className="font-semibold">
                {r.supply} · {r.line}
              </span>
              <span>
                {executionCopy.standard}: {r.standard} · {executionCopy.actual}: {r.actual}
              </span>
            </div>
            <span className="mg-tone self-start rounded-md px-xs" data-tone={r.over ? "danger" : "neutral"}>
              {executionCopy.variance}: {r.variance}
            </span>
            {editable ? (
              <form action={action} className="flex flex-wrap items-end gap-sm" noValidate>
                <input type="hidden" name="orderId" value={orderId} />
                <input type="hidden" name="itemId" value={r.itemId} />
                <input type="hidden" name="inventoryItemId" value={r.inventoryItemId} />
                <div className="flex-none">
                  <Input
                    name="actualQuantity"
                    id={`actual-${r.key}`}
                    label={`${executionCopy.actual} (${r.unit})`}
                    inputMode="decimal"
                    defaultValue={sent(r) ? valueOf(state, "actualQuantity") : r.actualValue}
                    error={sent(r) ? state.fields?.actualQuantity : undefined}
                  />
                </div>
                <div className="flex-1">
                  <Input
                    name="note"
                    id={`cnote-${r.key}`}
                    label={executionCopy.note}
                    defaultValue={sent(r) ? valueOf(state, "note") : ""}
                  />
                </div>
                <Submit label={executionCopy.record} variant="secondary" />
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      <Alert text={state.error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Incidencias y retrabajos
// ---------------------------------------------------------------------------

export interface IncidentView {
  id: string;
  title: string;
  description: string;
  status: string;
  tone: "danger" | "success";
  resolution: string | null;
  when: string;
  open: boolean;
}

export function Incidents({
  orderId,
  incidents,
  lines,
  editable,
}: {
  orderId: string;
  incidents: IncidentView[];
  lines: Option[];
  editable: boolean;
}) {
  const [state, action] = useActionState(reportIncidentAction, {});
  const [resolveState, resolveAction] = useActionState(resolveIncidentAction, {});
  useSuccessToast(state);
  useSuccessToast(resolveState);
  const f = state.fields ?? {};
  return (
    <div className="flex flex-col gap-md">
      {incidents.length === 0 ? <p className="text-sm text-muted">{executionCopy.incidentsEmpty}</p> : null}
      <ul
        aria-label={executionCopy.incidentsTitle}
        className="flex flex-col gap-sm"
        key={resolveState.at ?? 0}
      >
        {incidents.map((i) => (
          <li key={i.id} className="mg-card flex flex-col gap-xs text-sm">
            <div className="flex flex-wrap items-center justify-between gap-sm">
              <span className="font-semibold">{i.title}</span>
              <Badge label={i.status} tone={i.tone} />
            </div>
            <p>{i.description}</p>
            <p className="text-xs text-muted">{i.when}</p>
            {i.resolution ? (
              <p>
                {executionCopy.resolution}: {i.resolution}
              </p>
            ) : null}
            {editable && i.open ? (
              <form action={resolveAction} className="flex flex-wrap items-end gap-sm" noValidate>
                <input type="hidden" name="orderId" value={orderId} />
                <input type="hidden" name="incidentId" value={i.id} />
                <div className="flex-1">
                  <Input
                    name="resolution"
                    id={`resolution-${i.id}`}
                    label={executionCopy.resolution}
                    defaultValue={
                      valueOf(resolveState, "incidentId") === i.id ? valueOf(resolveState, "resolution") : ""
                    }
                    error={
                      valueOf(resolveState, "incidentId") === i.id
                        ? resolveState.fields?.resolution
                        : undefined
                    }
                  />
                </div>
                <Submit label={executionCopy.resolve} variant="secondary" />
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      <Alert text={resolveState.error} />
      {editable ? (
        <form key={state.at ?? 0} action={action} className="flex flex-col gap-sm" noValidate>
          <input type="hidden" name="orderId" value={orderId} />
          <div className="grid gap-md md:grid-cols-2">
            <Select
              name="kind"
              id="incident-kind"
              label="Tipo"
              options={INCIDENT_KINDS.map((k) => ({ value: k, label: INCIDENT_KIND_LABELS[k] }))}
              defaultValue={valueOf(state, "kind", "incidencia")}
              error={f.kind}
            />
            <Select
              name="itemId"
              id="incident-item"
              label={executionCopy.line}
              options={[{ value: "", label: executionCopy.wholeOrder }, ...lines]}
              defaultValue={valueOf(state, "itemId")}
            />
          </div>
          <Input
            name="description"
            label={executionCopy.incidentDescription}
            required
            defaultValue={valueOf(state, "description")}
            error={f.description}
          />
          <Alert text={state.error} />
          <div>
            <Submit label={executionCopy.report} variant="danger" />
          </div>
        </form>
      ) : null}
    </div>
  );
}
