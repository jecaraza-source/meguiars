"use client";

import {
  allowedTaskChannels,
  allowedTaskKinds,
  channelForKind,
  CONTACT_CHANNEL_LABELS,
  crmCopy,
  TASK_CHANNEL_LABELS,
  TASK_KIND_LABELS,
  TASK_OUTCOME_LABELS,
  TASK_OUTCOMES,
  type ContactChannel,
  type ContactPreference,
  type TaskKind,
} from "@meguiars/domain";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createTaskAction,
  generateTasksAction,
  setPreferenceAction,
  updateTaskAction,
  type CrmFormState,
} from "@/app/actions/crm";
import { Button } from "./ui/button";
import { Input, Select } from "./ui/field";
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

const valueOf = (state: CrmFormState, key: string, fallback = "") => {
  const v = state.values?.[key];
  return typeof v === "string" ? v : fallback;
};

function useSuccessToast(state: CrmFormState) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

/** Consentimiento por canal: cambiarlo pide motivo; retirar uno cancela sus pendientes (en la base). */
export function ConsentForm({
  clientId,
  channels,
  preferences,
  canWrite,
}: {
  clientId: string;
  channels: readonly ContactChannel[];
  preferences: ContactPreference[];
  canWrite: boolean;
}) {
  const [state, action] = useActionState(setPreferenceAction, {});
  useSuccessToast(state);
  const [editing, setEditing] = useState<ContactChannel | null>(null);
  const opted = (c: ContactChannel) => preferences.some((p) => p.channel === c && p.optedIn);
  return (
    <div className="flex flex-col gap-sm">
      <p className="text-sm text-muted">{crmCopy.consentHint}</p>
      <ul className="flex flex-col gap-xs" aria-label={crmCopy.consentTitle}>
        {channels.map((c) => (
          <li key={c} className="flex flex-wrap items-center justify-between gap-sm">
            <span>
              {CONTACT_CHANNEL_LABELS[c]}:{" "}
              <strong data-testid={`consent-${c}`}>{opted(c) ? crmCopy.optIn : crmCopy.optOut}</strong>
            </span>
            {canWrite ? (
              <Button
                label={
                  opted(c) ? `Retirar ${CONTACT_CHANNEL_LABELS[c]}` : `Aceptar ${CONTACT_CHANNEL_LABELS[c]}`
                }
                variant="secondary"
                onClick={() => setEditing(c)}
              />
            ) : null}
          </li>
        ))}
      </ul>
      {editing ? (
        <form
          key={`${editing}-${state.at ?? 0}`}
          action={action}
          className="flex flex-wrap items-end gap-sm"
          noValidate
        >
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="channel" value={editing} />
          <input type="hidden" name="optedIn" value={opted(editing) ? "false" : "true"} />
          <div className="flex-1">
            <Input
              name="reason"
              id="consent-reason"
              label={`${crmCopy.reason} (${CONTACT_CHANNEL_LABELS[editing]})`}
              required
              defaultValue={valueOf(state, "reason")}
              error={state.fields?.reason}
            />
          </div>
          <Submit label={crmCopy.saveConsent} variant={opted(editing) ? "danger" : "primary"} />
        </form>
      ) : null}
      <Alert text={state.error} />
    </div>
  );
}

