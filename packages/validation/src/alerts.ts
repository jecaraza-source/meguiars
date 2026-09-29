import {
  ALERT_CONDITIONS,
  ALERT_PERIODS,
  ALERT_SCOPES,
  ALERT_SEVERITIES,
  DASHBOARD_CHANNEL_KEYS,
  MAX_ALERT_COOLDOWN_MINUTES,
} from "@meguiars/domain";
import { z } from "zod";
import { changeReasonSchema } from "./centers";

/**
 * Validación de reglas de alerta (D4), compartida por web (server actions) y
 * móvil. La base vuelve a validar permisos (admin corporativo), métrica
 * registrada, canal admitido por la métrica, centros de la organización y versión.
 */

const blankToNull = (v: unknown) => (v === "" || v === undefined ? null : v);
const METRIC_ID = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;

export const alertRuleSchema = z
  .object({
    organizationId: z.uuid(),
    id: z.preprocess(blankToNull, z.uuid().nullable()),
    version: z.preprocess(blankToNull, z.coerce.number().int().min(1).nullable()),
    name: z.string().trim().min(3, "Mínimo 3 caracteres").max(120, "Máximo 120 caracteres"),
    description: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? null : v),
      z.string().trim().max(500, "Máximo 500 caracteres").nullable(),
    ),
    metricId: z.string().regex(METRIC_ID, "Elige un KPI"),
    channel: z.preprocess(blankToNull, z.enum(DASHBOARD_CHANNEL_KEYS).nullable()),
    condition: z.enum(ALERT_CONDITIONS, { message: "Elige una condición" }),
    threshold: z.preprocess(
      blankToNull,
      z.coerce.number({ message: "Escribe un número" }).min(-1e12).max(1e12).nullable(),
    ),
    period: z.enum(ALERT_PERIODS, { message: "Elige un periodo" }),
    scopeKind: z.enum(ALERT_SCOPES, { message: "Elige un ámbito" }),
    centerIds: z.preprocess(
      (v) => (v === null || v === undefined ? [] : Array.isArray(v) ? v : [v]),
      z.array(z.uuid()).max(50),
    ),
    severity: z.enum(ALERT_SEVERITIES, { message: "Elige una severidad" }),
    cooldownMinutes: z.coerce.number().int().min(0).max(MAX_ALERT_COOLDOWN_MINUTES, "Máximo 30 días"),
    active: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()),
    reason: changeReasonSchema,
  })
  .superRefine((v, ctx) => {
    if (v.condition === "no_data" && v.threshold !== null)
      ctx.addIssue({ code: "custom", path: ["threshold"], message: "La ausencia de dato no lleva umbral" });
    if (v.condition !== "no_data" && v.threshold === null)
      ctx.addIssue({ code: "custom", path: ["threshold"], message: "Indica el umbral" });
    if (
      (v.condition === "drop_pct" || v.condition === "rise_pct") &&
      v.threshold !== null &&
      v.threshold <= 0
    )
      ctx.addIssue({ code: "custom", path: ["threshold"], message: "La variación debe ser mayor que 0" });
    if (v.scopeKind === "centro" && v.centerIds.length < 1)
      ctx.addIssue({ code: "custom", path: ["centerIds"], message: "Elige al menos un centro" });
    if (v.scopeKind === "conjunto" && v.centerIds.length < 2)
      ctx.addIssue({
        code: "custom",
        path: ["centerIds"],
        message: "Un conjunto necesita al menos dos centros",
      });
    if (new Set(v.centerIds).size !== v.centerIds.length)
      ctx.addIssue({ code: "custom", path: ["centerIds"], message: "Centros repetidos" });
    if (v.id && v.version === null)
      ctx.addIssue({ code: "custom", path: ["version"], message: "Falta la versión de la regla" });
  })
  .transform((v) => ({ ...v, centerIds: v.scopeKind === "corporativo" ? null : v.centerIds }));

export type AlertRuleValues = z.output<typeof alertRuleSchema>;

/** Resolver exige nota; revisar la admite opcional. */
export const alertResolveSchema = z.object({
  id: z.uuid(),
  note: z
    .string()
    .trim()
    .min(3, "Explica qué se hizo (mínimo 3 caracteres)")
    .max(500, "Máximo 500 caracteres"),
});

export const alertReviewSchema = z.object({
  id: z.uuid(),
  note: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(500, "Máximo 500 caracteres").nullable(),
  ),
});
