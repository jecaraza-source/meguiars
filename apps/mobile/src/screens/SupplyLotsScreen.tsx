import {
  activeCenterAccess,
  newRequestId,
  presentSupplyLot,
  SUPPLY_LOT_OUTCOME_LABELS,
  SUPPLY_LOT_OUTCOMES,
  supplyLotAlert,
  supplyLotsCopy,
  todayIn,
  type InventoryItem,
  type SupplyLot,
  type SupplyLotOutcome,
  type ViewState,
} from "@meguiars/domain";
import { createExecutionRepository, createSupplyLotRepository } from "@meguiars/supabase";
import { closeSupplyLotSchema, fieldErrors, registerSupplyLotSchema } from "@meguiars/validation";
import { space } from "@meguiars/ui-tokens";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, LinkButton, Select } from "@/ui/controls";
import { Badge, Card, EmptyState, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

type Data = { lots: SupplyLot[]; items: InventoryItem[] };

/** Lotes de insumos con caducidad (equivale a /operacion/lotes en web; ADR 0052). */
export function SupplyLotsScreen({ state, header, subnav }: PrivateScreenProps) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const [data, setData] = useState<ViewState<Data>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!client) return;
    let active = true;
    void Promise.all([
      createSupplyLotRepository(client).list(center.id, true),
      createExecutionRepository(client).listInventory(center.organizationId),
    ]).then(([lots, items]) => {
      if (!active) return;
      if (!lots.ok) return setData({ status: "error", message: lots.error.message });
      setData({
        status: "ready",
        data: { lots: lots.data, items: items.ok ? items.data.filter((i) => i.active) : [] },
      });
    });
    return () => {
      active = false;
    };
  }, [client, center.id, center.organizationId, version]);

  const alert = data.status === "ready" ? supplyLotAlert(data.data.lots) : null;
  const lots = data.status === "ready" ? data.data.lots.map(presentSupplyLot) : [];
  const open = lots.filter((l) => l.status === "activo");
  const closed = lots.filter((l) => l.status !== "activo");
  return (
    <Screen title={supplyLotsCopy.title} description={supplyLotsCopy.description} header={header}>
      {subnav}
      {alert ? <Notice tone={alert.tone} text={alert.text} /> : null}
      {data.status === "loading" ? <Skeleton lines={4} label="Cargando lotes" /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <Notice tone="danger" text={data.message} />
      ) : null}
      {data.status === "ready" ? (
        <>
          <Card title={supplyLotsCopy.add}>
            {data.data.items.length ? (
              <RegisterForm
                key={version}
                centerId={center.id}
                today={todayIn(center.timezone)}
                items={data.data.items}
                onDone={reload}
              />
            ) : (
              <Text style={textStyle("body", "muted")}>{supplyLotsCopy.noItems}</Text>
            )}
          </Card>
          <Card title={supplyLotsCopy.title}>
            {open.length === 0 ? <EmptyState title={supplyLotsCopy.empty} /> : null}
            {open.map((l) => (
              <View key={l.id} style={styles.lot}>
                <Text style={textStyle("label")}>{l.item}</Text>
                <View style={styles.row}>
                  <Text style={textStyle("body")}>
                    {supplyLotsCopy.lotCode} {l.lotCode}
                  </Text>
                  <Badge label={l.stateLabel} tone={l.tone} />
                </View>
                <Text style={textStyle("caption", "muted")}>
                  {l.expiry} ({l.expiresOn}) · {l.quantityLabel}
                  {l.notes ? ` · ${l.notes}` : ""}
                </Text>
                <CloseForm lot={l} onDone={reload} />
              </View>
            ))}
          </Card>
          {closed.length ? (
            <Card title={supplyLotsCopy.history}>
              {closed.map((l) => (
                <Text key={l.id} style={textStyle("caption", "muted")}>
                  {l.item} · {supplyLotsCopy.lotCode} {l.lotCode} · {l.stateLabel}
                  {l.closedReason ? ` — ${l.closedReason}` : ""}
                </Text>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function RegisterForm({
  centerId,
  today,
  items,
  onDone,
}: {
  centerId: string;
  today: string;
  items: InventoryItem[];
  onDone: () => void;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const [requestId] = useState(newRequestId);
  const [form, setForm] = useState({
    inventoryItemId: "",
    lotCode: "",
    expiresOn: "",
    receivedOn: today,
    quantity: "",
    notes: "",
  });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    if (!client) return;
    const parsed = registerSupplyLotSchema.safeParse({ ...form, requestId });
    if (!parsed.success) return setFields(fieldErrors(parsed.error));
    setFields({});
    setError(null);
    setBusy(true);
    const r = await createSupplyLotRepository(client).register({ ...parsed.data, detailCenterId: centerId });
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    toast({ message: "Lote registrado.", tone: "success" });
    onDone();
  };
  return (
    <View style={styles.form}>
      <Select
        label={supplyLotsCopy.item}
        required
        placeholder="Elige el insumo"
        options={items.map((i) => ({ value: i.id, label: `${i.name} (${i.code})` }))}
        value={form.inventoryItemId}
        onChange={set("inventoryItemId")}
        error={fields.inventoryItemId}
      />
      <Field
        label={supplyLotsCopy.lotCode}
        required
        value={form.lotCode}
        onChangeText={set("lotCode")}
        autoCapitalize="characters"
        error={fields.lotCode}
      />
      <Field
        label={`${supplyLotsCopy.expiresOn} (AAAA-MM-DD)`}
        required
        value={form.expiresOn}
        onChangeText={set("expiresOn")}
        keyboardType="numbers-and-punctuation"
        error={fields.expiresOn}
      />
      <Field
        label={`${supplyLotsCopy.receivedOn} (AAAA-MM-DD)`}
        value={form.receivedOn}
        onChangeText={set("receivedOn")}
        keyboardType="numbers-and-punctuation"
        error={fields.receivedOn}
      />
      <Field
        label={supplyLotsCopy.quantity}
        value={form.quantity}
        onChangeText={set("quantity")}
        keyboardType="decimal-pad"
        error={fields.quantity}
      />
      <Field
        label={supplyLotsCopy.notes}
        value={form.notes}
        onChangeText={set("notes")}
        error={fields.notes}
      />
      <Button label={supplyLotsCopy.add} loading={busy} onPress={() => void save()} />
      <Notice tone="danger" text={error} />
    </View>
  );
}

function CloseForm({ lot, onDone }: { lot: SupplyLot; onDone: () => void }) {
  const { client } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<SupplyLotOutcome>(lot.state === "caducado" ? "retirado" : "agotado");
  const [reason, setReason] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) return <LinkButton label={supplyLotsCopy.close} onPress={() => setOpen(true)} />;
  const save = async () => {
    if (!client) return;
    const parsed = closeSupplyLotSchema.safeParse({ id: lot.id, version: lot.version, outcome, reason });
    if (!parsed.success) return setFields(fieldErrors(parsed.error));
    setFields({});
    setError(null);
    setBusy(true);
    const r = await createSupplyLotRepository(client).close(parsed.data);
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    toast({ message: "Lote cerrado.", tone: "success" });
    onDone();
  };
  return (
    <View style={styles.form}>
      <Select
        label={supplyLotsCopy.outcome}
        required
        options={SUPPLY_LOT_OUTCOMES.map((o) => ({ value: o, label: SUPPLY_LOT_OUTCOME_LABELS[o] }))}
        value={outcome}
        onChange={(v) => setOutcome(v as SupplyLotOutcome)}
        error={fields.outcome}
      />
      <Field
        label={supplyLotsCopy.reason}
        required
        value={reason}
        onChangeText={setReason}
        error={fields.reason}
      />
      <Button label={supplyLotsCopy.close} variant="secondary" loading={busy} onPress={() => void save()} />
      <Notice tone="danger" text={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  lot: { gap: space.xs, paddingVertical: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  form: { gap: space.sm },
});
