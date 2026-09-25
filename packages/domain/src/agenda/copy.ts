import type { AppointmentStatus } from "./agenda";

/** Tonos del design system (mismo conjunto que TONES de @meguiars/ui-tokens). */
export type StatusTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  programada: "Programada",
  recibida: "Recibida",
  en_servicio: "En servicio",
  terminada: "Terminada",
  entregada: "Entregada",
  cancelada: "Cancelada",
  no_show: "No se presentó",
};

/** Tono del badge por estatus (mismo en web y móvil). */
export const APPOINTMENT_STATUS_TONES: Record<AppointmentStatus, StatusTone> = {
  programada: "info",
  recibida: "brand",
  en_servicio: "warning",
  terminada: "success",
  entregada: "neutral",
  cancelada: "danger",
  no_show: "danger",
};

/** Etiqueta de la acción que lleva a cada estatus. */
export const STATUS_ACTION_LABELS: Record<AppointmentStatus, string> = {
  programada: "Programar",
  recibida: "Recibir",
  en_servicio: "Iniciar servicio",
  terminada: "Terminar",
  entregada: "Entregar",
  cancelada: "Cancelar",
  no_show: "No se presentó",
};

/** Textos de la agenda, idénticos en web y móvil. */
export const agendaCopy = {
  title: "Agenda",
  description: "Citas y walk-ins del día en el centro activo, por bahía y técnico.",
  day: "Día",
  today: "Hoy",
  previousDay: "Día anterior",
  nextDay: "Día siguiente",
  statusFilter: "Estatus",
  bayFilter: "Bahía",
  technicianFilter: "Técnico",
  all: "Todos",
  filter: "Filtrar",
  empty: "No hay citas con estos filtros.",
  newAppointment: "Nueva cita",
  walkIn: "Walk-in",
  newTitle: "Nueva cita",
  walkInTitle: "Walk-in (sin cita)",
  newDescription: "Elige al cliente y su vehículo; los servicios salen del catálogo del centro.",
  clientSearch: "Buscar cliente por nombre, teléfono o placa",
  choose: "Elegir",
  changeClient: "Cambiar cliente",
  noClient: "¿No existe? Regístralo en Clientes y vehículos.",
  vehicleLabel: "Vehículo",
  servicesLabel: "Servicios",
  dateLabel: "Fecha",
  timeLabel: "Hora (del centro)",
  durationLabel: "Duración estimada (minutos)",
  durationHint: "Vacío: suma de las duraciones estándar de los servicios.",
  bayLabel: "Bahía (opcional)",
  technicianLabel: "Técnico (opcional)",
  none: "Sin asignar",
  notesLabel: "Notas (opcional)",
  overrideLabel: "Motivo para encimar (encargado/admin)",
  overrideHint: "La bahía o el técnico ya están ocupados. Sólo continúa con un motivo autorizado.",
  submitCreate: "Agendar",
  submitWalkIn: "Registrar walk-in",
  created: "Cita registrada.",
  conflict: "La bahía o el técnico ya están ocupados en ese horario.",
  detailTitle: "Cita",
  actionsTitle: "Estatus",
  reasonLabel: "Motivo",
  reasonHint: "Obligatorio para cancelar o marcar que no se presentó.",
  rescheduleTitle: "Reprogramar o reasignar",
  submitReschedule: "Guardar cambios",
  saved: "Cambios guardados.",
  draftTitle: "Recepción: borrador de Orden de Servicio",
  draftSubtitle:
    "Cliente, vehículo y servicios de la cita con el precio vigente del centro. La OS los congelará al crearse.",
  notFound: "La cita no existe o es de otro centro.",
  resourcesTitle: "Bahías y técnicos",
  bays: "Bahías",
  technicians: "Técnicos",
  addBay: "Agregar bahía",
  addTechnician: "Agregar técnico",
  resourceName: "Nombre",
  deactivate: "Desactivar",
  activate: "Activar",
  inactive: "Inactiva",
  overrideBadge: "Encimada (autorizado)",
  walkInBadge: "Walk-in",
} as const;
