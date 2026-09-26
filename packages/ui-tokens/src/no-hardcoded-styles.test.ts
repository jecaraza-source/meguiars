import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda del design system: las apps no usan colores, tamaños ni espaciados
 * escritos a mano; todo sale de @meguiars/ui-tokens (variables CSS en web,
 * constantes en móvil).
 */
const root = join(__dirname, "../../..");
const sources = ["apps/web/src", "apps/mobile/src", "apps/mobile/App.tsx"];

function files(path: string): string[] {
  const full = join(root, path);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full).flatMap((name) => files(join(path, name)));
}

const RULES: { name: string; pattern: RegExp }[] = [
  { name: "color hex", pattern: /#[0-9a-fA-F]{3,8}\b/ },
  { name: "rgb()/hsl()", pattern: /\b(rgba?|hsla?)\(/ },
  {
    name: "paleta por defecto de Tailwind",
    pattern:
      /\b(?:bg|text|border|ring|fill|stroke|outline|divide|from|to)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)\b/,
  },
  { name: "valor arbitrario de Tailwind", pattern: /\b[a-z-]+-\[[^\]]*\d[^\]]*\]/ },
  {
    name: "escala numérica de espaciado de Tailwind (usa p-lg, gap-md…)",
    pattern:
      /(?<![\w-])-?(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-(?!0\b)\d/,
  },
  {
    name: "tamaños/posiciones/z-index numéricos de Tailwind (usa tokens o var(--mg-*); 0 está permitido)",
    pattern:
      /(?<![\w-])-?(?:w|h|min-w|min-h|max-w|max-h|size|inset|inset-x|inset-y|top|bottom|left|right|z)-(?!0\b)\d/,
  },
  {
    name: "tamaño numérico en estilos de React Native",
    pattern:
      /\b(?:fontSize|fontWeight|lineHeight|borderRadius|padding\w*|margin\w*|gap|rowGap|columnGap)\s*:\s*["']?[1-9]/,
  },
];

const tsx = sources.flatMap(files).filter((f) => /\.(tsx?|css)$/.test(f));

describe("sin estilos hardcodeados en las apps", () => {
  it("hay archivos que revisar", () => {
    expect(tsx.length).toBeGreaterThan(10);
  });

  it.each(RULES)("sin $name", ({ pattern }) => {
    const offenders: string[] = [];
    for (const file of tsx) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (pattern.test(line)) offenders.push(`${relative(root, file)}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
