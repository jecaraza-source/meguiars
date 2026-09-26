import type { SalesChannel, ServiceOrderStatus } from "../orders/order";
import type { Result } from "../result";

/**
 * Comercial / Recomendaciones de venta (C4): reglas simples y explicables
 * (origen -> sugerido, prioridad, elegibilidad y vigencia), sin aprendizaje
 * automático. La base rankea y registra las ofertas (upsell_suggestions); aquí
 * viven los espejos de sus reglas para la UI y las pruebas de paridad.
 */

/** Etapa de la OS en la que se sugiere. */
export const UPSELL_STAGES = ["diagnostico", "cierre"] as const;
export type UpsellStage = (typeof UPSELL_STAGES)[number];

/** Etapa configurada en la regla ("ambos" = diagnóstico y cierre). */
export const RULE_STAGES = ["diagnostico", "cierre", "ambos"] as const;
export type RuleStage = (typeof RULE_STAGES)[number];

export const OFFER_STATUSES = ["ofrecida", "aceptada", "rechazada"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const REJECTION_REASONS = ["precio", "tiempo", "no_interesa", "ya_lo_tiene", "otro"] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export const TARGET_KINDS = ["servicio", "membresia"] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

/** Estado mostrado de una regla. */
export const RULE_STATES = ["vigente", "programada", "vencida", "inactiva"] as const;
export type RuleState = (typeof RULE_STATES)[number];

/** Etapa de la OS (espejo de private.upsell_stage); null = sin sugerencias. */
export function upsellStage(status: ServiceOrderStatus): UpsellStage | null {
  if (status === "abierta" || status === "autorizada") return "diagnostico";
  if (status === "en_proceso" || status === "pausada" || status === "terminada") return "cierre";
  return null;
}

/** Sólo se agregan líneas antes de terminar la OS (las sugerencias de servicio). */
export const upsellAddsLines = (status: ServiceOrderStatus) =>
  status === "abierta" || status === "autorizada" || status === "en_proceso" || status === "pausada";

/** Tasa de aceptación suavizada para el ranking (espejo de private.upsell_score). */
export function acceptanceScore(accepted: number, offered: number): number {
  return Math.round(((accepted + 1) / (offered + 2)) * 10_000) / 10_000;
}

/** Estado de una regla hoy: inactiva manda; fuera de fechas, programada o vencida. */
export function ruleState(
  r: { active: boolean; startsOn: string; endsOn: string | null },
  today: string,
): RuleState {
  if (!r.active) return "inactiva";
  if (today < r.startsOn) return "programada";
  if (r.endsOn !== null && today > r.endsOn) return "vencida";
  return "vigente";
}

// ---------------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------------

export interface UpsellRule {
  id: string;
  organizationId: string;
  name: string;
  sourceServiceId: string | null;
  sourceServiceName: string | null;
  targetServiceId: string | null;
  targetPlanId: string | null;
  targetName: string;
  stage: RuleStage;
  priority: number;
  pitch: string;
  channels: SalesChannel[];
  centerIds: string[] | null;
  minOrderTotal: number | null;
  startsOn: string;
  endsOn: string | null;
  active: boolean;
}

export interface UpsellSuggestion {
  offerId: string;
  ruleId: string;
  stage: UpsellStage;
  ruleName: string;
  pitch: string;
  sourceServiceName: string | null;
  targetKind: TargetKind;
  targetServiceId: string | null;
  targetPlanId: string | null;
  targetName: string;
  price: number;
  priority: number;
  acceptanceRate: number;
  offeredCount: number;
}

/** Hecho de conversión por regla y centro (sin datos personales). */
export interface UpsellMetricFact {
  ruleId: string;
  ruleName: string;
  detailCenterId: string;
  targetKind: TargetKind;
  offered: number;
  accepted: number;
  rejected: number;
  orders: number;
  incrementalRevenue: number;
  membershipValue: number;
}

export interface UpsertUpsellRuleCommand {
  organizationId: string;
  id?: string | undefined;
  name: string;
  sourceServiceId?: string | undefined;
  targetServiceId?: string | undefined;
  targetPlanId?: string | undefined;
  stage: RuleStage;
  priority: number;
  pitch: string;
  channels: SalesChannel[];
  centerIds?: string[] | undefined;
  minOrderTotal?: number | undefined;
  startsOn: string;
  endsOn?: string | undefined;
  active: boolean;
  reason: string;
}

/** Puerto del módulo (adaptador Supabase en @meguiars/supabase). */
export interface UpsellRepository {
  listRules(organizationId: string): Promise<Result<UpsellRule[]>>;
  upsertRule(command: UpsertUpsellRuleCommand): Promise<Result<{ id: string }>>;
  /** Sugerencias de la OS (registra las mostradas). Un error nunca debe bloquear la OS. */
  suggestions(orderId: string, limit?: number): Promise<Result<UpsellSuggestion[]>>;
  accept(orderId: string, version: number, ruleId: string): Promise<Result<{ version: number }>>;
  reject(orderId: string, ruleId: string, reason?: RejectionReason): Promise<Result<void>>;
  metricFacts(detailCenterIds: string[], from: string, to: string): Promise<Result<UpsellMetricFact[]>>;
}
