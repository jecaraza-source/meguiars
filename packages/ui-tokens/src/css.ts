import { tokens } from "./tokens";

const kebab = (value: string) => value.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Genera la declaración `:root { --mg-color-*: …; … }` para web. */
export function toCssVariables(t = tokens): string {
  const lines: string[] = [];
  for (const [name, value] of Object.entries(t.colors)) lines.push(`--mg-color-${kebab(name)}: ${value};`);
  for (const [name, value] of Object.entries(t.space)) lines.push(`--mg-space-${name}: ${value}px;`);
  for (const [name, value] of Object.entries(t.radius)) lines.push(`--mg-radius-${name}: ${value}px;`);
  for (const [name, value] of Object.entries(t.fontSize)) lines.push(`--mg-font-size-${name}: ${value}px;`);
  return `:root{${lines.join("")}}`;
}
