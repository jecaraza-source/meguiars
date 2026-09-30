"use client";

import {
  COMMERCIAL_COPY,
  estimateQuote,
  formatMoney,
  LEAD_CONSENT_CHANNELS,
  LEAD_CONSENT_LABELS,
  LEAD_CONTACT_CHANNEL_LABELS,
  LEAD_CONTACT_CHANNELS,
  LEAD_LOSS_REASON_LABELS,
  LEAD_LOSS_REASONS,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  LEAD_TASK_KIND_LABELS,
  LEAD_TASK_KINDS,
  LEAD_MILESTONES,
  marginPct,
  QUOTE_STATUS_ACTIONS,
  TASK_OUTCOME_LABELS,
  type CatalogItem,
  type DuplicatePair,
  type Lead,
  type LeadOwner,
  type LeadStage,
  type Quote,
  type QuoteStatus,
} from "@meguiars/domain";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  addLeadNoteAction,
  addQuoteDiscountAction,
  bookQuoteAction,
  completeLeadTaskAction,
  createLeadAction,
  createLeadTaskAction,
  createQuoteAction,
  linkLeadClientAction,
  logLeadContactAction,
  loseLeadAction,
  mergeClientsAction,
  moveLeadAction,
  quoteStatusAction,
  reopenLeadAction,
  setQuoteItemAction,
  updateLeadAction,
  updateQuoteAction,
  upsertLeadStageAction,
  voidQuoteDiscountAction,
  winLeadAction,
  type CommercialFormState,
} from "@/app/actions/commercial";
import { Button } from "./ui/button";
import { Checkbox, Input, Select } from "./ui/field";
import { useToast } from "./ui/overlay";

type Option = { value: string; label: string };

