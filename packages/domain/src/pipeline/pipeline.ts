import type { BillingModel, VehicleRule } from "../b2b/b2b";
import { addMonths, daysBetween } from "../memberships/membership";
import type { Result } from "../result";
import { can, type AppRole } from "../roles";

/**
 * Comercial / Pipeline (C5): embudo básico de oportunidades B2B y de clientes
 * de alto valor (B2C premium). Reglas espejo de la migración
 * 20261006000000_pipeline.sql; schema-parity.test.ts compara las listas. El
 * historial (opportunity_events) es la única fuente de las métricas.
 */

export const OPPORTUNITY_KINDS = ["b2b", "b2c_premium"] as const;
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

/** Estado de la oportunidad = tipo de su etapa. */
export const OPPORTUNITY_STATUSES = ["abierta", "ganada", "perdida"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const OPPORTUNITY_SOURCES = [
  "referido",
  "visita",
  "llamada",
  "web",
  "evento",
  "cliente_actual",
  "otro",
] as const;
export type OpportunitySource = (typeof OPPORTUNITY_SOURCES)[number];

export const LOSS_REASONS = [
  "precio",
  "competencia",
  "sin_presupuesto",
  "sin_respuesta",
  "no_califica",
  "otro",
] as const;
export type LossReason = (typeof LOSS_REASONS)[number];

export const OPPORTUNITY_EVENT_KINDS = [
  "creada",
  "etapa",
  "valor",
  "responsable",
  "nota",
  "ganada",
  "perdida",
  "reabierta",
  "convertida",
] as const;
export type OpportunityEventKind = (typeof OPPORTUNITY_EVENT_KINDS)[number];

/** Tareas de la oportunidad (cola del CRM). */
export const OPPORTUNITY_TASK_KINDS = ["llamar", "whatsapp", "email", "reunion"] as const;
export type OpportunityTaskKind = (typeof OPPORTUNITY_TASK_KINDS)[number];

/** Etapas mínimas de cada organización (espejo de private.seed_pipeline_stages). */
export const DEFAULT_PIPELINE_STAGES = [
  { code: "prospecto", name: "Prospecto", kind: "abierta", position: 1, probability: 10 },
  { code: "contactado", name: "Contactado", kind: "abierta", position: 2, probability: 25 },
  { code: "propuesta", name: "Propuesta", kind: "abierta", position: 3, probability: 50 },
  { code: "negociacion", name: "Negociación", kind: "abierta", position: 4, probability: 75 },
  { code: "ganado", name: "Ganado", kind: "ganada", position: 90, probability: 100 },
  { code: "perdido", name: "Perdido", kind: "perdida", position: 91, probability: 0 },
] as const satisfies readonly {
  code: string;
  name: string;
  kind: OpportunityStatus;
  position: number;
  probability: number;
}[];

/** Las etapas abiertas van en las posiciones 1 a 89 (las de cierre, al final). */
export const OPEN_STAGE_POSITIONS = { min: 1, max: 89 } as const;

/** Meses del convenio si la propuesta no los indica (espejo de convert_opportunity). */
export const DEFAULT_PROPOSAL_MONTHS = 12;

/**
 * Quién escribe (espejo de private.can_write_pipeline): B2B exige además
 * b2b.write (admin y comercial B2B, que también convierten en cuenta);
 * B2C premium, pipeline.write (incluye al encargado).
 */
export function canWriteOpportunity(roles: readonly AppRole[], kind: OpportunityKind): boolean {
  if (!can(roles, "pipeline.write")) return false;
  return kind === "b2c_premium" || can(roles, "b2b.write");
}

/** Tipos de oportunidad que el usuario puede registrar. */
export const writableOpportunityKinds = (roles: readonly AppRole[]): OpportunityKind[] =>
  OPPORTUNITY_KINDS.filter((k) => canWriteOpportunity(roles, k));

/** Paquete e iguala llevan cuota e incluidos (como el convenio B2B). */
export const proposalNeedsFee = (model: BillingModel | null | undefined) =>
  model === "paquete" || model === "iguala";

/** Fin del convenio creado al ganar: inicio + meses − 1 día. */
export function proposalEndsOn(startsOn: string, months: number | null | undefined): string {
  const end = addMonths(startsOn, months ?? DEFAULT_PROPOSAL_MONTHS);
  const d = new Date(`${end}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type NextActionState = "vencida" | "hoy" | "proxima" | "sin_fecha" | "sin_accion";

/** Estado de la siguiente acción para resaltar lo pendiente en el tablero. */
export function nextActionState(
  o: { status: OpportunityStatus; nextAction: string | null; nextActionOn: string | null },
  today: string,
): NextActionState | null {
  if (o.status !== "abierta") return null;
  if (!o.nextAction) return "sin_accion";
  if (!o.nextActionOn) return "sin_fecha";
  if (o.nextActionOn < today) return "vencida";
  if (o.nextActionOn === today) return "hoy";
  return "proxima";
}

/** Valor ponderado por la probabilidad de la etapa. */
export const weightedValue = (value: number, probability: number) => Math.round(value * probability) / 100;

/** Días transcurridos desde el alta (antigüedad de una oportunidad abierta). */
export const opportunityAgeDays = (createdAt: string, today: string) =>
  Math.max(0, daysBetween(createdAt.slice(0, 10), today));

// ---------------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------------

export interface PipelineStage {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  kind: OpportunityStatus;
  position: number;
  probability: number;
  active: boolean;
}

export interface OpportunityProspect {
  companyName: string | null;
  legalName: string | null;
  rfc: string | null;
  contactName: string | null;
  contactTitle: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
}

export interface OpportunityProposal {
  billingModel: BillingModel | null;
  months: number | null;
  vehicleRule: VehicleRule | null;
  paymentTermsDays: number | null;
  creditLimit: number | null;
  feeAmount: number | null;
  includedUnits: number | null;
}

export interface Opportunity {
  id: string;
  organizationId: string;
  detailCenterId: string;
  centerName: string;
  kind: OpportunityKind;
  title: string;
  /** Empresa (cuenta o prospecto) o cliente. */
  displayName: string;
  clientId: string | null;
  b2bAccountId: string | null;
  prospect: OpportunityProspect;
  estimatedValue: number;
  stageId: string;
  stageName: string;
  stagePosition: number;
  stageProbability: number;
  status: OpportunityStatus;
  ownerId: string | null;
  ownerName: string | null;
  nextAction: string | null;
  nextActionOn: string | null;
  expectedCloseOn: string | null;
  source: OpportunitySource | null;
  proposal: OpportunityProposal;
  notes: string | null;
  closedAt: string | null;
  wonValue: number | null;
  lossReason: LossReason | null;
  lossNotes: string | null;
  convertedAccountId: string | null;
  convertedAgreementId: string | null;
  openTasks: number;
  version: number;
  createdAt: string;
  /** Hoy en la zona del centro. */
  today: string;
}

export interface OpportunityEvent {
  id: string;
  seq: number;
  kind: OpportunityEventKind;
  occurredAt: string;
  actorName: string | null;
  fromStageName: string | null;
  toStageName: string | null;
  value: number | null;
  ownerName: string | null;
  note: string | null;
}

export interface OpportunityTask {
  id: string;
  kind: OpportunityTaskKind;
  channel: string;
  status: "pendiente" | "hecha" | "cancelada";
  dueOn: string;
  notes: string | null;
  outcome: string | null;
  outcomeNotes: string | null;
  assignedTo: string | null;
  completedAt: string | null;
}

export interface PipelineOwner {
  userId: string;
  fullName: string;
}

/** Hecho por oportunidad derivado sólo de eventos (public.pipeline_metric_facts). */
export interface PipelineMetricFact {
  opportunityId: string;
  detailCenterId: string;
  kind: OpportunityKind;
  createdOn: string;
  createdValue: number;
  outcome: "ganada" | "perdida" | null;
  closedOn: string | null;
  wonValue: number | null;
  currentValue: number;
  currentStageId: string | null;
  stagesReached: string[];
  cycleDays: number | null;
}

export interface OpportunityFilter {
  status?: OpportunityStatus | null | undefined;
  kind?: OpportunityKind | undefined;
  ownerId?: string | undefined;
}

export interface CreateOpportunityCommand {
  detailCenterId: string;
  requestId: string;
  kind: OpportunityKind;
  title: string;
  estimatedValue: number;
  clientId?: string | undefined;
  b2bAccountId?: string | undefined;
  prospect?: Partial<OpportunityProspect> | undefined;
  proposal?: Partial<OpportunityProposal> | undefined;
  stageId?: string | undefined;
  ownerId?: string | undefined;
  nextAction?: string | undefined;
  nextActionOn?: string | undefined;
  expectedCloseOn?: string | undefined;
  source?: OpportunitySource | undefined;
  notes?: string | undefined;
}

export interface UpdateOpportunityCommand {
  id: string;
  version: number;
  title: string;
  estimatedValue: number;
  ownerId?: string | undefined;
  nextAction?: string | undefined;
  nextActionOn?: string | undefined;
  expectedCloseOn?: string | undefined;
  source?: OpportunitySource | undefined;
  prospect?: Partial<OpportunityProspect> | undefined;
  proposal?: Partial<OpportunityProposal> | undefined;
  notes?: string | undefined;
  reason: string;
}

export interface WinOpportunityCommand {
  id: string;
  version: number;
  wonValue?: number | undefined;
  createAgreement: boolean;
  agreementStartsOn?: string | undefined;
  note?: string | undefined;
}

export interface CreateOpportunityTaskCommand {
  opportunityId: string;
  requestId: string;
  kind: OpportunityTaskKind;
  dueOn: string;
  notes?: string | undefined;
  assignedTo?: string | undefined;
}

export interface UpsertPipelineStageCommand {
  organizationId: string;
  id?: string | undefined;
  name: string;
  position: number;
  probability: number;
  active: boolean;
  reason: string;
}

/** Puerto del módulo (adaptador Supabase en @meguiars/supabase). */
export interface PipelineRepository {
  stages(organizationId: string): Promise<Result<PipelineStage[]>>;
  list(detailCenterIds: string[], filter?: OpportunityFilter): Promise<Result<Opportunity[]>>;
  get(id: string, detailCenterIds: string[]): Promise<Result<Opportunity>>;
  timeline(id: string): Promise<Result<OpportunityEvent[]>>;
  tasks(id: string): Promise<Result<OpportunityTask[]>>;
  owners(detailCenterId: string, kind: OpportunityKind): Promise<Result<PipelineOwner[]>>;
  create(command: CreateOpportunityCommand): Promise<Result<{ id: string }>>;
  update(command: UpdateOpportunityCommand): Promise<Result<{ version: number }>>;
  move(id: string, version: number, stageId: string, note?: string): Promise<Result<{ version: number }>>;
  addNote(id: string, note: string): Promise<Result<void>>;
  win(
    command: WinOpportunityCommand,
  ): Promise<Result<{ accountId: string | null; agreementId: string | null }>>;
  lose(id: string, version: number, reason: LossReason, notes?: string): Promise<Result<{ version: number }>>;
  reopen(id: string, version: number, stageId: string, reason: string): Promise<Result<{ version: number }>>;
  createTask(command: CreateOpportunityTaskCommand): Promise<Result<{ id: string }>>;
  metricFacts(detailCenterIds: string[], from: string, to: string): Promise<Result<PipelineMetricFact[]>>;
  upsertStage(command: UpsertPipelineStageCommand): Promise<Result<{ id: string }>>;
}
