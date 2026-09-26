import { buttonRecipes, colorOf, controlSizes, toneRecipes, type ColorRef } from "./recipes";
import { tokens } from "./tokens";

const kebab = (value: string) => value.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const v = (ref: ColorRef) => (ref === "transparent" ? "transparent" : `var(--mg-color-${kebab(ref)})`);

/** `:root { --mg-*: … }` con todos los tokens para web. */
export function toCssVariables(t = tokens): string {
  const lines: string[] = [];
  for (const [name, value] of Object.entries(t.colors)) lines.push(`--mg-color-${kebab(name)}: ${value};`);
  for (const [name, value] of Object.entries(t.space)) lines.push(`--mg-space-${name}: ${value}px;`);
  for (const [name, value] of Object.entries(t.radius)) lines.push(`--mg-radius-${name}: ${value}px;`);
  for (const [name, value] of Object.entries(t.fontSize)) lines.push(`--mg-font-size-${name}: ${value}px;`);
  for (const [name, style] of Object.entries(t.typography)) {
    lines.push(`--mg-text-${name}-size: ${style.fontSize}px;`);
    lines.push(`--mg-text-${name}-weight: ${style.fontWeight};`);
    lines.push(`--mg-text-${name}-line-height: ${style.lineHeight};`);
  }
  lines.push(`--mg-touch-target: ${t.touchTarget}px;`);
  for (const [name, d] of Object.entries(t.density)) {
    lines.push(`--mg-${name}-control-height: ${d.controlHeight}px;`);
    lines.push(`--mg-${name}-row-height: ${d.rowHeight}px;`);
  }
  for (const [name, e] of Object.entries(t.elevation)) {
    lines.push(`--mg-shadow-${name}: 0 ${e.y}px ${e.blur}px rgba(0, 0, 0, ${e.opacity});`);
  }
  for (const [name, value] of Object.entries(t.zIndex)) lines.push(`--mg-z-${name}: ${value};`);
  for (const [name, value] of Object.entries(t.layout)) lines.push(`--mg-layout-${name}: ${value}px;`);
  for (const [name, value] of Object.entries(t.motion)) lines.push(`--mg-motion-${name}: ${value}ms;`);
  lines.push(`--mg-focus-ring-width: ${t.states.focusRingWidth}px;`);
  lines.push(`--mg-focus-ring-offset: ${t.states.focusRingOffset}px;`);
  lines.push(`--mg-disabled-opacity: ${t.states.disabledOpacity};`);
  return `:root{${lines.join("")}}`;
}

/**
 * CSS de los componentes web, generado desde las recetas: variantes de botón,
 * tonos de badge/toast, tamaños de control, foco visible y skeleton.
 */
export function toComponentCss(): string {
  const rules: string[] = [];
  // Foco visible y consistente en todo elemento interactivo.
  rules.push(
    `:where(a,button,input,select,textarea,summary,[tabindex]):focus-visible{outline:var(--mg-focus-ring-width) solid var(--mg-color-focus);outline-offset:var(--mg-focus-ring-offset);}`,
  );
  // Botón
  rules.push(
    `.mg-btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--mg-space-sm);min-height:var(--mg-touch-target);border:1px solid transparent;border-radius:var(--mg-radius-md);font-size:var(--mg-text-label-size);font-weight:var(--mg-text-heading-weight);cursor:pointer;transition:filter var(--mg-motion-fast);}`,
    `.mg-btn:hover:not(:disabled){filter:brightness(0.92);}`,
    `.mg-btn:disabled,.mg-btn[aria-busy=true]{opacity:var(--mg-disabled-opacity);cursor:not-allowed;}`,
  );
  for (const [size, s] of Object.entries(controlSizes)) {
    rules.push(`.mg-btn[data-size=${size}]{height:${s.height}px;padding:0 ${s.paddingX}px;}`);
  }
  for (const [variant, r] of Object.entries(buttonRecipes)) {
    rules.push(
      `.mg-btn[data-variant=${variant}]{color:${v(r.fg)};background:${v(r.bg)};border-color:${v(r.border)};}`,
    );
  }
  // Campos
  rules.push(
    `.mg-field{display:flex;flex-direction:column;gap:var(--mg-space-xs);}`,
    `.mg-label{font-size:var(--mg-text-label-size);font-weight:var(--mg-text-label-weight);}`,
    `.mg-hint{font-size:var(--mg-text-caption-size);color:var(--mg-color-muted);}`,
    `.mg-error{font-size:var(--mg-text-caption-size);color:var(--mg-color-danger);}`,
    `.mg-input{min-height:var(--mg-touch-target);padding:0 var(--mg-space-md);border:1px solid var(--mg-color-border-strong);border-radius:var(--mg-radius-md);background:var(--mg-color-surface-raised);color:var(--mg-color-foreground);font-size:var(--mg-text-body-size);}`,
    `.mg-input[aria-invalid=true]{border-color:var(--mg-color-danger);}`,
  );
  // Card, badge, toast, KPI
  rules.push(
    `.mg-card{display:flex;flex-direction:column;gap:var(--mg-space-sm);padding:var(--mg-space-lg);border:1px solid var(--mg-color-border);border-radius:var(--mg-radius-lg);background:var(--mg-color-surface-raised);box-shadow:var(--mg-shadow-sm);}`,
    `.mg-badge{display:inline-flex;align-items:center;padding:var(--mg-space-xxs) var(--mg-space-sm);border:1px solid;border-radius:var(--mg-radius-full);font-size:var(--mg-text-caption-size);font-weight:var(--mg-text-caption-weight);}`,
    `.mg-toast{padding:var(--mg-space-md) var(--mg-space-lg);border:1px solid;border-radius:var(--mg-radius-md);box-shadow:var(--mg-shadow-md);font-size:var(--mg-text-body-small-size);}`,
  );
  for (const [tone, r] of Object.entries(toneRecipes)) {
    const decl = `color:${v(r.fg)};background:${v(r.bg)};border-color:${v(r.border)};`;
    rules.push(
      `.mg-badge[data-tone=${tone}],.mg-toast[data-tone=${tone}],.mg-tone[data-tone=${tone}]{${decl}}`,
    );
  }
  // Skeleton (respeta prefers-reduced-motion)
  rules.push(
    `.mg-skeleton{display:block;height:var(--mg-space-md);border-radius:var(--mg-radius-sm);background:var(--mg-color-border);animation:mg-pulse var(--mg-motion-pulse) ease-in-out infinite;}`,
    `@keyframes mg-pulse{50%{opacity:0.45;}}`,
    `@media (prefers-reduced-motion: reduce){.mg-skeleton{animation:none;}*{transition:none!important;}}`,
  );
  // Modal / sheet
  rules.push(
    `.mg-dialog{border:none;border-radius:var(--mg-radius-lg);padding:0;max-width:min(560px,calc(100vw - var(--mg-space-xxl)));width:100%;box-shadow:var(--mg-shadow-lg);background:var(--mg-color-surface-raised);color:var(--mg-color-foreground);}`,
    `.mg-dialog::backdrop{background:var(--mg-color-overlay);}`,
    `@media (max-width:${767}px){.mg-dialog{margin:auto 0 0;max-width:100vw;border-radius:var(--mg-radius-lg) var(--mg-radius-lg) 0 0;}}`,
  );
  return rules.join("");
}

export { colorOf };
