import type { StatusTone } from "../agenda/copy";
import type { MembershipEventKind, MembershipStatus, PlanTier, RedeemScope } from "./membership";

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  activa: "Activa",
  proxima_a_vencer: "Próxima a vencer",
  vencida: "Vencida",
  suspendida: "Suspendida",
  cancelada: "Cancelada",
};

export const MEMBERSHIP_STATUS_TONES: Record<MembershipStatus, StatusTone> = {
  activa: "success",
  proxima_a_vencer: "warning",
  vencida: "danger",
  suspendida: "neutral",
  cancelada: "neutral",
};

export const PLAN_TIER_LABELS: Record<PlanTier, string> = {
  care: "CARE",
  plus: "PLUS",
  premium: "PREMIUM",
};

export const PERIOD_LABELS: Record<number, string> = {
  1: "Mensual",
  3: "Trimestral",
  6: "Semestral",
  12: "Anual",
};

export const PERIOD_UNIT_LABELS: Record<number, string> = {
  1: "mes",
  3: "trimestre",
  6: "semestre",
  12: "año",
};

export const REDEEM_SCOPE_LABELS: Record<RedeemScope, string> = {
  centro_origen: "Sólo en el centro de origen",
  cualquier_centro: "En cualquier centro",
};

export const MEMBERSHIP_EVENT_LABELS: Record<MembershipEventKind, string> = {
  alta: "Alta",
  renovacion: "Renovación",
  suspension: "Suspensión",
  reactivacion: "Reactivación",
  cancelacion: "Cancelación",
  redencion: "Redención",
  redencion_anulada: "Redención anulada",
};

/** Textos de membresías, idénticos en web y móvil. */
export const membershipsCopy = {
  title: "Membresías",
  description: "Planes de cuidado continuo: altas, saldo por periodo, renovaciones y cancelaciones.",
  newMembership: "Nueva membresía",
  newTitle: "Nueva membresía",
  newDescription:
    "Elige cliente, vehículo y plan. El precio y los beneficios quedan congelados al contratar.",
  search: "Buscar por número, cliente o placa",
  statusFilter: "Estado",
  allStatuses: "Todos",
  empty: "No hay membresías con estos filtros.",
  notFound: "La membresía no existe o no tienes acceso.",
  number: "Número",
  plan: "Plan",
  client: "Cliente",
  vehicle: "Vehículo",
  price: "Precio",
  endsOn: "Vence",
  nextRenewal: "Próxima renovación",
  startsOn: "Inicio",
  paymentReference: "Referencia de pago (opcional)",
  paymentHint: "Cobro manual: registra la referencia del pago del periodo.",
  create: "Contratar membresía",
  created: "Membresía contratada.",
  balanceTitle: "Saldo del periodo",
  balanceEmpty: "Sin servicios incluidos.",
  used: "Usados",
  remaining: "Disponibles",
  period: "Periodo",
  redemptionsTitle: "Redenciones",
  redemptionsEmpty: "Aún no hay redenciones.",
  historyTitle: "Historial de la membresía",
  actionsTitle: "Acciones",
  renew: "Renovar",
  renewHint: "Se renueva a partir del aviso previo al vencimiento o ya vencida.",
  renewChangePlan: "Plan al renovar",
  samePlan: "Mismo plan",
  renewed: "Membresía renovada.",
  suspend: "Suspender",
  reactivate: "Reactivar",
  cancel: "Cancelar membresía",
  reason: "Motivo",
  saved: "Guardado.",
  forbidden: "Sin permiso para esta acción.",
  noVehicles: "El cliente no tiene vehículos activos.",
  // Planes
  plansTitle: "Planes de membresía",
  plansDescription:
    "Catálogo CARE / PLUS / PREMIUM de la organización. Cambiar un plan no altera membresías vendidas.",
  plansOpen: "Planes",
  newPlan: "Nuevo plan",
  planCode: "Clave",
  planTier: "Nivel",
  planName: "Nombre",
  planDescription: "Descripción",
  planPrice: "Precio por periodo",
  planPeriod: "Periodicidad",
  planScope: "Dónde se redime",
  planRestrictions: "Restricciones",
  planNotice: "Días de aviso antes de vencer",
  planAvailableFrom: "Disponible desde",
  planAvailableUntil: "Disponible hasta (opcional)",
  planActive: "Disponible para venta",
  planSave: "Guardar plan",
  planCreated: "Plan creado.",
  planInactive: "No disponible",
  benefitsTitle: "Servicios incluidos por periodo",
  benefitsHint: "Unidades de cada servicio que el miembro puede redimir en cada periodo.",
  benefitService: "Servicio",
  benefitQuantity: "Unidades por periodo",
  benefitSave: "Guardar servicio",
  benefitRemove: "Quitar",
  // OS
  orderCardTitle: "Membresía",
  orderNoMembership: "El vehículo no tiene membresía.",
  redeem: "Redimir",
  redeemQuantity: "Unidades",
  redeemed: "Beneficio redimido.",
  voidRedemption: "Anular redención",
  voidReason: "Motivo de la anulación",
  notRedeemable: "La membresía no permite redimir en este momento.",
  // KPIs
  kpisTitle: "Indicadores de membresías",
  kpisRange: "Últimos 30 días",
  scopeCenter: "Centro activo",
  scopeAll: "Todos mis centros",
} as const;
