"use client";

import {
  ALERT_CONDITION_LABELS,
  ALERT_CONDITIONS,
  ALERT_PERIOD_LABELS,
  ALERT_PERIODS,
  ALERT_SCOPE_LABELS,
  ALERT_SCOPES,
  ALERT_SEVERITIES,
  ALERT_SEVERITY_LABELS,
  ALERTS_COPY,
  DASHBOARD_CHANNEL_KEYS,
  DASHBOARD_CHANNEL_LABELS,
  DEFAULT_ALERT_COOLDOWN_MINUTES,
  type AlertCondition,
  type AlertRule,
  type AlertScopeKind,
} from "@meguiars/domain";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  evaluateAlertsNowAction,
  resolveAlertAction,
  reviewAlertAction,
  saveAlertRuleAction,
} from "@/app/actions/alerts";
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

function useSuccessToast(state: { message?: string | undefined; at?: number | undefined }) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

/** Marcar revisada (nota opcional). */
export function ReviewAlertForm({ id }: { id: string }) {
  const [state, action] = useActionState(reviewAlertAction, {});
  useSuccessToast(state);
  return (
    <form key={state.at} action={action} className="flex flex-col gap-sm" data-testid="review-form">
      <input type="hidden" name="id" value={id} />
      <ErrorBox error={state.error} />
      <Input name="note" id={`review-${id}`} label={ALERTS_COPY.reviewNote} error={state.fields?.note} />
      <div>
        <Submit label={ALERTS_COPY.review} variant="secondary" />
      </div>
    </form>
  );
}

/** Resolver (nota obligatoria). Resolver no borra: queda el historial. */
export function ResolveAlertForm({ id }: { id: string }) {
  const [state, action] = useActionState(resolveAlertAction, {});
  useSuccessToast(state);
  return (
    <form key={state.at} action={action} className="flex flex-col gap-sm" data-testid="resolve-form">
      <input type="hidden" name="id" value={id} />
      <ErrorBox error={state.error} />
      <Input
        name="note"
        id={`resolve-${id}`}
        label={ALERTS_COPY.resolveNote}
        hint={ALERTS_COPY.resolvedKeepsHistory}
        error={state.fields?.note}
        required
      />
      <div>
        <Submit label={ALERTS_COPY.resolve} />
      </div>
    </form>
  );
}

/** "Evaluar ahora" (admin corporativo): mismo runner que la evaluación diaria. */
export function EvaluateNowForm() {
  const [state, action] = useActionState(evaluateAlertsNowAction, {});
  useSuccessToast(state);
  return (
    <form action={action} className="flex flex-col items-start gap-sm" data-testid="evaluate-form">
      <Submit label={ALERTS_COPY.evaluateNow} variant="secondary" />
      {state.message ? (
        <p role="status" className="text-sm text-muted" data-testid="evaluate-result">
          {state.message}
        </p>
      ) : null}
      <ErrorBox error={state.error} />
    </form>
  );
}

const COOLDOWNS = [
  { value: "0", label: "Sin cooldown" },
  { value: "60", label: "1 hora" },
  { value: "360", label: "6 horas" },
  { value: "720", label: "12 horas" },
  { value: "1440", label: "1 día" },
  { value: "2880", label: "2 días" },
  { value: "10080", label: "7 días" },
  { value: "43200", label: "30 días" },
];

