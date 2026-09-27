import {
  activeCenterAccess,
  canInActiveCenter,
  expenseErrorMessage,
  expensesCopy,
  newRequestId,
  todayIn,
  type ExpenseCategory,
  type Vendor,
  type ViewState,
} from "@meguiars/domain";
import { createExpenseRepository } from "@meguiars/supabase";
import { expenseFormSchema } from "@meguiars/validation";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import {
  ExpenseFields,
  fieldErrorsOf,
  initialExpenseValues,
  type ExpenseValues,
} from "@/components/ExpenseFields";
import { pickReceipt, type PickedReceipt } from "@/lib/receipt";
import { Button, LinkButton } from "@/ui/controls";
import { Card, EmptyState, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

interface Loaded {
  categories: ExpenseCategory[];
  vendors: Vendor[];
  threshold: number | null;
}

/** Alta de egreso con comprobante opcional (equivale a /finanzas/egresos/nuevo en web). */
export function ExpenseNewScreen({
  state,
  header,
  onCreated,
  onCancel,
}: PrivateScreenProps & { onCreated: (id: string) => void; onCancel: () => void }) {
  const { client } = useAuth();
  const toast = useToast();
  const center = activeCenterAccess(state)!.center;
  const today = todayIn(center.timezone);
  const [data, setData] = useState<ViewState<Loaded>>({ status: "loading" });
  const [values, setValues] = useState<ExpenseValues>(() => initialExpenseValues(today));
  const [receipt, setReceipt] = useState<PickedReceipt | null>(null);
  const [requestId] = useState(newRequestId);
  const [fileId] = useState(newRequestId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const repo = createExpenseRepository(client);
    void Promise.all([
      repo.categories(center.organizationId),
      repo.vendors(center.organizationId),
      repo.threshold(center.id),
    ]).then(([c, v, t]) => {
      if (!active) return;
      setData(
        c.ok
          ? {
              status: "ready",
              data: { categories: c.data, vendors: v.ok ? v.data : [], threshold: t.ok ? t.data : null },
            }
          : { status: "error", message: expenseErrorMessage(c.error) },
      );
    });
    return () => {
      active = false;
    };
  }, [client, center.id, center.organizationId]);

  const choose = async (source: "camera" | "library" | "document") => {
    const r = await pickReceipt(source);
    if (r.ok) setReceipt(r.receipt);
    else if (!r.canceled) setError(r.message);
  };

  const submit = async () => {
    if (!client) return;
    const parsed = expenseFormSchema.safeParse(values);
    if (!parsed.success) return setErrors(fieldErrorsOf(parsed.error.issues));
    setErrors({});
    setBusy(true);
    const repo = createExpenseRepository(client);
    const result = await repo.create({ ...parsed.data, detailCenterId: center.id, requestId });
    if (!result.ok) {
      setBusy(false);
      return setError(expenseErrorMessage(result.error));
    }
    if (receipt) {
      const upload = await repo.uploadReceipt({
        expense: { organizationId: center.organizationId, detailCenterId: center.id, id: result.data.id },
        fileId,
        file: receipt.data,
        contentType: receipt.contentType,
        sizeBytes: receipt.sizeBytes,
        fileName: receipt.fileName,
      });
      if (!upload.ok) toast({ message: expenseErrorMessage(upload.error), tone: "danger" });
    }
    setBusy(false);
    toast({
      message: result.data.status === "pendiente" ? expensesCopy.createdPending : expensesCopy.created,
      tone: "success",
    });
    onCreated(result.data.id);
  };

  return (
    <Screen title={expensesCopy.newExpense} description={center.name} header={header}>
      <LinkButton label={`← ${expensesCopy.title}`} onPress={onCancel} />
      {data.status === "loading" ? <Skeleton lines={6} label="Cargando" /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready" ? (
        <Card>
          <ExpenseFields
            values={values}
            onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
            errors={errors}
            categories={data.data.categories}
            vendors={data.data.vendors}
            threshold={data.data.threshold}
            isApprover={canInActiveCenter(state, "expenses.approve")}
          />
          <Text style={textStyle("label")}>{expensesCopy.receipt}</Text>
          {receipt ? (
            <Text style={textStyle("bodySmall")}>
              {receipt.fileName} · {Math.max(1, Math.round(receipt.sizeBytes / 1024))} KB
            </Text>
          ) : null}
          <LinkButton label={expensesCopy.takePhoto} onPress={() => void choose("camera")} />
          <LinkButton label={expensesCopy.fromLibrary} onPress={() => void choose("library")} />
          <LinkButton label={expensesCopy.fromFile} onPress={() => void choose("document")} />
          <Notice tone="danger" text={error} />
          <Button label={expensesCopy.create} loading={busy} onPress={() => void submit()} />
        </Card>
      ) : null}
    </Screen>
  );
}
