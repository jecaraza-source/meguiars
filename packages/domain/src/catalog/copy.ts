import type { RevenueEngine } from "./catalog";

export const REVENUE_ENGINE_LABELS: Record<RevenueEngine, string> = {
  recurrente: "Recurrente",
  valor_medio: "Valor medio",
  premium: "Premium",
  producto_complemento: "Producto / complemento",
  membresia: "Membresía",
};

/** Textos del catálogo, idénticos en web y móvil. */
export const catalogCopy = {
  title: "Catálogo de servicios",
  description:
    "Qué se vende, cuánto cuesta, cuánto dura y a qué motor de ingreso pertenece, en el centro activo.",
  engineFilter: "Motor de ingreso",
  allEngines: "Todos los motores",
  includeInactive: "Mostrar inactivos y no disponibles",
  filter: "Filtrar",
  empty: "No hay servicios con este filtro.",
  newService: "Nuevo servicio",
  newTitle: "Nuevo servicio homologado",
  newDescription: "Se agrega al catálogo de toda la organización y queda disponible en todos los centros.",
  codeLabel: "Clave",
  codeHint: "2 a 20 caracteres: mayúsculas, dígitos o guion (p. ej. LAV-EXP). No se puede cambiar.",
  nameLabel: "Nombre",
  descriptionLabel: "Descripción (opcional)",
  engineLabel: "Motor de ingreso",
  durationLabel: "Duración estándar (minutos)",
  priceLabel: "Precio base (MXN, IVA incluido)",
  costLabel: "Costo directo estándar (MXN)",
  reasonLabel: "Motivo del cambio",
  activeLabel: "Activo (se puede vender)",
  submitCreate: "Agregar al catálogo",
  submitUpdate: "Guardar cambios",
  created: "Servicio agregado al catálogo.",
  saved: "Cambios guardados.",
  editTitle: "Datos homologados",
  editSubtitle:
    "Aplican a toda la organización. Cada cambio de precio o costo queda en el historial con su motivo.",
  centerTitle: "Configuración de este centro",
  centerSubtitle:
    "Disponibilidad y, si aplica, precio o costo propios del centro. Vacío = usa el valor base.",
  availableLabel: "Disponible en este centro",
  priceOverrideLabel: "Precio en este centro (opcional)",
  costOverrideLabel: "Costo en este centro (opcional)",
  submitCenter: "Guardar configuración del centro",
  historyTitle: "Historial de precio y costo",
  historyEmpty: "Sin cambios registrados.",
  historyBase: "Base (organización)",
  backToBase: "Vuelve al valor base",
  notFound: "El servicio no existe o no pertenece a tu organización.",
  deactivateHint:
    "Los servicios no se borran: desactívalos para dejar de venderlos y conservar su historial.",
  inactive: "Inactivo",
  unavailable: "No disponible en este centro",
  centerPrice: "Precio del centro",
  basePrice: "Precio base",
  codeTaken: "Ya existe un servicio con esa clave en la organización.",
  forbidden: "Tu rol no permite cambiar el catálogo.",
} as const;
