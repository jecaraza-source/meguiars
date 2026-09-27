import {
  canInCenter,
  expenseActions,
  expenseErrorMessage,
  expensesCopy,
  formatBytes,
  newRequestId,
  presentApprovalEvent,
  presentExpense,
  todayIn,
  type Expense,
  type ExpenseCategory,
  type ExpenseMutation,
  type Result,
  type Vendor,
  type ViewState,
} from "@meguiars/domain";
import { createExpenseRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { expenseFormSchema } from "@meguiars/validation";
import { useCallback, useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import {
  ExpenseFields,
  fieldErrorsOf,
  initialExpenseValues,
  type ExpenseValues,
} from "@/components/ExpenseFields";
import { pickReceipt } from "@/lib/receipt";
import { Button, Field, LinkButton } from "@/ui/controls";
import { Badge, Card, EmptyState, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

interface Loaded {
  expense: Expense;
  categories: ExpenseCategory[];
  vendors: Vendor[];
  threshold: number | null;
}

/** Ficha del egreso (equivale a /finanzas/egresos/[id] en web). */
export function ExpenseScreen({
  state,
  header,
  expenseId,
  onBack,
}: PrivateScreenProps & { expenseId: string; onBack: () => void }) {
  const { client } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<ViewState<Loaded>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const repo = createExpenseRepository(client);
    void repo.get(expenseId).then(async (r) => {
      if (!r.ok) {
        if (active) setData({ status: "permission_denied", message: expenseErrorMessage(r.error) });
        return;
      }
      const e = r.data;
      const [c, v, t] = await Promise.all([
        repo.categories(e.organizationId),
        repo.vendors(e.organizationId),
        repo.threshold(e.detailCenterId),
      ]);
      if (active)
        setData({
          status: "ready",
          data: {
            expense: e,
            categories: c.ok ? c.data : [],
            vendors: v.ok ? v.data : [],
            threshold: t.ok ? t.data : null,
          },
        });
    });
    return () => {
      active = false;
    };
  }, [client, expenseId, version]);

  const back = <LinkButton label={`← ${expensesCopy.title}`} onPress={onBack} />;
  if (data.status !== "ready") {
    return (
      <Screen title={expensesCopy.title} header={header}>
        {back}
        {data.status === "loading" ? <Skeleton lines={5} label="Cargando egreso" /> : null}
        {data.status === "error" || data.status === "permission_denied" ? (
          <EmptyState title={expensesCopy.notFound} message={data.message} />
        ) : null}
      </Screen>
    );
  }

  const e = data.data.expense;
  const view = presentExpense(e);
  const can = {
    write: canInCenter(state, e.detailCenterId, "expenses.write"),
    approve: canInCenter(state, e.detailCenterId, "expenses.approve"),
  };
  const actions = expenseActions(e.status, can);
  const after = (message: string) => (r: Result<unknown>) => {
    if (!r.ok) {
      if (r.error.code === "40001") reload();
      return expenseErrorMessage(r.error);
    }
    toast({ message, tone: "success" });
    reload();
    return null;
  };

  return (
    <Screen title={view.title} description={`${view.amount} · ${view.date}`} header={header}>
      {back}
      <Card title={view.title}>
        <Badge label={view.status} tone={view.statusTone} />
        <Text style={textStyle("bodySmall")}>
          {expensesCopy.amount}: {view.amount} · {view.date}
        </Text>
        <Text style={textStyle("bodySmall")}>
          {view.category} · {view.group}
        </Text>
        <Text style={textStyle("bodySmall")}>
          Proveedor: {view.vendor} · {view.method} · {view.reference}
        </Text>
        <Text style={textStyle("caption", "muted")}>
          {expensesCopy.createdBy}: {view.createdBy}
        </Text>
        {view.approvedBy ? (
          <Text style={textStyle("caption", "muted")}>
            {expensesCopy.approvedBy}: {view.approvedBy}
          </Text>
        ) : null}
        {e.notes ? <Text style={textStyle("bodySmall")}>{e.notes}</Text> : null}
        {view.voided ? <Notice tone="neutral" text={view.voided} /> : null}
        {!can.write && !can.approve ? (
          <Text style={textStyle("caption", "muted")}>{expensesCopy.readOnly}</Text>
        ) : null}
      </Card>

      {actions.approve ? (
        <Card title={expensesCopy.status}>
          <DecisionBox
            label={expensesCopy.approve}
            reasonLabel={expensesCopy.approveNote}
            optional
            run={(reason) =>
              createExpenseRepository(client!)
                .approve({ expenseId: e.id, version: e.version, reason })
                .then(after(expensesCopy.approved))
            }
          />
          <DecisionBox
            label={expensesCopy.reject}
            reasonLabel={expensesCopy.rejectReason}
            danger
            run={(reason) =>
              createExpenseRepository(client!)
                .reject({ expenseId: e.id, version: e.version, reason })
                .then(after(expensesCopy.rejected))
            }
          />
        </Card>
      ) : null}

      <ReceiptsCard expense={e} canAttach={actions.attach} onChanged={reload} />

      <Card title={expensesCopy.history}>
        {e.events.length === 0 ? (
          <Text style={textStyle("bodySmall", "muted")}>{expensesCopy.historyEmpty}</Text>
        ) : (
          e.events.map((ev, i) => {
            const v = presentApprovalEvent(ev, e.centerTimezone);
            return (
              <View key={i} style={styles.item}>
                <Text style={textStyle("bodySmall")}>
                  {v.what} · {v.amount}
                  {v.note ? ` · ${v.note}` : ""}
                </Text>
                <Text style={textStyle("caption", "muted")}>
                  {v.who} · {v.when}
                </Text>
              </View>
            );
          })
        )}
      </Card>

      {actions.edit ? (
        <EditCard
          key={`edit-${e.version}`}
          loaded={data.data}
          isApprover={can.approve}
          run={(values, reason) => {
            const parsed = expenseFormSchema.safeParse(values);
            if (!parsed.success) return Promise.resolve(fieldErrorsOf(parsed.error.issues));
            return createExpenseRepository(client!)
              .update({ ...parsed.data, expenseId: e.id, version: e.version, reason })
              .then((r: Result<ExpenseMutation>) => {
                const msg = after(expensesCopy.saved)(r);
                return msg ? { form: msg } : null;
              });
          }}
        />
      ) : null}

      {actions.void ? (
        <Card title={expensesCopy.void} subtitle={expensesCopy.voidHint}>
          <DecisionBox
            label={expensesCopy.void}
            reasonLabel={expensesCopy.voidReason}
            danger
            run={(reason) =>
              createExpenseRepository(client!)
                .void({ expenseId: e.id, version: e.version, reason })
                .then(after(expensesCopy.voided))
            }
          />
        </Card>
      ) : null}
    </Screen>
  );
}

function DecisionBox({
  label,
  reasonLabel,
  run,
  optional,
  danger,
}: {
  label: string;
  reasonLabel: string;
  run: (reason: string | undefined) => Promise<string | null>;
  optional?: boolean;
  danger?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <View style={styles.form}>
      <Field label={reasonLabel} value={reason} onChangeText={setReason} maxLength={500} />
      <Notice tone="danger" text={error} />
      <Button
        label={label}
        variant={danger ? "danger" : "primary"}
        loading={busy}
        onPress={() => {
          setBusy(true);
          void run(optional && !reason.trim() ? undefined : reason).then((msg) => {
            setBusy(false);
            setError(msg);
          });
        }}
      />
    </View>
  );
}

function ReceiptsCard({
  expense,
  canAttach,
  onChanged,
}: {
  expense: Expense;
  canAttach: boolean;
  onChanged: () => void;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [fileId, setFileId] = useState(newRequestId);

  const add = async (source: "camera" | "library" | "document") => {
    if (!client) return;
    const picked = await pickReceipt(source);
    if (!picked.ok) return picked.canceled ? undefined : setError(picked.message);
    setBusy(true);
    const r = await createExpenseRepository(client).uploadReceipt({
      expense,
      fileId,
      file: picked.receipt.data,
      contentType: picked.receipt.contentType,
      sizeBytes: picked.receipt.sizeBytes,
      fileName: picked.receipt.fileName,
    });
    setBusy(false);
    if (!r.ok) return setError(expenseErrorMessage(r.error));
    setFileId(newRequestId());
    toast({ message: expensesCopy.receiptAdded, tone: "success" });
    onChanged();
  };

  const remove = async (attachmentId: string) => {
    if (!client) return;
    setBusy(true);
    const r = await createExpenseRepository(client).removeReceipt(attachmentId, reason);
    setBusy(false);
    if (!r.ok) return setError(expenseErrorMessage(r.error));
    toast({ message: expensesCopy.receiptRemoved, tone: "success" });
    onChanged();
  };

  return (
    <Card title={expensesCopy.receipts}>
      {expense.attachments.length === 0 ? (
        <Text style={textStyle("bodySmall", "muted")}>{expensesCopy.receiptsEmpty}</Text>
      ) : (
        expense.attachments.map((a) => (
          <View key={a.id} style={styles.item}>
            <Text style={textStyle("bodySmall")}>
              {a.fileName ?? a.contentType} · {formatBytes(a.sizeBytes)} · {a.uploadedByName ?? "—"}
            </Text>
            {a.signedUrl ? (
              <LinkButton
                label={expensesCopy.openReceipt}
                onPress={() => void Linking.openURL(a.signedUrl!)}
              />
            ) : null}
            {canAttach && removing !== a.id ? (
              <LinkButton label={expensesCopy.removeReceipt} onPress={() => setRemoving(a.id)} />
            ) : null}
            {canAttach && removing === a.id ? (
              <View style={styles.form}>
                <Field
                  label={expensesCopy.removeReason}
                  value={reason}
                  onChangeText={setReason}
                  maxLength={500}
                />
                <Button
                  label={expensesCopy.removeReceipt}
                  variant="danger"
                  loading={busy}
                  onPress={() => void remove(a.id)}
                />
              </View>
            ) : null}
          </View>
        ))
      )}
      {canAttach ? (
        <>
          <LinkButton label={expensesCopy.takePhoto} onPress={() => void add("camera")} />
          <LinkButton label={expensesCopy.fromLibrary} onPress={() => void add("library")} />
          <LinkButton label={expensesCopy.fromFile} onPress={() => void add("document")} />
        </>
      ) : null}
      <Notice tone="danger" text={error} />
    </Card>
  );
}

function EditCard({
  loaded,
  isApprover,
  run,
}: {
  loaded: Loaded;
  isApprover: boolean;
  run: (values: ExpenseValues, reason: string) => Promise<Record<string, string> | null>;
}) {
  const e = loaded.expense;
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ExpenseValues>(() =>
    initialExpenseValues(todayIn(e.centerTimezone), e),
  );
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  return (
    <Card title={expensesCopy.edit}>
      {!open ? <LinkButton label={expensesCopy.edit} onPress={() => setOpen(true)} /> : null}
      {open ? (
        <>
          <ExpenseFields
            values={values}
            onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
            errors={errors}
            categories={loaded.categories}
            vendors={loaded.vendors}
            threshold={loaded.threshold}
            isApprover={isApprover}
            expense={e}
          />
          <Field
            label={expensesCopy.reason}
            value={reason}
            onChangeText={setReason}
            maxLength={500}
            error={errors.reason}
          />
          <Notice tone="danger" text={errors.form} />
          <Button
            label={expensesCopy.save}
            loading={busy}
            onPress={() => {
              setBusy(true);
              void run(values, reason).then((errs) => {
                setBusy(false);
                setErrors(errs ?? {});
              });
            }}
          />
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  item: { gap: space.xxs, marginBottom: space.sm },
  form: { gap: space.sm },
});
