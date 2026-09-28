import type { B2bAccountStatus, B2bPaymentMethod, InvoiceStatus } from "../b2b/b2b";
import type { Result } from "../result";

/**
 * Administración y Finanzas / Cuentas por cobrar B2B (AF5). Reglas espejo de
 * la migración 20261012000000_b2b_receivables.sql; schema-parity.test.ts compara
 * la lista de estados y el orden de aplicación automática.
 *
 * Documento de cobro = corte de C3 (b2b_invoices): agrupa OS entregadas de una
 * cuenta en un periodo (y la cuota devengada). La factura (CFDI) se emite fuera;
 * aquí sólo se guarda su referencia. Agrupar, facturar o cobrar no cambia el P&L:
 * la venta es la OS entregada y la cuota devengada.
 */

/** Estado derivado del documento (espejo de private.b2b_document_status). */
export const B2B_DOCUMENT_STATUSES = [
  "por_facturar",
  "facturado_externo",
  "parcial",
  "cobrado",
  "vencido",
  "anulado",
] as const;
export type B2bDocumentStatus = (typeof B2B_DOCUMENT_STATUSES)[number];

/** Estados con saldo (cartera abierta). */
export const OPEN_DOCUMENT_STATUSES: readonly B2bDocumentStatus[] = [
  "por_facturar",
  "facturado_externo",
  "parcial",
  "vencido",
];

export const EXTERNAL_REF_MAX = 80;
export const DOCUMENT_NOTES_MAX = 1000;
export const DUE_REASON_MIN = 3;
export const DUE_REASON_MAX = 500;
/** El export de soporte cubre como máximo un año de documentos. */
export const EXPORT_MAX_DAYS = 366;

const cents = (amount: number) => Math.round(amount * 100);
const money = (c: number) => c / 100;

/**
 * Precedencia: anulado > cobrado > vencido > parcial > facturado externo > por facturar.
 * `dueOn` y `today` en AAAA-MM-DD (fecha del centro gestor).
 */
export function b2bDocumentStatus(
  d: { status: InvoiceStatus; amount: number; paid: number; externalRef: string | null; dueOn: string },
  today: string,
): B2bDocumentStatus {
  if (d.status === "anulada") return "anulado";
  if (cents(d.paid) >= cents(d.amount)) return "cobrado";
  if (d.dueOn < today) return "vencido";
  if (cents(d.paid) > 0) return "parcial";
  if (d.externalRef) return "facturado_externo";
  return "por_facturar";
}

// ---------------------------------------------------------------------------
// Antigüedad (aging)
// ---------------------------------------------------------------------------

/** Rangos por defecto: 0-30, 31-60, 61-90 y 90+ días. */
export const DEFAULT_AGING_BOUNDS: readonly number[] = [30, 60, 90];

export interface AgingBucket {
  key: string;
  label: string;
  /** Días, inclusive. */
  from: number;
  /** Días, inclusive; null = sin tope. */
  to: number | null;
}

/**
 * Rangos configurables a partir de sus cortes (enteros positivos y crecientes):
 * [30, 60, 90] → 0-30, 31-60, 61-90, 90+.
 */
export function agingBuckets(bounds: readonly number[] = DEFAULT_AGING_BOUNDS): AgingBucket[] {
  if (
    bounds.length === 0 ||
    bounds.some((b, i) => !Number.isInteger(b) || b <= 0 || (i > 0 && b <= bounds[i - 1]!))
  ) {
    throw new Error("Rangos de antigüedad inválidos: enteros positivos y crecientes");
  }
  const buckets: AgingBucket[] = bounds.map((to, i) => {
    const from = i === 0 ? 0 : bounds[i - 1]! + 1;
    return { key: `${from}-${to}`, label: `${from}-${to} días`, from, to };
  });
  const last = bounds[bounds.length - 1]!;
  buckets.push({ key: `${last}+`, label: `Más de ${last} días`, from: last + 1, to: null });
  return buckets;
}

export function agingBucketOf(days: number, buckets: readonly AgingBucket[]): AgingBucket {
  const d = Math.max(0, Math.floor(days));
  return buckets.find((b) => d >= b.from && (b.to === null || d <= b.to)) ?? buckets[buckets.length - 1]!;
}

export interface AgingInput {
  accountId: string;
  accountName: string;
  /** Saldo del documento o total de la OS sin agrupar. */
  amount: number;
  /** Días desde la fecha del documento o desde la entrega. */
  ageDays: number;
  kind: "documento" | "sin_agrupar";
}

