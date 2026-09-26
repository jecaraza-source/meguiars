"use client";

import {
  presentSuggestion,
  REJECTION_REASON_LABELS,
  REJECTION_REASONS,
  RULE_STAGE_LABELS,
  RULE_STAGES,
  SALES_CHANNELS,
  upsellCopy,
  type CatalogItem,
  type MembershipPlan,
  type UpsellRule,
  type UpsellSuggestion,
} from "@meguiars/domain";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { decideUpsellAction, upsertUpsellRuleAction, type UpsellFormState } from "@/app/actions/upsell";
import { Button } from "./ui/button";
import { Checkbox, Input, Select } from "./ui/field";
import { useToast } from "./ui/overlay";

const CHANNEL_LABELS: Record<string, string> = { b2c: "Mostrador (B2C)", membresia: "Membresía", b2b: "B2B" };

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
  return (
    <Button
      type="submit"
      label={label}
      loading={pending}
      variant={variant}
      size="sm"
      name={name}
      value={value}
    />
  );
}

const valueOf = (state: UpsellFormState, key: string, fallback = "") => {
  const v = state.values?.[key];
  return typeof v === "string" ? v : fallback;
};
const valuesOf = (state: UpsellFormState, key: string, fallback: string[]) => {
  const v = state.values?.[key];
  return Array.isArray(v) ? v : typeof v === "string" ? [v] : fallback;
};

function useToastOnMessage(state: UpsellFormState) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

