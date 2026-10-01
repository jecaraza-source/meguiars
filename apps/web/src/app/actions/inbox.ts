"use server";

import {
  activeCenterAccess,
  commercialErrorMessage,
  guardScreen,
  canInCenter,
  type ConversationPriority,
  type InboxChannel,
  type Screen,
} from "@meguiars/domain";
import { createInboxRepository, createInboxServiceGateway } from "@meguiars/supabase";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, values, type ActionFormState } from "@/lib/form-data";
import { sendConversationMessage, sendTemplateMessage } from "@/lib/inbox";
import {
  channelServerReady,
  fetchWhatsappTemplates,
  verifyWithMeta,
  whatsappBusinessAccountId,
} from "@/lib/meta";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export type InboxFormState = ActionFormState;

const FORBIDDEN = "No tienes permiso para esta acción.";
const conversationPath = (id: string) => `/comercial/bandeja/${id}`;

async function context(screen: Screen) {
  const state = await getAuthState();
  if (!guardScreen(state, screen).allow) return null;
  const active = activeCenterAccess(state);
  const supabase = await createSupabaseServerClient();
  if (!active || !supabase) return null;
  return { state, center: active.center, supabase, repo: createInboxRepository(supabase) };
}

const fail = (error: { kind: string; code?: string; message: string }, form?: FormData) =>
  stamp({ error: commercialErrorMessage(error), ...(form ? { values: values(form) } : {}) });

export async function sendMessageAction(_prev: InboxFormState, form: FormData): Promise<InboxFormState> {
  const ctx = await context("conversation");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const conversationId = text(form, "conversationId");
  const r = await sendConversationMessage(ctx.supabase, {
    conversationId,
    requestId: text(form, "requestId"),
    body: text(form, "body"),
    expectedLastMessageAt: text(form, "expectedLastMessageAt") || undefined,
  });
  revalidatePath(conversationPath(conversationId));
  // Guarda contra duplicados: el mensaje de la base explica qué cambió (no es el genérico de versión).
  if (!r.ok && r.error.code === "40001") return stamp({ error: r.error.message, values: values(form) });
  if (!r.ok) return fail(r.error, form);
  if (r.data.status === "fallido")
    return stamp({ error: `Meta no aceptó el mensaje: ${r.data.error ?? "error"}` });
  return stamp({ message: "Mensaje enviado" });
}

/** Plantilla aprobada de WhatsApp (fuera de la ventana de 24 h). */
export async function sendTemplateAction(_prev: InboxFormState, form: FormData): Promise<InboxFormState> {
  const ctx = await context("conversation");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const conversationId = text(form, "conversationId");
  const r = await sendTemplateMessage(ctx.supabase, {
    conversationId,
    requestId: text(form, "requestId"),
    templateId: text(form, "templateId"),
    params: form.getAll("params").map(String),
  });
  revalidatePath(conversationPath(conversationId));
  if (!r.ok) return fail(r.error, form);
  if (r.data.status === "fallido")
    return stamp({ error: `Meta no aceptó la plantilla: ${r.data.error ?? "error"}` });
  return stamp({ message: "Plantilla enviada" });
}

export async function triageAction(_prev: InboxFormState, form: FormData): Promise<InboxFormState> {
  const ctx = await context("conversation");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const id = text(form, "conversationId");
  const r = await ctx.repo.setTriage(id, Number(text(form, "version")), {
    priority: (text(form, "priority") || "normal") as ConversationPriority,
    tags: text(form, "tags").split(","),
    pending: form.get("pending") === "on",
  });
  if (!r.ok) return fail(r.error, form);
  revalidatePath(conversationPath(id));
  revalidatePath("/comercial/bandeja");
  return stamp({ message: "Triaje guardado" });
}

export async function addNoteAction(_prev: InboxFormState, form: FormData): Promise<InboxFormState> {
  const ctx = await context("conversation");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const id = text(form, "conversationId");
  const r = await ctx.repo.addNote(id, text(form, "requestId"), text(form, "body"));
  if (!r.ok) return fail(r.error, form);
  revalidatePath(conversationPath(id));
  return stamp({ message: "Nota interna guardada" });
}

export async function saveQuickReplyAction(_prev: InboxFormState, form: FormData): Promise<InboxFormState> {
  const ctx = await context("inbox");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const id = text(form, "id") || undefined;
  const r = await ctx.repo.saveQuickReply({
    organizationId: ctx.center.organizationId,
    id,
    version: id ? Number(text(form, "version")) : undefined,
    detailCenterId: text(form, "detailCenterId") || undefined,
    title: text(form, "title"),
    body: text(form, "body"),
    active: form.get("active") === "on",
    reason: text(form, "reason"),
  });
  if (!r.ok) return fail(r.error, form);
  revalidatePath("/comercial/bandeja");
  return stamp({ message: "Respuesta rápida guardada" });
}

export async function assignConversationAction(
  _prev: InboxFormState,
  form: FormData,
): Promise<InboxFormState> {
  const ctx = await context("conversation");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const id = text(form, "conversationId");
  const r = await ctx.repo.assign(id, Number(text(form, "version")), text(form, "userId") || null);
  if (!r.ok) return fail(r.error);
  revalidatePath(conversationPath(id));
  return stamp({ message: "Responsable actualizado" });
}

