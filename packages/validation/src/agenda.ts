import {
  APPOINTMENT_STATUSES,
  STATUS_NEEDS_REASON,
  zonedToUtc,
  type CreateAppointmentCommand,
  type UpdateAppointmentCommand,
} from "@meguiars/domain";
import { z } from "zod";
import { changeReasonSchema } from "./centers";

/**
 * Validación de la agenda, compartida por web (server actions) y móvil. El
 * formulario captura fecha y hora del centro; toAppointmentCommand las
 * convierte a UTC con la zona horaria del centro (igual en ambas apps).
 */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const optionalUuid = z.preprocess(blankToUndefined, z.uuid().optional());

export const dayStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
export const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:MM)");

export const appointmentDurationSchema = z.preprocess(
  blankToUndefined,
  z.coerce
    .number({ message: "Duración inválida" })
    .int("Usa minutos enteros")
    .min(5, "Mínimo 5 minutos")
    .max(1440, "Máximo 24 horas")
    .optional(),
);

const serviceIdsSchema = z
  .array(z.uuid())
  .min(1, "Elige al menos un servicio")
  .transform((ids) => [...new Set(ids)]);

const optionalReason = z.preprocess(blankToUndefined, changeReasonSchema.optional());

/** Formulario de cita / walk-in (campos planos, iguales en web y móvil). */
export const appointmentFormSchema = z
  .object({
    vehicleId: z.uuid({ message: "Elige el vehículo" }),
    serviceIds: serviceIdsSchema,
    walkIn: z.boolean(),
    date: z.preprocess(blankToUndefined, dayStringSchema.optional()),
    time: z.preprocess(blankToUndefined, timeStringSchema.optional()),
    durationMinutes: appointmentDurationSchema,
    bayId: optionalUuid,
    technicianId: optionalUuid,
    notes: z.preprocess(blankToUndefined, z.string().trim().max(2000).optional()),
    overrideReason: optionalReason,
  })
  .superRefine((v, ctx) => {
    if (v.walkIn) return;
    if (!v.date) ctx.addIssue({ code: "custom", path: ["date"], message: "Elige la fecha" });
    if (!v.time) ctx.addIssue({ code: "custom", path: ["time"], message: "Elige la hora" });
  });
export type AppointmentForm = z.infer<typeof appointmentFormSchema>;

/** Formulario validado → comando de alta (hora local del centro → UTC). */
export function toCreateAppointmentCommand(
  form: AppointmentForm,
  context: { detailCenterId: string; requestId: string; clientId: string; timeZone: string },
): CreateAppointmentCommand {
  return {
    detailCenterId: context.detailCenterId,
    requestId: context.requestId,
    clientId: context.clientId,
    vehicleId: form.vehicleId,
    serviceIds: form.serviceIds,
    startsAt: form.date && form.time ? zonedToUtc(form.date, form.time, context.timeZone) : undefined,
    durationMinutes: form.durationMinutes,
    bayId: form.bayId,
    technicianId: form.technicianId,
    notes: form.notes,
    walkIn: form.walkIn,
    overrideReason: form.overrideReason,
  };
}

export const createAppointmentSchema = z
  .object({
    detailCenterId: z.uuid(),
    requestId: z.uuid(),
    clientId: z.uuid(),
    vehicleId: z.uuid(),
    serviceIds: serviceIdsSchema,
    startsAt: z.iso.datetime({ offset: true }).optional(),
    durationMinutes: appointmentDurationSchema,
    bayId: optionalUuid,
    technicianId: optionalUuid,
    notes: z.string().trim().max(2000).optional(),
    walkIn: z.boolean(),
    overrideReason: optionalReason,
  })
  .refine((v) => v.walkIn || v.startsAt, { path: ["startsAt"], message: "Elige fecha y hora" });

/** Reprogramar: mismos campos que el alta (sin cliente) más el motivo. */
export const rescheduleFormSchema = z.object({
  serviceIds: serviceIdsSchema,
  date: dayStringSchema,
  time: timeStringSchema,
  durationMinutes: z.coerce
    .number({ message: "Duración inválida" })
    .int()
    .min(5, "Mínimo 5 minutos")
    .max(1440),
  bayId: optionalUuid,
  technicianId: optionalUuid,
  notes: z.preprocess(blankToUndefined, z.string().trim().max(2000).optional()),
  reason: changeReasonSchema,
  overrideReason: optionalReason,
});
export type RescheduleForm = z.infer<typeof rescheduleFormSchema>;

export function toUpdateAppointmentCommand(
  form: RescheduleForm,
  context: { id: string; timeZone: string },
): UpdateAppointmentCommand {
  return {
    id: context.id,
    serviceIds: form.serviceIds,
    startsAt: zonedToUtc(form.date, form.time, context.timeZone),
    durationMinutes: form.durationMinutes,
    bayId: form.bayId,
    technicianId: form.technicianId,
    notes: form.notes,
    reason: form.reason,
    overrideReason: form.overrideReason,
  };
}

export const updateAppointmentSchema = z.object({
  id: z.uuid(),
  serviceIds: serviceIdsSchema,
  startsAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().min(5).max(1440),
  bayId: optionalUuid,
  technicianId: optionalUuid,
  notes: z.string().trim().max(2000).optional(),
  reason: changeReasonSchema,
  overrideReason: optionalReason,
});

export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);

export const setStatusSchema = z
  .object({
    id: z.uuid(),
    status: appointmentStatusSchema,
    reason: z.preprocess(blankToUndefined, z.string().trim().max(500).optional()),
  })
  .superRefine((v, ctx) => {
    if (STATUS_NEEDS_REASON.includes(v.status) && (!v.reason || v.reason.length < 3)) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Escribe el motivo (mínimo 3 caracteres)" });
    }
  });

export const upsertResourceSchema = z.object({
  detailCenterId: z.uuid(),
  id: optionalUuid,
  name: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(1, "Escribe el nombre").max(120, "Usa como máximo 120 caracteres")),
  active: z.boolean(),
  reason: changeReasonSchema,
});

export const agendaFilterSchema = z.object({
  day: dayStringSchema,
  status: z.preprocess(blankToUndefined, appointmentStatusSchema.optional()),
  bayId: optionalUuid,
  technicianId: optionalUuid,
});
