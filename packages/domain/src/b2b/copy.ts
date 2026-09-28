import type { StatusTone } from "../agenda/copy";
import type {
  AgreementState,
  AgreementStatus,
  B2bAccountStatus,
  B2bPaymentMethod,
  BillingModel,
  PriceRuleKind,
  VehicleRule,
} from "./b2b";

export const B2B_ACCOUNT_STATUS_LABELS: Record<B2bAccountStatus, string> = {
  activa: "Activa",
  suspendida: "Suspendida",
  baja: "Baja",
};

export const B2B_ACCOUNT_STATUS_TONES: Record<B2bAccountStatus, StatusTone> = {
  activa: "success",
  suspendida: "warning",
  baja: "neutral",
};

export const BILLING_MODEL_LABELS: Record<BillingModel, string> = {
  por_vehiculo: "Tarifa por vehículo",
  volumen_mensual: "Volumen mensual",
  paquete: "Paquete",
  iguala: "Iguala mensual",
};

export const BILLING_MODEL_HINTS: Record<BillingModel, string> = {
  por_vehiculo: "Cada servicio a la tarifa convenida (precio fijo o % sobre lista).",
  volumen_mensual: "Tarifas escalonadas según el número de OS de la cuenta en el mes.",
  paquete: "Cuota única con N servicios incluidos durante la vigencia; el excedente a tarifa.",
  iguala: "Cuota mensual con N servicios incluidos por mes; el excedente a tarifa.",
};

export const AGREEMENT_STATUS_LABELS: Record<AgreementStatus, string> = {
  activo: "Activo",
  suspendido: "Suspendido",
  cancelado: "Cancelado",
};

export const AGREEMENT_STATE_LABELS: Record<AgreementState, string> = {
  programado: "Programado",
  vigente: "Vigente",
  vencido: "Vencido",
  suspendido: "Suspendido",
  cancelado: "Cancelado",
};

export const AGREEMENT_STATE_TONES: Record<AgreementState, StatusTone> = {
  programado: "info",
  vigente: "success",
  vencido: "danger",
  suspendido: "warning",
  cancelado: "neutral",
};

export const VEHICLE_RULE_LABELS: Record<VehicleRule, string> = {
  lista: "Sólo vehículos autorizados",
  cualquiera: "Cualquier vehículo de la flotilla",
};

export const PRICE_RULE_KIND_LABELS: Record<PriceRuleKind, string> = {
  precio_fijo: "Precio fijo",
  descuento_pct: "% de descuento sobre lista",
  incluido: "Incluido en la cuota",
};

export const B2B_PAYMENT_METHOD_LABELS: Record<B2bPaymentMethod, string> = {
  transferencia: "Transferencia",
  cheque: "Cheque",
  tarjeta: "Tarjeta",
  efectivo: "Efectivo",
  otro: "Otro",
};

