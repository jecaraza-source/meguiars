import {
  EXPENSE_RECEIPT_BUCKET,
  EXPENSE_RECEIPT_URL_TTL,
  expenseReceiptPath,
  fail,
  type ApprovalEventKind,
  type Expense,
  type ExpenseCategory,
  type ExpenseListItem,
  type ExpenseMutation,
  type ExpensePaymentMethod,
  type ExpenseReceiptMimeType,
  type ExpenseRepository,
  type ExpenseStatus,
  type PnlFact,
  type PnlGroup,
  type Vendor,
} from "@meguiars/domain";
import {
  approveExpenseSchema,
  createExpenseSchema,
  expenseCategorySchema,
  expenseFilterSchema,
  expenseReasonSchema,
  receiptMetaSchema,
  removeReceiptSchema,
  thresholdSchema,
  updateExpenseSchema,
  vendorSchema,
} from "@meguiars/validation";
import { z } from "zod";
import type { MeguiarsSupabaseClient } from "../client";
import type { Database, Json, Tables } from "../database.types";
import { toRepoError } from "../errors";
import { invalid, run } from "./shared";

type ListRow = Database["public"]["Functions"]["list_expenses"]["Returns"][number];

const toMutation = (e: Tables<"expenses">): ExpenseMutation => ({
  id: e.id,
  folio: e.folio,
  status: e.status as ExpenseStatus,
  version: e.version,
});

export const toCategory = (c: Tables<"expense_categories">): ExpenseCategory => ({
  id: c.id,
  organizationId: c.organization_id,
  code: c.code,
  name: c.name,
  pnlGroup: c.pnl_group as PnlGroup,
  description: c.description,
  position: c.position,
  active: c.active,
});

export const toVendor = (v: Tables<"vendors">): Vendor => ({
  id: v.id,
  organizationId: v.organization_id,
  name: v.name,
  rfc: v.rfc,
  phone: v.phone,
  email: v.email,
  notes: v.notes,
  active: v.active,
});

const toListItem = (r: ListRow): ExpenseListItem => ({
  id: r.id,
  detailCenterId: r.detail_center_id,
  folio: r.folio,
  paidOn: r.paid_on,
  concept: r.concept,
  amount: Number(r.amount),
  status: r.status as ExpenseStatus,
  pnlGroup: r.pnl_group as PnlGroup,
  categoryId: r.category_id,
  categoryName: r.category_name,
  vendorId: r.vendor_id,
  vendorName: r.vendor_name,
  paymentMethod: r.payment_method as ExpensePaymentMethod,
  attachments: r.attachments,
  version: r.version,
  createdByName: r.created_by_name,
  createdAt: r.created_at,
});

