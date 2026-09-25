import { REVENUE_ENGINES } from "@meguiars/domain";
import { z } from "zod";
import { changeReasonSchema } from "./centers";

/**
 * Validación del catálogo, compartida por web (server actions) y móvil. Los
 * formularios envían texto; aquí se convierte a número (igual en ambas apps).
 */

const MAX_AMOUNT = 99_999_999.99;

/** Importe en MXN: ≥ 0, máximo 2 decimales. Acepta "1,250.50" o "$1250". */
export const moneySchema = z
  .union([z.number(), z.string()])
  // "" no es 0: un importe vacío es un campo faltante.
  .transform((v) =>
    typeof v === "number" ? v : v.trim() === "" ? Number.NaN : Number(v.replace(/[$,\s]/g, "")),
  )
  .pipe(
    z
      .number({ message: "Importe inválido" })
      .refine((n) => Number.isFinite(n), "Importe inválido")
      .refine((n) => n >= 0, "El importe no puede ser negativo")
      .refine((n) => n <= MAX_AMOUNT, "Importe demasiado alto")
      .refine((n) => Math.round(n * 100) === Math.round(n * 100 * 1e6) / 1e6, "Usa máximo 2 decimales"),
  );

/** Importe opcional: "" o ausente = sin valor propio (usa el base). */
export const optionalMoneySchema = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? undefined : v))
  .pipe(moneySchema.optional());

export const serviceCodeSchema = z
  .string()
  .transform((v) => v.trim().toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9-]{2,20}$/, "Clave inválida: 2 a 20 mayúsculas, dígitos o guion"));

export const durationMinutesSchema = z.coerce
  .number({ message: "Duración inválida" })
  .int("Usa minutos enteros")
  .min(5, "Mínimo 5 minutos")
  .max(1440, "Máximo 24 horas");

export const revenueEngineSchema = z.enum(REVENUE_ENGINES, { message: "Elige el motor de ingreso" });

const serviceFields = {
  name: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(
      z.string().min(2, "Escribe el nombre (mínimo 2 caracteres)").max(120, "Usa como máximo 120 caracteres"),
    ),
  description: z
    .string()
    .trim()
    .max(2000, "Usa como máximo 2000 caracteres")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  revenueEngine: revenueEngineSchema,
  standardDurationMinutes: durationMinutesSchema,
  basePrice: moneySchema,
  standardDirectCost: moneySchema,
};

export const createServiceSchema = z.object({
  organizationId: z.uuid(),
  code: serviceCodeSchema,
  ...serviceFields,
});

export const updateServiceSchema = z.object({
  id: z.uuid(),
  ...serviceFields,
  active: z.boolean(),
  reason: changeReasonSchema,
});

export const centerConfigSchema = z.object({
  detailCenterId: z.uuid(),
  serviceId: z.uuid(),
  available: z.boolean(),
  priceOverride: optionalMoneySchema,
  directCostOverride: optionalMoneySchema,
  reason: changeReasonSchema,
});

export const catalogFilterSchema = z.object({
  revenueEngine: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(revenueEngineSchema.optional()),
  includeInactive: z.boolean().optional(),
});
