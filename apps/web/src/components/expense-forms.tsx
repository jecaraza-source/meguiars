"use client";

import {
  EXPENSE_PAYMENT_METHOD_LABELS,
  EXPENSE_PAYMENT_METHODS,
  EXPENSE_RECEIPT_MIME_TYPES,
  expensesCopy,
  expenseStatusOnSave,
  formatMoney,
  PNL_GROUP_HINTS,
  PNL_GROUP_LABELS,
  PNL_GROUPS,
  type Expense,
  type ExpenseCategory,
  type Vendor,
} from "@meguiars/domain";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createExpenseAction,
  decideExpenseAction,
  removeReceiptAction,
  setThresholdAction,
  updateExpenseAction,
  uploadReceiptAction,
  upsertCategoryAction,
  upsertVendorAction,
  type ExpenseFormState,
} from "@/app/actions/expenses";
import { Button } from "./ui/button";
import { Checkbox, Input, Select } from "./ui/field";
import { useToast } from "./ui/overlay";

function Submit({
  label,
  variant = "primary",
}: {
  label: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { pending } = useFormStatus();
  return <Button type="submit" label={label} loading={pending} variant={variant} size="sm" />;
}

const valueOf = (state: ExpenseFormState, key: string, fallback = "") => {
  const v = state.values?.[key];
  return typeof v === "string" ? v : fallback;
};

function useToastOnMessage(state: ExpenseFormState) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

function FormError({ state }: { state: ExpenseFormState }) {
  return state.error ? (
    <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
      {state.error}
    </p>
  ) : null;
}

const ACCEPT = EXPENSE_RECEIPT_MIME_TYPES.join(",");
const option = (value: string, label: string) => ({ value, label });

/** Alta o edición de un egreso. En alta admite el comprobante; en edición exige motivo. */
export function ExpenseForm({
  categories,
  vendors,
  threshold,
  isApprover,
  today,
  requestId,
  fileId,
  expense,
}: {
  categories: ExpenseCategory[];
  vendors: Vendor[];
  threshold: number | null;
  isApprover: boolean;
  today: string;
  requestId?: string;
  fileId?: string;
  expense?: Expense;
}) {
  const [state, action] = useActionState(expense ? updateExpenseAction : createExpenseAction, {});
  useToastOnMessage(state);
  const f = state.fields ?? {};
  const [amount, setAmount] = useState(valueOf(state, "amount", expense ? String(expense.amount) : ""));
  const [categoryId, setCategoryId] = useState(valueOf(state, "categoryId", expense?.categoryId ?? ""));
  const n = Number(amount.replace(/[$,\s]/g, ""));
  const needsApproval =
    Number.isFinite(n) && n > 0 && expenseStatusOnSave(n, threshold, isApprover) === "pendiente";
  const category = categories.find((c) => c.id === categoryId);
  const usable = categories.filter((c) => c.active || c.id === expense?.categoryId);
  return (
    <form
      key={`${state.at ?? 0}-${expense?.version ?? 0}`}
      action={action}
      className="flex flex-col gap-md"
      noValidate
      data-testid="expense-form"
    >
      {expense ? (
        <>
          <input type="hidden" name="expenseId" value={expense.id} />
          <input type="hidden" name="version" value={expense.version} />
        </>
      ) : (
        <>
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="fileId" value={fileId} />
        </>
      )}
      <div className="grid gap-md md:grid-cols-2">
        <Select
          name="categoryId"
          label={expensesCopy.category}
          placeholder="Elige"
          options={usable.map((c) => option(c.id, `${c.name} · ${PNL_GROUP_LABELS[c.pnlGroup]}`))}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          hint={category ? PNL_GROUP_HINTS[category.pnlGroup] : undefined}
          error={f.categoryId}
        />
        <Select
          name="vendorId"
          label={expensesCopy.vendor}
          options={[
            option("", expensesCopy.noVendor),
            ...vendors.filter((v) => v.active || v.id === expense?.vendorId).map((v) => option(v.id, v.name)),
          ]}
          defaultValue={valueOf(state, "vendorId", expense?.vendorId ?? "")}
          error={f.vendorId}
        />
        <Input
          name="concept"
          label={expensesCopy.concept}
          maxLength={200}
          defaultValue={valueOf(state, "concept", expense?.concept ?? "")}
          error={f.concept}
        />
        <Input
          name="amount"
          label={expensesCopy.amount}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hint={needsApproval ? expensesCopy.willNeedApproval : undefined}
          error={f.amount}
        />
        <Select
          name="paymentMethod"
          label={expensesCopy.paymentMethod}
          placeholder="Elige"
          options={EXPENSE_PAYMENT_METHODS.map((m) => option(m, EXPENSE_PAYMENT_METHOD_LABELS[m]))}
          defaultValue={valueOf(state, "paymentMethod", expense?.paymentMethod ?? "")}
          error={f.paymentMethod}
        />
        <Input
          name="paidOn"
          type="date"
          label={expensesCopy.paidOn}
          max={today}
          defaultValue={valueOf(state, "paidOn", expense?.paidOn ?? today)}
          error={f.paidOn}
        />
        <Input
          name="reference"
          label={expensesCopy.reference}
          maxLength={80}
          defaultValue={valueOf(state, "reference", expense?.reference ?? "")}
          error={f.reference}
        />
        <Input
          name="notes"
          label={expensesCopy.notes}
          maxLength={1000}
          defaultValue={valueOf(state, "notes", expense?.notes ?? "")}
          error={f.notes}
        />
        {expense ? (
          <Input name="reason" label={expensesCopy.reason} maxLength={500} error={f.reason} />
        ) : (
          <Input name="receipt" type="file" accept={ACCEPT} label={expensesCopy.receipt} error={f.receipt} />
        )}
      </div>
      <p className="text-xs text-muted">
        {threshold === null ? expensesCopy.noApproval : expensesCopy.approvalHint(formatMoney(threshold))}{" "}
        {expensesCopy.onlineOnly}
      </p>
      <FormError state={state} />
      <div>
        <Submit label={expense ? expensesCopy.save : expensesCopy.create} />
      </div>
    </form>
  );
}

/** Aprobar, rechazar o anular (con motivo). */
export function DecisionForm({
  expense,
  decision,
}: {
  expense: Pick<Expense, "id" | "version">;
  decision: "approve" | "reject" | "void";
}) {
  const [state, action] = useActionState(decideExpenseAction, {});
  useToastOnMessage(state);
  const labels = {
    approve: [expensesCopy.approve, expensesCopy.approveNote, "primary"],
    reject: [expensesCopy.reject, expensesCopy.rejectReason, "danger"],
    void: [expensesCopy.void, expensesCopy.voidReason, "danger"],
  } as const;
  const [label, reasonLabel, variant] = labels[decision];
  return (
    <form
      key={state.at ?? 0}
      action={action}
      className="flex flex-col gap-sm"
      noValidate
      data-testid={`decision-${decision}`}
    >
      <input type="hidden" name="expenseId" value={expense.id} />
      <input type="hidden" name="version" value={expense.version} />
      <input type="hidden" name="decision" value={decision} />
      <Input
        name="reason"
        id={`reason-${decision}`}
        label={reasonLabel}
        maxLength={500}
        defaultValue={valueOf(state, "reason")}
        error={state.fields?.reason}
      />
      {decision === "void" ? <p className="text-xs text-muted">{expensesCopy.voidHint}</p> : null}
      <FormError state={state} />
      <div>
        <Submit label={label} variant={variant} />
      </div>
    </form>
  );
}

export function ReceiptUploadForm({ expenseId, fileId }: { expenseId: string; fileId: string }) {
  const [state, action] = useActionState(uploadReceiptAction, {});
  useToastOnMessage(state);
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-sm" noValidate>
      <input type="hidden" name="expenseId" value={expenseId} />
      <input type="hidden" name="fileId" value={fileId} />
      <Input
        name="receipt"
        id="receipt-upload"
        type="file"
        accept={ACCEPT}
        label={expensesCopy.addReceipt}
        error={state.fields?.receipt}
      />
      <FormError state={state} />
      <div>
        <Submit label={expensesCopy.addReceipt} variant="secondary" />
      </div>
    </form>
  );
}

