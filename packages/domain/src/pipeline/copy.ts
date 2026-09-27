import type { StatusTone } from "../agenda/copy";
import type {
  LossReason,
  NextActionState,
  OpportunityEventKind,
  OpportunityKind,
  OpportunitySource,
  OpportunityStatus,
  OpportunityTaskKind,
} from "./pipeline";

export const OPPORTUNITY_KIND_LABELS: Record<OpportunityKind, string> = {
  b2b: "B2B",
  b2c_premium: "B2C premium",
};

export const OPPORTUNITY_KIND_HINTS: Record<OpportunityKind, string> = {
  b2b: "Empresa o flotilla. Al ganarla se convierte en cuenta (y convenio) sin recapturar.",
  b2c_premium: "Cliente registrado de alto valor (cerámicos, membresías, paquetes).",
};

export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  abierta: "Abierta",
  ganada: "Ganada",
  perdida: "Perdida",
};

export const OPPORTUNITY_STATUS_TONES: Record<OpportunityStatus, StatusTone> = {
  abierta: "info",
  ganada: "success",
  perdida: "neutral",
};

export const OPPORTUNITY_SOURCE_LABELS: Record<OpportunitySource, string> = {
  referido: "Referido",
  visita: "Visita al centro",
  llamada: "Llamada",
  web: "Web o redes",
  evento: "Evento",
  cliente_actual: "Cliente actual",
  otro: "Otro",
};

export const LOSS_REASON_LABELS: Record<LossReason, string> = {
  precio: "Precio",
  competencia: "Eligió a la competencia",
  sin_presupuesto: "Sin presupuesto",
  sin_respuesta: "Dejó de responder",
  no_califica: "No califica",
  otro: "Otro",
};

export const OPPORTUNITY_EVENT_LABELS: Record<OpportunityEventKind, string> = {
  creada: "Alta",
  etapa: "Cambio de etapa",
  valor: "Cambio de valor",
  responsable: "Cambio de responsable",
  nota: "Nota",
  ganada: "Ganada",
  perdida: "Perdida",
  reabierta: "Reabierta",
  convertida: "Convertida en cuenta",
};

export const OPPORTUNITY_TASK_KIND_LABELS: Record<OpportunityTaskKind, string> = {
  llamar: "Llamar",
  whatsapp: "WhatsApp",
  email: "Email",
  reunion: "Reunión",
};

export const NEXT_ACTION_LABELS: Record<NextActionState, string> = {
  vencida: "Vencida",
  hoy: "Hoy",
  proxima: "Programada",
  sin_fecha: "Sin fecha",
  sin_accion: "Sin siguiente acción",
};

export const NEXT_ACTION_TONES: Record<NextActionState, StatusTone> = {
  vencida: "danger",
  hoy: "warning",
  proxima: "neutral",
  sin_fecha: "warning",
  sin_accion: "danger",
};

