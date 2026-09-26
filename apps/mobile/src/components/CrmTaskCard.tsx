import { crmCopy, TASK_OUTCOME_LABELS, TASK_OUTCOMES, type presentTask } from "@meguiars/domain";
import { createCrmRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import {
  cancelTaskSchema,
  completeTaskSchema,
  fieldErrors,
  rescheduleTaskSchema,
} from "@meguiars/validation";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import { Button, Field, LinkButton, Select } from "@/ui/controls";
import { Card } from "@/ui/display";
import { Notice } from "@/ui/notice";
import { textStyle } from "@/ui/theme";
import { useToast } from "@/ui/overlay";

type TaskView = ReturnType<typeof presentTask>;

/** Seguimiento con sus acciones (equivale a TaskActions de web). */
export function CrmTaskCard({
  task,
  today,
  canWrite,
  showClient,
  onOpenClient,
  onDone,
}: {
  task: TaskView;
  today: string;
  canWrite: boolean;
  showClient?: boolean;
  onOpenClient?: (id: string) => void;
  onDone: () => void;
}) {
  const { client } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState<"complete" | "reschedule" | "cancel" | null>(null);
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [dueOn, setDueOn] = useState(today);
  const [reason, setReason] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!client || !open) return;
    const repo = createCrmRepository(client);
    setError(null);
    let result;
    if (open === "complete") {
      const p = completeTaskSchema.safeParse({ taskId: task.id, outcome, notes });
      if (!p.success) return setFields(fieldErrors(p.error));
      setBusy(true);
      result = await repo.completeTask(p.data);
    } else if (open === "reschedule") {
      const p = rescheduleTaskSchema.safeParse({ taskId: task.id, dueOn, reason });
      if (!p.success) return setFields(fieldErrors(p.error));
      setBusy(true);
      result = await repo.rescheduleTask(p.data.taskId, p.data.dueOn, p.data.reason);
    } else {
      const p = cancelTaskSchema.safeParse({ taskId: task.id, reason });
      if (!p.success) return setFields(fieldErrors(p.error));
      setBusy(true);
      result = await repo.cancelTask(p.data.taskId, p.data.reason);
    }
    setBusy(false);
    setFields({});
    if (!result.ok) return setError(result.error.message);
    toast({ message: crmCopy.saved, tone: "success" });
    setOpen(null);
    onDone();
  }

  return (
    <Card
      title={showClient ? task.client : task.what}
      subtitle={`${task.due} · ${task.status}${task.dueCaption ? ` · ${task.dueCaption}` : ""}`}
    >
      {showClient ? <Text style={textStyle("body")}>{task.what}</Text> : null}
      <Text style={textStyle("bodySmall", "muted")}>
        {task.source}
        {task.notes ? ` · ${task.notes}` : ""}
        {task.result ? ` · ${task.result}` : ""}
      </Text>
      {showClient && onOpenClient ? (
        <LinkButton label={crmCopy.openProfile} onPress={() => onOpenClient(task.clientId)} />
      ) : null}
      {task.open && canWrite ? (
        <View style={styles.actions}>
          <Button label={crmCopy.complete} variant="secondary" onPress={() => setOpen("complete")} />
          <Button label={crmCopy.reschedule} variant="secondary" onPress={() => setOpen("reschedule")} />
          <Button label={crmCopy.cancel} variant="danger" onPress={() => setOpen("cancel")} />
        </View>
      ) : null}
      {open === "complete" ? (
        <>
          <Select
            label={crmCopy.outcome}
            placeholder="Elige el resultado"
            options={TASK_OUTCOMES.map((o) => ({ value: o, label: TASK_OUTCOME_LABELS[o] }))}
            value={outcome}
            onChange={setOutcome}
            error={fields.outcome}
          />
          <Field label={crmCopy.notes} value={notes} onChangeText={setNotes} />
        </>
      ) : null}
      {open === "reschedule" ? (
        <Field
          label={`${crmCopy.dueOn} (AAAA-MM-DD)`}
          value={dueOn}
          onChangeText={setDueOn}
          error={fields.dueOn}
        />
      ) : null}
      {open === "reschedule" || open === "cancel" ? (
        <Field
          label={crmCopy.reason}
          required
          value={reason}
          onChangeText={setReason}
          error={fields.reason}
        />
      ) : null}
      {open ? (
        <Button
          label={
            open === "complete"
              ? crmCopy.complete
              : open === "reschedule"
                ? crmCopy.reschedule
                : crmCopy.cancel
          }
          variant={open === "cancel" ? "danger" : "primary"}
          loading={busy}
          onPress={() => void submit()}
        />
      ) : null}
      <Notice tone="danger" text={error} />
    </Card>
  );
}

const styles = StyleSheet.create({ actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm } });
