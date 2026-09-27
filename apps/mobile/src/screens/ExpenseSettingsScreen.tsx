import {
  activeCenterAccess,
  can,
  canInActiveCenter,
  expenseErrorMessage,
  expensesCopy,
  formatMoney,
  PNL_GROUP_LABELS,
  PNL_GROUPS,
  type ExpenseCategory,
  type Vendor,
  type ViewState,
} from "@meguiars/domain";
import { createExpenseRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Checkbox, Field, LinkButton, Select } from "@/ui/controls";
import { Badge, Card, EmptyState, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

interface Loaded {
  threshold: number | null;
  vendors: Vendor[];
  categories: ExpenseCategory[];
}

/** Umbral, proveedores y categorías (equivale a /finanzas/egresos/configuracion en web). */
export function ExpenseSettingsScreen({
  state,
  header,
  onBack,
}: PrivateScreenProps & { onBack: () => void }) {
  const { client } = useAuth();
  const toast = useToast();
  const access = activeCenterAccess(state)!;
  const center = access.center;
  const [data, setData] = useState<ViewState<Loaded>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const repo = createExpenseRepository(client);
    void Promise.all([
      repo.threshold(center.id),
      repo.vendors(center.organizationId),
      repo.categories(center.organizationId),
    ]).then(([t, v, c]) => {
      if (!active) return;
      setData(
        c.ok
          ? {
              status: "ready",
              data: { threshold: t.ok ? t.data : null, vendors: v.ok ? v.data : [], categories: c.data },
            }
          : { status: "error", message: expenseErrorMessage(c.error) },
      );
    });
    return () => {
      active = false;
    };
  }, [client, center.id, center.organizationId, version]);

  const done =
    (message: string) => (r: { ok: boolean; error?: { kind: string; code?: string; message: string } }) => {
      if (!r.ok && r.error) return expenseErrorMessage(r.error);
      toast({ message, tone: "success" });
      setEditing(null);
      reload();
      return null;
    };
  const canApprove = canInActiveCenter(state, "expenses.approve");
  const canWrite = canInActiveCenter(state, "expenses.write");
  const canManage = can(access.corporateRoles, "expenses.manage");

  return (
    <Screen title={expensesCopy.settingsTitle} description={center.name} header={header}>
      <LinkButton label={`← ${expensesCopy.title}`} onPress={onBack} />
      {data.status === "loading" ? <Skeleton lines={5} label="Cargando" /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" ? (
        <>
          <Card
            title={expensesCopy.threshold}
            subtitle={
              data.data.threshold === null
                ? expensesCopy.noApproval
                : expensesCopy.approvalHint(formatMoney(data.data.threshold))
            }
          >
            {canApprove ? (
              <ThresholdBox
                key={`t-${version}`}
                threshold={data.data.threshold}
                run={(t, reason) =>
                  createExpenseRepository(client!)
                    .setThreshold(center.id, t, reason)
                    .then(done(expensesCopy.thresholdSaved))
                }
              />
            ) : (
              <Text style={textStyle("caption", "muted")}>{expensesCopy.readOnly}</Text>
            )}
          </Card>
          <Card title={expensesCopy.vendors}>
            {data.data.vendors.map((v) => (
              <View key={v.id} style={styles.item}>
                <Text style={textStyle("bodySmall")}>
                  {v.name}
                  {v.rfc ? ` · ${v.rfc}` : ""}
                </Text>
                {!v.active ? <Badge label="Inactivo" tone="neutral" /> : null}
                {canWrite && editing !== v.id ? (
                  <LinkButton label="Editar" onPress={() => setEditing(v.id)} />
                ) : null}
                {canWrite && editing === v.id ? (
                  <VendorBox
                    vendor={v}
                    run={(input) =>
                      createExpenseRepository(client!)
                        .upsertVendor({ ...input, detailCenterId: center.id })
                        .then(done(expensesCopy.vendorSaved))
                    }
                  />
                ) : null}
              </View>
            ))}
            {canWrite && editing !== "new-vendor" ? (
              <LinkButton label={expensesCopy.newVendor} onPress={() => setEditing("new-vendor")} />
            ) : null}
            {canWrite && editing === "new-vendor" ? (
              <VendorBox
                run={(input) =>
                  createExpenseRepository(client!)
                    .upsertVendor({ ...input, detailCenterId: center.id })
                    .then(done(expensesCopy.vendorSaved))
                }
              />
            ) : null}
          </Card>
          <Card title={expensesCopy.categories} subtitle={expensesCopy.categoryHint}>
            {data.data.categories.map((c) => (
              <View key={c.id} style={styles.item}>
                <Text style={textStyle("bodySmall")}>
                  {c.name} · {PNL_GROUP_LABELS[c.pnlGroup]}
                </Text>
                {!c.active ? <Badge label="Inactiva" tone="neutral" /> : null}
                {canManage && editing !== c.id ? (
                  <LinkButton label="Editar" onPress={() => setEditing(c.id)} />
                ) : null}
                {canManage && editing === c.id ? (
                  <CategoryBox
                    category={c}
                    run={(input) =>
                      createExpenseRepository(client!)
                        .upsertCategory({ ...input, organizationId: center.organizationId })
                        .then(done(expensesCopy.categorySaved))
                    }
                  />
                ) : null}
              </View>
            ))}
            {canManage && editing !== "new-category" ? (
              <LinkButton label={expensesCopy.newCategory} onPress={() => setEditing("new-category")} />
            ) : null}
            {canManage && editing === "new-category" ? (
              <CategoryBox
                run={(input) =>
                  createExpenseRepository(client!)
                    .upsertCategory({ ...input, organizationId: center.organizationId })
                    .then(done(expensesCopy.categorySaved))
                }
              />
            ) : null}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function ThresholdBox({
  threshold,
  run,
}: {
  threshold: number | null;
  run: (t: number | null, reason: string) => Promise<string | null>;
}) {
  const [value, setValue] = useState(threshold === null ? "" : String(threshold));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <View style={styles.form}>
      <Field
        label={expensesCopy.threshold}
        hint={expensesCopy.thresholdHint}
        keyboardType="decimal-pad"
        value={value}
        onChangeText={setValue}
      />
      <Field label={expensesCopy.reason} value={reason} onChangeText={setReason} maxLength={500} />
      <Notice tone="danger" text={error} />
      <Button
        label={expensesCopy.saveThreshold}
        loading={busy}
        onPress={() => {
          const n = Number(value.replace(/[$,\s]/g, ""));
          setBusy(true);
          void run(value.trim() === "" ? null : n, reason).then((msg) => {
            setBusy(false);
            setError(msg);
          });
        }}
      />
    </View>
  );
}

function VendorBox({
  vendor,
  run,
}: {
  vendor?: Vendor;
  run: (input: {
    vendorId?: string;
    name: string;
    rfc?: string;
    phone?: string;
    email?: string;
    active: boolean;
  }) => Promise<string | null>;
}) {
  const [v, setV] = useState({
    name: vendor?.name ?? "",
    rfc: vendor?.rfc ?? "",
    phone: vendor?.phone ?? "",
    email: vendor?.email ?? "",
  });
  const [active, setActive] = useState(vendor?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  return (
    <View style={styles.form}>
      <Field label={expensesCopy.vendorName} value={v.name} onChangeText={set("name")} />
      <Field label={expensesCopy.rfc} value={v.rfc} onChangeText={set("rfc")} autoCapitalize="characters" />
      <Field
        label={expensesCopy.phone}
        value={v.phone}
        onChangeText={set("phone")}
        keyboardType="phone-pad"
      />
      <Field
        label={expensesCopy.email}
        value={v.email}
        onChangeText={set("email")}
        keyboardType="email-address"
      />
      <Checkbox label={expensesCopy.vendorActive} checked={active} onChange={setActive} />
      <Notice tone="danger" text={error} />
      <Button
        label={expensesCopy.saveVendor}
        loading={busy}
        onPress={() => {
          setBusy(true);
          void run({ ...(vendor ? { vendorId: vendor.id } : {}), ...v, active }).then((msg) => {
            setBusy(false);
            setError(msg);
          });
        }}
      />
    </View>
  );
}

function CategoryBox({
  category,
  run,
}: {
  category?: ExpenseCategory;
  run: (input: {
    categoryId?: string;
    code: string;
    name: string;
    pnlGroup: ExpenseCategory["pnlGroup"];
    position: number;
    active: boolean;
    reason: string;
  }) => Promise<string | null>;
}) {
  const [c, setC] = useState({
    code: category?.code ?? "",
    name: category?.name ?? "",
    pnlGroup: category?.pnlGroup ?? "",
    position: String(category?.position ?? 50),
    reason: "",
  });
  const [active, setActive] = useState(category?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof c) => (x: string) => setC((s) => ({ ...s, [k]: x }));
  return (
    <View style={styles.form}>
      {!category ? (
        <Field label={expensesCopy.categoryCode} value={c.code} onChangeText={set("code")} />
      ) : null}
      <Field label={expensesCopy.categoryName} value={c.name} onChangeText={set("name")} />
      <Select
        label={expensesCopy.group}
        placeholder="Elige"
        options={PNL_GROUPS.map((g) => ({ value: g, label: PNL_GROUP_LABELS[g] }))}
        value={c.pnlGroup}
        onChange={set("pnlGroup")}
      />
      <Field
        label={expensesCopy.position}
        value={c.position}
        onChangeText={set("position")}
        keyboardType="number-pad"
      />
      <Field label={expensesCopy.reason} value={c.reason} onChangeText={set("reason")} maxLength={500} />
      <Checkbox label={expensesCopy.active} checked={active} onChange={setActive} />
      <Notice tone="danger" text={error} />
      <Button
        label={expensesCopy.saveCategory}
        loading={busy}
        onPress={() => {
          setBusy(true);
          void run({
            ...(category ? { categoryId: category.id } : {}),
            code: c.code,
            name: c.name,
            pnlGroup: c.pnlGroup as ExpenseCategory["pnlGroup"],
            position: Number(c.position),
            active,
            reason: c.reason,
          }).then((msg) => {
            setBusy(false);
            setError(msg);
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  item: { gap: space.xxs, marginBottom: space.sm },
  form: { gap: space.sm },
});