export function RemoveReceiptForm({ expenseId, attachmentId }: { expenseId: string; attachmentId: string }) {
  const [state, action] = useActionState(removeReceiptAction, {});
  useToastOnMessage(state);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer underline">{expensesCopy.removeReceipt}</summary>
      <form key={state.at ?? 0} action={action} className="mt-sm flex flex-col gap-sm" noValidate>
        <input type="hidden" name="expenseId" value={expenseId} />
        <input type="hidden" name="attachmentId" value={attachmentId} />
        <Input
          name="reason"
          id={`remove-${attachmentId}`}
          label={expensesCopy.removeReason}
          maxLength={500}
          error={state.fields?.reason}
        />
        <FormError state={state} />
        <div>
          <Submit label={expensesCopy.removeReceipt} variant="danger" />
        </div>
      </form>
    </details>
  );
}

export function ThresholdForm({ threshold }: { threshold: number | null }) {
  const [state, action] = useActionState(setThresholdAction, {});
  useToastOnMessage(state);
  return (
    <form key={state.at ?? 0} action={action} className="grid items-end gap-md md:grid-cols-3" noValidate>
      <Input
        name="threshold"
        label={expensesCopy.threshold}
        inputMode="decimal"
        hint={expensesCopy.thresholdHint}
        defaultValue={valueOf(state, "threshold", threshold === null ? "" : String(threshold))}
        error={state.fields?.threshold}
      />
      <Input
        name="reason"
        id="threshold-reason"
        label={expensesCopy.reason}
        maxLength={500}
        error={state.fields?.reason}
      />
      <div>
        <Submit label={expensesCopy.saveThreshold} />
      </div>
      <div className="md:col-span-3">
        <FormError state={state} />
      </div>
    </form>
  );
}

