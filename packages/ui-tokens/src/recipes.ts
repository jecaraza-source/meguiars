import { colors, density, type ColorToken } from "./tokens";

/**
 * Recetas: qué tokens usa cada variante y tono. Web las convierte en CSS
 * (toComponentCss) y móvil en StyleSheet (colorOf), así una variante se
 * define una sola vez.
 */
export type ColorRef = ColorToken | "transparent";

export interface ColorRecipe {
  fg: ColorRef;
  bg: ColorRef;
  border: ColorRef;
}

export const colorOf = (ref: ColorRef): string => (ref === "transparent" ? "transparent" : colors[ref]);

/** Semántica visual: el color comunica significado, no decoración. */
export const TONES = ["neutral", "brand", "success", "warning", "danger", "info"] as const;
export type Tone = (typeof TONES)[number];

export const toneRecipes: Record<Tone, ColorRecipe> = {
  neutral: { fg: "foreground", bg: "surface", border: "border" },
  brand: { fg: "brandForeground", bg: "brand", border: "brand" },
  success: { fg: "success", bg: "successSurface", border: "success" },
  warning: { fg: "warning", bg: "warningSurface", border: "warning" },
  danger: { fg: "danger", bg: "dangerSurface", border: "danger" },
  info: { fg: "info", bg: "infoSurface", border: "info" },
};

export const BUTTON_VARIANTS = ["primary", "secondary", "ghost", "danger"] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export const buttonRecipes: Record<ButtonVariant, ColorRecipe> = {
  primary: { fg: "brandForeground", bg: "brand", border: "brand" },
  secondary: { fg: "foreground", bg: "surfaceRaised", border: "borderStrong" },
  ghost: { fg: "foreground", bg: "transparent", border: "transparent" },
  danger: { fg: "brandForeground", bg: "danger", border: "danger" },
};

export const CONTROL_SIZES = ["md", "sm"] as const;
export type ControlSize = (typeof CONTROL_SIZES)[number];

/** md = densidad cómoda (táctil, 44px); sm = compacta (escritorio). */
export const controlSizes: Record<ControlSize, { height: number; paddingX: number }> = {
  md: { height: density.comfortable.controlHeight, paddingX: density.comfortable.controlPaddingX },
  sm: { height: density.compact.controlHeight, paddingX: density.compact.controlPaddingX },
};
