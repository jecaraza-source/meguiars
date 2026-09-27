import type { Result } from "../result";

/**
 * Administración y Finanzas / Egresos y costos (AF2). Reglas espejo de la
 * migración 20261008000000_expenses.sql; schema-parity.test.ts compara las
 * listas.
 *
 * Costo económico vs salida de caja: el costo directo de un servicio ya está
 * en la OS (costo estándar + variación de insumos). Comprar insumos es salida
 * de caja pero no gasto del P&L (grupo `insumos`), así no se cuenta dos veces.
 */

/** Grupos del P&L a los que se mapea cada categoría (orden del estado de resultados). */
export const PNL_GROUPS = [
  "costo_directo",
  "insumos",
  "personal",
  "operativo",
  "administrativo",
  "marketing",
  "financiero",
  "otros",
] as const;
export type PnlGroup = (typeof PNL_GROUPS)[number];

/** Grupos que NO son gasto del P&L (sólo salida de caja). */
export const CASH_ONLY_GROUPS: readonly PnlGroup[] = ["insumos"];
export const isPnlExpense = (group: PnlGroup) => !CASH_ONLY_GROUPS.includes(group);

export const EXPENSE_STATUSES = ["pendiente", "aprobado", "rechazado", "anulado"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const EXPENSE_PAYMENT_METHODS = ["efectivo", "tarjeta", "transferencia", "cheque", "otro"] as const;
export type ExpensePaymentMethod = (typeof EXPENSE_PAYMENT_METHODS)[number];

export const APPROVAL_EVENT_KINDS = [
  "solicitada",
  "autoaprobada",
  "aprobada",
  "rechazada",
  "editada",
  "anulada",
] as const;
export type ApprovalEventKind = (typeof APPROVAL_EVENT_KINDS)[number];

/** Comprobantes: foto o PDF, hasta 10 MB (bucket privado expense-receipts). */
export const EXPENSE_RECEIPT_BUCKET = "expense-receipts";
export const EXPENSE_RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const EXPENSE_RECEIPT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
export type ExpenseReceiptMimeType = (typeof EXPENSE_RECEIPT_MIME_TYPES)[number];
export const EXPENSE_RECEIPT_URL_TTL = 600;

const EXTENSIONS: Record<ExpenseReceiptMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Ruta en el bucket: <org>/<centro>/<egreso>/<uuid>.<ext> (espejo de la política de Storage). */
export function expenseReceiptPath(
  expense: { organizationId: string; detailCenterId: string; id: string },
  fileId: string,
  contentType: ExpenseReceiptMimeType,
): string {
  return `${expense.organizationId}/${expense.detailCenterId}/${expense.id}/${fileId}.${EXTENSIONS[contentType]}`;
}

/** Espejo de private.expense_requires_approval: importe ≥ umbral (null = nunca). */
export function requiresApproval(amount: number, threshold: number | null): boolean {
  return threshold !== null && Math.round(amount * 100) >= Math.round(threshold * 100);
}

/** Estado con que queda un egreso al capturarlo o editarlo (espejo de create/update_expense). */
export function expenseStatusOnSave(
  amount: number,
  threshold: number | null,
  isApprover: boolean,
): ExpenseStatus {
  return requiresApproval(amount, threshold) && !isApprover ? "pendiente" : "aprobado";
}

/** Acciones disponibles según estado y permisos (espejo de las RPC). */
export function expenseActions(
  status: ExpenseStatus,
  can: { write: boolean; approve: boolean },
): { edit: boolean; approve: boolean; reject: boolean; void: boolean; attach: boolean } {
  const open = status !== "anulado";
  return {
    edit: open && can.write,
    approve: status === "pendiente" && can.approve,
    reject: status === "pendiente" && can.approve,
    void: open && (can.approve || (can.write && (status === "pendiente" || status === "rechazado"))),
    attach: open && can.write,
  };
}

export interface ExpenseCategory {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  pnlGroup: PnlGroup;
  description: string | null;
  position: number;
  active: boolean;
}

export interface Vendor {
  id: string;
  organizationId: string;
  name: string;
  rfc: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
}

export interface ExpenseListItem {
  id: string;
  detailCenterId: string;
  folio: string;
  /** AAAA-MM-DD (fecha del centro). */
  paidOn: string;
  concept: string;
  amount: number;
  status: ExpenseStatus;
  pnlGroup: PnlGroup;
  categoryId: string;
  categoryName: string;
  vendorId: string | null;
  vendorName: string | null;
  paymentMethod: ExpensePaymentMethod;
  attachments: number;
  version: number;
  createdByName: string | null;
  createdAt: string;
}

export interface ExpenseAttachment {
  id: string;
  storagePath: string;
  fileName: string | null;
  contentType: ExpenseReceiptMimeType;
  sizeBytes: number;
  uploadedByName: string | null;
  createdAt: string;
  /** URL firmada temporal (null si no se pudo firmar). */
  signedUrl: string | null;
}

export interface ApprovalEvent {
  kind: ApprovalEventKind;
  amount: number;
  note: string | null;
  actorName: string | null;
  occurredAt: string;
}

export interface Expense {
  id: string;
  organizationId: string;
  detailCenterId: string;
  folio: string;
  categoryId: string;
  categoryName: string;
  pnlGroup: PnlGroup;
  vendorId: string | null;
  vendorName: string | null;
  concept: string;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  paidOn: string;
  reference: string | null;
  notes: string | null;
  status: ExpenseStatus;
  requiresApproval: boolean;
  approvedAt: string | null;
  approvedByName: string | null;
  voidReason: string | null;
  voidedAt: string | null;
  voidedByName: string | null;
  version: number;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  centerTimezone: string;
  attachments: ExpenseAttachment[];
  events: ApprovalEvent[];
}

export interface ExpenseFilter {
  detailCenterIds: string[];
  from: string;
  to: string;
  categoryId?: string | undefined;
  vendorId?: string | undefined;
  status?: ExpenseStatus | undefined;
  pnlGroup?: PnlGroup | undefined;
}

export interface ExpenseInput {
  categoryId: string;
  vendorId?: string | undefined;
  concept: string;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  paidOn: string;
  reference?: string | undefined;
  notes?: string | undefined;
}

export interface CreateExpenseCommand extends ExpenseInput {
  detailCenterId: string;
  requestId: string;
}

export interface UpdateExpenseCommand extends ExpenseInput {
  expenseId: string;
  version: number;
  reason: string;
}

export interface ExpenseDecisionCommand {
  expenseId: string;
  version: number;
  /** Nota (aprobar, opcional) o motivo (rechazar y anular, obligatorio). */
  reason?: string | undefined;
}

export interface UploadReceiptCommand {
  expense: { organizationId: string; detailCenterId: string; id: string };
  /** uuid del archivo (el cliente lo genera: reintentos no duplican). */
  fileId: string;
  file: Blob | ArrayBuffer;
  contentType: ExpenseReceiptMimeType;
  sizeBytes: number;
  fileName?: string | undefined;
}

export interface VendorInput {
  detailCenterId: string;
  vendorId?: string | undefined;
  name: string;
  rfc?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  notes?: string | undefined;
  active: boolean;
}

export interface CategoryInput {
  organizationId: string;
  categoryId?: string | undefined;
  code: string;
  name: string;
  pnlGroup: PnlGroup;
  description?: string | undefined;
  position: number;
  active: boolean;
  reason: string;
}

export interface ExpenseMutation {
  id: string;
  folio: string;
  status: ExpenseStatus;
  version: number;
}

/** Puerto de egresos. Web y móvil usan el mismo adaptador (`@meguiars/supabase`). */
export interface ExpenseRepository {
  list(filter: ExpenseFilter): Promise<Result<ExpenseListItem[]>>;
  get(id: string): Promise<Result<Expense>>;
  create(command: CreateExpenseCommand): Promise<Result<ExpenseMutation>>;
  update(command: UpdateExpenseCommand): Promise<Result<ExpenseMutation>>;
  approve(command: ExpenseDecisionCommand): Promise<Result<ExpenseMutation>>;
  reject(command: ExpenseDecisionCommand): Promise<Result<ExpenseMutation>>;
  void(command: ExpenseDecisionCommand): Promise<Result<ExpenseMutation>>;
  uploadReceipt(command: UploadReceiptCommand): Promise<Result<{ id: string }>>;
  removeReceipt(attachmentId: string, reason: string): Promise<Result<void>>;
  categories(organizationId: string): Promise<Result<ExpenseCategory[]>>;
  upsertCategory(input: CategoryInput): Promise<Result<ExpenseCategory>>;
  vendors(organizationId: string): Promise<Result<Vendor[]>>;
  upsertVendor(input: VendorInput): Promise<Result<Vendor>>;
  threshold(detailCenterId: string): Promise<Result<number | null>>;
  setThreshold(detailCenterId: string, threshold: number | null, reason: string): Promise<Result<void>>;
}