export async function conversationStatusAction(
  _prev: InboxFormState,
  form: FormData,
): Promise<InboxFormState> {
  const ctx = await context("conversation");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const id = text(form, "conversationId");
  const status = text(form, "status") === "cerrada" ? "cerrada" : "abierta";
  const r = await ctx.repo.setStatus(id, Number(text(form, "version")), status);
  if (!r.ok) return fail(r.error);
  revalidatePath(conversationPath(id));
  return stamp({ message: status === "cerrada" ? "Conversación atendida" : "Conversación reabierta" });
}

export async function linkConversationLeadAction(
  _prev: InboxFormState,
  form: FormData,
): Promise<InboxFormState> {
  const ctx = await context("conversation");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const id = text(form, "conversationId");
  const r = await ctx.repo.linkLead(id, Number(text(form, "version")), text(form, "leadId"));
  if (!r.ok) return fail(r.error, form);
  revalidatePath(conversationPath(id));
  return stamp({ message: "Conversación ligada al prospecto" });
}

export async function conversationLeadAction(_prev: InboxFormState, form: FormData): Promise<InboxFormState> {
  const ctx = await context("conversation");
  if (!ctx) return stamp({ error: FORBIDDEN });
  const id = text(form, "conversationId");
  const r = await ctx.repo.createLead({
    conversationId: id,
    version: Number(text(form, "version")),
    requestId: text(form, "requestId"),
    fullName: text(form, "fullName"),
    socialHandle: text(form, "socialHandle") || undefined,
    interestServiceIds: form.getAll("interestServiceIds").map(String),
    notes: text(form, "notes") || undefined,
  });
  if (!r.ok) return fail(r.error, form);
  revalidatePath(conversationPath(id));
  redirect(`/comercial/prospectos/${r.data.leadId}`);
}

// ---------------------------------------------------------------------------
// Cuentas oficiales (admin de la organización)
// ---------------------------------------------------------------------------

async function adminContext() {
  const ctx = await context("integrations");
  if (!ctx || !canInCenter(ctx.state, ctx.center.id, "channels.manage")) return null;
  return ctx;
}

export async function saveChannelAccountAction(
  _prev: InboxFormState,
  form: FormData,
): Promise<InboxFormState> {
  const ctx = await adminContext();
  if (!ctx) return stamp({ error: FORBIDDEN });
  const r = await ctx.repo.saveAccount({
    organizationId: ctx.center.organizationId,
    id: text(form, "id") || undefined,
    detailCenterId: text(form, "detailCenterId"),
    channel: text(form, "channel") as InboxChannel,
    externalAccountId: text(form, "externalAccountId"),
    label: text(form, "label"),
    active: form.get("active") === "on",
    reason: text(form, "reason"),
  });
  if (!r.ok) return fail(r.error, form);
  revalidatePath("/comercial/integraciones");
  return stamp({ message: "Cuenta guardada. Prueba la conexión para verificarla con Meta." });
}

/** «Probar conexión»: consulta la cuenta en Meta con el token del servidor y registra el resultado. */
export async function verifyChannelAccountAction(
  _prev: InboxFormState,
  form: FormData,
): Promise<InboxFormState> {
  const ctx = await adminContext();
  if (!ctx) return stamp({ error: FORBIDDEN });
  const accounts = await ctx.repo.accounts(ctx.center.organizationId);
  if (!accounts.ok) return fail(accounts.error);
  const account = accounts.data.find((a) => a.id === text(form, "id"));
  if (!account) return stamp({ error: "Cuenta inexistente o sin permiso" });
  const service = createSupabaseServiceClient();
  if (!service) return stamp({ error: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." });
  if (!channelServerReady(account.channel))
    return stamp({
      error: "Faltan credenciales en el servidor para este canal (revisa la lista de variables).",
    });
  const result = await verifyWithMeta(account.channel, account.externalAccountId);
  const saved = await createInboxServiceGateway(service).recordVerification(account.id, result);
  revalidatePath("/comercial/integraciones");
  if (!saved.ok) return fail(saved.error);
  return result.ok
    ? stamp({ message: `Conexión verificada con Meta: ${result.name}` })
    : stamp({ error: `Meta rechazó la verificación: ${result.error}` });
}

/** Sincroniza las plantillas de la WABA desde Meta (sólo admin; el servidor usa su token). */
export async function syncTemplatesAction(_prev: InboxFormState, _form: FormData): Promise<InboxFormState> {
  const ctx = await adminContext();
  if (!ctx) return stamp({ error: FORBIDDEN });
  const allowed = await ctx.repo.canSyncTemplates(ctx.center.organizationId);
  if (!allowed.ok || !allowed.data) return stamp({ error: FORBIDDEN });
  const waba = whatsappBusinessAccountId();
  if (!waba) return stamp({ error: "Falta WHATSAPP_BUSINESS_ACCOUNT_ID en el servidor." });
  if (!channelServerReady("whatsapp"))
    return stamp({ error: "Faltan credenciales de WhatsApp en el servidor (revisa la lista de variables)." });
  const service = createSupabaseServiceClient();
  if (!service) return stamp({ error: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." });
  const fetched = await fetchWhatsappTemplates(waba);
  if (!fetched.ok) return stamp({ error: `Meta rechazó la consulta de plantillas: ${fetched.error}` });
  const saved = await createInboxServiceGateway(service).recordTemplates(
    ctx.center.organizationId,
    waba,
    fetched.items,
  );
  revalidatePath("/comercial/integraciones");
  if (!saved.ok) return fail(saved.error);
  const approved = fetched.items.filter((t) => t.status === "APPROVED").length;
  return stamp({
    message: `Plantillas sincronizadas con Meta: ${fetched.items.length} (${approved} aprobadas)`,
  });
}
