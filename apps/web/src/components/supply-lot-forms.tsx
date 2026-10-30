"use client";

import {
  SUPPLY_LOT_OUTCOME_LABELS,
  SUPPLY_LOT_OUTCOMES,
  supplyLotsCopy,
  type InventoryItem,
  type SupplyLot,
} from "@meguiars/domain";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import {
  closeSupplyLotAction,
  registerSupplyLotAction,
  type SupplyLotFormState,
} from "@/app/actions/supply-lots";
import { Button } from "./ui/button";
import { Input, Select } from "./ui/field";
import { useToast } from "./ui/overlay";

function Submit({ label, variant }: { label: string; variant?: "primary" | "secondary" | "danger" }) {
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

function useSuccessToast(state: SupplyLotFormState) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

const valueOf = (state: SupplyLotFormState, key: string) => {
  const v = state.values?.[key];
  return typeof v === "string" ? v : "";
};

/** Alta de un lote; requestId viene del servidor y cambia en cada carga (idempotencia). */
export function RegisterSupplyLotForm({
  items,
  requestId,
  today,
}: {
  items: InventoryItem[];
  requestId: string;
  today: string;
}) {
  const [state, action] = useActionState(registerSupplyLotAction, {});
  useSuccessToast(state);
  const f = state.fields ?? {};
  const keep = !state.message;
  const v = (k: string, fallback = "") => (keep ? valueOf(state, k) || fallback : fallback);
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-sm" noValidate>
      <input type="hidden" name="requestId" value={requestId} />
      <Select
        name="inventoryItemId"
        label={supplyLotsCopy.item}
        required
        placeholder="Elige el insumo"
        options={items.map((i) => ({ value: i.id, label: `${i.name} (${i.code})` }))}
        defaultValue={v("inventoryItemId")}
        error={f.inventoryItemId}
      />
      <Input
        name="lotCode"
        label={supplyLotsCopy.lotCode}
        required
        defaultValue={v("lotCode")}
        error={f.lotCode}
      />
      <Input
        name="expiresOn"
        type="date"
        label={supplyLotsCopy.expiresOn}
        required
        defaultValue={v("expiresOn")}
        error={f.expiresOn}
      />
      <Input
        name="receivedOn"
        type="date"
        label={supplyLotsCopy.receivedOn}
        max={today}
        defaultValue={v("receivedOn", today)}
        error={f.receivedOn}
      />
      <Input
        name="quantity"
        inputMode="decimal"
        label={supplyLotsCopy.quantity}
        defaultValue={v("quantity")}
        error={f.quantity}
      />
      <Input name="notes" label={supplyLotsCopy.notes} defaultValue={v("notes")} error={f.notes} />
      <Submit label={supplyLotsCopy.add} />
      <Alert text={state.error} />
    </form>
  );
}

/** Cerrar un lote: se terminó o se sacó, con motivo. */
export function CloseSupplyLotForm({ lot }: { lot: SupplyLot }) {
  const [state, action] = useActionState(closeSupplyLotAction, {});
  useSuccessToast(state);
  const f = state.fields ?? {};
  return (
    <details className="text-sm">
      <summary className="cursor-pointer underline">{supplyLotsCopy.close}</summary>
      <form key={state.at ?? 0} action={action} className="flex flex-col gap-sm pt-sm" noValidate>
        <input type="hidden" name="id" value={lot.id} />
        <input type="hidden" name="version" value={lot.version} />
        <Select
          name="outcome"
          id={`outcome-${lot.id}`}
          label={supplyLotsCopy.outcome}
          required
          options={SUPPLY_LOT_OUTCOMES.map((o) => ({ value: o, label: SUPPLY_LOT_OUTCOME_LABELS[o] }))}
          defaultValue={valueOf(state, "outcome") || (lot.state === "caducado" ? "retirado" : "agotado")}
          error={f.outcome}
        />
        <Input
          name="reason"
          id={`reason-${lot.id}`}
          label={supplyLotsCopy.reason}
          required
          defaultValue={valueOf(state, "reason")}
          error={f.reason}
        />
        <Submit label={supplyLotsCopy.close} variant="secondary" />
        <Alert text={state.error} />
      </form>
    </details>
  );
}
