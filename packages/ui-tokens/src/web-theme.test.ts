import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { breakpoints, colors, fontSize, radius, space } from "./tokens";

const kebab = (value: string) => value.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const css = readFileSync(join(__dirname, "../../../apps/web/src/app/globals.css"), "utf8");

describe("tema de Tailwind (apps/web/src/app/globals.css) ↔ tokens", () => {
  it("vacía la paleta y escalas por defecto de Tailwind", () => {
    for (const ns of ["--color-*", "--spacing-*", "--radius-*", "--text-*"])
      expect(css).toContain(`${ns}: initial;`);
  });

  it("expone cada token con su nombre", () => {
    for (const k of Object.keys(colors))
      expect(css).toContain(`--color-${kebab(k)}: var(--mg-color-${kebab(k)});`);
    for (const k of Object.keys(space).filter((k) => k !== "none"))
      expect(css).toContain(`--spacing-${k}: var(--mg-space-${k});`);
    for (const k of Object.keys(radius)) expect(css).toContain(`--radius-${k}: var(--mg-radius-${k});`);
    for (const k of Object.keys(fontSize)) expect(css).toContain(`--text-${k}: var(--mg-font-size-${k});`);
  });

  it("los breakpoints de Tailwind coinciden con los tokens", () => {
    expect(css).toContain(`--breakpoint-md: ${breakpoints.tablet / 16}rem;`);
    expect(css).toContain(`--breakpoint-lg: ${breakpoints.desktop / 16}rem;`);
    expect(css).toContain(`--breakpoint-xl: ${breakpoints.wide / 16}rem;`);
  });
});
