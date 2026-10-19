import {
  ASSISTANT_LIMITS,
  ASSISTANT_MODELS,
  ASSISTANT_MODES,
  CENTER_CHOICES,
  HANDOFF_CODES,
  REQUIRED_HANDOFF_CODES,
  normalizeTestNumber,
} from "@meguiars/domain";
import { z } from "zod";
import { changeReasonSchema } from "./centers";

/**
 * Validación del asistente de WhatsApp (configuración). La base vuelve a
 * validar permisos (sólo admin), límites y versiones.
 */

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const checkbox = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());
const optionalText = (max: number, min = 3) =>
  z.preprocess(
    blankToNull,
    z.string().trim().min(min, `Mínimo ${min} caracteres`).max(max, `Máximo ${max} caracteres`).nullable(),
  );
const httpsUrl = z.preprocess(
  blankToNull,
  z
    .string()
    .trim()
    .max(500, "Máximo 500 caracteres")
    .regex(/^https:\/\/\S+$/, "Debe empezar con https://")
    .nullable(),
);

export const assistantSettingsSchema = z
  .object({
    organizationId: z.uuid(),
    version: z.coerce.number().int().min(1),
    mode: z.enum(ASSISTANT_MODES, { message: "Elige el modo" }),
    model: z.enum(ASSISTANT_MODELS, { message: "Elige el modelo" }),
    assistantName: z.string().trim().min(2, "Mínimo 2 caracteres").max(40, "Máximo 40 caracteres"),
    tone: z.string().trim().min(3, "Mínimo 3 caracteres").max(300, "Máximo 300 caracteres"),
    greeting: optionalText(500),
    privacyUrl: httpsUrl,
    humanHours: optionalText(200),
    afterHoursMessage: optionalText(500),
    centerChoice: z.enum(CENTER_CHOICES),
    maxDaysAhead: z.coerce
      .number()
      .int()
      .min(
        ASSISTANT_LIMITS.maxDaysAhead.min,
        `Entre ${ASSISTANT_LIMITS.maxDaysAhead.min} y ${ASSISTANT_LIMITS.maxDaysAhead.max}`,
      )
      .max(
        ASSISTANT_LIMITS.maxDaysAhead.max,
        `Entre ${ASSISTANT_LIMITS.maxDaysAhead.min} y ${ASSISTANT_LIMITS.maxDaysAhead.max}`,
      ),
    minHoursAhead: z.coerce
      .number()
      .int()
      .min(
        ASSISTANT_LIMITS.minHoursAhead.min,
        `Entre ${ASSISTANT_LIMITS.minHoursAhead.min} y ${ASSISTANT_LIMITS.minHoursAhead.max}`,
      )
      .max(
        ASSISTANT_LIMITS.minHoursAhead.max,
        `Entre ${ASSISTANT_LIMITS.minHoursAhead.min} y ${ASSISTANT_LIMITS.minHoursAhead.max}`,
      ),
    mentionPromotions: checkbox,
    mentionMemberships: checkbox,
    selfBooking: checkbox,
    /** Texto con un número por línea o separados por coma / punto y coma. */
    testNumbers: z.preprocess(
      (v) =>
        (Array.isArray(v) ? v.join("\n") : String(v ?? ""))
          .split(/[\n,;]+/)
          .map((x) => x.trim())
          .filter(Boolean),
      z.array(z.string()),
    ),
    reason: changeReasonSchema,
  })
  .transform((v, ctx) => {
    const numbers: string[] = [];
    for (const raw of v.testNumbers) {
      const n = normalizeTestNumber(raw);
      if (!n) {
        ctx.addIssue({
          code: "custom",
          path: ["testNumbers"],
          message: `Número inválido: ${raw} (10 a 15 dígitos)`,
        });
        return z.NEVER;
      }
      if (!numbers.includes(n)) numbers.push(n);
    }
    if (numbers.length > ASSISTANT_LIMITS.testNumbers) {
      ctx.addIssue({
        code: "custom",
        path: ["testNumbers"],
        message: `Máximo ${ASSISTANT_LIMITS.testNumbers} números de prueba`,
      });
      return z.NEVER;
    }
    if (v.mode === "prueba" && numbers.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["testNumbers"],
        message: "El modo prueba necesita al menos un número",
      });
      return z.NEVER;
    }
    return { ...v, testNumbers: numbers };
  });

