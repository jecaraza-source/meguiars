import {
  APP_ROLES,
  DASHBOARD_CHANNEL_KEYS,
  DASHBOARD_ENGINE_KEYS,
  DASHBOARD_RANGES,
  DASHBOARD_WIDGET_TYPES,
  GRID_COLUMNS,
  MAX_ROW_SPAN,
  MAX_WIDGETS,
  pnlPeriodError,
  WIDGET_BREAKDOWNS,
  WIDGET_GRAINS,
} from "@meguiars/domain";
import { z } from "zod";
import { changeReasonSchema } from "./centers";

/**
 * Validación de tableros ejecutivos (D1), compartida por web (server actions) y
 * móvil. La base vuelve a validar permisos, métricas registradas, tipo de
 * widget admitido por la métrica, desgloses, versión y filtros.
 */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const METRIC_ID = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;

export const widgetOptionsSchema = z
  .object({
    grain: z.enum(WIDGET_GRAINS).optional(),
    limit: z.number().int().min(3, "Mínimo 3 centros").max(20, "Máximo 20 centros").optional(),
    breakdown: z.enum(WIDGET_BREAKDOWNS).optional(),
  })
  .strict();

export const dashboardWidgetInputSchema = z.object({
  id: z.preprocess(blankToUndefined, z.uuid().optional()),
  metricId: z.string().regex(METRIC_ID, "Elige una métrica registrada"),
  type: z.enum(DASHBOARD_WIDGET_TYPES),
  title: z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .min(2, "El título lleva de 2 a 60 caracteres")
      .max(60, "El título lleva de 2 a 60 caracteres")
      .optional(),
  ),
  colSpan: z.number().int().min(1).max(GRID_COLUMNS),
  rowSpan: z.number().int().min(1).max(MAX_ROW_SPAN),
  options: widgetOptionsSchema,
});

export const dashboardSchema = z
  .object({
    organizationId: z.uuid(),
    id: z.preprocess(blankToUndefined, z.uuid().optional()),
    requestId: z.preprocess(blankToUndefined, z.uuid().optional()),
    version: z.number().int().min(1).optional(),
    name: z
      .string()
      .trim()
      .min(3, "El nombre lleva de 3 a 80 caracteres")
      .max(80, "El nombre lleva de 3 a 80 caracteres"),
    description: z.preprocess(
      blankToUndefined,
      z.string().trim().max(280, "Usa como máximo 280 caracteres").optional(),
    ),
    audienceRole: z.enum(APP_ROLES).nullable(),
    centerIds: z.array(z.uuid()).min(1, "Elige al menos un centro").max(50).nullable(),
    defaultRange: z.enum(DASHBOARD_RANGES),
    isDefault: z.boolean(),
    widgets: z
      .array(dashboardWidgetInputSchema)
      .min(1, "Agrega al menos un widget")
      .max(MAX_WIDGETS, `Máximo ${MAX_WIDGETS} widgets`),
    reason: z.preprocess(blankToUndefined, changeReasonSchema.optional()),
  })
  .superRefine((v, ctx) => {
    if (v.id && !v.version) ctx.addIssue({ code: "custom", path: ["version"], message: "Falta la versión" });
    if (v.id && !v.reason)
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Escribe el motivo del cambio" });
    if (!v.id && !v.requestId)
      ctx.addIssue({ code: "custom", path: ["requestId"], message: "Falta el identificador" });
    if (v.isDefault && (v.audienceRole || v.centerIds))
      ctx.addIssue({
        code: "custom",
        path: ["isDefault"],
        message: "El tablero corporativo por defecto es para todos los roles y centros",
      });
    const ids = v.widgets.map((w) => w.id).filter(Boolean);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", path: ["widgets"], message: "Widget repetido" });
  });

export const savedFiltersSchema = z
  .object({
    centros: z.array(z.uuid()).min(1).max(50).optional(),
    periodo: z.enum(["hoy", "semana", "mes", "anio", "personalizado"]).optional(),
    desde: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    hasta: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    canal: z.enum(DASHBOARD_CHANNEL_KEYS).optional(),
    motor: z.enum(DASHBOARD_ENGINE_KEYS).optional(),
  })
  .strict();

export const dashboardPreferencesSchema = z.object({
  dashboardId: z.uuid(),
  widgetOrder: z.array(z.uuid()).max(MAX_WIDGETS),
  hiddenWidgetIds: z.array(z.uuid()).max(MAX_WIDGETS),
  filters: savedFiltersSchema,
  isFavorite: z.boolean(),
});

export const dashboardFactsSchema = z
  .object({
    sources: z
      .array(z.enum(["pnl", "payments", "pipeline", "memberships", "orders", "upsell", "customers"]))
      .min(1),
    detailCenterIds: z.array(z.uuid()).min(1, "Elige al menos un centro").max(50),
    from: z.string(),
    to: z.string(),
    grain: z.enum(["total", "dia", "semana", "mes"]),
  })
  .superRefine((v, ctx) => {
    const error = pnlPeriodError(v.from, v.to);
    if (error) ctx.addIssue({ code: "custom", path: ["to"], message: error });
  });

export const archiveDashboardSchema = z.object({
  id: z.uuid(),
  version: z.number().int().min(1),
  reason: changeReasonSchema,
});

export type DashboardSchemaInput = z.infer<typeof dashboardSchema>;

export const kpiSettingsSchema = z.object({
  organizationId: z.uuid(),
  version: z.number().int().min(1),
  ltvLifetimeYears: z.coerce
    .number({ message: "Escribe un número" })
    .min(0.5, "La vida esperada va de 0.5 a 10 años")
    .max(10, "La vida esperada va de 0.5 a 10 años"),
  operatingHoursPerDay: z.coerce
    .number({ message: "Escribe un número" })
    .min(1, "De 1 a 24 horas por día")
    .max(24, "De 1 a 24 horas por día"),
  operatingDaysPerWeek: z.coerce
    .number({ message: "Escribe un número" })
    .int("Días enteros")
    .min(1, "De 1 a 7 días por semana")
    .max(7, "De 1 a 7 días por semana"),
  reason: changeReasonSchema,
});
