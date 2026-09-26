import type { StatusTone } from "../agenda/copy";
import type { RejectionReason, RuleStage, RuleState, TargetKind } from "./upsell";

export const RULE_STAGE_LABELS: Record<RuleStage, string> = {
  diagnostico: "Diagnóstico",
  cierre: "Cierre",
  ambos: "Diagnóstico y cierre",
};

export const RULE_STATE_LABELS: Record<RuleState, string> = {
  vigente: "Vigente",
  programada: "Programada",
  vencida: "Vencida",
  inactiva: "Inactiva",
};

export const RULE_STATE_TONES: Record<RuleState, StatusTone> = {
  vigente: "success",
  programada: "info",
  vencida: "danger",
  inactiva: "neutral",
};

export const REJECTION_REASON_LABELS: Record<RejectionReason, string> = {
  precio: "Precio",
  tiempo: "No tiene tiempo",
  no_interesa: "No le interesa",
  ya_lo_tiene: "Ya lo tiene",
  otro: "Otro",
};

export const TARGET_KIND_LABELS: Record<TargetKind, string> = {
  servicio: "Servicio o producto",
  membresia: "Membresía",
};

/** Textos de recomendaciones, idénticos en web y móvil. */
export const upsellCopy = {
  title: "Recomendaciones de venta",
  description:
    "Reglas simples y explicables para sugerir servicios, productos y membresías, y su conversión.",
  cardTitle: "Sugerencias",
  cardHint: "Opcional: ofrécelas si aplican. Aceptar agrega la línea con su precio vigente.",
  accept: "Sí, agregar",
  acceptMembership: "Vender membresía",
  reject: "No, gracias",
  rejectReason: "Motivo (opcional)",
  because: "Porque la OS incluye",
  acceptance: "aceptación",
  added: "Agregado a la OS.",
  dismissed: "Sugerencia descartada.",
  // Reglas
  rulesTitle: "Reglas",
  rulesEmpty: "Sin reglas. Crea la primera para empezar a sugerir.",
  newRule: "Nueva regla",
  editRule: "Editar regla",
  name: "Nombre",
  source: "Servicio origen",
  anySource: "Cualquier OS",
  targetKind: "Sugerir",
  targetService: "Servicio o producto sugerido",
  targetPlan: "Plan de membresía sugerido",
  stage: "Etapa",
  priority: "Prioridad (1–100)",
  pitch: "Argumento para el cliente",
  pitchHint: "Explica en una frase por qué conviene (se muestra tal cual).",
  channels: "Canales",
  centers: "Centros (vacío = todos)",
  minOrderTotal: "Total mínimo de la OS (opcional)",
  startsOn: "Vigente desde",
  endsOn: "Vigente hasta (opcional)",
  active: "Activa",
  reason: "Motivo del cambio",
  save: "Guardar regla",
  saved: "Regla guardada.",
  forbidden: "Sin permiso para esta acción.",
  // Indicadores
  metricsTitle: "Conversión",
  metricsRange: "Últimos 30 días",
  metricsEmpty: "Aún no hay sugerencias ofrecidas en el periodo.",
  scopeCenter: "Centro activo",
  scopeAll: "Todos mis centros",
} as const;
