import type { InboxChannel } from "./inbox";

/**
 * Formato de las API oficiales de Meta, sin red ni secretos (el servidor web
 * hace las llamadas). Referencias revisadas para CR2 fase 2 (Graph API v26.0):
 * - Webhooks: verificación GET con hub.mode=subscribe, hub.verify_token y
 *   hub.challenge; cada POST trae X-Hub-Signature-256 = "sha256=" + HMAC-SHA256
 *   del cuerpo crudo con el App Secret.
 * - WhatsApp Cloud API: POST /{phone-number-id}/messages con
 *   messaging_product "whatsapp"; webhook `messages` con metadata.phone_number_id,
 *   contacts[] (wa_id, user_id = BSUID, profile.name), messages[] y statuses[].
 *   Si el contacto usa nombre de usuario, el teléfono puede no venir; el BSUID sí.
 * - Messenger: POST /{page-id}/messages con recipient.id (PSID) y
 *   messaging_type RESPONSE; webhook object "page", entry[].messaging[].
 * - Instagram (API con inicio de sesión de Instagram): POST /{ig-id}/messages
 *   en graph.instagram.com con recipient.id (IGSID); webhook object "instagram".
 * Las tres limitan el texto libre a 24 h desde el último mensaje del contacto.
 * - Plantillas de WhatsApp (revisado para los pendientes de CR2): se listan con
 *   GET /{whatsapp-business-account-id}/message_templates (fields name,
 *   language, status, category, components) y se envían con type "template",
 *   template.name, template.language.code y components [{type:"body",
 *   parameters:[{type:"text", text}]}]. Sólo las APPROVED se entregan, y sí
 *   fuera de la ventana de 24 h.
 */

export const META_GRAPH_VERSION = "v26.0";
export const META_GRAPH_BASE = "https://graph.facebook.com";
export const INSTAGRAM_GRAPH_BASE = "https://graph.instagram.com";

export interface InboundItem {
  external_id: string;
  contact_id: string;
  contact_phone?: string | undefined;
  contact_name?: string | undefined;
  message_type: string;
  body?: string | undefined;
  occurred_at: string;
}

export interface StatusItem {
  external_id: string;
  status: "enviado" | "entregado" | "leido" | "fallido";
  occurred_at: string;
  error?: string | undefined;
}

