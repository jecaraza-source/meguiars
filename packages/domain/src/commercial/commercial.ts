import type { Result } from "../result";
import { nextActionState, type NextActionState } from "../pipeline/pipeline";
import type { DiscountLevel } from "../orders/order";

/**
 * Comercial CR2 (fase 1): recorrido consulta → prospecto → cotización →
 * reserva → servicio realizado. Reglas espejo de la migración
 * 20261023000000_commercial_leads_quotes.sql; schema-parity.test.ts compara
 * las listas. El historial (lead_events) es la única fuente de las métricas.
 */

/** Canal de origen del prospecto. */
export const LEAD_SOURCES = [
  "instagram",
  "facebook",
  "whatsapp",
  "google",
  "recomendacion",
  "sitio_web",
  "otro",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/** Estado del prospecto = tipo de su etapa. */
export const LEAD_STATUSES = ["abierta", "ganada", "perdida"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Hitos que mueven al prospecto solo (nunca hacia atrás). */
export const LEAD_MILESTONES = ["contactado", "cotizado", "reservado"] as const;
export type LeadMilestone = (typeof LEAD_MILESTONES)[number];

export const LEAD_LOSS_REASONS = [
  "precio",
  "sin_respuesta",
  "competencia",
  "sin_disponibilidad",
  "fuera_de_zona",
  "no_califica",
  "otro",
] as const;
export type LeadLossReason = (typeof LEAD_LOSS_REASONS)[number];

export const LEAD_EVENT_KINDS = [
  "creado",
  "etapa",
  "responsable",
  "nota",
  "contacto",
  "cotizacion",
  "reserva",
  "ganado",
  "perdido",
  "reabierto",
  "cliente",
  "fusion",
] as const;
export type LeadEventKind = (typeof LEAD_EVENT_KINDS)[number];

/** Canal del contacto registrado con el prospecto. */
export const LEAD_CONTACT_CHANNELS = ["llamada", "whatsapp", "sms", "email", "presencial", "redes"] as const;
export type LeadContactChannel = (typeof LEAD_CONTACT_CHANNELS)[number];

/** Canales por los que el prospecto aceptó promociones (lo operativo no lo requiere). */
export const LEAD_CONSENT_CHANNELS = ["llamada", "whatsapp", "sms", "email"] as const;
export type LeadConsentChannel = (typeof LEAD_CONSENT_CHANNELS)[number];

export const LEAD_TASK_KINDS = ["llamar", "whatsapp", "email", "reunion"] as const;
export type LeadTaskKind = (typeof LEAD_TASK_KINDS)[number];

/** Embudo inicial de cada organización (espejo de private.seed_lead_stages). */
export const DEFAULT_LEAD_STAGES = [
  { code: "nuevo", name: "Nuevo", kind: "abierta", milestone: null, position: 1 },
  { code: "contactado", name: "Contactado", kind: "abierta", milestone: "contactado", position: 2 },
  { code: "cotizado", name: "Cotizado", kind: "abierta", milestone: "cotizado", position: 3 },
  { code: "pendiente_reserva", name: "Pendiente de reserva", kind: "abierta", milestone: null, position: 4 },
  { code: "reservado", name: "Reservado", kind: "abierta", milestone: "reservado", position: 5 },
  { code: "ganado", name: "Ganado", kind: "ganada", milestone: null, position: 90 },
  { code: "perdido", name: "Perdido", kind: "perdida", milestone: null, position: 91 },
] as const satisfies readonly {
  code: string;
  name: string;
  kind: LeadStatus;
  milestone: LeadMilestone | null;
  position: number;
}[];

export const QUOTE_STATUSES = [
  "borrador",
  "enviada",
  "aceptada",
  "rechazada",
  "cancelada",
  "convertida",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
/** Estado que ve la persona: una cotización sin decidir y con la vigencia pasada está vencida. */
export type QuoteDisplayStatus = QuoteStatus | "vencida";

/** Vigencia (espejo de private.quote_rule). */
export const QUOTE_RULES = { validDays: 15, maxValidDays: 90 } as const;

// ---------------------------------------------------------------------------
// Reglas
// ---------------------------------------------------------------------------

/** Estado que se muestra (vencida si no se decidió y pasó la vigencia). */
export const quoteDisplayStatus = (q: { status: QuoteStatus; expired: boolean }): QuoteDisplayStatus =>
  q.expired ? "vencida" : q.status;

/** ¿Se puede editar (líneas, descuentos)? Espejo de private.check_quote_editable. */
export const quoteEditable = (q: { status: QuoteStatus; expired: boolean }) =>
  (q.status === "borrador" || q.status === "enviada") && !q.expired;

/** ¿Se puede reservar? Espejo de book_quote (el cliente se liga antes). */
export function quoteBookingBlocker(q: {
  status: QuoteStatus;
  expired: boolean;
  clientId: string | null;
}): string | null {
  if (q.status === "convertida") return "Ya se reservó.";
  if (q.status === "rechazada" || q.status === "cancelada") return `La cotización está ${q.status}.`;
  if (q.expired) return "La cotización venció; crea una nueva con los precios vigentes.";
  if (!q.clientId) return "Registra o liga al cliente del prospecto antes de reservar.";
  return null;
}

/** Cambios de estado permitidos (espejo de set_quote_status). */
export function quoteStatusActions(q: { status: QuoteStatus; expired: boolean }): QuoteStatus[] {
  const out: QuoteStatus[] = [];
  if (q.status === "borrador" && !q.expired) out.push("enviada");
  if ((q.status === "borrador" || q.status === "enviada") && !q.expired) out.push("aceptada");
  if (q.status === "borrador" || q.status === "enviada") out.push("rechazada");
  if (q.status === "borrador" || q.status === "enviada" || q.status === "aceptada") out.push("cancelada");
  return out;
}

/**
 * Pago al operador de una línea (misma base que la OS, ADR 0026):
 * redondeo((cantidad × precio − descuento de la línea) × % ÷ 100, 2).
 */
export function operatorPay(line: {
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  operatorCommissionPct: number | null;
}): number {
  const base = line.quantity * line.unitPrice - line.lineDiscount;
  return Math.max(0, Math.round(base * (line.operatorCommissionPct ?? 0)) / 100);
}

/** Margen de contribución = total − otros costos directos − pago al operador (no es utilidad neta). */
export const contributionMargin = (q: {
  total: number;
  standardCostTotal: number;
  operatorPayTotal: number;
}) => Math.round((q.total - q.standardCostTotal - q.operatorPayTotal) * 100) / 100;

/** Margen como % del total; null sin ventas (no se muestra como 0). */
export const marginPct = (margin: number, total: number): number | null =>
  total > 0 ? Math.round((margin / total) * 1000) / 10 : null;

/** Estimado previo de una cotización (vista previa antes de guardar). */
export function estimateQuote(
  lines: readonly {
    quantity: number;
    unitPrice: number;
    unitDirectCost: number;
    operatorCommissionPct: number | null;
  }[],
) {
  let subtotal = 0;
  let standardCostTotal = 0;
  let operatorPayTotal = 0;
  for (const l of lines) {
    subtotal += Math.round(l.quantity * l.unitPrice * 100) / 100;
    standardCostTotal += Math.round(l.quantity * l.unitDirectCost * 100) / 100;
    operatorPayTotal += operatorPay({ ...l, lineDiscount: 0 });
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  const total = r(subtotal);
  return {
    subtotal: r(subtotal),
    total,
    standardCostTotal: r(standardCostTotal),
    operatorPayTotal: r(operatorPayTotal),
    contributionMargin: contributionMargin({
      total,
      standardCostTotal: r(standardCostTotal),
      operatorPayTotal: r(operatorPayTotal),
    }),
  };
}

/** Líneas cuyo precio del catálogo cambió desde que se cotizó (la OS respeta el cotizado). */
export const priceDrift = (items: readonly QuoteItem[]) =>
  items.filter((i) => i.currentPrice != null && i.currentPrice !== i.unitPrice);

/** Estado de la siguiente acción (misma regla que el pipeline). */
export const leadNextActionState = (
  l: { status: LeadStatus; nextAction: string | null; nextActionOn: string | null },
  today: string,
): NextActionState | null => nextActionState(l, today);

/** Minutos a la primera respuesta (null si aún no se contacta). */
export function firstResponseMinutes(createdAt: string, firstContactAt: string | null): number | null {
  if (!firstContactAt) return null;
  return Math.max(0, Math.round((Date.parse(firstContactAt) - Date.parse(createdAt)) / 60000));
}

/**
 * Cliente que conviene conservar al fusionar: el que tiene membresía activa o
 * cuenta B2B (no se mueven), si no el de más órdenes y, al empate, el más antiguo.
 */
export function suggestedKeep(pair: DuplicatePair): "a" | "b" {
  const score = (s: DuplicateSide) => (s.activeMemberships > 0 ? 1000 : 0) + (s.b2b ? 500 : 0) + s.orders;
  const a = score(pair.a);
  const b = score(pair.b);
  if (a !== b) return a > b ? "a" : "b";
  return pair.a.createdAt <= pair.b.createdAt ? "a" : "b";
}

/** Motivos que impiden fusionar (espejo de merge_clients). */
export function mergeBlocker(keep: DuplicateSide, merge: DuplicateSide): string | null {
  if (keep.b2b && merge.b2b) return "Ambos tienen cuenta B2B: revísalo con el área comercial.";
  if (merge.activeMemberships > 0) return "El duplicado tiene una membresía activa: consérvalo a él.";
  return null;
}

// ---------------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------------

export interface LeadStage {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  kind: LeadStatus;
  milestone: LeadMilestone | null;
  position: number;
  active: boolean;
}

export interface Lead {
  id: string;
  detailCenterId: string;
  centerName: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  socialHandle: string | null;
  source: LeadSource;
  sourceDetail: string | null;
  referredByClientId: string | null;
  referredByName: string | null;
  clientId: string | null;
  clientName: string | null;
  vehicleDescription: string | null;
  notes: string | null;
  consentChannels: LeadConsentChannel[];
  estimatedValue: number | null;
  stageId: string;
  stageName: string;
  stagePosition: number;
  status: LeadStatus;
  ownerId: string | null;
  ownerName: string | null;
  nextAction: string | null;
  nextActionOn: string | null;
  firstContactAt: string | null;
  closedAt: string | null;
  wonValue: number | null;
  serviceOrderId: string | null;
  serviceOrderFolio: string | null;
  lossReason: LeadLossReason | null;
  lossNotes: string | null;
  interestServiceIds: string[];
  interestServiceNames: string[];
  openTasks: number;
  quotes: number;
  version: number;
  createdAt: string;
  /** Hoy en la zona del centro. */
  today: string;
}

export interface LeadEvent {
  seq: number;
  kind: LeadEventKind;
  occurredAt: string;
  actorName: string | null;
  fromStageName: string | null;
  toStageName: string | null;
  value: number | null;
  ownerName: string | null;
  channel: LeadContactChannel | null;
  quoteId: string | null;
  quoteFolio: string | null;
  appointmentId: string | null;
  serviceOrderId: string | null;
  serviceOrderFolio: string | null;
  note: string | null;
}

export interface LeadTask {
  id: string;
  kind: LeadTaskKind;
  channel: string;
  status: "pendiente" | "hecha" | "cancelada";
  dueOn: string;
  notes: string | null;
  outcome: string | null;
  assignedTo: string | null;
  completedAt: string | null;
}

/** Coincidencia al registrar un prospecto (teléfono o email; nunca por nombre). */
export interface LeadMatch {
  kind: "prospecto" | "cliente";
  id: string;
  displayName: string;
  detail: string;
  matchedOn: ("telefono" | "email")[];
}

export interface LeadOwner {
  userId: string;
  fullName: string;
}

export interface QuoteItem {
  id: string;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  revenueEngine: string;
  unitPrice: number;
  priceSource: "base" | "center";
  unitDirectCost: number;
  operatorCommissionPct: number | null;
  durationMinutes: number;
  quantity: number;
  lineSubtotal: number;
  lineDiscount: number;
  operatorPay: number;
  /** Precio vigente del catálogo del centro (para avisar si cambió). */
  currentPrice: number | null;
}

export interface QuoteDiscount {
  id: string;
  itemId: string | null;
  kind: "percent" | "amount";
  value: number;
  amount: number;
  reason: string;
  authorizationLevel: DiscountLevel;
  authorizedByName: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
}

export interface Quote {
  id: string;
  detailCenterId: string;
  centerName: string;
  folio: string;
  leadId: string | null;
  leadName: string | null;
  clientId: string | null;
  clientName: string | null;
  vehicleId: string | null;
  vehicleLabel: string | null;
  contactName: string;
  status: QuoteStatus;
  expired: boolean;
  validUntil: string;
  subtotal: number;
  discountTotal: number;
  total: number;
  standardCostTotal: number;
  operatorPayTotal: number;
  costTotal: number;
  contributionMargin: number;
  notes: string | null;
  appointmentId: string | null;
  appointmentStartsAt: string | null;
  serviceOrderId: string | null;
  serviceOrderFolio: string | null;
  sentAt: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  items: QuoteItem[];
  discounts: QuoteDiscount[];
  version: number;
  createdByName: string | null;
  createdAt: string;
}

export interface DuplicateSide {
  clientId: string;
  name: string;
  phone: string;
  email: string | null;
  createdAt: string;
  orders: number;
  activeMemberships: number;
  b2b: boolean;
}

export interface DuplicatePair {
  a: DuplicateSide;
  b: DuplicateSide;
  matchedOn: ("telefono" | "email" | "nombre_parecido")[];
  nameSimilarity: number;
}

export interface SegmentFilter {
  serviceIds?: string[] | undefined;
  interestServiceIds?: string[] | undefined;
  minVisits?: number | undefined;
  minSpend?: number | undefined;
  maxSpend?: number | undefined;
  minDaysSinceVisit?: number | undefined;
  maxDaysSinceVisit?: number | undefined;
  consentChannel?: LeadConsentChannel | undefined;
}

export interface SegmentRow {
  clientId: string;
  fullName: string;
  phone: string;
  email: string | null;
  homeCenterName: string;
  visits: number;
  firstVisitAt: string | null;
  lastVisitAt: string | null;
  daysSinceLastVisit: number | null;
  avgDaysBetweenVisits: number | null;
  totalSpend: number;
  avgTicket: number | null;
  serviceNames: string[];
  interestNames: string[];
  consentChannels: string[];
}

/** Hecho por prospecto sin datos personales (public.commercial_funnel_facts). */
export interface FunnelFact {
  leadId: string;
  detailCenterId: string;
  source: LeadSource;
  ownerId: string | null;
  createdAt: string;
  firstContactMinutes: number | null;
  quotedAt: string | null;
  bookedAt: string | null;
  wonAt: string | null;
  lostAt: string | null;
  lossReason: LeadLossReason | null;
  status: LeadStatus;
  saleTotal: number | null;
  saleCost: number | null;
  saleMargin: number | null;
  interestServiceIds: string[];
}

/** Hecho por cotización (public.commercial_quote_facts). */
export interface QuoteFact {
  quoteId: string;
  detailCenterId: string;
  fromLead: boolean;
  source: LeadSource | null;
  status: QuoteStatus;
  expired: boolean;
  createdAt: string;
  total: number;
  discountTotal: number;
  costTotal: number;
  contributionMargin: number;
  booked: boolean;
  orderStatus: string | null;
  orderTotal: number | null;
  orderMargin: number | null;
}

// ---------------------------------------------------------------------------
// Comandos y puerto
// ---------------------------------------------------------------------------

export interface LeadFilter {
  status?: LeadStatus | undefined;
  stageId?: string | undefined;
  ownerId?: string | undefined;
  source?: LeadSource | undefined;
  query?: string | undefined;
}

export interface CreateLeadCommand {
  detailCenterId: string;
  requestId: string;
  fullName: string;
  source: LeadSource;
  phone?: string | undefined;
  email?: string | undefined;
  socialHandle?: string | undefined;
  sourceDetail?: string | undefined;
  referredByClientId?: string | undefined;
  clientId?: string | undefined;
  interestServiceIds: string[];
  vehicleDescription?: string | undefined;
  notes?: string | undefined;
  consentChannels: LeadConsentChannel[];
  estimatedValue?: number | undefined;
  ownerId?: string | undefined;
  nextAction?: string | undefined;
  nextActionOn?: string | undefined;
}

export interface UpdateLeadCommand extends Omit<
  CreateLeadCommand,
  "detailCenterId" | "requestId" | "referredByClientId" | "clientId"
> {
  id: string;
  version: number;
  reason: string;
}

export interface CreateLeadTaskCommand {
  leadId: string;
  requestId: string;
  kind: LeadTaskKind;
  dueOn: string;
  notes?: string | undefined;
  assignedTo?: string | undefined;
}

export interface CreateQuoteCommand {
  detailCenterId: string;
  requestId: string;
  items: { serviceId: string; quantity: number }[];
  leadId?: string | undefined;
  clientId?: string | undefined;
  vehicleId?: string | undefined;
  validDays?: number | undefined;
  notes?: string | undefined;
}

export interface QuoteDiscountCommand {
  quoteId: string;
  version: number;
  itemId?: string | undefined;
  kind: "percent" | "amount";
  value: number;
  reason: string;
}

export interface BookQuoteCommand {
  quoteId: string;
  version: number;
  requestId: string;
  startsAt: string;
  vehicleId?: string | undefined;
  bayId?: string | undefined;
  technicianId?: string | undefined;
  notes?: string | undefined;
}

export interface UpsertLeadStageCommand {
  organizationId: string;
  id?: string | undefined;
  code: string;
  name: string;
  position: number;
  milestone: LeadMilestone | null;
  active: boolean;
  reason: string;
}

/** Puerto del módulo (adaptador Supabase en @meguiars/supabase). */
export interface CommercialRepository {
  stages(organizationId: string): Promise<Result<LeadStage[]>>;
  leads(detailCenterIds: string[], filter?: LeadFilter): Promise<Result<Lead[]>>;
  lead(id: string, detailCenterIds: string[]): Promise<Result<Lead>>;
  leadTimeline(id: string): Promise<Result<LeadEvent[]>>;
  leadTasks(id: string): Promise<Result<LeadTask[]>>;
  leadOwners(detailCenterId: string): Promise<Result<LeadOwner[]>>;
  leadMatches(
    detailCenterId: string,
    phone: string | undefined,
    email: string | undefined,
    excludeLeadId?: string,
  ): Promise<Result<LeadMatch[]>>;
  createLead(command: CreateLeadCommand): Promise<Result<{ id: string }>>;
  updateLead(command: UpdateLeadCommand): Promise<Result<{ version: number }>>;
  logContact(
    id: string,
    version: number,
    channel: LeadContactChannel,
    note?: string,
  ): Promise<Result<{ version: number }>>;
  moveLead(id: string, version: number, stageId: string, note?: string): Promise<Result<{ version: number }>>;
  addLeadNote(id: string, note: string): Promise<Result<void>>;
  loseLead(
    id: string,
    version: number,
    reason: LeadLossReason,
    notes?: string,
  ): Promise<Result<{ version: number }>>;
  reopenLead(
    id: string,
    version: number,
    stageId: string,
    reason: string,
  ): Promise<Result<{ version: number }>>;
  winLead(id: string, version: number, serviceOrderId: string): Promise<Result<{ version: number }>>;
  linkLeadClient(
    id: string,
    version: number,
    clientId: string,
    reason: string,
  ): Promise<Result<{ version: number }>>;
  createLeadTask(command: CreateLeadTaskCommand): Promise<Result<{ id: string }>>;
  upsertStage(command: UpsertLeadStageCommand): Promise<Result<{ id: string }>>;
  quotes(
    detailCenterIds: string[],
    filter?: {
      status?: QuoteDisplayStatus | undefined;
      leadId?: string | undefined;
      clientId?: string | undefined;
    },
  ): Promise<Result<Quote[]>>;
  quote(id: string, detailCenterIds: string[]): Promise<Result<Quote>>;
  createQuote(command: CreateQuoteCommand): Promise<Result<{ id: string; folio: string }>>;
  setQuoteItem(
    quoteId: string,
    version: number,
    serviceId: string,
    quantity: number,
  ): Promise<Result<{ version: number }>>;
  addQuoteDiscount(command: QuoteDiscountCommand): Promise<Result<{ version: number }>>;
  voidQuoteDiscount(
    quoteId: string,
    version: number,
    discountId: string,
    reason: string,
  ): Promise<Result<{ version: number }>>;
  setQuoteStatus(
    quoteId: string,
    version: number,
    status: Exclude<QuoteStatus, "borrador" | "convertida">,
    reason?: string,
  ): Promise<Result<{ version: number }>>;
  updateQuote(
    quoteId: string,
    version: number,
    vehicleId: string | null,
    validUntil: string,
    notes: string | null,
    reason: string,
  ): Promise<Result<{ version: number }>>;
  bookQuote(command: BookQuoteCommand): Promise<Result<{ appointmentId: string }>>;
  duplicates(detailCenterIds: string[]): Promise<Result<DuplicatePair[]>>;
  mergeClients(keepClientId: string, mergeClientId: string, reason: string): Promise<Result<void>>;
  segment(detailCenterIds: string[], filter: SegmentFilter): Promise<Result<SegmentRow[]>>;
  funnelFacts(detailCenterIds: string[], from: string, to: string): Promise<Result<FunnelFact[]>>;
  quoteFacts(detailCenterIds: string[], from: string, to: string): Promise<Result<QuoteFact[]>>;
}
