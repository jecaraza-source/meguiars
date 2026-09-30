import "server-only";
import { createHmac } from "node:crypto";
import {
  buildSendRequest,
  buildVerifyRequest,
  parseSendResponse,
  parseVerifyResponse,
  type GraphBases,
  type GraphRequest,
  type InboxChannel,
  type OutboundMessage,
} from "@meguiars/domain";

/**
 * Credenciales de Meta: SÓLO en variables del servidor (Vercel → Environment
 * Variables, nunca NEXT_PUBLIC_). Ninguna se guarda en la base ni viaja al
 * navegador o a la app móvil; las pantallas sólo reciben si están presentes.
 *
 * - META_APP_SECRET: firma X-Hub-Signature-256 de los webhooks.
 * - META_WEBHOOK_VERIFY_TOKEN: token del GET de verificación del webhook.
 * - WHATSAPP_ACCESS_TOKEN: token de usuario del sistema con whatsapp_business_messaging.
 * - MESSENGER_PAGE_ACCESS_TOKEN: token de la página con pages_messaging.
 * - INSTAGRAM_ACCESS_TOKEN: token de la cuenta profesional (instagram_business_manage_messages).
 * - META_GRAPH_VERSION (opcional): versión de la Graph API (por omisión la del dominio).
 */
const TOKEN_ENV: Record<InboxChannel, string> = {
  whatsapp: "WHATSAPP_ACCESS_TOKEN",
  messenger: "MESSENGER_PAGE_ACCESS_TOKEN",
  instagram: "INSTAGRAM_ACCESS_TOKEN",
};

const present = (name: string) => (process.env[name] ?? "").trim() !== "";

/** Qué falta configurar (sólo nombres de variables, nunca valores). */
export function metaConfigStatus() {
  const webhook = {
    appSecret: present("META_APP_SECRET"),
    verifyToken: present("META_WEBHOOK_VERIFY_TOKEN"),
  };
  const channels = Object.fromEntries(
    (Object.keys(TOKEN_ENV) as InboxChannel[]).map((c) => [c, present(TOKEN_ENV[c])]),
  ) as Record<InboxChannel, boolean>;
  return {
    webhook,
    channels,
    serviceKey: present("SUPABASE_SERVICE_ROLE_KEY"),
    missing: [
      ...(!webhook.appSecret ? ["META_APP_SECRET"] : []),
      ...(!webhook.verifyToken ? ["META_WEBHOOK_VERIFY_TOKEN"] : []),
      ...(!present("SUPABASE_SERVICE_ROLE_KEY") ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
    ],
    tokenEnv: TOKEN_ENV,
  };
}

/** El canal está listo en el servidor: webhook firmado, llave de servicio y token del canal. */
export function channelServerReady(channel: InboxChannel): boolean {
  const s = metaConfigStatus();
  return s.missing.length === 0 && s.channels[channel];
}

/** HMAC-SHA256 (hex) del cuerpo crudo con el App Secret, o null si falta. */
export function expectedSignature(rawBody: string): string | null {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

function bases(): GraphBases {
  return {
    version: process.env.META_GRAPH_VERSION || undefined,
    // Sólo para pruebas locales (servidor falso); en producción se usan los hosts oficiales.
    graph: process.env.META_GRAPH_BASE_URL || undefined,
    instagram: process.env.INSTAGRAM_GRAPH_BASE_URL || undefined,
  };
}

async function callGraph(
  channel: InboxChannel,
  req: GraphRequest,
): Promise<{ status: number; json: unknown }> {
  const token = process.env[TOKEN_ENV[channel]];
  if (!token)
    return { status: 0, json: { error: { message: `Falta ${TOKEN_ENV[channel]} en el servidor` } } };
  try {
    const res = await fetch(req.url, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(req.body ? { "Content-Type": "application/json" } : {}),
      },
      body: req.body ? JSON.stringify(req.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, json };
  } catch (e) {
    return {
      status: 0,
      json: { error: { message: `Sin respuesta de Meta: ${e instanceof Error ? e.message : String(e)}` } },
    };
  }
}

/** Envía un texto preparado por la base (ventana ya validada). */
export async function sendViaMeta(msg: OutboundMessage) {
  const { status, json } = await callGraph(msg.channel, buildSendRequest(msg, bases()));
  return parseSendResponse(status, json);
}

/** «Probar conexión»: consulta la cuenta en Meta con el token del servidor. */
export async function verifyWithMeta(channel: InboxChannel, externalAccountId: string) {
  const { status, json } = await callGraph(channel, buildVerifyRequest(channel, externalAccountId, bases()));
  return parseVerifyResponse(channel, externalAccountId, status, json);
}