/** Textos del módulo B2B, idénticos en web y móvil. */
export const b2bCopy = {
  title: "Cuentas B2B",
  description:
    "Empresas con convenio: tarifas, vehículos autorizados, consumo y saldo por facturar o cobrar.",
  newAccount: "Nueva cuenta",
  newAccountDescription: "Liga la cuenta a un cliente empresa (su flotilla está en Clientes y vehículos).",
  search: "Buscar por nombre o RFC",
  statusFilter: "Estatus",
  allStatuses: "Todos",
  empty: "No hay cuentas B2B con estos filtros.",
  notFound: "La cuenta no existe o no tienes acceso.",
  forbidden: "Sin permiso para esta acción.",
  saved: "Guardado.",
  reason: "Motivo del cambio",
  // Cuenta
  accountData: "Datos de la cuenta",
  client: "Cliente empresa",
  chooseClient: "Elige la empresa",
  noCompanies: "No hay clientes de tipo empresa sin cuenta. Da de alta la empresa en Clientes y vehículos.",
  name: "Nombre comercial",
  legalName: "Razón social (opcional)",
  rfc: "RFC (opcional)",
  taxRegime: "Régimen fiscal (clave SAT, opcional)",
  fiscalZip: "CP fiscal (opcional)",
  billingEmail: "Email de facturación (opcional)",
  homeCenter: "Centro gestor",
  status: "Estatus",
  notes: "Notas (opcional)",
  saveAccount: "Guardar cuenta",
  createAccount: "Crear cuenta",
  created: "Cuenta creada.",
  // Contactos
  contactsTitle: "Contactos",
  contactsEmpty: "Sin contactos.",
  contactName: "Nombre",
  contactTitle: "Puesto (opcional)",
  contactPhone: "Teléfono (opcional)",
  contactEmail: "Email (opcional)",
  contactPrimary: "Contacto principal",
  addContact: "Agregar contacto",
  // Convenios
  agreementsTitle: "Convenios",
  agreementsEmpty: "Sin convenios. Crea uno para operar la cuenta.",
  newAgreement: "Nuevo convenio",
  agreementName: "Nombre del convenio",
  billingModel: "Modelo de cobro",
  startsOn: "Inicio de vigencia",
  endsOn: "Fin de vigencia",
  agreementStatus: "Estado",
  vehicleRule: "Vehículos",
  paymentTerms: "Condición de pago (días)",
  creditLimit: "Límite de crédito (opcional)",
  feeAmount: "Cuota",
  includedUnits: "Servicios incluidos",
  centers: "Centros habilitados",
  saveAgreement: "Guardar convenio",
  agreementExpiredHint: "Un convenio vencido, suspendido o cancelado no se aplica a nuevas OS ni líneas.",
  // Tarifas
  rulesTitle: "Tarifas del convenio",
  rulesEmpty: "Sin tarifas: las OS se cobran a precio de lista.",
  rulesHint:
    "La base aplica la tarifa al agregar cada línea: regla del servicio antes que la general; incluido mientras queden unidades; el escalón de volumen más alto alcanzado.",
  ruleService: "Servicio",
  allServices: "Todos los servicios",
  ruleKind: "Tipo",
  ruleValue: "Precio o %",
  ruleMinVolume: "Desde N OS en el mes",
  ruleActive: "Activa",
  addRule: "Agregar tarifa",
  deactivate: "Desactivar",
  activate: "Activar",
  pricePreview: "Precio convenido",
  // Vehículos
  vehiclesTitle: "Vehículos",
  vehiclesEmpty: "La empresa no tiene vehículos. Agrégalos en Clientes y vehículos.",
  authorize: "Autorizar",
  revoke: "Retirar",
  costCenter: "Centro de costos (opcional)",
  driver: "Conductor (opcional)",
  authorized: "Autorizado",
  notAuthorized: "No autorizado",
  // Estado de cuenta
  statementTitle: "Estado de cuenta",
  consumption: "Consumo acumulado",
  toInvoice: "Por facturar",
  receivable: "Por cobrar",
  overdue: "Vencido",
  openOrders: "OS en curso",
  creditAvailable: "Crédito disponible",
  noCreditLimit: "Sin límite",
  ordersTitle: "Órdenes de servicio de la cuenta",
  ordersEmpty: "Sin OS en el periodo.",
  evidences: "Evidencias",
  purchaseOrder: "Orden de compra",
  // Facturación y cobro: módulo de cuentas por cobrar (receivablesCopy).
  // OS
  orderCardTitle: "Cuenta B2B",
  orderAccount: "Cuenta",
  orderAgreement: "Convenio",
  chooseAccount: "Elige la cuenta B2B",
  noAccounts: "No hay cuentas con convenio vigente en este centro.",
  applyAccount: "Aplicar convenio",
  applyHint: "La OS abierta pasa a canal B2B y sus líneas toman la tarifa convenida.",
  convenio: "Tarifa del convenio",
  listPrice: "Precio de lista",
  b2bMode: "A cuenta B2B",
  // Rentabilidad
  profitabilityTitle: "Rentabilidad B2B",
  profitabilityDescription: "Ingreso (OS terminadas y cuotas) menos costo directo, por cuenta y centro.",
  profitabilityEmpty: "Sin actividad B2B en el periodo.",
  scopeCenter: "Centro activo",
  scopeAll: "Todos mis centros",
  range: "Últimos 30 días",
} as const;