export interface AgingReport {
  buckets: AgingBucket[];
  /** Totales por rango (mismo orden que `buckets`). */
  totals: number[];
  documents: number[];
  unbilled: number[];
  total: number;
  byAccount: { accountId: string; accountName: string; amounts: number[]; total: number }[];
}

/**
 * Antigüedad de la cartera: saldo de documentos por días desde su fecha y OS sin
 * agrupar por días desde la entrega. Se suma en centavos.
 */
export function receivablesAging(
  rows: readonly AgingInput[],
  buckets: readonly AgingBucket[] = agingBuckets(),
): AgingReport {
  const n = buckets.length;
  const zero = () => Array.from({ length: n }, () => 0);
  const totals = zero();
  const documents = zero();
  const unbilled = zero();
  const accounts = new Map<string, { accountId: string; accountName: string; amounts: number[] }>();
  for (const r of rows) {
    if (cents(r.amount) <= 0) continue;
    const i = buckets.indexOf(agingBucketOf(r.ageDays, buckets));
    const c = cents(r.amount);
    totals[i]! += c;
    (r.kind === "documento" ? documents : unbilled)[i]! += c;
    const acc = accounts.get(r.accountId) ?? {
      accountId: r.accountId,
      accountName: r.accountName,
      amounts: zero(),
    };
    acc.amounts[i]! += c;
    accounts.set(r.accountId, acc);
  }
  const byAccount = [...accounts.values()]
    .map((a) => ({
      ...a,
      amounts: a.amounts.map(money),
      total: money(a.amounts.reduce((s, v) => s + v, 0)),
    }))
    .sort((a, b) => b.total - a.total || a.accountName.localeCompare(b.accountName));
  return {
    buckets: [...buckets],
    totals: totals.map(money),
    documents: documents.map(money),
    unbilled: unbilled.map(money),
    total: money(totals.reduce((s, v) => s + v, 0)),
    byAccount,
  };
}

// ---------------------------------------------------------------------------
// Aplicación de pagos
// ---------------------------------------------------------------------------

export interface PaymentAllocation {
  invoiceId: string;
  amount: number;
}

export interface OpenDocumentRef {
  id: string;
  folio: string;
  issuedOn: string;
  dueOn: string;
  balance: number;
}

/**
 * Aplicación automática (espejo de private.b2b_apply_payment sin aplicación
 * explícita): documentos con saldo por fecha compromiso, fecha y folio.
 */
export function autoAllocation(amount: number, docs: readonly OpenDocumentRef[]): PaymentAllocation[] {
  let remaining = cents(amount);
  const out: PaymentAllocation[] = [];
  const ordered = [...docs].sort(
    (a, b) =>
      a.dueOn.localeCompare(b.dueOn) ||
      a.issuedOn.localeCompare(b.issuedOn) ||
      a.folio.localeCompare(b.folio),
  );
  for (const d of ordered) {
    if (remaining <= 0) break;
    const open = cents(d.balance);
    if (open <= 0) continue;
    const take = Math.min(open, remaining);
    out.push({ invoiceId: d.id, amount: money(take) });
    remaining -= take;
  }
  return out;
}

export interface AllocationPreview {
  applied: number;
  unapplied: number;
  /** Mensajes de validación (vacío = válido); la base aplica las mismas reglas. */
  issues: string[];
}

/** Vista previa de un pago con aplicación explícita. */
export function previewAllocation(
  amount: number,
  allocations: readonly PaymentAllocation[],
  docs: readonly OpenDocumentRef[],
  receivable: number,
): AllocationPreview {
  const issues: string[] = [];
  if (!(amount > 0)) issues.push("El importe debe ser mayor que 0.");
  if (cents(amount) > cents(receivable)) issues.push("El pago no puede superar el saldo por cobrar.");
  const byDoc = new Map<string, number>();
  for (const a of allocations) {
    if (cents(a.amount) <= 0) continue;
    byDoc.set(a.invoiceId, (byDoc.get(a.invoiceId) ?? 0) + cents(a.amount));
  }
  for (const [id, c] of byDoc) {
    const d = docs.find((x) => x.id === id);
    if (!d) issues.push("Sólo se aplica a documentos con saldo de la cuenta.");
    else if (c > cents(d.balance)) issues.push(`Lo aplicado a ${d.folio} supera su saldo.`);
  }
  const applied = [...byDoc.values()].reduce((s, v) => s + v, 0);
  if (applied > cents(amount)) issues.push("Lo aplicado no puede superar el pago.");
  return { applied: money(applied), unapplied: money(Math.max(0, cents(amount) - applied)), issues };
}

