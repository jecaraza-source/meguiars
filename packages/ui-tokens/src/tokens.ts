/**
 * Design tokens compartidos. Valores planos (sin dependencias) que web
 * consume como variables CSS y móvil directamente en StyleSheet.
 */
export const colors = {
  background: "#ffffff",
  surface: "#f4f4f5",
  foreground: "#18181b",
  muted: "#71717a",
  border: "#e4e4e7",
  brand: "#111111",
  brandForeground: "#ffffff",
  accent: "#c8102e",
  success: "#15803d",
  warning: "#b45309",
  danger: "#b91c1c",
} as const;

/** Escala de espacio en px (múltiplos de 4). */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 4, md: 8, lg: 12, full: 9999 } as const;

export const fontSize = { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, xxl: 30 } as const;

export const fontWeight = { regular: "400", medium: "500", semibold: "600", bold: "700" } as const;

export const tokens = { colors, space, radius, fontSize, fontWeight } as const;
export type Tokens = typeof tokens;
export type ColorToken = keyof typeof colors;