export const assistantFaqSchema = z.object({
  organizationId: z.uuid(),
  id: z.preprocess(blankToNull, z.uuid().nullable()),
  version: z.preprocess(blankToNull, z.coerce.number().int().min(1).nullable()),
  detailCenterId: z.preprocess(blankToNull, z.uuid().nullable()),
  question: z.string().trim().min(3, "Mínimo 3 caracteres").max(300, "Máximo 300 caracteres"),
  answer: z.string().trim().min(2, "Mínimo 2 caracteres").max(1000, "Máximo 1000 caracteres"),
  position: z.preprocess((v) => (v === "" || v == null ? 100 : v), z.coerce.number().int().min(1).max(999)),
  active: checkbox,
  reason: changeReasonSchema,
});

export const handoffRuleSchema = z
  .object({
    organizationId: z.uuid(),
    code: z.enum(HANDOFF_CODES),
    version: z.coerce.number().int().min(1),
    active: checkbox,
    assignTo: z.preprocess(blankToNull, z.uuid().nullable()),
    message: optionalText(300),
    reason: changeReasonSchema,
  })
  .refine((v) => v.active || !REQUIRED_HANDOFF_CODES.includes(v.code), {
    path: ["active"],
    message: "Esta regla no se puede desactivar",
  });

export const assistantServiceSchema = z.object({
  organizationId: z.uuid(),
  serviceId: z.uuid(),
  visible: checkbox,
  bookable: checkbox,
  priceVariesBySize: checkbox,
  reason: changeReasonSchema,
});

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/**
 * Datos públicos del centro. El horario llega del formulario como
 * opens_1..opens_7 / closes_1..closes_7 (vacío = cerrado ese día).
 */
export const centerPublicInfoSchema = z
  .object({
    detailCenterId: z.uuid(),
    version: z.preprocess(blankToNull, z.coerce.number().int().min(1).nullable()),
    address: optionalText(300, 5),
    phone: z.preprocess(
      blankToNull,
      z
        .string()
        .trim()
        .regex(/^[0-9 +()-]{7,25}$/, "Teléfono inválido")
        .nullable(),
    ),
    mapsUrl: httpsUrl,
    directions: optionalText(500, 2),
    nearbyZones: z.preprocess(
      (v) =>
        String(v ?? "")
          .split(/[\n,;]+/)
          .map((x) => x.trim())
          .filter(Boolean),
      z.array(z.string().max(60, "Cada zona: máximo 60 caracteres")).max(40, "Máximo 40 zonas"),
    ),
    handoffUserId: z.preprocess(blankToNull, z.uuid().nullable()),
    hours: z.array(
      z.object({
        weekday: z.number().int().min(1).max(7),
        opens: z.string().regex(TIME, "Hora inválida (HH:MM)"),
        closes: z.string().regex(TIME, "Hora inválida (HH:MM)"),
      }),
    ),
    reason: changeReasonSchema,
  })
  .superRefine((v, ctx) => {
    v.hours.forEach((h, i) => {
      if (h.closes <= h.opens)
        ctx.addIssue({
          code: "custom",
          path: ["hours", i, "closes"],
          message: "Debe cerrar después de abrir",
        });
    });
  });

/** Lee el horario de un FormData (opens_N / closes_N; ambos vacíos = cerrado). */
export function hoursFromForm(get: (name: string) => string | null): {
  hours: { weekday: number; opens: string; closes: string }[];
  errors: string[];
} {
  const hours: { weekday: number; opens: string; closes: string }[] = [];
  const errors: string[] = [];
  for (let d = 1; d <= 7; d++) {
    const opens = (get(`opens_${d}`) ?? "").trim();
    const closes = (get(`closes_${d}`) ?? "").trim();
    if (!opens && !closes) continue;
    if (!opens || !closes) errors.push(`Día ${d}: indica apertura y cierre, o deja ambos vacíos`);
    else hours.push({ weekday: d, opens, closes });
  }
  return { hours, errors };
}