// ---------------------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------------------

/** Resumen por cuenta (public.b2b_receivables). */
export interface B2bReceivableAccount {
  accountId: string;
  accountName: string;
  homeDetailCenterId: string;
  status: B2bAccountStatus;
  /** OS entregadas sin documento. */
  unbilledOrders: number;
  unbilledOrdersCount: number;
  /** Cuota devengada sin documento. */
  unbilledFees: number;
  /** Saldo de documentos vigentes (por estado abajo). */
  documentsBalance: number;
  porFacturar: number;
  facturadoExterno: number;
  parcial: number;
  vencido: number;
  /** Pagos sin aplicar (saldo a favor). */
  unapplied: number;
  /** OS entregadas + cuotas devengadas. */
  consumption: number;
  /** Pagos vigentes. */
  paid: number;
  /** consumption − paid. */
  balance: number;
  oldestUnbilledOn: string | null;
  creditLimit: number | null;
}

/**
 * Saldo trazable: consumo − pagos = sin agrupar + documentos − saldo a favor.
 * Devuelve la diferencia (0 = cuadra).
 */
export function receivableTraceGap(a: B2bReceivableAccount): number {
  return money(
    cents(a.balance) -
      (cents(a.unbilledOrders) + cents(a.unbilledFees) + cents(a.documentsBalance) - cents(a.unapplied)),
  );
}

export interface B2bBillingDocument {
  id: string;
  accountId: string;
  accountName: string;
  homeDetailCenterId: string;
  folio: string;
  periodFrom: string;
  periodTo: string;
  issuedOn: string;
  externalRef: string | null;
  externalInvoicedOn: string | null;
  dueOn: string;
  dueOnReason: string | null;
  ordersAmount: number;
  feeAmount: number;
  amount: number;
  paid: number;
  balance: number;
  status: B2bDocumentStatus;
  ageDays: number;
  daysOverdue: number;
  ordersCount: number;
  notes: string | null;
  voidReason: string | null;
  createdAt: string;
}

export interface B2bUnbilledOrder {
  id: string;
  accountId: string;
  accountName: string;
  folio: string;
  detailCenterId: string;
  centerName: string;
  deliveredOn: string;
  vehicleLabel: string;
  purchaseOrder: string | null;
  total: number;
  ageDays: number;
}

export interface B2bAccountPayment {
  id: string;
  amount: number;
  method: B2bPaymentMethod;
  reference: string | null;
  paidOn: string;
  voidedAt: string | null;
  voidReason: string | null;
  applied: number;
  unapplied: number;
  allocations: { invoiceId: string; folio: string; amount: number }[];
  createdAt: string;
}

export interface B2bDocumentOrder {
  id: string;
  folio: string;
  detailCenterId: string;
  centerName: string;
  deliveredOn: string;
  vehicleLabel: string;
  purchaseOrder: string | null;
  total: number;
}

export interface B2bDocumentPayment {
  paymentId: string;
  paidOn: string;
  method: B2bPaymentMethod;
  reference: string | null;
  amount: number;
  voided: boolean;
}

export interface B2bBillingDocumentDetail extends Omit<B2bBillingDocument, "ordersCount"> {
  legalName: string | null;
  rfc: string | null;
  taxRegime: string | null;
  fiscalZip: string | null;
  billingEmail: string | null;
  orders: B2bDocumentOrder[];
  payments: B2bDocumentPayment[];
}

/** Fila del export de soporte (una por OS o cuota de cada documento vigente). */
export interface B2bReceivablesExportRow {
  folio: string;
  status: B2bDocumentStatus;
  accountName: string;
  legalName: string | null;
  rfc: string | null;
  taxRegime: string | null;
  fiscalZip: string | null;
  billingEmail: string | null;
  periodFrom: string;
  periodTo: string;
  issuedOn: string;
  externalRef: string | null;
  externalInvoicedOn: string | null;
  dueOn: string;
  lineKind: "os" | "cuota";
  orderFolio: string | null;
  centerName: string | null;
  deliveredOn: string | null;
  vehicleLabel: string | null;
  purchaseOrder: string | null;
  lineAmount: number;
  documentAmount: number;
  documentPaid: number;
  documentBalance: number;
}

