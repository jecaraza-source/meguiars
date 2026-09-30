"use client";

import {
  INBOX_CHANNEL_LABELS,
  INBOX_CHANNELS,
  MAX_MESSAGE_LENGTH,
  type ChannelAccount,
  type Conversation,
  type LeadOwner,
} from "@meguiars/domain";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  assignConversationAction,
  conversationLeadAction,
  conversationStatusAction,
  linkConversationLeadAction,
  saveChannelAccountAction,
  sendMessageAction,
  verifyChannelAccountAction,
  type InboxFormState,
} from "@/app/actions/inbox";
import { Button } from "./ui/button";
import { Checkbox, Input, Select } from "./ui/field";
import { useToast } from "./ui/overlay";

type Option = { value: string; label: string };

function Submit({ label, variant = "primary" }: { label: string; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" label={label} loading={pending} variant={variant} size="sm" />;
}

function useToastOnMessage(state: InboxFormState) {
  const toast = useToast();
  useEffect(() => {
    if (state.message) toast({ message: state.message, tone: "success" });
  }, [state, toast]);
}

function FormError({ state }: { state: InboxFormState }) {
  return state.error ? (
    <p role="alert" className="mg-tone rounded-md border p-md text-sm" data-tone="danger">
      {state.error}
    </p>
  ) : null;
}

const valueOf = (state: InboxFormState, key: string, fallback = "") => {
  const v = state.values?.[key];
  return typeof v === "string" ? v : fallback;
};

/** Respuesta dentro de la ventana de 24 h; el texto se envía con la API oficial desde el servidor. */
export function ReplyForm({ conversation }: { conversation: Conversation }) {
  const [state, action] = useActionState(sendMessageAction, {});
  useToastOnMessage(state);
  // Tras un envío exitoso, un formulario nuevo (y otro request_id); con error se conserva el texto.
  return (
    <ReplyFields
      key={state.message ? String(state.at) : "reply"}
      conversation={conversation}
      state={state}
      action={action}
    />
  );
}

function ReplyFields({
  conversation,
  state,
  action,
}: {
  conversation: Conversation;
  state: InboxFormState;
  action: (form: FormData) => void;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  return (
    <form action={action} className="flex flex-col gap-sm" data-testid="reply-form">
      <input type="hidden" name="conversationId" value={conversation.id} />
      <input type="hidden" name="requestId" value={requestId} />
      <label className="flex flex-col gap-xs text-sm">
        <span className="font-medium">Respuesta</span>
        <textarea
          name="body"
          required
          maxLength={MAX_MESSAGE_LENGTH}
          rows={3}
          className="mg-input"
          defaultValue={state.error ? valueOf(state, "body") : ""}
          aria-label="Respuesta"
        />
      </label>
      <div className="flex flex-wrap items-center gap-sm">
        <Submit label={`Enviar por ${INBOX_CHANNEL_LABELS[conversation.channel]}`} />
      </div>
      <FormError state={state} />
    </form>
  );
}

export function AssignConversationForm({
  conversation,
  owners,
}: {
  conversation: Conversation;
  owners: LeadOwner[];
}) {
  const [state, action] = useActionState(assignConversationAction, {});
  useToastOnMessage(state);
  return (
    <form action={action} className="flex flex-wrap items-end gap-sm" data-testid="assign-form">
      <input type="hidden" name="conversationId" value={conversation.id} />
      <input type="hidden" name="version" value={conversation.version} />
      <Select
        name="userId"
        id="assign-user"
        label="Responsable"
        options={[
          { value: "", label: "Sin asignar" },
          ...owners.map((o) => ({ value: o.userId, label: o.fullName })),
        ]}
        defaultValue={conversation.assignedTo ?? ""}
      />
      <Submit label="Asignar" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

export function ConversationStatusForm({ conversation }: { conversation: Conversation }) {
  const [state, action] = useActionState(conversationStatusAction, {});
  useToastOnMessage(state);
  const next = conversation.status === "abierta" ? "cerrada" : "abierta";
  return (
    <form action={action} className="flex flex-wrap items-end gap-sm">
      <input type="hidden" name="conversationId" value={conversation.id} />
      <input type="hidden" name="version" value={conversation.version} />
      <input type="hidden" name="status" value={next} />
      <Submit label={next === "cerrada" ? "Marcar como atendida" : "Reabrir"} variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

export function LinkConversationLeadForm({
  conversation,
  leads,
}: {
  conversation: Conversation;
  leads: Option[];
}) {
  const [state, action] = useActionState(linkConversationLeadAction, {});
  useToastOnMessage(state);
  if (leads.length === 0) return null;
  return (
    <form action={action} className="flex flex-wrap items-end gap-sm" data-testid="link-lead-form">
      <input type="hidden" name="conversationId" value={conversation.id} />
      <input type="hidden" name="version" value={conversation.version} />
      <Select
        name="leadId"
        id="link-lead"
        label="Prospecto existente"
        options={leads}
        placeholder="Elige"
        defaultValue=""
      />
      <Submit label="Ligar" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

/** Registra la consulta como prospecto con el canal y el teléfono de la conversación. */
export function ConversationLeadForm({
  conversation,
  services,
}: {
  conversation: Conversation;
  services: Option[];
}) {
  const [state, action] = useActionState(conversationLeadAction, {});
  const [requestId] = useState(() => crypto.randomUUID());
  const f = state.fields ?? {};
  return (
    <form action={action} className="flex flex-col gap-sm" data-testid="conversation-lead-form">
      <input type="hidden" name="conversationId" value={conversation.id} />
      <input type="hidden" name="version" value={conversation.version} />
      <input type="hidden" name="requestId" value={requestId} />
      <Input
        name="fullName"
        label="Nombre"
        required
        defaultValue={valueOf(state, "fullName", conversation.contactName ?? "")}
        error={f.fullName}
      />
      {conversation.contactPhone ? (
        <p className="text-sm text-muted">Teléfono: {conversation.contactPhone}</p>
      ) : (
        <Input
          name="socialHandle"
          label="Usuario en redes (@)"
          hint="Meta no comparte el teléfono en este canal"
          defaultValue={valueOf(state, "socialHandle")}
          error={f.socialHandle}
        />
      )}
      {services.length ? (
        <fieldset className="flex flex-col gap-xs">
          <legend className="text-sm font-medium">Servicios de interés</legend>
          {services.map((s) => (
            <Checkbox key={s.value} name="interestServiceIds" value={s.value} label={s.label} />
          ))}
        </fieldset>
      ) : null}
      <Input name="notes" label="Notas" defaultValue={valueOf(state, "notes")} />
      <div>
        <Submit label="Registrar como prospecto" />
      </div>
      <FormError state={state} />
    </form>
  );
}

/** Alta y edición de una cuenta oficial (sin tokens: viven en el servidor). */
export function ChannelAccountForm({ account, centers }: { account?: ChannelAccount; centers: Option[] }) {
  const [state, action] = useActionState(saveChannelAccountAction, {});
  useToastOnMessage(state);
  const f = state.fields ?? {};
  return (
    <form
      key={state.message ? state.at : "account"}
      action={action}
      className="flex flex-col gap-sm"
      data-testid={account ? `account-form-${account.id}` : "account-form"}
    >
      {account ? <input type="hidden" name="id" value={account.id} /> : null}
      <Select
        name="channel"
        id={`channel-${account?.id ?? "new"}`}
        label="Canal"
        options={INBOX_CHANNELS.map((c) => ({ value: c, label: INBOX_CHANNEL_LABELS[c] }))}
        defaultValue={valueOf(state, "channel", account?.channel ?? "whatsapp")}
      />
      <Input
        name="externalAccountId"
        label="Identificador de Meta"
        hint="WhatsApp: phone_number_id · Messenger: id de la página · Instagram: IG ID de la cuenta profesional"
        required
        defaultValue={valueOf(state, "externalAccountId", account?.externalAccountId ?? "")}
        error={f.externalAccountId}
      />
      <Input
        name="label"
        label="Nombre interno"
        required
        defaultValue={valueOf(state, "label", account?.label ?? "")}
        error={f.label}
      />
      <Select
        name="detailCenterId"
        id={`center-${account?.id ?? "new"}`}
        label="Centro que atiende"
        options={centers}
        defaultValue={valueOf(state, "detailCenterId", account?.detailCenterId ?? centers[0]?.value ?? "")}
      />
      <Checkbox
        name="active"
        value="on"
        id={`active-${account?.id ?? "new"}`}
        label="Activa"
        checked={account?.active ?? true}
      />
      <Input name="reason" label="Motivo del cambio" required defaultValue="" error={f.reason} />
      <div>
        <Submit
          label={account ? "Guardar" : "Registrar cuenta"}
          variant={account ? "secondary" : "primary"}
        />
      </div>
      <FormError state={state} />
    </form>
  );
}

export function VerifyAccountButton({ account, disabled }: { account: ChannelAccount; disabled: boolean }) {
  const [state, action] = useActionState(verifyChannelAccountAction, {});
  useToastOnMessage(state);
  return (
    <form action={action} className="flex flex-col gap-xs" data-testid={`verify-${account.id}`}>
      <input type="hidden" name="id" value={account.id} />
      <div>
        {disabled ? (
          <Button type="button" label="Probar conexión" disabled size="sm" variant="secondary" />
        ) : (
          <Submit label="Probar conexión" variant="secondary" />
        )}
      </div>
      <FormError state={state} />
    </form>
  );
}