/** Alta o edición de una regla (admin corporativo; la base lo vuelve a validar). */
export function AlertRuleForm({
  organizationId,
  rule,
  metrics,
  centers,
}: {
  organizationId: string;
  rule: AlertRule | null;
  metrics: readonly { id: string; name: string; channel: boolean }[];
  centers: readonly { id: string; name: string }[];
}) {
  const [state, action] = useActionState(saveAlertRuleAction, {});
  const f = state.fields ?? {};
  const sent = state.values;
  const v = (k: string, fallback: string) => (typeof sent?.[k] === "string" ? (sent[k] as string) : fallback);
  const sentCenters = Array.isArray(sent?.centerIds) ? (sent.centerIds as string[]) : null;
  const chosenCenters = sentCenters ?? rule?.centerIds ?? [];
  const [condition, setCondition] = useState<AlertCondition>(
    v("condition", rule?.condition ?? "below") as AlertCondition,
  );
  const [scope, setScope] = useState<AlertScopeKind>(
    v("scopeKind", rule?.scopeKind ?? "centro") as AlertScopeKind,
  );
  const [metricId, setMetricId] = useState(v("metricId", rule?.metricId ?? metrics[0]?.id ?? ""));
  const metricAllowsChannel = metrics.find((m) => m.id === metricId)?.channel ?? false;
  const variation = condition === "drop_pct" || condition === "rise_pct";
  return (
    <form key={state.at} action={action} className="flex flex-col gap-md" data-testid="rule-form">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="id" value={rule?.id ?? ""} />
      <input type="hidden" name="version" value={rule?.version ?? ""} />
      <ErrorBox error={state.error} />
      <div className="grid gap-md md:grid-cols-2">
        <Input
          name="name"
          label="Nombre"
          defaultValue={v("name", rule?.name ?? "")}
          error={f.name}
          required
        />
        <Input
          name="description"
          label="Descripción (opcional)"
          defaultValue={v("description", rule?.description ?? "")}
          error={f.description}
        />
        <Select
          name="metricId"
          label="KPI"
          value={metricId}
          onChange={(e) => setMetricId(e.target.value)}
          error={f.metricId}
          options={metrics.map((m) => ({ value: m.id, label: m.name }))}
          required
        />
        {metricAllowsChannel ? (
          <Select
            name="channel"
            label="Canal fijo (opcional)"
            defaultValue={v("channel", rule?.channel ?? "")}
            error={f.channel}
            options={[
              { value: "", label: "Todos los canales" },
              ...DASHBOARD_CHANNEL_KEYS.map((c) => ({ value: c, label: DASHBOARD_CHANNEL_LABELS[c] })),
            ]}
          />
        ) : (
          <input type="hidden" name="channel" value="" />
        )}
        <Select
          name="condition"
          label="Condición"
          value={condition}
          onChange={(e) => setCondition(e.target.value as AlertCondition)}
          error={f.condition}
          options={ALERT_CONDITIONS.map((c) => ({ value: c, label: ALERT_CONDITION_LABELS[c] }))}
          required
        />
        {condition === "no_data" ? (
          <input type="hidden" name="threshold" value="" />
        ) : (
          <Input
            name="threshold"
            label={variation ? "Variación (% o puntos si el KPI es porcentaje)" : "Umbral"}
            inputMode="decimal"
            defaultValue={v("threshold", rule?.threshold?.toString() ?? "")}
            error={f.threshold}
            required
          />
        )}
        <Select
          name="period"
          label="Periodo evaluado"
          hint={ALERTS_COPY.scheduleHelp}
          defaultValue={v("period", rule?.period ?? "dia")}
          error={f.period}
          options={ALERT_PERIODS.map((p) => ({ value: p, label: ALERT_PERIOD_LABELS[p] }))}
          required
        />
        <Select
          name="severity"
          label="Severidad"
          defaultValue={v("severity", rule?.severity ?? "atencion")}
          error={f.severity}
          options={ALERT_SEVERITIES.map((s) => ({ value: s, label: ALERT_SEVERITY_LABELS[s] }))}
          required
        />
        <Select
          name="scopeKind"
          label="Ámbito"
          value={scope}
          onChange={(e) => setScope(e.target.value as AlertScopeKind)}
          error={f.scopeKind}
          options={ALERT_SCOPES.map((s) => ({ value: s, label: ALERT_SCOPE_LABELS[s] }))}
          required
        />
        <Select
          name="cooldownMinutes"
          label="Cooldown"
          hint={ALERTS_COPY.cooldownHelp}
          defaultValue={v("cooldownMinutes", String(rule?.cooldownMinutes ?? DEFAULT_ALERT_COOLDOWN_MINUTES))}
          error={f.cooldownMinutes}
          options={COOLDOWNS}
        />
      </div>
      {scope === "corporativo" ? null : (
        <fieldset className="flex flex-col gap-xs" data-testid="rule-centers">
          <legend className="text-sm font-medium">
            {scope === "conjunto" ? "Centros del conjunto (mínimo 2)" : "Centros (una alerta por centro)"}
          </legend>
          {centers.map((c) => (
            <Checkbox
              key={c.id}
              name="centerIds"
              value={c.id}
              label={c.name}
              checked={chosenCenters.includes(c.id)}
            />
          ))}
          {f.centerIds ? (
            <p role="alert" className="text-xs text-danger">
              {f.centerIds}
            </p>
          ) : null}
        </fieldset>
      )}
      <Checkbox
        name="active"
        value="on"
        label="Activa"
        checked={sent ? sent.active === "on" : (rule?.active ?? true)}
      />
      <Input name="reason" id="rule-reason" label="Motivo del cambio" error={f.reason} required />
      <div>
        <Submit label={ALERTS_COPY.saveRule} />
      </div>
    </form>
  );
}