/** Seguimiento manual: tipo y canal limitados a los canales aceptados. */
export function NewTaskForm({
  clientId,
  requestId,
  optedIn,
  today,
}: {
  clientId: string;
  requestId: string;
  optedIn: readonly string[];
  today: string;
}) {
  const [state, action] = useActionState(createTaskAction, {});
  useSuccessToast(state);
  const kinds = allowedTaskKinds(optedIn);
  const channels = allowedTaskChannels(optedIn);
  const [kind, setKind] = useState<TaskKind>(
    (valueOf(state, "kind", kinds[0]) as TaskKind) ?? "ofrecer_mantenimiento",
  );
  const fixed = kind === "llamar" || kind === "whatsapp" || kind === "email";
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-sm" noValidate>
      {channels.length === 1 ? <p className="text-sm text-muted">{crmCopy.noConsent}</p> : null}
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="clientId" value={clientId} />
      <div className="grid gap-md md:grid-cols-3">
        <Select
          name="kind"
          label={crmCopy.taskKind}
          required
          options={kinds.map((k) => ({ value: k, label: TASK_KIND_LABELS[k] }))}
          defaultValue={kind}
          onChange={(e) => setKind(e.currentTarget.value as TaskKind)}
          error={state.fields?.kind}
        />
        {fixed ? (
          <input type="hidden" name="channel" value={channelForKind(kind)} />
        ) : (
          <Select
            name="channel"
            label={crmCopy.taskChannel}
            options={channels.map((c) => ({ value: c, label: TASK_CHANNEL_LABELS[c] }))}
            defaultValue={valueOf(state, "channel", channels[0])}
          />
        )}
        <Input
          name="dueOn"
          type="date"
          label={crmCopy.dueOn}
          required
          min={today}
          defaultValue={valueOf(state, "dueOn", today)}
          error={state.fields?.dueOn}
        />
      </div>
      <Input name="notes" label={crmCopy.notes} defaultValue={valueOf(state, "notes")} />
      <Alert text={state.error} />
      <div>
        <Submit label={crmCopy.create} variant="primary" />
      </div>
    </form>
  );
}

/** Acciones sobre un seguimiento pendiente: resultado, reprogramar o cancelar. */
export function TaskActions({
  taskId,
  clientId,
  today,
}: {
  taskId: string;
  clientId: string;
  today: string;
}) {
  const [state, action] = useActionState(updateTaskAction, {});
  useSuccessToast(state);
  const [open, setOpen] = useState<"complete" | "reschedule" | "cancel" | null>(null);
  return (
    <div className="flex flex-col gap-sm">
      <div className="flex flex-wrap gap-sm">
        <Button label={crmCopy.complete} variant="secondary" onClick={() => setOpen("complete")} />
        <Button label={crmCopy.reschedule} variant="secondary" onClick={() => setOpen("reschedule")} />
        <Button label={crmCopy.cancel} variant="danger" onClick={() => setOpen("cancel")} />
      </div>
      {open ? (
        <form
          key={`${open}-${state.at ?? 0}`}
          action={action}
          className="flex flex-wrap items-end gap-sm"
          aria-label={`${open}-${taskId}`}
          noValidate
        >
          <input type="hidden" name="op" value={open} />
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="clientId" value={clientId} />
          {open === "complete" ? (
            <>
              <Select
                name="outcome"
                id={`outcome-${taskId}`}
                label={crmCopy.outcome}
                required
                placeholder="Elige el resultado"
                options={TASK_OUTCOMES.map((o) => ({ value: o, label: TASK_OUTCOME_LABELS[o] }))}
                defaultValue={valueOf(state, "outcome")}
                error={state.fields?.outcome}
              />
              <Input
                name="notes"
                id={`notes-${taskId}`}
                label={crmCopy.notes}
                defaultValue={valueOf(state, "notes")}
              />
            </>
          ) : (
            <>
              {open === "reschedule" ? (
                <Input
                  name="dueOn"
                  id={`due-${taskId}`}
                  type="date"
                  min={today}
                  label={crmCopy.dueOn}
                  required
                  defaultValue={valueOf(state, "dueOn", today)}
                  error={state.fields?.dueOn}
                />
              ) : null}
              <Input
                name="reason"
                id={`reason-${taskId}`}
                label={crmCopy.reason}
                required
                defaultValue={valueOf(state, "reason")}
                error={state.fields?.reason}
              />
            </>
          )}
          <Submit
            label={
              open === "complete"
                ? crmCopy.complete
                : open === "reschedule"
                  ? crmCopy.reschedule
                  : crmCopy.cancel
            }
            variant={open === "cancel" ? "danger" : "primary"}
          />
        </form>
      ) : null}
      <Alert text={state.error} />
    </div>
  );
}

export function GenerateTasksButton() {
  const [state, action] = useActionState(generateTasksAction, {});
  useSuccessToast(state);
  return (
    <form action={action} className="flex flex-col gap-xs">
      <Submit label={crmCopy.generate} />
      {state.message ? (
        <p role="status" className="text-sm text-muted">
          {state.message}
        </p>
      ) : null}
      <Alert text={state.error} />
    </form>
  );
}
