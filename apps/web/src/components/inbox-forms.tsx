"use client";

import {
  CONVERSATION_PRIORITIES,
  CONVERSATION_PRIORITY_LABELS,
  fillQuickReply,
  INBOX_CHANNEL_LABELS,
  INBOX_CHANNELS,
  INBOX_COPY,
  MAX_MESSAGE_LENGTH,
  renderTemplate,
  TEMPLATE_CATEGORY_LABELS,
  templateBlocker,
  type ChannelAccount,
  type Conversation,
  type LeadOwner,
  type QuickReply,
  type WhatsappTemplate,
} from "@meguiars/domain";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  assignConversationAction,
  conversationLeadAction,
  conversationStatusAction,
  linkConversationLeadAction,
  addNoteAction,
  saveChannelAccountAction,
  saveQuickReplyAction,
  sendMessageAction,
  sendTemplateAction,
  syncTemplatesAction,
  triageAction,
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
export function ReplyForm({
  conversation,
  quickReplies = [],
  centerName = "",
}: {
  conversation: Conversation;
  quickReplies?: QuickReply[];
  centerName?: string;
}) {
  const [state, action] = useActionState(sendMessageAction, {});
  useToastOnMessage(state);
  // Tras un envío exitoso, un formulario nuevo (y otro request_id); con error se conserva el texto.
  return (
    <ReplyFields
      key={state.message ? String(state.at) : "reply"}
      conversation={conversation}
      state={state}
      action={action}
      quickReplies={quickReplies}
      centerName={centerName}
    />
  );
}

