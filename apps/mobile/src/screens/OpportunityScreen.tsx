import {
  canInCenter,
  formatDateOnly,
  LOSS_REASON_LABELS,
  LOSS_REASONS,
  newRequestId,
  OPPORTUNITY_TASK_KIND_LABELS,
  OPPORTUNITY_TASK_KINDS,
  pipelineCopy,
  pipelineErrorMessage,
  presentOpportunity,
  presentOpportunityEvent,
  presentOpportunityTask,
  proposalEndsOn,
  TASK_OUTCOME_LABELS,
  usableCenters,
  type LossReason,
  type Opportunity,
  type OpportunityEvent,
  type OpportunityTask,
  type OpportunityTaskKind,
  type PipelineOwner,
  type PipelineStage,
  type TaskOutcome,
  type ViewState,
} from "@meguiars/domain";
import { createCrmRepository, createPipelineRepository } from "@meguiars/supabase";
import { space } from "@meguiars/ui-tokens";
import { updateOpportunitySchema } from "@meguiars/validation";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/AuthProvider";
import {
  B2bOpportunityFields,
  CommonOpportunityFields,
  flatErrors,
  initialOpportunityValues,
  opportunityInput,
  type OpportunityValues,
} from "@/components/OpportunityFields";
import { Button, Checkbox, Field, LinkButton, Select } from "@/ui/controls";
import { Badge, Card, EmptyState, Skeleton } from "@/ui/display";
import { Screen } from "@/ui/layout";
import { Notice } from "@/ui/notice";
import { useToast } from "@/ui/overlay";
import { textStyle } from "@/ui/theme";
import type { PrivateScreenProps } from "./types";

interface Loaded {
  opportunity: Opportunity;
  events: OpportunityEvent[];
  tasks: OpportunityTask[];
  stages: PipelineStage[];
  owners: PipelineOwner[];
}

type Panel = "win" | "lose" | "edit" | null;