export interface ParsedWebhook {
  inbound: { channel: InboxChannel; accountId: string; items: InboundItem[] }[];
  statuses: { channel: InboxChannel; items: StatusItem[] }[];
  /** Objetos o campos que no se procesan (se responden 200 para que Meta no reintente). */
  skipped: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v !== "" ? v : typeof v === "number" ? String(v) : undefined;

/** Unix en segundos (WhatsApp) o milisegundos (Messenger/Instagram) a ISO. */
function isoFrom(ts: unknown, unit: "s" | "ms"): string {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString();
  return new Date(unit === "s" ? n * 1000 : n).toISOString();
}

const WA_STATUS: Record<string, StatusItem["status"]> = {
  sent: "enviado",
  delivered: "entregado",
  read: "leido",
  failed: "fallido",
};

function whatsappBody(m: Obj): string | undefined {
  const type = str(m.type);
  if (type === "text" && isObj(m.text)) return str(m.text.body);
  if (type && isObj(m[type])) return str((m[type] as Obj).caption);
  if (type === "button" && isObj(m.button)) return str(m.button.text);
  if (type === "interactive" && isObj(m.interactive)) {
    const reply = (m.interactive.button_reply ?? m.interactive.list_reply) as Obj | undefined;
    return reply ? str(reply.title) : undefined;
  }
  return undefined;
}

function parseWhatsApp(entry: Obj, out: ParsedWebhook) {
  for (const change of arr(entry.changes)) {
    if (!isObj(change) || change.field !== "messages" || !isObj(change.value)) {
      out.skipped.push(`whatsapp:${isObj(change) ? String(change.field) : "?"}`);
      continue;
    }
    const value = change.value;
    const accountId = isObj(value.metadata) ? str(value.metadata.phone_number_id) : undefined;
    const contacts = new Map<string, { name?: string | undefined; userId?: string | undefined }>();
    for (const c of arr(value.contacts)) {
      if (!isObj(c)) continue;
      const key = str(c.wa_id) ?? str(c.user_id);
      if (key)
        contacts.set(key, {
          name: isObj(c.profile) ? str(c.profile.name) : undefined,
          userId: str(c.user_id),
        });
    }
    const items: InboundItem[] = [];
    for (const m of arr(value.messages)) {
      if (!isObj(m)) continue;
      const id = str(m.id);
      const from = str(m.from) ?? str(m.from_user_id) ?? str(m.user_id);
      if (!id || !from) continue;
      const c = contacts.get(from);
      items.push({
        external_id: id,
        // El wa_id (teléfono) identifica la conversación; si WhatsApp no lo comparte, el BSUID.
        contact_id: from,
        contact_phone: /^\d{8,15}$/.test(from) ? from : undefined,
        contact_name: c?.name,
        message_type: str(m.type) ?? "text",
        body: whatsappBody(m),
        occurred_at: isoFrom(m.timestamp, "s"),
      });
    }
    if (accountId && items.length) out.inbound.push({ channel: "whatsapp", accountId, items });
    const statuses: StatusItem[] = [];
    for (const s of arr(value.statuses)) {
      if (!isObj(s)) continue;
      const id = str(s.id);
      const status = WA_STATUS[str(s.status) ?? ""];
      if (!id || !status) continue;
      const err = arr(s.errors).find(isObj);
      statuses.push({
        external_id: id,
        status,
        occurred_at: isoFrom(s.timestamp, "s"),
        error: err
          ? [str(err.code) && `(#${str(err.code)})`, str(err.title) ?? str(err.message)]
              .filter(Boolean)
              .join(" ")
          : undefined,
      });
    }
    if (statuses.length) out.statuses.push({ channel: "whatsapp", items: statuses });
  }
}

function parseMessaging(channel: "messenger" | "instagram", entry: Obj, out: ParsedWebhook) {
  const accountId = str(entry.id);
  const items: InboundItem[] = [];
  const delivered: StatusItem[] = [];
  for (const ev of arr(entry.messaging)) {
    if (!isObj(ev)) continue;
    const sender = isObj(ev.sender) ? str(ev.sender.id) : undefined;
    if (isObj(ev.message)) {
      const m = ev.message;
      // Los ecos son mensajes que la propia cuenta envió (desde la bandeja o la app de Meta).
      if (m.is_echo === true) continue;
      const mid = str(m.mid);
      if (!mid || !sender) continue;
      const attachment = arr(m.attachments).find(isObj);
      items.push({
        external_id: mid,
        contact_id: sender,
        message_type: str(m.text) ? "text" : (str(attachment?.type) ?? "otro"),
        body: str(m.text),
        occurred_at: isoFrom(ev.timestamp, "ms"),
      });
    } else if (isObj(ev.delivery)) {
      for (const mid of arr(ev.delivery.mids)) {
        const id = str(mid);
        if (id)
          delivered.push({ external_id: id, status: "entregado", occurred_at: isoFrom(ev.timestamp, "ms") });
      }
    } else {
      out.skipped.push(
        `${channel}:${Object.keys(ev)
          .filter((k) => !["sender", "recipient", "timestamp"].includes(k))
          .join(",")}`,
      );
    }
  }
  if (accountId && items.length) out.inbound.push({ channel, accountId, items });
  if (delivered.length) out.statuses.push({ channel, items: delivered });
}

/** Convierte el cuerpo de un webhook de Meta en mensajes y estados normalizados. */
export function parseMetaWebhook(body: unknown): ParsedWebhook {
  const out: ParsedWebhook = { inbound: [], statuses: [], skipped: [] };
  if (!isObj(body)) {
    out.skipped.push("cuerpo inválido");
    return out;
  }
  for (const entry of arr(body.entry)) {
    if (!isObj(entry)) continue;
    if (body.object === "whatsapp_business_account") parseWhatsApp(entry, out);
    else if (body.object === "page") parseMessaging("messenger", entry, out);
    else if (body.object === "instagram") parseMessaging("instagram", entry, out);
    else out.skipped.push(`objeto ${String(body.object)}`);
  }
  return out;
}

/** Respuesta al GET de verificación del webhook (null = rechazar con 403). */
export function webhookChallenge(
  params: { mode: string | null; token: string | null; challenge: string | null },
  expectedToken: string | undefined,
): string | null {
  if (!expectedToken || params.mode !== "subscribe" || !params.challenge) return null;
  return params.token === expectedToken ? params.challenge : null;
}

/**
 * Compara la firma X-Hub-Signature-256 con el HMAC calculado por el servidor
 * (hex). Comparación de longitud fija para no filtrar el prefijo correcto.
 */
export function signatureMatches(header: string | null, expectedHex: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const got = header.slice("sha256=".length).toLowerCase();
  if (got.length !== expectedHex.length || !/^[0-9a-f]+$/.test(got)) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Envío y verificación de cuentas
// ---------------------------------------------------------------------------

export interface GraphRequest {
  url: string;
  method: "GET" | "POST";
  body?: Obj;
}

export interface GraphBases {
  version?: string | undefined;
  graph?: string | undefined;
  instagram?: string | undefined;
}

function base(channel: InboxChannel, b: GraphBases) {
  const host = channel === "instagram" ? (b.instagram ?? INSTAGRAM_GRAPH_BASE) : (b.graph ?? META_GRAPH_BASE);
  return `${host.replace(/\/$/, "")}/${b.version ?? META_GRAPH_VERSION}`;
}

/** Solicitud para enviar un texto dentro de la ventana de atención. */
export function buildSendRequest(
  msg: {
    channel: InboxChannel;
    externalAccountId: string;
    contactExternalId: string;
    contactPhone: string | null;
    body: string;
  },
  bases: GraphBases = {},
): GraphRequest {
  const url = `${base(msg.channel, bases)}/${msg.externalAccountId}/messages`;
  if (msg.channel === "whatsapp") {
    // Al teléfono (wa_id) con `to`; si WhatsApp sólo compartió el BSUID, con `recipient`.
    const address = msg.contactPhone
      ? { to: msg.contactPhone.replace(/^\+/, "") }
      : { recipient: msg.contactExternalId };
    return {
      url,
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        ...address,
        type: "text",
        text: { preview_url: false, body: msg.body },
      },
    };
  }
  return {
    url,
    method: "POST",
    body: {
      recipient: { id: msg.contactExternalId },
      ...(msg.channel === "messenger" ? { messaging_type: "RESPONSE" } : {}),
      message: { text: msg.body },
    },
  };
}

/** Solicitud para enviar una plantilla aprobada de WhatsApp (se permite fuera de las 24 h). */
export function buildTemplateSendRequest(
  msg: {
    externalAccountId: string;
    contactExternalId: string;
    contactPhone: string | null;
    templateName: string;
    templateLanguage: string;
    templateParams: readonly string[];
  },
  bases: GraphBases = {},
): GraphRequest {
  const address = msg.contactPhone
    ? { to: msg.contactPhone.replace(/^\+/, "") }
    : { recipient: msg.contactExternalId };
  return {
    url: `${base("whatsapp", bases)}/${msg.externalAccountId}/messages`,
    method: "POST",
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      ...address,
      type: "template",
      template: {
        name: msg.templateName,
        language: { code: msg.templateLanguage },
        ...(msg.templateParams.length
          ? {
              components: [
                { type: "body", parameters: msg.templateParams.map((text) => ({ type: "text", text })) },
              ],
            }
          : {}),
      },
    },
  };
}

