"use server";

import {
  activeCenterAccess,
  canManageServices,
  catalogCopy,
  executionCopy,
  guardScreen,
  orderErrorMessage,
  ordersCopy,
  type RepoError,
  type Result,
} from "@meguiars/domain";
import { createExecutionRepository, createServiceOrderRepository } from "@meguiars/supabase";
import {
  consumptionFormSchema,
  evidenceMetaSchema,
  fieldErrors,
  incidentFormSchema,
  inventoryItemSchema,
  itemWorkSchema,
  removeEvidenceSchema,
  resolveIncidentSchema,
  staffSchema,
  supplyStandardSchema,
} from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, validationState, values, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ExecutionFormState = ActionFormState;

/** Centro activo del servidor (nunca uno enviado por el cliente) y repositorios. */
async function context(screen: "orderExecution" | "supplies" | "catalogDetail") {
  const state = await getAuthState();
  if (!guardScreen(state, screen).allow) return null;
  const active = activeCenterAccess(state);
  const supabase = await createSupabaseServerClient();
  if (!active || !supabase) return null;
  return {
    state,
    center: active.center,
    repo: createExecutionRepository(supabase),
    orders: createServiceOrderRepository(supabase),
  };
}

const errorMessage = (error: RepoError) =>
  error.kind === "permission_denied" ? executionCopy.forbidden : orderErrorMessage(error);

function after(
  orderId: string,
  result: Result<unknown>,
  form: FormData,
  message: string = executionCopy.saved,
) {
  revalidatePath(`/ordenes/${orderId}/ejecucion`);
  revalidatePath(`/ordenes/${orderId}`);
  if (!result.ok) return stamp({ error: errorMessage(result.error), values: values(form) });
  return stamp({ message });
}

const optionalInt = (form: FormData, key: string) => {
  const n = Number(text(form, key));
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

export async function setItemWorkAction(
  _prev: ExecutionFormState,
  form: FormData,
): Promise<ExecutionFormState> {
  const ctx = await context("orderExecution");
  if (!ctx) return stamp({ error: executionCopy.forbidden });
  const orderId = text(form, "orderId");
  const parsed = itemWorkSchema.safeParse({
    itemId: text(form, "itemId"),
    status: text(form, "status"),
    technicianId: text(form, "technicianId"),
    note: text(form, "note"),
  });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["itemId", "status"], form));
  return after(orderId, await ctx.repo.setItemWork(parsed.data), form);
}

export async function setStaffAction(_prev: ExecutionFormState, form: FormData): Promise<ExecutionFormState> {
  const ctx = await context("orderExecution");
  if (!ctx) return stamp({ error: executionCopy.forbidden });
  const orderId = text(form, "orderId");
  const parsed = staffSchema.safeParse({
    orderId,
    technicianIds: form.getAll("technicianIds").filter((v): v is string => typeof v === "string"),
  });
  if (!parsed.success)
    return stamp(validationState(fieldErrors(parsed.error), ["orderId", "technicianIds"], form));
  return after(orderId, await ctx.repo.setStaff(parsed.data.orderId, parsed.data.technicianIds), form);
}

/**
 * Sube una foto (ya redimensionada en el navegador) con la sesión del usuario:
 * las políticas de Storage validan centro y OS en la ruta; luego se registra.
 */
export async function uploadEvidenceAction(
  _prev: ExecutionFormState,
  form: FormData,
): Promise<ExecutionFormState> {
  const ctx = await context("orderExecution");
  if (!ctx) return stamp({ error: executionCopy.forbidden });
  const orderId = text(form, "orderId");
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return stamp({ fields: { photo: "Elige una foto" }, values: values(form) });
  }
  // El tipo y el tamaño salen del archivo recibido, no de lo que declare el cliente.
  const parsed = evidenceMetaSchema.safeParse({
    kind: text(form, "kind"),
    contentType: file.type,
    sizeBytes: file.size,
    width: optionalInt(form, "width"),
    height: optionalInt(form, "height"),
    itemId: text(form, "itemId"),
    incidentId: text(form, "incidentId"),
    note: text(form, "note"),
  });
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    const photo = errors.contentType ?? errors.sizeBytes;
    return stamp({ fields: { ...errors, ...(photo ? { photo } : {}) }, values: values(form) });
  }
  const order = await ctx.orders.get(orderId);
  if (!order.ok || order.data.detailCenterId !== ctx.center.id) return stamp({ error: ordersCopy.notFound });
  const fileId = text(form, "fileId") || crypto.randomUUID();
  const result = await ctx.repo.uploadEvidence({
    ...parsed.data,
    order: order.data,
    fileId: /^[0-9a-f-]{36}$/i.test(fileId) ? fileId : crypto.randomUUID(),
    file,
  });
  return after(orderId, result, form, executionCopy.uploaded);
}

