import type {
  ChannelAccountStatus,
  ConversationPriority,
  ConversationStatus,
  InboxChannel,
  MessageStatus,
  TemplateCategory,
} from "./inbox";
import type { StatusTone } from "../agenda/copy";

export const INBOX_CHANNEL_LABELS: Record<InboxChannel, string> = {
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
};

export const CHANNEL_ACCOUNT_STATUS_LABELS: Record<ChannelAccountStatus, string> = {
  pendiente: "Pendiente de verificar",
  verificada: "Verificada con Meta",
  error: "Error al verificar",
};

export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  abierta: "Abierta",
  cerrada: "Atendida",
};

/** Colores de estado: abierta en verde, atendida (cerrada) en rojo. */
export const CONVERSATION_STATUS_TONES: Record<ConversationStatus, StatusTone> = {
  abierta: "success",
  cerrada: "danger",
};

/** Prioridad tipo semáforo: alta en rojo, normal en ámbar, baja en verde. */
export const CONVERSATION_PRIORITY_TONES: Record<ConversationPriority, StatusTone> = {
  alta: "danger",
  normal: "warning",
  baja: "success",
};

/** Ventana de 24 h de WhatsApp: abierta en verde, cerrada en rojo. */
export const windowTone = (open: boolean): StatusTone => (open ? "success" : "danger");

export const MESSAGE_STATUS_LABELS: Record<MessageStatus, string> = {
  recibido: "Recibido",
  pendiente: "Enviando…",
  enviado: "Enviado",
  entregado: "Entregado",
  leido: "Leído",
  fallido: "No se envió",
};

export const INBOX_COPY = {
  title: "Bandeja",
  empty: "No hay conversaciones con estos filtros.",
  noAccounts:
    "Todavía no hay cuentas oficiales conectadas. Cuando el admin registre y verifique una en Integraciones, los mensajes llegarán aquí.",
  windowClosed:
    "Ventana de 24 h cerrada: WhatsApp, Messenger e Instagram sólo permiten plantillas aprobadas fuera de ella. En WhatsApp puedes usar una plantilla aprobada; en Messenger e Instagram, contacta al cliente por otro medio.",
  notesNote: "Las notas internas sólo las ve el equipo: nunca se envían al cliente.",
  duplicateGuard:
    "Si alguien más responde mientras escribes, el envío se detiene para que revises la conversación.",
  templatesNote:
    "Las plantillas se crean y aprueban en WhatsApp Manager (Meta). Aquí sólo se sincronizan y se usan las aprobadas; las de marketing exigen que el contacto haya autorizado WhatsApp.",
  notMirrored:
    "Los mensajes que respondas desde las apps de Meta (Business Suite, WhatsApp Business) no se copian aquí.",
  mediaNotice: "Mensaje con archivo: ábrelo en la app de Meta.",
  mediaPending: "Descargando el archivo de WhatsApp…",
  mediaFile: "Abrir archivo",
  mediaUnavailable: "No se pudo descargar el archivo",
  photoTitle: "Enviar foto",
  photoHint: "JPG, PNG o WEBP. Se reduce antes de enviar (máximo 5 MB).",
  photoCaption: "Texto de la foto (opcional)",
  photoSend: "Enviar foto",
  photoSending: "Enviando…",
  photoSent: "Foto enviada",
  photoOnlyWhatsapp: "Por ahora las fotos se envían sólo por WhatsApp.",
  sendUnavailable:
    "El envío no está configurado en el servidor (faltan credenciales). Puedes leer la conversación, pero no responder desde aquí.",
} as const;

export const CONVERSATION_PRIORITY_LABELS: Record<ConversationPriority, string> = {
  baja: "Baja",
  normal: "Normal",
  alta: "Alta",
};

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utilidad",
  AUTHENTICATION: "Autenticación",
};
