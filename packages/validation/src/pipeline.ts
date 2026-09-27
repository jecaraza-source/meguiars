import {
  BILLING_MODELS,
  LOSS_REASONS,
  OPEN_STAGE_POSITIONS,
  OPPORTUNITY_KINDS,
  OPPORTUNITY_SOURCES,
  OPPORTUNITY_TASK_KINDS,
  proposalNeedsFee,
  VEHICLE_RULES,
} from "@meguiars/domain";
import { z } from "zod";
import { rfcSchema } from "./b2b";
import { moneySchema } from "./catalog";
import { changeReasonSchema } from "./centers";
import { clientEmailSchema, clientPhoneSchema } from "./clients";

/**
 * Validación del pipeline comercial (C5), compartida por web (server actions) y
 * móvil. La base vuelve a validar permisos, responsable, etapas, duplicados de
 * empresa y la conversión a cuenta.
 */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, `Usa como máximo ${max} caracteres`).optional());
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const optionalDate = z.preprocess(blankToUndefined, isoDate.optional());
const optionalUuid = z.preprocess(blankToUndefined, z.uuid().optional());
const optionalMoney = z.preprocess(blankToUndefined, moneySchema.optional());
const optionalInt = (min: number, max: number) =>
  z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ message: "Número inválido" })
      .int("Usa un número entero")
      .min(min, `Mínimo ${min}`)
      .max(max, `Máximo ${max}`)
      .optional(),
  );
const titleSchema = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, " "))
  .pipe(
    z.string().min(2, "Escribe el título (mínimo 2 caracteres)").max(120, "Usa como máximo 120 caracteres"),
  );
const optionalName = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? blankToUndefined(v.trim().replace(/\s+/g, " ")) : v),
    z.string().min(2, "Mínimo 2 caracteres").max(max, `Usa como máximo ${max} caracteres`).optional(),
  );

export const prospectSchema = z.object({
  companyName: optionalName(120),
  legalName: optionalName(200),
  rfc: rfcSchema,
  contactName: optionalName(120),
  contactTitle: optionalText(80),
  contactPhone: z.preprocess(blankToUndefined, clientPhoneSchema.optional()),
  contactEmail: clientEmailSchema,
});

export const proposalSchema = z
  .object({
    billingModel: z.preprocess(blankToUndefined, z.enum(BILLING_MODELS).optional()),
    months: optionalInt(1, 60),
    vehicleRule: z.preprocess(blankToUndefined, z.enum(VEHICLE_RULES).optional()),
    paymentTermsDays: optionalInt(0, 120),
    creditLimit: optionalMoney,
    feeAmount: optionalMoney,
    includedUnits: optionalInt(1, 10_000),
  })
  .superRefine((p, ctx) => {
    if (proposalNeedsFee(p.billingModel)) {
      if (!p.feeAmount) ctx.addIssue({ code: "custom", path: ["feeAmount"], message: "Captura la cuota" });
      if (!p.includedUnits)
        ctx.addIssue({ code: "custom", path: ["includedUnits"], message: "Indica los servicios incluidos" });
    }
    if (p.creditLimit === 0)
      ctx.addIssue({ code: "custom", path: ["creditLimit"], message: "Deja vacío para sin límite" });
  });

const opportunityFields = {
  title: titleSchema,
  estimatedValue: moneySchema,
  ownerId: optionalUuid,
  nextAction: z.preprocess(
    blankToUndefined,
    z.string().trim().min(2, "Mínimo 2 caracteres").max(200, "Usa como máximo 200 caracteres").optional(),
  ),
  nextActionOn: optionalDate,
  expectedCloseOn: optionalDate,
  source: z.preprocess(blankToUndefined, z.enum(OPPORTUNITY_SOURCES).optional()),
  prospect: prospectSchema.optional(),
  proposal: proposalSchema.optional(),
  notes: optionalText(2000),
};