/** Textos del pipeline, idénticos en web y móvil. */
export const pipelineCopy = {
  title: "Pipeline comercial",
  description: "Oportunidades B2B y de clientes de alto valor, de prospecto a ganado.",
  newOpportunity: "Nueva oportunidad",
  empty: "Sin oportunidades abiertas. Registra la primera.",
  emptyStage: "Sin oportunidades",
  forbidden: "Sin permiso para esta acción.",
  notFound: "La oportunidad no existe o no tienes acceso.",
  // Filtros
  filterAll: "Todas",
  filterMine: "Mías",
  filterOpen: "Abiertas",
  filterWon: "Ganadas",
  filterLost: "Perdidas",
  // Formulario
  kind: "Tipo",
  titleField: "Título",
  titleHint: "Qué se busca vender, p. ej. «Flotilla de 12 camionetas».",
  estimatedValue: "Valor estimado (MXN)",
  stage: "Etapa",
  owner: "Responsable",
  unassigned: "Sin asignar",
  nextAction: "Siguiente acción",
  nextActionOn: "Fecha de la siguiente acción",
  expectedCloseOn: "Cierre esperado",
  source: "Origen",
  notes: "Notas",
  contactSection: "Contacto / cuenta",
  linkAccount: "Cuenta B2B existente",
  linkClient: "Cliente registrado",
  prospectSection: "Prospecto (si aún no es cliente)",
  companyName: "Empresa",
  legalName: "Razón social (opcional)",
  rfc: "RFC (opcional)",
  contactName: "Contacto",
  contactTitle: "Puesto (opcional)",
  contactPhone: "Teléfono",
  contactEmail: "Email",
  prospectHint: "Si la empresa ya existe (RFC, teléfono o email) se liga sola: nunca se duplica.",
  proposalSection: "Propuesta de convenio (opcional)",
  proposalHint:
    "Al ganar se crea el convenio con estos términos; las tarifas se ajustan después en la cuenta.",
  billingModel: "Modelo de cobro",
  noProposal: "Sin propuesta",
  months: "Meses de vigencia",
  vehicleRule: "Vehículos",
  paymentTermsDays: "Días de crédito",
  creditLimit: "Límite de crédito (opcional)",
  feeAmount: "Cuota",
  includedUnits: "Servicios incluidos",
  create: "Registrar oportunidad",
  created: "Oportunidad registrada.",
  save: "Guardar cambios",
  saved: "Cambios guardados.",
  reason: "Motivo del cambio",
  // Detalle
  moveTo: "Mover a",
  move: "Mover",
  moved: "Etapa actualizada.",
  stageNote: "Comentario (opcional)",
  addNote: "Agregar nota",
  note: "Nota",
  noteAdded: "Nota agregada.",
  history: "Historial",
  historyEmpty: "Sin movimientos.",
  tasks: "Tareas",
  tasksEmpty: "Sin tareas.",
  newTask: "Nueva tarea",
  taskKind: "Tipo de tarea",
  taskDueOn: "Fecha",
  taskNotes: "Detalle (opcional)",
  addTask: "Agregar tarea",
  taskAdded: "Tarea agregada.",
  completeTask: "Marcar hecha",
  taskDone: "Tarea completada.",
  win: "Ganar",
  winTitle: "Marcar como ganada",
  wonValue: "Valor ganado (MXN)",
  createAgreement: "Crear el convenio de la propuesta",
  agreementStartsOn: "Inicio del convenio",
  winB2bHint:
    "Se crea (o reutiliza) la empresa y su cuenta B2B con los datos capturados; nunca se duplica la empresa.",
  winB2cHint: "Registra el cierre con el cliente; la venta se captura en su módulo (OS o membresía).",
  won: "Oportunidad ganada.",
  lose: "Perder",
  loseTitle: "Marcar como perdida",
  lossReason: "Motivo de pérdida",
  lossNotes: "Comentario (opcional)",
  lost: "Oportunidad perdida.",
  reopen: "Reabrir",
  reopenTitle: "Reabrir oportunidad",
  reopened: "Oportunidad reabierta.",
  goToAccount: "Ver cuenta B2B",
  goToAgreement: "Ver convenio",
  goToClient: "Ver cliente",
  readOnly: "Sólo lectura: no puedes editar oportunidades de este tipo.",
  closedHint: "Oportunidad cerrada.",
  // Indicadores
  metricsTitle: "Indicadores del pipeline",
  metricsDescription: "Calculados sólo desde el historial de eventos (reproducibles).",
  metricsEmpty: "Sin oportunidades en el periodo.",
  rangeLabel: "Periodo",
  range30: "Últimos 30 días",
  range90: "Últimos 90 días",
  scopeCenter: "Centro activo",
  scopeAll: "Todos mis centros",
  funnel: "Embudo (oportunidades que alcanzaron cada etapa)",
  openByStage: "Abiertas por etapa",
  byKind: "Por tipo",
  // Etapas
  stagesTitle: "Etapas",
  stagesHint:
    "Ganado y perdido son fijas (sólo cambian de nombre). Las abiertas van en las posiciones 1 a 89.",
  newStage: "Nueva etapa",
  stageName: "Nombre",
  position: "Posición",
  probability: "Probabilidad (%)",
  active: "Activa",
  saveStage: "Guardar etapa",
  stageSaved: "Etapa guardada.",
} as const;
