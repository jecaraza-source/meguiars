"use client";

import {
  AUTOMATION_DELAY_LABELS,
  AUTOMATION_PRESETS,
  AUTOMATION_TRIGGER_HELP,
  AUTOMATION_TRIGGER_LABELS,
  AUTOMATION_TRIGGERS,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  MESSAGE_PLACEHOLDERS,
  renderAutomationMessage,
  triggerAccepts,
  triggerPurpose,
  type Automation,
  type AutomationTrigger,
} from "@meguiars/domain";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  runAutomationAction,
  saveAutomationAction,
  setAutomationActiveAction,
  type AutomationFormState,
} from "@/app/actions/automations";
import { Button } from "./ui/button";
import { Checkbox, Input, Select } from "./ui/field";
import { useToast } from "./ui/overlay";

type Option = { value: string; label: string };

function Submit({ label, variant = "primary" }: { label: string; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" label={label} loading={pending} variant={variant} size="sm" />;
}

function useToastOnMessage(state: AutomationFormState) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

function FormError({ state }: { state: AutomationFormState }) {
  return state.error ? (
    <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
      {state.error}
    </p>
  ) : null;
}

const valueOf = (state: AutomationFormState, key: string, fallback = "") => {
  const v = state.values?.[key];
  return typeof v === "string" ? v : fallback;
};
const listOf = (state: AutomationFormState, key: string, fallback: readonly string[] = []) => {
  const v = state.values?.[key];
  return Array.isArray(v) ? v : typeof v === "string" && v ? [v] : [...fallback];
};

/** Alta o edición. Al elegir el disparador se proponen días, frecuencia y un mensaje editable. */
export function AutomationForm({
  automation,
  centers,
  services,
  owners,
  defaultCenterId,
  centerName,
}: {
  automation?: Automation;
  centers: Option[];
  services: Option[];
  owners: Option[];
  defaultCenterId?: string | undefined;
  centerName: string;
}) {
  const [state, action] = useActionState(saveAutomationAction, {});
  useToastOnMessage(state);
  const [trigger, setTrigger] = useState<AutomationTrigger>(
    (valueOf(state, "trigger", automation?.trigger ?? "prospecto_nuevo") as AutomationTrigger) ??
      "prospecto_nuevo",
  );
  const preset = AUTOMATION_PRESETS[trigger];
  const [template, setTemplate] = useState(
    valueOf(state, "messageTemplate", automation?.messageTemplate ?? preset.template),
  );
  const accepts = triggerAccepts(trigger);
  const pickedServices = listOf(state, "serviceIds", automation?.serviceIds ?? []);
  const pickedSources = listOf(state, "leadSources", automation?.leadSources ?? []);
  const idp = automation?.id ?? "new";
  return (
    <form
      key={state.message ? state.at : `auto-${trigger}`}
      action={action}
      className="flex flex-col gap-sm"
      data-testid={automation ? `automation-form-${automation.id}` : "automation-form"}
      noValidate
    >
      {automation ? (
        <>
          <input type="hidden" name="id" value={automation.id} />
          <input type="hidden" name="version" value={automation.version} />
          <input type="hidden" name="trigger" value={automation.trigger} />
        </>
      ) : null}
      <div className="grid gap-sm md:grid-cols-3">
        {automation ? (
          <p className="text-sm">
            <span className="mg-label">Disparador</span>
            <br />
            {AUTOMATION_TRIGGER_LABELS[trigger]}
          </p>
        ) : (
          <Select
            name="trigger"
            id={`trigger-${idp}`}
            label="Disparador"
            value={trigger}
            onChange={(e) => {
              const t = e.currentTarget.value as AutomationTrigger;
              setTrigger(t);
              setTemplate(AUTOMATION_PRESETS[t].template);
            }}
            options={AUTOMATION_TRIGGERS.map((t) => ({ value: t, label: AUTOMATION_TRIGGER_LABELS[t] }))}
          />
        )}
        <Input
          name="name"
          id={`name-${idp}`}
          label="Nombre"
          required
          defaultValue={valueOf(state, "name", automation?.name ?? preset.name)}
        />
        <Select
          name="detailCenterId"
          id={`center-${idp}`}
          label="Centro"
          defaultValue={valueOf(
            state,
            "detailCenterId",
            automation ? (automation.detailCenterId ?? "") : (defaultCenterId ?? ""),
          )}
          options={centers}
        />
      </div>
      <p className="text-xs text-muted">
        {AUTOMATION_TRIGGER_HELP[trigger]} Tipo:{" "}
        {triggerPurpose(trigger) === "promocional" ? "promocional (exige consentimiento)" : "operativa"}.
      </p>
      <div className="grid gap-sm md:grid-cols-4">
        <Input
          name="delayDays"
          id={`delay-${idp}`}
          type="number"
          label="Días"
          hint={AUTOMATION_DELAY_LABELS[trigger]}
          defaultValue={valueOf(state, "delayDays", String(automation?.delayDays ?? preset.delayDays))}
        />
        <Input
          name="dueInDays"
          id={`due-${idp}`}
          type="number"
          label="Plazo de la tarea (días)"
          defaultValue={valueOf(state, "dueInDays", String(automation?.dueInDays ?? preset.dueInDays))}
        />
        <Input
          name="cooldownDays"
          id={`cooldown-${idp}`}
          type="number"
          label="No repetir con el mismo cliente (días)"
          defaultValue={valueOf(
            state,
            "cooldownDays",
            String(automation?.cooldownDays ?? preset.cooldownDays),
          )}
        />
        <Input
          name="maxPerRun"
          id={`max-${idp}`}
          type="number"
          label="Tope por corrida"
          defaultValue={valueOf(state, "maxPerRun", String(automation?.maxPerRun ?? 50))}
        />
      </div>
      <div className="grid gap-sm md:grid-cols-3">
        <Input
          name="contactFrom"
          id={`from-${idp}`}
          type="time"
          label="Contactar desde"
          defaultValue={valueOf(state, "contactFrom", automation?.contactFrom ?? "09:00")}
        />
        <Input
          name="contactTo"
          id={`to-${idp}`}
          type="time"
          label="Contactar hasta"
          defaultValue={valueOf(state, "contactTo", automation?.contactTo ?? "19:00")}
        />
        <Select
          name="assignTo"
          id={`assign-${idp}`}
          label="Responsable"
          defaultValue={valueOf(state, "assignTo", automation?.assignTo ?? "")}
          options={[{ value: "", label: "El del prospecto o sin asignar" }, ...owners]}
        />
      </div>
      {accepts.leadSources ? (
        <fieldset className="flex flex-wrap gap-sm">
          <legend className="mg-label">Canales de origen (vacío = todos)</legend>
          {LEAD_SOURCES.map((s) => (
            <Checkbox
              key={s}
              name="leadSources"
              value={s}
              id={`src-${idp}-${s}`}
              label={LEAD_SOURCE_LABELS[s]}
              checked={pickedSources.includes(s)}
            />
          ))}
        </fieldset>
      ) : null}
      {accepts.services ? (
        <fieldset className="flex flex-wrap gap-sm">
          <legend className="mg-label">
            Servicios (vacío = {trigger === "mantenimiento" ? "los recurrentes" : "todos"})
          </legend>
          {services.map((s) => (
            <Checkbox
              key={s.value}
              name="serviceIds"
              value={s.value}
              id={`svc-${idp}-${s.value}`}
              label={s.label}
              checked={pickedServices.includes(s.value)}
            />
          ))}
        </fieldset>
      ) : null}
      <label className="mg-field">
        <span className="mg-label">Mensaje sugerido</span>
        <textarea
          name="messageTemplate"
          rows={3}
          className="mg-input"
          value={template}
          onChange={(e) => setTemplate(e.currentTarget.value)}
        />
        <span className="text-xs text-muted">
          Datos disponibles: {MESSAGE_PLACEHOLDERS.map((p) => `{${p}}`).join(" ")}. No se admiten precios ni
          promociones inventados.
        </span>
      </label>
      <p className="text-sm text-muted" data-testid="automation-preview-message">
        Así se verá: «
        {renderAutomationMessage(template, {
          name: "Mariana Soto",
          service: "Lavado manual detallado",
          center: centerName,
          date: "2026-10-15",
          folio: "CDMX-01-COT-00001",
        })}
        »
      </p>
      <Input
        name="reason"
        id={`reason-${idp}`}
        label="Motivo"
        required
        defaultValue={automation ? "" : "Alta de automatización"}
      />
      <Submit label={automation ? "Guardar cambios" : "Crear (inactiva)"} />
      <FormError state={state} />
    </form>
  );
}

export function AutomationToggle({ automation }: { automation: Automation }) {
  const [state, action] = useActionState(setAutomationActiveAction, {});
  useToastOnMessage(state);
  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-sm"
      data-testid={`automation-toggle-${automation.id}`}
    >
      <input type="hidden" name="id" value={automation.id} />
      <input type="hidden" name="version" value={automation.version} />
      <input type="hidden" name="active" value={automation.active ? "false" : "true"} />
      <Input
        name="reason"
        id={`toggle-reason-${automation.id}`}
        label="Motivo"
        required
        defaultValue={automation.active ? "" : "Arranque"}
      />
      <Submit label={automation.active ? "Desactivar" : "Activar"} variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

export function AutomationRunButtons({ automation }: { automation: Automation }) {
  const [state, action] = useActionState(runAutomationAction, {});
  return (
    <form action={action} className="flex flex-col gap-xs" data-testid={`automation-run-${automation.id}`}>
      <input type="hidden" name="id" value={automation.id} />
      <div className="flex flex-wrap gap-sm">
        <Button
          type="submit"
          name="mode"
          value="preview"
          label="Vista previa"
          variant="secondary"
          size="sm"
        />
        {automation.active ? (
          <Button
            type="submit"
            name="mode"
            value="manual"
            label="Ejecutar ahora"
            variant="secondary"
            size="sm"
          />
        ) : null}
      </div>
      {state.message ? (
        <p className="text-sm" data-testid="automation-run-result">
          {state.message}
        </p>
      ) : null}
      <FormError state={state} />
    </form>
  );
}
