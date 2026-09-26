import {
  ORDER_STATUS_NEEDS_REASON,
  PAYMENT_METHODS,
  SALES_CHANNELS,
  SERVICE_ORDER_STATUSES,
  zonedToUtc,
  type CreateServiceOrderCommand,
  type UpdateOrderDetailsCommand,
} from "@meguiars/domain";
import { z } from "zod";
import { dayStringSchema, timeStringSchema } from "./agenda";
import { moneySchema } from "./catalog";
import { changeReasonSchema } from "./centers";

/**
 * Validación de la Orden de Servicio, compartida por web (server actions) y
 * móvil. Los formularios envían texto; aquí se convierte a números y las
 * fechas/horas del centro a UTC (igual en ambas apps). La base vuelve a
 * validar todo y recalcula los importes.
 */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalUuid = z.preprocess(blankToUndefined, z.uuid().optional());
const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, `Usa como máximo ${max} caracteres`).optional());
const optionalReason = z.preprocess(blankToUndefined, changeReasonSchema.optional());

export const salesChannelSchema = z.enum(SALES_CHANNELS, { message: "Elige el canal" });
export const orderStatusSchema = z.enum(SERVICE_ORDER_STATUSES);
export const paymentMethodSchema = z.enum(PAYMENT_METHODS, { message: "Elige la forma de pago" });

export const quantitySchema = z.coerce
  .number({ message: "Cantidad inválida" })
  .int("Usa cantidades enteras")
  .min(1, "Mínimo 1")
  .max(99, "Máximo 99");

export const odometerSchema = z.preprocess(
  (v) => (typeof v === "string" ? blankToUndefined(v.replace(/[,\s]/g, "")) : v),
  z.coerce
    .number({ message: "Kilometraje inválido" })
    .int("Usa kilómetros enteros")
    .min(0, "Kilometraje inválido")
    .max(2_000_000, "Kilometraje inválido")
    .optional(),
);

const linesSchema = z
  .array(z.object({ serviceId: z.uuid(), quantity: quantitySchema }))
  .min(1, "Agrega al menos un servicio o producto")
  .refine((lines) => new Set(lines.map((l) => l.serviceId)).size === lines.length, "Servicio repetido");

/** Referencia del canal: obligatoria al autorizar membresía/B2B (la base lo exige); aquí sólo formato. */
const channelReferenceSchema = optionalText(80);

const promisedFields = {
  promisedDate: z.preprocess(blankToUndefined, dayStringSchema.optional()),
  promisedTime: z.preprocess(blankToUndefined, timeStringSchema.optional()),
};

const promisedRefine = (
  v: { promisedDate?: string | undefined; promisedTime?: string | undefined },
  ctx: z.RefinementCtx,
) => {
  if (v.promisedDate && !v.promisedTime)
    ctx.addIssue({ code: "custom", path: ["promisedTime"], message: "Indica la hora prometida" });
  if (v.promisedTime && !v.promisedDate)
    ctx.addIssue({ code: "custom", path: ["promisedDate"], message: "Indica la fecha prometida" });
};

const toPromisedAt = (
  v: { promisedDate?: string | undefined; promisedTime?: string | undefined },
  timeZone: string,
) => (v.promisedDate && v.promisedTime ? zonedToUtc(v.promisedDate, v.promisedTime, timeZone) : undefined);

/** Formulario de OS walk-in (campos planos, iguales en web y móvil). */
export const newOrderFormSchema = z
  .object({
    vehicleId: z.uuid({ message: "Elige el vehículo" }),
    channel: salesChannelSchema,
    channelReference: channelReferenceSchema,
    lines: linesSchema,
    bayId: optionalUuid,
    technicianId: optionalUuid,
    observations: optionalText(4000),
    odometerKm: odometerSchema,
    ...promisedFields,
  })
  .superRefine(promisedRefine);
export type NewOrderForm = z.infer<typeof newOrderFormSchema>;

export function toCreateServiceOrderCommand(
  form: NewOrderForm,
  context: { detailCenterId: string; requestId: string; clientId: string; timeZone: string },
): CreateServiceOrderCommand {
  return {
    detailCenterId: context.detailCenterId,
    requestId: context.requestId,
    clientId: context.clientId,
    vehicleId: form.vehicleId,
    items: form.lines,
    channel: form.channel,
    channelReference: form.channelReference,
    bayId: form.bayId,
    technicianId: form.technicianId,
    observations: form.observations,
    odometerKm: form.odometerKm,
    promisedAt: toPromisedAt(form, context.timeZone),
  };
}

/**
 * Líneas capturadas como cantidades por servicio ("" o "0" = no incluido).
 * Web: campos `qty:<serviceId>`; móvil: el mismo mapa en su estado.
 */
export function linesFromQuantities(
  quantities: Record<string, string>,
): { serviceId: string; quantity: string }[] {
  return Object.entries(quantities)
    .filter(([, q]) => q.trim() !== "" && q.trim() !== "0")
    .map(([serviceId, quantity]) => ({ serviceId, quantity }));
}

