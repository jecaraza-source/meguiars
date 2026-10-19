"use client";

import {
  REPORT_FREQUENCIES,
  REPORT_FREQUENCY_HINTS,
  REPORT_FREQUENCY_LABELS,
  reportEmailsCopy,
  type ReportFrequency,
  type ReportSubscription,
} from "@meguiars/domain";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  deleteReportSubscriptionAction,
  saveReportSubscriptionAction,
  sendReportNowAction,
} from "@/app/actions/report-emails";
import { Button } from "./ui/button";
import { Checkbox, Input, Select } from "./ui/field";
import { useToast } from "./ui/overlay";

function Submit({ label, variant }: { label: string; variant?: "secondary" | "danger" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" label={label} loading={pending} size="sm" {...(variant ? { variant } : {})} />;
}

function ErrorBox({ error }: { error?: string | undefined }) {
  return error ? (
    <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
      {error}
    </p>
  ) : null;
}

/** Alta o edición de una programación de reporte por correo. */
export function ReportSubscriptionForm({
  organizationId,
  subscription,
  centers,
}: {
  organizationId: string;
  subscription: ReportSubscription | null;
  centers: readonly { id: string; name: string }[];
}) {
  const [state, action] = useActionState(saveReportSubscriptionAction, {});
  const f = state.fields ?? {};
  const sent = state.values;
  const v = (k: string, fallback: string) => (typeof sent?.[k] === "string" ? (sent[k] as string) : fallback);
  const sentCenters = Array.isArray(sent?.centerIds) ? (sent.centerIds as string[]) : null;
  const chosen = sentCenters ?? subscription?.centerIds ?? [];
  const [frequency, setFrequency] = useState<ReportFrequency>(
    v("frequency", subscription?.frequency ?? "semanal") as ReportFrequency,
  );
  return (
    <form key={state.at} action={action} className="flex flex-col gap-md" data-testid="report-form">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="id" value={subscription?.id ?? ""} />
      <input type="hidden" name="version" value={subscription?.version ?? ""} />
      <ErrorBox error={state.error} />
      <div className="grid gap-md md:grid-cols-2">
        <Input
          name="name"
          label="Nombre"
          hint="Aparece en el asunto del correo"
          defaultValue={v("name", subscription?.name ?? "")}
          error={f.name}
          required
        />
        <Select
          name="frequency"
          label="Frecuencia"
          hint={REPORT_FREQUENCY_HINTS[frequency]}
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as ReportFrequency)}
          error={f.frequency}
          options={REPORT_FREQUENCIES.map((x) => ({ value: x, label: REPORT_FREQUENCY_LABELS[x] }))}
          required
        />
      </div>
      <Input
        name="recipients"
        label="Correos de Dirección"
        hint="Separados por coma (máximo 20). Sólo equipo interno: nunca clientes."
        inputMode="email"
        defaultValue={v("recipients", subscription?.recipients.join(", ") ?? "")}
        error={f.recipients}
        required
      />
      <fieldset className="flex flex-col gap-xs" data-testid="report-centers">
        <legend className="text-sm font-medium">Centros (ninguno marcado = todos)</legend>
        {centers.map((c) => (
          <Checkbox key={c.id} name="centerIds" value={c.id} label={c.name} checked={chosen.includes(c.id)} />
        ))}
        {f.centerIds ? (
          <p role="alert" className="text-xs text-danger">
            {f.centerIds}
          </p>
        ) : null}
      </fieldset>
      <Checkbox
        name="active"
        value="on"
        label="Activo (se envía automáticamente)"
        checked={sent ? sent.active === "on" : (subscription?.active ?? true)}
      />
      <Input name="reason" id="report-reason" label="Motivo del cambio" error={f.reason} required />
      <div>
        <Submit label="Guardar" />
      </div>
    </form>
  );
}

/** «Enviar ahora»: manda el último periodo cerrado a los destinatarios. */
export function SendReportNowForm({ id, disabled }: { id: string; disabled: boolean }) {
  const [state, action] = useActionState(sendReportNowAction, {});
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
  return (
    <form action={action} className="flex flex-col gap-xs" data-testid={`send-now-${id}`}>
      <input type="hidden" name="id" value={id} />
      <ErrorBox error={state.error} />
      {disabled ? (
        <Button type="button" label={reportEmailsCopy.sendNow} size="sm" variant="secondary" disabled />
      ) : (
        <Submit label={reportEmailsCopy.sendNow} variant="secondary" />
      )}
    </form>
  );
}

/** Borrar con motivo (la bitácora se conserva). */
export function DeleteReportForm({ id }: { id: string }) {
  const [state, action] = useActionState(deleteReportSubscriptionAction, {});
  return (
    <form key={state.at} action={action} className="flex flex-col gap-xs" data-testid={`delete-report-${id}`}>
      <input type="hidden" name="id" value={id} />
      <ErrorBox error={state.error} />
      <Input
        name="reason"
        id={`delete-reason-${id}`}
        label="Motivo para borrar"
        error={state.fields?.reason}
      />
      <div>
        <Submit label="Borrar" variant="danger" />
      </div>
    </form>
  );
}