function Submit({ label, variant = "primary" }: { label: string; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" label={label} loading={pending} variant={variant} size="sm" />;
}

const valueOf = (state: CommercialFormState, key: string, fallback = "") => {
  const v = state.values?.[key];
  return typeof v === "string" ? v : fallback;
};
const listOf = (state: CommercialFormState, key: string, fallback: readonly string[] = []) => {
  const v = state.values?.[key];
  return Array.isArray(v) ? v : typeof v === "string" && v ? [v] : [...fallback];
};

function useToastOnMessage(state: CommercialFormState) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

function FormError({ state }: { state: CommercialFormState }) {
  return state.error ? (
    <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
      {state.error}
    </p>
  ) : null;
}

const str = (n: number | null | undefined) => (n == null ? "" : String(n));

// ---------------------------------------------------------------------------
// Prospectos
// ---------------------------------------------------------------------------

function LeadFields({
  state,
  lead,
  services,
  owners,
  defaultOwnerId,
  today,
}: {
  state: CommercialFormState;
  lead?: Lead;
  services: Option[];
  owners: LeadOwner[];
  defaultOwnerId?: string | undefined;
  today: string;
}) {
  const f = state.fields ?? {};
  const [source, setSource] = useState(valueOf(state, "source", lead?.source ?? ""));
  const interest = listOf(state, "interestServiceIds", lead?.interestServiceIds ?? []);
  const consent = listOf(state, "consentChannels", lead?.consentChannels ?? []);
  return (
    <>
      <div className="grid gap-md md:grid-cols-2">
        <Input
          name="fullName"
          label="Nombre"
          required
          defaultValue={valueOf(state, "fullName", lead?.fullName ?? "")}
          error={f.fullName}
        />
        <Select
          name="source"
          label="Canal de origen"
          placeholder="¿Por dónde llegó?"
          required
          options={LEAD_SOURCES.map((s) => ({ value: s, label: LEAD_SOURCE_LABELS[s] }))}
          value={source}
          onChange={(e) => setSource(e.currentTarget.value)}
          error={f.source}
        />
        <Input
          name="phone"
          type="tel"
          label="Teléfono"
          defaultValue={valueOf(state, "phone", lead?.phone ?? "")}
          error={f.phone}
        />
        <Input
          name="email"
          type="email"
          label="Email"
          defaultValue={valueOf(state, "email", lead?.email ?? "")}
          error={f.email}
        />
        <Input
          name="socialHandle"
          label="Usuario en redes"
          hint="Por ejemplo @usuario, si escribió por mensaje directo"
          defaultValue={valueOf(state, "socialHandle", lead?.socialHandle ?? "")}
          error={f.socialHandle}
        />
        <Input
          name="sourceDetail"
          label={source === "recomendacion" ? "¿Quién recomendó?" : "Detalle del origen"}
          hint="Anuncio, publicación, campaña o persona"
          defaultValue={valueOf(state, "sourceDetail", lead?.sourceDetail ?? "")}
          error={f.sourceDetail}
        />
        <Input
          name="vehicleDescription"
          label="Vehículo"
          hint="Marca, modelo y año, si los dio"
          defaultValue={valueOf(state, "vehicleDescription", lead?.vehicleDescription ?? "")}
          error={f.vehicleDescription}
        />
        <Input
          name="estimatedValue"
          label="Valor estimado"
          inputMode="decimal"
          defaultValue={valueOf(state, "estimatedValue", str(lead?.estimatedValue))}
          error={f.estimatedValue}
        />
      </div>
      <fieldset className="flex flex-col gap-xs">
        <legend className="mg-label">Servicios de interés</legend>
        <div className="grid gap-xs md:grid-cols-2">
          {services.map((s) => (
            <Checkbox
              key={s.value}
              name="interestServiceIds"
              value={s.value}
              label={s.label}
              checked={interest.includes(s.value)}
            />
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-xs">
        <legend className="mg-label">Acepta recibir promociones por</legend>
        <p className="mg-hint">
          Sólo lo que la persona autorizó. Responder a su consulta no requiere este consentimiento.
        </p>
        <div className="flex flex-wrap gap-md">
          {LEAD_CONSENT_CHANNELS.map((c) => (
            <Checkbox
              key={c}
              name="consentChannels"
              value={c}
              label={LEAD_CONSENT_LABELS[c]}
              checked={consent.includes(c)}
            />
          ))}
        </div>
      </fieldset>
      <div className="grid gap-md md:grid-cols-3">
        <Select
          name="ownerId"
          label="Responsable"
          options={[
            { value: "", label: "Sin asignar" },
            ...owners.map((o) => ({ value: o.userId, label: o.fullName })),
          ]}
          defaultValue={valueOf(state, "ownerId", lead ? (lead.ownerId ?? "") : (defaultOwnerId ?? ""))}
          error={f.ownerId}
        />
        <Input
          name="nextAction"
          label="Siguiente acción"
          defaultValue={valueOf(state, "nextAction", lead?.nextAction ?? "")}
          error={f.nextAction}
        />
        <Input
          name="nextActionOn"
          type="date"
          min={today}
          label="Fecha de la acción"
          defaultValue={valueOf(state, "nextActionOn", lead?.nextActionOn ?? "")}
          error={f.nextActionOn}
        />
      </div>
      <Input
        name="notes"
        label="Notas"
        defaultValue={valueOf(state, "notes", lead?.notes ?? "")}
        error={f.notes}
      />
    </>
  );
}

export function NewLeadForm({
  requestId,
  services,
  owners,
  defaultOwnerId,
  today,
}: {
  requestId: string;
  services: Option[];
  owners: LeadOwner[];
  defaultOwnerId?: string | undefined;
  today: string;
}) {
  const [state, action] = useActionState(createLeadAction, {});
  return (
    <form
      key={state.at ?? 0}
      action={action}
      className="flex flex-col gap-lg"
      noValidate
      data-testid="lead-form"
    >
      <input type="hidden" name="requestId" value={requestId} />
      <LeadFields
        state={state}
        services={services}
        owners={owners}
        defaultOwnerId={defaultOwnerId}
        today={today}
      />
      {state.fields?.confirmMatches ? (
        <div
          className="mg-tone flex flex-col gap-sm rounded-md border p-md text-sm"
          data-tone="warning"
          data-testid="lead-matches"
        >
          <p>{state.fields.confirmMatches}</p>
          <Checkbox name="confirmMatches" value="on" label="Es otra persona: registrar de todos modos" />
        </div>
      ) : null}
      <FormError state={state} />
      <div>
        <Submit label={COMMERCIAL_COPY.newLead} />
      </div>
    </form>
  );
}

export function EditLeadForm({
  lead,
  services,
  owners,
}: {
  lead: Lead;
  services: Option[];
  owners: LeadOwner[];
}) {
  const [state, action] = useActionState(updateLeadAction, {});
  useToastOnMessage(state);
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-col gap-lg" noValidate>
      <input type="hidden" name="id" value={lead.id} />
      <input type="hidden" name="version" value={lead.version} />
      <LeadFields state={state} lead={lead} services={services} owners={owners} today={lead.today} />
      <Input
        name="reason"
        id="lead-edit-reason"
        label="Motivo del cambio"
        required
        defaultValue={valueOf(state, "reason")}
        error={state.fields?.reason}
      />
      <FormError state={state} />
      <div>
        <Submit label="Guardar cambios" />
      </div>
    </form>
  );
}

export function LeadContactForm({ lead }: { lead: Lead }) {
  const [state, action] = useActionState(logLeadContactAction, {});
  useToastOnMessage(state);
  return (
    <form
      key={state.at ?? 0}
      action={action}
      className="flex flex-wrap items-end gap-sm"
      noValidate
      data-testid="lead-contact-form"
    >
      <input type="hidden" name="id" value={lead.id} />
      <input type="hidden" name="version" value={lead.version} />
      <Select
        name="channel"
        id="contact-channel"
        label="Canal"
        options={LEAD_CONTACT_CHANNELS.map((c) => ({ value: c, label: LEAD_CONTACT_CHANNEL_LABELS[c] }))}
        defaultValue={
          lead.source === "whatsapp"
            ? "whatsapp"
            : lead.source === "instagram" || lead.source === "facebook"
              ? "redes"
              : "llamada"
        }
      />
      <Input name="note" id="contact-note" label="¿Qué pasó?" defaultValue="" />
      <Submit label="Registrar contacto" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

export function MoveLeadForm({ lead, stages }: { lead: Lead; stages: LeadStage[] }) {
  const [state, action] = useActionState(moveLeadAction, {});
  useToastOnMessage(state);
  const options = stages
    .filter((s) => s.kind === "abierta" && s.active && s.id !== lead.stageId)
    .map((s) => ({ value: s.id, label: s.name }));
  if (options.length === 0) return null;
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-wrap items-end gap-sm" noValidate>
      <input type="hidden" name="id" value={lead.id} />
      <input type="hidden" name="version" value={lead.version} />
      <Select
        name="stageId"
        id="lead-move-stage"
        label="Mover a"
        options={options}
        defaultValue={options[0]!.value}
      />
      <Input name="note" id="lead-move-note" label="Comentario" defaultValue="" />
      <Submit label="Mover" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

export function LeadNoteForm({ leadId }: { leadId: string }) {
  const [state, action] = useActionState(addLeadNoteAction, {});
  useToastOnMessage(state);
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-wrap items-end gap-sm" noValidate>
      <input type="hidden" name="id" value={leadId} />
      <Input
        name="note"
        id="lead-note"
        label="Nota interna"
        defaultValue={state.error ? valueOf(state, "note") : ""}
      />
      <Submit label="Agregar nota" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

export function LoseLeadForm({ lead }: { lead: Lead }) {
  const [state, action] = useActionState(loseLeadAction, {});
  useToastOnMessage(state);
  return (
    <form
      key={state.at ?? 0}
      action={action}
      className="flex flex-col gap-md"
      noValidate
      data-testid="lead-lose-form"
    >
      <input type="hidden" name="id" value={lead.id} />
      <input type="hidden" name="version" value={lead.version} />
      <div className="grid gap-md md:grid-cols-2">
        <Select
          name="lossReason"
          label="Motivo de pérdida"
          placeholder="Elige el motivo"
          required
          options={LEAD_LOSS_REASONS.map((r) => ({ value: r, label: LEAD_LOSS_REASON_LABELS[r] }))}
          defaultValue={valueOf(state, "lossReason")}
          error={state.fields?.lossReason}
        />
        <Input name="lossNotes" label="Detalle" defaultValue={valueOf(state, "lossNotes")} />
      </div>
      <FormError state={state} />
      <div>
        <Submit label="Marcar como perdido" variant="secondary" />
      </div>
    </form>
  );
}

export function ReopenLeadForm({ lead, stages }: { lead: Lead; stages: LeadStage[] }) {
  const [state, action] = useActionState(reopenLeadAction, {});
  useToastOnMessage(state);
  const options = stages
    .filter((s) => s.kind === "abierta" && s.active)
    .map((s) => ({ value: s.id, label: s.name }));
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-wrap items-end gap-sm" noValidate>
      <input type="hidden" name="id" value={lead.id} />
      <input type="hidden" name="version" value={lead.version} />
      <Select
        name="stageId"
        id="lead-reopen-stage"
        label="Etapa"
        options={options}
        defaultValue={options[0]?.value}
      />
      <Input
        name="reason"
        id="lead-reopen-reason"
        label="Motivo"
        required
        defaultValue={valueOf(state, "reason")}
        error={state.fields?.reason}
      />
      <Submit label="Reabrir" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

/** Ligar con un cliente que coincide por teléfono o email (nunca por nombre). */
export function LinkClientForm({ lead, clients }: { lead: Lead; clients: Option[] }) {
  const [state, action] = useActionState(linkLeadClientAction, {});
  useToastOnMessage(state);
  if (clients.length === 0) return null;
  return (
    <form
      key={state.at ?? 0}
      action={action}
      className="flex flex-wrap items-end gap-sm"
      noValidate
      data-testid="link-client-form"
    >
      <input type="hidden" name="id" value={lead.id} />
      <input type="hidden" name="version" value={lead.version} />
      <Select
        name="clientId"
        id="link-client"
        label="Cliente"
        options={clients}
        defaultValue={clients[0]!.value}
        error={state.fields?.clientId}
      />
      <Input
        name="reason"
        id="link-reason"
        label="Motivo"
        defaultValue="Es la misma persona (teléfono o email confirmado)"
      />
      <Submit label="Ligar al cliente" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

export function WinLeadForm({ lead, orders }: { lead: Lead; orders: Option[] }) {
  const [state, action] = useActionState(winLeadAction, {});
  useToastOnMessage(state);
  if (orders.length === 0)
    return <p className="text-sm text-muted">El cliente aún no tiene OS entregadas sin atribuir.</p>;
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-wrap items-end gap-sm" noValidate>
      <input type="hidden" name="id" value={lead.id} />
      <input type="hidden" name="version" value={lead.version} />
      <Select
        name="serviceOrderId"
        id="win-order"
        label="OS entregada"
        options={orders}
        defaultValue={orders[0]!.value}
        error={state.fields?.serviceOrderId}
      />
      <Submit label="Atribuir venta" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

export function LeadTaskForm({
  leadId,
  requestId,
  today,
  owners,
}: {
  leadId: string;
  requestId: string;
  today: string;
  owners: LeadOwner[];
}) {
  const [state, action] = useActionState(createLeadTaskAction, {});
  useToastOnMessage(state);
  const f = state.fields ?? {};
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-wrap items-end gap-sm" noValidate>
      <input type="hidden" name="id" value={leadId} />
      <input type="hidden" name="requestId" value={requestId} />
      <Select
        name="taskKind"
        label="Tarea"
        options={LEAD_TASK_KINDS.map((k) => ({ value: k, label: LEAD_TASK_KIND_LABELS[k] }))}
        defaultValue={valueOf(state, "taskKind", "whatsapp")}
        error={f.kind}
      />
      <Input
        name="dueOn"
        type="date"
        min={today}
        label="Para el"
        defaultValue={valueOf(state, "dueOn", today)}
        error={f.dueOn}
      />
      <Select
        name="assignedTo"
        label="Responsable"
        options={[
          { value: "", label: "Sin asignar" },
          ...owners.map((o) => ({ value: o.userId, label: o.fullName })),
        ]}
        defaultValue={valueOf(state, "assignedTo")}
      />
      <Input name="taskNotes" label="Notas" defaultValue={state.error ? valueOf(state, "taskNotes") : ""} />
      <Submit label="Agregar recordatorio" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

export function CompleteLeadTaskButton({ leadId, taskId }: { leadId: string; taskId: string }) {
  const [state, action] = useActionState(completeLeadTaskAction, {});
  useToastOnMessage(state);
  return (
    <form action={action} className="flex flex-wrap items-end gap-sm">
      <input type="hidden" name="id" value={leadId} />
      <input type="hidden" name="taskId" value={taskId} />
      <Select
        name="outcome"
        id={`lead-outcome-${taskId}`}
        label="Resultado"
        options={(["contactado", "sin_respuesta", "agendo_cita", "no_interesado"] as const).map((o) => ({
          value: o,
          label: TASK_OUTCOME_LABELS[o],
        }))}
        defaultValue="contactado"
      />
      <Submit label="Completar" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

/** Etapa del embudo (admin corporativo). Las de cierre sólo cambian de nombre. */
export function LeadStageForm({ stage }: { stage?: LeadStage }) {
  const [state, action] = useActionState(upsertLeadStageAction, {});
  useToastOnMessage(state);
  const f = state.fields ?? {};
  const closing = stage && stage.kind !== "abierta";
  const suffix = stage?.id ?? "new";
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-wrap items-end gap-sm" noValidate>
      <input type="hidden" name="id" value={stage?.id ?? ""} />
      <Input
        name="code"
        id={`stage-code-${suffix}`}
        label="Clave"
        defaultValue={valueOf(state, "code", stage?.code ?? "")}
        disabled={!!stage}
        error={f.code}
      />
      {stage ? <input type="hidden" name="code" value={stage.code} /> : null}
      <Input
        name="name"
        id={`stage-name-${suffix}`}
        label="Nombre"
        defaultValue={valueOf(state, "name", stage?.name ?? "")}
        error={f.name}
      />
      {closing ? (
        <input type="hidden" name="position" value={stage.position} />
      ) : (
        <Input
          name="position"
          id={`stage-pos-${suffix}`}
          label="Orden"
          inputMode="numeric"
          defaultValue={valueOf(state, "position", str(stage?.position))}
          error={f.position}
        />
      )}
      {closing ? null : (
        <Select
          name="milestone"
          id={`stage-ms-${suffix}`}
          label="Avanza sola al"
          options={[{ value: "", label: "—" }, ...LEAD_MILESTONES.map((m) => ({ value: m, label: m }))]}
          defaultValue={valueOf(state, "milestone", stage?.milestone ?? "")}
        />
      )}
      {closing ? (
        <input type="hidden" name="active" value="on" />
      ) : (
        <Checkbox
          name="active"
          value="on"
          id={`stage-act-${suffix}`}
          label="Activa"
          checked={stage?.active ?? true}
        />
      )}
      <Input
        name="reason"
        id={`stage-reason-${suffix}`}
        label="Motivo"
        defaultValue={valueOf(state, "reason")}
        error={f.reason}
      />
      <Submit label={stage ? "Guardar" : "Agregar etapa"} variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Cotizaciones
// ---------------------------------------------------------------------------

export function NewQuoteForm({
  requestId,
  catalog,
  lead,
  client,
  vehicles,
}: {
  requestId: string;
  catalog: CatalogItem[];
  lead: { id: string; name: string; interestServiceIds: string[] } | null;
  client: { id: string; name: string } | null;
  vehicles: Option[];
}) {
  const [state, action] = useActionState(createQuoteAction, {});
  const f = state.fields ?? {};
  const initial = listOf(state, "serviceId", lead?.interestServiceIds ?? []);
  const [picked, setPicked] = useState<string[]>(initial);
  const [qty, setQty] = useState<Record<string, number>>({});
  const estimate = useMemo(
    () =>
      estimateQuote(
        catalog
          .filter((c) => picked.includes(c.id))
          .map((c) => ({
            quantity: qty[c.id] ?? 1,
            unitPrice: c.price,
            unitDirectCost: c.directCost,
            operatorCommissionPct: c.operatorCommissionPct,
          })),
      ),
    [catalog, picked, qty],
  );
  const pct = marginPct(estimate.contributionMargin, estimate.total);
  return (
    <form
      key={state.at ?? 0}
      action={action}
      className="flex flex-col gap-lg"
      noValidate
      data-testid="quote-form"
    >
      <input type="hidden" name="requestId" value={requestId} />
      {lead ? <input type="hidden" name="leadId" value={lead.id} /> : null}
      {client ? <input type="hidden" name="clientId" value={client.id} /> : null}
      <p className="text-sm">
        Cotización para <strong>{client?.name ?? lead?.name}</strong>
        {lead && client ? ` (prospecto ${lead.name})` : ""}
      </p>
      <fieldset className="flex flex-col gap-xs">
        <legend className="mg-label">Servicios</legend>
        {f.items ? (
          <p role="alert" className="text-sm text-danger">
            {f.items}
          </p>
        ) : null}
        <ul className="flex flex-col gap-xs">
          {catalog.map((c) => {
            const on = picked.includes(c.id);
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-sm border-b border-border pb-xs">
                <label className="flex min-h-(--mg-touch-target) flex-1 cursor-pointer items-center gap-sm">
                  <input
                    type="checkbox"
                    name="serviceId"
                    value={c.id}
                    checked={on}
                    onChange={(e) =>
                      setPicked((p) => (e.currentTarget.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))
                    }
                    className="size-lg accent-brand"
                  />
                  <span>
                    {c.name} · {formatMoney(c.price)}
                    {c.operatorCommissionPct != null ? (
                      <span className="text-xs text-muted"> · operador {c.operatorCommissionPct} %</span>
                    ) : null}
                  </span>
                </label>
                {on ? (
                  <input
                    type="number"
                    name={`qty-${c.id}`}
                    min={1}
                    max={99}
                    aria-label={`Cantidad de ${c.name}`}
                    defaultValue={qty[c.id] ?? 1}
                    onChange={(e) =>
                      setQty((q) => ({ ...q, [c.id]: Math.max(1, Number(e.currentTarget.value) || 1) }))
                    }
                    className="mg-input w-auto"
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </fieldset>
      <dl
        className="grid gap-sm rounded-md border border-border p-md text-sm md:grid-cols-4"
        data-testid="quote-estimate"
      >
        <div>
          <dt className="text-muted">Total</dt>
          <dd className="font-medium">{formatMoney(estimate.total)}</dd>
        </div>
        <div>
          <dt className="text-muted">Otros costos directos</dt>
          <dd>{formatMoney(estimate.standardCostTotal)}</dd>
        </div>
        <div>
          <dt className="text-muted">Pago al operador</dt>
          <dd>{formatMoney(estimate.operatorPayTotal)}</dd>
        </div>
        <div>
          <dt className="text-muted">Margen de contribución</dt>
          <dd className="font-medium">
            {formatMoney(estimate.contributionMargin)}
            {pct == null ? "" : ` (${pct} %)`}
          </dd>
        </div>
      </dl>
      <p className="mg-hint">{COMMERCIAL_COPY.marginNote}</p>
      <div className="grid gap-md md:grid-cols-3">
        {client ? (
          <Select
            name="vehicleId"
            label="Vehículo"
            options={[{ value: "", label: "Lo elijo al reservar" }, ...vehicles]}
            defaultValue={valueOf(state, "vehicleId")}
          />
        ) : null}
        <Input
          name="validDays"
          label="Vigencia (días)"
          inputMode="numeric"
          defaultValue={valueOf(state, "validDays", "15")}
          error={f.validDays}
        />
        <Input
          name="notes"
          label="Notas para el cliente"
          defaultValue={valueOf(state, "notes")}
          error={f.notes}
        />
      </div>
      <FormError state={state} />
      <div>
        <Submit label={COMMERCIAL_COPY.newQuote} />
      </div>
    </form>
  );
}

export function QuoteItemForm({
  quote,
  serviceId,
  quantity,
}: {
  quote: Quote;
  serviceId: string;
  quantity: number;
}) {
  const [state, action] = useActionState(setQuoteItemAction, {});
  useToastOnMessage(state);
  return (
    <form key={state.at ?? 0} action={action} className="flex items-end gap-xs" noValidate>
      <input type="hidden" name="quoteId" value={quote.id} />
      <input type="hidden" name="version" value={quote.version} />
      <input type="hidden" name="serviceId" value={serviceId} />
      <input
        type="number"
        name="quantity"
        min={0}
        max={99}
        defaultValue={quantity}
        aria-label="Cantidad (0 = quitar)"
        className="mg-input w-auto"
      />
      <Submit label="Cambiar" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

export function AddServiceToQuoteForm({ quote, options }: { quote: Quote; options: Option[] }) {
  const [state, action] = useActionState(setQuoteItemAction, {});
  useToastOnMessage(state);
  if (options.length === 0) return null;
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-wrap items-end gap-sm" noValidate>
      <input type="hidden" name="quoteId" value={quote.id} />
      <input type="hidden" name="version" value={quote.version} />
      <input type="hidden" name="quantity" value="1" />
      <Select
        name="serviceId"
        id="add-quote-service"
        label="Agregar servicio"
        options={options}
        defaultValue={options[0]!.value}
      />
      <Submit label="Agregar" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

export function QuoteDiscountForm({ quote }: { quote: Quote }) {
  const [state, action] = useActionState(addQuoteDiscountAction, {});
  useToastOnMessage(state);
  const f = state.fields ?? {};
  return (
    <form
      key={state.at ?? 0}
      action={action}
      className="flex flex-wrap items-end gap-sm"
      noValidate
      data-testid="quote-discount-form"
    >
      <input type="hidden" name="quoteId" value={quote.id} />
      <input type="hidden" name="version" value={quote.version} />
      <Select
        name="itemId"
        id="quote-discount-item"
        label="Aplica a"
        options={[
          { value: "", label: "Toda la cotización" },
          ...quote.items.map((i) => ({ value: i.id, label: i.serviceName })),
        ]}
        defaultValue={valueOf(state, "itemId")}
      />
      <Select
        name="kind"
        id="quote-discount-kind"
        label="Tipo"
        options={[
          { value: "percent", label: "Porcentaje" },
          { value: "amount", label: "Importe" },
        ]}
        defaultValue={valueOf(state, "kind", "percent")}
      />
      <Input
        name="value"
        id="quote-discount-value"
        label="Valor"
        inputMode="decimal"
        defaultValue={valueOf(state, "value")}
        error={f.value}
      />
      <Input
        name="reason"
        id="quote-discount-reason"
        label="Motivo"
        defaultValue={valueOf(state, "reason")}
        error={f.reason}
      />
      <Submit label="Aplicar descuento" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

export function VoidQuoteDiscountForm({ quote, discountId }: { quote: Quote; discountId: string }) {
  const [state, action] = useActionState(voidQuoteDiscountAction, {});
  useToastOnMessage(state);
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-wrap items-end gap-xs" noValidate>
      <input type="hidden" name="quoteId" value={quote.id} />
      <input type="hidden" name="version" value={quote.version} />
      <input type="hidden" name="discountId" value={discountId} />
      <Input
        name="reason"
        id={`void-${discountId}`}
        label="Motivo para anular"
        defaultValue=""
        error={state.fields?.reason}
      />
      <Submit label="Anular" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

export function QuoteStatusForm({
  quote,
  status,
}: {
  quote: Quote;
  status: Exclude<QuoteStatus, "borrador" | "convertida">;
}) {
  const [state, action] = useActionState(quoteStatusAction, {});
  useToastOnMessage(state);
  const needsReason = status === "rechazada" || status === "cancelada";
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-wrap items-end gap-xs" noValidate>
      <input type="hidden" name="quoteId" value={quote.id} />
      <input type="hidden" name="version" value={quote.version} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="leadId" value={quote.leadId ?? ""} />
      {needsReason ? (
        <Input
          name="reason"
          id={`status-reason-${status}`}
          label="Motivo"
          defaultValue=""
          error={state.fields?.reason}
        />
      ) : null}
      <Submit
        label={QUOTE_STATUS_ACTIONS[status]}
        variant={status === "aceptada" ? "primary" : "secondary"}
      />
      <FormError state={state} />
    </form>
  );
}

export function UpdateQuoteForm({ quote, vehicles }: { quote: Quote; vehicles: Option[] }) {
  const [state, action] = useActionState(updateQuoteAction, {});
  useToastOnMessage(state);
  const f = state.fields ?? {};
  return (
    <form key={state.at ?? 0} action={action} className="flex flex-wrap items-end gap-sm" noValidate>
      <input type="hidden" name="quoteId" value={quote.id} />
      <input type="hidden" name="version" value={quote.version} />
      {quote.clientId ? (
        <Select
          name="vehicleId"
          id="quote-vehicle"
          label="Vehículo"
          options={[{ value: "", label: "Sin elegir" }, ...vehicles]}
          defaultValue={valueOf(state, "vehicleId", quote.vehicleId ?? "")}
        />
      ) : null}
      <Input
        name="validUntil"
        id="quote-valid"
        type="date"
        label="Vigente hasta"
        defaultValue={valueOf(state, "validUntil", quote.validUntil)}
        error={f.validUntil}
      />
      <Input
        name="notes"
        id="quote-notes"
        label="Notas"
        defaultValue={valueOf(state, "notes", quote.notes ?? "")}
      />
      <Input
        name="reason"
        id="quote-reason"
        label="Motivo"
        defaultValue={valueOf(state, "reason")}
        error={f.reason}
      />
      <Submit label="Guardar" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

export function BookQuoteForm({
  quote,
  requestId,
  vehicles,
  bays,
  technicians,
  today,
}: {
  quote: Quote;
  requestId: string;
  vehicles: Option[];
  bays: Option[];
  technicians: Option[];
  today: string;
}) {
  const [state, action] = useActionState(bookQuoteAction, {});
  const f = state.fields ?? {};
  return (
    <form
      key={state.at ?? 0}
      action={action}
      className="flex flex-col gap-md"
      noValidate
      data-testid="book-quote-form"
    >
      <input type="hidden" name="quoteId" value={quote.id} />
      <input type="hidden" name="version" value={quote.version} />
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="leadId" value={quote.leadId ?? ""} />
      <div className="grid gap-md md:grid-cols-3">
        <Input
          name="date"
          type="date"
          min={today}
          label="Fecha"
          required
          defaultValue={valueOf(state, "date", today)}
          error={f.date || undefined}
        />
        <Input
          name="time"
          type="time"
          label="Hora"
          required
          defaultValue={valueOf(state, "time", "10:00")}
          error={f.time || undefined}
        />
        <Select
          name="vehicleId"
          id="book-vehicle"
          label="Vehículo"
          placeholder="Elige el vehículo"
          options={vehicles}
          defaultValue={valueOf(state, "vehicleId", quote.vehicleId ?? "")}
          error={f.vehicleId}
        />
        <Select
          name="bayId"
          id="book-bay"
          label="Bahía"
          options={[{ value: "", label: "Sin asignar" }, ...bays]}
          defaultValue={valueOf(state, "bayId")}
        />
        <Select
          name="technicianId"
          id="book-tech"
          label="Técnico"
          options={[{ value: "", label: "Sin asignar" }, ...technicians]}
          defaultValue={valueOf(state, "technicianId")}
        />
        <Input name="notes" id="book-notes" label="Notas de la cita" defaultValue={valueOf(state, "notes")} />
      </div>
      <p className="mg-hint">{COMMERCIAL_COPY.quotePriceHonored}</p>
      <FormError state={state} />
      <div>
        <Submit label={COMMERCIAL_COPY.book} />
      </div>
    </form>
  );
}

/** Texto para compartir la cotización por el canal del cliente (la plataforma no lo envía). */
export function ShareQuoteText({ text }: { text: string }) {
  const toast = useToast();
  return (
    <div className="flex flex-col gap-xs">
      <textarea
        readOnly
        value={text}
        rows={Math.min(12, text.split("\n").length + 1)}
        className="mg-input font-mono text-xs"
        aria-label="Texto de la cotización"
      />
      <div>
        <Button
          type="button"
          label="Copiar texto"
          variant="secondary"
          size="sm"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(text)
              .then(() => toast({ message: "Texto copiado", tone: "success" }));
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Duplicados
// ---------------------------------------------------------------------------

export function MergeClientsForm({
  pair,
  suggested,
  blockers,
}: {
  pair: DuplicatePair;
  suggested: "a" | "b";
  /** Motivo que impide fusionar según cuál se conserve (null = se puede). */
  blockers: { a: string | null; b: string | null };
}) {
  const [state, action] = useActionState(mergeClientsAction, {});
  useToastOnMessage(state);
  const [keep, setKeep] = useState<"a" | "b">((valueOf(state, "keep", suggested) as "a" | "b") ?? suggested);
  const block = blockers[keep];
  const id = `${pair.a.clientId}-${pair.b.clientId}`;
  return (
    <form
      key={state.at ?? 0}
      action={action}
      className="flex flex-col gap-sm"
      noValidate
      data-testid="merge-form"
    >
      <input type="hidden" name="clientA" value={pair.a.clientId} />
      <input type="hidden" name="clientB" value={pair.b.clientId} />
      <Select
        name="keep"
        id={`keep-${id}`}
        label="Conservar"
        options={[
          { value: "a", label: `${pair.a.name} (${pair.a.orders} OS)` },
          { value: "b", label: `${pair.b.name} (${pair.b.orders} OS)` },
        ]}
        value={keep}
        onChange={(e) => setKeep(e.currentTarget.value as "a" | "b")}
      />
      <Input
        name="reason"
        id={`merge-reason-${id}`}
        label="Motivo"
        defaultValue={valueOf(state, "reason", "Misma persona (verifiqué teléfono o email)")}
        error={state.fields?.reason}
      />
      {block ? (
        <p className="mg-tone rounded-md border p-sm text-sm" data-tone="warning">
          {block}
        </p>
      ) : null}
      <FormError state={state} />
      <div>
        <Submit label="Fusionar" variant="secondary" />
      </div>
    </form>
  );
}
