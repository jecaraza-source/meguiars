import type { StatusTone } from "../agenda/copy";
import type {
  ContactChannel,
  CustomerSegment,
  NextVisitState,
  TaskChannel,
  TaskKind,
  TaskOutcome,
  TaskSource,
  TaskStatus,
} from "./crm";

export const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  nuevo: "Nuevo",
  recurrente: "Recurrente",
  miembro: "Miembro",
  inactivo: "Inactivo",
  b2b_contacto: "Contacto B2B",
};

export const SEGMENT_TONES: Record<CustomerSegment, StatusTone> = {
  nuevo: "info",
  recurrente: "success",
  miembro: "brand",
  inactivo: "danger",
  b2b_contacto: "neutral",
};

export const CONTACT_CHANNEL_LABELS: Record<ContactChannel, string> = {
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "Email",
};

export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  llamar: "Llamar",
  whatsapp: "WhatsApp",
  email: "Email",
  renovar: "Renovar membresía",
  ofrecer_mantenimiento: "Ofrecer mantenimiento",
};

export const TASK_CHANNEL_LABELS: Record<TaskChannel, string> = {
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  email: "Email",
  presencial: "En su próxima visita",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pendiente: "Pendiente",
  hecha: "Hecha",
  cancelada: "Cancelada",
};

export const TASK_SOURCE_LABELS: Record<TaskSource, string> = {
  manual: "Manual",
  os_terminada: "OS terminada",
  proxima_visita: "Próxima visita",
  membresia: "Membresía",
};

export const TASK_OUTCOME_LABELS: Record<TaskOutcome, string> = {
  contactado: "Contactado",
  sin_respuesta: "Sin respuesta",
  agendo_cita: "Agendó cita",
  renovo: "Renovó",
  no_interesado: "No le interesa",
};

export const NEXT_VISIT_LABELS: Record<NextVisitState, string> = {
  vencida: "Vencida",
  proxima: "Próxima",
  programada: "Programada",
};

export const NEXT_VISIT_TONES: Record<NextVisitState, StatusTone> = {
  vencida: "danger",
  proxima: "warning",
  programada: "neutral",
};

/** Textos del CRM, idénticos en web y móvil. */
export const crmCopy = {
  customersTitle: "Clientes (CRM)",
  customersDescription: "Última visita, próxima recomendación, membresía y valor acumulado por centro.",
  tasksTitle: "Seguimientos",
  tasksDescription:
    "Cola de acciones comerciales. La plataforma no envía mensajes: registra aquí cada contacto.",
  profileTitle: "Ficha comercial",
  scope: "Centro",
  allCenters: "Todos mis centros",
  segment: "Segmento",
  allSegments: "Todos",
  nextVisit: "Próxima visita",
  anyNextVisit: "Cualquiera",
  search: "Buscar por nombre o teléfono",
  filter: "Filtrar",
  empty: "No hay clientes con estos filtros.",
  notFound: "El cliente no existe o no tienes acceso.",
  lastVisit: "Última visita",
  visits: "Visitas",
  lifetimeValue: "Valor acumulado",
  servicesValue: "Servicios entregados",
  membershipValue: "Membresías cobradas",
  membership: "Membresía",
  noMembership: "Sin membresía",
  recommendation: "Próxima recomendación",
  noRecommendation: "Sin recomendación",
  openTasks: "Seguimientos abiertos",
  consentTitle: "Consentimiento comercial",
  consentHint: "Sólo se crean seguimientos por los canales aceptados. Retirar uno cancela sus pendientes.",
  optIn: "Acepta",
  optOut: "No acepta",
  reason: "Motivo",
  saveConsent: "Guardar",
  newTask: "Nuevo seguimiento",
  taskKind: "Tipo",
  taskChannel: "Canal",
  dueOn: "Fecha",
  notes: "Nota (opcional)",
  create: "Crear seguimiento",
  created: "Seguimiento creado.",
  complete: "Registrar resultado",
  outcome: "Resultado",
  cancel: "Cancelar",
  reschedule: "Reprogramar",
  saved: "Guardado.",
  generate: "Generar pendientes",
  generated: (n: number) => (n === 0 ? "No hay pendientes nuevos." : `${n} seguimiento(s) generado(s).`),
  due: "Vencimiento",
  dueOverdue: "Vencidas",
  dueToday: "Hoy",
  dueUpcoming: "Próximas",
  allDue: "Todas",
  status: "Estado",
  tasksEmpty: "No hay seguimientos con estos filtros.",
  noConsent: "Sin consentimiento comercial: sólo acciones presenciales.",
  contactManual: "Abrir contacto (lo envías tú)",
  forbidden: "Sin permiso para esta acción.",
  openProfile: "Ficha comercial",
} as const;