/** Una sugerencia: agregar (o vender membresía) o descartar con motivo opcional. */
function SuggestionItem({
  suggestion,
  orderId,
  version,
  clientId,
}: {
  suggestion: UpsellSuggestion;
  orderId: string;
  version: number;
  clientId: string;
}) {
  const [state, action] = useActionState(decideUpsellAction, {});
  useToastOnMessage(state);
  const [rejecting, setRejecting] = useState(false);
  const view = presentSuggestion(suggestion);
  return (
    <li
      className="flex flex-col gap-xs border-b border-border pb-sm last:border-0"
      data-testid="upsell-suggestion"
    >
      <strong className="text-sm">{view.title}</strong>
      <span className="text-sm">{view.pitch}</span>
      {view.why ? <span className="text-xs text-muted">{view.why}</span> : null}
      <form action={action} className="flex flex-wrap items-end gap-sm">
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="ruleId" value={suggestion.ruleId} />
        <input type="hidden" name="version" value={version} />
        {view.isMembership ? <input type="hidden" name="membershipClientId" value={clientId} /> : null}
        {rejecting ? (
          <>
            <Select
              name="reason"
              id={`reason-${suggestion.ruleId}`}
              label={upsellCopy.rejectReason}
              options={[
                { value: "", label: "—" },
                ...REJECTION_REASONS.map((r) => ({ value: r, label: REJECTION_REASON_LABELS[r] })),
              ]}
              defaultValue=""
            />
            <Submit label={upsellCopy.reject} variant="secondary" name="op" value="reject" />
          </>
        ) : (
          <>
            <Submit
              label={view.isMembership ? upsellCopy.acceptMembership : upsellCopy.accept}
              variant="primary"
              name="op"
              value="accept"
            />
            <Button
              label={upsellCopy.reject}
              variant="secondary"
              size="sm"
              onClick={() => setRejecting(true)}
            />
          </>
        )}
      </form>
      {state.error ? (
        <p role="alert" className="text-sm" data-tone="danger">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}

/** Tarjeta discreta de sugerencias en la OS (plegable; nunca bloquea). */
export function UpsellCard({
  suggestions,
  orderId,
  version,
  clientId,
}: {
  suggestions: UpsellSuggestion[];
  orderId: string;
  version: number;
  clientId: string;
}) {
  if (suggestions.length === 0) return null;
  return (
    <details open className="mg-card" data-testid="upsell-card">
      <summary className="cursor-pointer font-medium">
        {upsellCopy.cardTitle} ({suggestions.length})
      </summary>
      <p className="mt-xs text-xs text-muted">{upsellCopy.cardHint}</p>
      <ul className="mt-sm flex flex-col gap-sm" aria-label={upsellCopy.cardTitle}>
        {suggestions.map((s) => (
          <SuggestionItem
            key={s.ruleId}
            suggestion={s}
            orderId={orderId}
            version={version}
            clientId={clientId}
          />
        ))}
      </ul>
    </details>
  );
}

/** Alta o edición de una regla (admin corporativo). */
export function UpsellRuleForm({
  rule,
  services,
  plans,
  centers,
  today,
}: {
  rule?: UpsellRule;
  services: CatalogItem[];
  plans: MembershipPlan[];
  centers: { id: string; name: string }[];
  today: string;
}) {
  const [state, action] = useActionState(upsertUpsellRuleAction, {});
  useToastOnMessage(state);
  const f = state.fields ?? {};
  const [kind, setKind] = useState(
    valueOf(state, "targetKind", rule?.targetPlanId ? "membresia" : "servicio"),
  );
  const channels = valuesOf(state, "channels", rule?.channels ?? [...SALES_CHANNELS]);
  const selectedCenters = valuesOf(state, "centerIds", rule?.centerIds ?? []);
  const serviceOptions = services.map((s) => ({ value: s.id, label: s.name }));
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-md" noValidate>
      {rule ? <input type="hidden" name="id" value={rule.id} /> : null}
      <div className="grid gap-md md:grid-cols-2">
        <Input
          name="name"
          label={upsellCopy.name}
          required
          defaultValue={valueOf(state, "name", rule?.name ?? "")}
          error={f.name}
        />
        <Select
          name="sourceServiceId"
          label={upsellCopy.source}
          options={[{ value: "", label: upsellCopy.anySource }, ...serviceOptions]}
          defaultValue={valueOf(state, "sourceServiceId", rule?.sourceServiceId ?? "")}
        />
        <Select
          name="targetKind"
          label={upsellCopy.targetKind}
          options={[
            { value: "servicio", label: "Servicio o producto" },
            { value: "membresia", label: "Membresía" },
          ]}
          value={kind}
          onChange={(e) => setKind(e.currentTarget.value)}
        />
        {kind === "membresia" ? (
          <Select
            name="targetPlanId"
            label={upsellCopy.targetPlan}
            placeholder="Elige el plan"
            options={plans.map((p) => ({ value: p.id, label: p.name }))}
            defaultValue={valueOf(state, "targetPlanId", rule?.targetPlanId ?? "")}
            error={f.targetServiceId}
          />
        ) : (
          <Select
            name="targetServiceId"
            label={upsellCopy.targetService}
            placeholder="Elige el servicio"
            options={serviceOptions}
            defaultValue={valueOf(state, "targetServiceId", rule?.targetServiceId ?? "")}
            error={f.targetServiceId}
          />
        )}
        <Select
          name="stage"
          label={upsellCopy.stage}
          options={RULE_STAGES.map((s) => ({ value: s, label: RULE_STAGE_LABELS[s] }))}
          defaultValue={valueOf(state, "stage", rule?.stage ?? "diagnostico")}
        />
        <Input
          name="priority"
          label={upsellCopy.priority}
          inputMode="numeric"
          defaultValue={valueOf(state, "priority", String(rule?.priority ?? 50))}
          error={f.priority}
        />
        <Input
          name="startsOn"
          type="date"
          label={upsellCopy.startsOn}
          defaultValue={valueOf(state, "startsOn", rule?.startsOn ?? today)}
          error={f.startsOn}
        />
        <Input
          name="endsOn"
          type="date"
          label={upsellCopy.endsOn}
          defaultValue={valueOf(state, "endsOn", rule?.endsOn ?? "")}
          error={f.endsOn}
        />
        <Input
          name="minOrderTotal"
          label={upsellCopy.minOrderTotal}
          inputMode="decimal"
          defaultValue={valueOf(
            state,
            "minOrderTotal",
            rule?.minOrderTotal != null ? String(rule.minOrderTotal) : "",
          )}
          error={f.minOrderTotal}
        />
      </div>
      <Input
        name="pitch"
        label={upsellCopy.pitch}
        hint={upsellCopy.pitchHint}
        required
        defaultValue={valueOf(state, "pitch", rule?.pitch ?? "")}
        error={f.pitch}
      />
      <fieldset className="flex flex-wrap gap-md">
        <legend className="mg-label">{upsellCopy.channels}</legend>
        {SALES_CHANNELS.map((c) => (
          <Checkbox
            key={c}
            name="channels"
            value={c}
            label={CHANNEL_LABELS[c] ?? c}
            checked={channels.includes(c)}
          />
        ))}
        {f.channels ? (
          <span className="mg-error" role="alert">
            {f.channels}
          </span>
        ) : null}
      </fieldset>
      <fieldset className="flex flex-wrap gap-md">
        <legend className="mg-label">{upsellCopy.centers}</legend>
        {centers.map((c) => (
          <Checkbox
            key={c.id}
            name="centerIds"
            value={c.id}
            label={c.name}
            checked={selectedCenters.includes(c.id)}
          />
        ))}
      </fieldset>
      <Checkbox
        name="active"
        value="on"
        label={upsellCopy.active}
        checked={valueOf(state, "active", rule?.active === false ? "" : "on") === "on"}
      />
      <Input
        name="reason"
        id="rule-reason"
        label={upsellCopy.reason}
        required
        defaultValue={valueOf(state, "reason")}
        error={f.reason}
      />
      {state.error ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {state.error}
        </p>
      ) : null}
      <div>
        <Submit label={upsellCopy.save} variant="primary" />
      </div>
    </form>
  );
}