/** Solicitud para listar las plantillas de la cuenta de WhatsApp Business (WABA). */
export function buildTemplatesListRequest(businessAccountId: string, bases: GraphBases = {}): GraphRequest {
  return {
    url: `${base("whatsapp", bases)}/${businessAccountId}/message_templates?fields=name,language,status,category,components&limit=200`,
    method: "GET",
  };
}

export interface TemplateItem {
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  status: string;
  body: string | null;
  param_count: number;
}

/** Plantillas que devolvió Meta (sólo lo necesario; descarta las de formato desconocido). */
export function parseTemplatesResponse(
  status: number,
  json: unknown,
): { ok: true; items: TemplateItem[]; next: string | null } | { ok: false; error: string } {
  if (status < 200 || status >= 300 || !isObj(json)) return { ok: false, error: graphError(status, json) };
  const items: TemplateItem[] = [];
  for (const t of arr(json.data)) {
    if (!isObj(t)) continue;
    const name = str(t.name);
    const language = str(t.language);
    const category = str(t.category)?.toUpperCase();
    const st = str(t.status)?.toUpperCase();
    if (!name || !/^[a-z0-9_]+$/.test(name) || !language || !/^[a-z]{2,3}(_[A-Z]{2})?$/.test(language))
      continue;
    if (category !== "MARKETING" && category !== "UTILITY" && category !== "AUTHENTICATION") continue;
    if (!st || !/^[A-Z_]{3,30}$/.test(st)) continue;
    const bodyComp = arr(t.components).find((c) => isObj(c) && str(c.type)?.toUpperCase() === "BODY");
    const body = isObj(bodyComp) ? (str(bodyComp.text) ?? null) : null;
    const params = body ? new Set([...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])).size : 0;
    items.push({
      name,
      language,
      category,
      status: st,
      body: body ? body.slice(0, 1024) : null,
      param_count: params,
    });
  }
  const paging = isObj(json.paging) ? json.paging : null;
  return { ok: true, items, next: paging ? (str(paging.next) ?? null) : null };
}

