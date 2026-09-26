import {
  activeCenterAccess,
  canInActiveCenter,
  crmCopy,
  presentTask,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  todayIn,
  type TaskDueFilter,
  type TaskStatus,
  type ViewState,
} from "@meguiars/domain";
import { createCrmRepository } from "@meguiars/supabase";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { CrmTaskCard } from "@/components/CrmTaskCard";
import { Button, Select } from "@/ui/controls";
import { Card, EmptyState, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import type { PrivateScreenProps } from "./types";

type Row = ReturnType<typeof presentTask>;

/** Cola de seguimientos del centro activo (equivale a /comercial/seguimientos en web). */
export function CrmTasksScreen({
  state,
  header,
  subnav,
  onOpenClient,
}: PrivateScreenProps & { onOpenClient: (id: string) => void }) {
  const { client } = useAuth();
  const toast = useToast();
  const center = activeCenterAccess(state)!.center;
  const today = todayIn(center.timezone);
  const canWrite = canInActiveCenter(state, "crm.write");
  const [draft, setDraft] = useState({ status: "pendiente", due: "" });
  const [filter, setFilter] = useState(draft);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const [data, setData] = useState<ViewState<Row[]>>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void createCrmRepository(client)
      .listTasks([center.id], {
        status: filter.status as TaskStatus,
        due: (filter.due || undefined) as TaskDueFilter | undefined,
        today,
      })
      .then((r) => {
        if (!active) return;
        if (!r.ok) return setData({ status: "error", message: r.error.message });
        setData(
          r.data.length === 0
            ? { status: "empty" }
            : { status: "ready", data: r.data.map((t) => presentTask(t, today)) },
        );
      });
    return () => {
      active = false;
    };
  }, [client, filter, center.id, today, version]);

  async function generate() {
    if (!client) return;
    setBusy(true);
    setError(null);
    const r = await createCrmRepository(client).generateTasks(center.id);
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    toast({ message: crmCopy.generated(r.data), tone: "success" });
    reload();
  }

  return (
    <Screen
      title={`${crmCopy.tasksTitle} · ${center.name}`}
      description={crmCopy.tasksDescription}
      header={header}
    >
      {subnav}
      {canWrite ? (
        <Button label={crmCopy.generate} variant="secondary" loading={busy} onPress={() => void generate()} />
      ) : null}
      <Notice tone="danger" text={error} />
      <Card>
        <Select
          label={crmCopy.status}
          options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABELS[s] }))}
          value={draft.status}
          onChange={(v) => setDraft((d) => ({ ...d, status: v }))}
        />
        <Select
          label={crmCopy.due}
          options={[
            { value: "", label: crmCopy.allDue },
            { value: "vencidas", label: crmCopy.dueOverdue },
            { value: "hoy", label: crmCopy.dueToday },
            { value: "proximas", label: crmCopy.dueUpcoming },
          ]}
          value={draft.due}
          onChange={(v) => setDraft((d) => ({ ...d, due: v }))}
        />
        <Button
          label={crmCopy.filter}
          variant="secondary"
          onPress={() => {
            setData({ status: "loading" });
            setFilter(draft);
          }}
        />
      </Card>
      {data.status === "loading" ? <Skeleton lines={4} label="Cargando seguimientos" /> : null}
      {data.status === "empty" ? <EmptyState title={crmCopy.tasksEmpty} /> : null}
      {data.status === "error" || data.status === "permission_denied" ? (
        <EmptyState title={data.message} />
      ) : null}
      {data.status === "ready"
        ? data.data.map((t) => (
            <CrmTaskCard
              key={t.id}
              task={t}
              today={today}
              canWrite={canWrite}
              showClient
              onOpenClient={onOpenClient}
              onDone={reload}
            />
          ))
        : null}
    </Screen>
  );
}
