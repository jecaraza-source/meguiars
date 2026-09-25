"use client";

import {
  agendaCopy,
  formatDuration,
  formatMoney,
  statusActions,
  type AppointmentStatus,
  type Bay,
  type CatalogItem,
  type Technician,
  type Vehicle,
} from "@meguiars/domain";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import {
  createAppointmentAction,
  rescheduleAction,
  setStatusAction,
  upsertBayAction,
  upsertTechnicianAction,
  type AgendaFormState,
} from "@/app/actions/agenda";
import { Button } from "./ui/button";
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

const valueOf = (state: AgendaFormState, key: string, fallback = "") => {
  const v = state.values?.[key];
  return typeof v === "string" ? v : fallback;
};

function useSuccessToast(state: AgendaFormState) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

const resourceOptions = (items: { id: string; label: string }[]) => [
  { value: "", label: agendaCopy.none },
  ...items.map((i) => ({ value: i.id, label: i.label })),
];

interface ResourceProps {
  services: CatalogItem[];
  bays: Bay[];
  technicians: Technician[];
}

/** Servicios, duración, bahía, técnico y notas: comunes al alta y a la reprogramación. */
function ScheduleFields({
  state,
  services,
  bays,
  technicians,
  initial,
}: ResourceProps & {
  state: AgendaFormState;
  initial: { serviceIds: string[]; duration: string; bayId: string; technicianId: string; notes: string };
}) {
  const f = state.fields ?? {};
  const selected = state.values
    ? ((state.values.serviceIds as string[] | undefined) ?? [])
    : initial.serviceIds;
  return (
    <>
      <fieldset className="flex flex-col gap-xs">
        <legend className="mg-label">{agendaCopy.servicesLabel} *</legend>
        {services.map((s) => (
          <Checkbox
            key={s.id}
            name="serviceIds"
            value={s.id}
            label={`${s.name} · ${formatDuration(s.standardDurationMinutes)} · ${formatMoney(s.price)}`}
            checked={selected.includes(s.id)}
          />
        ))}
        {f.serviceIds ? (
          <span className="mg-error" role="alert">
            {f.serviceIds}
          </span>
        ) : null}
      </fieldset>
      <div className="grid gap-lg md:grid-cols-3">
        <Input
          name="durationMinutes"
          label={agendaCopy.durationLabel}
          hint={agendaCopy.durationHint}
          inputMode="numeric"
          defaultValue={valueOf(state, "durationMinutes", initial.duration)}
          error={f.durationMinutes}
        />
        <Select
          name="bayId"
          label={agendaCopy.bayLabel}
          options={resourceOptions(bays.filter((b) => b.active).map((b) => ({ id: b.id, label: b.name })))}
          defaultValue={valueOf(state, "bayId", initial.bayId)}
        />
        <Select
          name="technicianId"
          label={agendaCopy.technicianLabel}
          options={resourceOptions(
            technicians.filter((t) => t.active).map((t) => ({ id: t.id, label: t.fullName })),
          )}
          defaultValue={valueOf(state, "technicianId", initial.technicianId)}
        />
      </div>
      <Input
        name="notes"
        label={agendaCopy.notesLabel}
        defaultValue={valueOf(state, "notes", initial.notes)}
      />
    </>
  );
}

function OverrideField({ state, canOverride }: { state: AgendaFormState; canOverride: boolean }) {
  if (!state.conflict || !canOverride) return null;
  return (
    <Input
      name="overrideReason"
      label={agendaCopy.overrideLabel}
      hint={agendaCopy.overrideHint}
      defaultValue={valueOf(state, "overrideReason")}
      error={state.fields?.overrideReason}
    />
  );
}

export function AppointmentForm({
  requestId,
  clientId,
  vehicles,
  walkIn,
  defaultDate,
  canOverride,
  ...resources
}: ResourceProps & {
  requestId: string;
  clientId: string;
  vehicles: Vehicle[];
  walkIn: boolean;
  defaultDate: string;
  canOverride: boolean;
}) {
  const [state, action] = useActionState(createAppointmentAction, {});
  const f = state.fields ?? {};
  const active = vehicles.filter((v) => v.active);
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-lg" noValidate>
      {/* Misma llave en reintentos: la base no crea dos veces la misma cita. */}
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="walkIn" value={walkIn ? "1" : "0"} />
      <Select
        name="vehicleId"
        label={agendaCopy.vehicleLabel}
        required
        placeholder="Elige el vehículo"
        options={active.map((v) => ({ value: v.id, label: `${v.make} ${v.model} ${v.year} · ${v.plate}` }))}
        defaultValue={valueOf(state, "vehicleId", active.length === 1 ? active[0]!.id : "")}
        error={f.vehicleId}
      />
      {walkIn ? null : (
        <div className="grid gap-lg md:grid-cols-2">
          <Input
            name="date"
            type="date"
            label={agendaCopy.dateLabel}
            required
            defaultValue={valueOf(state, "date", defaultDate)}
            error={f.date}
          />
          <Input
            name="time"
            type="time"
            label={agendaCopy.timeLabel}
            required
            defaultValue={valueOf(state, "time")}
            error={f.time}
          />
        </div>
      )}
      <ScheduleFields
        state={state}
        {...resources}
        initial={{ serviceIds: [], duration: "", bayId: "", technicianId: "", notes: "" }}
      />
      <OverrideField state={state} canOverride={canOverride} />
      <Alert text={state.error} />
      <div>
        <Submit label={walkIn ? agendaCopy.submitWalkIn : agendaCopy.submitCreate} />
      </div>
    </form>
  );
}

export function RescheduleForm({
  appointmentId,
  initial,
  canOverride,
  ...resources
}: ResourceProps & {
  appointmentId: string;
  initial: {
    serviceIds: string[];
    date: string;
    time: string;
    duration: string;
    bayId: string;
    technicianId: string;
    notes: string;
  };
  canOverride: boolean;
}) {
  const [state, action] = useActionState(rescheduleAction, {});
  useSuccessToast(state);
  const f = state.fields ?? {};
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-lg" noValidate>
      <input type="hidden" name="id" value={appointmentId} />
      <div className="grid gap-lg md:grid-cols-2">
        <Input
          name="date"
          type="date"
          label={agendaCopy.dateLabel}
          required
          defaultValue={valueOf(state, "date", initial.date)}
          error={f.date}
        />
        <Input
          name="time"
          type="time"
          label={agendaCopy.timeLabel}
          required
          defaultValue={valueOf(state, "time", initial.time)}
          error={f.time}
        />
      </div>
      <ScheduleFields state={state} {...resources} initial={initial} />
      <Input
        name="reason"
        label={agendaCopy.reasonLabel}
        required
        defaultValue={valueOf(state, "reason")}
        error={f.reason}
      />
      <OverrideField state={state} canOverride={canOverride} />
      <Alert text={state.error} />
      <div>
        <Submit label={agendaCopy.submitReschedule} variant="secondary" />
      </div>
    </form>
  );
}

/** Un botón por transición válida; el motivo aplica a cancelar / no se presentó. */
export function StatusActions({
  appointmentId,
  status,
}: {
  appointmentId: string;
  status: AppointmentStatus;
}) {
  const [state, action] = useActionState(setStatusAction, {});
  useSuccessToast(state);
  const actions = statusActions(status);
  if (actions.length === 0) return null;
  const needsReason = actions.some((a) => a.needsReason);
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-md" noValidate>
      <input type="hidden" name="id" value={appointmentId} />
      {needsReason ? (
        <Input
          name="statusReason"
          label={agendaCopy.reasonLabel}
          hint={agendaCopy.reasonHint}
          defaultValue={valueOf(state, "statusReason")}
          error={state.fields?.statusReason}
        />
      ) : null}
      <div className="flex flex-wrap gap-sm">
        {actions.map((a) => (
          <Submit
            key={a.to}
            name="status"
            value={a.to}
            label={a.label}
            variant={a.destructive ? "danger" : "primary"}
          />
        ))}
      </div>
      <Alert text={state.error} />
    </form>
  );
}

function ResourceList({
  title,
  items,
  action,
  addLabel,
}: {
  title: string;
  items: { id: string; name: string; active: boolean }[];
  action: (prev: AgendaFormState, form: FormData) => Promise<AgendaFormState>;
  addLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});
  useSuccessToast(state);
  const field = title === agendaCopy.bays ? "bayName" : "technicianName";
  return (
    <section className="flex flex-col gap-sm">
      <h3 className="font-semibold">{title}</h3>
      <ul className="flex flex-col gap-xs text-sm">
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-sm">
            <span className={i.active ? "" : "text-muted"}>
              {i.name}
              {i.active ? "" : ` · ${agendaCopy.inactive}`}
            </span>
            <form action={formAction}>
              <input type="hidden" name="id" value={i.id} />
              <input type="hidden" name="name" value={i.name} />
              <input type="hidden" name="active" value={i.active ? "0" : "1"} />
              <Submit label={i.active ? agendaCopy.deactivate : agendaCopy.activate} variant="secondary" />
            </form>
          </li>
        ))}
      </ul>
      <form key={state.at ?? 0} action={formAction} className="flex items-end gap-sm" noValidate>
        <div className="flex-1">
          <Input
            name="name"
            id={`field-${field}`}
            label={agendaCopy.resourceName}
            error={state.fields?.name}
          />
        </div>
        <Submit label={addLabel} variant="secondary" />
      </form>
      <Alert text={state.error} />
    </section>
  );
}

export function ResourcesManager({ bays, technicians }: { bays: Bay[]; technicians: Technician[] }) {
  return (
    <div className="grid gap-xl md:grid-cols-2">
      <ResourceList
        title={agendaCopy.bays}
        items={bays}
        action={upsertBayAction}
        addLabel={agendaCopy.addBay}
      />
      <ResourceList
        title={agendaCopy.technicians}
        items={technicians.map((t) => ({ id: t.id, name: t.fullName, active: t.active }))}
        action={upsertTechnicianAction}
        addLabel={agendaCopy.addTechnician}
      />
    </div>
  );
}
