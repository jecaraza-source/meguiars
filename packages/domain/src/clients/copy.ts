import type { ClientHistoryKind, ClientKind, DuplicateField, MarketingChannel, SearchMatch } from "./client";

/** Textos de clientes y vehículos, idénticos en web y móvil. */
export const clientsCopy = {
  title: "Clientes y vehículos",
  description: "Expediente de cada cliente con sus vehículos, centro habitual, última visita e historial.",
  searchLabel: "Buscar por nombre, teléfono o placa",
  searchHint: "Escribe al menos 2 caracteres. Para teléfonos bastan los últimos 4 dígitos.",
  searchSubmit: "Buscar",
  searchEmptyTitle: "Sin resultados",
  searchEmptyMessage:
    "No hay clientes visibles con ese dato. Revisa la placa o el teléfono, o registra al cliente.",
  searchPromptTitle: "Busca un cliente",
  searchPromptMessage: "Por placa o teléfono es lo más rápido. Los clientes de este centro aparecen primero.",
  newClient: "Nuevo cliente",
  newTitle: "Nuevo cliente",
  newDescription: "Registra al cliente y su vehículo. Si ya existe en la organización, te avisaremos.",
  fullNameLabel: "Nombre completo o razón social",
  phoneLabel: "Teléfono",
  phoneHint: "10 dígitos (México) o formato internacional con +.",
  emailLabel: "Email (opcional)",
  kindLabel: "Tipo de cliente",
  notesLabel: "Notas (opcional)",
  homeCenterLabel: "Centro habitual",
  consentLabel: "Acepta recibir promociones por",
  consentHint: "Sólo con autorización expresa del cliente. Puede retirarla en cualquier momento.",
  vehicleTitle: "Vehículo",
  vehiclesTitle: "Vehículos",
  makeLabel: "Marca",
  modelLabel: "Modelo",
  yearLabel: "Año",
  plateLabel: "Placa",
  identifierLabel: "Identificador (opcional)",
  identifierHint: "VIN o número económico de flotilla.",
  vehicleNotesLabel: "Notas del vehículo (opcional)",
  addVehicle: "Agregar vehículo",
  deactivateVehicle: "Dar de baja",
  vehicleInactive: "Dado de baja",
  noVehicles: "Sin vehículos registrados.",
  submitCreate: "Registrar cliente",
  submitUpdate: "Guardar cambios",
  editTitle: "Editar datos del cliente",
  editSubtitle: "Los cambios quedan en la bitácora de auditoría con su motivo.",
  reasonLabel: "Motivo del cambio",
  created: "Cliente registrado.",
  saved: "Cambios guardados.",
  vehicleAdded: "Vehículo agregado.",
  vehicleUpdated: "Vehículo actualizado.",
  linked: "Cliente vinculado a este centro.",
  duplicateTitle: "Posible cliente duplicado",
  duplicateMessage:
    "Ya existe un cliente con estos datos en la organización. Usa el existente o confirma que es otro cliente.",
  useExisting: "Usar este cliente",
  linkExisting: "Vincular a este centro",
  linkReasonDefault: "Cliente existente atendido en este centro",
  createAnyway: "Es otro cliente: registrar de todos modos",
  duplicateReasonLabel: "¿Por qué es un cliente distinto?",
  duplicateReasonHint: "Por ejemplo: familiares que comparten teléfono.",
  editDuplicateConfirm: "El teléfono o email ya pertenece a otro cliente. Confirma que es correcto.",
  plateTaken: "Esa placa (o identificador) ya está registrada en otro vehículo activo de la organización.",
  detailTitle: "Expediente del cliente",
  lastVisitLabel: "Última visita",
  noVisits: "Sin visitas registradas",
  centersLabel: "Centros donde se ha atendido",
  historyTitle: "Historial",
  historyEmpty: "Sin movimientos visibles desde tus centros.",
  historyNote: "Las órdenes de servicio aparecerán aquí cuando exista el módulo de Operación.",
  notFound: "El cliente no existe o no tienes acceso desde tus centros.",
  consentYes: "Sí",
  consentNo: "No",
} as const;

export const CLIENT_KIND_LABELS: Record<ClientKind, string> = {
  person: "Persona",
  company: "Empresa / flotilla",
};

export const MARKETING_CHANNEL_LABELS: Record<MarketingChannel, string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "Email",
};

export const DUPLICATE_FIELD_LABELS: Record<DuplicateField, string> = {
  phone: "teléfono",
  email: "email",
  plate: "placa",
  identifier: "identificador",
};

export const SEARCH_MATCH_LABELS: Record<SearchMatch, string> = {
  plate: "Placa",
  phone: "Teléfono",
  email: "Email",
  name: "Nombre",
};

export const HISTORY_KIND_LABELS: Record<ClientHistoryKind, string> = {
  client_created: "Alta",
  vehicle_added: "Vehículo",
  center_linked: "Centro",
  visit: "Visita",
  service_order: "Orden de servicio",
};
