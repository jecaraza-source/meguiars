import {
  CONTACT_CHANNELS,
  CUSTOMER_SEGMENTS,
  NEXT_VISIT_STATES,
  TASK_CHANNELS,
  TASK_KINDS,
  TASK_OUTCOMES,
  TASK_STATUSES,
} from "@meguiars/domain";
import { z } from "zod";
import { changeReasonSchema } from "./centers";

/** Validación del CRM, compartida por web (server actions) y móvil. La base vuelve a validar consentimiento y permisos. */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, `Usa como máximo ${max} caracteres`).optional());
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

export const createTaskSchema = z.object({
  detailCenterId: z.uuid(),
  requestId: z.uuid(),
  clientId: z.uuid(),
  kind: z.enum(TASK_KINDS, { message: "Elige el tipo" }),
  channel: z.preprocess(blankToUndefined, z.enum(TASK_CHANNELS).optional()),
  dueOn: isoDate,
  notes: optionalText(1000),
  vehicleId: z.preprocess(blankToUndefined, z.uuid().optional()),
});

export const completeTaskSchema = z.object({
  taskId: z.uuid(),
  outcome: z.enum(TASK_OUTCOMES, { message: "Elige el resultado" }),
  notes: optionalText(1000),
});

export const cancelTaskSchema = z.object({ taskId: z.uuid(), reason: changeReasonSchema });

export const rescheduleTaskSchema = z.object({
  taskId: z.uuid(),
  dueOn: isoDate,
  reason: changeReasonSchema,
});

export const contactPreferenceSchema = z.object({
  clientId: z.uuid(),
  channel: z.enum(CONTACT_CHANNELS),
  optedIn: z.boolean(),
  source: z.enum(["web", "mobile"]),
  reason: changeReasonSchema,
});

export const crmCustomerFilterSchema = z.object({
  segment: z.preprocess(blankToUndefined, z.enum(CUSTOMER_SEGMENTS).optional()),
  due: z.preprocess(blankToUndefined, z.enum(NEXT_VISIT_STATES).optional()),
  query: optionalText(80),
});

export const crmTaskFilterSchema = z.object({
  status: z.preprocess(blankToUndefined, z.enum(TASK_STATUSES).optional()),
  due: z.preprocess(blankToUndefined, z.enum(["vencidas", "hoy", "proximas"]).optional()),
});
