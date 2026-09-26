"use server";

import {
  activeCenterAccess,
  guardScreen,
  orderErrorMessage,
  ordersCopy,
  type OrderMutation,
  type RepoError,
  type Result,
  type Screen,
} from "@meguiars/domain";
import { createServiceOrderRepository } from "@meguiars/supabase";
import {
  discountFormSchema,
  fieldErrors,
  fromAppointmentFormSchema,
  linesFromQuantities,
  newOrderFormSchema,
  orderDetailsFormSchema,
  paymentFormSchema,
  setOrderItemSchema,
  setOrderStatusSchema,
  toCreateServiceOrderCommand,
  toUpdateOrderDetailsCommand,
  voidDiscountSchema,
} from "@meguiars/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth/dal";
import { stamp, text, validationState, values, type ActionFormState } from "@/lib/form-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OrderFormState = ActionFormState;

/** Centro activo del servidor (nunca uno enviado por el cliente) y repositorio. */
async function context(screen: Screen) {
  const state = await getAuthState();
  if (!guardScreen(state, screen).allow) return null;
  const active = activeCenterAccess(state);
  const supabase = await createSupabaseServerClient();
  if (!active || !supabase) return null;
  return { center: active.center, repo: createServiceOrderRepository(supabase) };
}

/** Cantidades `qty:<serviceId>` del formulario → mapa servicio → cantidad. */
function quantities(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("qty:") && typeof value === "string") out[key.slice(4)] = value;
  }
  return out;
}

const version = (form: FormData) => Number(text(form, "version"));

/** Resultado de una edición: si otro dispositivo guardó antes, recarga la versión vigente. */
function afterMutation(
  orderId: string,
  result: Result<OrderMutation>,
  form: FormData,
  message: string = ordersCopy.saved,
): OrderFormState {
  revalidatePath(`/ordenes/${orderId}`);
  revalidatePath("/ordenes");
  if (!result.ok) {
    return stamp({ error: orderErrorMessage(result.error), values: stale(result.error) ? {} : values(form) });
  }
  return stamp({ message });
}

const stale = (error: RepoError) => error.code === "40001";

export async function createOrderAction(_prev: OrderFormState, form: FormData): Promise<OrderFormState> {
  const ctx = await context("orderNew");
  if (!ctx) return stamp({ error: ordersCopy.notFound });
  const parsed = newOrderFormSchema.safeParse({
    vehicleId: text(form, "vehicleId"),
    channel: text(form, "channel") || "b2c",
    channelReference: text(form, "channelReference"),
    lines: linesFromQuantities(quantities(form)),
    bayId: text(form, "bayId"),
    technicianId: text(form, "technicianId"),
    observations: text(form, "observations"),
    odometerKm: text(form, "odometerKm"),
    promisedDate: text(form, "promisedDate"),
    promisedTime: text(form, "promisedTime"),
  });
  if (!parsed.success) return stamp({ fields: fieldErrors(parsed.error), values: values(form) });
  const result = await ctx.repo.create(
    toCreateServiceOrderCommand(parsed.data, {
      detailCenterId: ctx.center.id,
      requestId: text(form, "requestId"),
      clientId: text(form, "clientId"),
      timeZone: ctx.center.timezone,
    }),
  );
  if (!result.ok) return stamp({ error: orderErrorMessage(result.error), values: values(form) });
  revalidatePath("/ordenes");
  redirect(`/ordenes/${result.data.id}?nueva=1`);
}

export async function createFromAppointmentAction(
  _prev: OrderFormState,
  form: FormData,
): Promise<OrderFormState> {
  const ctx = await context("orderNew");
  if (!ctx) return stamp({ error: ordersCopy.notFound });
  const appointmentId = text(form, "appointmentId");
  const parsed = fromAppointmentFormSchema.safeParse({
    channel: text(form, "channel") || "b2c",
    channelReference: text(form, "channelReference"),
    odometerKm: text(form, "odometerKm"),
  });
  if (!parsed.success) return stamp({ fields: fieldErrors(parsed.error), values: values(form) });
  const result = await ctx.repo.createFromAppointment({
    ...parsed.data,
    appointmentId,
    requestId: text(form, "requestId"),
  });
  if (!result.ok) return stamp({ error: orderErrorMessage(result.error), values: values(form) });
  revalidatePath(`/agenda/${appointmentId}`);
  revalidatePath("/ordenes");
  redirect(`/ordenes/${result.data.id}?nueva=1`);
}

