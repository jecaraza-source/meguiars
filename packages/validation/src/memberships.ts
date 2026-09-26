import { MEMBERSHIP_STATES, MEMBERSHIP_STATUSES, PLAN_TIERS, REDEEM_SCOPES } from "@meguiars/domain";
import { z } from "zod";
import { moneySchema, serviceCodeSchema } from "./catalog";
import { changeReasonSchema } from "./centers";
import { quantitySchema } from "./orders";

/**
 * Validación de membresías, compartida por web (server actions) y móvil. La
 * base vuelve a validar estados, vigencia, saldo y permisos.
 */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, `Usa como máximo ${max} caracteres`).optional());
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const optionalDate = z.preprocess(blankToUndefined, isoDate.optional());

export const planTierSchema = z.enum(PLAN_TIERS, { message: "Elige el nivel" });
export const periodMonthsSchema = z.coerce
  .number({ message: "Elige la periodicidad" })
  .refine((n): n is 1 | 3 | 6 | 12 => [1, 3, 6, 12].includes(n), "Elige la periodicidad")
  .transform((n) => n as 1 | 3 | 6 | 12);

export const membershipPlanSchema = z
  .object({
    organizationId: z.uuid(),
    id: z.preprocess(blankToUndefined, z.uuid().optional()),
    code: serviceCodeSchema,
    tier: planTierSchema,
    name: z
      .string()
      .transform((v) => v.trim().replace(/\s+/g, " "))
      .pipe(z.string().min(2, "Escribe el nombre (mínimo 2 caracteres)").max(80)),
    description: optionalText(1000),
    price: moneySchema.refine((n) => n > 0, "El precio debe ser mayor que 0"),
    periodMonths: periodMonthsSchema,
    redeemScope: z.enum(REDEEM_SCOPES, { message: "Elige dónde se redime" }),
    restrictions: optionalText(1000),
    renewalNoticeDays: z.coerce
      .number({ message: "Días inválidos" })
      .int()
      .min(0, "Mínimo 0")
      .max(60, "Máximo 60"),
    availableFrom: optionalDate,
    availableUntil: optionalDate,
    active: z.boolean(),
    reason: changeReasonSchema,
  })
  .refine((p) => !p.availableFrom || !p.availableUntil || p.availableUntil >= p.availableFrom, {
    message: "La fecha final debe ser igual o posterior a la inicial",
    path: ["availableUntil"],
  });

/** Servicio incluido; unidades vacías = quitarlo del plan. */
export const membershipBenefitSchema = z.object({
  planId: z.uuid(),
  serviceId: z.uuid({ message: "Elige el servicio" }),
  quantityPerPeriod: z.preprocess(blankToUndefined, quantitySchema.optional()),
  notes: optionalText(300),
  reason: changeReasonSchema,
});

export const createMembershipSchema = z.object({
  detailCenterId: z.uuid(),
  requestId: z.uuid(),
  planId: z.uuid({ message: "Elige el plan" }),
  clientId: z.uuid(),
  vehicleId: z.uuid({ message: "Elige el vehículo" }),
  startsOn: optionalDate,
  paymentReference: optionalText(120),
});

export const renewMembershipSchema = z.object({
  membershipId: z.uuid(),
  requestId: z.uuid(),
  planId: z.preprocess(blankToUndefined, z.uuid().optional()),
  paymentReference: optionalText(120),
});

export const membershipStateSchema = z.object({
  membershipId: z.uuid(),
  state: z.enum(MEMBERSHIP_STATES),
  reason: changeReasonSchema,
});

export const redeemBenefitSchema = z.object({
  orderId: z.uuid(),
  version: z.coerce.number().int().min(1),
  itemId: z.uuid({ message: "Elige la línea" }),
  membershipId: z.uuid(),
  quantity: quantitySchema,
  requestId: z.uuid(),
});

export const voidRedemptionSchema = z.object({
  redemptionId: z.uuid(),
  version: z.coerce.number().int().min(1),
  reason: changeReasonSchema,
});

export const membershipFilterSchema = z.object({
  status: z.preprocess(blankToUndefined, z.enum(MEMBERSHIP_STATUSES).optional()),
  query: optionalText(80),
});
