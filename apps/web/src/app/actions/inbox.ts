"use server";

import {
  activeCenterAccess,
  commercialErrorMessage,
  guardScreen,
  canInCenter,
  type InboxChannel,
  type Screen,
} from "@meguiars/domain";
import { createInboxRepository, createInboxServiceGateway } from "@meguiars/supabase";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, values, type ActionFormState } from "@/lib/form-data";
import { sendConversationMessage } from "@/lib/inbox";
import { channelServerReady, verifyWithMeta } from "@/lib/meta";
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
  });
  revalidatePath(conversationPath(conversationId));
  if (!r.ok) return fail(r.error, form);
  if (r.data.status === "fallido")
    return stamp({ error: `Meta no aceptó el mensaje: ${r.data.error ?? "error"}` });
  return stamp({ message: "Mensaje enviado" });
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
