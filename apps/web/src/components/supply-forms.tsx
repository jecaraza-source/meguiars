"use client";

import {
  executionCopy,
  INVENTORY_UNIT_LABELS,
  INVENTORY_UNITS,
  type InventoryItem,
  type SupplyStandard,
} from "@meguiars/domain";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  setSupplyStandardAction,
  upsertInventoryItemAction,
  type ExecutionFormState,
} from "@/app/actions/execution";
import { Button } from "./ui/button";
import { Checkbox, Input, Select } from "./ui/field";
import { useToast } from "./ui/overlay";

function Submit({
  label,
  variant,
  name,
  value,
}: {
  label: string;
  variant?: "primary" | "secondary" | "danger";
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

const valueOf = (state: ExecutionFormState, key: string, fallback = "") => {
  const v = state.values?.[key];
  return typeof v === "string" ? v : fallback;
};

function useSuccessToast(state: ExecutionFormState) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

const unitOptions = INVENTORY_UNITS.map((u) => ({ value: u, label: INVENTORY_UNIT_LABELS[u] }));

/** Alta (sin `item`) o edición de un insumo de la organización. */
export function InventoryItemForm({ item }: { item?: InventoryItem }) {
  const [state, action] = useActionState(upsertInventoryItemAction, {});
  useSuccessToast(state);
  const f = state.fields ?? {};
  const p = item ? `inv-${item.id}` : "inv-new";
  // Un alta exitosa limpia el formulario; una edición conserva lo guardado.
  const keep = !state.message || item;
  const v = (key: string, fallback: string) => (keep ? valueOf(state, key, fallback) : fallback);
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-sm" noValidate>
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <div className="grid gap-md md:grid-cols-4">
        <Input
          name="code"
          id={`${p}-code`}
          label={executionCopy.supplyCode}
          required
          defaultValue={v("code", item?.code ?? "")}
          error={f.code}
        />
        <Input
          name="name"
          id={`${p}-name`}
          label={executionCopy.supplyName}
          required
          defaultValue={v("name", item?.name ?? "")}
          error={f.name}
        />
        <Select
          name="unit"
          id={`${p}-unit`}
          label={executionCopy.supplyUnit}
          options={unitOptions}
          defaultValue={v("unit", item?.unit ?? "ml")}
          error={f.unit}
        />
        <Input
          name="unitCost"
          id={`${p}-cost`}
          label={executionCopy.supplyCost}
          inputMode="decimal"
          required
          defaultValue={v("unitCost", item ? String(item.unitCost) : "")}
          error={f.unitCost}
        />
      </div>
      <div className="grid gap-md md:grid-cols-2">
        <Input
          name="reason"
          id={`${p}-reason`}
          label={executionCopy.reason}
          required
          defaultValue={keep ? valueOf(state, "reason") : ""}
          error={f.reason}
        />
        <Checkbox
          name="active"
          id={`${p}-active`}
          value="1"
          label="Activo"
          checked={item ? item.active : true}
        />
      </div>
      <Alert text={state.error} />
      <div>
        <Submit
          label={item ? executionCopy.supplySave : executionCopy.supplyAdd}
          variant={item ? "secondary" : "primary"}
        />
      </div>
    </form>
  );
}

/** Insumos estándar por unidad de un servicio (admin corporativo edita). */
export function SupplyStandards({
  serviceId,
  standards,
  inventory,
  editable,
}: {
  serviceId: string;
  standards: SupplyStandard[];
  inventory: InventoryItem[];
  editable: boolean;
}) {
  const [state, action] = useActionState(setSupplyStandardAction, {});
  useSuccessToast(state);
  const [removing, setRemoving] = useState<string | null>(null);
  const f = state.fields ?? {};
  const configured = new Set(standards.map((s) => s.inventoryItemId));
  const qty = (n: number) => new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(n);
  return (
    <div className="flex flex-col gap-md" key={state.at ?? 0}>
      <p className="text-sm text-muted">{executionCopy.standardsHint}</p>
      {standards.length === 0 ? <p className="text-sm">—</p> : null}
      <ul aria-label={executionCopy.standardsTitle} className="flex flex-col gap-sm">
        {standards.map((s) => (
          <li key={s.inventoryItemId} className="mg-card flex flex-col gap-sm text-sm">
            <div className="flex flex-wrap justify-between gap-sm">
              <span className="font-semibold">
                {s.name} · {s.code}
              </span>
              <span>
                {qty(s.quantity)} {s.unit} / unidad
              </span>
            </div>
            {editable ? (
              removing === s.inventoryItemId ? (
                <form action={action} className="flex flex-wrap items-end gap-sm" noValidate>
                  <input type="hidden" name="serviceId" value={serviceId} />
                  <input type="hidden" name="inventoryItemId" value={s.inventoryItemId} />
                  <div className="flex-1">
                    <Input
                      name="reason"
                      id={`std-remove-${s.inventoryItemId}`}
                      label={executionCopy.reason}
                      required
                      error={f.reason}
                    />
                  </div>
                  <Submit
                    label={executionCopy.standardRemove}
                    variant="danger"
                    name="intent"
                    value="remove"
                  />
                </form>
              ) : (
                <div>
                  <Button
                    label={executionCopy.standardRemove}
                    variant="secondary"
                    size="sm"
                    onClick={() => setRemoving(s.inventoryItemId)}
                  />
                </div>
              )
            ) : null}
          </li>
        ))}
      </ul>
      {editable ? (
        <form action={action} className="flex flex-col gap-sm" noValidate>
          <input type="hidden" name="serviceId" value={serviceId} />
          <div className="grid gap-md md:grid-cols-3">
            <Select
              name="inventoryItemId"
              id="std-item"
              label={executionCopy.suppliesTitle}
              placeholder="Elige"
              options={inventory
                .filter((i) => i.active)
                .map((i) => ({
                  value: i.id,
                  label: `${i.name} · ${i.code} (${i.unit})${configured.has(i.id) ? " ✓" : ""}`,
                }))}
              defaultValue={valueOf(state, "inventoryItemId")}
              error={f.inventoryItemId}
            />
            <Input
              name="quantity"
              id="std-quantity"
              label={executionCopy.standardQuantity}
              inputMode="decimal"
              required
              defaultValue={valueOf(state, "quantity")}
              error={f.quantity}
            />
            <Input
              name="reason"
              id="std-reason"
              label={executionCopy.reason}
              required
              defaultValue={valueOf(state, "reason")}
              error={removing ? undefined : f.reason}
            />
          </div>
          <div>
            <Submit label={executionCopy.standardSet} variant="secondary" />
          </div>
        </form>
      ) : null}
      <Alert text={state.error} />
    </div>
  );
}
