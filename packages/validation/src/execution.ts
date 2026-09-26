import {
  EVIDENCE_KINDS,
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MIME_TYPES,
  INCIDENT_KINDS,
  INVENTORY_UNITS,
} from "@meguiars/domain";
import { z } from "zod";
import { serviceCodeSchema } from "./catalog";
import { changeReasonSchema } from "./centers";

/**
 * Validación de ejecución y evidencias, compartida por web (server actions) y
 * móvil. La base vuelve a validar estados, rutas y permisos.
 */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalUuid = z.preprocess(blankToUndefined, z.uuid().optional());
const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, `Usa como máximo ${max} caracteres`).optional());

/** Cantidad con hasta 3 decimales (ml, g…). Acepta "1,250.5". */
export const quantitySchema3 = z
  .union([z.number(), z.string()])
  .transform((v) =>
    typeof v === "number" ? v : v.trim() === "" ? Number.NaN : Number(v.replace(/[,\s]/g, "")),
  )
  .pipe(
    z
      .number({ message: "Cantidad inválida" })
      .refine((n) => Number.isFinite(n), "Cantidad inválida")
      .refine((n) => n >= 0, "La cantidad no puede ser negativa")
      .refine((n) => n <= 100_000, "Cantidad demasiado alta")
      .refine((n) => Math.round(n * 1000) === Math.round(n * 1000 * 1e6) / 1e6, "Usa máximo 3 decimales"),
  );

export const itemWorkSchema = z.object({
  itemId: z.uuid(),
  status: z.enum(["en_proceso", "pausada", "terminada"]),
  technicianId: optionalUuid,
  note: optionalText(500),
});

export const staffSchema = z.object({
  orderId: z.uuid(),
  technicianIds: z
    .array(z.uuid())
    .max(20)
    .transform((ids) => [...new Set(ids)]),
});

/** Metadatos de la foto (el archivo ya viene redimensionado y comprimido). */
export const evidenceMetaSchema = z.object({
  kind: z.enum(EVIDENCE_KINDS, { message: "Elige el momento de la foto" }),
  contentType: z.enum(EVIDENCE_MIME_TYPES, { message: "Usa una foto JPG, PNG o WebP." }),
  sizeBytes: z
    .number()
    .int()
    .min(1, "Elige una foto")
    .max(EVIDENCE_MAX_BYTES, "La foto pesa más de 5 MB aun comprimida."),
  width: z.number().int().min(1).max(10000).optional(),
  height: z.number().int().min(1).max(10000).optional(),
  itemId: optionalUuid,
  incidentId: optionalUuid,
  note: optionalText(1000),
});
export type EvidenceMeta = z.infer<typeof evidenceMetaSchema>;

export const removeEvidenceSchema = z.object({ evidenceId: z.uuid(), reason: changeReasonSchema });

export const consumptionFormSchema = z.object({
  itemId: z.uuid(),
  inventoryItemId: z.uuid(),
  actualQuantity: quantitySchema3,
  note: optionalText(1000),
});

export const incidentFormSchema = z.object({
  orderId: z.uuid(),
  kind: z.enum(INCIDENT_KINDS, { message: "Elige el tipo" }),
  description: z.string().trim().min(3, "Describe la incidencia (mínimo 3 caracteres)").max(2000),
  itemId: optionalUuid,
});

export const resolveIncidentSchema = z.object({
  incidentId: z.uuid(),
  resolution: z.string().trim().min(3, "Describe la solución (mínimo 3 caracteres)").max(2000),
});

/** Costo por unidad: hasta 4 decimales (p. ej. $0.0625 por ml). */
export const unitCostSchema = z
  .union([z.number(), z.string()])
  .transform((v) =>
    typeof v === "number" ? v : v.trim() === "" ? Number.NaN : Number(v.replace(/[$,\s]/g, "")),
  )
  .pipe(
    z
      .number({ message: "Costo inválido" })
      .refine((n) => Number.isFinite(n) && n >= 0, "Costo inválido")
      .refine((n) => n <= 1_000_000, "Costo demasiado alto")
      .refine((n) => Math.round(n * 10000) === Math.round(n * 10000 * 1e6) / 1e6, "Usa máximo 4 decimales"),
  );

export const inventoryItemSchema = z.object({
  organizationId: z.uuid(),
  id: optionalUuid,
  code: serviceCodeSchema,
  name: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(2, "Escribe el nombre (mínimo 2 caracteres)").max(120)),
  unit: z.enum(INVENTORY_UNITS, { message: "Elige la unidad" }),
  unitCost: unitCostSchema,
  active: z.boolean(),
  reason: changeReasonSchema,
});

/** Estándar por unidad del servicio; vacío = quitar el insumo del servicio. */
export const supplyStandardSchema = z.object({
  serviceId: z.uuid(),
  inventoryItemId: z.uuid({ message: "Elige el insumo" }),
  quantity: z.preprocess(
    blankToUndefined,
    quantitySchema3.refine((n) => n > 0, "Debe ser mayor que 0").optional(),
  ),
  reason: changeReasonSchema,
});
