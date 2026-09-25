/**
 * Design tokens de Meguiar's Detail Center. Única fuente de valores visuales:
 * web los consume como variables CSS (toCssVariables) y móvil directamente en
 * StyleSheet. Estilo sobrio: neutros, un acento de marca y colores de estado
 * reservados para significado (éxito, advertencia, error, información).
 */

/** Colores semánticos. Pares texto/fondo verificados con contraste WCAG AA (ver tokens.test.ts). */
export const colors = {
  background: "#ffffff",
  surface: "#f4f4f5",
  surfaceRaised: "#ffffff",
  foreground: "#18181b",
  muted: "#52525b",
  subtle: "#71717a",
  border: "#e4e4e7",
  borderStrong: "#a1a1aa",
  brand: "#111111",
  brandForeground: "#ffffff",
  accent: "#c8102e",
  focus: "#1d4ed8",
  success: "#15803d",
  successSurface: "#f0fdf4",
  warning: "#b45309",
  warningSurface: "#fffbeb",
  danger: "#b91c1c",
  dangerSurface: "#fef2f2",
  info: "#1d4ed8",
  infoSurface: "#eff6ff",
  overlay: "rgba(24, 24, 27, 0.5)",
} as const;

/** Escala de espacio en px (múltiplos de 4). */
export const space = { none: 0, xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { none: 0, sm: 4, md: 8, lg: 12, xl: 16, full: 9999 } as const;

export const fontSize = { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, xxl: 30 } as const;

export const fontWeight = { regular: "400", medium: "500", semibold: "600", bold: "700" } as const;

export const lineHeight = { tight: 1.25, normal: 1.5 } as const;

/** Estilos de texto con nombre: la UI usa estos, no tamaños sueltos. */
export const typography = {
  display: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, lineHeight: lineHeight.tight },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, lineHeight: lineHeight.tight },
  heading: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, lineHeight: lineHeight.tight },
  body: { fontSize: fontSize.md, fontWeight: fontWeight.regular, lineHeight: lineHeight.normal },
  bodySmall: { fontSize: fontSize.sm, fontWeight: fontWeight.regular, lineHeight: lineHeight.normal },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, lineHeight: lineHeight.normal },
  caption: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, lineHeight: lineHeight.normal },
  kpi: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, lineHeight: lineHeight.tight },
} as const;

/** Área táctil mínima (WCAG 2.5.5 / guías iOS y Android). */
export const touchTarget = 44;

/** Densidad: cómoda por defecto (táctil); compacta para tablas en escritorio. */
export const density = {
  comfortable: { controlHeight: touchTarget, controlPaddingX: space.lg, rowHeight: 52, gap: space.lg },
  compact: { controlHeight: 36, controlPaddingX: space.md, rowHeight: 40, gap: space.sm },
} as const;

/** Estados de interacción. */
export const states = {
  disabledOpacity: 0.5,
  pressedOpacity: 0.85,
  focusRingWidth: 2,
  focusRingOffset: 2,
} as const;

/** Sombras (web: box-shadow; móvil: shadow* / elevation). */
export const elevation = {
  none: { y: 0, blur: 0, opacity: 0, androidElevation: 0 },
  sm: { y: 1, blur: 2, opacity: 0.06, androidElevation: 1 },
  md: { y: 4, blur: 12, opacity: 0.1, androidElevation: 4 },
  lg: { y: 12, blur: 32, opacity: 0.16, androidElevation: 12 },
} as const;

/** Anchos mínimos de cada layout (mobile < tablet < desktop). */
export const breakpoints = { tablet: 768, desktop: 1024, wide: 1280 } as const;

export const zIndex = { nav: 10, overlay: 40, modal: 50, toast: 60 } as const;

/** Anchos de layout: barra lateral, contenido y formularios de autenticación. */
export const layout = { sidebar: 256, content: 1024, narrow: 384 } as const;

export const motion = { fast: 120, normal: 200, pulse: 1400 } as const;

export const tokens = {
  colors,
  space,
  radius,
  fontSize,
  fontWeight,
  lineHeight,
  typography,
  touchTarget,
  density,
  states,
  elevation,
  breakpoints,
  zIndex,
  layout,
  motion,
} as const;

export type Tokens = typeof tokens;
export type ColorToken = keyof typeof colors;
export type SpaceToken = keyof typeof space;
export type TypographyToken = keyof typeof typography;
export type Density = keyof typeof density;
