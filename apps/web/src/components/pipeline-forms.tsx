"use client";

import {
  BILLING_MODEL_LABELS,
  BILLING_MODELS,
  LOSS_REASON_LABELS,
  LOSS_REASONS,
  OPPORTUNITY_KIND_HINTS,
  OPPORTUNITY_KIND_LABELS,
  OPPORTUNITY_SOURCE_LABELS,
  OPPORTUNITY_SOURCES,
  OPPORTUNITY_TASK_KIND_LABELS,
  OPPORTUNITY_TASK_KINDS,
  pipelineCopy,
  proposalEndsOn,
  proposalNeedsFee,
  TASK_OUTCOME_LABELS,
  VEHICLE_RULE_LABELS,
  VEHICLE_RULES,
  formatDateOnly,
  type BillingModel,
  type Opportunity,
  type OpportunityKind,
  type PipelineOwner,
  type PipelineStage,
} from "@meguiars/domain";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  addOpportunityNoteAction,
  completeOpportunityTaskAction,
  createOpportunityAction,
  createOpportunityTaskAction,
  loseOpportunityAction,
  moveOpportunityAction,
  reopenOpportunityAction,
  updateOpportunityAction,
  upsertPipelineStageAction,
  winOpportunityAction,
  type PipelineFormState,
} from "@/app/actions/pipeline";
import { Button } from "./ui/button";
import { Checkbox, Input, Select } from "./ui/field";
import { useToast } from "./ui/overlay";

type Option = { value: string; label: string };