/** Id del mensaje en Meta (wamid o mid) o el error legible. */
export function parseSendResponse(
  status: number,
  json: unknown,
): { ok: true; externalId: string } | { ok: false; error: string } {
  if (status >= 200 && status < 300 && isObj(json)) {
    const wa = arr(json.messages).find(isObj);
    const id = str(wa?.id) ?? str(json.message_id);
    if (id) return { ok: true, externalId: id };
  }
  return { ok: false, error: graphError(status, json) };
}

/** Solicitud para comprobar la cuenta con las credenciales del servidor. */
export function buildVerifyRequest(
  channel: InboxChannel,
  externalAccountId: string,
  bases: GraphBases = {},
): GraphRequest {
  const root = base(channel, bases);
  if (channel === "whatsapp")
    return { url: `${root}/${externalAccountId}?fields=display_phone_number,verified_name`, method: "GET" };
  if (channel === "messenger") return { url: `${root}/${externalAccountId}?fields=name`, method: "GET" };
  return { url: `${root}/me?fields=user_id,username`, method: "GET" };
}

/**
 * Nombre verificado de la cuenta o el error. En Instagram, el token debe
 * pertenecer a la misma cuenta registrada.
 */
export function parseVerifyResponse(
  channel: InboxChannel,
  externalAccountId: string,
  status: number,
  json: unknown,
): { ok: true; name: string } | { ok: false; error: string } {
  if (status < 200 || status >= 300 || !isObj(json)) return { ok: false, error: graphError(status, json) };
  if (channel === "whatsapp") {
    const phone = str(json.display_phone_number);
    return phone
      ? { ok: true, name: [phone, str(json.verified_name)].filter(Boolean).join(" · ") }
      : { ok: false, error: "Meta no devolvió el número" };
  }
  if (channel === "messenger") {
    const name = str(json.name);
    return name ? { ok: true, name } : { ok: false, error: "Meta no devolvió la página" };
  }
  const userId = str(json.user_id) ?? str(json.id);
  if (userId !== externalAccountId)
    return { ok: false, error: "El token de Instagram pertenece a otra cuenta que la registrada" };
  return { ok: true, name: `@${str(json.username) ?? userId}` };
}

function graphError(status: number, json: unknown): string {
  const e = isObj(json) && isObj(json.error) ? json.error : null;
  if (e) {
    const code = str(e.code);
    return `${code ? `(#${code}) ` : ""}${str(e.message) ?? "Error de Meta"}`.slice(0, 500);
  }
  return `Meta respondió HTTP ${status}`;
}
