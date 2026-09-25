import {
  CLIENT_KINDS,
  cleanName,
  MARKETING_CHANNELS,
  maxVehicleYear,
  normalizeEmail,
  normalizePhone,
  normalizePlate,
  type CreateClientCommand,
} from "@meguiars/domain";
import { z } from "zod";
import { changeReasonSchema } from "./centers";

/**
 * Validación de clientes y vehículos, compartida por web (server actions) y
 * móvil. Normaliza igual que la base de datos (ver domain/clients/normalize.ts),
 * así que el mismo formulario produce el mismo registro en ambas apps.
 */

/** Texto opcional: "" (formularios) se trata como ausente. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Usa como máximo ${max} caracteres`)
    .optional()
    .transform((v) => (v === "" ? undefined : v));

export const clientPhoneSchema = z.string().transform((value, ctx) => {
  const phone = normalizePhone(value);
  if (!phone) {
    ctx.addIssue({
      code: "custom",
      message: "Teléfono inválido: usa 10 dígitos o formato internacional con +",
    });
    return z.NEVER;
  }
  return phone;
});

export const clientEmailSchema = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value.trim() === "") return undefined;
    const email = normalizeEmail(value);
    if (!email) {
      ctx.addIssue({ code: "custom", message: "Email inválido" });
      return z.NEVER;
    }
    return email;
  });

export const clientNameSchema = z
  .string()
  .transform(cleanName)
  .pipe(
    z.string().min(2, "Escribe el nombre (mínimo 2 caracteres)").max(120, "Usa como máximo 120 caracteres"),
  );

export const plateSchema = z
  .string()
  .transform((v) => normalizePlate(v) ?? "")
  .pipe(z.string().regex(/^[A-Z0-9]{3,10}$/, "Placa inválida: 3 a 10 letras o dígitos"));

export const vehicleIdentifierSchema = z
  .string()
  .optional()
  .transform((v) => normalizePlate(v) ?? undefined)
  .pipe(
    z
      .string()
      .regex(/^[A-Z0-9]{3,30}$/, "Identificador inválido: 3 a 30 letras o dígitos")
      .optional(),
  );

export const vehicleYearSchema = z.coerce
  .number({ message: "Año inválido" })
  .int("Año inválido")
  .min(1950, "Año inválido: desde 1950")
  .refine((y) => y <= maxVehicleYear(), "Año inválido: no puede ser posterior al próximo año");

const requiredShort = (label: string) =>
  z.string().trim().min(1, `Escribe ${label}`).max(60, "Usa como máximo 60 caracteres");

export const vehicleInputSchema = z.object({
  make: requiredShort("la marca"),
  model: requiredShort("el modelo"),
  year: vehicleYearSchema,
  plate: plateSchema,
  identifier: vehicleIdentifierSchema,
  notes: optionalText(1000),
});

export const marketingChannelsSchema = z
  .array(z.enum(MARKETING_CHANNELS))
  .default([])
  .transform((channels) => [...new Set(channels)]);

export const changeSourceSchema = z.enum(["web", "mobile"]);
export const clientKindSchema = z.enum(CLIENT_KINDS);

export const createClientSchema = z.object({
  detailCenterId: z.uuid(),
  requestId: z.uuid(),
  fullName: clientNameSchema,
  phone: clientPhoneSchema,
  email: clientEmailSchema,
  kind: clientKindSchema.default("person"),
  notes: optionalText(2000),
  marketingChannels: marketingChannelsSchema,
  source: changeSourceSchema,
  vehicles: z.array(vehicleInputSchema).max(10),
  duplicateReason: changeReasonSchema.optional(),
});

export const updateClientSchema = z.object({
  id: z.uuid(),
  fullName: clientNameSchema,
  phone: clientPhoneSchema,
  email: clientEmailSchema,
  kind: clientKindSchema,
  notes: optionalText(2000),
  homeDetailCenterId: z.uuid(),
  marketingChannels: marketingChannelsSchema,
  source: changeSourceSchema,
  reason: changeReasonSchema,
  confirmDuplicate: z.boolean().optional(),
});

export const addVehicleSchema = vehicleInputSchema.extend({
  clientId: z.uuid(),
  detailCenterId: z.uuid(),
  requestId: z.uuid(),
});

export const updateVehicleSchema = vehicleInputSchema.extend({
  id: z.uuid(),
  active: z.boolean(),
  reason: changeReasonSchema,
});

export const clientSearchSchema = z.object({
  detailCenterId: z.uuid(),
  query: z.string().trim().min(2, "Escribe al menos 2 caracteres").max(80, "Usa como máximo 80 caracteres"),
});

export const linkClientSchema = z.object({
  clientId: z.uuid(),
  detailCenterId: z.uuid(),
  reason: changeReasonSchema,
});

/**
 * Formulario de alta (campos planos, iguales en web y móvil): datos del
 * cliente más su primer vehículo.
 */
export const newClientFormSchema = z.object({
  fullName: clientNameSchema,
  phone: clientPhoneSchema,
  email: clientEmailSchema,
  kind: clientKindSchema.default("person"),
  notes: optionalText(2000),
  marketingChannels: marketingChannelsSchema,
  make: requiredShort("la marca"),
  model: requiredShort("el modelo"),
  year: vehicleYearSchema,
  plate: plateSchema,
  identifier: vehicleIdentifierSchema,
  vehicleNotes: optionalText(1000),
  duplicateReason: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : undefined))
    .pipe(changeReasonSchema.optional()),
});
export type NewClientForm = z.infer<typeof newClientFormSchema>;

/** Formulario validado → comando de alta. Web y móvil usan esta misma función. */
export function toCreateClientCommand(
  form: NewClientForm,
  context: { detailCenterId: string; requestId: string; source: "web" | "mobile" },
): CreateClientCommand {
  return {
    detailCenterId: context.detailCenterId,
    requestId: context.requestId,
    fullName: form.fullName,
    phone: form.phone,
    email: form.email,
    kind: form.kind,
    notes: form.notes,
    marketingChannels: form.marketingChannels,
    source: context.source,
    vehicles: [
      {
        make: form.make,
        model: form.model,
        year: form.year,
        plate: form.plate,
        identifier: form.identifier,
        notes: form.vehicleNotes,
      },
    ],
    duplicateReason: form.duplicateReason,
  };
}