const hasContact = (p: z.infer<typeof prospectSchema> | undefined) =>
  !!p?.companyName && !!p.contactName && (!!p.contactPhone || !!p.contactEmail);

export const createOpportunitySchema = z
  .object({
    detailCenterId: z.uuid(),
    requestId: z.uuid(),
    kind: z.enum(OPPORTUNITY_KINDS, { message: "Elige el tipo" }),
    clientId: optionalUuid,
    b2bAccountId: optionalUuid,
    stageId: optionalUuid,
    ...opportunityFields,
  })
  .superRefine((o, ctx) => {
    if (o.kind === "b2c_premium" && !o.clientId)
      ctx.addIssue({ code: "custom", path: ["clientId"], message: "Elige el cliente" });
    if (o.kind === "b2b" && !o.clientId && !o.b2bAccountId && !hasContact(o.prospect))
      ctx.addIssue({
        code: "custom",
        path: ["prospect", "companyName"],
        message: "Elige una cuenta o captura empresa, contacto y teléfono o email",
      });
    if (o.nextAction && !o.nextActionOn)
      ctx.addIssue({
        code: "custom",
        path: ["nextActionOn"],
        message: "Indica la fecha de la siguiente acción",
      });
  });

export const updateOpportunitySchema = z
  .object({
    id: z.uuid(),
    version: z.coerce.number().int().min(1),
    reason: changeReasonSchema,
    ...opportunityFields,
  })
  .superRefine((o, ctx) => {
    if (o.nextAction && !o.nextActionOn)
      ctx.addIssue({
        code: "custom",
        path: ["nextActionOn"],
        message: "Indica la fecha de la siguiente acción",
      });
  });

export const moveOpportunitySchema = z.object({
  id: z.uuid(),
  version: z.coerce.number().int().min(1),
  stageId: z.uuid({ message: "Elige la etapa" }),
  note: optionalText(500),
});

export const opportunityNoteSchema = z.object({
  id: z.uuid(),
  note: z.string().trim().min(2, "Escribe la nota").max(2000, "Usa como máximo 2000 caracteres"),
});

export const winOpportunitySchema = z.object({
  id: z.uuid(),
  version: z.coerce.number().int().min(1),
  wonValue: optionalMoney,
  createAgreement: z.boolean(),
  agreementStartsOn: optionalDate,
  note: optionalText(500),
});

export const loseOpportunitySchema = z.object({
  id: z.uuid(),
  version: z.coerce.number().int().min(1),
  lossReason: z.enum(LOSS_REASONS, { message: "Elige el motivo" }),
  notes: optionalText(1000),
});

export const reopenOpportunitySchema = z.object({
  id: z.uuid(),
  version: z.coerce.number().int().min(1),
  stageId: z.uuid({ message: "Elige la etapa" }),
  reason: changeReasonSchema,
});

export const opportunityTaskSchema = z.object({
  opportunityId: z.uuid(),
  requestId: z.uuid(),
  kind: z.enum(OPPORTUNITY_TASK_KINDS, { message: "Elige el tipo" }),
  dueOn: isoDate,
  notes: optionalText(1000),
  assignedTo: optionalUuid,
});

export const pipelineStageSchema = z.object({
  organizationId: z.uuid(),
  id: optionalUuid,
  name: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(2, "Escribe el nombre").max(60, "Usa como máximo 60 caracteres")),
  position: z.coerce
    .number({ message: "Posición inválida" })
    .int()
    .min(OPEN_STAGE_POSITIONS.min, `Mínimo ${OPEN_STAGE_POSITIONS.min}`)
    .max(OPEN_STAGE_POSITIONS.max, `Máximo ${OPEN_STAGE_POSITIONS.max}`),
  probability: z.coerce
    .number({ message: "Probabilidad inválida" })
    .int()
    .min(0, "Mínimo 0")
    .max(100, "Máximo 100"),
  active: z.boolean(),
  reason: changeReasonSchema,
});
