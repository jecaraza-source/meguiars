import { executionCopy, type InventoryItem, type SupplyStandard } from "@meguiars/domain";
import { createExecutionRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { fieldErrors, supplyStandardSchema } from "@meguiars/validation";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, Select } from "@/ui/controls";
import { Card, Skeleton } from "@/ui/display";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";

const qty = (n: number) => new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(n);

/** Insumos estándar por unidad del servicio (equivale a la tarjeta de /catalogo/[id] en web). */
export function SupplyStandardsCard({
  serviceId,
  organizationId,
  editable,
}: {
  serviceId: string;
  organizationId: string;
  editable: boolean;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const [standards, setStandards] = useState<SupplyStandard[] | string | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [version, setVersion] = useState(0);
  const [form, setForm] = useState({ inventoryItemId: "", quantity: "", reason: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const repo = createExecutionRepository(client);
    void Promise.all([
      repo.listStandards(serviceId),
      editable ? repo.listInventory(organizationId) : null,
    ]).then(([s, inv]) => {
      if (!active) return;
      setStandards(s.ok ? s.data : s.error.message);
      if (inv?.ok) setInventory(inv.data);
    });
    return () => {
      active = false;
    };
  }, [client, serviceId, organizationId, editable, version]);

  const save = async (remove: boolean, inventoryItemId = form.inventoryItemId) => {
    if (!client) return;
    const parsed = supplyStandardSchema.safeParse({
      serviceId,
      inventoryItemId,
      quantity: remove ? "" : form.quantity,
      reason: form.reason,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const result = await createExecutionRepository(client).setSupplyStandard(parsed.data);
    setBusy(false);
    if (!result.ok) return setError(result.error.message);
    setError(null);
    toast({ message: executionCopy.saved, tone: "success" });
    setForm({ inventoryItemId: "", quantity: "", reason: "" });
    setVersion((v) => v + 1);
  };

  return (
    <Card title={executionCopy.standardsTitle} subtitle={executionCopy.standardsHint}>
      {standards === null ? <Skeleton lines={2} label="Cargando insumos" /> : null}
      {typeof standards === "string" ? <Notice tone="danger" text={standards} /> : null}
      {Array.isArray(standards) ? (
        standards.length === 0 ? (
          <Text style={textStyle("bodySmall", "muted")}>—</Text>
        ) : (
          standards.map((s) => (
            <View key={s.inventoryItemId} style={styles.row}>
              <Text style={[textStyle("bodySmall"), styles.fill]}>
                {s.name} · {qty(s.quantity)} {s.unit} / unidad
              </Text>
              {editable ? (
                <Button
                  label={executionCopy.standardRemove}
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onPress={() => void save(true, s.inventoryItemId)}
                />
              ) : null}
            </View>
          ))
        )
      ) : null}
      {editable ? (
        <>
          <Select
            label={executionCopy.suppliesTitle}
            options={inventory
              .filter((i) => i.active)
              .map((i) => ({ value: i.id, label: `${i.name} · ${i.code} (${i.unit})` }))}
            value={form.inventoryItemId}
            onChange={(v) => setForm((f) => ({ ...f, inventoryItemId: v }))}
            error={errors.inventoryItemId}
          />
          <Field
            label={executionCopy.standardQuantity}
            keyboardType="decimal-pad"
            value={form.quantity}
            onChangeText={(v) => setForm((f) => ({ ...f, quantity: v }))}
            error={errors.quantity}
          />
          <Field
            label={executionCopy.reason}
            required
            hint="También se pide para quitar un insumo."
            value={form.reason}
            onChangeText={(v) => setForm((f) => ({ ...f, reason: v }))}
            error={errors.reason}
          />
          <Notice tone="danger" text={error} />
          <Button
            label={executionCopy.standardSet}
            variant="secondary"
            loading={busy}
            onPress={() => void save(false)}
          />
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  fill: { flex: 1 },
});
