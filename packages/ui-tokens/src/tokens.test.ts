import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { formatKpiDelta, kpiDeltaTone, kpiTrend } from "./contracts";
import { toComponentCss, toCssVariables } from "./css";
import { BUTTON_VARIANTS, buttonRecipes, colorOf, controlSizes, TONES, toneRecipes } from "./recipes";
import { colors, touchTarget, typography } from "./tokens";

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

describe("contraste WCAG AA", () => {
  it.each(TONES)("tono %s: texto sobre su fondo ≥ 4.5:1", (tone) => {
    const r = toneRecipes[tone];
    expect(contrastRatio(colorOf(r.fg), colorOf(r.bg))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(BUTTON_VARIANTS)("botón %s: texto sobre fondo ≥ 4.5:1", (variant) => {
    const r = buttonRecipes[variant];
    const bg = r.bg === "transparent" ? colors.background : colorOf(r.bg);
    expect(contrastRatio(colorOf(r.fg), bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("texto principal y secundario sobre fondo y superficie", () => {
    for (const bg of [colors.background, colors.surface, colors.surfaceRaised]) {
      expect(contrastRatio(colors.foreground, bg)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(colors.muted, bg)).toBeGreaterThanOrEqual(AA_TEXT);
    }
    expect(contrastRatio(colors.accent, colors.background)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("foco y bordes de controles se distinguen (≥ 3:1, WCAG 1.4.11)", () => {
    expect(contrastRatio(colors.focus, colors.background)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(contrastRatio(colors.borderStrong, colors.background)).toBeGreaterThanOrEqual(2.5);
  });
});

describe("tamaños y tipografía", () => {
  it("el tamaño de control por defecto cumple el área táctil mínima", () => {
    expect(touchTarget).toBeGreaterThanOrEqual(44);
    expect(controlSizes.md.height).toBeGreaterThanOrEqual(touchTarget);
  });

  it("el texto de cuerpo es legible (≥ 16px) y ningún estilo baja de 12px", () => {
    expect(typography.body.fontSize).toBeGreaterThanOrEqual(16);
    expect(Math.min(...Object.values(typography).map((t) => t.fontSize))).toBeGreaterThanOrEqual(12);
  });
});

describe("CSS generado", () => {
  it("expone todos los colores como variables", () => {
    const css = toCssVariables();
    expect(css.match(/--mg-color-/g)).toHaveLength(Object.keys(colors).length);
    expect(css).toContain("--mg-touch-target: 44px;");
    expect(css).toContain("--mg-text-kpi-size: 30px;");
  });

  it("tiene reglas para cada variante de botón y cada tono", () => {
    const css = toComponentCss();
    for (const variant of BUTTON_VARIANTS) expect(css).toContain(`.mg-btn[data-variant=${variant}]`);
    for (const tone of TONES) expect(css).toContain(`.mg-badge[data-tone=${tone}]`);
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion");
  });
});

describe("KPI", () => {
  it("calcula tendencia, tono y formato del cambio", () => {
    expect(kpiTrend(0.12)).toBe("up");
    expect(kpiTrend(-0.2)).toBe("down");
    expect(kpiTrend(0)).toBe("flat");
    expect(kpiDeltaTone(0.12)).toBe("success");
    expect(kpiDeltaTone(0.12, false)).toBe("danger");
    expect(kpiDeltaTone(undefined)).toBe("neutral");
    expect(formatKpiDelta(0.125).replace(/\s/g, "")).toBe("+12.5%");
    expect(formatKpiDelta(-0.05).replace(/\s/g, "")).toBe("-5%");
  });
});
