"use client";

import { MY_WORK_COPY, ROLE_LABELS, type Technician, type TechnicianUser } from "@meguiars/domain";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { linkTechnicianUserAction, myWorkItemAction, myWorkNoteAction } from "@/app/actions/work";
import type { ActionFormState } from "@/lib/form-data";
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
  variant?: "primary" | "secondary";
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

function useSuccessToast(state: ActionFormState) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

/** Botones grandes de un servicio: Empezar y Trabajo terminado. */
export function MyWorkItemButtons({ itemId, canStart }: { itemId: string; canStart: boolean }) {
  const [state, action] = useActionState(myWorkItemAction, {});
  useSuccessToast(state);
  return (
    <form action={action} className="flex flex-wrap gap-sm">
      <input type="hidden" name="itemId" value={itemId} />
      {canStart ? (
        <Submit label={MY_WORK_COPY.start} variant="secondary" name="action" value="start" />
      ) : null}
      <Submit label={MY_WORK_COPY.done} name="action" value="done" />
      <Alert text={state.error} />
    </form>
  );
}

/** Comentario o problema de una orden. */
export function MyWorkNoteForm({ orderId, allowProblem }: { orderId: string; allowProblem: boolean }) {
  const [state, action] = useActionState(myWorkNoteAction, {});
  useSuccessToast(state);
  const id = `field-text-${orderId}`;
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-sm" noValidate>
      <input type="hidden" name="orderId" value={orderId} />
      <label htmlFor={id} className="flex flex-col gap-xs text-sm">
        <span className="font-medium">
          {MY_WORK_COPY.comment}
          {allowProblem ? ` o ${MY_WORK_COPY.problem.toLowerCase()}` : ""}
        </span>
        <textarea
          id={id}
          name="text"
          rows={2}
          maxLength={2000}
          className="mg-input"
          defaultValue={typeof state.values?.text === "string" ? state.values.text : ""}
          aria-invalid={state.fields?.text ? true : undefined}
        />
        {state.fields?.text ? (
          <span className="mg-error" role="alert">
            {state.fields.text}
          </span>
        ) : null}
      </label>
      <div className="flex flex-wrap gap-sm">
        <Submit label="Guardar comentario" variant="secondary" name="kind" value="comment" />
        {allowProblem ? (
          <Submit label={MY_WORK_COPY.problem} variant="secondary" name="kind" value="problem" />
        ) : null}
      </div>
      <Alert text={state.error} />
    </form>
  );
}

/**
 * Agenda → técnicos: liga cada técnico con el usuario con el que entra a la app.
 * Así el técnico ve «Mi día» con sus asignaciones.
 */
export function TechnicianUsersForm({
  technicians,
  users,
}: {
  technicians: Technician[];
  users: TechnicianUser[];
}) {
  const [state, action] = useActionState(linkTechnicianUserAction, {});
  useSuccessToast(state);
  const linkedTo = (technicianId: string) => users.find((u) => u.technicianId === technicianId)?.userId ?? "";
  const options = [
    { value: "", label: "Sin usuario" },
    ...users.map((u) => ({
      value: u.userId,
      label: `${u.fullName ?? "Sin nombre"} · ${ROLE_LABELS[u.role]}`,
    })),
  ];
  return (
    <div className="flex flex-col gap-md">
      <p className="text-sm text-muted">
        Liga a cada técnico con su usuario (rol «{ROLE_LABELS.tecnico}») para que vea «Mi día» en la app con
        sus trabajos asignados.
      </p>
      {technicians
        .filter((t) => t.active)
        .map((t) => (
          <form
            key={`${t.id}-${state.at ?? 0}`}
            action={action}
            className="grid items-end gap-sm md:grid-cols-4"
            noValidate
          >
            <input type="hidden" name="technicianId" value={t.id} />
            <p className="font-medium">{t.fullName}</p>
            <Select
              id={`field-userId-${t.id}`}
              name="userId"
              label="Usuario"
              options={options}
              defaultValue={linkedTo(t.id)}
            />
            <Input id={`field-reason-${t.id}`} name="reason" label="Motivo" error={state.fields?.reason} />
            <Submit label="Guardar" variant="secondary" />
          </form>
        ))}
      <Alert text={state.error} />
    </div>
  );
}