export function VendorForm({ vendor }: { vendor?: Vendor }) {
  const [state, action] = useActionState(upsertVendorAction, {});
  useToastOnMessage(state);
  const f = state.fields ?? {};
  const id = vendor?.id ?? "new";
  return (
    <form key={state.at ?? 0} action={action} className="grid gap-md md:grid-cols-3" noValidate>
      {vendor ? <input type="hidden" name="vendorId" value={vendor.id} /> : null}
      <Input
        name="name"
        id={`vendor-name-${id}`}
        label={expensesCopy.vendorName}
        defaultValue={valueOf(state, "name", vendor?.name ?? "")}
        error={f.name}
      />
      <Input
        name="rfc"
        id={`vendor-rfc-${id}`}
        label={expensesCopy.rfc}
        defaultValue={valueOf(state, "rfc", vendor?.rfc ?? "")}
        error={f.rfc}
      />
      <Input
        name="phone"
        id={`vendor-phone-${id}`}
        label={expensesCopy.phone}
        defaultValue={valueOf(state, "phone", vendor?.phone ?? "")}
        error={f.phone}
      />
      <Input
        name="email"
        id={`vendor-email-${id}`}
        label={expensesCopy.email}
        defaultValue={valueOf(state, "email", vendor?.email ?? "")}
        error={f.email}
      />
      <Checkbox
        name="active"
        value="on"
        id={`vendor-active-${id}`}
        label={expensesCopy.vendorActive}
        checked={vendor?.active ?? true}
      />
      <div className="flex items-end">
        <Submit label={expensesCopy.saveVendor} variant={vendor ? "secondary" : "primary"} />
      </div>
      <div className="md:col-span-3">
        <FormError state={state} />
      </div>
    </form>
  );
}

export function CategoryForm({ category }: { category?: ExpenseCategory }) {
  const [state, action] = useActionState(upsertCategoryAction, {});
  useToastOnMessage(state);
  const f = state.fields ?? {};
  const id = category?.id ?? "new";
  return (
    <form key={state.at ?? 0} action={action} className="grid gap-md md:grid-cols-3" noValidate>
      {category ? <input type="hidden" name="categoryId" value={category.id} /> : null}
      {category ? (
        <input type="hidden" name="code" value={category.code} />
      ) : (
        <Input name="code" id="category-code-new" label={expensesCopy.categoryCode} error={f.code} />
      )}
      <Input
        name="name"
        id={`category-name-${id}`}
        label={expensesCopy.categoryName}
        defaultValue={valueOf(state, "name", category?.name ?? "")}
        error={f.name}
      />
      <Select
        name="pnlGroup"
        id={`category-group-${id}`}
        label={expensesCopy.group}
        placeholder="Elige"
        options={PNL_GROUPS.map((g) => option(g, PNL_GROUP_LABELS[g]))}
        defaultValue={valueOf(state, "pnlGroup", category?.pnlGroup ?? "")}
        error={f.pnlGroup}
      />
      <Input
        name="position"
        id={`category-position-${id}`}
        label={expensesCopy.position}
        inputMode="numeric"
        defaultValue={valueOf(state, "position", String(category?.position ?? 50))}
        error={f.position}
      />
      <Input
        name="reason"
        id={`category-reason-${id}`}
        label={expensesCopy.reason}
        maxLength={500}
        error={f.reason}
      />
      <Checkbox
        name="active"
        value="on"
        id={`category-active-${id}`}
        label={expensesCopy.active}
        checked={category?.active ?? true}
      />
      <div className="md:col-span-3">
        <FormError state={state} />
        <Submit label={expensesCopy.saveCategory} variant={category ? "secondary" : "primary"} />
      </div>
    </form>
  );
}