function ReplyFields({
  conversation,
  state,
  action,
  quickReplies,
  centerName,
}: {
  conversation: Conversation;
  state: InboxFormState;
  action: (form: FormData) => void;
  quickReplies: QuickReply[];
  centerName: string;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [body, setBody] = useState(state.error ? valueOf(state, "body") : "");
  const active = quickReplies.filter((q) => q.active);
  return (
    <form action={action} className="flex flex-col gap-sm" data-testid="reply-form">
      <input type="hidden" name="conversationId" value={conversation.id} />
      <input type="hidden" name="requestId" value={requestId} />
      {/* Último mensaje visto: si alguien responde antes, el envío se detiene. */}
      <input type="hidden" name="expectedLastMessageAt" value={conversation.lastMessageAt} />
      {active.length ? (
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium">Respuesta rápida</span>
          <select
            className="mg-input"
            aria-label="Respuesta rápida"
            data-testid="quick-reply-picker"
            value=""
            onChange={(e) => {
              const q = active.find((x) => x.id === e.currentTarget.value);
              if (q) setBody(fillQuickReply(q.body, { name: conversation.contactName, center: centerName }));
            }}
          >
            <option value="">Elige para pegarla (puedes editarla)</option>
            {active.map((q) => (
              <option key={q.id} value={q.id}>
                {q.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex flex-col gap-xs text-sm">
        <span className="font-medium">Respuesta</span>
        <textarea
          name="body"
          required
          maxLength={MAX_MESSAGE_LENGTH}
          rows={3}
          className="mg-input"
          value={body}
          onChange={(e) => setBody(e.currentTarget.value)}
          aria-label="Respuesta"
        />
      </label>
      <p className="text-xs text-muted">{INBOX_COPY.duplicateGuard}</p>
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

/** Prioridad, etiquetas y «pendiente» de la conversación. */
export function TriageForm({ conversation }: { conversation: Conversation }) {
  const [state, action] = useActionState(triageAction, {});
  useToastOnMessage(state);
  return (
    <form
      key={state.message ? String(state.at) : "triage"}
      action={action}
      className="flex flex-col gap-sm"
      data-testid="triage-form"
    >
      <input type="hidden" name="conversationId" value={conversation.id} />
      <input type="hidden" name="version" value={conversation.version} />
      <Select
        name="priority"
        id="triage-priority"
        label="Prioridad"
        options={CONVERSATION_PRIORITIES.map((p) => ({ value: p, label: CONVERSATION_PRIORITY_LABELS[p] }))}
        defaultValue={valueOf(state, "priority", conversation.priority)}
      />
      <Input
        name="tags"
        id="triage-tags"
        label="Etiquetas"
        hint="Separadas por coma, p. ej. pulido, cotizar"
        defaultValue={valueOf(state, "tags", conversation.tags.join(", "))}
      />
      <Checkbox
        name="pending"
        value="on"
        id="triage-pending"
        label="Marcar como pendiente"
        checked={conversation.pending}
      />
      <Submit label="Guardar triaje" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

/** Nota interna: sólo la ve el equipo; nunca se envía al cliente. */
export function NoteForm({ conversation }: { conversation: Conversation }) {
  const [state, action] = useActionState(addNoteAction, {});
  useToastOnMessage(state);
  return (
    <NoteFields
      key={state.message ? String(state.at) : "note"}
      conversation={conversation}
      state={state}
      action={action}
    />
  );
}

function NoteFields({
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
    <form action={action} className="flex flex-col gap-sm" data-testid="note-form">
      <input type="hidden" name="conversationId" value={conversation.id} />
      <input type="hidden" name="requestId" value={requestId} />
      <label className="flex flex-col gap-xs text-sm">
        <span className="font-medium">Nota interna</span>
        <textarea
          name="body"
          rows={2}
          maxLength={2000}
          className="mg-input"
          defaultValue={state.error ? valueOf(state, "body") : ""}
          aria-label="Nota interna"
        />
      </label>
      <Submit label="Guardar nota (no se envía)" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

/** Plantilla aprobada de WhatsApp: la única forma de escribir fuera de la ventana de 24 h. */
export function TemplateForm({
  conversation,
  templates,
  whatsappConsent,
}: {
  conversation: Conversation;
  templates: WhatsappTemplate[];
  whatsappConsent: boolean;
}) {
  const [state, action] = useActionState(sendTemplateAction, {});
  useToastOnMessage(state);
  return (
    <TemplateFields
      key={state.message ? String(state.at) : "tpl"}
      conversation={conversation}
      templates={templates}
      whatsappConsent={whatsappConsent}
      state={state}
      action={action}
    />
  );
}

function TemplateFields({
  conversation,
  templates,
  whatsappConsent,
  state,
  action,
}: {
  conversation: Conversation;
  templates: WhatsappTemplate[];
  whatsappConsent: boolean;
  state: InboxFormState;
  action: (form: FormData) => void;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const usable = templates.filter((t) => !templateBlocker(t, conversation, whatsappConsent));
  const [templateId, setTemplateId] = useState(usable[0]?.id ?? "");
  const t = usable.find((x) => x.id === templateId);
  const [params, setParams] = useState<string[]>([]);
  if (usable.length === 0)
    return (
      <p className="text-sm text-muted" data-testid="no-templates">
        No hay plantillas aprobadas que se puedan usar con este contacto. {INBOX_COPY.templatesNote}
      </p>
    );
  const values = Array.from({ length: t?.paramCount ?? 0 }, (_, i) => params[i] ?? "");
  return (
    <form action={action} className="flex flex-col gap-sm" data-testid="template-form">
      <input type="hidden" name="conversationId" value={conversation.id} />
      <input type="hidden" name="requestId" value={requestId} />
      <label className="flex flex-col gap-xs text-sm">
        <span className="font-medium">Plantilla aprobada</span>
        <select
          name="templateId"
          className="mg-input"
          value={templateId}
          onChange={(e) => {
            setTemplateId(e.currentTarget.value);
            setParams([]);
          }}
        >
          {usable.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} · {x.language} · {TEMPLATE_CATEGORY_LABELS[x.category]}
            </option>
          ))}
        </select>
      </label>
      {values.map((v, i) => (
        <Input
          key={`${templateId}-${i}`}
          name="params"
          id={`tpl-param-${i}`}
          label={`Dato {{${i + 1}}}`}
          value={v}
          onChange={(e) => {
            const next = [...values];
            next[i] = e.currentTarget.value;
            setParams(next);
          }}
        />
      ))}
      {t ? (
        <p
          className="mg-tone rounded-md border p-sm text-sm"
          data-tone="neutral"
          data-testid="template-preview"
        >
          {renderTemplate(
            t.bodyText,
            t.name,
            values.map((v, i) => v || `{{${i + 1}}}`),
          )}
        </p>
      ) : null}
      <Submit label="Enviar plantilla por WhatsApp" />
      <FormError state={state} />
    </form>
  );
}

/** Alta o edición de una respuesta rápida (admin o encargado). */
export function QuickReplyForm({ reply, centers }: { reply?: QuickReply; centers: Option[] }) {
  const [state, action] = useActionState(saveQuickReplyAction, {});
  useToastOnMessage(state);
  return (
    <form
      key={state.message ? String(state.at) : (reply?.id ?? "qr")}
      action={action}
      className="flex flex-col gap-sm"
      data-testid={reply ? `quick-reply-form-${reply.id}` : "quick-reply-form"}
    >
      {reply ? (
        <>
          <input type="hidden" name="id" value={reply.id} />
          <input type="hidden" name="version" value={reply.version} />
        </>
      ) : null}
      <div className="grid gap-sm md:grid-cols-2">
        <Input
          name="title"
          id={`qr-title-${reply?.id ?? "new"}`}
          label="Título"
          required
          defaultValue={valueOf(state, "title", reply?.title ?? "")}
        />
        <Select
          name="detailCenterId"
          id={`qr-center-${reply?.id ?? "new"}`}
          label="Centro"
          options={centers}
          defaultValue={valueOf(
            state,
            "detailCenterId",
            reply ? (reply.detailCenterId ?? "") : (centers[0]?.value ?? ""),
          )}
        />
      </div>
      <label className="flex flex-col gap-xs text-sm">
        <span className="font-medium">Texto</span>
        <textarea
          name="body"
          rows={2}
          maxLength={1000}
          className="mg-input"
          defaultValue={valueOf(state, "body", reply?.body ?? "")}
        />
        <span className="text-xs text-muted">
          Datos disponibles: {"{nombre}"} {"{centro}"}. Sin precios ni promociones inventados.
        </span>
      </label>
      <Checkbox
        name="active"
        value="on"
        id={`qr-active-${reply?.id ?? "new"}`}
        label="Activa"
        checked={reply?.active ?? true}
      />
      <Input
        name="reason"
        id={`qr-reason-${reply?.id ?? "new"}`}
        label="Motivo"
        required
        defaultValue={reply ? "" : "Alta de respuesta rápida"}
      />
      <Submit label={reply ? "Guardar" : "Agregar respuesta rápida"} variant="secondary" />
      <FormError state={state} />
    </form>
  );
}

/** Trae de Meta las plantillas de la WABA (admin). */
export function SyncTemplatesButton() {
  const [state, action] = useActionState(syncTemplatesAction, {});
  useToastOnMessage(state);
  return (
    <form action={action} className="flex flex-col gap-xs" data-testid="sync-templates">
      <Submit label="Sincronizar plantillas con Meta" variant="secondary" />
      <FormError state={state} />
    </form>
  );
}
