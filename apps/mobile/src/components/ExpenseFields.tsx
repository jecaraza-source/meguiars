import {
  EXPENSE_PAYMENT_METHOD_LABELS,
  EXPENSE_PAYMENT_METHODS,
  expensesCopy,
  expenseStatusOnSave,
  formatMoney,
  PNL_GROUP_HINTS,
  PNL_GROUP_LABELS,
  type Expense,
  type ExpenseCategory,
  type Vendor,
} from "@meguiars/domain";
import { Text } from "react-native";
import { Field, Select } from "@/ui/controls";
import { textStyle } from "@/ui/theme";

export interface ExpenseValues {
  categoryId: string;
  vendorId: string;
  concept: string;
  amount: string;
  paymentMethod: string;
  paidOn: string;
  reference: string;
  notes: string;
}

export const initialExpenseValues = (today: string, e?: Expense): ExpenseValues => ({
  categoryId: e?.categoryId ?? "",
  vendorId: e?.vendorId ?? "",
  concept: e?.concept ?? "",
  amount: e ? String(e.amount) : "",
  paymentMethod: e?.paymentMethod ?? "",
  paidOn: e?.paidOn ?? today,
  reference: e?.reference ?? "",
  notes: e?.notes ?? "",
});

/** Campos del egreso (equivalen al formulario de /finanzas/egresos/nuevo en web). */
export function ExpenseFields({
  values,
  onChange,
  errors,
  categories,
  vendors,
  threshold,
  isApprover,
  expense,
}: {
  values: ExpenseValues;
  onChange: (key: keyof ExpenseValues, value: string) => void;
  errors: Record<string, string>;
  categories: ExpenseCategory[];
  vendors: Vendor[];
  threshold: number | null;
  isApprover: boolean;
  expense?: Expense;
}) {
  const category = categories.find((c) => c.id === values.categoryId);
  const n = Number(values.amount.replace(/[$,\s]/g, ""));
  const needsApproval =
    Number.isFinite(n) && n > 0 && expenseStatusOnSave(n, threshold, isApprover) === "pendiente";
  return (
    <>
      <Select
        label={expensesCopy.category}
        placeholder="Elige"
        options={categories
          .filter((c) => c.active || c.id === expense?.categoryId)
          .map((c) => ({ value: c.id, label: `${c.name} · ${PNL_GROUP_LABELS[c.pnlGroup]}` }))}
        value={values.categoryId}
        onChange={(v) => onChange("categoryId", v)}
        hint={category ? PNL_GROUP_HINTS[category.pnlGroup] : undefined}
        error={errors.categoryId}
      />
      <Select
        label={expensesCopy.vendor}
        options={[
          { value: "", label: expensesCopy.noVendor },
          ...vendors
            .filter((v) => v.active || v.id === expense?.vendorId)
            .map((v) => ({ value: v.id, label: v.name })),
        ]}
        value={values.vendorId}
        onChange={(v) => onChange("vendorId", v)}
      />
      <Field
        label={expensesCopy.concept}
        value={values.concept}
        onChangeText={(v) => onChange("concept", v)}
        maxLength={200}
        error={errors.concept}
      />
      <Field
        label={expensesCopy.amount}
        keyboardType="decimal-pad"
        value={values.amount}
        onChangeText={(v) => onChange("amount", v)}
        hint={needsApproval ? expensesCopy.willNeedApproval : undefined}
        error={errors.amount}
      />
      <Select
        label={expensesCopy.paymentMethod}
        placeholder="Elige"
        options={EXPENSE_PAYMENT_METHODS.map((m) => ({ value: m, label: EXPENSE_PAYMENT_METHOD_LABELS[m] }))}
        value={values.paymentMethod}
        onChange={(v) => onChange("paymentMethod", v)}
        error={errors.paymentMethod}
      />
      <Field
        label={`${expensesCopy.paidOn} (AAAA-MM-DD)`}
        value={values.paidOn}
        onChangeText={(v) => onChange("paidOn", v)}
        error={errors.paidOn}
      />
      <Field
        label={expensesCopy.reference}
        value={values.reference}
        onChangeText={(v) => onChange("reference", v)}
        maxLength={80}
      />
      <Field
        label={expensesCopy.notes}
        value={values.notes}
        onChangeText={(v) => onChange("notes", v)}
        maxLength={1000}
      />
      <Text style={textStyle("caption", "muted")}>
        {threshold === null ? expensesCopy.noApproval : expensesCopy.approvalHint(formatMoney(threshold))}{" "}
        {expensesCopy.onlineOnly}
      </Text>
    </>
  );
}

/** Errores de zod → mensaje por campo (primer mensaje). */
export const fieldErrorsOf = (issues: readonly { path: PropertyKey[]; message: string }[]) => {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "form");
    out[k] ??= i.message;
  }
  return out;
};