export async function setItemAction(_prev: OrderFormState, form: FormData): Promise<OrderFormState> {
  const ctx = await context("orderNew");
  if (!ctx) return stamp({ error: ordersCopy.notFound });
  const orderId = text(form, "orderId");
  const parsed = setOrderItemSchema.safeParse({
    orderId,
    version: version(form),
    serviceId: text(form, "serviceId"),
    // "Quitar" envía intent=remove: cantidad 0.
    quantity: text(form, "intent") === "remove" ? 0 : text(form, "quantity"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return stamp(validationState(fieldErrors(parsed.error), ["orderId", "version"], form));
  return afterMutation(orderId, await ctx.repo.setItem(parsed.data), form);
}

export async function addDiscountAction(_prev: OrderFormState, form: FormData): Promise<OrderFormState> {
  const ctx = await context("orderNew");
  if (!ctx) return stamp({ error: ordersCopy.notFound });
  const orderId = text(form, "orderId");
  const parsed = discountFormSchema.safeParse({
    itemId: text(form, "itemId"),
    kind: text(form, "kind"),
    value: text(form, "value"),
    reason: text(form, "reason"),
  });
  if (!parsed.success) return stamp({ fields: fieldErrors(parsed.error), values: values(form) });
  return afterMutation(
    orderId,
    await ctx.repo.addDiscount({ ...parsed.data, orderId, version: version(form) }),
    form,
  );
}

export async function voidDiscountAction(_prev: OrderFormState, form: FormData): Promise<OrderFormState> {
  const ctx = await context("orderNew");
  if (!ctx) return stamp({ error: ordersCopy.notFound });
  const orderId = text(form, "orderId");
  const parsed = voidDiscountSchema.safeParse({
    orderId,
    version: version(form),
    discountId: text(form, "discountId"),
    reason: text(form, "voidReason"),
  });
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    return stamp({
      fields: { voidReason: errors.reason ?? Object.values(errors)[0] ?? "" },
      values: values(form),
    });
  }
  return afterMutation(orderId, await ctx.repo.voidDiscount(parsed.data), form);
}

export async function setOrderStatusAction(_prev: OrderFormState, form: FormData): Promise<OrderFormState> {
  const ctx = await context("orderNew");
  if (!ctx) return stamp({ error: ordersCopy.notFound });
  const orderId = text(form, "orderId");
  const parsed = setOrderStatusSchema.safeParse({
    orderId,
    version: version(form),
    status: text(form, "status"),
    reason: text(form, "statusReason"),
  });
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    return stamp({
      fields: { statusReason: errors.reason ?? Object.values(errors)[0] ?? "" },
      values: values(form),
    });
  }
  const result = await ctx.repo.setStatus(parsed.data);
  if (result.ok) revalidatePath("/agenda");
  return afterMutation(orderId, result, form);
}

export async function updateDetailsAction(_prev: OrderFormState, form: FormData): Promise<OrderFormState> {
  const ctx = await context("orderNew");
  if (!ctx) return stamp({ error: ordersCopy.notFound });
  const orderId = text(form, "orderId");
  const parsed = orderDetailsFormSchema.safeParse({
    channel: text(form, "channel"),
    channelReference: text(form, "channelReference"),
    bayId: text(form, "bayId"),
    technicianId: text(form, "technicianId"),
    diagnosis: text(form, "diagnosis"),
    observations: text(form, "observations"),
    recommendations: text(form, "recommendations"),
    nextVisitOn: text(form, "nextVisitOn"),
    nextVisitServiceId: text(form, "nextVisitServiceId"),
    nextVisitNotes: text(form, "nextVisitNotes"),
    odometerKm: text(form, "odometerKm"),
    promisedDate: text(form, "promisedDate"),
    promisedTime: text(form, "promisedTime"),
  });
  if (!parsed.success) return stamp({ fields: fieldErrors(parsed.error), values: values(form) });
  return afterMutation(
    orderId,
    await ctx.repo.updateDetails(
      toUpdateOrderDetailsCommand(parsed.data, {
        orderId,
        version: version(form),
        timeZone: ctx.center.timezone,
      }),
    ),
    form,
  );
}

export async function recordPaymentAction(_prev: OrderFormState, form: FormData): Promise<OrderFormState> {
  const ctx = await context("orderNew");
  if (!ctx) return stamp({ error: ordersCopy.notFound });
  const orderId = text(form, "orderId");
  const parsed = paymentFormSchema.safeParse({
    amount: text(form, "amount"),
    method: text(form, "method"),
    reference: text(form, "reference"),
  });
  if (!parsed.success) return stamp({ fields: fieldErrors(parsed.error), values: values(form) });
  return afterMutation(
    orderId,
    await ctx.repo.recordPayment({ ...parsed.data, orderId, version: version(form) }),
    form,
  );
}
