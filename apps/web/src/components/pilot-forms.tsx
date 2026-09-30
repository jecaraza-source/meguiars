"use client";

import { BASELINE_METRIC_INFO, BASELINE_METRICS, PILOT_COPY, type CenterBaseline } from "@meguiars/domain";
import { IMPORT_ENTITIES, IMPORT_SPECS, importTemplate, type ImportEntity } from "@meguiars/validation";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { createCenterAction, importAction, setBaselineAction, type ImportState } from "@/app/actions/pilot";
import { Button } from "./ui/button";
import { Badge } from "./ui/display";
import { Input, Select } from "./ui/field";
import { useToast } from "./ui/overlay";

function Submit({
  label,
  variant,
  name,
  value,
}: {
  label: string;
  variant?: "secondary";
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      label={label}
      loading={pending}
      size="sm"
      {...(variant ? { variant } : {})}
      {...(name ? { name, value } : {})}
    />
  );
}

function Alert({ text, tone = "danger" }: { text?: string | undefined; tone?: "danger" | "success" }) {
  return text ? (
    <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone={tone}>
      {text}
    </p>
  ) : null;
}

const v = (state: { values?: Record<string, string | string[]> }, k: string, d = "") =>
  typeof state.values?.[k] === "string" ? (state.values[k] as string) : d;

/** Alta de centro (admin corporativo): código, nombre, zona horaria y motivo. */
export function CreateCenterForm() {
  const [state, action] = useActionState(createCenterAction, {});
  const f = state.fields ?? {};
  return (
    <form key={state.at} action={action} className="flex flex-col gap-md" data-testid="create-center-form">
      <Alert text={state.error} />
      <p className="text-sm text-muted">{PILOT_COPY.newCenterHelp}</p>
      <div className="grid gap-md md:grid-cols-3">
        <Input
          name="code"
          label="Código"
          hint="Ej. GDL-01"
          defaultValue={v(state, "code")}
          error={f.code}
          required
        />
        <Input name="name" label="Nombre" defaultValue={v(state, "name")} error={f.name} required />
        <Input
          name="timezone"
          label="Zona horaria"
          hint="Ej. America/Mexico_City, America/Monterrey"
          defaultValue={v(state, "timezone", "America/Mexico_City")}
          error={f.timezone}
          required
        />
      </div>
      <Input name="reason" label="Motivo" defaultValue={v(state, "reason")} error={f.reason} required />
      <div>
        <Submit label={PILOT_COPY.newCenter} />
      </div>
    </form>
  );
}

/** Captura de un indicador de línea base (valor vacío = borrarlo). */
export function BaselineForm({ centerId, baselines }: { centerId: string; baselines: CenterBaseline[] }) {
  const [state, action] = useActionState(setBaselineAction, {});
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
  const [metric, setMetric] = useState(v(state, "metric", BASELINE_METRICS[0]));
  const current = baselines.find((b) => b.metric === metric);
  const f = state.fields ?? {};
  return (
    <form
      key={`${state.at}-${metric}`}
      action={action}
      className="flex flex-col gap-md"
      data-testid="baseline-form"
    >
      <Alert text={state.error} />
      <input type="hidden" name="detailCenterId" value={centerId} />
      <div className="grid gap-md md:grid-cols-2">
        <Select
          name="metric"
          label="Indicador"
          value={metric}
          onChange={(e) => setMetric(e.target.value as (typeof BASELINE_METRICS)[number])}
          options={BASELINE_METRICS.map((m) => ({ value: m, label: BASELINE_METRIC_INFO[m].label }))}
          hint={BASELINE_METRIC_INFO[metric as (typeof BASELINE_METRICS)[number]]?.help}
        />
        <Input
          name="value"
          label="Valor"
          hint="Vacío = borrar el indicador"
          inputMode="decimal"
          defaultValue={current ? String(current.value) : ""}
          error={f.value}
        />
        <Input
          name="periodFrom"
          type="date"
          label="Periodo desde"
          defaultValue={current?.periodFrom ?? ""}
          error={f.periodFrom}
        />
        <Input
          name="periodTo"
          type="date"
          label="Periodo hasta"
          defaultValue={current?.periodTo ?? ""}
          error={f.periodTo}
        />
        <Input
          name="source"
          label={PILOT_COPY.baselineSource}
          hint="Ej. Excel de ventas 2025, bitácora de recepción"
          defaultValue={current?.source ?? ""}
          error={f.source}
        />
        <Input name="reason" label="Motivo" defaultValue="Línea base del piloto" error={f.reason} required />
      </div>
      <div>
        <Submit label="Guardar indicador" />
      </div>
    </form>
  );
}