function Submit({ label, variant = "primary" }: { label: string; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" label={label} loading={pending} variant={variant} size="sm" />;
}

const valueOf = (state: PipelineFormState, key: string, fallback = "") => {
  const v = state.values?.[key];
  return typeof v === "string" ? v : fallback;
};

function useToastOnMessage(state: PipelineFormState) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

function FormError({ state }: { state: PipelineFormState }) {
  return state.error ? (
    <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
      {state.error}
    </p>
  ) : null;
}

const str = (n: number | null | undefined) => (n == null ? "" : String(n));

/** Datos del prospecto y propuesta de convenio (B2B). */
function B2bFields({ state, o }: { state: PipelineFormState; o?: Opportunity }) {
  const f = state.fields ?? {};
  const [model, setModel] = useState(valueOf(state, "billingModel", o?.proposal.billingModel ?? ""));
  const linkedClient = !!o?.clientId;
  return (
    <>
      <fieldset className="flex flex-col gap-md">
        <legend className="mg-label">{pipelineCopy.prospectSection}</legend>
        <p className="mg-hint">{pipelineCopy.prospectHint}</p>
        <div className="grid gap-md md:grid-cols-2">
          <Input
            name="companyName"
            label={pipelineCopy.companyName}
            defaultValue={valueOf(state, "companyName", o?.prospect.companyName ?? "")}
            disabled={linkedClient}
            error={f.companyName}
          />
          <Input
            name="legalName"
            label={pipelineCopy.legalName}
            defaultValue={valueOf(state, "legalName", o?.prospect.legalName ?? "")}
            error={f.legalName}
          />
          <Input
            name="rfc"
            label={pipelineCopy.rfc}
            autoCapitalize="characters"
            defaultValue={valueOf(state, "rfc", o?.prospect.rfc ?? "")}
            error={f.rfc}
          />
          <Input
            name="contactName"
            label={pipelineCopy.contactName}
            defaultValue={valueOf(state, "contactName", o?.prospect.contactName ?? "")}
            error={f.contactName}
          />
          <Input
            name="contactTitle"
            label={pipelineCopy.contactTitle}
            defaultValue={valueOf(state, "contactTitle", o?.prospect.contactTitle ?? "")}
            error={f.contactTitle}
          />
          <Input
            name="contactPhone"
            type="tel"
            label={pipelineCopy.contactPhone}
            defaultValue={valueOf(state, "contactPhone", o?.prospect.contactPhone ?? "")}
            error={f.contactPhone}
          />
          <Input
            name="contactEmail"
            type="email"
            label={pipelineCopy.contactEmail}
            defaultValue={valueOf(state, "contactEmail", o?.prospect.contactEmail ?? "")}
            error={f.contactEmail}
          />
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-md">
        <legend className="mg-label">{pipelineCopy.proposalSection}</legend>
        <p className="mg-hint">{pipelineCopy.proposalHint}</p>
        <div className="grid gap-md md:grid-cols-2">
          <Select
            name="billingModel"
            label={pipelineCopy.billingModel}
            options={[
              { value: "", label: pipelineCopy.noProposal },
              ...BILLING_MODELS.map((m) => ({ value: m, label: BILLING_MODEL_LABELS[m] })),
            ]}
            value={model}
            onChange={(e) => setModel(e.currentTarget.value)}
          />
          {model ? (
            <>
              <Input
                name="months"
                label={pipelineCopy.months}
                inputMode="numeric"
                defaultValue={valueOf(state, "months", str(o?.proposal.months ?? 12))}
                error={f.months}
              />
              <Select
                name="vehicleRule"
                label={pipelineCopy.vehicleRule}
                options={VEHICLE_RULES.map((r) => ({ value: r, label: VEHICLE_RULE_LABELS[r] }))}
                defaultValue={valueOf(state, "vehicleRule", o?.proposal.vehicleRule ?? "cualquiera")}
              />
              <Input
                name="paymentTermsDays"
                label={pipelineCopy.paymentTermsDays}
                inputMode="numeric"
                defaultValue={valueOf(state, "paymentTermsDays", str(o?.proposal.paymentTermsDays ?? 30))}
                error={f.paymentTermsDays}
              />
              <Input
                name="creditLimit"
                label={pipelineCopy.creditLimit}
                inputMode="decimal"
                defaultValue={valueOf(state, "creditLimit", str(o?.proposal.creditLimit))}
                error={f.creditLimit}
              />
              {proposalNeedsFee(model as BillingModel) ? (
                <>
                  <Input
                    name="feeAmount"
                    label={pipelineCopy.feeAmount}
                    inputMode="decimal"
                    defaultValue={valueOf(state, "feeAmount", str(o?.proposal.feeAmount))}
                    error={f.feeAmount}
                  />
                  <Input
                    name="includedUnits"
                    label={pipelineCopy.includedUnits}
                    inputMode="numeric"
                    defaultValue={valueOf(state, "includedUnits", str(o?.proposal.includedUnits))}
                    error={f.includedUnits}
                  />
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </fieldset>
    </>
  );
}

/** Campos comunes de alta y edición. */
function CommonFields({
  state,
  o,
  owners,
  defaultOwnerId,
  today,
}: {
  state: PipelineFormState;
  o?: Opportunity;
  owners: PipelineOwner[];
  defaultOwnerId?: string;
  today: string;
}) {
  const f = state.fields ?? {};
  return (
    <div className="grid gap-md md:grid-cols-2">
      <Input
        name="title"
        label={pipelineCopy.titleField}
        hint={pipelineCopy.titleHint}
        required
        defaultValue={valueOf(state, "title", o?.title ?? "")}
        error={f.title}
      />
      <Input
        name="estimatedValue"
        label={pipelineCopy.estimatedValue}
        inputMode="decimal"
        required
        defaultValue={valueOf(state, "estimatedValue", str(o?.estimatedValue))}
        error={f.estimatedValue}
      />
      <Select
        name="ownerId"
        label={pipelineCopy.owner}
        options={[
          { value: "", label: pipelineCopy.unassigned },
          ...owners.map((u) => ({ value: u.userId, label: u.fullName })),
        ]}
        defaultValue={valueOf(state, "ownerId", o ? (o.ownerId ?? "") : (defaultOwnerId ?? ""))}
        error={f.ownerId}
      />
      <Select
        name="source"
        label={pipelineCopy.source}
        options={[
          { value: "", label: "—" },
          ...OPPORTUNITY_SOURCES.map((s) => ({ value: s, label: OPPORTUNITY_SOURCE_LABELS[s] })),
        ]}
        defaultValue={valueOf(state, "source", o?.source ?? "")}
      />
      <Input
        name="nextAction"
        label={pipelineCopy.nextAction}
        defaultValue={valueOf(state, "nextAction", o?.nextAction ?? "")}
        error={f.nextAction}
      />
      <Input
        name="nextActionOn"
        type="date"
        label={pipelineCopy.nextActionOn}
        min={o ? undefined : today}
        defaultValue={valueOf(state, "nextActionOn", o?.nextActionOn ?? "")}
        error={f.nextActionOn}
      />
      <Input
        name="expectedCloseOn"
        type="date"
        label={pipelineCopy.expectedCloseOn}
        defaultValue={valueOf(state, "expectedCloseOn", o?.expectedCloseOn ?? "")}
        error={f.expectedCloseOn}
      />
      <Input
        name="notes"
        label={pipelineCopy.notes}
        defaultValue={valueOf(state, "notes", o?.notes ?? "")}
        error={f.notes}
      />
    </div>
  );
}

/** Alta de oportunidad (B2B: cuenta, empresa registrada o prospecto; B2C premium: cliente). */
export function NewOpportunityForm({
  requestId,
  kinds,
  defaultKind,
  stages,
  owners,
  defaultOwnerId,
  accounts,
  companies,
  clients,
  defaults,
  today,
}: {
  requestId: string;
  kinds: OpportunityKind[];
  defaultKind: OpportunityKind;
  stages: PipelineStage[];
  owners: Record<OpportunityKind, PipelineOwner[]>;
  defaultOwnerId?: string;
  accounts: Option[];
  companies: Option[];
  clients: Option[];
  defaults: { clientId?: string; accountId?: string };
  today: string;
}) {
  const [state, action] = useActionState(createOpportunityAction, {});
  const [kind, setKind] = useState<OpportunityKind>(valueOf(state, "kind", defaultKind) as OpportunityKind);
  const f = state.fields ?? {};
  const openStages = stages.filter((s) => s.kind === "abierta" && s.active);
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-lg" noValidate>
      <input type="hidden" name="requestId" value={requestId} />
      <div className="grid gap-md md:grid-cols-2">
        <Select
          name="kind"
          label={pipelineCopy.kind}
          hint={OPPORTUNITY_KIND_HINTS[kind]}
          options={kinds.map((k) => ({ value: k, label: OPPORTUNITY_KIND_LABELS[k] }))}
          value={kind}
          onChange={(e) => setKind(e.currentTarget.value as OpportunityKind)}
        />
        <Select
          name="stageId"
          label={pipelineCopy.stage}
          options={openStages.map((s) => ({ value: s.id, label: s.name }))}
          defaultValue={valueOf(state, "stageId", openStages[0]?.id ?? "")}
        />
      </div>
      <fieldset className="flex flex-col gap-md">
        <legend className="mg-label">{pipelineCopy.contactSection}</legend>
        {kind === "b2b" ? (
          <div className="grid gap-md md:grid-cols-2">
            <Select
              name="b2bAccountId"
              label={pipelineCopy.linkAccount}
              options={[{ value: "", label: "—" }, ...accounts]}
              defaultValue={valueOf(state, "b2bAccountId", defaults.accountId ?? "")}
            />
            <Select
              name="clientId"
              label={pipelineCopy.linkClient}
              options={[{ value: "", label: "—" }, ...companies]}
              defaultValue={valueOf(state, "clientId", "")}
            />
          </div>
        ) : (
          <Select
            name="clientId"
            label={pipelineCopy.linkClient}
            placeholder="Elige el cliente"
            required
            options={clients}
            defaultValue={valueOf(state, "clientId", defaults.clientId ?? "")}
            error={f.clientId}
          />
        )}
      </fieldset>
      {kind === "b2b" ? <B2bFields state={state} /> : null}
      <CommonFields state={state} owners={owners[kind]} defaultOwnerId={defaultOwnerId} today={today} />
      <FormError state={state} />
      <div>
        <Submit label={pipelineCopy.create} />
      </div>
    </form>
  );
}

/** Edición de una oportunidad abierta (con motivo). */
export function EditOpportunityForm({
  opportunity,
  owners,
  today,
}: {
  opportunity: Opportunity;
  owners: PipelineOwner[];
  today: string;
}) {
  const [state, action] = useActionState(updateOpportunityAction, {});
  useToastOnMessage(state);
  const f = state.fields ?? {};
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-lg" noValidate>
      <input type="hidden" name="id" value={opportunity.id} />
      <input type="hidden" name="version" value={opportunity.version} />
      <input type="hidden" name="kind" value={opportunity.kind} />
      {opportunity.kind === "b2b" ? <B2bFields state={state} o={opportunity} /> : null}
      <CommonFields state={state} o={opportunity} owners={owners} today={today} />
      <Input
        name="reason"
        id="edit-reason"
        label={pipelineCopy.reason}
        required
        defaultValue={valueOf(state, "reason")}
        error={f.reason}
      />
      <FormError state={state} />
      <div>
        <Submit label={pipelineCopy.save} />
      </div>
    </form>
  );
}

/** Cambio de etapa con comentario (queda en el historial). */
export function MoveStageForm({
  opportunity,
  stages,
}: {
  opportunity: Opportunity;
  stages: PipelineStage[];
}) {
  const [state, action] = useActionState(moveOpportunityAction, {});
  useToastOnMessage(state);
  const options = stages
    .filter((s) => s.kind === "abierta" && s.active && s.id !== opportunity.stageId)
    .map((s) => ({ value: s.id, label: s.name }));
  if (options.length === 0) return null;
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-wrap items-end gap-sm" noValidate>
      <input type="hidden" name="id" value={opportunity.id} />
      <input type="hidden" name="version" value={opportunity.version} />
      <Select
        name="stageId"
        id="move-stage"
        label={pipelineCopy.moveTo}
        options={options}
        defaultValue={options[0]!.value}
      />
      <Input name="note" id="move-note" label={pipelineCopy.stageNote} defaultValue="" />
      <Submit label={pipelineCopy.move} variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

export function NoteForm({ opportunityId }: { opportunityId: string }) {
  const [state, action] = useActionState(addOpportunityNoteAction, {});
  useToastOnMessage(state);
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-wrap items-end gap-sm" noValidate>
      <input type="hidden" name="id" value={opportunityId} />
      <Input
        name="note"
        id="note"
        label={pipelineCopy.note}
        defaultValue={state.error ? valueOf(state, "note") : ""}
        error={state.fields?.note}
      />
      <Submit label={pipelineCopy.addNote} variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

/** Ganar: B2B se convierte en cuenta (y convenio) en la base; B2C premium sólo cierra. */
export function WinForm({ opportunity, today }: { opportunity: Opportunity; today: string }) {
  const [state, action] = useActionState(winOpportunityAction, {});
  const proposal = opportunity.kind === "b2b" && opportunity.proposal.billingModel;
  const [start, setStart] = useState(valueOf(state, "agreementStartsOn", today));
  return (
    <form
      key={state.at ?? 0}
      action={action}
      className="flex flex-col gap-md"
      noValidate
      data-testid="win-form"
    >
      <input type="hidden" name="id" value={opportunity.id} />
      <input type="hidden" name="version" value={opportunity.version} />
      <p className="text-sm text-muted">
        {opportunity.kind === "b2b" ? pipelineCopy.winB2bHint : pipelineCopy.winB2cHint}
      </p>
      <div className="grid gap-md md:grid-cols-2">
        <Input
          name="wonValue"
          label={pipelineCopy.wonValue}
          inputMode="decimal"
          defaultValue={valueOf(state, "wonValue", String(opportunity.estimatedValue))}
          error={state.fields?.wonValue}
        />
        {proposal ? (
          <Input
            name="agreementStartsOn"
            type="date"
            label={pipelineCopy.agreementStartsOn}
            hint={`Hasta el ${formatDateOnly(proposalEndsOn(start || today, opportunity.proposal.months))}`}
            value={start}
            onChange={(e) => setStart(e.currentTarget.value)}
            error={state.fields?.agreementStartsOn}
          />
        ) : null}
      </div>
      {proposal ? (
        <Checkbox name="createAgreement" value="on" label={pipelineCopy.createAgreement} checked />
      ) : null}
      <Input name="note" id="win-note" label={pipelineCopy.stageNote} defaultValue={valueOf(state, "note")} />
      <FormError state={state} />
      <div>
        <Submit label={pipelineCopy.winTitle} />
      </div>
    </form>
  );
}

export function LoseForm({ opportunity }: { opportunity: Opportunity }) {
  const [state, action] = useActionState(loseOpportunityAction, {});
  useToastOnMessage(state);
  return (
    <form
      key={state.at ?? 0}
      action={action}
      className="flex flex-col gap-md"
      noValidate
      data-testid="lose-form"
    >
      <input type="hidden" name="id" value={opportunity.id} />
      <input type="hidden" name="version" value={opportunity.version} />
      <div className="grid gap-md md:grid-cols-2">
        <Select
          name="lossReason"
          label={pipelineCopy.lossReason}
          placeholder="Elige el motivo"
          required
          options={LOSS_REASONS.map((r) => ({ value: r, label: LOSS_REASON_LABELS[r] }))}
          defaultValue={valueOf(state, "lossReason")}
          error={state.fields?.lossReason}
        />
        <Input name="lossNotes" label={pipelineCopy.lossNotes} defaultValue={valueOf(state, "lossNotes")} />
      </div>
      <FormError state={state} />
      <div>
        <Submit label={pipelineCopy.loseTitle} variant="secondary" />
      </div>
    </form>
  );
}

export function ReopenForm({ opportunity, stages }: { opportunity: Opportunity; stages: PipelineStage[] }) {
  const [state, action] = useActionState(reopenOpportunityAction, {});
  useToastOnMessage(state);
  const options = stages
    .filter((s) => s.kind === "abierta" && s.active)
    .map((s) => ({ value: s.id, label: s.name }));
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-wrap items-end gap-sm" noValidate>
      <input type="hidden" name="id" value={opportunity.id} />
      <input type="hidden" name="version" value={opportunity.version} />
      <Select
        name="stageId"
        id="reopen-stage"
        label={pipelineCopy.stage}
        options={options}
        defaultValue={options[0]?.value}
      />
      <Input
        name="reason"
        id="reopen-reason"
        label={pipelineCopy.reason}
        required
        defaultValue={valueOf(state, "reason")}
        error={state.fields?.reason}
      />
      <Submit label={pipelineCopy.reopen} variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

export function TaskForm({
  opportunityId,
  requestId,
  today,
}: {
  opportunityId: string;
  requestId: string;
  today: string;
}) {
  const [state, action] = useActionState(createOpportunityTaskAction, {});
  useToastOnMessage(state);
  const f = state.fields ?? {};
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-wrap items-end gap-sm" noValidate>
      <input type="hidden" name="id" value={opportunityId} />
      {/* La página se vuelve a renderizar tras agregar: cada tarea usa una solicitud nueva. */}
      <input type="hidden" name="requestId" value={requestId} />
      <Select
        name="taskKind"
        label={pipelineCopy.taskKind}
        options={OPPORTUNITY_TASK_KINDS.map((k) => ({ value: k, label: OPPORTUNITY_TASK_KIND_LABELS[k] }))}
        defaultValue={valueOf(state, "taskKind", "llamar")}
        error={f.taskKind || undefined}
      />
      <Input
        name="dueOn"
        type="date"
        min={today}
        label={pipelineCopy.taskDueOn}
        defaultValue={valueOf(state, "dueOn", today)}
        error={f.dueOn || undefined}
      />
      <Input
        name="taskNotes"
        label={pipelineCopy.taskNotes}
        defaultValue={state.error ? valueOf(state, "taskNotes") : ""}
      />
      <Submit label={pipelineCopy.addTask} variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

export function CompleteTaskButton({ opportunityId, taskId }: { opportunityId: string; taskId: string }) {
  const [state, action] = useActionState(completeOpportunityTaskAction, {});
  useToastOnMessage(state);
  return (
    <form action={action} className="flex flex-wrap items-end gap-sm">
      <input type="hidden" name="id" value={opportunityId} />
      <input type="hidden" name="taskId" value={taskId} />
      <Select
        name="outcome"
        id={`outcome-${taskId}`}
        label="Resultado"
        options={(["contactado", "sin_respuesta", "agendo_cita", "no_interesado"] as const).map((o) => ({
          value: o,
          label: TASK_OUTCOME_LABELS[o],
        }))}
        defaultValue="contactado"
      />
      <Submit label={pipelineCopy.completeTask} variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

/** Alta o edición de una etapa (admin corporativo). Las de cierre sólo cambian de nombre. */
export function StageForm({ stage }: { stage?: PipelineStage }) {
  const [state, action] = useActionState(upsertPipelineStageAction, {});
  useToastOnMessage(state);
  const f = state.fields ?? {};
  const closing = stage && stage.kind !== "abierta";
  const suffix = stage?.id ?? "new";
  return (
    <form
      key={state.at ?? 0}
      action={action}
      className="flex flex-wrap items-end gap-sm"
      noValidate
      data-testid="stage-form"
    >
      {stage ? <input type="hidden" name="id" value={stage.id} /> : null}
      <Input
        name="name"
        id={`stage-name-${suffix}`}
        label={pipelineCopy.stageName}
        defaultValue={valueOf(state, "name", stage?.name ?? "")}
        error={f.name}
      />
      {closing ? (
        <>
          <input type="hidden" name="position" value="1" />
          <input type="hidden" name="probability" value={stage.probability} />
          <input type="hidden" name="active" value="on" />
        </>
      ) : (
        <>
          <Input
            name="position"
            id={`stage-position-${suffix}`}
            label={pipelineCopy.position}
            inputMode="numeric"
            defaultValue={valueOf(state, "position", str(stage?.position))}
            error={f.position}
          />
          <Input
            name="probability"
            id={`stage-probability-${suffix}`}
            label={pipelineCopy.probability}
            inputMode="numeric"
            defaultValue={valueOf(state, "probability", str(stage?.probability ?? 50))}
            error={f.probability}
          />
          <Checkbox
            name="active"
            id={`stage-active-${suffix}`}
            value="on"
            label={pipelineCopy.active}
            checked={stage ? stage.active : true}
          />
        </>
      )}
      <Input
        name="reason"
        id={`stage-reason-${suffix}`}
        label={pipelineCopy.reason}
        defaultValue={valueOf(state, "reason")}
        error={f.reason}
      />
      <Submit label={stage ? pipelineCopy.saveStage : pipelineCopy.newStage} variant="secondary" />
      <FormError state={state} />
    </form>
  );
}
