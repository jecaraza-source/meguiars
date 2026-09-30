import type { ChannelAccountStatus, ConversationStatus, InboxChannel, MessageStatus } from "./inbox";

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
    "Ventana de 24 h cerrada: WhatsApp, Messenger e Instagram sólo permiten plantillas aprobadas fuera de ella. Contacta al cliente por otro medio.",
  notMirrored:
    "Los mensajes que respondas desde las apps de Meta (Business Suite, WhatsApp Business) no se copian aquí.",
  mediaNotice: "Mensaje con archivo: ábrelo en la app de Meta.",
  sendUnavailable:
    "El envío no está configurado en el servidor (faltan credenciales). Puedes leer la conversación, pero no responder desde aquí.",
} as const;
