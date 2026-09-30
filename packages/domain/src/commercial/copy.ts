import type { StatusTone } from "../agenda/copy";
import type {
  LeadConsentChannel,
  LeadContactChannel,
  LeadEventKind,
  LeadLossReason,
  LeadSource,
  LeadStatus,
  LeadTaskKind,
  QuoteDisplayStatus,
} from "./commercial";

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  google: "Google",
  recomendacion: "Recomendación",
  sitio_web: "Sitio web",
  otro: "Otro",
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  abierta: "Abierto",
  ganada: "Ganado",
  perdida: "Perdido",
};

export const LEAD_STATUS_TONES: Record<LeadStatus, StatusTone> = {
  abierta: "info",
  ganada: "success",
  perdida: "neutral",
};

export const LEAD_LOSS_REASON_LABELS: Record<LeadLossReason, string> = {
  precio: "Precio",
  sin_respuesta: "Dejó de responder",
  competencia: "Eligió a la competencia",
  sin_disponibilidad: "Sin horario disponible",
  fuera_de_zona: "Fuera de zona",
  no_califica: "No califica",
  otro: "Otro",
};

export const LEAD_EVENT_LABELS: Record<LeadEventKind, string> = {
  creado: "Alta",
  etapa: "Cambio de etapa",
  responsable: "Cambio de responsable",
  nota: "Nota",
  contacto: "Contacto",
  cotizacion: "Cotización",
  reserva: "Reserva",
  ganado: "Venta",
  perdido: "Perdido",
  reabierto: "Reabierto",
  cliente: "Ligado a cliente",
  fusion: "Fusión",
};

export const LEAD_CONTACT_CHANNEL_LABELS: Record<LeadContactChannel, string> = {
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "Email",
  presencial: "En persona",
  redes: "Mensaje en redes",
};

export const LEAD_CONSENT_LABELS: Record<LeadConsentChannel, string> = {
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "Email",
};

export const LEAD_TASK_KIND_LABELS: Record<LeadTaskKind, string> = {
  llamar: "Llamar",
  whatsapp: "WhatsApp",
  email: "Email",
  reunion: "Cita en el centro",
};

export const QUOTE_STATUS_LABELS: Record<QuoteDisplayStatus, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
  convertida: "Reservada",
  vencida: "Vencida",
};

export const QUOTE_STATUS_TONES: Record<QuoteDisplayStatus, StatusTone> = {
  borrador: "neutral",
  enviada: "info",
  aceptada: "brand",
  rechazada: "neutral",
  cancelada: "neutral",
  convertida: "success",
  vencida: "warning",
};

/** Acción para pasar a cada estado (botones). */
export const QUOTE_STATUS_ACTIONS: Record<"enviada" | "aceptada" | "rechazada" | "cancelada", string> = {
  enviada: "Marcar como enviada",
  aceptada: "El cliente aceptó",
  rechazada: "El cliente rechazó",
  cancelada: "Cancelar cotización",
};

export const DUPLICATE_MATCH_LABELS: Record<"telefono" | "email" | "nombre_parecido", string> = {
  telefono: "Mismo teléfono",
  email: "Mismo email",
  nombre_parecido: "Nombre parecido",
};

export const COMMERCIAL_COPY = {
  leadsTitle: "Prospectos",
  leadsEmpty:
    "Aún no hay prospectos. Registra la próxima consulta que llegue por redes, WhatsApp o en mostrador.",
  newLead: "Registrar prospecto",
  quotesTitle: "Cotizaciones",
  quotesEmpty: "Aún no hay cotizaciones.",
  newQuote: "Crear cotización",
  book: "Reservar servicio",
  noSocialSend:
    "La plataforma todavía no envía mensajes por redes ni WhatsApp: comparte la cotización tú y márcala como enviada.",
  quotePriceHonored:
    "La OS que se abra desde esta reserva respeta el precio cotizado y los descuentos ya autorizados; el costo y el pago al operador son los vigentes al vender.",
  priceDrift: "El precio del catálogo cambió desde que se cotizó:",
  marginNote:
    "Margen de contribución = total − otros costos directos − pago al operador. No es utilidad neta: faltan gastos de personal y operativos.",
  matchesTitle: "Posibles coincidencias",
  matchesHint:
    "Coinciden por teléfono o email (nunca sólo por el nombre). Si es la misma persona, liga el prospecto al cliente en lugar de duplicarlo.",
  duplicatesTitle: "Clientes duplicados",
  duplicatesHint:
    "Pares con el mismo teléfono (últimos 10 dígitos) o email. El nombre parecido sólo se informa. La fusión no reescribe OS, pagos ni membresías: el duplicado queda inactivo y su historial se ve en el cliente que se conserva.",
  duplicatesEmpty: "No hay duplicados por teléfono o email en tus centros.",
  segmentsTitle: "Segmentos",
  segmentsHint:
    "Filtra clientes por servicios contratados, visitas, gasto, interés y tiempo desde la última visita. Para promociones usa sólo clientes con consentimiento en el canal.",
  reportsTitle: "Reportes comerciales",
  noData: "Sin datos",
  integrationsTitle: "Integraciones",
} as const;
