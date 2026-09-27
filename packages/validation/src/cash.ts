import { CASH_NOTE_MIN, CASH_NOTES_MAX, CASH_SHIFTS, closeNoteRequired } from "@meguiars/domain";
import { z } from "zod";
import { moneySchema } from "./catalog";
import { changeReasonSchema } from "./centers";

/**
 * Validación del corte de caja, compartida por web (server actions) y móvil.
 * La base vuelve a validar (permisos, una caja abierta por centro, versión y
 * nota obligatoria si hay diferencia contra el esperado que ella calcula).
 */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalNotes = z.preprocess(
  blankToUndefined,
  z.string().trim().max(CASH_NOTES_MAX, `Usa como máximo ${CASH_NOTES_MAX} caracteres`).optional(),
);

export const cashShiftSchema = z.enum(CASH_SHIFTS, { message: "Elige el turno" });

export const openCashSchema = z.object({
  detailCenterId: z.uuid(),
  requestId: z.uuid(),
  shift: cashShiftSchema,
  openingFloat: moneySchema,
  notes: optionalNotes,
});

/** Cierre: el esperado es el que se mostró al encargado (la base lo recalcula). */
export const closeCashSchema = z
  .object({
    sessionId: z.uuid(),
    version: z.coerce.number().int().min(1),
    requestId: z.uuid(),
    countedCash: moneySchema,
    notes: optionalNotes,
    expectedCash: z.coerce.number().optional(),
  })
  .superRefine((v, ctx) => {
    if (
      v.expectedCash !== undefined &&
      closeNoteRequired(v.countedCash, v.expectedCash) &&
      (v.notes ?? "").length < CASH_NOTE_MIN
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["notes"],
        message: "Explica la diferencia (faltante o sobrante)",
      });
    }
  });

export const reopenCashSchema = z.object({
  sessionId: z.uuid(),
  version: z.coerce.number().int().min(1),
  reason: changeReasonSchema,
});

export type OpenCashInput = z.infer<typeof openCashSchema>;
export type CloseCashInput = z.infer<typeof closeCashSchema>;
export type ReopenCashInput = z.infer<typeof reopenCashSchema>;