export const createServiceOrderSchema = z.object({
  detailCenterId: z.uuid(),
  requestId: z.uuid(),
  clientId: z.uuid(),
  vehicleId: z.uuid(),
  items: linesSchema,
  channel: salesChannelSchema,
  channelReference: channelReferenceSchema,
  bayId: optionalUuid,
  technicianId: optionalUuid,
  observations: optionalText(4000),
  odometerKm: odometerSchema,
  promisedAt: z.iso.datetime({ offset: true }).optional(),
});

/** Abrir la OS desde una cita recibida: sólo canal, referencia y kilometraje. */
export const fromAppointmentFormSchema = z.object({
  channel: salesChannelSchema,
  channelReference: channelReferenceSchema,
  odometerKm: odometerSchema,
});

export const createFromAppointmentSchema = fromAppointmentFormSchema.extend({
  appointmentId: z.uuid(),
  requestId: z.uuid(),
  promisedAt: z.iso.datetime({ offset: true }).optional(),
});

const versioned = { orderId: z.uuid(), version: z.coerce.number().int().min(1) };

/** Agregar una línea o cambiar su cantidad (0 = quitarla). */
export const setOrderItemSchema = z.object({
  ...versioned,
  serviceId: z.uuid({ message: "Elige el servicio o producto" }),
  quantity: z.coerce
    .number({ message: "Cantidad inválida" })
    .int("Usa cantidades enteras")
    .min(0)
    .max(99, "Máximo 99"),
  reason: optionalReason,
});

/** Formulario de descuento (web y móvil): importe o porcentaje, con motivo. */
export const discountFormSchema = z
  .object({
    itemId: optionalUuid,
    kind: z.enum(["percent", "amount"], { message: "Elige el tipo" }),
    value: moneySchema.refine((n) => n > 0, "Debe ser mayor que 0"),
    reason: changeReasonSchema,
  })
  .superRefine((v, ctx) => {
    if (v.kind === "percent" && v.value > 100)
      ctx.addIssue({ code: "custom", path: ["value"], message: "Máximo 100 %" });
  });
export type DiscountForm = z.infer<typeof discountFormSchema>;

export const addDiscountSchema = z.object({ ...versioned }).and(discountFormSchema);

export const voidDiscountSchema = z.object({
  ...versioned,
  discountId: z.uuid(),
  reason: changeReasonSchema,
});

export const setOrderStatusSchema = z
  .object({
    ...versioned,
    status: orderStatusSchema,
    reason: z.preprocess(blankToUndefined, z.string().trim().max(500).optional()),
  })
  .superRefine((v, ctx) => {
    if (ORDER_STATUS_NEEDS_REASON.includes(v.status) && (!v.reason || v.reason.length < 3)) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Escribe el motivo (mínimo 3 caracteres)" });
    }
  });

/** Datos operativos de la OS (web y móvil). */
export const orderDetailsFormSchema = z
  .object({
    channel: salesChannelSchema,
    channelReference: channelReferenceSchema,
    bayId: optionalUuid,
    technicianId: optionalUuid,
    diagnosis: optionalText(4000),
    observations: optionalText(4000),
    recommendations: optionalText(4000),
    nextVisitOn: z.preprocess(blankToUndefined, dayStringSchema.optional()),
    nextVisitServiceId: optionalUuid,
    nextVisitNotes: optionalText(1000),
    odometerKm: odometerSchema,
    ...promisedFields,
  })
  .superRefine(promisedRefine);
export type OrderDetailsForm = z.infer<typeof orderDetailsFormSchema>;

export function toUpdateOrderDetailsCommand(
  form: OrderDetailsForm,
  context: { orderId: string; version: number; timeZone: string },
): UpdateOrderDetailsCommand {
  const { promisedDate: _d, promisedTime: _t, ...rest } = form;
  return {
    ...rest,
    orderId: context.orderId,
    version: context.version,
    promisedAt: toPromisedAt(form, context.timeZone),
  };
}

export const updateOrderDetailsSchema = z.object({
  ...versioned,
  channel: salesChannelSchema,
  channelReference: channelReferenceSchema,
  bayId: optionalUuid,
  technicianId: optionalUuid,
  diagnosis: optionalText(4000),
  observations: optionalText(4000),
  recommendations: optionalText(4000),
  nextVisitOn: z.preprocess(blankToUndefined, dayStringSchema.optional()),
  nextVisitServiceId: optionalUuid,
  nextVisitNotes: optionalText(1000),
  odometerKm: odometerSchema,
  promisedAt: z.iso.datetime({ offset: true }).optional(),
});

export const paymentFormSchema = z.object({
  amount: moneySchema.refine((n) => n > 0, "Debe ser mayor que 0"),
  method: paymentMethodSchema,
  reference: optionalText(80),
});

export const recordPaymentSchema = z.object({ ...versioned }).and(paymentFormSchema);

export const orderFilterSchema = z.object({
  status: z.preprocess(blankToUndefined, orderStatusSchema.optional()),
  query: optionalText(80),
});
