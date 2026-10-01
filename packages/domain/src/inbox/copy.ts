import type {
  ChannelAccountStatus,
  ConversationPriority,
  ConversationStatus,
  InboxChannel,
  MessageStatus,
  TemplateCategory,
} from "./inbox";

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