export async function removeEvidenceAction(
  _prev: ExecutionFormState,
  form: FormData,
): Promise<ExecutionFormState> {
  const ctx = await context("orderExecution");
  if (!ctx) return stamp({ error: executionCopy.forbidden });
  const orderId = text(form, "orderId");
  const parsed = removeEvidenceSchema.safeParse({
    evidenceId: text(form, "evidenceId"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["evidenceId"], form));
  return after(orderId, await ctx.repo.removeEvidence(parsed.data.evidenceId, parsed.data.reason), form);
}

export async function recordConsumptionAction(
  _prev: ExecutionFormState,
  form: FormData,
): Promise<ExecutionFormState> {
  const ctx = await context("orderExecution");
  if (!ctx) return stamp({ error: executionCopy.forbidden });
  const orderId = text(form, "orderId");
  const parsed = consumptionFormSchema.safeParse({
    itemId: text(form, "itemId"),
    inventoryItemId: text(form, "inventoryItemId"),
    actualQuantity: text(form, "actualQuantity"),
    note: text(form, "note"),
  });
  if (!parsed.success) {
    return stamp(validationState(fieldErrors(parsed.error), ["itemId", "inventoryItemId"], form));
  }
  return after(orderId, await ctx.repo.recordConsumption(parsed.data), form);
}

export async function reportIncidentAction(
  _prev: ExecutionFormState,
  form: FormData,
): Promise<ExecutionFormState> {
  const ctx = await context("orderExecution");
  if (!ctx) return stamp({ error: executionCopy.forbidden });
  const orderId = text(form, "orderId");
  const parsed = incidentFormSchema.safeParse({
    orderId,
    kind: text(form, "kind"),
    description: text(form, "description"),
    itemId: text(form, "itemId"),
  });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["orderId"], form));
  return after(orderId, await ctx.repo.reportIncident(parsed.data), form);
}

export async function resolveIncidentAction(
  _prev: ExecutionFormState,
  form: FormData,
): Promise<ExecutionFormState> {
  const ctx = await context("orderExecution");
  if (!ctx) return stamp({ error: executionCopy.forbidden });
  const orderId = text(form, "orderId");
  const parsed = resolveIncidentSchema.safeParse({
    incidentId: text(form, "incidentId"),
    resolution: text(form, "resolution"),
  });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["incidentId"], form));
  return after(orderId, await ctx.repo.resolveIncident(parsed.data.incidentId, parsed.data.resolution), form);
}

/** Alta o edición de un insumo de la organización (admin corporativo). */
export async function upsertInventoryItemAction(
  _prev: ExecutionFormState,
  form: FormData,
): Promise<ExecutionFormState> {
  const ctx = await context("supplies");
  if (!ctx || !canManageServices(ctx.state)) return stamp({ error: catalogCopy.forbidden });
  const parsed = inventoryItemSchema.safeParse({
    organizationId: ctx.center.organizationId,
    id: text(form, "id"),
    code: text(form, "code"),
    name: text(form, "name"),
    unit: text(form, "unit"),
    unitCost: text(form, "unitCost"),
    active: text(form, "active") === "1",
    reason: text(form, "reason"),
  });
  if (!parsed.success)
    return stamp(validationState(fieldErrors(parsed.error), ["organizationId", "id"], form));
  const result = await ctx.repo.upsertInventoryItem(parsed.data);
  revalidatePath("/catalogo/insumos");
  if (!result.ok) {
    const message = result.error.code === "23505" ? catalogCopy.codeTaken : errorMessage(result.error);
    return stamp({ error: message, values: values(form) });
  }
  return stamp({ message: executionCopy.saved });
}

/** Estándar de insumo por unidad del servicio (vacío = quitarlo). */
export async function setSupplyStandardAction(
  _prev: ExecutionFormState,
  form: FormData,
): Promise<ExecutionFormState> {
  const ctx = await context("catalogDetail");
  if (!ctx || !canManageServices(ctx.state)) return stamp({ error: catalogCopy.forbidden });
  const serviceId = text(form, "serviceId");
  const parsed = supplyStandardSchema.safeParse({
    serviceId,
    inventoryItemId: text(form, "inventoryItemId"),
    quantity: text(form, "intent") === "remove" ? "" : text(form, "quantity"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["serviceId"], form));
  const result = await ctx.repo.setSupplyStandard(parsed.data);
  revalidatePath(`/catalogo/${serviceId}`);
  if (!result.ok) return stamp({ error: errorMessage(result.error), values: values(form) });
  return stamp({ message: executionCopy.saved });
}
