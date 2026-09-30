import type { ChannelAccount, InboxChannel } from "../inbox/inbox";

/**
 * Canales de la bandeja y las publicaciones (CR2). Desde la fase 2, WhatsApp
 * Business, Messenger (Facebook) e Instagram tienen conexión oficial; su
 * estado se calcula con datos reales (integrationState): «Conectada» sólo si
 * el servidor verificó la cuenta con la API de Meta usando sus credenciales.
 * Google Business Profile y TikTok siguen sin conexión.
 */
export const INTEGRATION_CHANNELS = [
  "instagram",
  "facebook",
  "whatsapp_business",
  "google_business_profile",
  "tiktok",
] as const;
export type IntegrationChannel = (typeof INTEGRATION_CHANNELS)[number];

/** conectada: verificada con Meta; pendiente: implementada, falta configurar o verificar; no_disponible: aún no existe. */
export type IntegrationStatus = "conectada" | "pendiente_configurar" | "no_disponible";

export interface IntegrationInfo {
  channel: IntegrationChannel;
  label: string;
  /** Estado sin datos de cuentas (lo que se sabe sin consultar la base). */
  status: IntegrationStatus;
  /** Canal de la bandeja que la implementa (null: sin conexión todavía). */
  inboxChannel: InboxChannel | null;
  /** Fase en la que se implementa (o se implementó) la conexión oficial. */
  phase: 2 | 3 | null;
  priority: boolean;
  /** Qué se puede hacer sin la conexión. */
  manualFlow: string;
  /** Qué hace la conexión y sus límites. */
  scope: string | null;
}

export const INTEGRATIONS: readonly IntegrationInfo[] = [
  {
    channel: "instagram",
    label: "Instagram",
    status: "pendiente_configurar",
    inboxChannel: "instagram",
    phase: 2,
    priority: true,
    manualFlow: "Registra cada consulta como prospecto con canal Instagram y su usuario (@).",
    scope:
      "Mensajes directos de una cuenta profesional (API de Instagram con inicio de sesión de Instagram). Se responde sólo dentro de 24 h del último mensaje; comentarios y publicaciones no.",
  },
  {
    channel: "facebook",
    label: "Facebook (Messenger)",
    status: "pendiente_configurar",
    inboxChannel: "messenger",
    phase: 2,
    priority: true,
    manualFlow: "Registra cada mensaje o comentario como prospecto con canal Facebook.",
    scope:
      "Mensajes de Messenger de la página (Messenger Platform). Se responde sólo dentro de 24 h; los comentarios de publicaciones no entran.",
  },
  {
    channel: "whatsapp_business",
    label: "WhatsApp Business",
    status: "pendiente_configurar",
    inboxChannel: "whatsapp",
    phase: 2,
    priority: true,
    manualFlow:
      "Registra la consulta con canal WhatsApp; comparte la cotización desde tu teléfono y márcala como enviada.",
    scope:
      "Número de WhatsApp Cloud API. Texto libre sólo dentro de 24 h del último mensaje del cliente; fuera de ella se requieren plantillas aprobadas (todavía no incluidas).",
  },
  {
    channel: "google_business_profile",
    label: "Google Business Profile",
    status: "no_disponible",
    inboxChannel: null,
    phase: null,
    priority: false,
    manualFlow: "Registra las consultas que lleguen por Google con canal Google.",
    scope: null,
  },
  {
    channel: "tiktok",
    label: "TikTok",
    status: "no_disponible",
    inboxChannel: null,
    phase: null,
    priority: false,
    manualFlow: "Registra las consultas con canal «Otro» y el detalle «TikTok».",
    scope: null,
  },
];

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  conectada: "Conectada",
  pendiente_configurar: "Pendiente de configurar",
  no_disponible: "Aún no disponible",
};

/**
 * Estado real de un canal. `serverReady` indica si el servidor tiene las
 * credenciales (sólo la web lo sabe; en móvil es undefined y manda la última
 * verificación registrada).
 */
export function integrationState(
  info: IntegrationInfo,
  accounts: readonly Pick<ChannelAccount, "channel" | "status" | "active" | "lastVerifyError" | "label">[],
  serverReady?: boolean,
): { status: IntegrationStatus; detail: string } {
  if (!info.inboxChannel) return { status: "no_disponible", detail: info.manualFlow };
  const mine = accounts.filter((a) => a.channel === info.inboxChannel && a.active);
  if (serverReady === false)
    return {
      status: "pendiente_configurar",
      detail: "Faltan las credenciales de este canal en el servidor.",
    };
  if (mine.length === 0)
    return { status: "pendiente_configurar", detail: "Falta registrar la cuenta oficial." };
  const ok = mine.filter((a) => a.status === "verificada");
  if (ok.length > 0)
    return {
      status: "conectada",
      detail: `${ok.map((a) => a.label).join(", ")}: verificada${ok.length > 1 ? "s" : ""} con Meta.`,
    };
  const failed = mine.find((a) => a.status === "error");
  return {
    status: "pendiente_configurar",
    detail: failed
      ? `Falló la verificación: ${failed.lastVerifyError ?? "error de Meta"}.`
      : "Falta probar la conexión con Meta.",
  };
}
