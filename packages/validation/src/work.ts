import { z } from "zod";
import { changeReasonSchema } from "./centers";

/**
 * Validación de «Mi día» (técnico / lavador), compartida por web y móvil. La
 * base vuelve a validar la asignación, el estado de la OS y los límites.
 */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalUuid = z.preprocess(blankToUndefined, z.uuid().optional());

export const myWorkDaySchema = z.object({
  detailCenterId: z.uuid(),
  day: z.preprocess(blankToUndefined, z.iso.date("Fecha inválida").optional()),
});

export const myWorkDoneSchema = z.object({
  itemId: z.uuid(),
  note: z.preprocess(
    blankToUndefined,
    z.string().trim().max(1000, "Usa como máximo 1000 caracteres").optional(),
  ),
});

export const myWorkCommentSchema = z.object({
  orderId: z.uuid(),
  itemId: optionalUuid,
  note: z.string().trim().min(1, "Escribe el comentario").max(1000, "Usa como máximo 1000 caracteres"),
});

export const myWorkProblemSchema = z.object({
  orderId: z.uuid(),
  itemId: optionalUuid,
  description: z
    .string()
    .trim()
    .min(3, "Describe el problema (mínimo 3 caracteres)")
    .max(2000, "Usa como máximo 2000 caracteres"),
});

export const linkTechnicianSchema = z.object({
  technicianId: z.uuid(),
  userId: z.preprocess(blankToUndefined, z.uuid().nullable().optional()).transform((v) => v ?? null),
  reason: changeReasonSchema,
});
