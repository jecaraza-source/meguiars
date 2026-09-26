"use client";

import {
  CLIENT_KIND_LABELS,
  CLIENT_KINDS,
  clientsCopy,
  describeMatch,
  MARKETING_CHANNEL_LABELS,
  MARKETING_CHANNELS,
  vehicleLabel,
  type Client,
  type ClientMatch,
  type Vehicle,
} from "@meguiars/domain";
import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import {
  addVehicleAction,
  createClientAction,
  deactivateVehicleAction,
  linkClientAction,
  updateClientAction,
  type ClientFormState,
} from "@/app/actions/clients";
import { Button } from "./ui/button";
import { Checkbox, Input, Select } from "./ui/field";
import { useToast } from "./ui/overlay";

function Submit({ label, variant }: { label: string; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" label={label} loading={pending} variant={variant} />;
}

function Alert({ text, tone = "danger" }: { text?: string | undefined; tone?: "danger" | "success" }) {
  if (!text) return null;
  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className="mg-tone rounded-md border p-md text-sm"
      data-tone={tone}
    >
      {text}
    </p>
  );
}

const valueOf = (state: ClientFormState, key: string, fallback = "") => {
  const v = state.values?.[key];
  return typeof v === "string" ? v : fallback;
};

function useSuccessToast(state: ClientFormState) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

const kindOptions = CLIENT_KINDS.map((k) => ({ value: k, label: CLIENT_KIND_LABELS[k] }));

function ConsentFieldset({ state, initial }: { state: ClientFormState; initial: readonly string[] }) {
  const selected = state.values ? ((state.values.marketingChannels as string[] | undefined) ?? []) : initial;
  return (
    <fieldset className="flex flex-col gap-xs">
      <legend className="mg-label">{clientsCopy.consentLabel}</legend>
      <div className="flex flex-wrap gap-lg">
        {MARKETING_CHANNELS.map((c) => (
          <Checkbox
            key={c}
            name="marketingChannels"
            value={c}
            label={MARKETING_CHANNEL_LABELS[c]}
            checked={selected.includes(c)}
          />
        ))}
      </div>
      <span className="mg-hint">{clientsCopy.consentHint}</span>
    </fieldset>
  );
}

function VehicleFields({ state }: { state: ClientFormState }) {
  const f = state.fields ?? {};
  return (
    <div className="grid gap-lg md:grid-cols-2">
      <Input
        name="make"
        label={clientsCopy.makeLabel}
        required
        defaultValue={valueOf(state, "make")}
        error={f.make}
      />
      <Input
        name="model"
        label={clientsCopy.modelLabel}
        required
        defaultValue={valueOf(state, "model")}
        error={f.model}
      />
      <Input
        name="year"
        label={clientsCopy.yearLabel}
        required
        inputMode="numeric"
        defaultValue={valueOf(state, "year")}
        error={f.year}
      />
      <Input
        name="plate"
        label={clientsCopy.plateLabel}
        required
        autoCapitalize="characters"
        defaultValue={valueOf(state, "plate")}
        error={f.plate}
      />
      <Input
        name="identifier"
        label={clientsCopy.identifierLabel}
        hint={clientsCopy.identifierHint}
        defaultValue={valueOf(state, "identifier")}
        error={f.identifier}
      />
      <Input
        name="vehicleNotes"
        label={clientsCopy.vehicleNotesLabel}
        defaultValue={valueOf(state, "vehicleNotes")}
        error={f.notes ?? f.vehicleNotes}
      />
    </div>
  );
}

/** Coincidencias con opciones explícitas: usar el existente o confirmar que es otro cliente. */
function DuplicateNotice({ matches }: { matches: ClientMatch[] }) {
  return (
    <section
      aria-labelledby="duplicados"
      className="mg-tone flex flex-col gap-md rounded-md border p-md"
      data-tone="warning"
    >
      <h2 id="duplicados" className="font-semibold">
        {clientsCopy.duplicateTitle}
      </h2>
      <p className="text-sm">{clientsCopy.duplicateMessage}</p>
      <ul className="flex flex-col gap-sm">
        {matches.map((m) => (
          <li key={m.clientId} className="flex flex-wrap items-center justify-between gap-sm">
            <span className="text-sm">
              <strong>{m.displayName}</strong> · {describeMatch(m)}
            </span>
            {m.visible ? (
              <Link
                href={`/clientes/${m.clientId}`}
                className="mg-btn"
                data-variant="secondary"
                data-size="sm"
              >
                {clientsCopy.useExisting}
              </Link>
            ) : (
              <form action={linkClientAction}>
                <input type="hidden" name="clientId" value={m.clientId} />
                <Submit label={clientsCopy.linkExisting} variant="secondary" />
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function NewClientForm({ requestId }: { requestId: string }) {
  const [state, action] = useActionState(createClientAction, {});
  const f = state.fields ?? {};
  const duplicates = state.matches && state.matches.length > 0;
  return (
    <div className="flex flex-col gap-lg">
      {duplicates ? <DuplicateNotice matches={state.matches!} /> : null}
      <form key={state.at ?? 0} action={action} className="flex flex-col gap-xl" noValidate>
        {/* Misma llave en reintentos: la base no crea dos veces el mismo alta. */}
        <input type="hidden" name="requestId" value={requestId} />
        <div className="grid gap-lg md:grid-cols-2">
          <Input
            name="fullName"
            label={clientsCopy.fullNameLabel}
            required
            autoComplete="name"
            defaultValue={valueOf(state, "fullName")}
            error={f.fullName}
          />
          <Select
            name="kind"
            label={clientsCopy.kindLabel}
            options={kindOptions}
            defaultValue={valueOf(state, "kind", "person")}
          />
          <Input
            name="phone"
            label={clientsCopy.phoneLabel}
            hint={clientsCopy.phoneHint}
            required
            type="tel"
            autoComplete="tel"
            defaultValue={valueOf(state, "phone")}
            error={f.phone}
          />
          <Input
            name="email"
            label={clientsCopy.emailLabel}
            type="email"
            autoComplete="email"
            defaultValue={valueOf(state, "email")}
            error={f.email}
          />
          <div className="md:col-span-2">
            <Input
              name="notes"
              label={clientsCopy.notesLabel}
              defaultValue={valueOf(state, "notes")}
              error={f.notes}
            />
          </div>
        </div>
        <ConsentFieldset state={state} initial={[]} />
        <section className="flex flex-col gap-md">
          <h2 className="text-lg font-semibold">{clientsCopy.vehicleTitle}</h2>
          <VehicleFields state={state} />
        </section>
        {duplicates || f.duplicateReason ? (
          <Input
            name="duplicateReason"
            label={clientsCopy.duplicateReasonLabel}
            hint={clientsCopy.duplicateReasonHint}
            defaultValue={valueOf(state, "duplicateReason")}
            error={f.duplicateReason}
          />
        ) : null}
        <Alert text={state.error} />
        <div>
          <Submit label={duplicates ? clientsCopy.createAnyway : clientsCopy.submitCreate} />
        </div>
      </form>
    </div>
  );
}

export function EditClientForm({
  client,
  centers,
}: {
  client: Client;
  centers: { value: string; label: string }[];
}) {
  const [state, action] = useActionState(updateClientAction, {});
  useSuccessToast(state);
  const f = state.fields ?? {};
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-lg" noValidate>
      <input type="hidden" name="id" value={client.id} />
      {state.needsConfirm ? <input type="hidden" name="confirmDuplicate" value="1" /> : null}
      <div className="grid gap-lg md:grid-cols-2">
        <Input
          name="fullName"
          label={clientsCopy.fullNameLabel}
          required
          defaultValue={valueOf(state, "fullName", client.fullName)}
          error={f.fullName}
        />
        <Select
          name="kind"
          label={clientsCopy.kindLabel}
          options={kindOptions}
          defaultValue={valueOf(state, "kind", client.kind)}
        />
        <Input
          name="phone"
          label={clientsCopy.phoneLabel}
          hint={clientsCopy.phoneHint}
          required
          type="tel"
          defaultValue={valueOf(state, "phone", client.phone)}
          error={f.phone}
        />
        <Input
          name="email"
          label={clientsCopy.emailLabel}
          type="email"
          defaultValue={valueOf(state, "email", client.email ?? "")}
          error={f.email}
        />
        <Select
          name="homeDetailCenterId"
          label={clientsCopy.homeCenterLabel}
          options={centers}
          defaultValue={valueOf(state, "homeDetailCenterId", client.homeDetailCenterId)}
          error={f.homeDetailCenterId}
        />
        <Input
          name="notes"
          label={clientsCopy.notesLabel}
          defaultValue={valueOf(state, "notes", client.notes ?? "")}
          error={f.notes}
        />
      </div>
      <ConsentFieldset state={state} initial={client.marketing.channels} />
      <Input
        name="reason"
        label={clientsCopy.reasonLabel}
        required
        defaultValue={valueOf(state, "reason")}
        error={f.reason}
      />
      <Alert text={state.error} />
      <div>
        <Submit label={clientsCopy.submitUpdate} />
      </div>
    </form>
  );
}

export function AddVehicleForm({ clientId, requestId }: { clientId: string; requestId: string }) {
  const [state, action] = useActionState(addVehicleAction, {});
  useSuccessToast(state);
  return (
    // key: tras agregar, el formulario se vacía con la llave nueva de la página.
    <form key={`${requestId}-${state.at ?? 0}`} action={action} className="flex flex-col gap-lg" noValidate>
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="requestId" value={requestId} />
      <VehicleFields state={state.message ? {} : state} />
      <Alert text={state.error} />
      <div>
        <Submit label={clientsCopy.addVehicle} variant="secondary" />
      </div>
    </form>
  );
}

export function DeactivateVehicleForm({ clientId, vehicles }: { clientId: string; vehicles: Vehicle[] }) {
  const [state, action] = useActionState(deactivateVehicleAction, {});
  useSuccessToast(state);
  const active = vehicles.filter((v) => v.active);
  if (active.length === 0) return null;
  return (
    <form key={state.at ?? 0} action={action} className="grid gap-lg md:grid-cols-2" noValidate>
      <input type="hidden" name="clientId" value={clientId} />
      <Select
        name="vehicleId"
        label="Vehículo"
        placeholder="Elige un vehículo"
        options={active.map((v) => ({ value: v.id, label: vehicleLabel(v) }))}
        defaultValue={valueOf(state, "vehicleId")}
        error={state.fields?.vehicleId}
      />
      <Input
        name="vehicleReason"
        label={clientsCopy.reasonLabel}
        required
        defaultValue={valueOf(state, "vehicleReason")}
        error={state.fields?.vehicleReason}
      />
      <div className="md:col-span-2">
        <Alert text={state.error} />
      </div>
      <div>
        <Submit label={clientsCopy.deactivateVehicle} variant="secondary" />
      </div>
    </form>
  );
}