/** Ficha de la oportunidad (equivale a /comercial/pipeline/[id] en web). */
export function OpportunityScreen({
  state,
  header,
  subnav,
  opportunityId,
  onBack,
  onOpenAccount,
}: PrivateScreenProps & { opportunityId: string; onBack: () => void; onOpenAccount: (id: string) => void }) {
  const { client } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<ViewState<Loaded>>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((x) => x + 1), []);
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [move, setMove] = useState({ stageId: "", note: "" });
  const [note, setNote] = useState("");
  const [task, setTask] = useState({
    kind: "llamar" as OpportunityTaskKind,
    dueOn: "",
    notes: "",
    requestId: newRequestId(),
  });
  const [win, setWin] = useState({ wonValue: "", createAgreement: true, startsOn: "" });
  const [loss, setLoss] = useState({ reason: "" as LossReason | "", notes: "" });
  const [reopenReason, setReopenReason] = useState("");

  useEffect(() => {
    if (!client) return;
    let active = true;
    const repo = createPipelineRepository(client);
    void repo
      .get(
        opportunityId,
        usableCenters(state.access).map((a) => a.center.id),
      )
      .then(async (r) => {
        if (!active) return;
        if (!r.ok) return setData({ status: "error", message: pipelineErrorMessage(r.error) });
        const o = r.data;
        const [events, tasks, stages, owners] = await Promise.all([
          repo.timeline(o.id),
          repo.tasks(o.id),
          repo.stages(o.organizationId),
          repo.owners(o.detailCenterId, o.kind),
        ]);
        if (!active) return;
        setData({
          status: "ready",
          data: {
            opportunity: o,
            events: events.ok ? events.data : [],
            tasks: tasks.ok ? tasks.data : [],
            stages: stages.ok ? stages.data : [],
            owners: owners.ok ? owners.data : [],
          },
        });
        setWin((w) => ({ ...w, wonValue: String(o.estimatedValue), startsOn: w.startsOn || o.today }));
        setTask((t) => ({ ...t, dueOn: t.dueOn || o.today }));
      });
    return () => {
      active = false;
    };
  }, [client, opportunityId, state.access, version]);

  async function run(
    call: () => Promise<{ ok: boolean; error?: { kind: string; code?: string; message: string } }>,
    done: string,
  ) {
    setBusy(true);
    setError(null);
    const r = await call();
    setBusy(false);
    if (!r.ok) {
      setError(r.error ? pipelineErrorMessage(r.error) : pipelineCopy.forbidden);
      return false;
    }
    toast({ message: done, tone: "success" });
    setPanel(null);
    reload();
    return true;
  }

  if (data.status !== "ready") {
    return (
      <Screen title={pipelineCopy.title} header={header}>
        {subnav}
        <LinkButton label={`← ${pipelineCopy.title}`} onPress={onBack} />
        {data.status === "loading" ? (
          <Skeleton lines={6} label="Cargando oportunidad" />
        ) : (
          <EmptyState title={pipelineCopy.notFound} message={"message" in data ? data.message : undefined} />
        )}
      </Screen>
    );
  }
  const { opportunity: o, events, tasks, stages, owners } = data.data;
  const view = presentOpportunity(o);
  const open = o.status === "abierta";
  const canWrite =
    canInCenter(state, o.detailCenterId, "pipeline.write") &&
    (o.kind === "b2c_premium" || canInCenter(state, o.detailCenterId, "b2b.write"));
  const openStages = stages.filter((s) => s.kind === "abierta" && s.active);
  const moveOptions = openStages
    .filter((s) => s.id !== o.stageId)
    .map((s) => ({ value: s.id, label: s.name }));
  const repo = client ? createPipelineRepository(client) : null;

  return (
    <Screen title={o.title} description={`${view.company} · ${view.kind}`} header={header}>
      {subnav}
      <LinkButton label={`← ${pipelineCopy.title}`} onPress={onBack} />
      <Card title={view.company} subtitle={`${view.center} · ${view.linked}`}>
        <Badge label={open ? view.stage : view.status} tone={view.statusTone} />
        <Info
          label={pipelineCopy.estimatedValue}
          value={`${view.value} · ${view.probability} → ${view.weighted}`}
        />
        <Info label={pipelineCopy.owner} value={view.owner} />
        {open ? (
          <View style={styles.inline}>
            {view.nextActionLabel && view.nextActionState !== "proxima" ? (
              <Badge label={view.nextActionLabel} tone={view.nextActionTone} />
            ) : null}
            <Text style={textStyle("bodySmall")}>
              {view.nextActionState === "sin_accion" ? pipelineCopy.nextAction : view.nextAction}
            </Text>
          </View>
        ) : null}
        <Info label={pipelineCopy.expectedCloseOn} value={view.expectedClose} />
        <Info label={pipelineCopy.contactName} value={`${view.contact} · ${view.phone} · ${view.email}`} />
        <Info label="Datos fiscales" value={view.fiscal} />
        {o.kind === "b2b" ? <Info label={pipelineCopy.proposalLabel} value={view.proposal} /> : null}
        <Info label={pipelineCopy.source} value={view.source} />
        {o.notes ? <Info label={pipelineCopy.notes} value={o.notes} /> : null}
        {view.closed ? <Text style={textStyle("label")}>{view.closed}</Text> : null}
        {o.convertedAccountId || o.b2bAccountId ? (
          <LinkButton
            label={pipelineCopy.goToAccount}
            onPress={() => onOpenAccount((o.convertedAccountId ?? o.b2bAccountId)!)}
          />
        ) : null}
        {!canWrite ? <Text style={textStyle("bodySmall", "muted")}>{pipelineCopy.readOnly}</Text> : null}
      </Card>
      <Notice tone="danger" text={error} />

      {canWrite && open && repo ? (
        <Card title={pipelineCopy.stage}>
          <View style={styles.stack}>
            {moveOptions.length > 0 ? (
              <>
                <Select
                  label={pipelineCopy.moveTo}
                  options={moveOptions}
                  value={move.stageId || moveOptions[0]!.value}
                  onChange={(x) => setMove((m) => ({ ...m, stageId: x }))}
                />
                <Field
                  label={pipelineCopy.stageNote}
                  value={move.note}
                  onChangeText={(x) => setMove((m) => ({ ...m, note: x }))}
                />
                <Button
                  label={pipelineCopy.move}
                  variant="secondary"
                  loading={busy}
                  onPress={() =>
                    void run(
                      () =>
                        repo.move(
                          o.id,
                          o.version,
                          move.stageId || moveOptions[0]!.value,
                          move.note || undefined,
                        ),
                      pipelineCopy.moved,
                    ).then((ok) => (ok ? setMove({ stageId: "", note: "" }) : undefined))
                  }
                />
              </>
            ) : null}
            <Button
              label={pipelineCopy.winTitle}
              variant={panel === "win" ? "primary" : "secondary"}
              onPress={() => setPanel(panel === "win" ? null : "win")}
            />
            {panel === "win" ? (
              <View style={styles.stack}>
                <Text style={textStyle("bodySmall", "muted")}>
                  {o.kind === "b2b" ? pipelineCopy.winB2bHint : pipelineCopy.winB2cHint}
                </Text>
                <Field
                  label={pipelineCopy.wonValue}
                  value={win.wonValue}
                  onChangeText={(x) => setWin((w) => ({ ...w, wonValue: x }))}
                  keyboardType="decimal-pad"
                />
                {o.kind === "b2b" && o.proposal.billingModel ? (
                  <>
                    <Field
                      label={`${pipelineCopy.agreementStartsOn} (AAAA-MM-DD)`}
                      hint={`Hasta el ${formatDateOnly(proposalEndsOn(win.startsOn || o.today, o.proposal.months))}`}
                      value={win.startsOn}
                      onChangeText={(x) => setWin((w) => ({ ...w, startsOn: x }))}
                    />
                    <Checkbox
                      label={pipelineCopy.createAgreement}
                      checked={win.createAgreement}
                      onChange={(x) => setWin((w) => ({ ...w, createAgreement: x }))}
                    />
                  </>
                ) : null}
                <Button
                  label={pipelineCopy.winTitle}
                  loading={busy}
                  onPress={() =>
                    void run(
                      () =>
                        repo.win({
                          id: o.id,
                          version: o.version,
                          wonValue: win.wonValue ? Number(win.wonValue.replace(/[$,\s]/g, "")) : undefined,
                          createAgreement: win.createAgreement,
                          agreementStartsOn: o.proposal.billingModel ? win.startsOn || undefined : undefined,
                        }),
                      pipelineCopy.won,
                    )
                  }
                />
              </View>
            ) : null}
            <Button
              label={pipelineCopy.loseTitle}
              variant="secondary"
              onPress={() => setPanel(panel === "lose" ? null : "lose")}
            />
            {panel === "lose" ? (
              <View style={styles.stack}>
                <Select
                  label={pipelineCopy.lossReason}
                  placeholder="Elige el motivo"
                  options={LOSS_REASONS.map((r) => ({ value: r, label: LOSS_REASON_LABELS[r] }))}
                  value={loss.reason}
                  onChange={(x) => setLoss((l) => ({ ...l, reason: x as LossReason }))}
                />
                <Field
                  label={pipelineCopy.lossNotes}
                  value={loss.notes}
                  onChangeText={(x) => setLoss((l) => ({ ...l, notes: x }))}
                />
                <Button
                  label={pipelineCopy.loseTitle}
                  loading={busy}
                  onPress={() =>
                    loss.reason
                      ? void run(
                          () =>
                            repo.lose(o.id, o.version, loss.reason as LossReason, loss.notes || undefined),
                          pipelineCopy.lost,
                        )
                      : setError("Elige el motivo")
                  }
                />
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}

      {canWrite && o.status === "perdida" && repo ? (
        <Card title={pipelineCopy.reopenTitle}>
          <View style={styles.stack}>
            <Field label={pipelineCopy.reason} required value={reopenReason} onChangeText={setReopenReason} />
            <Button
              label={pipelineCopy.reopen}
              variant="secondary"
              loading={busy}
              onPress={() =>
                void run(
                  () => repo.reopen(o.id, o.version, openStages[0]?.id ?? "", reopenReason),
                  pipelineCopy.reopened,
                )
              }
            />
          </View>
        </Card>
      ) : null}

      <Card title={pipelineCopy.tasks}>
        {tasks.length === 0 ? (
          <Text style={textStyle("bodySmall", "muted")}>{pipelineCopy.tasksEmpty}</Text>
        ) : null}
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            today={o.today}
            canWrite={canWrite}
            onComplete={(outcome) =>
              void run(
                () => createCrmRepository(client!).completeTask({ taskId: t.id, outcome }),
                pipelineCopy.taskDone,
              )
            }
          />
        ))}
        {canWrite && open && repo ? (
          <View style={styles.stack}>
            <Select
              label={pipelineCopy.taskKind}
              options={OPPORTUNITY_TASK_KINDS.map((k) => ({
                value: k,
                label: OPPORTUNITY_TASK_KIND_LABELS[k],
              }))}
              value={task.kind}
              onChange={(x) => setTask((s) => ({ ...s, kind: x as OpportunityTaskKind }))}
            />
            <Field
              label={`${pipelineCopy.taskDueOn} (AAAA-MM-DD)`}
              value={task.dueOn}
              onChangeText={(x) => setTask((s) => ({ ...s, dueOn: x }))}
            />
            <Field
              label={pipelineCopy.taskNotes}
              value={task.notes}
              onChangeText={(x) => setTask((s) => ({ ...s, notes: x }))}
            />
            <Button
              label={pipelineCopy.addTask}
              variant="secondary"
              loading={busy}
              onPress={() =>
                void run(
                  () =>
                    repo.createTask({
                      opportunityId: o.id,
                      requestId: task.requestId,
                      kind: task.kind,
                      dueOn: task.dueOn,
                      notes: task.notes || undefined,
                    }),
                  pipelineCopy.taskAdded,
                ).then((ok) =>
                  ok ? setTask((s) => ({ ...s, notes: "", requestId: newRequestId() })) : undefined,
                )
              }
            />
          </View>
        ) : null}
      </Card>

      <Card title={pipelineCopy.history}>
        {canWrite && repo ? (
          <View style={styles.stack}>
            <Field label={pipelineCopy.note} value={note} onChangeText={setNote} />
            <Button
              label={pipelineCopy.addNote}
              variant="secondary"
              loading={busy}
              onPress={() =>
                void run(() => repo.addNote(o.id, note), pipelineCopy.noteAdded).then((ok) =>
                  ok ? setNote("") : undefined,
                )
              }
            />
          </View>
        ) : null}
        {events.length === 0 ? (
          <Text style={textStyle("bodySmall", "muted")}>{pipelineCopy.historyEmpty}</Text>
        ) : null}
        {events.map((e) => {
          const v = presentOpportunityEvent(e);
          return (
            <View key={e.id} style={styles.event}>
              <Text style={textStyle("label")}>
                {v.what}
                {v.detail ? ` · ${v.detail}` : ""}
              </Text>
              {v.note ? <Text style={textStyle("bodySmall")}>{v.note}</Text> : null}
              <Text style={textStyle("caption", "muted")}>
                {v.who} · {v.when}
              </Text>
            </View>
          );
        })}
      </Card>

      {canWrite && open ? (
        <Card>
          <Button
            label={pipelineCopy.edit}
            variant="secondary"
            onPress={() => setPanel(panel === "edit" ? null : "edit")}
          />
          {panel === "edit" ? (
            <EditOpportunity
              opportunity={o}
              owners={owners}
              onDone={() => {
                toast({ message: pipelineCopy.saved, tone: "success" });
                setPanel(null);
                reload();
              }}
            />
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={textStyle("caption", "muted")}>{label}</Text>
      <Text style={textStyle("bodySmall")}>{value}</Text>
    </View>
  );
}

function TaskRow({
  task,
  today,
  canWrite,
  onComplete,
}: {
  task: OpportunityTask;
  today: string;
  canWrite: boolean;
  onComplete: (outcome: TaskOutcome) => void;
}) {
  const v = presentOpportunityTask(task, today);
  const [outcome, setOutcome] = useState<TaskOutcome>("contactado");
  return (
    <View style={styles.event}>
      <View style={styles.inline}>
        <Text style={textStyle("label")}>
          {v.what} · {v.due}
        </Text>
        <Badge label={v.status} tone={v.done ? "neutral" : v.overdue ? "danger" : "info"} />
      </View>
      {v.notes ? <Text style={textStyle("bodySmall", "muted")}>{v.notes}</Text> : null}
      {canWrite && !v.done ? (
        <>
          <Select
            label="Resultado"
            options={(["contactado", "sin_respuesta", "agendo_cita", "no_interesado"] as const).map((x) => ({
              value: x,
              label: TASK_OUTCOME_LABELS[x],
            }))}
            value={outcome}
            onChange={(x) => setOutcome(x as TaskOutcome)}
          />
          <Button label={pipelineCopy.completeTask} variant="secondary" onPress={() => onComplete(outcome)} />
        </>
      ) : null}
    </View>
  );
}

function EditOpportunity({
  opportunity,
  owners,
  onDone,
}: {
  opportunity: Opportunity;
  owners: PipelineOwner[];
  onDone: () => void;
}) {
  const { client } = useAuth();
  const [v, setV] = useState<OpportunityValues>(() => initialOpportunityValues(opportunity));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof OpportunityValues) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  const b2b = opportunity.kind === "b2b";

  async function save() {
    if (!client) return;
    const parsed = updateOpportunitySchema.safeParse({
      id: opportunity.id,
      version: opportunity.version,
      reason,
      ...opportunityInput(v, b2b),
    });
    if (!parsed.success) return setErrors(flatErrors(parsed.error.issues));
    setErrors({});
    setBusy(true);
    const r = await createPipelineRepository(client).update(parsed.data);
    setBusy(false);
    if (!r.ok) return setError(pipelineErrorMessage(r.error));
    onDone();
  }

  return (
    <View style={styles.stack}>
      {b2b ? (
        <B2bOpportunityFields v={v} set={set} errors={errors} companyLocked={!!opportunity.clientId} />
      ) : null}
      <CommonOpportunityFields v={v} set={set} errors={errors} owners={owners} />
      <Field
        label={pipelineCopy.reason}
        required
        value={reason}
        onChangeText={setReason}
        error={errors.reason}
      />
      <Notice tone="danger" text={error} />
      <Button label={pipelineCopy.save} loading={busy} onPress={() => void save()} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  inline: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs },
  event: { gap: space.xxs, paddingVertical: space.xs },
});