const ACTION_TONE = {
  crear: "success",
  actualizar: "warning",
  sin_cambios: "neutral",
  error: "danger",
} as const;
const ACTION_LABEL = {
  crear: "Crear",
  actualizar: "Actualizar",
  sin_cambios: "Sin cambios",
  error: "Error",
} as const;

/** Importador: CSV (archivo o pegado) → vista previa → aplicar. */
export function ImportForm({ centerId, isActive }: { centerId: string; isActive: boolean }) {
  const [state, action] = useActionState<ImportState, FormData>(importAction, {});
  const [entity, setEntity] = useState<ImportEntity>((v(state, "entity") as ImportEntity) || "servicios");
  const spec = IMPORT_SPECS[entity];
  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${importTemplate(entity)}`)}`;
  const plan = state.plan && state.plan.entity === entity ? state.plan : null;
  return (
    <form key={state.at} action={action} className="flex flex-col gap-md" data-testid="import-form">
      <input type="hidden" name="detailCenterId" value={centerId} />
      <Alert text={state.error} />
      <Alert text={state.message} tone="success" />
      <div className="grid gap-md md:grid-cols-2">
        <Select
          name="entity"
          label="Qué vas a importar"
          value={entity}
          onChange={(e) => setEntity(e.target.value as ImportEntity)}
          options={IMPORT_ENTITIES.map((e) => ({ value: e, label: IMPORT_SPECS[e].label }))}
          hint={`Alcance: ${spec.scope === "centro" ? "este centro (debe ser el centro activo)" : "toda la organización"}`}
        />
        <Input name="file" type="file" label="Archivo CSV" accept=".csv,text/csv" />
      </div>
      {spec.scope === "centro" && !isActive ? (
        <Alert text="Bahías y técnicos se importan en el centro activo: cambia a este centro primero." />
      ) : null}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Columnas y plantilla</summary>
        <ul className="mt-xs flex flex-col gap-xxs">
          {spec.columns.map((c) => (
            <li key={c.key}>
              <code>{c.key}</code>
              {c.required ? " (obligatoria)" : ""} {c.help ? `— ${c.help}` : ""}
            </li>
          ))}
        </ul>
        <a className="mt-xs inline-block underline" href={template} download={`plantilla-${entity}.csv`}>
          Descargar plantilla
        </a>
      </details>
      <label className="mg-field">
        <span className="mg-label">O pega el CSV</span>
        <textarea
          name="csv"
          rows={6}
          className="mg-input font-mono text-xs"
          defaultValue={v(state, "csv")}
          placeholder={importTemplate(entity)}
        />
      </label>
      <div className="flex flex-wrap gap-sm">
        <Submit label="Vista previa" variant="secondary" name="mode" value="preview" />
        {plan?.canApply ? <Submit label="Aplicar importación" name="mode" value="apply" /> : null}
      </div>
      {plan ? (
        <section className="flex flex-col gap-sm" data-testid="import-preview">
          {plan.headerErrors.map((e) => (
            <Alert key={e} text={e} />
          ))}
          <p className="text-sm">
            Crear {plan.summary.crear} · Actualizar {plan.summary.actualizar} · Sin cambios{" "}
            {plan.summary.sin_cambios} · Errores {plan.summary.error}
          </p>
          <ul className="flex flex-col gap-xs">
            {plan.rows.map((r) => (
              <li
                key={r.line}
                className="mg-card flex flex-col gap-xxs text-sm"
                data-testid={`import-row-${r.line}`}
              >
                <div className="flex flex-wrap items-center gap-xs">
                  <span className="text-muted">Línea {r.line}</span>
                  <span className="font-medium">{r.key || "—"}</span>
                  <Badge label={ACTION_LABEL[r.action]} tone={ACTION_TONE[r.action]} />
                </div>
                {r.errors.map((e) => (
                  <span key={e} className="text-danger">
                    {e}
                  </span>
                ))}
                {r.changes.length ? <span className="text-muted">{r.changes.join(" · ")}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {state.applied ? (
        <ul className="flex flex-col gap-xxs text-sm" data-testid="import-results">
          {state.applied.results.map((r) => (
            <li key={r.line}>
              Línea {r.line} · {r.key}: {r.message}
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
