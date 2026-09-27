import { PNL_SECTIONS, pnlPeriodError } from "@meguiars/domain";
import { z } from "zod";

/**
 * Filtros del P&L, compartidos por web y móvil. La base vuelve a validar el
 * periodo (private.check_pnl_range) y filtra los centros autorizados.
 */
const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const token = z.preprocess(
  blankToUndefined,
  z
    .string()
    .regex(/^[a-z0-9_-]{1,40}$/, "Filtro inválido")
    .optional(),
);

export const pnlRangeSchema = z
  .object({
    detailCenterIds: z.array(z.uuid()).min(1, "Elige al menos un centro"),
    from: z.string(),
    to: z.string(),
  })
  .superRefine((v, ctx) => {
    const error = pnlPeriodError(v.from, v.to);
    if (error) ctx.addIssue({ code: "custom", path: ["to"], message: error });
  });

export const pnlDrillSchema = z
  .object({
    detailCenterIds: z.array(z.uuid()).min(1, "Elige al menos un centro"),
    from: z.string(),
    to: z.string(),
    section: z.enum(PNL_SECTIONS, { message: "Sección inválida" }),
    line: token,
    dimension: token,
  })
  .superRefine((v, ctx) => {
    const error = pnlPeriodError(v.from, v.to);
    if (error) ctx.addIssue({ code: "custom", path: ["to"], message: error });
  });

export type PnlRangeInput = z.infer<typeof pnlRangeSchema>;
export type PnlDrillInput = z.infer<typeof pnlDrillSchema>;