// expense_detail devuelve jsonb: se valida la forma antes de usarla.
const detailJson = z.object({
  id: z.string(),
  organization_id: z.string(),
  detail_center_id: z.string(),
  folio: z.string(),
  category_id: z.string(),
  category_name: z.string(),
  pnl_group: z.string(),
  vendor_id: z.string().nullable(),
  vendor_name: z.string().nullable(),
  concept: z.string(),
  amount: z.coerce.number(),
  payment_method: z.string(),
  paid_on: z.string(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.string(),
  requires_approval: z.boolean(),
  approved_at: z.string().nullable(),
  approved_by_name: z.string().nullable(),
  void_reason: z.string().nullable(),
  voided_at: z.string().nullable(),
  voided_by_name: z.string().nullable(),
  version: z.number(),
  created_by: z.string().nullable(),
  created_by_name: z.string().nullable(),
  created_at: z.string(),
  center_timezone: z.string(),
  attachments: z.array(
    z.object({
      id: z.string(),
      storage_path: z.string(),
      file_name: z.string().nullable(),
      content_type: z.string(),
      size_bytes: z.number(),
      uploaded_by_name: z.string().nullable(),
      created_at: z.string(),
    }),
  ),
  events: z.array(
    z.object({
      kind: z.string(),
      amount: z.coerce.number(),
      note: z.string().nullable(),
      actor_name: z.string().nullable(),
      occurred_at: z.string(),
    }),
  ),
});

export function toExpense(json: Json, signed: Map<string, string>): Expense | null {
  const parsed = detailJson.safeParse(json);
  if (!parsed.success) return null;
  const e = parsed.data;
  return {
    id: e.id,
    organizationId: e.organization_id,
    detailCenterId: e.detail_center_id,
    folio: e.folio,
    categoryId: e.category_id,
    categoryName: e.category_name,
    pnlGroup: e.pnl_group as PnlGroup,
    vendorId: e.vendor_id,
    vendorName: e.vendor_name,
    concept: e.concept,
    amount: e.amount,
    paymentMethod: e.payment_method as ExpensePaymentMethod,
    paidOn: e.paid_on,
    reference: e.reference,
    notes: e.notes,
    status: e.status as ExpenseStatus,
    requiresApproval: e.requires_approval,
    approvedAt: e.approved_at,
    approvedByName: e.approved_by_name,
    voidReason: e.void_reason,
    voidedAt: e.voided_at,
    voidedByName: e.voided_by_name,
    version: e.version,
    createdBy: e.created_by,
    createdByName: e.created_by_name,
    createdAt: e.created_at,
    centerTimezone: e.center_timezone,
    attachments: e.attachments.map((a) => ({
      id: a.id,
      storagePath: a.storage_path,
      fileName: a.file_name,
      contentType: a.content_type as ExpenseReceiptMimeType,
      sizeBytes: a.size_bytes,
      uploadedByName: a.uploaded_by_name,
      createdAt: a.created_at,
      signedUrl: signed.get(a.storage_path) ?? null,
    })),
    events: e.events.map((x) => ({
      kind: x.kind as ApprovalEventKind,
      amount: x.amount,
      note: x.note,
      actorName: x.actor_name,
      occurredAt: x.occurred_at,
    })),
  };
}

const input = (c: {
  categoryId: string;
  vendorId?: string | undefined;
  concept: string;
  amount: number;
  paymentMethod: string;
  paidOn: string;
  reference?: string | undefined;
  notes?: string | undefined;
}) => ({
  p_category_id: c.categoryId,
  p_vendor_id: c.vendorId ?? null,
  p_concept: c.concept,
  p_amount: c.amount,
  p_payment_method: c.paymentMethod,
  p_paid_on: c.paidOn,
  p_reference: c.reference ?? null,
  p_notes: c.notes ?? null,
});

/** Adaptador de egresos. Escrituras sólo por RPC; comprobantes en el bucket privado. */
export function createExpenseRepository(client: MeguiarsSupabaseClient): ExpenseRepository {
  return {
    list(filter) {
      const parsed = expenseFilterSchema.safeParse(filter);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const f = parsed.data;
      return run(
        () =>
          client.rpc("list_expenses", {
            p_detail_center_ids: f.detailCenterIds,
            p_from: f.from,
            p_to: f.to,
            p_category_id: f.categoryId ?? null,
            p_vendor_id: f.vendorId ?? null,
            p_status: f.status ?? null,
            p_pnl_group: f.pnlGroup ?? null,
          }),
        (rows) => rows.map(toListItem),
      );
    },

    async get(id) {
      try {
        const { data, error } = await client.rpc("expense_detail", { p_expense_id: id });
        if (error) return { ok: false, error: toRepoError(error) };
        const paths = detailJson.shape.attachments.safeParse(
          (data as { attachments?: unknown } | null)?.attachments,
        );
        const list = paths.success ? paths.data.map((a) => a.storage_path) : [];
        const signed = new Map<string, string>();
        if (list.length) {
          const urls = await client.storage
            .from(EXPENSE_RECEIPT_BUCKET)
            .createSignedUrls(list, EXPENSE_RECEIPT_URL_TTL);
          for (const u of (urls.data ?? []) as { path: string | null; signedUrl: string | null }[])
            if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
        }
        const expense = data ? toExpense(data, signed) : null;
        return expense
          ? { ok: true, data: expense }
          : fail("not_found", "El egreso no existe o no tienes acceso");
      } catch (error) {
        return { ok: false, error: toRepoError(error) };
      }
    },

    create(command) {
      const parsed = createExpenseSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("create_expense", {
            p_detail_center_id: c.detailCenterId,
            p_request_id: c.requestId,
            ...input(c),
          }),
        toMutation,
      );
    },

    update(command) {
      const parsed = updateExpenseSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("update_expense", {
            p_expense_id: c.expenseId,
            p_version: c.version,
            p_reason: c.reason,
            ...input(c),
          }),
        toMutation,
      );
    },

    approve(command) {
      const parsed = approveExpenseSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("approve_expense", {
            p_expense_id: c.expenseId,
            p_version: c.version,
            p_note: c.reason ?? null,
          }),
        toMutation,
      );
    },

    reject(command) {
      const parsed = expenseReasonSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("reject_expense", {
            p_expense_id: c.expenseId,
            p_version: c.version,
            p_reason: c.reason,
          }),
        toMutation,
      );
    },

    void(command) {
      const parsed = expenseReasonSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("void_expense", { p_expense_id: c.expenseId, p_version: c.version, p_reason: c.reason }),
        toMutation,
      );
    },

    async uploadReceipt(command) {
      const parsed = receiptMetaSchema.safeParse(command);
      if (!parsed.success) return invalid(parsed.error);
      const m = parsed.data;
      const path = expenseReceiptPath(command.expense, command.fileId, m.contentType);
      try {
        const upload = await client.storage
          .from(EXPENSE_RECEIPT_BUCKET)
          .upload(path, command.file, { contentType: m.contentType, upsert: false });
        // Reintento del mismo archivo: ya existe; se registra igual (idempotente por ruta).
        if (upload.error && !/exists|duplicate/i.test(upload.error.message)) {
          const status = (upload.error as { statusCode?: string }).statusCode;
          if (status === "403" || /row-level security|unauthorized/i.test(upload.error.message))
            return fail("permission_denied", "Sin permiso para adjuntar comprobantes a este egreso");
          return fail("unavailable", upload.error.message);
        }
      } catch (error) {
        return { ok: false, error: toRepoError(error) };
      }
      return run(
        () =>
          client.rpc("register_expense_attachment", {
            p_expense_id: command.expense.id,
            p_storage_path: path,
            p_content_type: m.contentType,
            p_size_bytes: m.sizeBytes,
            p_file_name: m.fileName ?? null,
          }),
        (row) => ({ id: row.id }),
      );
    },

    removeReceipt(attachmentId, reason) {
      const parsed = removeReceiptSchema.safeParse({ attachmentId, reason });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () =>
          client.rpc("remove_expense_attachment", {
            p_attachment_id: parsed.data.attachmentId,
            p_reason: parsed.data.reason,
          }),
        () => undefined,
      );
    },

    categories(organizationId) {
      return run(
        () =>
          client
            .from("expense_categories")
            .select("*")
            .eq("organization_id", organizationId)
            .order("position")
            .order("name"),
        (rows) => rows.map(toCategory),
      );
    },

    upsertCategory(command) {
      const parsed = expenseCategorySchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const c = parsed.data;
      return run(
        () =>
          client.rpc("upsert_expense_category", {
            p_organization_id: c.organizationId,
            p_category_id: c.categoryId ?? null,
            p_code: c.code,
            p_name: c.name,
            p_pnl_group: c.pnlGroup,
            p_description: c.description ?? null,
            p_position: c.position,
            p_active: c.active,
            p_reason: c.reason,
          }),
        toCategory,
      );
    },

    vendors(organizationId) {
      return run(
        () => client.from("vendors").select("*").eq("organization_id", organizationId).order("name"),
        (rows) => rows.map(toVendor),
      );
    },

    upsertVendor(command) {
      const parsed = vendorSchema.safeParse(command);
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      const v = parsed.data;
      return run(
        () =>
          client.rpc("upsert_vendor", {
            p_detail_center_id: v.detailCenterId,
            p_vendor_id: v.vendorId ?? null,
            p_name: v.name,
            p_rfc: v.rfc ?? null,
            p_phone: v.phone ?? null,
            p_email: v.email ?? null,
            p_notes: v.notes ?? null,
            p_active: v.active,
          }),
        toVendor,
      );
    },

    async threshold(detailCenterId) {
      try {
        const { data, error } = await client
          .from("expense_settings")
          .select("approval_threshold")
          .eq("detail_center_id", detailCenterId)
          .maybeSingle();
        if (error) return { ok: false, error: toRepoError(error) };
        const t = data?.approval_threshold;
        return { ok: true, data: t === null || t === undefined ? null : Number(t) };
      } catch (error) {
        return { ok: false, error: toRepoError(error) };
      }
    },

    setThreshold(detailCenterId, threshold, reason) {
      const parsed = thresholdSchema.safeParse({ detailCenterId, threshold: threshold ?? "", reason });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () =>
          client.rpc("set_expense_approval_threshold", {
            p_detail_center_id: parsed.data.detailCenterId,
            p_threshold: parsed.data.threshold ?? null,
            p_reason: parsed.data.reason,
          }),
        () => undefined,
      );
    },

    pnlFacts(detailCenterIds, from, to) {
      const parsed = expenseFilterSchema.safeParse({ detailCenterIds, from, to });
      if (!parsed.success) return Promise.resolve(invalid(parsed.error));
      return run(
        () => client.rpc("pnl_facts", { p_detail_center_ids: detailCenterIds, p_from: from, p_to: to }),
        (rows) =>
          rows.map((r): PnlFact => ({
            detailCenterId: r.detail_center_id,
            section: r.section as PnlFact["section"],
            item: r.item,
            amount: Number(r.amount),
            count: r.count,
          })),
      );
    },
  };
}
