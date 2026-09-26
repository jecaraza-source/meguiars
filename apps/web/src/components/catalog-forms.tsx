"use client";

import {
  catalogCopy,
  REVENUE_ENGINE_LABELS,
  REVENUE_ENGINES,
  type CatalogItem,
  type Service,
} from "@meguiars/domain";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { configureCenterAction, createServiceAction, updateServiceAction } from "@/app/actions/catalog";
import type { ActionFormState } from "@/lib/form-data";
import { Button } from "./ui/button";
import { Checkbox, Input, Select } from "./ui/field";
import { useToast } from "./ui/overlay";

const engineOptions = REVENUE_ENGINES.map((e) => ({ value: e, label: REVENUE_ENGINE_LABELS[e] }));

function Submit({ label, variant }: { label: string; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" label={label} loading={pending} variant={variant} />;
}

function Alert({ text }: { text?: string | undefined }) {
  if (!text) return null;
  return (
    <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
      {text}
    </p>
  );
}

const valueOf = (state: ActionFormState, key: string, fallback = "") => {
  const v = state.values?.[key];
  return typeof v === "string" ? v : fallback;
};

function useSuccessToast(state: ActionFormState) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

function ServiceFields({ state, service }: { state: ActionFormState; service?: Service }) {
  const f = state.fields ?? {};
  return (
    <div className="grid gap-lg md:grid-cols-2">
      <Input
        name="name"
        label={catalogCopy.nameLabel}
        required
        defaultValue={valueOf(state, "name", service?.name ?? "")}
        error={f.name}
      />
      <Select
        name="revenueEngine"
        label={catalogCopy.engineLabel}
        required
        placeholder="Elige el motor"
        options={engineOptions}
        defaultValue={valueOf(state, "revenueEngine", service?.revenueEngine ?? "")}
        error={f.revenueEngine}
      />
      <Input
        name="standardDurationMinutes"
        label={catalogCopy.durationLabel}
        required
        inputMode="numeric"
        defaultValue={valueOf(
          state,
          "standardDurationMinutes",
          service ? String(service.standardDurationMinutes) : "",
        )}
        error={f.standardDurationMinutes}
      />
      <Input
        name="basePrice"
        label={catalogCopy.priceLabel}
        required
        inputMode="decimal"
        defaultValue={valueOf(state, "basePrice", service ? String(service.basePrice) : "")}
        error={f.basePrice}
      />
      <Input
        name="standardDirectCost"
        label={catalogCopy.costLabel}
        required
        inputMode="decimal"
        defaultValue={valueOf(state, "standardDirectCost", service ? String(service.standardDirectCost) : "")}
        error={f.standardDirectCost}
      />
      <Input
        name="description"
        label={catalogCopy.descriptionLabel}
        defaultValue={valueOf(state, "description", service?.description ?? "")}
        error={f.description}
      />
    </div>
  );
}

export function NewServiceForm() {
  const [state, action] = useActionState(createServiceAction, {});
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-lg" noValidate>
      <Input
        name="code"
        label={catalogCopy.codeLabel}
        hint={catalogCopy.codeHint}
        required
        autoCapitalize="characters"
        defaultValue={valueOf(state, "code")}
        error={state.fields?.code}
      />
      <ServiceFields state={state} />
      <Alert text={state.error} />
      <div>
        <Submit label={catalogCopy.submitCreate} />
      </div>
    </form>
  );
}

export function EditServiceForm({ service }: { service: Service }) {
  const [state, action] = useActionState(updateServiceAction, {});
  useSuccessToast(state);
  const active = state.values ? state.values.active === "1" : service.active;
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-lg" noValidate>
      <input type="hidden" name="id" value={service.id} />
      <ServiceFields state={state} service={service} />
      <div className="flex flex-col gap-xs">
        <Checkbox name="active" value="1" label={catalogCopy.activeLabel} checked={active} />
        <span className="mg-hint">{catalogCopy.deactivateHint}</span>
      </div>
      <Input
        name="reason"
        label={catalogCopy.reasonLabel}
        required
        defaultValue={valueOf(state, "reason")}
        error={state.fields?.reason}
      />
      <Alert text={state.error} />
      <div>
        <Submit label={catalogCopy.submitUpdate} />
      </div>
    </form>
  );
}

export function CenterConfigForm({ item }: { item: CatalogItem }) {
  const [state, action] = useActionState(configureCenterAction, {});
  useSuccessToast(state);
  const f = state.fields ?? {};
  const available = state.values ? state.values.available === "1" : item.available;
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-lg" noValidate>
      <input type="hidden" name="serviceId" value={item.id} />
      <Checkbox name="available" value="1" label={catalogCopy.availableLabel} checked={available} />
      <div className="grid gap-lg md:grid-cols-2">
        <Input
          name="priceOverride"
          label={catalogCopy.priceOverrideLabel}
          inputMode="decimal"
          defaultValue={valueOf(
            state,
            "priceOverride",
            item.price !== item.basePrice ? String(item.price) : "",
          )}
          error={f.priceOverride}
        />
        <Input
          name="directCostOverride"
          label={catalogCopy.costOverrideLabel}
          inputMode="decimal"
          defaultValue={valueOf(
            state,
            "directCostOverride",
            item.directCost !== item.standardDirectCost ? String(item.directCost) : "",
          )}
          error={f.directCostOverride}
        />
      </div>
      <Input
        name="centerReason"
        label={catalogCopy.reasonLabel}
        required
        defaultValue={valueOf(state, "centerReason")}
        error={f.centerReason}
      />
      <Alert text={state.error} />
      <div>
        <Submit label={catalogCopy.submitCenter} variant="secondary" />
      </div>
    </form>
  );
}
