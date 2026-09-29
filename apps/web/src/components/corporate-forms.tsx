"use client";

import { corporateCopy } from "@meguiars/domain";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { deleteKpiThresholdAction, saveKpiThresholdAction } from "@/app/actions/corporate";
import { Button } from "./ui/button";
import { Input, Select } from "./ui/field";
import { useToast } from "./ui/overlay";

function Submit({ label, variant }: { label: string; variant?: "secondary" | "danger" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" label={label} loading={pending} size="sm" {...(variant ? { variant } : {})} />;
}

/** Alta o reemplazo de un umbral (admin corporativo; la base lo vuelve a validar). */
export function KpiThresholdForm({
  organizationId,
  cards,
  centers,
}: {
  organizationId: string;
  cards: readonly { id: string; name: string }[];
  centers: readonly { id: string; name: string }[];
}) {
  const [state, action] = useActionState(saveKpiThresholdAction, {});
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
  const f = state.fields ?? {};
  const v = (k: string) => (typeof state.values?.[k] === "string" ? (state.values[k] as string) : "");
  return (
    <form key={state.at} action={action} className="flex flex-col gap-md" data-testid="threshold-form">
      <input type="hidden" name="organizationId" value={organizationId} />
      {state.error ? (
        <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
          {state.error}
        </p>
      ) : null}
      <div className="grid gap-md md:grid-cols-2 lg:grid-cols-4">
        <Select
          name="cardId"
          label={corporateCopy.card}
          defaultValue={v("cardId") || cards[0]?.id}
          error={f.cardId}
          options={cards.map((c) => ({ value: c.id, label: c.name }))}
          required
        />
        <Select
          name="detailCenterId"
          label={corporateCopy.center}
          defaultValue={v("detailCenterId")}
          options={[
            { value: "", label: corporateCopy.allCentersOption },
            ...centers.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <Input
          name="minValue"
          label={corporateCopy.min}
          inputMode="decimal"
          defaultValue={v("minValue")}
          error={f.minValue}
        />
        <Input
          name="maxValue"
          label={corporateCopy.max}
          inputMode="decimal"
          defaultValue={v("maxValue")}
          error={f.maxValue}
        />
      </div>
      <Input name="reason" id="threshold-reason" label={corporateCopy.reason} error={f.reason} required />
      <div>
        <Submit label={corporateCopy.save} />
      </div>
    </form>
  );
}

/** Quita un umbral con motivo; al guardarse la fila desaparece (si falla, el error queda en la fila). */
export function DeleteThresholdForm({ id }: { id: string }) {
  const [state, action] = useActionState(deleteKpiThresholdAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-sm">
      <input type="hidden" name="id" value={id} />
      <label className="mg-field">
        <span className="sr-only">{corporateCopy.reason}</span>
        <input
          name="reason"
          required
          placeholder={corporateCopy.reason}
          className="mg-input"
          data-size="sm"
        />
      </label>
      <Submit label={corporateCopy.remove} variant="secondary" />
      {state.error ? (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
