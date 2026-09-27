import {
  activeCenterAccess,
  addDays,
  can,
  canInActiveCenter,
  EXPENSE_STATUS_LABELS,
  EXPENSE_STATUSES,
  expenseErrorMessage,
  expensesCopy,
  formatMoney,
  PNL_GROUP_LABELS,
  PNL_GROUPS,
  presentExpenseRow,
  todayIn,
  usableCenters,
  type ExpenseCategory,
  type ExpenseListItem,
  type ExpenseStatus,
  type PnlGroup,
  type Vendor,
  type ViewState,
} from "@meguiars/domain";
import { createExpenseRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, LinkButton, Select } from "@/ui/controls";
import { Badge, Card, EmptyState, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

interface Loaded {
  rows: ExpenseListItem[];
  categories: ExpenseCategory[];
  vendors: Vendor[];
}

/** Egresos con filtros (equivale a /finanzas/egresos en web). */
export function ExpensesScreen({
  state,
  header,
  subnav,
  onOpen,
  onNew,
  onSettings,
}: PrivateScreenProps & { onOpen: (id: string) => void; onNew: () => void; onSettings: () => void }) {
  const { client } = useAuth();
  const center = activeCenterAccess(state)!.center;
  const today = todayIn(center.timezone);
  const [draft, setDraft] = useState({
    from: addDays(today, -29),
    to: today,
    categoryId: "",
    vendorId: "",
    status: "",
    pnlGroup: "",
  });
  const [filter, setFilter] = useState(draft);
  const [all, setAll] = useState(false);
  const [loaded, setLoaded] = useState<{ key: string; view: ViewState<Loaded> } | null>(null);
  const queryKey = JSON.stringify({ filter, all, center: center.id });
  const data: ViewState<Loaded> = loaded?.key === queryKey ? loaded.view : { status: "loading" };

  useEffect(() => {
    if (!client) return;
    let active = true;
    const centers = all
      ? usableCenters(state.access)
          .filter((a) => can([...a.roles, ...a.corporateRoles], "expenses.read"))
          .map((a) => a.center.id)
      : [center.id];
    const repo = createExpenseRepository(client);
    void Promise.all([
      repo.list({
        detailCenterIds: centers,
        from: filter.from,
        to: filter.to,
        categoryId: filter.categoryId || undefined,
        vendorId: filter.vendorId || undefined,
        status: (filter.status || undefined) as ExpenseStatus | undefined,
        pnlGroup: (filter.pnlGroup || undefined) as PnlGroup | undefined,
      }),
      repo.categories(center.organizationId),
      repo.vendors(center.organizationId),
    ]).then(([l, c, v]) => {
      if (!active) return;
      setLoaded({
        key: queryKey,
        view: l.ok
          ? {
              status: "ready",
              data: { rows: l.data, categories: c.ok ? c.data : [], vendors: v.ok ? v.data : [] },
            }
          : { status: "error", message: expenseErrorMessage(l.error) },
      });
    });
    return () => {
      active = false;
    };
  }, [client, filter, all, center.id, center.organizationId, state.access, queryKey]);

  const set = (k: keyof typeof draft) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const lists = data.status === "ready" ? data.data : { categories: [], vendors: [] };
  const approved = data.status === "ready" ? data.data.rows.filter((r) => r.status === "aprobado") : [];

  return (
    <Screen title={expensesCopy.title} description={expensesCopy.description} header={header}>
      {subnav}
      {canInActiveCenter(state, "expenses.write") ? (
        <Button label={expensesCopy.newExpense} onPress={onNew} />
      ) : null}
      <LinkButton label={expensesCopy.settingsTitle} onPress={onSettings} />
      <Card title={expensesCopy.filters}>
        <Field label={`${expensesCopy.from} (AAAA-MM-DD)`} value={draft.from} onChangeText={set("from")} />
        <Field label={`${expensesCopy.to} (AAAA-MM-DD)`} value={draft.to} onChangeText={set("to")} />
        <Select
          label={expensesCopy.category}
          options={[
            { value: "", label: expensesCopy.allCategories },
            ...lists.categories.map((c) => ({ value: c.id, label: c.name })),
          ]}
          value={draft.categoryId}
          onChange={set("categoryId")}
        />
        <Select
          label={expensesCopy.vendor}
          options={[
            { value: "", label: expensesCopy.allVendors },
            ...lists.vendors.map((v) => ({ value: v.id, label: v.name })),
          ]}
          value={draft.vendorId}
          onChange={set("vendorId")}
        />
        <Select
          label={expensesCopy.status}
          options={[
            { value: "", label: expensesCopy.allStatuses },
            ...EXPENSE_STATUSES.map((s) => ({ value: s, label: EXPENSE_STATUS_LABELS[s] })),
          ]}
          value={draft.status}
          onChange={set("status")}
        />
        <Select
          label={expensesCopy.group}
          options={[
            { value: "", label: "—" },
            ...PNL_GROUPS.map((g) => ({ value: g, label: PNL_GROUP_LABELS[g] })),
          ]}
          value={draft.pnlGroup}
          onChange={set("pnlGroup")}
        />
        <Button label={expensesCopy.apply} variant="secondary" onPress={() => setFilter(draft)} />
        <LinkButton
          label={all ? expensesCopy.scopeCenter : expensesCopy.scopeAll}
          onPress={() => setAll((v) => !v)}
        />
      </Card>
      {data.status === "loading" ? <Skeleton lines={5} label="Cargando egresos" /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" && data.data.rows.length === 0 ? (
        <EmptyState title={expensesCopy.empty} />
      ) : null}
      {data.status === "ready" && data.data.rows.length > 0 ? (
        <Card
          title={`${expensesCopy.title} · ${all ? expensesCopy.scopeAll : center.name}`}
          subtitle={`${expensesCopy.total} aprobado: ${formatMoney(approved.reduce((a, r) => a + r.amount, 0))}`}
        >
          {data.data.rows.map((e) => {
            const r = presentExpenseRow(e);
            return (
              <View key={e.id} style={styles.item}>
                <LinkButton label={`${r.folio} · ${r.concept} · ${r.amount}`} onPress={() => onOpen(e.id)} />
                <Badge label={r.status} tone={r.statusTone} />
                <Text style={textStyle("caption", "muted")}>
                  {r.date} · {r.category} · {r.group} · {r.vendor}
                </Text>
              </View>
            );
          })}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({ item: { gap: space.xxs, marginBottom: space.sm } });