/** Acciones de un documento según su estado y permisos (espejo de las RPC). */
export function documentActions(
  d: Pick<B2bBillingDocument, "status" | "paid">,
  can: { billing: boolean },
): { edit: boolean; void: boolean; pay: boolean } {
  const open = d.status !== "anulado" && d.status !== "cobrado";
  return {
    edit: can.billing && d.status !== "anulado",
    void: can.billing && d.status !== "anulado" && cents(d.paid) === 0,
    pay: can.billing && open,
  };
}

// ---------------------------------------------------------------------------
// Comandos y puerto
// ---------------------------------------------------------------------------

export interface CreateBillingBatchCommand {
  accountId: string;
  requestId: string;
  periodFrom: string;
  periodTo: string;
  /** Sin OS indicadas = todas las entregadas del periodo sin documento. */
  orderIds?: string[] | undefined;
  feeAmount: number;
  dueOn?: string | undefined;
  externalRef?: string | undefined;
  externalInvoicedOn?: string | undefined;
  notes?: string | undefined;
}

export interface UpdateBillingBatchCommand {
  invoiceId: string;
  externalRef?: string | undefined;
  externalInvoicedOn?: string | undefined;
  dueOn: string;
  reason: string;
}

export interface RegisterB2bPaymentCommand {
  accountId: string;
  requestId: string;
  amount: number;
  method: B2bPaymentMethod;
  reference?: string | undefined;
  paidOn?: string | undefined;
  /** Sin aplicación = automática (compromiso más antiguo primero). */
  allocations?: PaymentAllocation[] | undefined;
}

export interface AllocateB2bPaymentCommand {
  paymentId: string;
  allocations?: PaymentAllocation[] | undefined;
}

export interface DocumentsFilter {
  accountId?: string | undefined;
  /** También cobrados y anulados emitidos en el rango. */
  includeClosed?: boolean | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

/** Puerto de cuentas por cobrar B2B. Web y móvil usan el mismo adaptador (`@meguiars/supabase`). */
export interface ReceivablesRepository {
  accounts(detailCenterIds: string[]): Promise<Result<B2bReceivableAccount[]>>;
  documents(detailCenterIds: string[], filter?: DocumentsFilter): Promise<Result<B2bBillingDocument[]>>;
  unbilledOrders(detailCenterIds: string[], accountId?: string): Promise<Result<B2bUnbilledOrder[]>>;
  payments(accountId: string): Promise<Result<B2bAccountPayment[]>>;
  document(id: string): Promise<Result<B2bBillingDocumentDetail>>;
  exportRows(
    detailCenterIds: string[],
    from: string,
    to: string,
    accountId?: string,
  ): Promise<Result<B2bReceivablesExportRow[]>>;
  createBatch(command: CreateBillingBatchCommand): Promise<Result<{ id: string; folio: string }>>;
  updateBatch(command: UpdateBillingBatchCommand): Promise<Result<void>>;
  voidBatch(invoiceId: string, reason: string): Promise<Result<void>>;
  registerPayment(command: RegisterB2bPaymentCommand): Promise<Result<{ id: string }>>;
  allocatePayment(command: AllocateB2bPaymentCommand): Promise<Result<{ applied: number }>>;
  voidPayment(paymentId: string, reason: string): Promise<Result<void>>;
}

/** Entradas del aging: saldo de documentos abiertos y OS sin agrupar. */
export function agingInputs(
  documents: readonly Pick<
    B2bBillingDocument,
    "accountId" | "accountName" | "balance" | "ageDays" | "status"
  >[],
  unbilled: readonly Pick<B2bUnbilledOrder, "accountId" | "accountName" | "total" | "ageDays">[],
): AgingInput[] {
  return [
    ...documents
      .filter((d) => d.status !== "anulado")
      .map((d) => ({
        accountId: d.accountId,
        accountName: d.accountName,
        amount: d.balance,
        ageDays: d.ageDays,
        kind: "documento" as const,
      })),
    ...unbilled.map((o) => ({
      accountId: o.accountId,
      accountName: o.accountName,
      amount: o.total,
      ageDays: o.ageDays,
      kind: "sin_agrupar" as const,
    })),
  ];
}

/** Totales de la cartera (suma en centavos). */
export function receivablesTotals(accounts: readonly B2bReceivableAccount[]) {
  const sum = (pick: (a: B2bReceivableAccount) => number) =>
    money(accounts.reduce((s, a) => s + cents(pick(a)), 0));
  return {
    balance: sum((a) => a.balance),
    unbilled: sum((a) => a.unbilledOrders + a.unbilledFees),
    documents: sum((a) => a.documentsBalance),
    overdue: sum((a) => a.vencido),
    unapplied: sum((a) => a.unapplied),
  };
}
