import {
  activeCenterAccess,
  canManageServices,
  catalogCopy,
  executionCopy,
  formatUnitCost,
  INVENTORY_UNIT_LABELS,
  INVENTORY_UNITS,
  type InventoryItem,
  type ViewState,
} from "@meguiars/domain";
import { createExecutionRepository } from "@meguiars/supabase";
import { fieldErrors, inventoryItemSchema } from "@meguiars/validation";
import { useCallback, useEffect, useState } from "react";
import { Text } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Checkbox, Field, LinkButton, Select } from "@/ui/controls";
import { Badge, Card, EmptyState, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

/** Insumos de la organización (equivale a /catalogo/insumos en web). Sin existencias ni almacén. */
export function SuppliesScreen({ state, header, onBack }: PrivateScreenProps & { onBack: () => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const manage = canManageServices(state);
  const [data, setData] = useState<ViewState<InventoryItem[]>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void createExecutionRepository(client)
      .listInventory(center.organizationId)
      .then((r) => {
        if (active)
          setData(r.ok ? { status: "ready", data: r.data } : { status: "error", message: r.error.message });
      });
    return () => {
      active = false;
    };
  }, [client, center.organizationId, version]);

  return (
    <Screen
      title={executionCopy.suppliesTitle}
      description={executionCopy.suppliesDescription}
      header={header}
    >
      <LinkButton label={`← ${catalogCopy.title}`} onPress={onBack} />
      {manage ? (
        <ItemForm key={`new-${version}`} organizationId={center.organizationId} onDone={reload} />
      ) : null}
      {data.status === "loading" ? <Skeleton lines={4} label="Cargando insumos" /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" && data.data.length === 0 ? <EmptyState title="—" /> : null}
      {data.status === "ready"
        ? data.data.map((i) =>
            manage ? (
              <ItemForm
                key={`${i.id}-${version}`}
                organizationId={center.organizationId}
                item={i}
                onDone={reload}
              />
            ) : (
              <Card key={i.id} title={`${i.name} · ${i.code}`}>
                <Text style={textStyle("bodySmall")}>
                  {INVENTORY_UNIT_LABELS[i.unit]} · {formatUnitCost(i.unitCost)}
                </Text>
                {!i.active ? <Badge label={executionCopy.supplyInactive} /> : null}
              </Card>
            ),
          )
        : null}
    </Screen>
  );
}

function ItemForm({
  organizationId,
  item,
  onDone,
}: {
  organizationId: string;
  item?: InventoryItem;
  onDone: () => void;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const [values, setValues] = useState({
    code: item?.code ?? "",
    name: item?.name ?? "",
    unit: item?.unit ?? "ml",
    unitCost: item ? String(item.unitCost) : "",
    reason: "",
  });
  const [active, setActive] = useState(item?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof values, v: string) => setValues((s) => ({ ...s, [key]: v }));

  const submit = async () => {
    if (!client) return;
    const parsed = inventoryItemSchema.safeParse({ ...values, organizationId, id: item?.id, active });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const result = await createExecutionRepository(client).upsertInventoryItem(parsed.data);
    setBusy(false);
    if (!result.ok) {
      return setError(result.error.code === "23505" ? catalogCopy.codeTaken : result.error.message);
    }
    toast({ message: executionCopy.saved, tone: "success" });
    onDone();
  };

  return (
    <Card title={item ? `${item.name} · ${item.code}` : executionCopy.supplyAdd}>
      <Field
        label={executionCopy.supplyCode}
        required
        value={values.code}
        onChangeText={(v) => set("code", v)}
        error={errors.code}
      />
      <Field
        label={executionCopy.supplyName}
        required
        value={values.name}
        onChangeText={(v) => set("name", v)}
        error={errors.name}
      />
      <Select
        label={executionCopy.supplyUnit}
        options={INVENTORY_UNITS.map((u) => ({ value: u, label: INVENTORY_UNIT_LABELS[u] }))}
        value={values.unit}
        onChange={(v) => set("unit", v)}
        error={errors.unit}
      />
      <Field
        label={executionCopy.supplyCost}
        required
        keyboardType="decimal-pad"
        value={values.unitCost}
        onChangeText={(v) => set("unitCost", v)}
        error={errors.unitCost}
      />
      <Field
        label={executionCopy.reason}
        required
        value={values.reason}
        onChangeText={(v) => set("reason", v)}
        error={errors.reason}
      />
      <Checkbox label="Activo" checked={active} onChange={setActive} />
      <Notice tone="danger" text={error} />
      <Button
        label={item ? executionCopy.supplySave : executionCopy.supplyAdd}
        variant={item ? "secondary" : "primary"}
        loading={busy}
        onPress={() => void submit()}
      />
    </Card>
  );
}
