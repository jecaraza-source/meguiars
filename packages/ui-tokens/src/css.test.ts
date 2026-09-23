import { describe, expect, it } from "vitest";
import { toCssVariables } from "./css";
import { tokens } from "./tokens";

describe("toCssVariables", () => {
  it("expone todos los colores y escalas como variables CSS", () => {
    const css = toCssVariables();
    expect(css.startsWith(":root{")).toBe(true);
    expect(css).toContain("--mg-color-brand-foreground: #ffffff;");
    expect(css).toContain("--mg-space-lg: 16px;");
    expect(css.match(/--mg-color-/g)).toHaveLength(Object.keys(tokens.colors).length);
  });
});
